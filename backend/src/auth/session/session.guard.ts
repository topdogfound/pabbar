import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// The only writes an impersonation session may perform: leave it.
const IMPERSONATION_WRITE_ALLOWLIST = new Set(['/auth/impersonation/stop', '/auth/logout']);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const session = token ? await this.sessions.validate(token) : null;
    if (!session) throw new UnauthorizedException();

    // Impersonation is strictly read-only: an operator must not be able to
    // change the email, delete the account, or act as the user in any way.
    if (
      session.impersonatorId &&
      !READ_ONLY_METHODS.has(req.method) &&
      !IMPERSONATION_WRITE_ALLOWLIST.has(req.path)
    ) {
      throw new ForbiddenException('Read-only while impersonating.');
    }

    req.user = session.user;
    req.sessionToken = token;
    req.impersonatorId = session.impersonatorId ?? undefined;
    req.sessionExpiresAt = session.expiresAt;
    return true;
  }
}
