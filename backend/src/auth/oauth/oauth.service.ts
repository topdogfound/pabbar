import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { UsersService } from '../../users/users.service.js';
import { OAUTH_PROVIDERS, type OAuthProvider } from './oauth-provider.js';

const STATE_COOKIE = 'pabbar_oauth';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProvider[],
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  enabledProviders() {
    return this.providers.filter((p) => p.isEnabled()).map((p) => p.id);
  }

  /** Redirects the browser to the provider. 404 if disabled via .env. */
  begin(providerId: string, res: Response) {
    const provider = this.get(providerId);
    const state = randomBytes(16).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    res.cookie(STATE_COOKIE, JSON.stringify({ provider: provider.id, state, codeVerifier }), {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60_000,
      path: '/',
    });
    res.redirect(
      provider.authorizeUrl({ redirectUri: this.redirectUri(provider.id), state, codeChallenge }),
    );
  }

  /** Validates the callback and returns the (found or created) user id. */
  async complete(providerId: string, req: Request, res: Response) {
    const provider = this.get(providerId);
    const raw = req.cookies?.[STATE_COOKIE] as string | undefined;
    res.clearCookie(STATE_COOKIE, { path: '/' });

    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) throw new OAuthError('access_denied');

    let saved: { provider: string; state: string; codeVerifier: string };
    try {
      saved = JSON.parse(raw ?? '');
    } catch {
      throw new OAuthError('invalid_state');
    }
    if (saved.provider !== provider.id || !state || !code || !safeEqual(saved.state, state)) {
      throw new OAuthError('invalid_state');
    }

    try {
      const profile = await provider.fetchProfile({
        code,
        redirectUri: this.redirectUri(provider.id),
        codeVerifier: saved.codeVerifier,
      });
      return await this.users.findOrCreateByVerifiedIdentity({
        provider: provider.id,
        providerUserId: profile.providerUserId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });
    } catch (err) {
      if (err instanceof ForbiddenException) throw new OAuthError('account_disabled');
      this.logger.warn(`OAuth ${provider.id} failed: ${(err as Error).message}`);
      throw new OAuthError('oauth_failed');
    }
  }

  private get(providerId: string) {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider || !provider.isEnabled()) throw new NotFoundException();
    return provider;
  }

  private redirectUri(providerId: string) {
    const base = this.config.getOrThrow<string>('API_PUBLIC_URL').replace(/\/$/, '');
    return `${base}/auth/oauth/${providerId}/callback`;
  }
}

/** Carries a safe, user-displayable error code back to the login page. */
export class OAuthError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
