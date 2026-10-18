import { cache } from "react";
import { cookies } from "next/headers";
import type { Impersonation, PublicUser, SessionsPage } from "@/lib/api";

export const SESSION_COOKIE = "pabbar_session";

export interface Auth {
  user: PublicUser;
  /** Set while a platform operator is viewing the app as `user`. */
  impersonation: Impersonation | null;
}

/** Validates the session cookie against the backend. Null if signed out. One fetch per request. */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const backend = process.env.BACKEND_URL ?? "http://localhost:4711";
  try {
    const res = await fetch(`${backend}/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { user: PublicUser; impersonation?: Impersonation };
    return { user: body.user, impersonation: body.impersonation ?? null };
  } catch {
    return null;
  }
});

/** The signed-in user. Null if signed out. */
export const getSession = cache(async (): Promise<PublicUser | null> => (await getAuth())?.user ?? null);

/** First page of the user's sessions (server-side). Null on failure. */
export const getSessions = cache(async (limit = 20): Promise<SessionsPage | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const backend = process.env.BACKEND_URL ?? "http://localhost:4711";
  try {
    const res = await fetch(`${backend}/auth/sessions?limit=${limit}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionsPage;
  } catch {
    return null;
  }
});
