import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Access } from '../rbac/access.js';
import { ALL_PERMISSIONS, PERMISSIONS } from '../rbac/catalog.js';

const CAP = 10_000;

export interface Stat {
  value: number;
  /** True when the real number is at least `value` (counting stopped at the cap). */
  capped: boolean;
}

@Injectable()
export class AdminCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Counts at most CAP+1 rows. An exact COUNT(*) on a big table scans it, and a
   * dashboard tile does not need to tell 10,000 from 4,000,000: it shows "10,000+".
   */
  private async capped(inner: Prisma.Sql): Promise<Stat> {
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (${inner} LIMIT ${CAP + 1}) t`;
    const n = rows[0]?.n ?? 0;
    return { value: Math.min(n, CAP), capped: n > CAP };
  }

  catalog() {
    return {
      permissions: ALL_PERMISSIONS.map((key) => ({ key, ...PERMISSIONS[key] })),
    };
  }

  context(access: Access) {
    const scope = access.scope;
    return {
      scope:
        scope.kind === 'platform'
          ? { kind: 'platform' as const, slug: 'platform', name: 'Platform', status: 'ACTIVE' as const }
          : { kind: 'org' as const, slug: scope.org.slug, name: scope.org.name, status: scope.org.status },
      permissions: [...access.permissions].sort(),
      // Everything the viewer holds, including permissions no endpoint here uses.
      // The UI needs it to grey out roles the viewer may not hand out.
      held: [...access.held].sort(),
    };
  }

  async overview(access: Access) {
    const scope = access.scope;
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    if (scope.kind === 'org') {
      const orgId = scope.org.id;
      const [members, invites, sessions, changes, recent] = await Promise.all([
        this.capped(Prisma.sql`SELECT 1 FROM "Membership" WHERE "orgId" = ${orgId}`),
        this.capped(
          Prisma.sql`SELECT 1 FROM "Invitation" WHERE "orgId" = ${orgId} AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > now()`,
        ),
        this.capped(Prisma.sql`SELECT 1 FROM "Session" s WHERE s."expiresAt" > now()
          AND EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId" = s."userId" AND m."orgId" = ${orgId})`),
        this.capped(Prisma.sql`SELECT 1 FROM "AuditLog" WHERE "orgId" = ${orgId} AND "at" >= ${weekAgo}`),
        access.has('audit:read') ? this.audit.list({ orgId, limit: 8 }) : null,
      ]);
      return {
        stats: { members, pendingInvites: invites, activeSessions: sessions, adminChanges7d: changes },
        recent: recent?.events ?? null,
      };
    }

    const [users, orgs, sessions, changes, recent] = await Promise.all([
      this.capped(Prisma.sql`SELECT 1 FROM "User"`),
      this.capped(Prisma.sql`SELECT 1 FROM "Organization"`),
      this.capped(Prisma.sql`SELECT 1 FROM "Session" WHERE "expiresAt" > now()`),
      this.capped(Prisma.sql`SELECT 1 FROM "AuditLog" WHERE "at" >= ${weekAgo}`),
      access.has('audit:read') ? this.audit.list({ limit: 8 }) : null,
    ]);
    return {
      stats: { users, orgs, activeSessions: sessions, adminChanges7d: changes },
      recent: recent?.events ?? null,
    };
  }
}
