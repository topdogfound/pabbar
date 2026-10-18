import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient, User } from '../../generated/prisma/client.js';
import type { AuditActor } from '../../audit/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { afterCursor, clampLimit, encodeCursor } from '../../common/cursor.js';
import { MailService } from '../../mail/mail.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Access } from '../../rbac/access.js';
import { RbacService } from '../../rbac/rbac.service.js';
import { AdminPolicy } from '../admin-policy.service.js';
import type { PageDto } from '../dto/common.dto.js';

export type InviteResult = {
  email: string;
  status: 'invited' | 'already_member' | 'already_invited' | 'domain_not_allowed';
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const DAY_MS = 86_400_000;

/** Owner invitations issued when an org is created for someone who has no account yet. */
export interface SystemInvite {
  orgId: string;
  orgName: string;
  email: string;
  roleId: string;
  roleName: string;
  invitedById: string | null;
  ttlDays: number;
}

@Injectable()
export class InvitationsService {
  private readonly log = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly policy: AdminPolicy,
  ) {}

  private requireOrg(access: Access) {
    if (access.scope.kind !== 'org') throw new NotFoundException();
    return access.scope.org;
  }

  private link(token: string) {
    const base = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
    return `${base}/invite/${token}`;
  }

  async list(access: Access, q: PageDto) {
    const org = this.requireOrg(access);
    const limit = clampLimit(q.limit);
    const rows = await this.prisma.invitation.findMany({
      where: {
        AND: [{ orgId: org.id, acceptedAt: null, revokedAt: null }, afterCursor('createdAt', q.cursor)],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { role: { select: { id: true, name: true } } },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const now = Date.now();
    return {
      invitations: page.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
        expired: i.expiresAt.getTime() <= now,
      })),
      nextCursor: rows.length > limit ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(access: Access, actor: AuditActor, emails: string[], roleId: string) {
    const org = this.requireOrg(access);
    if (org.status !== 'ACTIVE') throw new ConflictException('This organization is suspended.');

    const [settings, role] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: org.id },
        select: { allowedEmailDomains: true, inviteTtlDays: true },
      }),
      this.prisma.role.findFirst({
        where: { id: roleId, scope: 'ORG', OR: [{ orgId: null }, { orgId: org.id }] },
        include: { permissions: { select: { permission: true } } },
      }),
    ]);
    if (!role) throw new BadRequestException('Unknown role.');
    // Escalation guard: you can only invite people into roles you could assign.
    if (!access.covers(role.permissions.map((p) => p.permission))) {
      throw new ForbiddenException(`You cannot invite people as ${role.name}: it carries permissions you do not hold.`);
    }

    const now = new Date();
    const [users, pending] = await Promise.all([
      this.prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true, memberships: { where: { orgId: org.id }, select: { id: true } } },
      }),
      this.prisma.invitation.findMany({
        where: { orgId: org.id, email: { in: emails }, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        select: { email: true },
      }),
    ]);
    const members = new Set(users.filter((u) => u.memberships.length > 0).map((u) => u.email));
    const invited = new Set(pending.map((p) => p.email));
    const domains = settings.allowedEmailDomains;

    const results: InviteResult[] = [];
    const fresh: { email: string; token: string; expiresAt: Date }[] = [];
    for (const email of emails) {
      const domain = email.split('@')[1];
      if (domains.length > 0 && !domains.includes(domain)) {
        results.push({ email, status: 'domain_not_allowed' });
      } else if (members.has(email)) {
        results.push({ email, status: 'already_member' });
      } else if (invited.has(email)) {
        results.push({ email, status: 'already_invited' });
      } else {
        fresh.push({
          email,
          token: randomBytes(32).toString('base64url'),
          expiresAt: new Date(now.getTime() + settings.inviteTtlDays * DAY_MS),
        });
        results.push({ email, status: 'invited' });
      }
    }

    if (fresh.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.invitation.createMany({
          data: fresh.map((f) => ({
            orgId: org.id,
            email: f.email,
            roleId: role.id,
            tokenHash: hashToken(f.token),
            invitedById: access.userId,
            expiresAt: f.expiresAt,
          })),
        });
        for (const f of fresh) {
          await this.audit.record(tx, actor, {
            orgId: org.id,
            action: 'invitation.create',
            targetType: 'invitation',
            targetLabel: f.email,
            metadata: { role: role.name },
          });
        }
      });
      // After commit: a mail failure must not undo the invitation; it can be resent.
      await this.sendAll(
        fresh.map((f) => ({
          to: f.email,
          orgName: org.name,
          inviterName: actor.name ?? actor.email,
          roleName: role.name,
          link: this.link(f.token),
          expiresAt: f.expiresAt,
        })),
      );
    }
    return { results };
  }

  async resend(access: Access, actor: AuditActor, invitationId: string) {
    const org = this.requireOrg(access);
    const inv = await this.prisma.invitation.findFirst({
      where: { id: invitationId, orgId: org.id, acceptedAt: null, revokedAt: null },
      include: { role: { select: { name: true } } },
    });
    if (!inv) throw new NotFoundException('Invitation not found.');
    const settings = await this.prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { inviteTtlDays: true },
    });

    // New token and a fresh window; the old link stops working.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + settings.inviteTtlDays * DAY_MS);
    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token), expiresAt } });
      await this.audit.record(tx, actor, {
        orgId: org.id,
        action: 'invitation.resend',
        targetType: 'invitation',
        targetId: inv.id,
        targetLabel: inv.email,
      });
    });
    await this.sendAll([
      {
        to: inv.email,
        orgName: org.name,
        inviterName: actor.name ?? actor.email,
        roleName: inv.role.name,
        link: this.link(token),
        expiresAt,
      },
    ]);
  }

  async revoke(access: Access, actor: AuditActor, invitationId: string) {
    const org = this.requireOrg(access);
    await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invitation.findFirst({
        where: { id: invitationId, orgId: org.id, acceptedAt: null, revokedAt: null },
      });
      if (!inv) throw new NotFoundException('Invitation not found.');
      await tx.invitation.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, actor, {
        orgId: org.id,
        action: 'invitation.revoke',
        targetType: 'invitation',
        targetId: inv.id,
        targetLabel: inv.email,
      });
    });
  }

  /** Used when a platform operator creates an org for an email with no account yet. */
  async issueSystemInvite(tx: Pick<PrismaClient, 'invitation'>, i: SystemInvite) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + i.ttlDays * DAY_MS);
    await tx.invitation.create({
      data: {
        orgId: i.orgId,
        email: i.email,
        roleId: i.roleId,
        tokenHash: hashToken(token),
        invitedById: i.invitedById,
        expiresAt,
      },
    });
    return () =>
      this.sendAll([
        {
          to: i.email,
          orgName: i.orgName,
          inviterName: null,
          roleName: i.roleName,
          link: this.link(token),
          expiresAt,
        },
      ]);
  }

  private async sendAll(mails: Parameters<MailService['sendInvitation']>[0][]) {
    for (let i = 0; i < mails.length; i += 5) {
      const results = await Promise.allSettled(mails.slice(i, i + 5).map((m) => this.mail.sendInvitation(m)));
      for (const r of results) {
        if (r.status === 'rejected') this.log.warn(`Invitation email failed: ${(r.reason as Error).message}`);
      }
    }
  }

  // --- public: the invitee's side -------------------------------------------------

  private async byToken(token: string) {
    return this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { org: { select: { id: true, slug: true, name: true, status: true } }, role: { select: { id: true, name: true } } },
    });
  }

  /** What the invite page shows before sign-in. The token is the secret; nothing else is exposed. */
  async preview(token: string) {
    const inv = await this.byToken(token);
    if (!inv) throw new NotFoundException('Invitation not found.');
    const status = inv.acceptedAt
      ? 'accepted'
      : inv.revokedAt
        ? 'revoked'
        : inv.expiresAt.getTime() <= Date.now()
          ? 'expired'
          : inv.org.status !== 'ACTIVE'
            ? 'unavailable'
            : 'pending';
    return { orgName: inv.org.name, email: inv.email, roleName: inv.role.name, status };
  }

  async accept(user: User, actor: AuditActor, token: string) {
    const inv = await this.byToken(token);
    if (!inv) throw new NotFoundException('Invitation not found.');
    if (inv.acceptedAt || inv.revokedAt) throw new GoneException('This invitation is no longer valid.');
    if (inv.expiresAt.getTime() <= Date.now()) throw new GoneException('This invitation has expired.');
    if (inv.org.status !== 'ACTIVE') throw new ConflictException('This organization is suspended.');
    if (!user.emailVerifiedAt || user.email?.toLowerCase() !== inv.email) {
      throw new ForbiddenException(`This invitation was sent to ${inv.email}. Sign in with that address.`);
    }
    const settings = await this.prisma.organization.findUniqueOrThrow({
      where: { id: inv.orgId },
      select: { allowedEmailDomains: true },
    });
    if (settings.allowedEmailDomains.length > 0 && !settings.allowedEmailDomains.includes(inv.email.split('@')[1])) {
      throw new ForbiddenException('Your email domain is no longer allowed in this organization.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.policy.lockOrg(tx, inv.orgId);
      const fresh = await tx.invitation.findUnique({ where: { id: inv.id } });
      if (!fresh || fresh.acceptedAt || fresh.revokedAt) {
        throw new GoneException('This invitation is no longer valid.');
      }
      const existing = await tx.membership.findUnique({
        where: { orgId_userId: { orgId: inv.orgId, userId: user.id } },
        include: { roles: { select: { roleId: true } } },
      });
      if (existing?.status === 'SUSPENDED') {
        throw new ForbiddenException('Your membership in this organization is suspended.');
      }
      if (existing) {
        if (!existing.roles.some((r) => r.roleId === inv.roleId)) {
          await tx.membershipRole.create({
            data: { membershipId: existing.id, orgId: inv.orgId, roleId: inv.roleId },
          });
        }
      } else {
        await tx.membership.create({
          data: {
            orgId: inv.orgId,
            userId: user.id,
            roles: { create: { roleId: inv.roleId } },
          },
        });
      }
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      await this.audit.record(tx, actor, {
        orgId: inv.orgId,
        action: 'invitation.accept',
        targetType: 'invitation',
        targetId: inv.id,
        targetLabel: inv.email,
        metadata: { role: inv.role.name },
      });
    });
    await this.rbac.bump(inv.orgId);
    await this.rbac.evictSummary(user.id);
    return { org: { slug: inv.org.slug, name: inv.org.name } };
  }
}

