export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: { resendIn?: number },
  ) {
    super(message);
  }
}

/** Browser-side fetch wrapper for the backend, proxied through /api. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    // FormData needs the browser to set the multipart boundary itself.
    headers:
      init.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init.headers },
  });

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body?.message)
      ? body.message[0]
      : (body?.message ?? "Something went wrong. Please try again.");
    throw new ApiError(message, res.status, body ?? undefined);
  }
  return body as T;
}

export interface AuthMethods {
  emailOtp: boolean;
  google: boolean;
  github: boolean;
  phoneOtp: boolean;
}

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
}

export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  current: boolean;
}

export interface SessionsPage {
  sessions: SessionInfo[];
  nextCursor: string | null;
}

export interface ProfileUpdate {
  name?: string;
  dateOfBirth?: string | null;
  gender?: Gender | null;
}

export const authApi = {
  config: () => api<{ methods: AuthMethods }>("/auth/config"),
  requestOtp: (destination: string) =>
    api<{ sent: true; resendIn: number }>("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ channel: "email", destination }),
    }),
  verifyOtp: (destination: string, code: string, remember: boolean) =>
    api<{ user: PublicUser }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ channel: "email", destination, code, remember }),
    }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  updateProfile: (data: ProfileUpdate) =>
    api<{ user: PublicUser }>("/auth/me", { method: "PATCH", body: JSON.stringify(data) }),
  uploadAvatar: (file: Blob) => {
    const form = new FormData();
    form.append("file", file, "avatar.webp");
    return api<{ user: PublicUser }>("/auth/me/avatar", { method: "POST", body: form });
  },
  removeAvatar: () => api<{ user: PublicUser }>("/auth/me/avatar", { method: "DELETE" }),
  requestEmailChange: (email: string) =>
    api<{ sent: true; resendIn: number }>("/auth/me/email/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  verifyEmailChange: (email: string, code: string) =>
    api<{ user: PublicUser }>("/auth/me/email/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),
  deleteAccount: () => api<void>("/auth/me", { method: "DELETE" }),
  listSessions: (cursor?: string | null, limit = 20) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set("cursor", cursor);
    return api<SessionsPage>(`/auth/sessions?${qs}`);
  },
  logoutOthers: () => api<void>("/auth/sessions/others", { method: "DELETE" }),
};
