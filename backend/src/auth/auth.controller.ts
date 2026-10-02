import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { User } from '../generated/prisma/client.js';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto.js';
import { OAuthError, OAuthService } from './oauth/oauth.service.js';
import { OtpService } from './otp/otp.service.js';
import { CurrentUser } from './session/current-user.decorator.js';
import { SessionGuard } from './session/session.guard.js';
import { SESSION_COOKIE, SessionService } from './session/session.service.js';
import { UsersService } from '../users/users.service.js';

const toPublicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  avatarUrl: u.avatarUrl,
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly oauth: OAuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
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
    const { resendIn } = await this.otp.request('EMAIL', dto.destination, req.ip);
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
    const session = await this.sessions.create(user.id, {
      remember: dto.remember,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    this.sessions.setCookie(res, session);
    return { user: toPublicUser(user) };
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
  me(@CurrentUser() user: User) {
    return { user: toPublicUser(user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await this.sessions.revoke(token);
    this.sessions.clearCookie(res);
  }
}
