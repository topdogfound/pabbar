import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import type { AuditActor } from '../../audit/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { SessionService } from '../../auth/session/session.service.js';
import { afterCursor, clampLimit, encodeCursor } from '../../common/cursor.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type Access, scopeKey } from '../../rbac/access.js';
import { PERMISSIONS, appliesTo, isPermission, type Permission } from '../../rbac/catalog.js';
import { RbacService } from '../../rbac/rbac.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { AdminPolicy } from '../admin-policy.service.js';
import type { ListUsersDto } from '../dto/users.dto.js';

export interface RoleChip {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** Org scope: the membership status. Platform scope: the account status. */
  status: 'ACTIVE' | 'SUSPENDED';
  roles: RoleChip[];
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface PermissionGrant {
  permission: Permission;
  label: string;
  /** Names of the roles that grant it ("Platform · Support" for operator roles). */
  via: string[];
}

const ROLE_CHIP = { id: true, name: true, isSystem: true } as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly storage: StorageService,
    private readonly policy: AdminPolicy,
  ) {}

  private avatar(u: Pick<User, 'avatarKey' | 'avatarUrl'>) {
    return u.avatarKey ? this.storage.publicUrl(u.avatarKey) : (u.avatarUrl ?? null);
  }

  private row(
    u: User,
    status: AdminUserRow['status'],
    roles: RoleChip[],
    joinedAt: Date,
    lastActive: Date | null | undefined,
  ): AdminUserRow {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: this.avatar(u),
      status,
      roles,
      joinedAt: joinedAt.toISOString(),
      lastActiveAt: lastActive?.toISOString() ?? null,
    };
  }

  /** Latest session activity for one page of users, in a single bounded query. */
  private async lastActive(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, Date | null>();
    const rows = await this.prisma.session.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _max: { lastUsedAt: true },
    });
    return new Map(rows.map((r) => [r.userId, r._max.lastUsedAt]));
  }

  // --- reads -----------------------------------------------------------------

  async list(access: Access, q: ListUsersDto) {
    const limit = clampLimit(q.limit);
    const search: Prisma.UserWhereInput | undefined = q.q
      ? {
          OR: [
            { email: { contains: q.q, mode: 'insensitive' } },
            { name: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : undefined;

    if (access.scope.kind === 'org') {
      const orgId = access.scope.org.id;
      const rows = await this.prisma.membership.findMany({
        where: {
          AND: [
            { orgId },
            q.status ? { status: q.status } : {},
            q.roleId ? { roles: { some: { roleId: q.roleId } } } : {},
            search ? { user: search } : {},
            afterCursor('createdAt', q.cursor),
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: { user: true, roles: { select: { role: { select: ROLE_CHIP } } } },
      });
      const page = rows.slice(0, limit);
      const active = await this.lastActive(page.map((m) => m.userId));
      const last = page[page.length - 1];
      return {
        users: page.map((m) =>
          this.row(m.user, m.status, m.roles.map((r) => r.role), m.createdAt, active.get(m.userId)),
        ),
        nextCursor: rows.length > limit ? encodeCursor(last.createdAt, last.id) : null,
      };
    }

    const rows = await this.prisma.user.findMany({
      where: {
        AND: [
          q.status ? { status: q.status === 'SUSPENDED' ? 'DISABLED' : 'ACTIVE' } : {},
          q.roleId ? { platformRoles: { some: { roleId: q.roleId } } } : {},
          search ?? {},
          afterCursor('createdAt', q.cursor),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { platformRoles: { select: { role: { select: ROLE_CHIP } } } },
    });
    const page = rows.slice(0, limit);
    const active = await this.lastActive(page.map((u) => u.id));
    const last = page[page.length - 1];
    return {
      users: page.map((u) =>
        this.row(
          u,
          u.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
          u.platformRoles.map((r) => r.role),
          u.createdAt,
          active.get(u.id),
        ),
      ),
      nextCursor: rows.length > limit ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async get(access: Access, userId: string) {
    const scope = access.scope;
    let user: AdminUserRow;
    let memberships: { slug: string; name: string; status: string; roles: string[] }[] | undefined;

    if (scope.kind === 'org') {
      const m = await this.prisma.membership.findUnique({
        where: { orgId_userId: { orgId: scope.org.id, userId } },
        include: { user: true, roles: { select: { role: { select: ROLE_CHIP } } } },
      });
      if (!m) throw new NotFoundException('User not found.');
      const active = await this.lastActive([userId]);
      user = this.row(m.user, m.status, m.roles.map((r) => r.role), m.createdAt, active.get(userId));
    } else {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          platformRoles: { select: { role: { select: ROLE_CHIP } } },
          memberships: {
            take: 50,
            orderBy: { createdAt: 'asc' },
            include: {
              org: { select: { slug: true, name: true } },
              roles: { select: { role: { select: { name: true } } } },
            },
          },
        },
      });
      if (!u) throw new NotFoundException('User not found.');
      const active = await this.lastActive([userId]);
      user = this.row(
        u,
        u.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
        u.platformRoles.map((r) => r.role),
        u.createdAt,
        active.get(userId),
      );
      memberships = u.memberships.map((m) => ({
        slug: m.org.slug,
        name: m.org.name,
        status: m.status,
        roles: m.roles.map((r) => r.role.name),
      }));
    }

    return { user, grants: await this.explain(access, userId), memberships };
  }

  /**
   * "Why can this user do X here?": every permission they hold in this scope
   * with the roles that grant it, including platform roles carried into an org.
   */
  private async explain(access: Access, userId: string): Promise<PermissionGrant[]> {
    const scope = access.scope;
    const kind = scope.kind;
    const sources: { label: string; permissions: string[] }[] = [];

    const platformRoles = await this.prisma.role.findMany({
      where: { platformAssignments: { some: { userId } } },
      select: { name: true, permissions: { select: { permission: true } } },
    });
    for (const r of platformRoles) {
      sources.push({ label: `Platform · ${r.name}`, permissions: r.permissions.map((p) => p.permission) });
    }
    if (scope.kind === 'org' && scope.org.status === 'ACTIVE') {
      const roles = await this.prisma.role.findMany({
        where: {
          membershipRoles: {
            some: { orgId: scope.org.id, membership: { userId, status: 'ACTIVE' } },
          },
        },
        select: { name: true, permissions: { select: { permission: true } } },
      });
      for (const r of roles) {
        sources.push({ label: r.name, permissions: r.permissions.map((p) => p.permission) });
      }
    }

    const via = new Map<Permission, string[]>();
    for (const s of sources) {
      for (const p of s.permissions) {
        if (!isPermission(p) || !appliesTo(p, kind)) continue;
        via.set(p, [...(via.get(p) ?? []), s.label]);
      }
    }
    return [...via.entries()].map(([permission, v]) => ({
      permission,
      label: PERMISSIONS[permission].label,
      via: v,
    }));
  }

  // --- suspend / restore / remove -----------------------------------------------

  async suspend(access: Access, actor: AuditActor, userId: string, reason: string) {
    if (userId === access.userId) throw new BadRequestException('You cannot suspend yourself.');
    await this.policy.assertCanManage(access, userId);
    const scope = access.scope;

    if (scope.kind === 'org') {
      const orgId = scope.org.id;
      await this.prisma.$transaction(async (tx) => {
        await this.policy.lockOrg(tx, orgId);
        const m = await tx.membership.findUnique({
          where: { orgId_userId: { orgId, userId } },
          include: { user: { select: { email: true, name: true } } },
        });
        if (!m) throw new NotFoundException('User not found.');
        if (m.status === 'SUSPENDED') throw new ConflictException('User is already suspended.');
        await this.policy.assertNotLastOwner(tx, orgId, userId);
        await tx.membership.update({ where: { id: m.id }, data: { status: 'SUSPENDED' } });
        await this.audit.record(tx, actor, {
          orgId,
          action: 'user.suspend',
          targetType: 'user',
          targetId: userId,
          targetLabel: m.user.email ?? m.user.name,
          reason,
        });
      });
      await this.rbac.bump(orgId);
    } else {
      await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId }, select: { email: true, name: true, status: true } });
        if (!u) throw new NotFoundException('User not found.');
        if (u.status !== 'ACTIVE') throw new ConflictException('User is already suspended.');
        await this.policy.assertNotLastSuperAdmin(tx, userId);
        await tx.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
        await this.audit.record(tx, actor, {
          action: 'user.suspend',
          targetType: 'user',
          targetId: userId,
          targetLabel: u.email ?? u.name,
          reason,
          metadata: { scope: 'platform' },
        });
      });
      // A disabled account must lose every live session immediately.
      await this.sessions.revokeAll(userId);
      await this.rbac.bump(scopeKey(scope));
    }
    await this.rbac.evictSummary(userId);
  }

  async restore(access: Access, actor: AuditActor, userId: string, reason?: string) {
    await this.policy.assertCanManage(access, userId);
    const scope = access.scope;

    if (scope.kind === 'org') {
      const orgId = scope.org.id;
      await this.prisma.$transaction(async (tx) => {
        const m = await tx.membership.findUnique({
          where: { orgId_userId: { orgId, userId } },
          include: { user: { select: { email: true, name: true } } },
        });
        if (!m) throw new NotFoundException('User not found.');
        if (m.status === 'ACTIVE') throw new ConflictException('User is not suspended.');
        await tx.membership.update({ where: { id: m.id }, data: { status: 'ACTIVE' } });
        await this.audit.record(tx, actor, {
          orgId,
          action: 'user.restore',
          targetType: 'user',
          targetId: userId,
          targetLabel: m.user.email ?? m.user.name,
          reason,
        });
      });
      await this.rbac.bump(orgId);
    } else {
      await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId }, select: { email: true, name: true, status: true } });
        if (!u) throw new NotFoundException('User not found.');
        if (u.status === 'ACTIVE') throw new ConflictException('User is not suspended.');
        await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
        await this.audit.record(tx, actor, {
          action: 'user.restore',
          targetType: 'user',
          targetId: userId,
          targetLabel: u.email ?? u.name,
          reason,
          metadata: { scope: 'platform' },
        });
      });
      await this.rbac.bump(scopeKey(scope));
    }
    await this.rbac.evictSummary(userId);
  }

  /** Org scope only (guarded by `users:remove`): drops the membership and, via cascade, its roles. */
  async remove(access: Access, actor: AuditActor, userId: string, reason: string) {
    const scope = access.scope;
    if (scope.kind !== 'org') throw new NotFoundException();
    if (userId === access.userId) throw new BadRequestException('You cannot remove yourself.');
    await this.policy.assertCanManage(access, userId);
    const orgId = scope.org.id;

    await this.prisma.$transaction(async (tx) => {
      await this.policy.lockOrg(tx, orgId);
      const m = await tx.membership.findUnique({
        where: { orgId_userId: { orgId, userId } },
        include: { user: { select: { email: true, name: true } } },
      });
      if (!m) throw new NotFoundException('User not found.');
      await this.policy.assertNotLastOwner(tx, orgId, userId);
      await tx.membership.delete({ where: { id: m.id } });
      await this.audit.record(tx, actor, {
        orgId,
        action: 'user.remove',
        targetType: 'user',
        targetId: userId,
        targetLabel: m.user.email ?? m.user.name,
        reason,
      });
    });
    await this.rbac.bump(orgId);
    await this.rbac.evictSummary(userId);
  }

  // --- roles -----------------------------------------------------------------

  /** Replaces the user's roles in this scope. See the guards inline. */
  async setRoles(access: Access, actor: AuditActor, userId: string, roleIds: string[], reason?: string) {
    // Self-lockout: nobody edits their own roles; ask someone else.
    if (userId === access.userId) throw new ForbiddenException('You cannot change your own roles.');
    const scope = access.scope;
    const wanted = [...new Set(roleIds)];
    if (scope.kind === 'org' && wanted.length === 0) {
      throw new BadRequestException('A member needs at least one role. Use the Member role for no access.');
    }

    const roles = await this.prisma.role.findMany({
      where: { id: { in: wanted } },
      include: { permissions: { select: { permission: true } } },
    });
    if (roles.length !== wanted.length) throw new BadRequestException('Unknown role.');
    for (const r of roles) {
      const allowed =
        scope.kind === 'platform'
          ? r.scope === 'PLATFORM'
          : r.scope === 'ORG' && (r.orgId === null || r.orgId === scope.org.id);
      if (!allowed) throw new BadRequestException(`Role "${r.name}" cannot be used here.`);
    }

    const names = (list: { name: string }[]) => list.map((r) => r.name).sort();

    if (scope.kind === 'org') {
      const orgId = scope.org.id;
      await this.prisma.$transaction(async (tx) => {
        await this.policy.lockOrg(tx, orgId);
        const m = await tx.membership.findUnique({
          where: { orgId_userId: { orgId, userId } },
          include: {
            user: { select: { email: true, name: true } },
            roles: { include: { role: { include: { permissions: { select: { permission: true } } } } } },
          },
        });
        if (!m) throw new NotFoundException('User not found.');
        const current = m.roles.map((r) => r.role);
        const currentIds = new Set(current.map((r) => r.id));
        const added = roles.filter((r) => !currentIds.has(r.id));
        const removed = current.filter((r) => !wanted.includes(r.id));

        // Escalation guard: handing out or taking away a role requires holding
        // everything it carries.
        for (const r of [...added, ...removed]) {
          if (!access.covers(r.permissions.map((p) => p.permission))) {
            throw new ForbiddenException(
              `You cannot change the "${r.name}" role: it carries permissions you do not hold.`,
            );
          }
        }
        if (added.length === 0 && removed.length === 0) return;

        const ownerRoleId = await this.rbac.systemRoleId('org.owner');
        if (removed.some((r) => r.id === ownerRoleId)) {
          await this.policy.assertNotLastOwner(tx, orgId, userId);
        }

        if (removed.length) {
          await tx.membershipRole.deleteMany({
            where: { membershipId: m.id, roleId: { in: removed.map((r) => r.id) } },
          });
        }
        if (added.length) {
          await tx.membershipRole.createMany({
            data: added.map((r) => ({ membershipId: m.id, orgId, roleId: r.id })),
          });
        }
        await this.audit.record(tx, actor, {
          orgId,
          action: 'user.roles.update',
          targetType: 'user',
          targetId: userId,
          targetLabel: m.user.email ?? m.user.name,
          reason,
          metadata: { before: names(current), after: names(roles) },
        });
      });
      await this.rbac.bump(orgId);
    } else {
      await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            name: true,
            platformRoles: { include: { role: { include: { permissions: { select: { permission: true } } } } } },
          },
        });
        if (!u) throw new NotFoundException('User not found.');
        const current = u.platformRoles.map((r) => r.role);
        const currentIds = new Set(current.map((r) => r.id));
        const added = roles.filter((r) => !currentIds.has(r.id));
        const removed = current.filter((r) => !wanted.includes(r.id));

        for (const r of [...added, ...removed]) {
          if (!access.covers(r.permissions.map((p) => p.permission))) {
            throw new ForbiddenException(
              `You cannot change the "${r.name}" role: it carries permissions you do not hold.`,
            );
          }
        }
        if (added.length === 0 && removed.length === 0) return;

        const superId = await this.rbac.systemRoleId('platform.super_admin');
        if (removed.some((r) => r.id === superId)) await this.policy.assertNotLastSuperAdmin(tx, userId);

        if (removed.length) {
          await tx.platformRoleAssignment.deleteMany({
            where: { userId, roleId: { in: removed.map((r) => r.id) } },
          });
        }
        if (added.length) {
          await tx.platformRoleAssignment.createMany({
            data: added.map((r) => ({ userId, roleId: r.id, createdById: access.userId })),
          });
        }
        await this.audit.record(tx, actor, {
          action: 'user.roles.update',
          targetType: 'user',
          targetId: userId,
          targetLabel: u.email ?? u.name,
          reason,
          metadata: { scope: 'platform', before: names(current), after: names(roles) },
        });
      });
      await this.rbac.bump(scopeKey(scope));
    }
    await this.rbac.evictSummary(userId);
  }

  // --- impersonation ---------------------------------------------------------

  /**
   * Creates a short, read-only session for the target. Platform operators only
   * (the permission is platform-scoped), never against platform staff.
   */
  async impersonate(
    access: Access,
    actor: AuditActor,
    userId: string,
    reason: string,
    minutes: number,
  ) {
    if (userId === access.userId) throw new BadRequestException('You cannot impersonate yourself.');
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!target) throw new NotFoundException('User not found.');
    if (target.status !== 'ACTIVE') throw new ConflictException('That account is suspended.');
    const staff = await this.prisma.platformRoleAssignment.count({ where: { userId } });
    if (staff > 0) throw new ForbiddenException('Platform staff cannot be impersonated.');

    const session = await this.sessions.create(userId, {
      impersonatorId: access.userId,
      ttlMs: minutes * 60_000,
      ip: actor.ip ?? undefined,
      userAgent: actor.userAgent ?? undefined,
    });
    await this.audit.record(this.prisma, actor, {
      action: 'user.impersonate.start',
      targetType: 'user',
      targetId: userId,
      targetLabel: target.email ?? target.name,
      reason,
      metadata: { minutes },
    });
    return session;
  }
}
