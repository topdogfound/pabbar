import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AdminPolicy } from './admin-policy.service.js';
import { AdminCoreController } from './admin-core.controller.js';
import { AdminCoreService } from './admin-core.service.js';
import { AdminAuditController } from './audit/admin-audit.controller.js';
import { AdminInvitationsController, InvitationsController } from './invitations/invitations.controller.js';
import { InvitationsService } from './invitations/invitations.service.js';
import { AdminOrgsController } from './orgs/admin-orgs.controller.js';
import { AdminOrgsService } from './orgs/admin-orgs.service.js';
import { AdminRolesController } from './roles/admin-roles.controller.js';
import { AdminRolesService } from './roles/admin-roles.service.js';
import { AdminSessionsController } from './sessions/admin-sessions.controller.js';
import { AdminSessionsService } from './sessions/admin-sessions.service.js';
import { AdminUsersController } from './users/admin-users.controller.js';
import { AdminUsersService } from './users/admin-users.service.js';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [
    AdminCoreController,
    AdminUsersController,
    AdminRolesController,
    AdminInvitationsController,
    InvitationsController,
    AdminOrgsController,
    AdminSessionsController,
    AdminAuditController,
  ],
  providers: [
    AdminPolicy,
    AdminCoreService,
    AdminUsersService,
    AdminRolesService,
    InvitationsService,
    AdminOrgsService,
    AdminSessionsService,
  ],
})
export class AdminModule {}
