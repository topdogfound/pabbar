import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/admin/no-access";
import { RolesView } from "@/components/admin/roles-view";
import type { AdminRole } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const roles = await adminGet<{ roles: AdminRole[] }>(`/admin/${encodeURIComponent(scope)}/roles`);
  if (!roles.ok) return roles.status === 403 ? <NoAccess permission="roles:read" /> : notFound();
  return <RolesView scope={scope} roles={roles.data.roles} />;
}
