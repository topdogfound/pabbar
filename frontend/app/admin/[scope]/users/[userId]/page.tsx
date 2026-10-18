import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { NoAccess } from "@/components/admin/no-access";
import { UserDetailView } from "@/components/admin/user-detail";
import type { AdminRole, UserDetail } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ scope: string; userId: string }> }) {
  const { scope, userId } = await params;
  const s = encodeURIComponent(scope);
  const [detail, roles, viewer] = await Promise.all([
    adminGet<UserDetail>(`/admin/${s}/users/${encodeURIComponent(userId)}`),
    adminGet<{ roles: AdminRole[] }>(`/admin/${s}/roles`),
    getSession(),
  ]);
  if (!detail.ok) return detail.status === 403 ? <NoAccess permission="users:read" /> : notFound();

  return (
    <>
      <Link
        href={`/admin/${scope}/users`}
        className="flex w-fit items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeftIcon /> All users
      </Link>
      <UserDetailView
        scope={scope}
        detail={detail.data}
        roles={roles.ok ? roles.data.roles : []}
        viewerId={viewer?.id ?? ""}
      />
    </>
  );
}
