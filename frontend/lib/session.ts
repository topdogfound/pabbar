import { cache } from "react";
import { cookies } from "next/headers";
import type { PublicUser } from "@/lib/api";

export const SESSION_COOKIE = "pabbar_session";

/** Validates the session cookie against the backend. Null if signed out. */
export const getSession = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const backend = process.env.BACKEND_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${backend}/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()).user as PublicUser;
  } catch {
    return null;
  }
});
