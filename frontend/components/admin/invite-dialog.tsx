"use client";

import { useMemo, useState } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { adminApi, type AdminRole, type InviteResult } from "@/lib/admin-api";
import { useCanGrant } from "./admin-context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX = 50;

const RESULT_TEXT: Record<InviteResult["status"], string> = {
  invited: "Invitation sent",
  already_member: "Already a member",
  already_invited: "Already has a pending invitation",
  domain_not_allowed: "Email domain not allowed by this organization",
};

export function InviteDialog({
  scope,
  roles,
  open,
  onOpenChange,
  onDone,
}: {
  scope: string;
  roles: AdminRole[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const canGrant = useCanGrant();
  const options = useMemo(
    () => roles.map((r) => ({ ...r, allowed: canGrant(r.permissions) })),
    [roles, canGrant],
  );
  const defaultRole = options.find((r) => r.key === "org.member" && r.allowed) ?? options.find((r) => r.allowed);

  const [text, setText] = useState("");
  const [roleId, setRoleId] = useState<string>(defaultRole?.id ?? "");
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const emails = useMemo(() => {
    const all = text
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(all)];
  }, [text]);
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  const ok = emails.length > 0 && emails.length <= MAX && invalid.length === 0 && roleId !== "";

  function close(v: boolean) {
    if (pending) return;
    onOpenChange(v);
    if (!v) {
      setResults(null);
      setText("");
    }
  }

  async function submit() {
    setPending(true);
    try {
      const res = await adminApi.invite(scope, emails, roleId);
      setResults(res.results);
      onDone();
    } catch (err) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Could not send invitations." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            They get an email with a link. They must sign in with the address you invite.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-lg border">
            {results.map((r) => (
              <li key={r.email} className="flex items-start gap-2 p-2.5">
                {r.status === "invited" ? (
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-green-600" />
                ) : (
                  <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.email}</p>
                  <p className="text-muted-foreground">{RESULT_TEXT[r.status]}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="invite-emails">Email addresses</FieldLabel>
              <Textarea
                id="invite-emails"
                rows={4}
                value={text}
                placeholder="ada@example.com, grace@example.com"
                onChange={(e) => setText(e.target.value)}
                aria-invalid={invalid.length > 0}
              />
              <FieldDescription>
                {invalid.length > 0
                  ? `Not a valid email: ${invalid.slice(0, 2).join(", ")}${invalid.length > 2 ? "…" : ""}`
                  : emails.length > MAX
                    ? `At most ${MAX} at a time.`
                    : "Separate with commas, spaces or new lines."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <Select
                value={roleId}
                onValueChange={(v) => setRoleId(v ?? "")}
                items={options.map((r) => ({ value: r.id, label: r.name }))}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((r) => (
                    <SelectItem key={r.id} value={r.id} disabled={!r.allowed}>
                      {r.name}
                      {!r.allowed && <span className="text-muted-foreground"> · you do not hold its permissions</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={pending} onClick={() => close(false)}>
                Cancel
              </Button>
              <Button disabled={!ok || pending} onClick={() => void submit()}>
                {pending && <Spinner />}
                Send {emails.length > 1 ? `${emails.length} invitations` : "invitation"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
