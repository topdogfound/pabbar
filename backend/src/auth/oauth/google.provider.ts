import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getJson, postForm, type OAuthProfile, type OAuthProvider } from './oauth-provider.js';

@Injectable()
export class GoogleProvider implements OAuthProvider {
  readonly id = 'google' as const;

  constructor(private readonly config: ConfigService) {}

  isEnabled() {
    return (
      this.config.get('AUTH_GOOGLE_ENABLED') === 'true' &&
      !!this.config.get('GOOGLE_CLIENT_ID') &&
      !!this.config.get('GOOGLE_CLIENT_SECRET')
    );
  }

  authorizeUrl({ redirectUri, state, codeChallenge }: Parameters<OAuthProvider['authorizeUrl']>[0]) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async fetchProfile({
    code,
    redirectUri,
    codeVerifier,
  }: Parameters<OAuthProvider['fetchProfile']>[0]): Promise<OAuthProfile> {
    const token = await postForm<{ access_token: string }>('https://oauth2.googleapis.com/token', {
      client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'),
      client_secret: this.config.getOrThrow('GOOGLE_CLIENT_SECRET'),
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
    const info = await getJson<{
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    }>('https://openidconnect.googleapis.com/v1/userinfo', token.access_token);

    if (!info.email || !info.email_verified) {
      throw new Error('Google account has no verified email');
    }
    return {
      providerUserId: info.sub,
      email: info.email,
      name: info.name,
      avatarUrl: info.picture,
    };
  }
}
