import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ImpersonationBanner } from "@/components/app/impersonation-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getAdminSummary } from "@/lib/admin-server";
import { getAuth } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { user, impersonation } = auth;

  // The Administration link only shows for people who can open the console. The
  // summary is cached server-side, and an impersonated session never gets it.
  const [adminSummary, cookieStore] = await Promise.all([
    impersonation ? null : getAdminSummary(),
    cookies(),
  ]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} showAdmin={adminSummary !== null} />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
      {impersonation && <ImpersonationBanner user={user} impersonation={impersonation} />}
    </SidebarProvider>
  );
}
