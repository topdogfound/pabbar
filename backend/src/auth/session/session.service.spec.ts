import { describe, expect, it, vi } from 'vitest';
import { SessionService } from './session.service.js';

class FakeRedis {
  kv = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  get = vi.fn(async (k: string) => this.kv.get(k) ?? null);
  del = vi.fn(async (...ks: string[]) => {
    ks.forEach((k) => {
      this.kv.delete(k);
      this.sets.delete(k);
    });
    return ks.length;
  });
  smembers = vi.fn(async (k: string) => [...(this.sets.get(k) ?? [])]);
  nowMs = 1_000_000;
  /** Redis TIME: [seconds, microseconds]; advances like a real clock. */
  private time() {
    this.nowMs += 1;
    return [String(Math.floor(this.nowMs / 1000)), String((this.nowMs % 1000) * 1000)];
  }
  multi() {
    const ops: Array<() => [null, unknown]> = [];
    const chain = {
      get: (k: string) => (ops.push(() => [null, this.kv.get(k) ?? null]), chain),
      time: () => (ops.push(() => [null, this.time()]), chain),
      exec: async () => ops.map((o) => o()),
    };
    return chain;
  }
  // Emulates MARK_INVALID_LUA (1 key) and CACHE_SET_LUA (3 keys); each eval advances the clock.
  eval = vi.fn(async (_script: string, numKeys: number, ...rest: Array<string | number>) => {
    this.nowMs += 1;
    const keys = rest.slice(0, numKeys).map(String);
    const args = rest.slice(numKeys).map(String);
    if (numKeys === 1) {
      this.kv.set(keys[0], String(this.nowMs));
      return 1;
    }
    const inv = this.kv.get(keys[2]);
    if (inv && Number(inv) >= Number(args[3])) return 0;
    this.kv.set(keys[0], args[0]);
    this.sets.set(keys[1], (this.sets.get(keys[1]) ?? new Set()).add(args[2]));
    return 1;
  });
  sessionKeys() {
    return [...this.kv.keys()].filter((k) => k.startsWith('sess:'));
  }
}

const config = { get: () => undefined } as any;
const user = { id: 'u1', status: 'ACTIVE', dateOfBirth: new Date('1990-01-01T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() };
const row = (over: object = {}) => ({
  id: 's1',
  userId: 'u1',
  expiresAt: new Date(Date.now() + 3600_000),
  lastUsedAt: new Date(),
  user,
  ...over,
});

function setup(redis: FakeRedis | null = new FakeRedis()) {
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue(row()),
      update: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { redis, prisma, service: new SessionService(prisma as any, config, redis as any) };
}

describe('SessionService cache', () => {
  it('hits the DB once, then serves from Redis with revived dates', async () => {
    const { prisma, service } = setup();
    await service.validate('tok');
    const second = await service.validate('tok');
    expect(prisma.session.findUnique).toHaveBeenCalledOnce();
    expect(second?.user.dateOfBirth).toBeInstanceOf(Date);
    expect(second?.user.id).toBe('u1');
  });

  it('invalidateUser evicts cached sessions so the next validate reloads', async () => {
    const { prisma, service } = setup();
    await service.validate('tok');
    await service.invalidateUser('u1');
    await service.validate('tok');
    expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
  });

  it('does not re-cache a session read from the DB before a concurrent invalidation', async () => {
    const { prisma, redis, service } = setup();
    let release!: (v: unknown) => void;
    prisma.session.findUnique.mockReturnValueOnce(new Promise((r) => (release = r)));
    const pending = service.validate('tok');
    await vi.waitFor(() => expect(prisma.session.findUnique).toHaveBeenCalled());
    await service.revokeOthers('u1', 'other'); // races between the DB read and the cache write
    release(row());
    await pending;
    expect(redis!.sessionKeys()).toEqual([]);
    await service.validate('tok');
    expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
  });

  it('caches again once validation starts after the invalidation', async () => {
    const { redis, service } = setup();
    await service.invalidateUser('u1');
    await service.validate('tok');
    expect(redis!.sessionKeys()).toHaveLength(1);
  });

  it('revoke deletes the row and the cache entry', async () => {
    const { prisma, service } = setup();
    await service.validate('tok');
    await service.revoke('tok');
    prisma.session.findUnique.mockResolvedValue(null);
    expect(await service.validate('tok')).toBeNull();
  });

  it('works without Redis', async () => {
    const { prisma, service } = setup(null);
    await service.validate('tok');
    await service.validate('tok');
    expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects expired sessions and disabled users', async () => {
    const a = setup();
    a.prisma.session.findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1) }));
    expect(await a.service.validate('t')).toBeNull();
    const b = setup();
    b.prisma.session.findUnique.mockResolvedValue(row({ user: { ...user, status: 'DISABLED' } }));
    expect(await b.service.validate('t')).toBeNull();
  });
});

describe('SessionService.revokeOthers / list', () => {
  it('uses one deleteMany excluding the current token, then evicts cache', async () => {
    const { prisma, redis, service } = setup();
    await service.validate('tok');
    await service.revokeOthers('u1', 'tok');
    expect(prisma.session.deleteMany).toHaveBeenCalledOnce();
    const where = prisma.session.deleteMany.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.tokenHash.not).toMatch(/^[0-9a-f]{64}$/);
    expect(redis!.sessionKeys()).toEqual([]);
  });

  it('keyset-paginates by (createdAt, id) and flags the current session', async () => {
    const { prisma, service } = setup();
    const { createHash } = await import('node:crypto');
    const cur = createHash('sha256').update('tok').digest('hex');
    const t = new Date('2026-01-01T00:00:00Z');
    const mk = (id: string, h: string) => ({ id, userAgent: 'ua', ip: '1.1.1.1', lastUsedAt: new Date(), createdAt: t, tokenHash: h });
    prisma.session.findMany.mockResolvedValue([mk('c', cur), mk('b', 'x'), mk('a', 'y')]);
    const res = await service.list('u1', 'tok', { limit: 2 });
    expect(res.sessions.map((s) => [s.id, s.current])).toEqual([['c', true], ['b', false]]);
    const first = prisma.session.findMany.mock.calls[0][0];
    expect(first.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(first.take).toBe(3);
    expect(first.where.OR).toBeUndefined();

    // The cursor is a position, not a row reference: it works even if 'b' was revoked.
    prisma.session.findMany.mockResolvedValue([mk('a', 'y')]);
    const next = await service.list('u1', 'tok', { limit: 2, cursor: res.nextCursor! });
    expect(next.nextCursor).toBeNull();
    const second = prisma.session.findMany.mock.calls[1][0];
    expect(second.cursor).toBeUndefined();
    expect(second.where.OR).toEqual([
      { createdAt: { lt: t } },
      { createdAt: t, id: { lt: 'b' } },
    ]);
  });

  it('treats a malformed cursor as the first page', async () => {
    const { prisma, service } = setup();
    await service.list('u1', 'tok', { cursor: 'garbage' });
    expect(prisma.session.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});
