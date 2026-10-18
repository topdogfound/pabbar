import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditActor } from '../../audit/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { SessionService } from '../../auth/session/session.service.js';
import { afterCursor, clampLimit, encodeCursor } from '../../common/cursor.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Access } from '../../rbac/access.js';
import { StorageService } from '../../storage/storage.service.js';
import type { ListAdminSessionsDto } from '../dto/audit.dto.js';

@Injectable()
export class AdminSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Sessions a scope may see: org members' (any org they belong to) or, for the platform, everyone's. */
  private visible(access: Access): Prisma.SessionWhereInput {
    return access.scope.kind === 'org'
      ? { user: { memberships: { some: { orgId: access.scope.org.id } } } }
      : {};
  }

  async list(access: Access, q: ListAdminSessionsDto) {
    const limit = clampLimit(q.limit);
    const rows = await this.prisma.session.findMany({
      where: {
        AND: [
          { expiresAt: { gt: new Date() } },
          this.visible(access),
          q.userId ? { userId: q.userId } : {},
          afterCursor('createdAt', q.cursor),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        userAgent: true,
        ip: true,
        lastUsedAt: true,
        createdAt: true,
        impersonatorId: true,
        user: { select: { id: true, email: true, name: true, avatarKey: true, avatarUrl: true } },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      sessions: page.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        lastUsedAt: s.lastUsedAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        impersonated: s.impersonatorId !== null,
        user: {
          id: s.user.id,
          email: s.user.email,
          name: s.user.name,
          avatarUrl: s.user.avatarKey ? this.storage.publicUrl(s.user.avatarKey) : (s.user.avatarUrl ?? null),
        },
      })),
      nextCursor: rows.length > limit ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Revoking is defensive, so there is no "more powerful than you" rule here
   * (Support must be able to sign out an Owner). It is scoped, rate-limited and audited.
   */
  async revoke(access: Access, actor: AuditActor, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { AND: [{ id: sessionId }, this.visible(access)] },
      select: { id: true, userId: true, user: { select: { email: true, name: true } } },
    });
    if (!session) throw new NotFoundException('Session not found.');
    await this.sessions.revokeById(session.id);
    await this.audit.record(this.prisma, actor, {
      orgId: access.scope.kind === 'org' ? access.scope.org.id : null,
      action: 'session.revoke',
      targetType: 'user',
      targetId: session.userId,
      targetLabel: session.user.email ?? session.user.name,
      metadata: { sessionId: session.id },
    });
  }

  async revokeUser(access: Access, actor: AuditActor, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { AND: [{ id: userId }, access.scope.kind === 'org' ? { memberships: { some: { orgId: access.scope.org.id } } } : {}] },
      select: { email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    const count = await this.sessions.revokeAll(userId);
    await this.audit.record(this.prisma, actor, {
      orgId: access.scope.kind === 'org' ? access.scope.org.id : null,
      action: 'user.sessions.revoke',
      targetType: 'user',
      targetId: userId,
      targetLabel: user.email ?? user.name,
      metadata: { count },
    });
    return { revoked: count };
  }
}
