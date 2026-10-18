import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { actorFrom } from '../../audit/actor.js';
import { SessionGuard } from '../../auth/session/session.guard.js';
import { SessionService } from '../../auth/session/session.service.js';
import type { Access } from '../../rbac/access.js';
import { CurrentAccess, PermissionsGuard, RequirePermission } from '../../rbac/permissions.guard.js';
import { ReadEndpoint, WriteEndpoint } from '../admin.decorators.js';
import { OptionalReasonDto, ReasonDto } from '../dto/common.dto.js';
import { ImpersonateDto, ListUsersDto, SetRolesDto } from '../dto/users.dto.js';
import { AdminUsersService } from './admin-users.service.js';

@Controller('admin/:scope/users')
@UseGuards(SessionGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @ReadEndpoint()
  @RequirePermission('users:read')
  list(@CurrentAccess() access: Access, @Query() q: ListUsersDto) {
    return this.users.list(access, q);
  }

  @Get(':userId')
  @ReadEndpoint()
  @RequirePermission('users:read')
  get(@CurrentAccess() access: Access, @Param('userId') userId: string) {
    return this.users.get(access, userId);
  }

  @Post(':userId/suspend')
  @HttpCode(204)
  @WriteEndpoint()
  @RequirePermission('users:suspend')
  async suspend(
    @CurrentAccess() access: Access,
    @Param('userId') userId: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    await this.users.suspend(access, actorFrom(req), userId, dto.reason);
  }

  @Post(':userId/restore')
  @HttpCode(204)
  @WriteEndpoint()
  @RequirePermission('users:suspend')
  async restore(
    @CurrentAccess() access: Access,
    @Param('userId') userId: string,
    @Body() dto: OptionalReasonDto,
    @Req() req: Request,
  ) {
    await this.users.restore(access, actorFrom(req), userId, dto.reason);
  }

  @Delete(':userId')
  @HttpCode(204)
  @WriteEndpoint()
  @RequirePermission('users:remove')
  async remove(
    @CurrentAccess() access: Access,
    @Param('userId') userId: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    await this.users.remove(access, actorFrom(req), userId, dto.reason);
  }

  @Put(':userId/roles')
  @HttpCode(204)
  @WriteEndpoint()
  @RequirePermission('roles:assign')
  async setRoles(
    @CurrentAccess() access: Access,
    @Param('userId') userId: string,
    @Body() dto: SetRolesDto,
    @Req() req: Request,
  ) {
    await this.users.setRoles(access, actorFrom(req), userId, dto.roleIds, dto.reason);
  }

  /**
   * Swaps the caller's session for a short read-only one as the target. The
   * operator's real token is parked in a cookie so "stop" can restore it.
   */
  @Post(':userId/impersonate')
  @HttpCode(200)
  @WriteEndpoint(10)
  @RequirePermission('users:impersonate')
  async impersonate(
    @CurrentAccess() access: Access,
    @Param('userId') userId: string,
    @Body() dto: ImpersonateDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const minutes = dto.minutes ?? 30;
    const session = await this.users.impersonate(access, actorFrom(req), userId, dto.reason, minutes);
    this.sessions.setReturnCookie(res, req.sessionToken as string);
    this.sessions.setCookie(res, { token: session.token, expiresAt: session.expiresAt, remember: false });
    return { expiresAt: session.expiresAt };
  }
}
