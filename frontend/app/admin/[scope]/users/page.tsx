import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/admin/no-access";
import { UsersView } from "@/components/admin/users-view";
import type { AdminRole, AdminUser, Invitation } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ scope: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { scope } = await params;
  const { role } = await searchParams;
  const roleId = role && /^[\w-]{1,40}$/.test(role) ? role : undefined;
  const s = encodeURIComponent(scope);

  const [users, roles, invitations] = await Promise.all([
    adminGet<{ users: AdminUser[]; nextCursor: string | null }>(
      `/admin/${s}/users?limit=25${roleId ? `&roleId=${roleId}` : ""}`,
    ),
    adminGet<{ roles: AdminRole[] }>(`/admin/${s}/roles`),
    scope === "platform"
      ? null
      : adminGet<{ invitations: Invitation[]; nextCursor: string | null }>(`/admin/${s}/invitations?limit=25`),
  ]);
  if (!users.ok) return users.status === 403 ? <NoAccess permission="users:read" /> : notFound();

  return (
    <UsersView
      scope={scope}
      initialUsers={users.data}
      initialRoleId={roleId}
      roles={roles.ok ? roles.data.roles : []}
      initialInvitations={invitations?.ok ? invitations.data : null}
    />
  );
}
