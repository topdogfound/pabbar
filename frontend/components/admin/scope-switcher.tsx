"use client";

import Link from "next/link";
import { BuildingsIcon, CaretUpDownIcon, CheckIcon, GlobeHemisphereWestIcon } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useAdmin } from "./admin-context";

/**
 * Picks which tenant (or the platform) the console operates on. The list comes
 * from /admin/me, capped server-side; operators with many orgs browse the full
 * directory instead of an unbounded menu.
 */
export function ScopeSwitcher() {
  const { scope, summary } = useAdmin();
  const { isMobile } = useSidebar();
  const orgs = summary.orgs.some((o) => o.slug === scope.slug) || scope.kind === "platform"
    ? summary.orgs
    : [{ slug: scope.slug, name: scope.name }, ...summary.orgs];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              {scope.kind === "platform" ? <GlobeHemisphereWestIcon /> : <BuildingsIcon />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{scope.name}</span>
              <span className="block truncate text-muted-foreground">
                {scope.kind === "platform" ? "Platform console" : "Organization"}
              </span>
            </span>
            <CaretUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="start">
            {summary.platform && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Platform</DropdownMenuLabel>
                <DropdownMenuItem render={<Link href="/admin/platform" />}>
                  <GlobeHemisphereWestIcon /> Platform console
                  {scope.kind === "platform" && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}
            {orgs.length > 0 && (
              <>
                {summary.platform && <DropdownMenuSeparator />}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                  {orgs.map((o) => (
                    <DropdownMenuItem key={o.slug} render={<Link href={`/admin/${o.slug}`} />}>
                      <BuildingsIcon /> <span className="truncate">{o.name}</span>
                      {scope.slug === o.slug && <CheckIcon className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            {summary.canBrowseOrgs && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/admin/platform/orgs" />}>Browse all organizations…</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
