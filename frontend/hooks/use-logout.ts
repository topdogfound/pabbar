"use client";

import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";

export function useLogout() {
  const router = useRouter();
  return async () => {
    await authApi.logout();
    router.replace("/login");
    router.refresh();
  };
}
