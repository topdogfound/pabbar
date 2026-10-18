"use client";

import Link from "next/link";
import { useState } from "react";
import { MagnifyingGlassIcon, PlusIcon, UsersIcon } from "@phosphor-icons/react";
import { LocalTime } from "@/components/settings/local-time";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adminApi,
  type AdminRole,
  type AdminUser,
  type Invitation,
  type UserFilters,
} from "@/lib/admin-api";
import { useAdmin, useCan } from "./admin-context";
import { ErrorNote, PageHeader, PersonCell, RoleBadges, StatusBadge } from "./display";
import { InvitationsList } from "./invitations-list";
import { InviteDialog } from "./invite-dialog";
import { useCursorList } from "./use-cursor-list";

const STATUS_ITEMS = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
];

export function UsersView({
  scope,
  initialUsers,
  initialRoleId,
  roles,
  initialInvitations,
}: {
  scope: string;
  initialUsers: { users: AdminUser[]; nextCursor: string | null };
  initialRoleId?: string;
  roles: AdminRole[];
  /** Org scope only; null if the viewer cannot see invitations. */
  initialInvitations: { invitations: Invitation[]; nextCursor: string | null } | null;
}) {
  const { scope: ctx } = useAdmin();
  const canInvite = useCan("users:invite");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitesKey, setInvitesKey] = useState(0);

  const header = (
    <PageHeader
      title="Users"
      description={
        ctx.kind === "platform"
          ? "Everyone with an account on the platform."
          : `People in ${ctx.name} and the roles they hold.`
      }
      actions={
        ctx.kind === "org" &&
        canInvite && (
          <Button onClick={() => setInviteOpen(true)}>
            <PlusIcon /> Invite people
          </Button>
        )
      }
    />
  );

  const table = <UsersTable scope={scope} initial={initialUsers} initialRoleId={initialRoleId} roles={roles} />;

  return (
    <>
      {header}
      {initialInvitations ? (
        <Tabs defaultValue="members">
          <TabsList variant="line">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          </TabsList>
          <TabsContent value="members" className="pt-3">
            {table}
          </TabsContent>
          <TabsContent value="invitations" className="pt-3">
            <InvitationsList scope={scope} initial={initialInvitations} refreshKey={invitesKey} />
          </TabsContent>
        </Tabs>
      ) : (
        table
      )}
      {ctx.kind === "org" && (
        <InviteDialog
          scope={scope}
          roles={roles}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onDone={() => setInvitesKey((k) => k + 1)}
        />
      )}
    </>
  );
}

function UsersTable({
  scope,
  initial,
  initialRoleId,
  roles,
}: {
  scope: string;
  initial: { users: AdminUser[]; nextCursor: string | null };
  initialRoleId?: string;
  roles: AdminRole[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [roleId, setRoleId] = useState(initialRoleId ?? "all");

  const list = useCursorList<AdminUser, UserFilters>({
    initial: { items: initial.users, nextCursor: initial.nextCursor },
    filters: {
      q: q.trim() || undefined,
      status: status === "all" ? undefined : (status as "ACTIVE" | "SUSPENDED"),
      roleId: roleId === "all" ? undefined : roleId,
    },
    load: async (f, cursor) => {
      const r = await adminApi.users(scope, f, cursor);
      return { items: r.users, nextCursor: r.nextCursor };
    },
  });

  const roleItems = [{ value: "all", label: "All roles" }, ...roles.map((r) => ({ value: r.id, label: r.name }))];
  const filtered = q.trim() !== "" || status !== "all" || roleId !== "all";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search users"
            placeholder="Search name or email"
            className="pl-8"
            value={q}
            maxLength={64}
            onChange={(e) => setQ(e.target.value)}
          />
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
        {roles.length > 0 && (
          <Select value={roleId} onValueChange={(v) => setRoleId(v ?? "all")} items={roleItems}>
            <SelectTrigger aria-label="Filter by role" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {list.loading && <Spinner className="text-muted-foreground" />}
      </div>

      {list.error && <ErrorNote message={list.error} />}

      {list.items.length === 0 && !list.loading ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "No users match" : "No users yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered ? "Try a different search or clear the filters." : "People you invite will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={list.loading ? "rounded-lg border opacity-60 transition-opacity" : "rounded-lg border"}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Last active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="max-w-72 pl-4">
                    <Link href={`/admin/${scope}/users/${u.id}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <PersonCell name={u.name} email={u.email} avatarUrl={u.avatarUrl} />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <RoleBadges roles={u.roles} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={u.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-muted-foreground">
                    {u.lastActiveAt ? <LocalTime iso={u.lastActiveAt} /> : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center gap-3">
        {list.nextCursor && (
          <Button variant="outline" disabled={list.loadingMore} onClick={() => void list.loadMore()}>
            {list.loadingMore && <Spinner />}
            Load more
          </Button>
        )}
        <span className="text-muted-foreground">
          {list.items.length} shown{list.nextCursor ? ", more available" : ""}
        </span>
      </div>
    </div>
  );
}
