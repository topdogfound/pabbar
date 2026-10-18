import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { NoAccess } from "@/components/admin/no-access";
import { RoleEditor } from "@/components/admin/role-editor";
import type { AdminRole, PermissionDef } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Role" };

export default async function RolePage({ params }: { params: Promise<{ scope: string; roleId: string }> }) {
  const { scope, roleId } = await params;
  const s = encodeURIComponent(scope);
  const [role, catalog, all] = await Promise.all([
    adminGet<{ role: AdminRole }>(`/admin/${s}/roles/${encodeURIComponent(roleId)}`),
    adminGet<{ permissions: PermissionDef[] }>("/admin/catalog"),
    adminGet<{ roles: AdminRole[] }>(`/admin/${s}/roles`),
  ]);
  if (!role.ok) return role.status === 403 ? <NoAccess permission="roles:read" /> : notFound();
  if (!catalog.ok) notFound();

  return (
    <>
      <Link
        href={`/admin/${scope}/roles`}
        className="flex w-fit items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeftIcon /> All roles
      </Link>
      {/* Remount on save so form state resets to what the server now holds. */}
      <RoleEditor
        key={role.data.role.updatedAt}
        scope={scope}
        role={role.data.role}
        catalog={catalog.data.permissions}
        allRoles={all.ok ? all.data.roles : []}
      />
    </>
  );
}
