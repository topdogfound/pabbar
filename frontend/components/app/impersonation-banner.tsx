"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authApi, type Impersonation, type PublicUser } from "@/lib/api";

/**
 * Always visible while a platform operator views the app as someone else. The
 * session is read-only and time-boxed; "Stop" restores the operator's own.
 */
export function ImpersonationBanner({ user, impersonation }: { user: PublicUser; impersonation: Impersonation }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function stop() {
    setPending(true);
    try {
      await authApi.stopImpersonation();
      // The response swapped the session cookie back; refresh so every layout re-reads it.
      router.replace("/admin/platform/users");
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not stop." });
      setPending(false);
    }
  }

  const until = new Date(impersonation.expiresAt).toLocaleTimeString(undefined, { timeStyle: "short" });
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-500/50 bg-popover p-2.5 pl-3.5 shadow-lg"
    >
      <EyeIcon className="size-4 shrink-0 text-amber-500" />
      <p className="min-w-0 truncate">
        Viewing as <strong>{user.name ?? user.email}</strong> · read-only · ends {until}
      </p>
      <Button size="sm" disabled={pending} onClick={() => void stop()}>
        {pending && <Spinner />}
        Stop
      </Button>
    </div>
  );
}
