import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { User } from '../../generated/prisma/client.js';
import { actorFrom } from '../../audit/actor.js';
import { CurrentUser } from '../../auth/session/current-user.decorator.js';
import { SessionGuard } from '../../auth/session/session.guard.js';
import type { Access } from '../../rbac/access.js';
import { CurrentAccess, PermissionsGuard, RequirePermission } from '../../rbac/permissions.guard.js';
import { ReadEndpoint, WriteEndpoint } from '../admin.decorators.js';
import { PageDto } from '../dto/common.dto.js';
import { CreateInvitationsDto } from '../dto/orgs.dto.js';
import { InvitationsService } from './invitations.service.js';

@Controller('admin/:scope/invitations')
@UseGuards(SessionGuard, PermissionsGuard)
export class AdminInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ReadEndpoint()
  @RequirePermission('users:read')
  list(@CurrentAccess() access: Access, @Query() q: PageDto) {
    return this.invitations.list(access, q);
  }

  @Post()
  @HttpCode(200)
  @WriteEndpoint(20)
  @RequirePermission('users:invite')
  create(@CurrentAccess() access: Access, @Body() dto: CreateInvitationsDto, @Req() req: Request) {
    return this.invitations.create(access, actorFrom(req), dto.emails, dto.roleId);
  }

  @Post(':id/resend')
  @HttpCode(204)
  @WriteEndpoint(20)
  @RequirePermission('users:invite')
  async resend(@CurrentAccess() access: Access, @Param('id') id: string, @Req() req: Request) {
    await this.invitations.resend(access, actorFrom(req), id);
  }

  @Delete(':id')
  @HttpCode(204)
  @WriteEndpoint()
  @RequirePermission('users:invite')
  async revoke(@CurrentAccess() access: Access, @Param('id') id: string, @Req() req: Request) {
    await this.invitations.revoke(access, actorFrom(req), id);
  }
}

/** The invitee's side. Not under /admin: the invitee has no admin access yet. */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  @Post(':token/accept')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  accept(@CurrentUser() user: User, @Param('token') token: string, @Req() req: Request) {
    return this.invitations.accept(user, actorFrom(req), token);
  }
}
