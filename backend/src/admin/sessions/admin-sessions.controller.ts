import { Controller, Delete, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { actorFrom } from '../../audit/actor.js';
import { SessionGuard } from '../../auth/session/session.guard.js';
import type { Access } from '../../rbac/access.js';
import { CurrentAccess, PermissionsGuard, RequirePermission } from '../../rbac/permissions.guard.js';
import { ReadEndpoint, WriteEndpoint } from '../admin.decorators.js';
import { ListAdminSessionsDto } from '../dto/audit.dto.js';
import { AdminSessionsService } from './admin-sessions.service.js';

@Controller('admin/:scope')
@UseGuards(SessionGuard, PermissionsGuard)
export class AdminSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  @Get('sessions')
  @ReadEndpoint()
  @RequirePermission('sessions:read')
  list(@CurrentAccess() access: Access, @Query() q: ListAdminSessionsDto) {
    return this.sessions.list(access, q);
  }

  @Delete('sessions/:sessionId')
  @WriteEndpoint()
  @RequirePermission('sessions:revoke')
  async revoke(@CurrentAccess() access: Access, @Param('sessionId') id: string, @Req() req: Request) {
    await this.sessions.revoke(access, actorFrom(req), id);
    return { ok: true };
  }

  @Delete('users/:userId/sessions')
  @WriteEndpoint()
  @RequirePermission('sessions:revoke')
  revokeUser(@CurrentAccess() access: Access, @Param('userId') userId: string, @Req() req: Request) {
    return this.sessions.revokeUser(access, actorFrom(req), userId);
  }
}
