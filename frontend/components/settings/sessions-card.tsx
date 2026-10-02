"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DesktopIcon, DeviceMobileIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authApi, type SessionInfo } from "@/lib/api";
import { parseUserAgent } from "@/lib/user-agent";
import { LocalTime } from "./local-time";

interface SessionsCardProps {
  initial: SessionInfo[];
  initialCursor: string | null;
}

export function SessionsCard({ initial, initialCursor }: SessionsCardProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const hasOthers = sessions.some((s) => !s.current) || cursor !== null;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await authApi.listSessions(cursor);
      setSessions((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...page.sessions.filter((s) => !seen.has(s.id))];
      });
      setCursor(page.nextCursor);
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not load sessions." });
    } finally {
      setLoadingMore(false);
    }
  }

  async function logoutOthers() {
    setLoggingOut(true);
    try {
      await authApi.logoutOthers();
      setSessions((prev) => prev.filter((s) => s.current));
      setCursor(null);
      toast.add({ type: "success", title: "Logged out of other browser sessions." });
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not log out other sessions." });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Browser sessions</h3>
        <p className="text-muted-foreground">
          Manage and log out your active sessions on other browsers and devices.
        </p>
      </div>

      <ul className="flex flex-col divide-y border">
        {sessions.length === 0 && <li className="p-4 text-muted-foreground">No active sessions.</li>}
        {sessions.map((s) => {
          const ua = parseUserAgent(s.userAgent);
          const Icon = ua.mobile ? DeviceMobileIcon : DesktopIcon;
          return (
            <li key={s.id} className="flex items-center gap-3 p-4">
              <Icon className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {ua.os} &middot; {ua.browser}
                </p>
                <p className="truncate text-muted-foreground">
                  {s.ip ?? "Unknown IP"} &middot;{" "}
                  {s.current ? (
                    <span className="font-medium text-green-600 dark:text-green-500">This device</span>
                  ) : (
                    <>
                      Last active <LocalTime iso={s.lastUsedAt} />
                    </>
                  )}
                </p>
              </div>
              {s.current && (
                <Badge variant="secondary" className="text-green-600 dark:text-green-500">
                  Current
                </Badge>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        {cursor && (
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore && <Spinner />}
            Load more
          </Button>
        )}
        <Button disabled={loggingOut || !hasOthers} onClick={() => void logoutOthers()}>
          {loggingOut && <Spinner />}
          Log out other browser sessions
        </Button>
      </div>
    </section>
  );
}
