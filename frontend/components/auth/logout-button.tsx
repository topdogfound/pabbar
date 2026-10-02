"use client";

import { Button } from "@/components/ui/button";
import { useLogout } from "@/hooks/use-logout";

export function LogoutButton() {
  const logout = useLogout();
  return (
    <Button variant="outline" onClick={logout}>
      Log out
    </Button>
  );
}
