"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authApi } from "@/lib/api";

export function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await authApi.deleteAccount();
      router.replace("/");
      router.refresh();
    } catch (err) {
      setPending(false);
      toast.add({
        type: "error",
        title: err instanceof Error ? err.message : "Could not delete your account.",
      });
    }
  }

  return (
    <section className="flex flex-col gap-3 border border-destructive/40 p-4">
      <div>
        <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
        <p className="text-muted-foreground">
          Permanently delete your account and all of its data. This cannot be undone.
        </p>
      </div>
      <AlertDialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <AlertDialogTrigger render={<Button variant="destructive" className="w-fit" />}>
          Delete account
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your profile, sessions and connected sign-in methods will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => void confirm()}>
              {pending && <Spinner />}
              Delete account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
