"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { invitationsApi } from "@/lib/admin-api";

export function AcceptInvite({ token, signedInAs, email }: { token: string; signedInAs: string | null; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!signedInAs) {
    return (
      <Button className="w-full" nativeButton={false} render={<Link href={`/login?next=/invite/${encodeURIComponent(token)}`} />}>
        Sign in with {email} to accept
      </Button>
    );
  }

  async function accept() {
    setPending(true);
    try {
      await invitationsApi.accept(token);
      // Access changed: navigate, then refresh so every layout re-reads it.
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not accept the invitation." });
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button className="w-full" disabled={pending} onClick={() => void accept()}>
        {pending && <Spinner />}
        Accept invitation
      </Button>
      {signedInAs.toLowerCase() !== email.toLowerCase() && (
        <p className="text-center text-muted-foreground">
          You are signed in as {signedInAs}. This invitation is for {email}, so accepting will fail. Log out and sign in
          with that address.
        </p>
      )}
    </div>
  );
}
