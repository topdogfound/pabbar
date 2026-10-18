import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { actorFrom } from '../../audit/actor.js';
import { SessionGuard } from '../../auth/session/session.guard.js';
import type { Access } from '../../rbac/access.js';
import { CurrentAccess, PermissionsGuard, RequirePermission } from '../../rbac/permissions.guard.js';
import { ReadEndpoint, WriteEndpoint } from '../admin.decorators.js';
import { ReasonDto } from '../dto/common.dto.js';
import { CreateRoleDto, UpdateRoleDto } from '../dto/roles.dto.js';
import { AdminRolesService } from './admin-roles.service.js';

@Controller('admin/:scope/roles')
@UseGuards(SessionGuard, PermissionsGuard)
export class AdminRolesController {
  constructor(private readonly roles: AdminRolesService) {}

  @Get()
  @ReadEndpoint()
  @RequirePermission('roles:read')
  list(@CurrentAccess() access: Access) {
    return this.roles.list(access);
  }

  @Get(':roleId')
  @ReadEndpoint()
  @RequirePermission('roles:read')
  get(@CurrentAccess() access: Access, @Param('roleId') roleId: string) {
    return this.roles.get(access, roleId);
  }

  @Post()
  @WriteEndpoint()
  @RequirePermission('roles:create')
  create(@CurrentAccess() access: Access, @Body() dto: CreateRoleDto, @Req() req: Request) {
    return this.roles.create(access, actorFrom(req), dto);
  }

  @Patch(':roleId')
  @WriteEndpoint()
  @RequirePermission('roles:update')
  update(
    @CurrentAccess() access: Access,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    return this.roles.update(access, actorFrom(req), roleId, dto);
  }

  @Delete(':roleId')
  @HttpCode(204)
  @WriteEndpoint()
  @RequirePermission('roles:delete')
  async remove(
    @CurrentAccess() access: Access,
    @Param('roleId') roleId: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    await this.roles.remove(access, actorFrom(req), roleId, dto.reason);
  }
}
