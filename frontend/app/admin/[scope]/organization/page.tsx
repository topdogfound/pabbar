import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/admin/no-access";
import { OrgSettingsForm } from "@/components/admin/org-settings-form";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrganizationPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (scope === "platform") notFound();
  const res = await adminGet<{ org: { slug: string; name: string; status: string; createdAt: string } }>(
    `/admin/${encodeURIComponent(scope)}/organization`,
  );
  if (!res.ok) return res.status === 403 ? <NoAccess permission="org:read" /> : notFound();
  return <OrgSettingsForm key={res.data.org.name} scope={scope} org={res.data.org} />;
}
