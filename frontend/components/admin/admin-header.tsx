"use client";

import { usePathname } from "next/navigation";
import { WarningIcon } from "@phosphor-icons/react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAdmin } from "./admin-context";

const TITLES: Record<string, string> = {
  users: "Users",
  roles: "Roles & permissions",
  audit: "Audit log",
  security: "Sessions & policies",
  organization: "Organization settings",
  orgs: "Organizations",
};

export function AdminHeader() {
  const pathname = usePathname();
  const { scope } = useAdmin();
  const section = pathname.split("/").filter(Boolean)[2];

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-xs font-medium">
          <span className="text-muted-foreground">{scope.name} / </span>
          {TITLES[section] ?? "Overview"}
        </h1>
      </header>
      {scope.status === "SUSPENDED" && (
        <p className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-destructive">
          <WarningIcon /> This organization is suspended. Its members cannot sign in to the console; only platform
          operators can see it.
        </p>
      )}
    </>
  );
}
