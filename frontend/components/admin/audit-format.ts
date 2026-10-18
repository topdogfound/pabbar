import type { AuditEvent } from "@/lib/admin-api";

/** Verb phrase per action; the target (if any) follows it. */
export const ACTION_LABELS: Record<string, string> = {
  "user.suspend": "suspended",
  "user.restore": "restored",
  "user.remove": "removed",
  "user.roles.update": "changed the roles of",
  "user.impersonate.start": "started impersonating",
  "user.impersonate.stop": "stopped impersonating",
  "user.sessions.revoke": "signed out all sessions of",
  "session.revoke": "revoked a session of",
  "role.create": "created the role",
  "role.update": "updated the role",
  "role.delete": "deleted the role",
  "invitation.create": "invited",
  "invitation.resend": "resent the invitation to",
  "invitation.revoke": "revoked the invitation for",
  "invitation.accept": "accepted the invitation",
  "org.create": "created the organization",
  "org.update": "updated the organization",
  "org.suspend": "suspended the organization",
  "org.restore": "restored the organization",
  "security.update": "changed the security policy",
  "audit.export": "exported the audit log",
};

export const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "user.", label: "Users" },
  { value: "role.", label: "Roles" },
  { value: "invitation.", label: "Invitations" },
  { value: "session.", label: "Sessions" },
  { value: "org.", label: "Organization" },
  { value: "security.", label: "Security policy" },
  { value: "audit.", label: "Audit exports" },
];

export function actorName(e: AuditEvent) {
  return e.actor.name ?? e.actor.email ?? "System";
}

/** "Alice suspended bob@example.com" */
export function describeEvent(e: AuditEvent) {
  const verb = ACTION_LABELS[e.action] ?? e.action;
  return { actor: actorName(e), verb, target: e.targetLabel };
}
