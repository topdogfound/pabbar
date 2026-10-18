"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { adminApi, type AdminRole } from "@/lib/admin-api";
import { useCanGrant } from "./admin-context";

const EMPTY = "empty";

export function CreateRoleDialog({
  scope,
  roles,
  open,
  onOpenChange,
  presetCloneId,
}: {
  scope: string;
  roles: AdminRole[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start from this role (the "Clone" button on a system role). */
  presetCloneId?: string;
}) {
  const router = useRouter();
  const canGrant = useCanGrant();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [from, setFrom] = useState(presetCloneId ?? EMPTY);
  const [pending, setPending] = useState(false);

  const items = useMemo(
    () => [{ value: EMPTY, label: "Empty (no permissions)" }, ...roles.map((r) => ({ value: r.id, label: r.name }))],
    [roles],
  );
  const valid = name.trim().length >= 2;

  async function submit() {
    setPending(true);
    try {
      const { role } = await adminApi.createRole(scope, {
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: [],
        cloneFromId: from === EMPTY ? undefined : from,
      });
      toast.add({ type: "success", title: `Role "${role.name}" created.` });
      onOpenChange(false);
      router.push(`/admin/${scope}/roles/${role.id}`);
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not create the role." });
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a role</DialogTitle>
          <DialogDescription>Start empty or copy an existing role, then choose its permissions.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="role-name">Name</FieldLabel>
          <Input id="role-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing" />
        </Field>
        <Field>
          <FieldLabel htmlFor="role-desc">Description (optional)</FieldLabel>
          <Textarea id="role-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="role-from">Start from</FieldLabel>
          <Select value={from} onValueChange={(v) => setFrom(v ?? EMPTY)} items={items}>
            <SelectTrigger id="role-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => {
                const role = roles.find((r) => r.id === i.value);
                const blocked = role ? !canGrant(role.permissions) : false;
                return (
                  <SelectItem key={i.value} value={i.value} disabled={blocked}>
                    {i.label}
                    {blocked && <span className="text-muted-foreground"> · you do not hold its permissions</span>}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <FieldDescription>You can only grant permissions you hold yourself.</FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || pending} onClick={() => void submit()}>
            {pending && <Spinner />}
            Create role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
