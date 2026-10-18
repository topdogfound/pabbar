"use client";

import Link from "next/link";
import { useState } from "react";
import { BuildingsIcon, DotsThreeIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";
import { LocalTime } from "@/components/settings/local-time";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { adminApi, type OrgRow } from "@/lib/admin-api";
import { useCan } from "./admin-context";
import { ErrorNote, PageHeader, StatusBadge } from "./display";
import { ReasonDialog } from "./reason-dialog";
import { useCursorList } from "./use-cursor-list";

const STATUS_ITEMS = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function OrgsView({ initial }: { initial: { orgs: OrgRow[]; nextCursor: string | null } }) {
  const canCreate = useCan("orgs:create");
  const canSuspend = useCan("orgs:suspend");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [target, setTarget] = useState<OrgRow | null>(null);

  const list = useCursorList<OrgRow, { q?: string; status?: "ACTIVE" | "SUSPENDED" }>({
    initial: { items: initial.orgs, nextCursor: initial.nextCursor },
    filters: { q: q.trim() || undefined, status: status === "all" ? undefined : (status as "ACTIVE" | "SUSPENDED") },
    load: async (f, cursor) => {
      const r = await adminApi.orgs(f, cursor);
      return { items: r.orgs, nextCursor: r.nextCursor };
    },
  });

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every tenant on the platform."
        actions={
          canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon /> Create organization
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search organizations" className="pl-8" placeholder="Search name or slug" value={q} maxLength={64} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "all")} items={STATUS_ITEMS}>
          <SelectTrigger aria-label="Filter by status" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {list.loading && <Spinner className="text-muted-foreground" />}
      </div>

      {list.error && <ErrorNote message={list.error} />}

      {list.items.length === 0 && !list.loading ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BuildingsIcon />
            </EmptyMedia>
            <EmptyTitle>No organizations found</EmptyTitle>
            <EmptyDescription>Create the first one, or change the filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={list.loading ? "rounded-lg border opacity-60 transition-opacity" : "rounded-lg border"}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Organization</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4">
                    <Link href={`/admin/${o.slug}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <span className="block font-medium">{o.name}</span>
                      <span className="block font-mono text-muted-foreground">{o.slug}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{o.memberCount.toLocaleString("en-US")}</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <LocalTime iso={o.createdAt} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${o.name}`} />}>
                        <DotsThreeIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/admin/${o.slug}`} />}>Open console</DropdownMenuItem>
                        {canSuspend && (
                          <DropdownMenuItem onClick={() => setTarget(o)}>
                            {o.status === "ACTIVE" ? "Suspend…" : "Restore…"}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
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

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={list.reload} />

      <ReasonDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.status === "ACTIVE" ? `Suspend ${target?.name}?` : `Restore ${target?.name}?`}
        description={
          target?.status === "ACTIVE"
            ? "Members immediately lose access to this organization's admin console. Nothing is deleted."
            : "Members get their access back exactly as it was."
        }
        confirmLabel={target?.status === "ACTIVE" ? "Suspend" : "Restore"}
        destructive={target?.status === "ACTIVE"}
        onConfirm={async (reason) => {
          if (!target) return;
          await adminApi.setOrgStatus(target.id, target.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE", reason);
          toast.add({ type: "success", title: `${target.name} ${target.status === "ACTIVE" ? "suspended" : "restored"}.` });
          list.reload();
        }}
      />
    </>
  );
}

function CreateOrgDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [owner, setOwner] = useState("");
  const [pending, setPending] = useState(false);

  const valid = name.trim().length >= 2 && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(owner.trim());

  async function submit() {
    setPending(true);
    try {
      await adminApi.createOrg({ name: name.trim(), slug, ownerEmail: owner.trim().toLowerCase() });
      toast.add({ type: "success", title: `${name.trim()} created.` });
      onOpenChange(false);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setOwner("");
      onCreated();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not create the organization." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an organization</DialogTitle>
          <DialogDescription>The owner gets full control. If they have no account yet, they are invited by email.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="o-name">Name</FieldLabel>
          <Input
            id="o-name"
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="o-slug">URL slug</FieldLabel>
          <Input
            id="o-slug"
            className="font-mono"
            value={slug}
            maxLength={40}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <FieldDescription>3–40 characters: lowercase letters, digits and hyphens. Cannot be changed later.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="o-owner">Owner email</FieldLabel>
          <Input id="o-owner" type="email" value={owner} maxLength={254} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || pending} onClick={() => void submit()}>
            {pending && <Spinner />}
            Create organization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
