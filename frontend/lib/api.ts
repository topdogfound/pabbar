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
    headers: { "Content-Type": "application/json", ...init.headers },
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
};
