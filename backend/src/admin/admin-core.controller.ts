import { Controller, Get, UseGuards } from '@nestjs/common';
import type { User } from '../generated/prisma/client.js';
import { CurrentUser } from '../auth/session/current-user.decorator.js';
import { SessionGuard } from '../auth/session/session.guard.js';
import type { Access } from '../rbac/access.js';
import { CurrentAccess, PermissionsGuard } from '../rbac/permissions.guard.js';
import { RbacService } from '../rbac/rbac.service.js';
import { AdminCoreService } from './admin-core.service.js';
import { ReadEndpoint } from './admin.decorators.js';

@Controller('admin')
export class AdminCoreController {
  constructor(
    private readonly rbac: RbacService,
    private readonly core: AdminCoreService,
  ) {}

  /** Which admin scopes the caller can open. Drives the nav and the scope switcher. */
  @Get('me')
  @ReadEndpoint()
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: User) {
    return this.rbac.summary(user.id);
  }

  /** Static permission catalog, for the role editor. Nothing tenant-specific. */
  @Get('catalog')
  @ReadEndpoint()
  @UseGuards(SessionGuard)
  catalog() {
    return this.core.catalog();
  }

  @Get(':scope/context')
  @ReadEndpoint()
  @UseGuards(SessionGuard, PermissionsGuard)
  context(@CurrentAccess() access: Access) {
    return this.core.context(access);
  }

  @Get(':scope/overview')
  @ReadEndpoint()
  @UseGuards(SessionGuard, PermissionsGuard)
  overview(@CurrentAccess() access: Access) {
    return this.core.overview(access);
  }
}
