"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await authApi.logout();
        router.replace("/login");
        router.refresh();
      }}
    >
      Log out
    </Button>
  );
}
