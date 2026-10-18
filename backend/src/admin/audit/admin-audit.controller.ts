import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { actorFrom } from '../../audit/actor.js';
import { AuditService, type AuditQuery } from '../../audit/audit.service.js';
import { SessionGuard } from '../../auth/session/session.guard.js';
import type { Access } from '../../rbac/access.js';
import { CurrentAccess, PermissionsGuard, RequirePermission } from '../../rbac/permissions.guard.js';
import { ReadEndpoint, WriteEndpoint } from '../admin.decorators.js';
import { AuditQueryDto } from '../dto/audit.dto.js';

const DEFAULT_EXPORT_MAX = 100_000;

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : JSON.stringify(v);
  // Spreadsheet formula injection: a cell that starts with these is executed by Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

@Controller('admin/:scope/audit')
@UseGuards(SessionGuard, PermissionsGuard)
export class AdminAuditController {
  private readonly exportMax: number;

  constructor(
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.exportMax = Number(config.get('AUDIT_EXPORT_MAX_ROWS') ?? DEFAULT_EXPORT_MAX);
  }

  /** Org scope is pinned to its org; platform scope may narrow to one org or to `none`. */
  private query(access: Access, q: AuditQueryDto): Omit<AuditQuery, 'cursor' | 'limit'> {
    const scope = access.scope;
    const base = {
      actorId: q.actorId,
      action: q.action,
      targetType: q.targetType,
      targetId: q.targetId,
      from: q.from,
      to: q.to,
    };
    if (scope.kind === 'org') return { ...base, orgId: scope.org.id };
    if (q.orgId === 'none') return { ...base, platformOnly: true };
    return { ...base, orgId: q.orgId };
  }

  @Get()
  @ReadEndpoint()
  @RequirePermission('audit:read')
  list(@CurrentAccess() access: Access, @Query() q: AuditQueryDto) {
    return this.audit.list({ ...this.query(access, q), cursor: q.cursor, limit: q.limit });
  }

  /** Streams CSV in keyset pages; memory stays flat however large the log is. */
  @Get('export')
  @WriteEndpoint(10)
  @RequirePermission('audit:export')
  async export(
    @CurrentAccess() access: Access,
    @Query() q: AuditQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const query = this.query(access, q);
    await this.audit.record(this.auditDb, actorFrom(req), {
      orgId: access.scope.kind === 'org' ? access.scope.org.id : null,
      action: 'audit.export',
      metadata: JSON.parse(JSON.stringify({ ...query, max: this.exportMax })),
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.write(
      'at,action,actor_email,actor_name,impersonator_id,target_type,target_id,target_label,reason,org_id,ip,request_id,metadata\n',
    );
    for await (const r of this.audit.iterate(query, this.exportMax)) {
      const line = [
        r.at.toISOString(),
        r.action,
        r.actorEmail,
        r.actorName,
        r.impersonatorId,
        r.targetType,
        r.targetId,
        r.targetLabel,
        r.reason,
        r.orgId,
        r.ip,
        r.requestId,
        r.metadata,
      ]
        .map(csvCell)
        .join(',');
      if (!res.write(`${line}\n`)) await new Promise((resolve) => res.once('drain', resolve));
      if (res.destroyed) return;
    }
    res.end();
  }

  private get auditDb() {
    return this.audit.db;
  }
}
