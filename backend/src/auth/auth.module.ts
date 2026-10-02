import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { GithubProvider } from './oauth/github.provider.js';
import { GoogleProvider } from './oauth/google.provider.js';
import { OAUTH_PROVIDERS } from './oauth/oauth-provider.js';
import { OAuthService } from './oauth/oauth.service.js';
import { EmailOtpSender, OTP_SENDERS } from './otp/otp-sender.js';
import { OtpService } from './otp/otp.service.js';
import { SessionGuard } from './session/session.guard.js';
import { SessionService } from './session/session.service.js';

@Module({
  imports: [MailModule, UsersModule],
  controllers: [AuthController],
  providers: [
    OtpService,
    SessionService,
    SessionGuard,
    OAuthService,
    GoogleProvider,
    GithubProvider,
    EmailOtpSender,
    // Add an SmsOtpSender here later for mobile OTP.
    { provide: OTP_SENDERS, useFactory: (email: EmailOtpSender) => [email], inject: [EmailOtpSender] },
    {
      provide: OAUTH_PROVIDERS,
      useFactory: (g: GoogleProvider, gh: GithubProvider) => [g, gh],
      inject: [GoogleProvider, GithubProvider],
    },
  ],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
