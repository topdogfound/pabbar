"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { InfoIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { adminApi, type AdminRole, type PermissionDef } from "@/lib/admin-api";
import { useAdmin, useCan, useCanGrant } from "./admin-context";
import { CreateRoleDialog } from "./create-role-dialog";
import { PageHeader } from "./display";
import { PermissionMatrix } from "./permission-matrix";
import { ReasonDialog } from "./reason-dialog";

export function RoleEditor({
  scope,
  role,
  catalog,
  allRoles,
}: {
  scope: string;
  role: AdminRole;
  catalog: PermissionDef[];
  allRoles: AdminRole[];
}) {
  const router = useRouter();
  const { scope: ctx } = useAdmin();
  const canUpdate = useCan("roles:update");
  const canDelete = useCan("roles:delete");
  const canCreate = useCan("roles:create");
  const canGrant = useCanGrant();

  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role.permissions));
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Editing a role edits everyone who holds it, so the API requires you to hold
  // everything it grants today. Mirror that instead of letting you hit a 403.
  const holdsAll = canGrant(role.permissions);
  const editable = !role.isSystem && canUpdate && holdsAll;

  const visible = useMemo(
    () => catalog.filter((p) => ctx.kind === "platform" || p.scopes.includes("org")),
    [catalog, ctx.kind],
  );
  const labels = useMemo(() => new Map(catalog.map((p) => [p.key, p.label])), [catalog]);

  const added = [...selected].filter((p) => !role.permissions.includes(p)).sort();
  const removed = role.permissions.filter((p) => !selected.has(p)).sort();
  const metaChanged = name.trim() !== role.name || description.trim() !== (role.description ?? "");
  const dirty = added.length > 0 || removed.length > 0 || metaChanged;
  const valid = name.trim().length >= 2;

  async function save() {
    setSaving(true);
    try {
      await adminApi.updateRole(scope, role.id, {
        name: name.trim(),
        description: description.trim(),
        permissions: [...selected],
      });
      toast.add({ type: "success", title: "Role saved. The change applies to everyone holding it, immediately." });
      setReview(false);
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not save the role." });
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setName(role.name);
    setDescription(role.description ?? "");
    setSelected(new Set(role.permissions));
  }

  return (
    <>
      <PageHeader
        title={role.name}
        description={role.description ?? undefined}
        actions={
          role.isSystem &&
          ctx.kind === "org" &&
          canCreate && (
            <Button variant="outline" onClick={() => setCloning(true)}>
              Clone to customize
            </Button>
          )
        }
      />

      {role.isSystem && (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
          <LockSimpleIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>System role.</strong> It is defined by the product and cannot be edited or deleted
            {ctx.kind === "org" ? "; clone it to make a version you control." : "."}
          </span>
        </p>
      )}
      {!role.isSystem && canUpdate && !holdsAll && (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            This role carries permissions you do not hold, so you can view it but not change it. Only someone who holds
            everything it grants can edit it.
          </span>
        </p>
      )}

      {!role.isSystem && (
        <div className="grid max-w-xl gap-4">
          <Field>
            <FieldLabel htmlFor="rn">Name</FieldLabel>
            <Input id="rn" value={name} maxLength={40} disabled={!editable} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rd">Description</FieldLabel>
            <Textarea id="rd" value={description} maxLength={200} disabled={!editable} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Permissions ({selected.size})</h3>
        <Link
          href={`/admin/${scope}/users?role=${role.id}`}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          {role.memberCount.toLocaleString("en-US")} {role.memberCount === 1 ? "person holds" : "people hold"} this role
        </Link>
      </div>
      <PermissionMatrix catalog={visible} selected={selected} onChange={setSelected} editable={editable} canGrant={canGrant} />

      {!role.isSystem && canDelete && holdsAll && (
        <section className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
          <div>
            <h3 className="text-sm font-medium text-destructive">Delete role</h3>
            <p className="text-muted-foreground">
              {role.memberCount > 0
                ? `${role.memberCount.toLocaleString("en-US")} ${role.memberCount === 1 ? "person holds" : "people hold"} this role. Move them to another role first.`
                : "Nobody holds this role, so it can be deleted. This cannot be undone."}
            </p>
          </div>
          <Button variant="destructive" className="w-fit" disabled={role.memberCount > 0} onClick={() => setDeleting(true)}>
            Delete role…
          </Button>
        </section>
      )}

      {editable && dirty && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-popover p-3 shadow-lg">
          <p className="flex-1">
            <strong>Unsaved changes</strong>
            <span className="text-muted-foreground">
              {" "}
              · {added.length > 0 && <span className="text-green-600 dark:text-green-500">+{added.length} added</span>}
              {added.length > 0 && removed.length > 0 && ", "}
              {removed.length > 0 && <span className="text-destructive">−{removed.length} removed</span>}
              {metaChanged && added.length + removed.length > 0 ? ", " : ""}
              {metaChanged && "name or description"}
            </span>
          </p>
          <Button variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button disabled={!valid} onClick={() => setReview(true)}>
            Review &amp; save
          </Button>
        </div>
      )}

      <Dialog open={review} onOpenChange={(o) => !saving && setReview(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes to {role.name}?</DialogTitle>
            <DialogDescription>
              {role.memberCount > 0
                ? `This applies immediately to ${role.memberCount.toLocaleString("en-US")} ${role.memberCount === 1 ? "person" : "people"}.`
                : "Nobody holds this role yet."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
            {added.length > 0 && (
              <div>
                <p className="font-medium text-green-600 dark:text-green-500">Adding</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {added.map((p) => (
                    <li key={p}>{labels.get(p) ?? p}</li>
                  ))}
                </ul>
              </div>
            )}
            {removed.length > 0 && (
              <div>
                <p className="font-medium text-destructive">Removing</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {removed.map((p) => (
                    <li key={p}>{labels.get(p) ?? p}</li>
                  ))}
                </ul>
              </div>
            )}
            {added.length === 0 && removed.length === 0 && <p className="text-muted-foreground">Only the name or description changed.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setReview(false)}>
              Back
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving && <Spinner />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${role.name}?`}
        description="The role is removed for good. This is recorded in the audit log."
        confirmLabel="Delete role"
        destructive
        onConfirm={async (reason) => {
          await adminApi.deleteRole(scope, role.id, reason);
          toast.add({ type: "success", title: `Role "${role.name}" deleted.` });
          router.replace(`/admin/${scope}/roles`);
          router.refresh();
        }}
      />

      {ctx.kind === "org" && (
        <CreateRoleDialog scope={scope} roles={allRoles} open={cloning} onOpenChange={setCloning} presetCloneId={role.id} />
      )}
    </>
  );
}
