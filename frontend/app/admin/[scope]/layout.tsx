import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AdminProvider } from "@/components/admin/admin-context";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { ScopeContext } from "@/lib/admin-api";
import { adminGet, getAdminSummary } from "@/lib/admin-server";
import { getSession } from "@/lib/session";

export default async function ScopeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  const [user, summary, context, cookieStore] = await Promise.all([
    getSession(),
    getAdminSummary(),
    adminGet<ScopeContext>(`/admin/${encodeURIComponent(scope)}/context`),
    cookies(),
  ]);
  // 404 covers "no such org" and "no access to it" alike.
  if (!user || !summary || !context.ok) notFound();

  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <AdminProvider context={context.data} summary={summary}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AdminSidebar user={user} />
        <SidebarInset>
          <AdminHeader />
          <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AdminProvider>
  );
}
