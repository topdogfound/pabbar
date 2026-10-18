import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/admin/no-access";
import { OrgsView } from "@/components/admin/orgs-view";
import type { OrgRow } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrgsPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (scope !== "platform") notFound();
  const res = await adminGet<{ orgs: OrgRow[]; nextCursor: string | null }>("/admin/platform/orgs?limit=25");
  if (!res.ok) return res.status === 403 ? <NoAccess permission="orgs:read" /> : notFound();
  return <OrgsView initial={res.data} />;
}
