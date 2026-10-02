export interface OAuthProfile {
  providerUserId: string;
  /** Always a provider-verified email. */
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface OAuthProvider {
  readonly id: 'google' | 'github';
  /** True only when the .env flag is on AND credentials are present. */
  isEnabled(): boolean;
  authorizeUrl(params: { redirectUri: string; state: string; codeChallenge: string }): string;
  fetchProfile(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<OAuthProfile>;
}

export const OAUTH_PROVIDERS = Symbol('OAUTH_PROVIDERS');

export async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`OAuth token request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'pabbar',
    },
  });
  if (!res.ok) throw new Error(`OAuth profile request failed (${res.status})`);
  return (await res.json()) as T;
}
