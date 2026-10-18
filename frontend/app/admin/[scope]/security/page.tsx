import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/admin/no-access";
import { SecurityView } from "@/components/admin/security-view";
import type { AdminSession, ScopeContext, SecurityPolicy } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Sessions & policies" };

export default async function SecurityPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const s = encodeURIComponent(scope);
  const [context, policy, sessions] = await Promise.all([
    adminGet<ScopeContext>(`/admin/${s}/context`),
    scope === "platform" ? null : adminGet<{ policy: SecurityPolicy }>(`/admin/${s}/security`),
    adminGet<{ sessions: AdminSession[]; nextCursor: string | null }>(`/admin/${s}/sessions?limit=25`),
  ]);
  if (!context.ok) notFound();
  if (!policy?.ok && !sessions.ok) {
    return <NoAccess permission={scope === "platform" ? "sessions:read" : "security:read"} />;
  }
  return <SecurityView scope={scope} policy={policy?.ok ? policy.data.policy : null} sessions={sessions.ok ? sessions.data : null} />;
}
