"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyIcon, LockSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { LocalTime } from "@/components/settings/local-time";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminRole } from "@/lib/admin-api";
import { useAdmin, useCan } from "./admin-context";
import { CreateRoleDialog } from "./create-role-dialog";
import { PageHeader } from "./display";

export function RolesView({ scope, roles }: { scope: string; roles: AdminRole[] }) {
  const { scope: ctx } = useAdmin();
  const canCreate = useCan("roles:create");
  const [open, setOpen] = useState(false);
  const system = roles.filter((r) => r.isSystem);
  const custom = roles.filter((r) => !r.isSystem);

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description={
          ctx.kind === "org"
            ? "A role is a named set of permissions. System roles are fixed; create custom roles for anything else."
            : "Platform roles for Pabbar staff. They are fixed and managed by the product."
        }
        actions={
          ctx.kind === "org" &&
          canCreate && (
            <Button onClick={() => setOpen(true)}>
              <PlusIcon /> Create role
            </Button>
          )
        }
      />
      <RoleTable scope={scope} title="System roles" roles={system} />
      {ctx.kind === "org" && (
        <RoleTable
          scope={scope}
          title="Custom roles"
          roles={custom}
          emptyText="No custom roles yet. Create one when the system roles do not fit."
        />
      )}
      {ctx.kind === "org" && <CreateRoleDialog scope={scope} roles={roles} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function RoleTable({
  scope,
  title,
  roles,
  emptyText,
}: {
  scope: string;
  title: string;
  roles: AdminRole[];
  emptyText?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {roles.length === 0 ? (
        <p className="rounded-lg border p-4 text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Members</TableHead>
                <TableHead className="pr-4">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-96 pl-4 whitespace-normal">
                    <Link
                      href={`/admin/${scope}/roles/${r.id}`}
                      className="flex items-start gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {r.isSystem ? (
                        <LockSimpleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="System role" />
                      ) : (
                        <KeyIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        <span className="block font-medium">{r.name}</span>
                        {r.description && <span className="block text-muted-foreground">{r.description}</span>}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.permissions.length}</TableCell>
                  <TableCell className="tabular-nums">{r.memberCount.toLocaleString("en-US")}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">
                    {r.isSystem ? "Built in" : <LocalTime iso={r.updatedAt} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
