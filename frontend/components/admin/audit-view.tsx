"use client";

import { useState } from "react";
import { DownloadSimpleIcon, ScrollIcon } from "@phosphor-icons/react";
import { LocalTime } from "@/components/settings/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, type AuditEvent, type AuditFilters, type AuditPage } from "@/lib/admin-api";
import { parseUserAgent } from "@/lib/user-agent";
import { useAdmin, useCan } from "./admin-context";
import { ACTION_GROUPS, describeEvent } from "./audit-format";
import { ErrorNote, PageHeader } from "./display";
import { useCursorList } from "./use-cursor-list";

type Orgs = AuditPage["orgs"];

const startOfDay = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

export function AuditView({ scope, initial }: { scope: string; initial: AuditPage }) {
  const { scope: ctx } = useAdmin();
  const canExport = useCan("audit:export");
  const [group, setGroup] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [orgs, setOrgs] = useState<Orgs>(initial.orgs);
  const [open, setOpen] = useState<AuditEvent | null>(null);

  const filters: AuditFilters = {
    action: group === "all" ? undefined : group,
    from: from ? startOfDay(from) : undefined,
    to: to ? endOfDay(to) : undefined,
    orgId: ctx.kind === "platform" && orgFilter === "none" ? "none" : undefined,
  };

  const list = useCursorList<AuditEvent, AuditFilters>({
    initial: { items: initial.events, nextCursor: initial.nextCursor },
    filters,
    load: async (f, cursor) => {
      const page = await adminApi.audit(scope, f, cursor);
      setOrgs((prev) => ({ ...prev, ...page.orgs }));
      return { items: page.events, nextCursor: page.nextCursor };
    },
    debounceMs: 0,
  });

  const groupItems = ACTION_GROUPS;
  const orgItems = [
    { value: "all", label: "All events" },
    { value: "none", label: "Platform-level only" },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="An append-only record of administrative actions. Entries cannot be edited or deleted."
        actions={
          canExport && (
            <Button variant="outline" nativeButton={false} render={<a href={adminApi.auditExportUrl(scope, filters)} download />}>
              <DownloadSimpleIcon /> Export CSV
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={group} onValueChange={(v) => setGroup(v ?? "all")} items={groupItems}>
          <SelectTrigger aria-label="Filter by action" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupItems.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ctx.kind === "platform" && (
          <Select value={orgFilter} onValueChange={(v) => setOrgFilter(v ?? "all")} items={orgItems}>
            <SelectTrigger aria-label="Filter by scope" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orgItems.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-1.5 text-muted-foreground">
          From
          <Input type="date" className="w-36" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          To
          <Input type="date" className="w-36" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(group !== "all" || from || to || orgFilter !== "all") && (
          <Button
            variant="ghost"
            onClick={() => {
              setGroup("all");
              setFrom("");
              setTo("");
              setOrgFilter("all");
            }}
          >
            Clear
          </Button>
        )}
        {list.loading && <Spinner className="text-muted-foreground" />}
      </div>

      {list.error && <ErrorNote message={list.error} />}

      {list.items.length === 0 && !list.loading ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollIcon />
            </EmptyMedia>
            <EmptyTitle>No events</EmptyTitle>
            <EmptyDescription>Nothing matches these filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={list.loading ? "rounded-lg border opacity-60 transition-opacity" : "rounded-lg border"}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>What happened</TableHead>
                {ctx.kind === "platform" && <TableHead>Organization</TableHead>}
                <TableHead className="pr-4 text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((e) => {
                const d = describeEvent(e);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 text-muted-foreground">
                      <LocalTime iso={e.at} />
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <span className="font-medium">{d.actor}</span> {d.verb}
                      {d.target && <span className="font-medium"> {d.target}</span>}
                      {e.impersonatorId && (
                        <Badge variant="outline" className="ml-2">
                          impersonating
                        </Badge>
                      )}
                    </TableCell>
                    {ctx.kind === "platform" && (
                      <TableCell className="text-muted-foreground">
                        {e.orgId ? (orgs[e.orgId]?.name ?? "Deleted organization") : "Platform"}
                      </TableCell>
                    )}
                    <TableCell className="pr-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setOpen(e)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {list.nextCursor && (
        <Button variant="outline" className="w-fit" disabled={list.loadingMore} onClick={() => void list.loadMore()}>
          {list.loadingMore && <Spinner />}
          Load more
        </Button>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="sm:max-w-md">{open && <EventDetail event={open} orgs={orgs} />}</SheetContent>
      </Sheet>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 min-w-0 break-words">{children}</dd>
    </div>
  );
}

function EventDetail({ event: e, orgs }: { event: AuditEvent; orgs: Orgs }) {
  const d = describeEvent(e);
  const ua = e.userAgent ? parseUserAgent(e.userAgent) : null;
  const meta = e.metadata && typeof e.metadata === "object" ? (e.metadata as Record<string, unknown>) : null;
  const hasDiff = meta && ("before" in meta || "after" in meta);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono text-sm">{e.action}</SheetTitle>
        <SheetDescription>
          {d.actor} {d.verb}
          {d.target && ` ${d.target}`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <dl className="divide-y">
          <Row label="When">
            <LocalTime iso={e.at} /> <span className="text-muted-foreground">({e.at})</span>
          </Row>
          <Row label="Actor">
            {e.actor.name ?? "–"}
            <span className="block text-muted-foreground">{e.actor.email ?? "System"}</span>
          </Row>
          {e.impersonatorId && <Row label="Impersonating">Action taken while viewing as this user</Row>}
          {e.targetType && (
            <Row label="Target">
              {e.targetLabel ?? e.targetId}
              <span className="block text-muted-foreground">
                {e.targetType}
                {e.targetId ? ` · ${e.targetId}` : ""}
              </span>
            </Row>
          )}
          {e.orgId && <Row label="Organization">{orgs[e.orgId]?.name ?? e.orgId}</Row>}
          {e.reason && <Row label="Reason">{e.reason}</Row>}
          <Row label="IP address">{e.ip ?? "–"}</Row>
          <Row label="Device">{ua ? `${ua.os} · ${ua.browser}` : "–"}</Row>
          <Row label="Request">
            <code className="font-mono">{e.requestId ?? "–"}</code>
          </Row>
        </dl>

        {meta && (
          <div className="mt-4 flex flex-col gap-2">
            <h4 className="text-xs font-medium">Changes</h4>
            {hasDiff ? (
              <div className="grid grid-cols-2 gap-2">
                <DiffBlock label="Before" value={meta.before} tone="before" />
                <DiffBlock label="After" value={meta.after} tone="after" />
              </div>
            ) : (
              <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono">{JSON.stringify(meta, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function DiffBlock({ label, value, tone }: { label: string; value: unknown; tone: "before" | "after" }) {
  const text = Array.isArray(value) ? value.join("\n") : JSON.stringify(value, null, 2);
  return (
    <div className={`rounded-lg border p-2 ${tone === "before" ? "border-destructive/30 bg-destructive/5" : "border-green-600/30 bg-green-600/5"}`}>
      <p className="mb-1 text-muted-foreground">{label}</p>
      <pre className="font-mono break-words whitespace-pre-wrap">{text || "–"}</pre>
    </div>
  );
}
