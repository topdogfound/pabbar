"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftIcon,
  BuildingsIcon,
  GearIcon,
  ScrollIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  UsersIcon,
  KeyIcon,
} from "@phosphor-icons/react";
import { NavUser } from "@/components/app/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { PublicUser } from "@/lib/api";
import { useAdmin } from "./admin-context";
import { ScopeSwitcher } from "./scope-switcher";

interface Item {
  title: string;
  href: string;
  icon: typeof UsersIcon;
  /** Shown when the viewer holds any of these. Empty = always. */
  any?: string[];
  exact?: boolean;
}

export function AdminSidebar({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const { scope, permissions } = useAdmin();
  const base = `/admin/${scope.slug}`;

  const groups: { label: string; items: Item[] }[] = [
    {
      label: "Overview",
      items: [{ title: "Overview", href: base, icon: SquaresFourIcon, exact: true }],
    },
    {
      label: "Access",
      items: [
        { title: "Users", href: `${base}/users`, icon: UsersIcon, any: ["users:read"] },
        { title: "Roles & permissions", href: `${base}/roles`, icon: KeyIcon, any: ["roles:read"] },
      ],
    },
    {
      label: "Security",
      items: [
        { title: "Audit log", href: `${base}/audit`, icon: ScrollIcon, any: ["audit:read"] },
        {
          title: scope.kind === "org" ? "Sessions & policies" : "Sessions",
          href: `${base}/security`,
          icon: ShieldCheckIcon,
          any: ["sessions:read", "security:read"],
        },
      ],
    },
    scope.kind === "platform"
      ? {
          label: "Platform",
          items: [{ title: "Organizations", href: `${base}/orgs`, icon: BuildingsIcon, any: ["orgs:read"] }],
        }
      : {
          label: "Organization",
          items: [{ title: "Settings", href: `${base}/organization`, icon: GearIcon, any: ["org:read"] }],
        },
  ];

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <ScopeSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => {
          const items = group.items.filter((i) => !i.any || i.any.some((p) => permissions.has(p)));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Back to app" render={<Link href="/dashboard" />}>
              <ArrowLeftIcon />
              <span>Back to app</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
