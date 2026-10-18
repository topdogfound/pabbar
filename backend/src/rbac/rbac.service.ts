import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';
import { Access, PLATFORM_KEY, SLUG_RE, scopeKey, type OrgRef, type Scope } from './access.js';
import {
  SUPER_ADMIN_ROLE_KEY,
  SYSTEM_ROLES,
  appliesTo,
  isPermission,
  type Permission,
  type ScopeKind,
} from './catalog.js';

const ACCESS_TTL_SECONDS = 300;
const ORG_TTL_SECONDS = 60;
const SUMMARY_TTL_SECONDS = 30;
// Serialises system-role sync between replicas booting at the same time.
const SYNC_LOCK_ID = 727_001;

const verKey = (key: string) => `rbac:ver:${key}`;
const accessKey = (key: string, userId: string) => `rbac:a:${key}:${userId}`;
const orgKey = (slug: string) => `rbac:org:${slug}`;
const summaryKey = (userId: string) => `rbac:me:${userId}`;

export interface AdminSummary {
  /** Can open the platform console. */
  platform: boolean;
  /** Orgs (max 50) where the user is a member with admin access. */
  orgs: { slug: string; name: string }[];
  /** Platform operators browse all orgs through the org list, not this array. */
  canBrowseOrgs: boolean;
}

/**
 * Permission resolution.
 *
 * Hot path: every admin request resolves (user, scope) -> permissions. Results
 * are cached in Redis under a *version stamp* made of the scope's version and
 * the platform version. Changing a role or membership bumps one counter, which
 * invalidates every cached entry of that org at once without enumerating
 * users. Platform changes bump the platform counter, which is part of every
 * stamp. The stamp is read before the DB read, so a racing change can only make
 * an entry look stale, never fresh.
 */
@Injectable()
export class RbacService implements OnApplicationBootstrap {
  private readonly log = new Logger(RbacService.name);
  private readonly bootstrapEmails: Set<string>;
  private readonly roleIds = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {
    this.bootstrapEmails = new Set(
      (config.get<string>('PLATFORM_ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  async onApplicationBootstrap() {
    await this.syncSystemRoles();
    await this.bootstrapExistingAdmins();
  }

  // --- scope + access -------------------------------------------------------

  /** `platform` or an org slug. Null when the slug does not exist. */
  async resolveScope(param: string): Promise<Scope | null> {
    if (param === PLATFORM_KEY) return { kind: 'platform' };
    if (!SLUG_RE.test(param)) return null;

    if (this.redis) {
      try {
        const raw = await this.redis.get(orgKey(param));
        if (raw) return { kind: 'org', org: JSON.parse(raw) as OrgRef };
      } catch {
        // fall through to the DB
      }
    }
    const org = await this.prisma.organization.findUnique({
      where: { slug: param },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!org) return null;
    if (this.redis) {
      this.redis.set(orgKey(param), JSON.stringify(org), 'EX', ORG_TTL_SECONDS).catch(() => undefined);
    }
    return { kind: 'org', org };
  }

  /** Call after renaming or (un)suspending an org. */
  async evictOrg(slug: string) {
    await this.redis?.del(orgKey(slug)).catch(() => undefined);
  }

  async access(userId: string, scope: Scope): Promise<Access> {
    const key = scopeKey(scope);
    const cacheKey = accessKey(key, userId);
    let stamp: string | undefined;

    if (this.redis) {
      try {
        const res = await this.redis
          .multi()
          .get(cacheKey)
          .mget(verKey(key), verKey(PLATFORM_KEY))
          .exec();
        const raw = res?.[0]?.[1] as string | null | undefined;
        const vers = (res?.[1]?.[1] as (string | null)[] | undefined) ?? [];
        stamp = vers.map((v) => v ?? '0').join('.');
        if (raw) {
          const cached = JSON.parse(raw) as { v: string; p: Permission[]; h: Permission[] };
          if (cached.v === stamp) return new Access(userId, scope, new Set(cached.p), new Set(cached.h));
        }
      } catch {
        stamp = undefined;
      }
    }

    const { permissions, held } = await this.compute(userId, scope);
    if (this.redis && stamp !== undefined) {
      this.redis
        .set(cacheKey, JSON.stringify({ v: stamp, p: [...permissions], h: [...held] }), 'EX', ACCESS_TTL_SECONDS)
        .catch(() => undefined);
    }
    return new Access(userId, scope, permissions, held);
  }

  /** Invalidates every cached access entry of a scope (role/membership change). */
  async bump(key: string) {
    await this.redis?.incr(verKey(key)).catch(() => undefined);
  }

  /** Drops the cached admin summary (nav) of one user. */
  async evictSummary(userId: string) {
    await this.redis?.del(summaryKey(userId)).catch(() => undefined);
  }

  private async compute(
    userId: string,
    scope: Scope,
  ): Promise<{ permissions: Set<Permission>; held: Set<Permission> }> {
    const platform = await this.platformPermissions(userId);
    if (scope.kind === 'platform') return { permissions: filterFor(platform, 'platform'), held: platform };

    // Platform operators carry their org-capable permissions into every org.
    const permissions = filterFor(platform, 'org');
    if (scope.org.status !== 'ACTIVE') return { permissions, held: permissions };

    const rows = await this.prisma.rolePermission.findMany({
      where: {
        role: {
          membershipRoles: {
            some: { orgId: scope.org.id, membership: { userId, status: 'ACTIVE' } },
          },
        },
      },
      select: { permission: true },
      distinct: ['permission'],
    });
    for (const { permission } of rows) {
      if (isPermission(permission) && appliesTo(permission, 'org')) permissions.add(permission);
    }
    return { permissions, held: permissions };
  }

  private async platformPermissions(userId: string): Promise<Set<Permission>> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { platformAssignments: { some: { userId } } } },
      select: { permission: true },
      distinct: ['permission'],
    });
    return new Set(rows.map((r) => r.permission).filter(isPermission));
  }

  // --- navigation summary ---------------------------------------------------

  /** Which admin scopes the user can open. Cheap enough for every page render. */
  async summary(userId: string): Promise<AdminSummary> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(summaryKey(userId));
        if (raw) return JSON.parse(raw) as AdminSummary;
      } catch {
        // compute below
      }
    }

    const platformPerms = await this.platformPermissions(userId);

    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        org: { status: 'ACTIVE' },
        roles: { some: { role: { permissions: { some: { permission: 'admin:access' } } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { org: { select: { slug: true, name: true } } },
    });

    const summary: AdminSummary = {
      platform: platformPerms.has('admin:access'),
      orgs: memberships.map((m) => m.org),
      canBrowseOrgs: platformPerms.has('admin:access') && platformPerms.has('orgs:read'),
    };
    if (this.redis) {
      this.redis.set(summaryKey(userId), JSON.stringify(summary), 'EX', SUMMARY_TTL_SECONDS).catch(() => undefined);
    }
    return summary;
  }

  // --- system roles ---------------------------------------------------------

  async systemRoleId(key: string): Promise<string> {
    const cached = this.roleIds.get(key);
    if (cached) return cached;
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key }, select: { id: true } });
    this.roleIds.set(key, role.id);
    return role.id;
  }

  /** Makes the DB match SYSTEM_ROLES. Idempotent; touches nothing when in sync. */
  async syncSystemRoles() {
    const changed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_ID})`;
      const existing = await tx.role.findMany({
        where: { key: { not: null } },
        include: { permissions: { select: { permission: true } } },
      });
      let dirty = false;

      for (const def of SYSTEM_ROLES) {
        const row = existing.find((r) => r.key === def.key);
        if (!row) {
          await tx.role.create({
            data: {
              key: def.key,
              scope: def.scope,
              name: def.name,
              description: def.description,
              isSystem: true,
              permissions: { create: def.permissions.map((permission) => ({ permission })) },
            },
          });
          dirty = true;
          continue;
        }

        if (row.name !== def.name || row.description !== def.description || row.scope !== def.scope || !row.isSystem) {
          await tx.role.update({
            where: { id: row.id },
            data: { name: def.name, description: def.description, scope: def.scope, isSystem: true },
          });
        }
        const have = new Set(row.permissions.map((p) => p.permission));
        const want = new Set<string>(def.permissions);
        const add = [...want].filter((p) => !have.has(p));
        const remove = [...have].filter((p) => !want.has(p));
        if (remove.length) {
          await tx.rolePermission.deleteMany({ where: { roleId: row.id, permission: { in: remove } } });
        }
        if (add.length) {
          await tx.rolePermission.createMany({
            data: add.map((permission) => ({ roleId: row.id, permission })),
            skipDuplicates: true,
          });
        }
        if (add.length || remove.length) dirty = true;
      }
      return dirty;
    });

    if (changed) {
      this.log.log('System roles synced');
      await this.bump(PLATFORM_KEY);
    }
    return changed;
  }

  // --- first Super Admin ----------------------------------------------------

  /**
   * PLATFORM_ADMIN_EMAILS lists who becomes Super Admin. Called after every
   * login; a plain user costs one Set lookup. Requires a verified email, which
   * both OTP and OAuth login guarantee.
   */
  async grantBootstrapAdmin(user: Pick<User, 'id' | 'email' | 'emailVerifiedAt'>) {
    if (!user.email || !user.emailVerifiedAt) return false;
    if (!this.bootstrapEmails.has(user.email.toLowerCase())) return false;
    return this.grantSuperAdmin(user.id);
  }

  private async bootstrapExistingAdmins() {
    if (this.bootstrapEmails.size === 0) return;
    const users = await this.prisma.user.findMany({
      where: { email: { in: [...this.bootstrapEmails] }, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    for (const u of users) await this.grantSuperAdmin(u.id);
  }

  private async grantSuperAdmin(userId: string) {
    const roleId = await this.systemRoleId(SUPER_ADMIN_ROLE_KEY);
    const { count } = await this.prisma.platformRoleAssignment.createMany({
      data: [{ userId, roleId }],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    this.log.log(`Granted Super Admin to ${userId}`);
    await this.bump(PLATFORM_KEY);
    await this.evictSummary(userId);
    return true;
  }
}

function filterFor(perms: Iterable<Permission>, kind: ScopeKind) {
  const out = new Set<Permission>();
  for (const p of perms) if (appliesTo(p, kind)) out.add(p);
  return out;
}
