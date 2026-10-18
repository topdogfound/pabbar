import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuditActor } from '../../audit/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { afterCursor, clampLimit, encodeCursor } from '../../common/cursor.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type Access, RESERVED_SLUGS, SLUG_RE } from '../../rbac/access.js';
import { OWNER_ROLE_KEY } from '../../rbac/catalog.js';
import { RbacService } from '../../rbac/rbac.service.js';
import { isUniqueViolation } from '../admin-policy.service.js';
import type { CreateOrgDto, ListOrgsDto, UpdateSecurityDto } from '../dto/orgs.dto.js';
import { InvitationsService } from '../invitations/invitations.service.js';

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** `@Acme.com ` -> `acme.com`; throws on anything that is not a bare domain. */
export function normalizeDomains(list: string[]): string[] {
  const out = new Set<string>();
  for (const raw of list) {
    const d = raw.trim().toLowerCase().replace(/^@/, '');
    if (!DOMAIN_RE.test(d)) throw new BadRequestException(`"${raw}" is not a valid domain.`);
    out.add(d);
  }
  return [...out];
}

@Injectable()
export class AdminOrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly invitations: InvitationsService,
  ) {}

  private requireOrg(access: Access) {
    if (access.scope.kind !== 'org') throw new NotFoundException();
    return access.scope.org;
  }

  // --- platform: the org directory ---------------------------------------------------

  async list(q: ListOrgsDto) {
    const limit = clampLimit(q.limit);
    const rows = await this.prisma.organization.findMany({
      where: {
        AND: [
          q.status ? { status: q.status } : {},
          q.q
            ? {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' } },
                  { slug: { contains: q.q.toLowerCase() } },
                ],
              }
            : {},
          afterCursor('createdAt', q.cursor),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      orgs: page.map((o) => ({
        id: o.id,
        slug: o.slug,
        name: o.name,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        memberCount: o._count.memberships,
      })),
      nextCursor: rows.length > limit ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Creates the org and appoints its first Owner: directly when the email has an
   * account, otherwise through an Owner invitation they accept after signing in.
   */
  async create(actor: AuditActor, actorUserId: string, dto: CreateOrgDto) {
    if (RESERVED_SLUGS.has(dto.slug) || !SLUG_RE.test(dto.slug)) {
      throw new BadRequestException('That slug is reserved or invalid.');
    }
    const [ownerRoleId, owner] = await Promise.all([
      this.rbac.systemRoleId(OWNER_ROLE_KEY),
      this.prisma.user.findUnique({ where: { email: dto.ownerEmail }, select: { id: true, status: true } }),
    ]);
    if (owner && owner.status !== 'ACTIVE') throw new ConflictException('That account is suspended.');

    // Filled inside the transaction, run only after it commits.
    const after: { sendMail?: () => Promise<void> } = {};
    try {
      const org = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: { name: dto.name, slug: dto.slug },
          select: { id: true, slug: true, name: true, status: true, createdAt: true, inviteTtlDays: true },
        });
        if (owner) {
          await tx.membership.create({
            data: {
              orgId: created.id,
              userId: owner.id,
              // orgId is derived from the parent through the composite FK.
              roles: { create: { roleId: ownerRoleId } },
            },
          });
        } else {
          after.sendMail = await this.invitations.issueSystemInvite(tx, {
            orgId: created.id,
            orgName: created.name,
            email: dto.ownerEmail,
            roleId: ownerRoleId,
            roleName: 'Owner',
            invitedById: actorUserId,
            ttlDays: created.inviteTtlDays,
          });
        }
        await this.audit.record(tx, actor, {
          orgId: created.id,
          action: 'org.create',
          targetType: 'org',
          targetId: created.id,
          targetLabel: created.name,
          metadata: { slug: created.slug, owner: dto.ownerEmail, ownerInvited: !owner },
        });
        return created;
      });
      if (owner) await this.rbac.evictSummary(owner.id);
      await after.sendMail?.();
      return { org: { id: org.id, slug: org.slug, name: org.name, status: org.status, createdAt: org.createdAt.toISOString() } };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('That slug is already taken.');
      throw err;
    }
  }

  async setStatus(actor: AuditActor, orgId: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
    const org = await this.prisma.$transaction(async (tx) => {
      const current = await tx.organization.findUnique({
        where: { id: orgId },
        select: { id: true, slug: true, name: true, status: true },
      });
      if (!current) throw new NotFoundException('Organization not found.');
      if (current.status === status) throw new ConflictException(`Organization is already ${status.toLowerCase()}.`);
      await tx.organization.update({ where: { id: orgId }, data: { status } });
      await this.audit.record(tx, actor, {
        orgId,
        action: status === 'SUSPENDED' ? 'org.suspend' : 'org.restore',
        targetType: 'org',
        targetId: orgId,
        targetLabel: current.name,
        reason,
      });
      return current;
    });
    await this.rbac.evictOrg(org.slug);
    await this.rbac.bump(orgId);
  }

  // --- org scope: settings -------------------------------------------------------------

  async getOrganization(access: Access) {
    const org = this.requireOrg(access);
    const row = await this.prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { id: true, slug: true, name: true, status: true, createdAt: true },
    });
    return { org: { ...row, createdAt: row.createdAt.toISOString() } };
  }

  async rename(access: Access, actor: AuditActor, name: string) {
    const org = this.requireOrg(access);
    if (name === org.name) return this.getOrganization(access);
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: org.id }, data: { name } });
      await this.audit.record(tx, actor, {
        orgId: org.id,
        action: 'org.update',
        targetType: 'org',
        targetId: org.id,
        targetLabel: name,
        metadata: { name: { before: org.name, after: name } },
      });
    });
    await this.rbac.evictOrg(org.slug);
    return this.getOrganization(access);
  }

  async getSecurity(access: Access) {
    const org = this.requireOrg(access);
    const s = await this.prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { allowedEmailDomains: true, inviteTtlDays: true },
    });
    return { policy: s };
  }

  async updateSecurity(access: Access, actor: AuditActor, dto: UpdateSecurityDto) {
    const org = this.requireOrg(access);
    const before = (await this.getSecurity(access)).policy;
    const next = {
      allowedEmailDomains: dto.allowedEmailDomains ? normalizeDomains(dto.allowedEmailDomains) : before.allowedEmailDomains,
      inviteTtlDays: dto.inviteTtlDays ?? before.inviteTtlDays,
    };
    const same =
      next.inviteTtlDays === before.inviteTtlDays &&
      next.allowedEmailDomains.length === before.allowedEmailDomains.length &&
      next.allowedEmailDomains.every((d) => before.allowedEmailDomains.includes(d));
    if (same) return { policy: before };

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: org.id }, data: next });
      await this.audit.record(tx, actor, {
        orgId: org.id,
        action: 'security.update',
        targetType: 'org',
        targetId: org.id,
        targetLabel: org.name,
        metadata: { before, after: next },
      });
    });
    return { policy: next };
  }
}

