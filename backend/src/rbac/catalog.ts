/**
 * The permission catalog and the system roles. This file is the single source
 * of truth: the database stores role -> permission strings, and unknown strings
 * are ignored at read time, so removing a permission here revokes it everywhere.
 *
 * Scopes
 *  - 'platform': the whole product (staff console).
 *  - 'org': one tenant.
 *
 * A permission lists the scopes it is meaningful in. A *platform* role's
 * permission also applies inside every org when the permission is org-capable
 * (e.g. a platform Support role with `sessions:revoke` can revoke sessions in
 * any org). Platform-only permissions (impersonation, org lifecycle) never
 * leak into an org scope.
 */

export type ScopeKind = 'platform' | 'org';

export interface PermissionDef {
  scopes: readonly ScopeKind[];
  group: string;
  label: string;
  description: string;
}

const BOTH = ['platform', 'org'] as const;
const ORG = ['org'] as const;
const PLATFORM = ['platform'] as const;

export const PERMISSIONS = {
  'admin:access': {
    scopes: BOTH,
    group: 'General',
    label: 'Open the admin console',
    description: 'Required to see the admin console at all. Without it every other permission is inert.',
  },
  'users:read': {
    scopes: BOTH,
    group: 'Users',
    label: 'View users',
    description: 'See the user directory, user details and their effective access.',
  },
  'users:invite': {
    scopes: ORG,
    group: 'Users',
    label: 'Invite users',
    description: 'Invite people by email and manage pending invitations.',
  },
  'users:suspend': {
    scopes: BOTH,
    group: 'Users',
    label: 'Suspend and restore users',
    description: 'Block a user from the organization (or from the whole platform) and lift the block.',
  },
  'users:remove': {
    scopes: ORG,
    group: 'Users',
    label: 'Remove members',
    description: 'Remove a member from the organization.',
  },
  'users:impersonate': {
    scopes: PLATFORM,
    group: 'Users',
    label: 'Impersonate users',
    description: 'View the product as another user, read-only, for a limited time. Always audited.',
  },
  'roles:read': {
    scopes: BOTH,
    group: 'Roles',
    label: 'View roles',
    description: 'See roles, their permissions and who holds them.',
  },
  'roles:create': {
    scopes: ORG,
    group: 'Roles',
    label: 'Create roles',
    description: 'Create custom roles. You can only grant permissions you hold yourself.',
  },
  'roles:update': {
    scopes: ORG,
    group: 'Roles',
    label: 'Edit roles',
    description: 'Rename custom roles and change their permissions.',
  },
  'roles:delete': {
    scopes: ORG,
    group: 'Roles',
    label: 'Delete roles',
    description: 'Delete custom roles that nobody holds.',
  },
  'roles:assign': {
    scopes: BOTH,
    group: 'Roles',
    label: 'Assign roles',
    description: 'Change which roles a user holds. You can only hand out roles whose permissions you hold.',
  },
  'audit:read': {
    scopes: BOTH,
    group: 'Audit',
    label: 'View audit log',
    description: 'Read the immutable record of administrative actions.',
  },
  'audit:export': {
    scopes: BOTH,
    group: 'Audit',
    label: 'Export audit log',
    description: 'Download the audit log as CSV.',
  },
  'sessions:read': {
    scopes: BOTH,
    group: 'Sessions',
    label: 'View sessions',
    description: 'See active browser sessions of users.',
  },
  'sessions:revoke': {
    scopes: BOTH,
    group: 'Sessions',
    label: 'Revoke sessions',
    description: 'Force a user out of one or all of their sessions.',
  },
  'security:read': {
    scopes: ORG,
    group: 'Security',
    label: 'View security policies',
    description: 'See the organization security policies.',
  },
  'security:update': {
    scopes: ORG,
    group: 'Security',
    label: 'Change security policies',
    description: 'Change allowed email domains and invitation lifetime.',
  },
  'org:read': {
    scopes: ORG,
    group: 'Organization',
    label: 'View organization',
    description: 'See organization details.',
  },
  'org:update': {
    scopes: ORG,
    group: 'Organization',
    label: 'Edit organization',
    description: 'Rename the organization. Only Owners hold this, which makes Owner the one role Admins cannot hand out.',
  },
  'orgs:read': {
    scopes: PLATFORM,
    group: 'Organizations',
    label: 'View organizations',
    description: 'Browse every organization on the platform.',
  },
  'orgs:create': {
    scopes: PLATFORM,
    group: 'Organizations',
    label: 'Create organizations',
    description: 'Create a new organization and appoint its first Owner.',
  },
  'orgs:suspend': {
    scopes: PLATFORM,
    group: 'Organizations',
    label: 'Suspend organizations',
    description: 'Suspend or restore a whole organization.',
  },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const isPermission = (value: string): value is Permission =>
  Object.hasOwn(PERMISSIONS, value);

export const appliesTo = (permission: Permission, kind: ScopeKind) =>
  (PERMISSIONS[permission].scopes as readonly ScopeKind[]).includes(kind);

export const permissionsFor = (kind: ScopeKind) =>
  ALL_PERMISSIONS.filter((p) => appliesTo(p, kind));

export interface SystemRoleDef {
  /** Stable identifier; never rename, the DB row is matched on it. */
  key: string;
  scope: 'PLATFORM' | 'ORG';
  name: string;
  description: string;
  permissions: readonly Permission[];
}

const ORG_ALL = permissionsFor('org');

export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  {
    key: 'platform.super_admin',
    scope: 'PLATFORM',
    name: 'Super Admin',
    description: 'Full control of the platform and of every organization.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'platform.support',
    scope: 'PLATFORM',
    name: 'Support',
    description: 'Helps customers: reads users and audit trail, revokes sessions, impersonates read-only.',
    permissions: [
      'admin:access',
      'users:read',
      'users:impersonate',
      'roles:read',
      'audit:read',
      'sessions:read',
      'sessions:revoke',
      'security:read',
      'org:read',
      'orgs:read',
    ],
  },
  {
    key: 'platform.auditor',
    scope: 'PLATFORM',
    name: 'Auditor',
    description: 'Read-only access across the platform, including audit export.',
    permissions: [
      'admin:access',
      'users:read',
      'roles:read',
      'audit:read',
      'audit:export',
      'sessions:read',
      'security:read',
      'org:read',
      'orgs:read',
    ],
  },
  {
    key: 'org.owner',
    scope: 'ORG',
    name: 'Owner',
    description: 'Full control of the organization. Every organization keeps at least one.',
    permissions: ORG_ALL,
  },
  {
    key: 'org.admin',
    scope: 'ORG',
    name: 'Admin',
    description: 'Manages people, roles, sessions and security. Cannot rename the organization or hand out Owner.',
    permissions: ORG_ALL.filter((p) => p !== 'org:update'),
  },
  {
    key: 'org.manager',
    scope: 'ORG',
    name: 'Manager',
    description: 'Invites people and assigns roles up to their own level.',
    permissions: ['admin:access', 'users:read', 'users:invite', 'roles:read', 'roles:assign', 'org:read'],
  },
  {
    key: 'org.auditor',
    scope: 'ORG',
    name: 'Auditor',
    description: 'Read-only access to users, roles and the audit log.',
    permissions: ['admin:access', 'users:read', 'roles:read', 'audit:read', 'audit:export', 'org:read'],
  },
  {
    key: 'org.member',
    scope: 'ORG',
    name: 'Member',
    description: 'Regular member. No access to the admin console.',
    permissions: [],
  },
];

export const OWNER_ROLE_KEY = 'org.owner';
export const MEMBER_ROLE_KEY = 'org.member';
export const SUPER_ADMIN_ROLE_KEY = 'platform.super_admin';
