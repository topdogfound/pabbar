"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DotsThreeIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { adminApi, type AdminRole, type UserDetail } from "@/lib/admin-api";
import { useAdmin, useCan, useCanGrant } from "./admin-context";
import { PersonAvatar, RoleBadges, StatusBadge } from "./display";
import { ReasonDialog } from "./reason-dialog";
import { SessionsList } from "./sessions-list";

type Dialog = "suspend" | "restore" | "remove" | "signout" | "impersonate" | null;

const DURATIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
];

export function UserDetailView({
  scope,
  detail,
  roles,
  viewerId,
}: {
  scope: string;
  detail: UserDetail;
  roles: AdminRole[];
  viewerId: string;
}) {
  const router = useRouter();
  const { scope: ctx } = useAdmin();
  const can = { suspend: useCan("users:suspend"), remove: useCan("users:remove"), revoke: useCan("sessions:revoke"), impersonate: useCan("users:impersonate"), sessions: useCan("sessions:read") };
  const { user, grants, memberships } = detail;
  const self = user.id === viewerId;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [minutes, setMinutes] = useState("30");
  const name = user.name ?? user.email ?? "this user";

  const refresh = () => router.refresh();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} className="size-12" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{name}</h2>
              <StatusBadge status={user.status} />
              {self && <Badge variant="outline">You</Badge>}
            </div>
            {user.name && user.email && <p className="truncate text-muted-foreground">{user.email}</p>}
            <div className="mt-1.5">
              <RoleBadges roles={user.roles} max={6} />
            </div>
          </div>
        </div>

        {!self && (can.suspend || can.remove || can.revoke || can.impersonate) && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Actions <DotsThreeIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {can.impersonate && ctx.kind === "platform" && user.status === "ACTIVE" && (
                <DropdownMenuItem onClick={() => setDialog("impersonate")}>View as this user…</DropdownMenuItem>
              )}
              {can.revoke && <DropdownMenuItem onClick={() => setDialog("signout")}>Sign out everywhere…</DropdownMenuItem>}
              {can.suspend && (
                <DropdownMenuItem onClick={() => setDialog(user.status === "ACTIVE" ? "suspend" : "restore")}>
                  {user.status === "ACTIVE" ? "Suspend…" : "Restore access"}
                </DropdownMenuItem>
              )}
              {can.remove && ctx.kind === "org" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDialog("remove")}>
                    Remove from organization…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Tabs defaultValue="access">
        <TabsList variant="line">
          <TabsTrigger value="access">Roles &amp; access</TabsTrigger>
          {can.sessions && <TabsTrigger value="sessions">Sessions</TabsTrigger>}
          {memberships && <TabsTrigger value="orgs">Organizations</TabsTrigger>}
        </TabsList>

        <TabsContent value="access" className="flex flex-col gap-6 pt-4">
          <RoleAssigner scope={scope} userId={user.id} current={user.roles.map((r) => r.id)} roles={roles} self={self} onSaved={refresh} />
          <section className="flex flex-col gap-2">
            <div>
              <h3 className="text-sm font-medium">Effective permissions</h3>
              <p className="text-muted-foreground">
                What {self ? "you" : name} can do {ctx.kind === "org" ? `in ${ctx.name}` : "on the platform"}, and which role grants it.
              </p>
            </div>
            {grants.length === 0 ? (
              <p className="rounded-lg border p-4 text-muted-foreground">No permissions here. This person cannot open the admin console.</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Permission</TableHead>
                      <TableHead className="pr-4">Granted by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grants.map((g) => (
                      <TableRow key={g.permission}>
                        <TableCell className="pl-4">
                          <p className="font-medium">{g.label}</p>
                          <p className="font-mono text-muted-foreground">{g.permission}</p>
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex flex-wrap gap-1">
                            {g.via.map((v) => (
                              <Badge key={v} variant="outline">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </TabsContent>

        {can.sessions && (
          <TabsContent value="sessions" className="pt-4">
            <SessionsList scope={scope} userId={user.id} />
          </TabsContent>
        )}

        {memberships && (
          <TabsContent value="orgs" className="pt-4">
            {memberships.length === 0 ? (
              <p className="rounded-lg border p-4 text-muted-foreground">Not a member of any organization.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {memberships.map((m) => (
                  <li key={m.slug} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div>
                      <Link href={`/admin/${m.slug}/users/${user.id}`} className="font-medium underline-offset-4 hover:underline">
                        {m.name}
                      </Link>
                      <p className="text-muted-foreground">{m.roles.join(", ") || "No role"}</p>
                    </div>
                    <StatusBadge status={m.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED"} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        )}
      </Tabs>

      <ReasonDialog
        open={dialog === "suspend"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Suspend ${name}?`}
        description={
          ctx.kind === "org"
            ? "They lose access to this organization immediately. Their roles are kept, so restoring brings everything back."
            : "Their account is disabled and every session ends immediately. They cannot sign in anywhere until restored."
        }
        confirmLabel="Suspend"
        destructive
        onConfirm={async (reason) => {
          await adminApi.suspend(scope, user.id, reason);
          toast.add({ type: "success", title: `${name} suspended.` });
          refresh();
        }}
      />
      <ReasonDialog
        open={dialog === "restore"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Restore ${name}?`}
        description="Access returns exactly as it was before the suspension."
        confirmLabel="Restore"
        requireReason={false}
        onConfirm={async (reason) => {
          await adminApi.restore(scope, user.id, reason || undefined);
          toast.add({ type: "success", title: `${name} restored.` });
          refresh();
        }}
      />
      <ReasonDialog
        open={dialog === "remove"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Remove ${name} from ${ctx.name}?`}
        description="Their membership and roles here are deleted. They keep their account and any other organizations. To bring them back you must invite them again."
        confirmLabel="Remove"
        destructive
        onConfirm={async (reason) => {
          await adminApi.remove(scope, user.id, reason);
          toast.add({ type: "success", title: `${name} removed.` });
          router.replace(`/admin/${scope}/users`);
          refresh();
        }}
      />
      <ReasonDialog
        open={dialog === "signout"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Sign ${name} out everywhere?`}
        description="Every browser session of this person ends now. This applies across all their organizations."
        confirmLabel="Sign out"
        requireReason={false}
        onConfirm={async () => {
          const res = await adminApi.revokeUserSessions(scope, user.id);
          toast.add({ type: "success", title: `Ended ${res.revoked} session${res.revoked === 1 ? "" : "s"}.` });
          refresh();
        }}
      />
      <ReasonDialog
        open={dialog === "impersonate"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`View the product as ${name}?`}
        description="You will see exactly what they see. The session is read-only, ends on its own, and is recorded in the audit log under your name."
        confirmLabel="Start viewing"
        onConfirm={async (reason) => {
          await adminApi.impersonate(scope, user.id, reason, Number(minutes));
          // The response swapped the session cookie; refresh so every layout re-reads it.
          router.replace("/dashboard");
          router.refresh();
        }}
      >
        <Select value={minutes} onValueChange={(v) => setMinutes(v ?? "30")} items={DURATIONS}>
          <SelectTrigger aria-label="Duration" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                Ends after {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ReasonDialog>
    </>
  );
}

function RoleAssigner({
  scope,
  userId,
  current,
  roles,
  self,
  onSaved,
}: {
  scope: string;
  userId: string;
  current: string[];
  roles: AdminRole[];
  self: boolean;
  onSaved: () => void;
}) {
  const { scope: ctx } = useAdmin();
  const canAssign = useCan("roles:assign");
  const canGrant = useCanGrant();
  const [selected, setSelected] = useState(() => new Set(current));
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => selected.size !== current.length || current.some((id) => !selected.has(id)),
    [selected, current],
  );
  // An org member always keeps at least one role; "Member" means no access.
  const valid = ctx.kind === "platform" || selected.size > 0;
  const readOnly = !canAssign || self;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await adminApi.setRoles(scope, userId, [...selected]);
      toast.add({ type: "success", title: "Roles updated." });
      onSaved();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not update roles." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">Roles</h3>
        <p className="text-muted-foreground">
          {self
            ? "You cannot change your own roles. Ask another administrator."
            : !canAssign
              ? "You can view roles but not change them."
              : "You can only hand out roles whose permissions you hold yourself."}
        </p>
      </div>
      <ul className="divide-y rounded-lg border">
        {roles.map((r) => {
          const checked = selected.has(r.id);
          // Granting or revoking a role needs everything it carries.
          const locked = readOnly || !canGrant(r.permissions);
          return (
            <li key={r.id}>
              <label className={`flex items-start gap-3 p-3 ${locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
                <Checkbox
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={(v) => toggle(r.id, v === true)}
                  aria-label={r.name}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {r.name}
                    {r.isSystem && <LockSimpleIcon className="size-3 text-muted-foreground" aria-label="System role" />}
                  </span>
                  <span className="block text-muted-foreground">
                    {r.description ?? `${r.permissions.length} permissions`}
                    {!readOnly && !canGrant(r.permissions) && " · you do not hold all of its permissions"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {!readOnly && dirty && (
        <div className="flex items-center gap-2">
          <Button disabled={!valid || saving} onClick={() => void save()}>
            {saving && <Spinner />}
            Save roles
          </Button>
          <Button variant="ghost" disabled={saving} onClick={() => setSelected(new Set(current))}>
            Discard
          </Button>
          {!valid && <span className="text-muted-foreground">Pick at least one role.</span>}
        </div>
      )}
    </section>
  );
}
