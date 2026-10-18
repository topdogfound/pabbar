"use client";

import { useState } from "react";
import { DesktopIcon, DeviceMobileIcon } from "@phosphor-icons/react";
import { LocalTime } from "@/components/settings/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { adminApi, type AdminSession } from "@/lib/admin-api";
import { parseUserAgent } from "@/lib/user-agent";
import { useCan } from "./admin-context";
import { ErrorNote, PersonCell } from "./display";
import { useCursorList } from "./use-cursor-list";

/** Live sessions in scope, newest first. Optionally narrowed to one user. */
export function SessionsList({
  scope,
  userId,
  initial,
}: {
  scope: string;
  userId?: string;
  initial?: { sessions: AdminSession[]; nextCursor: string | null };
}) {
  const canRevoke = useCan("sessions:revoke");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useCursorList<AdminSession, { userId?: string }>({
    initial: initial && { items: initial.sessions, nextCursor: initial.nextCursor },
    filters: { userId },
    load: async (f, cursor) => {
      const r = await adminApi.sessions(scope, f.userId, cursor);
      return { items: r.sessions, nextCursor: r.nextCursor };
    },
    debounceMs: 0,
  });

  async function revoke(s: AdminSession) {
    setBusy(s.id);
    try {
      await adminApi.revokeSession(scope, s.id);
      list.setItems((prev) => prev.filter((x) => x.id !== s.id));
      toast.add({ type: "success", title: "Session revoked. That browser is signed out." });
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not revoke the session." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {list.error && <ErrorNote message={list.error} />}
      {list.items.length === 0 && !list.loading ? (
        <p className="rounded-lg border p-4 text-muted-foreground">No active sessions.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.items.map((s) => {
            const ua = parseUserAgent(s.userAgent);
            const Icon = ua.mobile ? DeviceMobileIcon : DesktopIcon;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                {!userId && (
                  <div className="w-full min-w-0 sm:w-56">
                    <PersonCell name={s.user.name} email={s.user.email} avatarUrl={s.user.avatarUrl} />
                  </div>
                )}
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {ua.os} · {ua.browser}
                  </p>
                  <p className="truncate text-muted-foreground">
                    {s.ip ?? "Unknown IP"} · last active <LocalTime iso={s.lastUsedAt} />
                  </p>
                </div>
                {s.impersonated && <Badge variant="outline">Impersonation</Badge>}
                {canRevoke && (
                  <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => void revoke(s)}>
                    {busy === s.id && <Spinner />}
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list.loading && <Spinner className="text-muted-foreground" />}
      {list.nextCursor && (
        <Button variant="outline" className="w-fit" disabled={list.loadingMore} onClick={() => void list.loadMore()}>
          {list.loadingMore && <Spinner />}
          Load more
        </Button>
      )}
    </div>
  );
}
