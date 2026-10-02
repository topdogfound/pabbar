"use client";

import Link from "next/link";
import { CaretUpDownIcon, GearIcon, SignOutIcon } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useLogout } from "@/hooks/use-logout";
import type { PublicUser } from "@/lib/api";
import { UserAvatar, displayName } from "./user-avatar";

export function NavUser({ user }: { user: PublicUser }) {
  const { isMobile } = useSidebar();
  const logout = useLogout();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <UserAvatar user={user} />
            <span className="flex-1 truncate font-medium">{displayName(user)}</span>
            <CaretUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-48"
            side={isMobile ? "bottom" : "right"}
            align="end"
          >
            <DropdownMenuItem render={<Link href="/settings" />}>
              <GearIcon /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <SignOutIcon /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
