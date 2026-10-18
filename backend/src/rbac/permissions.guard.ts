import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Access } from './access.js';
import type { Permission } from './catalog.js';
import { RbacService } from './rbac.service.js';

const REQUIRE_PERMISSION = 'rbac:require';

/** Permissions the handler needs in the `:scope` of its route (all of them). */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSION, permissions);

/** The caller's resolved access in the request's scope. Needs PermissionsGuard. */
export const CurrentAccess = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request>().access!;
});

/**
 * Authorization for `/admin/:scope/...` routes. Runs after SessionGuard.
 *
 * Deny by default: no `admin:access` in the scope answers 404, so the existence
 * of another tenant's console is never revealed. Holding `admin:access` but not
 * the specific permission answers 403 naming what is missing. The API is the
 * authority; the UI only mirrors it.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    if (req.impersonatorId) {
      throw new ForbiddenException('The admin console is unavailable while impersonating.');
    }

    const scope = await this.rbac.resolveScope(String(req.params.scope ?? ''));
    if (!scope) throw new NotFoundException();

    const access: Access = await this.rbac.access(user.id, scope);
    if (!access.has('admin:access')) throw new NotFoundException();

    const needed =
      this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRE_PERMISSION, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const missing = needed.filter((p) => !access.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}.`);
    }

    req.access = access;
    return true;
  }
}
