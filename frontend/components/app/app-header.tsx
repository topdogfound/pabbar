"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TITLES: Record<string, string> = {
  "/settings/profile": "Profile settings",
  "/settings/security": "Security settings",
  "/settings/appearance": "Appearance settings",
};

function titleFor(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname];
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <h1 className="text-xs font-medium">{titleFor(pathname)}</h1>
    </header>
  );
}
