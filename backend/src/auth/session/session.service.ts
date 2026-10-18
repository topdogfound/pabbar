import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import type { User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS, type RedisClient } from '../../redis/redis.module.js';

export const SESSION_COOKIE = 'pabbar_session';
/** Holds the operator's own session token while they impersonate someone. */
export const RETURN_COOKIE = 'pabbar_admin_return';
const DAY_MS = 86_400_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;
const CACHE_TTL_SECONDS = 45;
// Must outlive any in-flight validate (cache read -> DB read -> cache write).
const INVALIDATION_TTL_SECONDS = 120;
const sessKey = (hash: string) => `sess:${hash}`;
const userKey = (userId: string) => `usess:${userId}`;
const invKey = (userId: string) => `uinv:${userId}`;

/** Records "user invalidated at <redis ms>" so racing validates skip their cache write. */
const MARK_INVALID_LUA = `
local t = redis.call('TIME')
redis.call('SET', KEYS[1], t[1] * 1000 + math.floor(t[2] / 1000), 'EX', ARGV[1])
return 1`;

/**
 * Caches a session only if the user was not invalidated after `startedAt` (the
 * Redis time read before the DB lookup). Otherwise the DB row may predate a
 * revoke/delete/profile change and caching it would resurrect stale state.
 */
const CACHE_SET_LUA = `
local inv = redis.call('GET', KEYS[3])
if inv and tonumber(inv) >= tonumber(ARGV[4]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SADD', KEYS[2], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[5])
return 1`;

export interface ValidSession {
  id: string;
  userId: string;
  expiresAt: Date;
  user: User;
  /** Set when this is an impersonation session. */
  impersonatorId: string | null;
}

interface CachedSession {
  id: string;
  userId: string;
  expiresAt: string;
  user: Record<string, unknown>;
  impersonatorId?: string | null;
}

const DATE_FIELDS = ['emailVerifiedAt', 'phoneVerifiedAt', 'dateOfBirth', 'createdAt', 'updatedAt'];

function reviveUser(raw: Record<string, unknown>): User {
  const user = { ...raw };
  for (const f of DATE_FIELDS) {
    if (typeof user[f] === 'string') user[f] = new Date(user[f]);
  }
  return user as unknown as User;
}

/** Opaque "<createdAt ms>.<id>" cursor; malformed input yields the first page. */
const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(`${createdAt.getTime()}.${id}`).toString('base64url');

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const [ms, id] = Buffer.from(cursor, 'base64url').toString().split('.', 2);
  const createdAt = new Date(Number(ms));
  return id && !Number.isNaN(createdAt.getTime()) ? { createdAt, id } : null;
}

@Injectable()
export class SessionService {
  private readonly ttlDays: number;
  private readonly rememberTtlDays: number;
  private readonly secure: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {
    this.ttlDays = Number(config.get('SESSION_TTL_DAYS') ?? 1);
    this.rememberTtlDays = Number(config.get('SESSION_REMEMBER_TTL_DAYS') ?? 30);
    this.secure = config.get('NODE_ENV') === 'production';
  }

  /** Creates a session and returns the raw token (only its hash is stored). */
  async create(
    userId: string,
    opts: {
      remember?: boolean;
      userAgent?: string;
      ip?: string;
      /** Marks an impersonation session; it never outlives `ttlMs`. */
      impersonatorId?: string;
      ttlMs?: number;
    } = {},
  ) {
    const token = randomBytes(32).toString('base64url');
    const days = opts.remember ? this.rememberTtlDays : this.ttlDays;
    const expiresAt = new Date(Date.now() + (opts.ttlMs ?? days * DAY_MS));
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        remember: !!opts.remember,
        userAgent: opts.userAgent?.slice(0, 255),
        ip: opts.ip,
        impersonatorId: opts.impersonatorId,
        expiresAt,
      },
    });
    return { token, expiresAt, remember: !!opts.remember };
  }

  /**
   * Hot path (every page render). Redis caches the validated session + user for
   * a short TTL; revoke/logout/user changes evict it, so staleness is bounded.
   */
  async validate(token: string): Promise<ValidSession | null> {
    const hash = this.hash(token);
    const { session: cached, startedAt } = await this.cacheGet(hash);
    if (cached) return cached;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      return null;
    }
    if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }
    const valid: ValidSession = {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      user: session.user,
      impersonatorId: session.impersonatorId,
    };
    if (startedAt !== undefined) await this.cacheSet(hash, valid, startedAt);
    return valid;
  }

  async revoke(token: string) {
    const hash = this.hash(token);
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: hash },
      select: { userId: true },
    });
    await this.prisma.session.deleteMany({ where: { tokenHash: hash } });
    if (row) await this.invalidateUser(row.userId);
    else await this.redis?.del(sessKey(hash)).catch(() => undefined);
  }

  /** Revokes every session of the user except the current one. */
  async revokeOthers(userId: string, currentToken: string) {
    await this.prisma.session.deleteMany({
      where: { userId, tokenHash: { not: this.hash(currentToken) } },
    });
    await this.invalidateUser(userId);
  }

  /**
   * Evicts all cached sessions of a user (profile change, delete, revoke). Call
   * after the DB write. The marker is set first so a validate that read the DB
   * before that write cannot re-cache what is evicted below.
   */
  async invalidateUser(userId: string) {
    if (!this.redis) return;
    try {
      await this.redis.eval(MARK_INVALID_LUA, 1, invKey(userId), INVALIDATION_TTL_SECONDS);
      const hashes = await this.redis.smembers(userKey(userId));
      const keys = [...hashes.map(sessKey), userKey(userId)];
      await this.redis.del(...keys);
    } catch {
      // Cache is best-effort; the TTL bounds staleness.
    }
  }

  /**
   * Keyset-paginated list of the user's live sessions, newest sign-in first.
   * Ordered by (createdAt, id), which never change, rather than lastUsedAt,
   * which every request bumps: rows can't move between pages, and the cursor
   * stays valid even if the session it points at was revoked meanwhile.
   */
  async list(userId: string, currentToken: string, opts: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const currentHash = this.hash(currentToken);
    const after = opts.cursor ? decodeCursor(opts.cursor) : null;
    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, userAgent: true, ip: true, lastUsedAt: true, createdAt: true, tokenHash: true },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      sessions: page.map((r) => ({
        id: r.id,
        userAgent: r.userAgent,
        ip: r.ip,
        lastUsedAt: r.lastUsedAt,
        current: r.tokenHash === currentHash,
      })),
      nextCursor: rows.length > limit ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * One round trip: the cached entry plus the Redis clock (ms), which cacheSet
   * compares against invalidation markers. `startedAt` is undefined when Redis
   * is unavailable, in which case nothing is cached.
   */
  private async cacheGet(
    hash: string,
  ): Promise<{ session: ValidSession | null; startedAt?: number }> {
    if (!this.redis) return { session: null };
    try {
      const res = await this.redis.multi().get(sessKey(hash)).time().exec();
      const raw = res?.[0]?.[1] as string | null | undefined;
      const [sec, usec] = (res?.[1]?.[1] as [string, string] | undefined) ?? [];
      const startedAt =
        sec !== undefined ? Number(sec) * 1000 + Math.floor(Number(usec) / 1000) : undefined;
      if (!raw) return { session: null, startedAt };
      const c = JSON.parse(raw) as CachedSession;
      const expiresAt = new Date(c.expiresAt);
      if (expiresAt < new Date()) return { session: null, startedAt };
      return {
        session: {
          id: c.id,
          userId: c.userId,
          expiresAt,
          user: reviveUser(c.user),
          impersonatorId: c.impersonatorId ?? null,
        },
        startedAt,
      };
    } catch {
      return { session: null };
    }
  }

  private async cacheSet(hash: string, s: ValidSession, startedAt: number) {
    if (!this.redis) return;
    try {
      const ttl = Math.min(
        CACHE_TTL_SECONDS,
        Math.max(1, Math.floor((s.expiresAt.getTime() - Date.now()) / 1000)),
      );
      await this.redis.eval(
        CACHE_SET_LUA,
        3,
        sessKey(hash),
        userKey(s.userId),
        invKey(s.userId),
        JSON.stringify(s),
        ttl,
        hash,
        startedAt,
        CACHE_TTL_SECONDS * 2,
      );
    } catch {
      // best-effort
    }
  }

  setCookie(res: Response, session: { token: string; expiresAt: Date; remember: boolean }) {
    res.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      // Without "remember me" this is a browser-session cookie.
      ...(session.remember ? { expires: session.expiresAt } : {}),
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  /** Browser-session cookie remembering the operator's real session. */
  setReturnCookie(res: Response, token: string) {
    res.cookie(RETURN_COOKIE, token, this.cookieOptions());
  }

  clearReturnCookie(res: Response) {
    res.clearCookie(RETURN_COOKIE, this.cookieOptions());
  }

  /** Deletes every session of a user (suspension, forced sign-out). */
  async revokeAll(userId: string) {
    const { count } = await this.prisma.session.deleteMany({ where: { userId } });
    await this.invalidateUser(userId);
    return count;
  }

  /** Deletes one session by id; returns its owner, or null if it was gone. */
  async revokeById(sessionId: string) {
    const row = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!row) return null;
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
    await this.invalidateUser(row.userId);
    return row.userId;
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
