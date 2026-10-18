import Link from "next/link";
import { LocalTime } from "@/components/settings/local-time";
import type { AuditEvent } from "@/lib/admin-api";
import { describeEvent } from "./audit-format";

export function RecentActivity({ events, auditHref }: { events: AuditEvent[]; auditHref?: string }) {
  return (
    <section className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-medium">Recent activity</h3>
        {auditHref && (
          <Link href={auditHref} className="text-muted-foreground underline-offset-4 hover:underline">
            View audit log
          </Link>
        )}
      </div>
      {events.length === 0 ? (
        <p className="p-4 text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ul className="divide-y">
          {events.map((e) => {
            const d = describeEvent(e);
            return (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                <p className="min-w-0">
                  <span className="font-medium">{d.actor}</span> {d.verb}
                  {d.target && <span className="font-medium"> {d.target}</span>}
                  {e.impersonatorId && <span className="text-muted-foreground"> (while impersonating)</span>}
                </p>
                <span className="text-muted-foreground">
                  <LocalTime iso={e.at} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
