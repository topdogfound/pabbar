import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getJson, postForm, type OAuthProfile, type OAuthProvider } from './oauth-provider.js';

@Injectable()
export class GithubProvider implements OAuthProvider {
  readonly id = 'github' as const;

  constructor(private readonly config: ConfigService) {}

  isEnabled() {
    return (
      this.config.get('AUTH_GITHUB_ENABLED') === 'true' &&
      !!this.config.get('GITHUB_CLIENT_ID') &&
      !!this.config.get('GITHUB_CLIENT_SECRET')
    );
  }

  authorizeUrl({ redirectUri, state, codeChallenge }: Parameters<OAuthProvider['authorizeUrl']>[0]) {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: this.config.getOrThrow('GITHUB_CLIENT_ID'),
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
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
    const token = await postForm<{ access_token?: string }>(
      'https://github.com/login/oauth/access_token',
      {
        client_id: this.config.getOrThrow('GITHUB_CLIENT_ID'),
        client_secret: this.config.getOrThrow('GITHUB_CLIENT_SECRET'),
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      },
    );
    if (!token.access_token) throw new Error('GitHub did not return an access token');

    const [user, emails] = await Promise.all([
      getJson<{ id: number; login: string; name?: string | null; avatar_url?: string }>(
        'https://api.github.com/user',
        token.access_token,
      ),
      getJson<{ email: string; primary: boolean; verified: boolean }[]>(
        'https://api.github.com/user/emails',
        token.access_token,
      ),
    ]);

    // The profile email can be unverified or hidden; only trust a verified primary.
    const primary = emails.find((e) => e.primary && e.verified);
    if (!primary) throw new Error('GitHub account has no verified primary email');

    return {
      providerUserId: String(user.id),
      email: primary.email,
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url,
    };
  }
}
