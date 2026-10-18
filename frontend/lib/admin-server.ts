import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import type { AdminSummary } from "@/lib/admin-api";

const backend = () => process.env.BACKEND_URL ?? "http://localhost:4711";

export type AdminResult<T> = { ok: true; data: T } | { ok: false; status: number };

/** Server-side GET against the admin API with the visitor's session cookie. */
export async function adminGet<T>(path: string): Promise<AdminResult<T>> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, status: 401 };
  try {
    const res = await fetch(`${backend()}${path}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502 };
  }
}

/** Which admin scopes the viewer can open. Null when none (or on failure). */
export const getAdminSummary = cache(async (): Promise<AdminSummary | null> => {
  const res = await adminGet<AdminSummary>("/admin/me");
  if (!res.ok) return null;
  const s = res.data;
  return s.platform || s.orgs.length > 0 || s.canBrowseOrgs ? s : null;
});

/** Where the admin entry point should send the viewer first. */
export function defaultScope(s: AdminSummary) {
  return s.platform ? "platform" : (s.orgs[0]?.slug ?? null);
}
