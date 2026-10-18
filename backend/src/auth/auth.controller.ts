import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { User } from '../generated/prisma/client.js';
import { actorFrom } from '../audit/actor.js';
import { AuditService } from '../audit/audit.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto.js';
import {
  EmailChangeRequestDto,
  EmailChangeVerifyDto,
  ListSessionsDto,
  UpdateProfileDto,
} from './dto/profile.dto.js';
import { OAuthError, OAuthService } from './oauth/oauth.service.js';
import { OtpService } from './otp/otp.service.js';
import { CurrentUser } from './session/current-user.decorator.js';
import { SessionGuard } from './session/session.guard.js';
import { RETURN_COOKIE, SESSION_COOKIE, SessionService } from './session/session.service.js';
import { AVATAR_MAX_BYTES, processAvatar } from '../users/avatar.js';
import { UsersService } from '../users/users.service.js';

const MUTATION_LIMIT = { default: { limit: 20, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly oauth: OAuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  /** Tells the frontend which login methods to render. */
  @Get('config')
  getConfig() {
    const providers = this.oauth.enabledProviders();
    return {
      methods: {
        emailOtp: true,
        google: providers.includes('google'),
        github: providers.includes('github'),
        phoneOtp: false,
      },
    };
  }

  @Post('otp/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    const { resendIn } = await this.otp.request('EMAIL', dto.destination, { ip: req.ip });
    // Same response whether or not the account exists.
    return { sent: true, resendIn };
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { destination } = await this.otp.verify('EMAIL', dto.destination, dto.code);
    const user = await this.users.findOrCreateByVerifiedIdentity({
      provider: 'email',
      providerUserId: destination,
      email: destination,
    });
    await this.rbac.grantBootstrapAdmin(user);
    const session = await this.sessions.create(user.id, {
      remember: dto.remember,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    this.sessions.setCookie(res, session);
    return { user: this.users.toPublicUser(user) };
  }

  @Get('oauth/:provider')
  startOAuth(@Param('provider') provider: string, @Res() res: Response) {
    this.oauth.begin(provider, res);
  }

  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontend = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
    try {
      const user = await this.oauth.complete(provider, req, res);
      await this.rbac.grantBootstrapAdmin(user);
      const session = await this.sessions.create(user.id, {
        remember: true,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
      this.sessions.setCookie(res, session);
      res.redirect(`${frontend}/`);
    } catch (err) {
      const code = err instanceof OAuthError ? err.code : 'oauth_failed';
      res.redirect(`${frontend}/login?error=${encodeURIComponent(code)}`);
    }
  }

  // Called server-side by Next for every page render, so all users share the
  // Next server's IP. SessionGuard already gates it; throttling adds nothing.
  @Get('me')
  @SkipThrottle()
  @UseGuards(SessionGuard)
  async me(@CurrentUser() user: User, @Req() req: Request) {
    const publicUser = this.users.toPublicUser(user);
    if (!req.impersonatorId) return { user: publicUser };
    // Only an impersonation session pays for this lookup.
    const by = await this.users.findById(req.impersonatorId);
    return {
      user: publicUser,
      impersonation: {
        by: { id: req.impersonatorId, name: by?.name ?? null, email: by?.email ?? null },
        expiresAt: req.sessionExpiresAt,
      },
    };
  }

  @Patch('me')
  @Throttle(MUTATION_LIMIT)
  @UseGuards(SessionGuard)
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    const updated = await this.users.updateProfile(user.id, dto);
    await this.sessions.invalidateUser(user.id);
    return { user: this.users.toPublicUser(updated) };
  }

  @Post('me/avatar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  async uploadAvatar(@CurrentUser() user: User, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Missing file.');
    const image = await processAvatar(file);
    const updated = await this.users.setAvatar(user, image);
    await this.sessions.invalidateUser(user.id);
    return { user: this.users.toPublicUser(updated) };
  }

  @Delete('me/avatar')
  @Throttle(MUTATION_LIMIT)
  @UseGuards(SessionGuard)
  async removeAvatar(@CurrentUser() user: User) {
    const updated = await this.users.removeAvatar(user);
    await this.sessions.invalidateUser(user.id);
    return { user: this.users.toPublicUser(updated) };
  }

  @Post('me/email/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  async requestEmailChange(
    @CurrentUser() user: User,
    @Body() dto: EmailChangeRequestDto,
    @Req() req: Request,
  ) {
    if (await this.users.isEmailTaken(dto.email, user.id)) {
      throw new ConflictException('That email is already in use.');
    }
    if (user.email === dto.email) {
      throw new ConflictException('That is already your email.');
    }
    const { resendIn } = await this.otp.request('EMAIL', dto.email, {
      scope: { purpose: 'EMAIL_CHANGE', userId: user.id },
      ip: req.ip,
    });
    return { sent: true, resendIn };
  }

  @Post('me/email/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  async verifyEmailChange(@CurrentUser() user: User, @Body() dto: EmailChangeVerifyDto) {
    const { destination } = await this.otp.verify('EMAIL', dto.email, dto.code, {
      purpose: 'EMAIL_CHANGE',
      userId: user.id,
    });
    if (await this.users.isEmailTaken(destination, user.id)) {
      throw new ConflictException('That email is already in use.');
    }
    const updated = await this.users.changeEmail(user.id, destination);
    await this.sessions.invalidateUser(user.id);
    return { user: this.users.toPublicUser(updated) };
  }

  @Delete('me')
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  async deleteMe(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response) {
    await this.users.deleteAccount(user);
    await this.sessions.invalidateUser(user.id);
    this.sessions.clearCookie(res);
  }

  // Also fetched server-side by Next (shared IP), like /me. Read-only, gated by
  // SessionGuard and paginated, so per-IP throttling only causes false lockouts.
  @Get('sessions')
  @SkipThrottle()
  @UseGuards(SessionGuard)
  list(@CurrentUser() user: User, @Query() q: ListSessionsDto, @Req() req: Request) {
    return this.sessions.list(user.id, req.sessionToken as string, q);
  }

  @Delete('sessions/others')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  async revokeOthers(@CurrentUser() user: User, @Req() req: Request) {
    await this.sessions.revokeOthers(user.id, req.sessionToken as string);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await this.sessions.revoke(token);
    this.sessions.clearCookie(res);
    this.sessions.clearReturnCookie(res);
  }

  /** Ends an impersonation and puts the operator back in their own session. */
  @Post('impersonation/stop')
  @HttpCode(204)
  @Throttle(MUTATION_LIMIT)
  @UseGuards(SessionGuard)
  async stopImpersonation(@CurrentUser() user: User, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const operatorId = req.impersonatorId;
    if (!operatorId) throw new BadRequestException('Not impersonating.');
    const operator = await this.users.findById(operatorId);
    await this.sessions.revoke(req.sessionToken as string);
    await this.audit.record(this.audit.db, { ...actorFrom(req), id: operatorId, email: operator?.email ?? null, name: operator?.name ?? null, impersonatorId: null }, {
      action: 'user.impersonate.stop',
      targetType: 'user',
      targetId: user.id,
      targetLabel: user.email ?? user.name,
    });

    // Restore the operator's own session only if the parked token is really theirs.
    const parked = req.cookies?.[RETURN_COOKIE] as string | undefined;
    const original = parked ? await this.sessions.validate(parked) : null;
    if (original && original.userId === operatorId && !original.impersonatorId) {
      this.sessions.setCookie(res, { token: parked as string, expiresAt: original.expiresAt, remember: true });
    } else {
      this.sessions.clearCookie(res);
    }
    this.sessions.clearReturnCookie(res);
  }
}
