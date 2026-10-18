import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditActor } from '../../audit/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Access } from '../../rbac/access.js';
import { appliesTo, isPermission, type Permission } from '../../rbac/catalog.js';
import { RbacService } from '../../rbac/rbac.service.js';
import { AdminPolicy, isUniqueViolation } from '../admin-policy.service.js';
import type { CreateRoleDto, UpdateRoleDto } from '../dto/roles.dto.js';

/** Custom roles per org. Bounds the matrix, the list and the role pickers. */
const MAX_CUSTOM_ROLES = 100;

export interface AdminRole {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  memberCount: number;
  updatedAt: string;
}

type RoleRow = Prisma.RoleGetPayload<{ include: { permissions: { select: { permission: true } } } }>;

@Injectable()
export class AdminRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly policy: AdminPolicy,
  ) {}

  private visibleIn(access: Access): Prisma.RoleWhereInput {
    const scope = access.scope;
    return scope.kind === 'platform'
      ? { scope: 'PLATFORM' }
      : { scope: 'ORG', OR: [{ orgId: null }, { orgId: scope.org.id }] };
  }

  private toRole(r: RoleRow, memberCount: number): AdminRole {
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission).filter(isPermission).sort(),
      memberCount,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private async counts(access: Access, roleIds: string[]) {
    const scope = access.scope;
    const rows =
      scope.kind === 'org'
        ? await this.prisma.membershipRole.groupBy({
            by: ['roleId'],
            where: { orgId: scope.org.id, roleId: { in: roleIds } },
            _count: { _all: true },
          })
        : await this.prisma.platformRoleAssignment.groupBy({
            by: ['roleId'],
            where: { roleId: { in: roleIds } },
            _count: { _all: true },
          });
    return new Map(rows.map((r) => [r.roleId, r._count._all]));
  }

  async list(access: Access) {
    const rows = await this.prisma.role.findMany({
      where: this.visibleIn(access),
      include: { permissions: { select: { permission: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      take: MAX_CUSTOM_ROLES + 20,
    });
    const counts = await this.counts(access, rows.map((r) => r.id));
    return { roles: rows.map((r) => this.toRole(r, counts.get(r.id) ?? 0)) };
  }

  private async find(access: Access, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { AND: [{ id: roleId }, this.visibleIn(access)] },
      include: { permissions: { select: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }

  async get(access: Access, roleId: string) {
    const role = await this.find(access, roleId);
    const counts = await this.counts(access, [role.id]);
    return { role: this.toRole(role, counts.get(role.id) ?? 0) };
  }

  /** Org-capable, known permissions only; unknown strings are rejected, not dropped. */
  private parsePermissions(list: string[]): Permission[] {
    const out: Permission[] = [];
    for (const p of list) {
      if (!isPermission(p)) throw new BadRequestException(`Unknown permission: ${p}`);
      if (!appliesTo(p, 'org')) throw new BadRequestException(`${p} cannot be given to an organization role.`);
      out.push(p);
    }
    return out;
  }

  /** Custom roles exist only inside an org. */
  private requireOrg(access: Access) {
    if (access.scope.kind !== 'org') throw new NotFoundException();
    return access.scope.org;
  }

  async create(access: Access, actor: AuditActor, dto: CreateRoleDto) {
    const org = this.requireOrg(access);
    let permissions = this.parsePermissions(dto.permissions);
    let description = dto.description;

    if (dto.cloneFromId) {
      const source = await this.find(access, dto.cloneFromId);
      permissions = [...new Set([...permissions, ...source.permissions.map((p) => p.permission).filter(isPermission)])];
      description ??= source.description ?? undefined;
    }

    // Escalation guard: you can only grant what you hold.
    if (!access.covers(permissions)) {
      throw new ForbiddenException('You can only grant permissions that you hold yourself.');
    }

    const existing = await this.prisma.role.count({ where: { orgId: org.id } });
    if (existing >= MAX_CUSTOM_ROLES) {
      throw new ConflictException(`An organization can have at most ${MAX_CUSTOM_ROLES} custom roles.`);
    }

    try {
      const role = await this.prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: {
            scope: 'ORG',
            orgId: org.id,
            name: dto.name,
            description,
            permissions: { create: permissions.map((permission) => ({ permission })) },
          },
          include: { permissions: { select: { permission: true } } },
        });
        await this.audit.record(tx, actor, {
          orgId: org.id,
          action: 'role.create',
          targetType: 'role',
          targetId: created.id,
          targetLabel: created.name,
          metadata: { permissions: [...permissions].sort(), clonedFrom: dto.cloneFromId ?? null },
        });
        return created;
      });
      return { role: this.toRole(role, 0) };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A role with that name already exists.');
      throw err;
    }
  }

  private assertCustom(role: RoleRow, orgId: string) {
    if (role.isSystem || role.orgId !== orgId) {
      throw new ConflictException('System roles are read-only. Clone the role to customize it.');
    }
  }

  async update(access: Access, actor: AuditActor, roleId: string, dto: UpdateRoleDto) {
    const org = this.requireOrg(access);
    const role = await this.find(access, roleId);
    this.assertCustom(role, org.id);

    const before = role.permissions.map((p) => p.permission).filter(isPermission);
    const after = dto.permissions ? this.parsePermissions(dto.permissions) : before;

    // Editing a role is editing everyone who holds it, so you must hold both
    // what it grants today and what it will grant.
    if (!access.covers([...before, ...after])) {
      throw new ForbiddenException('You can only edit roles whose permissions you hold yourself.');
    }

    const removed = before.filter((p) => !after.includes(p));
    const added = after.filter((p) => !before.includes(p));
    const nameChanged = dto.name !== undefined && dto.name !== role.name;
    const descChanged = dto.description !== undefined && (dto.description || null) !== role.description;
    if (!nameChanged && !descChanged && removed.length === 0 && added.length === 0) {
      return this.get(access, roleId);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id: role.id },
          data: {
            ...(nameChanged ? { name: dto.name } : {}),
            ...(descChanged ? { description: dto.description || null } : {}),
          },
        });
        if (removed.length) {
          await tx.rolePermission.deleteMany({ where: { roleId: role.id, permission: { in: removed } } });
        }
        if (added.length) {
          await tx.rolePermission.createMany({
            data: added.map((permission) => ({ roleId: role.id, permission })),
            skipDuplicates: true,
          });
        }
        await this.audit.record(tx, actor, {
          orgId: org.id,
          action: 'role.update',
          targetType: 'role',
          targetId: role.id,
          targetLabel: dto.name ?? role.name,
          metadata: {
            ...(nameChanged ? { name: { before: role.name, after: dto.name } } : {}),
            ...(added.length || removed.length ? { added: added.sort(), removed: removed.sort() } : {}),
          },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A role with that name already exists.');
      throw err;
    }
    // One counter bump re-evaluates every cached access entry of this org.
    await this.rbac.bump(org.id);
    return this.get(access, roleId);
  }

  async remove(access: Access, actor: AuditActor, roleId: string, reason: string) {
    const org = this.requireOrg(access);
    const role = await this.find(access, roleId);
    this.assertCustom(role, org.id);
    if (!access.covers(role.permissions.map((p) => p.permission))) {
      throw new ForbiddenException('You can only delete roles whose permissions you hold yourself.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.policy.lockOrg(tx, org.id);
      const holders = await tx.membershipRole.count({ where: { orgId: org.id, roleId } });
      if (holders > 0) {
        throw new ConflictException(
          `${holders} member${holders === 1 ? ' holds' : 's hold'} this role. Reassign them first.`,
        );
      }
      const now = new Date();
      const pending = await tx.invitation.count({
        where: { roleId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      });
      if (pending > 0) {
        throw new ConflictException('A pending invitation uses this role. Revoke it first.');
      }
      // Finished invitations still point at the role; they are history, not a reason to keep it.
      await tx.invitation.deleteMany({ where: { roleId } });
      await tx.role.delete({ where: { id: roleId } });
      await this.audit.record(tx, actor, {
        orgId: org.id,
        action: 'role.delete',
        targetType: 'role',
        targetId: roleId,
        targetLabel: role.name,
        reason,
        metadata: { permissions: role.permissions.map((p) => p.permission).sort() },
      });
    });
    await this.rbac.bump(org.id);
  }
}
