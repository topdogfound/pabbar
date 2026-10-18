import { type Permission } from './catalog.js';

export interface OrgRef {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

/** Where an admin request operates: the whole platform, or one organization. */
export type Scope = { kind: 'platform' } | { kind: 'org'; org: OrgRef };

export const PLATFORM_KEY = 'platform';

export const scopeKey = (scope: Scope) => (scope.kind === 'platform' ? PLATFORM_KEY : scope.org.id);

/** Slugs that would collide with routes or read as a different scope. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'platform',
  'admin',
  'api',
  'invite',
  'login',
  'settings',
  'dashboard',
  'new',
  'orgs',
  'www',
]);

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** What one user may do in one scope. Immutable and per-request. */
export class Access {
  /**
   * @param permissions what unlocks endpoints in this scope.
   * @param held everything the user holds through their roles, including
   *   permissions that do not apply here. A platform Super Admin holds the
   *   org-only `org:read` through their role even though no platform endpoint
   *   uses it; the escalation guard must count it, or Super Admin could not
   *   hand out the Support role.
   */
  constructor(
    readonly userId: string,
    readonly scope: Scope,
    readonly permissions: ReadonlySet<Permission>,
    readonly held: ReadonlySet<Permission> = permissions,
  ) {}

  has(permission: Permission) {
    return this.permissions.has(permission);
  }

  /**
   * True when every permission in `needed` is held. This is the escalation
   * guard: nobody can grant, edit, or hand out something they do not hold.
   */
  covers(needed: Iterable<string>) {
    for (const p of needed) if (!this.held.has(p as Permission)) return false;
    return true;
  }
}
