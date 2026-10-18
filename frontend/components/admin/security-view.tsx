"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { adminApi, type AdminSession, type SecurityPolicy } from "@/lib/admin-api";
import { useAdmin, useCan } from "./admin-context";
import { PageHeader } from "./display";
import { SessionsList } from "./sessions-list";

const TTL_ITEMS = [1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 1 ? "1 day" : `${d} days` }));

export function SecurityView({
  scope,
  policy,
  sessions,
}: {
  scope: string;
  policy: SecurityPolicy | null;
  sessions: { sessions: AdminSession[]; nextCursor: string | null } | null;
}) {
  const { scope: ctx } = useAdmin();
  return (
    <>
      <PageHeader
        title={ctx.kind === "org" ? "Sessions & policies" : "Sessions"}
        description={
          ctx.kind === "org"
            ? "Who is signed in right now, and the rules for who can join."
            : "Every live browser session on the platform."
        }
      />
      {policy && <PolicyForm scope={scope} initial={policy} />}
      {sessions && (
        <section className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-medium">Active sessions</h3>
            <p className="text-muted-foreground">
              {ctx.kind === "org"
                ? "Sessions of this organization's members. People sign in once for all their organizations, so revoking a session signs them out everywhere."
                : "Newest sign-ins first."}
            </p>
          </div>
          <SessionsList scope={scope} initial={sessions} />
        </section>
      )}
    </>
  );
}

function PolicyForm({ scope, initial }: { scope: string; initial: SecurityPolicy }) {
  const canUpdate = useCan("security:update");
  const [saved, setSaved] = useState(initial);
  const [domains, setDomains] = useState(initial.allowedEmailDomains.join("\n"));
  const [ttl, setTtl] = useState(String(initial.inviteTtlDays));
  const [saving, setSaving] = useState(false);

  const parsed = domains
    .split(/[\s,;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const dirty =
    Number(ttl) !== saved.inviteTtlDays ||
    parsed.length !== saved.allowedEmailDomains.length ||
    parsed.some((d) => !saved.allowedEmailDomains.includes(d));

  async function save() {
    setSaving(true);
    try {
      const res = await adminApi.updateSecurity(scope, { allowedEmailDomains: parsed, inviteTtlDays: Number(ttl) });
      setSaved(res.policy);
      setDomains(res.policy.allowedEmailDomains.join("\n"));
      setTtl(String(res.policy.inviteTtlDays));
      toast.add({ type: "success", title: "Policy saved." });
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not save the policy." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-4 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-medium">Invitation policy</h3>
        <p className="text-muted-foreground">Applies to new invitations and when an invitation is accepted.</p>
      </div>
      <Field>
        <FieldLabel htmlFor="domains">Allowed email domains</FieldLabel>
        <Textarea
          id="domains"
          rows={3}
          value={domains}
          disabled={!canUpdate}
          placeholder={"acme.com\nacme.co.uk"}
          onChange={(e) => setDomains(e.target.value)}
        />
        <FieldDescription>
          One per line. Leave empty to allow any domain. Existing members are not affected.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="ttl">Invitation lifetime</FieldLabel>
        <Select value={ttl} onValueChange={(v) => setTtl(v ?? "7")} items={TTL_ITEMS} disabled={!canUpdate}>
          <SelectTrigger id="ttl" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTL_ITEMS.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {canUpdate ? (
        <Button className="w-fit" disabled={!dirty || saving} onClick={() => void save()}>
          {saving && <Spinner />}
          Save policy
        </Button>
      ) : (
        <p className="text-muted-foreground">You can view this policy but not change it.</p>
      )}
    </section>
  );
}
