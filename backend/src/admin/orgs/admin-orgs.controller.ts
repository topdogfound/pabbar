import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { actorFrom } from '../../audit/actor.js';
import { SessionGuard } from '../../auth/session/session.guard.js';
import type { Access } from '../../rbac/access.js';
import { CurrentAccess, PermissionsGuard, RequirePermission } from '../../rbac/permissions.guard.js';
import { ReadEndpoint, WriteEndpoint } from '../admin.decorators.js';
import {
  CreateOrgDto,
  ListOrgsDto,
  SetOrgStatusDto,
  UpdateOrgDto,
  UpdateSecurityDto,
} from '../dto/orgs.dto.js';
import { AdminOrgsService } from './admin-orgs.service.js';

@Controller('admin/:scope')
@UseGuards(SessionGuard, PermissionsGuard)
export class AdminOrgsController {
  constructor(private readonly orgs: AdminOrgsService) {}

  // Platform scope: the directory of organizations.

  @Get('orgs')
  @ReadEndpoint()
  @RequirePermission('orgs:read')
  list(@Query() q: ListOrgsDto) {
    return this.orgs.list(q);
  }

  @Post('orgs')
  @WriteEndpoint(20)
  @RequirePermission('orgs:create')
  create(@CurrentAccess() access: Access, @Body() dto: CreateOrgDto, @Req() req: Request) {
    return this.orgs.create(actorFrom(req), access.userId, dto);
  }

  @Put('orgs/:orgId/status')
  @WriteEndpoint()
  @RequirePermission('orgs:suspend')
  async setStatus(@Param('orgId') orgId: string, @Body() dto: SetOrgStatusDto, @Req() req: Request) {
    await this.orgs.setStatus(actorFrom(req), orgId, dto.status, dto.reason);
    return { status: dto.status };
  }

  // Org scope: this organization's own settings.

  @Get('organization')
  @ReadEndpoint()
  @RequirePermission('org:read')
  get(@CurrentAccess() access: Access) {
    return this.orgs.getOrganization(access);
  }

  @Patch('organization')
  @WriteEndpoint()
  @RequirePermission('org:update')
  rename(@CurrentAccess() access: Access, @Body() dto: UpdateOrgDto, @Req() req: Request) {
    return this.orgs.rename(access, actorFrom(req), dto.name);
  }

  @Get('security')
  @ReadEndpoint()
  @RequirePermission('security:read')
  getSecurity(@CurrentAccess() access: Access) {
    return this.orgs.getSecurity(access);
  }

  @Patch('security')
  @WriteEndpoint()
  @RequirePermission('security:update')
  updateSecurity(@CurrentAccess() access: Access, @Body() dto: UpdateSecurityDto, @Req() req: Request) {
    return this.orgs.updateSecurity(access, actorFrom(req), dto);
  }
}
