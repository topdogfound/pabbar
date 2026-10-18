import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard.js';
import { RbacService } from './rbac.service.js';

@Global()
@Module({
  providers: [RbacService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
