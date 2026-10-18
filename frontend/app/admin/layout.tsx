import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminSummary } from "@/lib/admin-server";
import { getAuth } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin | Pabbar" } };

/**
 * First gate: signed in, and allowed into at least one scope. Anyone else gets
 * a 404, so the console's existence is not revealed. Each scope re-checks in
 * its own layout, and the API checks again on every call.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  // An impersonated session is read-only and never reaches the console.
  if (auth.impersonation) notFound();
  if (!(await getAdminSummary())) notFound();
  return children;
}
