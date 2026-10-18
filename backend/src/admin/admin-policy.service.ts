import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Access } from '../rbac/access.js';
import { OWNER_ROLE_KEY, SUPER_ADMIN_ROLE_KEY } from '../rbac/catalog.js';
import { RbacService } from '../rbac/rbac.service.js';

type Tx = Prisma.TransactionClient;

export const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/** Guardrails shared by the admin services. Each one throws; none returns a boolean. */
@Injectable()
export class AdminPolicy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  /**
   * Escalation guard for acting on a person: you may only manage someone whose
   * access in this scope is a subset of yours. Stops a Manager suspending an
   * Owner, or Support suspending a Super Admin.
   */
  async assertCanManage(access: Access, targetUserId: string) {
    const target = await this.rbac.access(targetUserId, access.scope);
    if (!access.covers(target.held)) {
      throw new ForbiddenException('You cannot manage a user who has more access than you.');
    }
  }

  /** Serialises role/membership changes of one org so the owner invariant cannot race. */
  async lockOrg(tx: Tx, orgId: string) {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
  }

  /** Call inside a lockOrg transaction, before a change that would remove `userId` as an active Owner. */
  async assertNotLastOwner(tx: Tx, orgId: string, userId: string) {
    const ownerRoleId = await this.rbac.systemRoleId(OWNER_ROLE_KEY);
    const holds = await tx.membershipRole.count({
      where: { orgId, roleId: ownerRoleId, membership: { userId, status: 'ACTIVE' } },
    });
    if (holds === 0) return;
    const others = await tx.membership.count({
      where: {
        orgId,
        status: 'ACTIVE',
        userId: { not: userId },
        roles: { some: { roleId: ownerRoleId } },
      },
    });
    if (others === 0) {
      throw new ConflictException('An organization must keep at least one active Owner.');
    }
  }

  /** Same invariant for the platform: never leave it without a Super Admin. */
  async assertNotLastSuperAdmin(tx: Tx, userId: string) {
    const roleId = await this.rbac.systemRoleId(SUPER_ADMIN_ROLE_KEY);
    const holds = await tx.platformRoleAssignment.count({ where: { userId, roleId } });
    if (holds === 0) return;
    const others = await tx.platformRoleAssignment.count({
      where: { roleId, userId: { not: userId }, user: { status: 'ACTIVE' } },
    });
    if (others === 0) {
      throw new ConflictException('The platform must keep at least one active Super Admin.');
    }
  }
}
