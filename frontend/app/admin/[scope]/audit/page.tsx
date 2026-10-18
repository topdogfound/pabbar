import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuditView } from "@/components/admin/audit-view";
import { NoAccess } from "@/components/admin/no-access";
import type { AuditPage } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPageRoute({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const page = await adminGet<AuditPage>(`/admin/${encodeURIComponent(scope)}/audit?limit=25`);
  if (!page.ok) return page.status === 403 ? <NoAccess permission="audit:read" /> : notFound();
  return <AuditView scope={scope} initial={page.data} />;
}
