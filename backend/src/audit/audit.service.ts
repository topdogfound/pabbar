import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog, type PrismaClient } from '../generated/prisma/client.js';
import { afterCursor, clampLimit, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuditActor } from './actor.js';

/** The service itself or an interactive-transaction client. */
export type Db = Pick<PrismaClient, 'auditLog'>;

export interface AuditEntry {
  /** null = platform-level event. */
  orgId?: string | null;
  /** Dotted verb, e.g. `user.suspend`, `role.update`. */
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditQuery {
  /** Fixed in org scope; optional filter in platform scope. */
  orgId?: string | null;
  /** Platform scope only: restrict to events with no org. */
  platformOnly?: boolean;
  actorId?: string;
  /** Exact action, or a prefix ending in `.` (e.g. `user.`). */
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface AuditEvent {
  id: string;
  at: string;
  orgId: string | null;
  actor: { id: string | null; email: string | null; name: string | null };
  impersonatorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  reason: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

const EXPORT_PAGE = 1000;

export const toEvent = (r: AuditLog): AuditEvent => ({
  id: r.id,
  at: r.at.toISOString(),
  orgId: r.orgId,
  actor: { id: r.actorId, email: r.actorEmail, name: r.actorName },
  impersonatorId: r.impersonatorId,
  action: r.action,
  targetType: r.targetType,
  targetId: r.targetId,
  targetLabel: r.targetLabel,
  reason: r.reason,
  metadata: r.metadata,
  ip: r.ip,
  userAgent: r.userAgent,
  requestId: r.requestId,
});

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** The non-transactional client, for audit rows that stand alone (reads, exports). */
  get db(): Db {
    return this.prisma;
  }

  /**
   * Pass the transaction client of the mutation being audited so the change and
   * its record commit or roll back together.
   */
  record(db: Db, actor: AuditActor, entry: AuditEntry) {
    return db.auditLog.create({
      data: {
        orgId: entry.orgId ?? null,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        impersonatorId: actor.impersonatorId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        reason: entry.reason,
        metadata: entry.metadata,
        ip: actor.ip,
        userAgent: actor.userAgent,
        requestId: actor.requestId,
      },
    });
  }

  private where(q: AuditQuery): Prisma.AuditLogWhereInput {
    const action = q.action?.trim();
    return {
      ...(q.platformOnly ? { orgId: null } : q.orgId ? { orgId: q.orgId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(action
        ? action.endsWith('.')
          ? { action: { startsWith: action } }
          : { action }
        : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
      ...(q.from || q.to ? { at: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    };
  }

  /** Newest first, keyset-paginated; no COUNT(*) (it does not scale on an append-only table). */
  async list(q: AuditQuery) {
    const limit = clampLimit(q.limit, 25, 100);
    const rows = await this.prisma.auditLog.findMany({
      where: { AND: [this.where(q), afterCursor('at', q.cursor)] },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    // Audit rows hold only an orgId (no FK, so they outlive orgs). Names for the
    // orgs on this page come from one bounded lookup, not a join.
    const orgIds = [...new Set(page.map((r) => r.orgId).filter((id): id is string => id !== null))];
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, slug: true, name: true },
        })
      : [];
    return {
      events: page.map(toEvent),
      orgs: Object.fromEntries(orgs.map((o) => [o.id, { slug: o.slug, name: o.name }])),
      nextCursor: rows.length > limit ? encodeCursor(last.at, last.id) : null,
    };
  }

  /** Streams matching rows in keyset pages so memory stays flat, up to `max`. */
  async *iterate(q: Omit<AuditQuery, 'cursor' | 'limit'>, max: number) {
    let cursor: string | undefined;
    let sent = 0;
    while (sent < max) {
      const take = Math.min(EXPORT_PAGE, max - sent);
      const rows = await this.prisma.auditLog.findMany({
        where: { AND: [this.where(q), afterCursor('at', cursor)] },
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        take,
      });
      if (rows.length === 0) return;
      for (const r of rows) yield r;
      sent += rows.length;
      if (rows.length < take) return;
      const last = rows[rows.length - 1];
      cursor = encodeCursor(last.at, last.id);
    }
  }
}
