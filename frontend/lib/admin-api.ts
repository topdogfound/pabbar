import { api } from "@/lib/api";

// Mirrors backend/src/admin/**. Scope is `platform` or an organization slug.

export type ScopeKind = "platform" | "org";

export interface AdminSummary {
  platform: boolean;
  orgs: { slug: string; name: string }[];
  canBrowseOrgs: boolean;
}

export interface ScopeContext {
  scope: { kind: ScopeKind; slug: string; name: string; status: "ACTIVE" | "SUSPENDED" };
  permissions: string[];
  /** Everything the viewer holds, incl. permissions no endpoint in this scope uses. */
  held: string[];
}

export interface PermissionDef {
  key: string;
  group: string;
  label: string;
  description: string;
  scopes: ScopeKind[];
}

export interface RoleChip {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  status: "ACTIVE" | "SUSPENDED";
  roles: RoleChip[];
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface PermissionGrant {
  permission: string;
  label: string;
  via: string[];
}

export interface UserDetail {
  user: AdminUser;
  grants: PermissionGrant[];
  /** Platform scope only. */
  memberships?: { slug: string; name: string; status: string; roles: string[] }[];
}

export interface AdminRole {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface InviteResult {
  email: string;
  status: "invited" | "already_member" | "already_invited" | "domain_not_allowed";
}

export interface AuditEvent {
  id: string;
  at: string;
  orgId: string | null;
  actor: { id: string | null; email: string | null; name: string | null };
  impersonatorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  reason: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface AuditPage {
  events: AuditEvent[];
  orgs: Record<string, { slug: string; name: string }>;
  nextCursor: string | null;
}

export interface AdminSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  createdAt: string;
  impersonated: boolean;
  user: { id: string; email: string | null; name: string | null; avatarUrl: string | null };
}

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  memberCount: number;
}

export interface Stat {
  value: number;
  /** Counting stopped at a cap: show "10,000+". */
  capped: boolean;
}

export interface Overview {
  stats: Record<string, Stat>;
  recent: AuditEvent[] | null;
}

export interface SecurityPolicy {
  allowedEmailDomains: string[];
  inviteTtlDays: number;
}

const qs = (params: Record<string, string | number | null | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

const json = (body: unknown) => JSON.stringify(body);
const base = (scope: string) => `/admin/${encodeURIComponent(scope)}`;

export interface UserFilters {
  q?: string;
  status?: "ACTIVE" | "SUSPENDED";
  roleId?: string;
}

export interface AuditFilters {
  action?: string;
  actorId?: string;
  targetId?: string;
  orgId?: string;
  from?: string;
  to?: string;
}

/** Browser-side client for the admin API, proxied through /api like the rest. */
export const adminApi = {
  catalog: () => api<{ permissions: PermissionDef[] }>("/admin/catalog"),

  // users
  users: (scope: string, f: UserFilters, cursor?: string | null, limit = 25) =>
    api<{ users: AdminUser[]; nextCursor: string | null }>(
      `${base(scope)}/users${qs({ ...f, cursor, limit })}`,
    ),
  user: (scope: string, id: string) => api<UserDetail>(`${base(scope)}/users/${id}`),
  suspend: (scope: string, id: string, reason: string) =>
    api<void>(`${base(scope)}/users/${id}/suspend`, { method: "POST", body: json({ reason }) }),
  restore: (scope: string, id: string, reason?: string) =>
    api<void>(`${base(scope)}/users/${id}/restore`, { method: "POST", body: json({ reason }) }),
  remove: (scope: string, id: string, reason: string) =>
    api<void>(`${base(scope)}/users/${id}`, { method: "DELETE", body: json({ reason }) }),
  setRoles: (scope: string, id: string, roleIds: string[], reason?: string) =>
    api<void>(`${base(scope)}/users/${id}/roles`, { method: "PUT", body: json({ roleIds, reason }) }),
  impersonate: (scope: string, id: string, reason: string, minutes: number) =>
    api<{ expiresAt: string }>(`${base(scope)}/users/${id}/impersonate`, {
      method: "POST",
      body: json({ reason, minutes }),
    }),

  // roles
  roles: (scope: string) => api<{ roles: AdminRole[] }>(`${base(scope)}/roles`),
  role: (scope: string, id: string) => api<{ role: AdminRole }>(`${base(scope)}/roles/${id}`),
  createRole: (
    scope: string,
    body: { name: string; description?: string; permissions: string[]; cloneFromId?: string },
  ) => api<{ role: AdminRole }>(`${base(scope)}/roles`, { method: "POST", body: json(body) }),
  updateRole: (
    scope: string,
    id: string,
    body: { name?: string; description?: string; permissions?: string[] },
  ) => api<{ role: AdminRole }>(`${base(scope)}/roles/${id}`, { method: "PATCH", body: json(body) }),
  deleteRole: (scope: string, id: string, reason: string) =>
    api<void>(`${base(scope)}/roles/${id}`, { method: "DELETE", body: json({ reason }) }),

  // invitations
  invitations: (scope: string, cursor?: string | null, limit = 25) =>
    api<{ invitations: Invitation[]; nextCursor: string | null }>(
      `${base(scope)}/invitations${qs({ cursor, limit })}`,
    ),
  invite: (scope: string, emails: string[], roleId: string) =>
    api<{ results: InviteResult[] }>(`${base(scope)}/invitations`, {
      method: "POST",
      body: json({ emails, roleId }),
    }),
  resendInvitation: (scope: string, id: string) =>
    api<void>(`${base(scope)}/invitations/${id}/resend`, { method: "POST" }),
  revokeInvitation: (scope: string, id: string) =>
    api<void>(`${base(scope)}/invitations/${id}`, { method: "DELETE" }),

  // audit
  audit: (scope: string, f: AuditFilters, cursor?: string | null, limit = 25) =>
    api<AuditPage>(`${base(scope)}/audit${qs({ ...f, cursor, limit })}`),
  auditExportUrl: (scope: string, f: AuditFilters) => `/api${base(scope)}/audit/export${qs({ ...f })}`,

  // sessions
  sessions: (scope: string, userId?: string, cursor?: string | null, limit = 25) =>
    api<{ sessions: AdminSession[]; nextCursor: string | null }>(
      `${base(scope)}/sessions${qs({ userId, cursor, limit })}`,
    ),
  revokeSession: (scope: string, id: string) =>
    api<{ ok: true }>(`${base(scope)}/sessions/${id}`, { method: "DELETE" }),
  revokeUserSessions: (scope: string, userId: string) =>
    api<{ revoked: number }>(`${base(scope)}/users/${userId}/sessions`, { method: "DELETE" }),

  // org settings + policies
  organization: (scope: string) =>
    api<{ org: { id: string; slug: string; name: string; status: string; createdAt: string } }>(
      `${base(scope)}/organization`,
    ),
  rename: (scope: string, name: string) =>
    api<unknown>(`${base(scope)}/organization`, { method: "PATCH", body: json({ name }) }),
  security: (scope: string) => api<{ policy: SecurityPolicy }>(`${base(scope)}/security`),
  updateSecurity: (scope: string, body: Partial<SecurityPolicy>) =>
    api<{ policy: SecurityPolicy }>(`${base(scope)}/security`, { method: "PATCH", body: json(body) }),

  // platform: organizations
  orgs: (q: { q?: string; status?: "ACTIVE" | "SUSPENDED" }, cursor?: string | null, limit = 25) =>
    api<{ orgs: OrgRow[]; nextCursor: string | null }>(`${base("platform")}/orgs${qs({ ...q, cursor, limit })}`),
  createOrg: (body: { name: string; slug: string; ownerEmail: string }) =>
    api<{ org: OrgRow }>(`${base("platform")}/orgs`, { method: "POST", body: json(body) }),
  setOrgStatus: (orgId: string, status: "ACTIVE" | "SUSPENDED", reason: string) =>
    api<{ status: string }>(`${base("platform")}/orgs/${orgId}/status`, {
      method: "PUT",
      body: json({ status, reason }),
    }),
};

export const invitationsApi = {
  accept: (token: string) =>
    api<{ org: { slug: string; name: string } }>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),
};
