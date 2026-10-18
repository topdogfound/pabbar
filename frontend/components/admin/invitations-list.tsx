"use client";

import { useState } from "react";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { LocalTime } from "@/components/settings/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { adminApi, type Invitation } from "@/lib/admin-api";
import { useCan } from "./admin-context";
import { ErrorNote } from "./display";
import { useCursorList } from "./use-cursor-list";

export function InvitationsList({
  scope,
  initial,
  refreshKey,
}: {
  scope: string;
  initial: { invitations: Invitation[]; nextCursor: string | null };
  /** Bump to refetch after new invitations are sent. */
  refreshKey: number;
}) {
  const canInvite = useCan("users:invite");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useCursorList<Invitation, { refreshKey: number }>({
    initial: { items: initial.invitations, nextCursor: initial.nextCursor },
    filters: { refreshKey },
    load: async (_f, cursor) => {
      const r = await adminApi.invitations(scope, cursor);
      return { items: r.invitations, nextCursor: r.nextCursor };
    },
  });

  async function act(inv: Invitation, kind: "resend" | "revoke") {
    setBusy(inv.id);
    try {
      if (kind === "resend") {
        await adminApi.resendInvitation(scope, inv.id);
        toast.add({ type: "success", title: `Invitation re-sent to ${inv.email}.` });
        list.reload();
      } else {
        await adminApi.revokeInvitation(scope, inv.id);
        list.setItems((prev) => prev.filter((i) => i.id !== inv.id));
        toast.add({ type: "success", title: "Invitation revoked." });
      }
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "That did not work." });
    } finally {
      setBusy(null);
    }
  }

  if (list.items.length === 0 && !list.loading) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EnvelopeSimpleIcon />
          </EmptyMedia>
          <EmptyTitle>No pending invitations</EmptyTitle>
          <EmptyDescription>Invitations you send show up here until they are accepted or revoked.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {list.error && <ErrorNote message={list.error} />}
      <ul className="divide-y rounded-lg border">
        {list.items.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{inv.email}</p>
              <p className="text-muted-foreground">
                {inv.role.name} · {inv.expired ? "expired" : "expires"} <LocalTime iso={inv.expiresAt} />
              </p>
            </div>
            {inv.expired && <Badge variant="destructive">Expired</Badge>}
            {canInvite && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busy === inv.id} onClick={() => void act(inv, "resend")}>
                  {busy === inv.id && <Spinner />}
                  Resend
                </Button>
                <Button variant="ghost" size="sm" disabled={busy === inv.id} onClick={() => void act(inv, "revoke")}>
                  Revoke
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {list.nextCursor && (
        <Button variant="outline" className="w-fit" disabled={list.loadingMore} onClick={() => void list.loadMore()}>
          {list.loadingMore && <Spinner />}
          Load more
        </Button>
      )}
    </div>
  );
}
