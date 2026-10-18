"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { adminApi } from "@/lib/admin-api";
import { useCan } from "./admin-context";
import { PageHeader } from "./display";

export function OrgSettingsForm({
  scope,
  org,
}: {
  scope: string;
  org: { slug: string; name: string; status: string; createdAt: string };
}) {
  const router = useRouter();
  const canUpdate = useCan("org:update");
  const [name, setName] = useState(org.name);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== org.name && name.trim().length >= 2;

  async function save() {
    setSaving(true);
    try {
      await adminApi.rename(scope, name.trim());
      toast.add({ type: "success", title: "Organization renamed." });
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not rename." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Organization settings" description="Basic details of this organization." />
      <section className="flex max-w-xl flex-col gap-4 rounded-lg border p-4">
        <Field>
          <FieldLabel htmlFor="org-name">Name</FieldLabel>
          <Input id="org-name" value={name} maxLength={60} disabled={!canUpdate} onChange={(e) => setName(e.target.value)} />
          {!canUpdate && <FieldDescription>Only Owners can rename the organization.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="org-slug">URL slug</FieldLabel>
          <Input id="org-slug" value={org.slug} readOnly disabled className="font-mono" />
          <FieldDescription>The slug appears in admin URLs and cannot be changed.</FieldDescription>
        </Field>
        {canUpdate && (
          <Button className="w-fit" disabled={!dirty || saving} onClick={() => void save()}>
            {saving && <Spinner />}
            Save
          </Button>
        )}
      </section>
    </>
  );
}
