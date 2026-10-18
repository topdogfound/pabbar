import { describe, expect, it } from 'vitest';
import { Access } from './access.js';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLES,
  appliesTo,
  isPermission,
  permissionsFor,
} from './catalog.js';

const role = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!;

describe('permission catalog', () => {
  it('uses unique resource:action keys', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const key of ALL_PERMISSIONS) expect(key).toMatch(/^[a-z]+:[a-z]+$/);
  });

  it('gives every permission a scope, a group and a description', () => {
    for (const def of Object.values(PERMISSIONS)) {
      expect(def.scopes.length).toBeGreaterThan(0);
      expect(def.group).toBeTruthy();
      expect(def.description.length).toBeGreaterThan(10);
    }
  });

  it('rejects unknown strings', () => {
    expect(isPermission('users:read')).toBe(true);
    expect(isPermission('users:everything')).toBe(false);
    expect(isPermission('constructor')).toBe(false);
    expect(isPermission('__proto__')).toBe(false);
  });

  it('keeps impersonation and org lifecycle platform-only', () => {
    for (const p of ['users:impersonate', 'orgs:read', 'orgs:create', 'orgs:suspend'] as const) {
      expect(appliesTo(p, 'platform')).toBe(true);
      expect(appliesTo(p, 'org')).toBe(false);
    }
  });
});

describe('system roles', () => {
  it('have unique keys and only known permissions', () => {
    expect(new Set(SYSTEM_ROLES.map((r) => r.key)).size).toBe(SYSTEM_ROLES.length);
    for (const r of SYSTEM_ROLES) for (const p of r.permissions) expect(isPermission(p), `${r.key}:${p}`).toBe(true);
  });

  it('org roles never carry a platform-only permission', () => {
    for (const r of SYSTEM_ROLES.filter((r) => r.scope === 'ORG')) {
      for (const p of r.permissions) expect(appliesTo(p, 'org'), `${r.key} has ${p}`).toBe(true);
    }
  });

  it('Super Admin holds everything', () => {
    expect([...role('platform.super_admin').permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('Owner holds every org permission; Admin is Owner minus org:update', () => {
    const owner = new Set(role('org.owner').permissions);
    expect([...owner].sort()).toEqual(permissionsFor('org').sort());
    const admin = new Set(role('org.admin').permissions);
    expect([...owner].filter((p) => !admin.has(p))).toEqual(['org:update']);
  });

  it('Member has no permissions at all, so it cannot open the console', () => {
    expect(role('org.member').permissions).toEqual([]);
  });

  it('every role that can do anything can open the console', () => {
    for (const r of SYSTEM_ROLES.filter((r) => r.permissions.length > 0)) {
      expect(r.permissions, r.key).toContain('admin:access');
    }
  });

  it('forms a strict ladder: each org role is a subset of the one above', () => {
    const subset = (a: string, b: string) => {
      const big = new Set(role(b).permissions);
      return role(a).permissions.every((p) => big.has(p));
    };
    expect(subset('org.admin', 'org.owner')).toBe(true);
    expect(subset('org.manager', 'org.admin')).toBe(true);
    expect(subset('org.auditor', 'org.admin')).toBe(true);
    expect(subset('org.member', 'org.manager')).toBe(true);
    // ...and Owner is not reachable from below.
    expect(subset('org.owner', 'org.admin')).toBe(false);
  });
});

describe('Access', () => {
  const scope = { kind: 'platform' } as const;

  it('covers() is the escalation check: every needed permission must be held', () => {
    const a = new Access('u', scope, new Set(['admin:access', 'users:read']));
    expect(a.covers(['users:read'])).toBe(true);
    expect(a.covers(['users:read', 'users:suspend'])).toBe(false);
    expect(a.covers([])).toBe(true);
  });

  it('counts held permissions that do not apply in this scope', () => {
    const a = new Access('u', scope, new Set(['admin:access']), new Set(['admin:access', 'org:read']));
    expect(a.has('org:read')).toBe(false);
    expect(a.covers(['org:read'])).toBe(true);
  });
});
