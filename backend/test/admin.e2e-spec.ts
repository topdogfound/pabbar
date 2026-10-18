import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Must be set before the app module is evaluated: ConfigModule keeps whatever is
// already in process.env, so these win over backend/.env.
const PG = process.env.E2E_PG_URL ?? 'postgres://pabbar:pabbar@localhost:4712';
process.env.DATABASE_URL = `${PG}/pabbar_test`;
process.env.REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:4713/1';
process.env.PLATFORM_ADMIN_EMAILS = 'root@e2e.test';
process.env.FRONTEND_URL = 'http://localhost:4710';

interface Actor {
  id: string;
  email: string;
  token: string;
  cookie: string;
  ip: string;
}

describe('Admin panel (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: import('../src/prisma/prisma.service.js').PrismaService;
  let rbac: import('../src/rbac/rbac.service.js').RbacService;
  let mkActor: (name: string) => Promise<Actor>;
  const mails: { to: string; link: string; roleName: string }[] = [];

  const actors = {} as Record<'root' | 'alice' | 'bob' | 'carol' | 'erin' | 'dave' | 'sam' | 'zed', Actor>;
  const ids = {} as { acme: string; globex: string; owner: string; admin: string; manager: string; member: string };

  // --- helpers ----------------------------------------------------------------

  const call = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, who?: Actor | string, body?: object) => {
    let r = http[method](path);
    if (who) r = r.set('Cookie', typeof who === 'string' ? who : who.cookie);
    if (typeof who !== 'string' && who) r = r.set('X-Forwarded-For', who.ip);
    return body ? r.send(body) : r;
  };

  const roleId = async (who: Actor, scope: string, name: string) => {
    const res = await call('get', `/admin/${scope}/roles`, who).expect(200);
    const found = (res.body.roles as { id: string; name: string }[]).find((r) => r.name === name);
    if (!found) throw new Error(`role ${name} not found in ${scope}`);
    return found.id;
  };

  const invite = async (by: Actor, scope: string, emails: string[], role: string) => {
    mails.length = 0;
    const res = await call('post', `/admin/${scope}/invitations`, by, { emails, roleId: role }).expect(200);
    return res.body.results as { email: string; status: string }[];
  };

  const accept = (who: Actor, email: string) => {
    const mail = [...mails].reverse().find((m) => m.to === email);
    if (!mail) throw new Error(`no invitation mail for ${email}`);
    return call('post', `/invitations/${mail.link.split('/').pop()}/accept`, who);
  };

  const cookieFrom = (res: request.Response, name: string) => {
    const raw = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith(`${name}=`));
    return raw?.split(';')[0].slice(name.length + 1);
  };

  // --- bootstrap ---------------------------------------------------------------

  beforeAll(async () => {
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../src/app.module.js');
    const { MailService } = await import('../src/mail/mail.service.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const { RbacService } = await import('../src/rbac/rbac.service.js');
    const { SessionService } = await import('../src/auth/session/session.service.js');
    const { UsersService } = await import('../src/users/users.service.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendOtp: async () => undefined,
        sendInvitation: async (o: { to: string; link: string; roleName: string }) => {
          mails.push({ to: o.to, link: o.link, roleName: o.roleName });
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts.
    (app as unknown as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    http = request(app.getHttpServer()) as unknown as ReturnType<typeof request>;
    prisma = app.get(PrismaService);
    rbac = app.get(RbacService);
    const users = app.get(UsersService);
    const sessions = app.get(SessionService);

    let n = 0;
    mkActor = async (name: string) => {
      const email = `${name}@e2e.test`;
      const user = await users.findOrCreateByVerifiedIdentity({ provider: 'email', providerUserId: email, email });
      await rbac.grantBootstrapAdmin(user);
      const { token } = await sessions.create(user.id);
      return { id: user.id, email, token, cookie: `pabbar_session=${token}`, ip: `10.9.0.${++n}` };
    };

    for (const name of ['root', 'alice', 'bob', 'carol', 'erin', 'dave', 'sam', 'zed'] as const) {
      actors[name] = await mkActor(name);
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  // --- authn / authz basics -----------------------------------------------------------

  describe('access gate', () => {
    it('rejects anonymous callers', async () => {
      await call('get', '/admin/me').expect(401);
      await call('get', '/admin/platform/users').expect(401);
    });

    it('bootstraps the Super Admin from PLATFORM_ADMIN_EMAILS only', async () => {
      const root = await call('get', '/admin/me', actors.root).expect(200);
      expect(root.body.platform).toBe(true);
      const dave = await call('get', '/admin/me', actors.dave).expect(200);
      expect(dave.body).toMatchObject({ platform: false, orgs: [], canBrowseOrgs: false });
    });

    it('hides the console from users without admin:access (404, not 403)', async () => {
      await call('get', '/admin/platform/users', actors.dave).expect(404);
      await call('get', '/admin/does-not-exist/users', actors.root).expect(404);
    });

    it('ships the permission catalog', async () => {
      const res = await call('get', '/admin/catalog', actors.dave).expect(200);
      expect(res.body.permissions.length).toBeGreaterThan(15);
    });
  });

  // --- organizations -------------------------------------------------------------------

  describe('organizations', () => {
    it('platform operator creates an org and appoints an existing user as Owner', async () => {
      const res = await call('post', '/admin/platform/orgs', actors.root, {
        name: 'Acme',
        slug: 'acme-e2e',
        ownerEmail: actors.alice.email,
      }).expect(201);
      ids.acme = res.body.org.id;

      const me = await call('get', '/admin/me', actors.alice).expect(200);
      expect(me.body.orgs).toEqual([{ slug: 'acme-e2e', name: 'Acme' }]);
    });

    it('validates slugs and rejects duplicates', async () => {
      const body = { name: 'Valid Name', ownerEmail: actors.alice.email };
      await call('post', '/admin/platform/orgs', actors.root, { ...body, slug: 'admin' }).expect(400);
      await call('post', '/admin/platform/orgs', actors.root, { ...body, slug: 'Bad Slug!' }).expect(400);
      await call('post', '/admin/platform/orgs', actors.root, { ...body, slug: 'acme-e2e' }).expect(409);
    });

    it('an existing user named as owner becomes Owner directly', async () => {
      const res = await call('post', '/admin/platform/orgs', actors.root, {
        name: 'Globex',
        slug: 'globex-e2e',
        ownerEmail: actors.dave.email,
      }).expect(201);
      ids.globex = res.body.org.id;
      const me = await call('get', '/admin/me', actors.dave).expect(200);
      expect(me.body.orgs).toEqual([{ slug: 'globex-e2e', name: 'Globex' }]);
    });

    it('an unknown owner email gets an Owner invitation, accepted after sign-in', async () => {
      mails.length = 0;
      await call('post', '/admin/platform/orgs', actors.root, {
        name: 'Initech',
        slug: 'initech-e2e',
        ownerEmail: 'newowner@e2e.test',
      }).expect(201);
      expect(mails).toHaveLength(1);
      expect(mails[0]).toMatchObject({ to: 'newowner@e2e.test', roleName: 'Owner' });

      const newOwner = await mkActor('newowner');
      await accept(newOwner, 'newowner@e2e.test').expect(200);
      const ctx = await call('get', '/admin/initech-e2e/context', newOwner).expect(200);
      expect(ctx.body.permissions).toContain('org:update');
    });

    it('only platform operators can create orgs', async () => {
      await call('post', '/admin/platform/orgs', actors.alice, { name: 'N', slug: 'nope-e2e', ownerEmail: 'a@b.co' }).expect(404);
    });

    it('gives an org Owner every org permission and no platform permission', async () => {
      const ctx = await call('get', '/admin/acme-e2e/context', actors.alice).expect(200);
      expect(ctx.body.permissions).toContain('roles:assign');
      expect(ctx.body.permissions).toContain('org:update');
      expect(ctx.body.permissions).not.toContain('users:impersonate');
      expect(ctx.body.permissions).not.toContain('orgs:create');
    });
  });

  // --- tenant isolation --------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('an Owner of one org cannot see another org or the platform console', async () => {
      await call('get', '/admin/globex-e2e/users', actors.alice).expect(404);
      await call('get', '/admin/globex-e2e/roles', actors.alice).expect(404);
      await call('get', '/admin/globex-e2e/audit', actors.alice).expect(404);
      await call('get', '/admin/platform/users', actors.alice).expect(404);
      await call('get', '/admin/platform/orgs', actors.alice).expect(404);
    });

    it('cannot reach a user outside the org through the org scope', async () => {
      await call('get', `/admin/acme-e2e/users/${actors.dave.id}`, actors.alice).expect(404);
      await call('post', `/admin/acme-e2e/users/${actors.dave.id}/suspend`, actors.alice, { reason: 'nope nope' }).expect(404);
      await call('delete', `/admin/acme-e2e/users/${actors.dave.id}/sessions`, actors.alice).expect(404);
    });
  });

  // --- roles ----------------------------------------------------------------------------------

  describe('roles', () => {
    it('lists the system roles with member counts', async () => {
      const res = await call('get', '/admin/acme-e2e/roles', actors.alice).expect(200);
      const byName = Object.fromEntries((res.body.roles as { name: string; isSystem: boolean; memberCount: number }[]).map((r) => [r.name, r]));
      expect(Object.keys(byName).sort()).toEqual(['Admin', 'Auditor', 'Manager', 'Member', 'Owner']);
      expect(byName.Owner.memberCount).toBe(1);
      expect(byName.Owner.isSystem).toBe(true);
      ids.owner = await roleId(actors.alice, 'acme-e2e', 'Owner');
      ids.admin = await roleId(actors.alice, 'acme-e2e', 'Admin');
      ids.manager = await roleId(actors.alice, 'acme-e2e', 'Manager');
      ids.member = await roleId(actors.alice, 'acme-e2e', 'Member');
    });

    it('creates, edits and rejects bad custom roles', async () => {
      const created = await call('post', '/admin/acme-e2e/roles', actors.alice, {
        name: 'Viewer',
        description: 'Read only',
        permissions: ['admin:access', 'users:read'],
      }).expect(201);
      expect(created.body.role.permissions).toEqual(['admin:access', 'users:read']);

      await call('post', '/admin/acme-e2e/roles', actors.alice, { name: 'Viewer', permissions: [] }).expect(409);
      await call('post', '/admin/acme-e2e/roles', actors.alice, { name: 'Bogus', permissions: ['nope:nope'] }).expect(400);
      // Platform-only permissions cannot be put on an org role.
      await call('post', '/admin/acme-e2e/roles', actors.alice, { name: 'Imp', permissions: ['users:impersonate'] }).expect(400);

      const upd = await call('patch', `/admin/acme-e2e/roles/${created.body.role.id}`, actors.alice, {
        permissions: ['admin:access', 'users:read', 'audit:read'],
      }).expect(200);
      expect(upd.body.role.permissions).toContain('audit:read');
    });

    it('system roles are read-only', async () => {
      await call('patch', `/admin/acme-e2e/roles/${ids.admin}`, actors.alice, { name: 'Hacked' }).expect(409);
      await call('delete', `/admin/acme-e2e/roles/${ids.admin}`, actors.alice, { reason: 'because' }).expect(409);
    });

    it('platform roles are invisible inside an org and vice versa', async () => {
      const platform = await call('get', '/admin/platform/roles', actors.root).expect(200);
      expect((platform.body.roles as { name: string }[]).map((r) => r.name).sort()).toEqual(['Auditor', 'Super Admin', 'Support']);
      const org = await call('get', '/admin/acme-e2e/roles', actors.alice).expect(200);
      expect((org.body.roles as { name: string }[]).map((r) => r.name)).not.toContain('Super Admin');
    });
  });

  // --- invitations ------------------------------------------------------------------------------

  describe('invitations', () => {
    it('invites people, reports per-email outcomes and sends mail', async () => {
      const results = await invite(actors.alice, 'acme-e2e', [actors.bob.email, actors.carol.email, actors.erin.email], ids.member);
      expect(results.map((r) => r.status)).toEqual(['invited', 'invited', 'invited']);
      expect(mails).toHaveLength(3);
      const again = await call('post', '/admin/acme-e2e/invitations', actors.alice, {
        emails: [actors.bob.email],
        roleId: ids.member,
      }).expect(200);
      expect(again.body.results[0].status).toBe('already_invited');
    });

    it('previews an invitation without signing in', async () => {
      const token = mails[0].link.split('/').pop();
      const res = await call('get', `/invitations/${token}`).expect(200);
      expect(res.body).toMatchObject({ orgName: 'Acme', status: 'pending', roleName: 'Member' });
      await call('get', '/invitations/not-a-real-token').expect(404);
    });

    it('only the invited address can accept', async () => {
      // carol tries to use bob's invitation
      const bobMail = mails.find((m) => m.to === actors.bob.email)!;
      await call('post', `/invitations/${bobMail.link.split('/').pop()}/accept`, actors.carol).expect(403);
    });

    it('accepting creates the membership; an invitation works once', async () => {
      await accept(actors.bob, actors.bob.email).expect(200);
      await accept(actors.bob, actors.bob.email).expect(410);
      await accept(actors.carol, actors.carol.email).expect(200);
      await accept(actors.erin, actors.erin.email).expect(200);
      const users = await call('get', '/admin/acme-e2e/users', actors.alice).expect(200);
      expect(users.body.users).toHaveLength(4);
    });

    it('lets Owners promote the new members', async () => {
      await call('put', `/admin/acme-e2e/users/${actors.bob.id}/roles`, actors.alice, { roleIds: [ids.admin] }).expect(204);
      await call('put', `/admin/acme-e2e/users/${actors.erin.id}/roles`, actors.alice, { roleIds: [ids.manager] }).expect(204);
      const ctx = await call('get', '/admin/acme-e2e/context', actors.bob).expect(200);
      expect(ctx.body.permissions).toContain('users:suspend');
      expect(ctx.body.permissions).not.toContain('org:update');
    });

    it('enforces the allowed-domain policy', async () => {
      await call('patch', '/admin/acme-e2e/security', actors.alice, { allowedEmailDomains: ['@E2E.test'] }).expect(200);
      const results = await invite(actors.alice, 'acme-e2e', ['x@other.com', 'y@e2e.test'], ids.member);
      expect(results).toEqual([
        { email: 'x@other.com', status: 'domain_not_allowed' },
        { email: 'y@e2e.test', status: 'invited' },
      ]);
      await call('patch', '/admin/acme-e2e/security', actors.alice, { allowedEmailDomains: ['not a domain'] }).expect(400);
    });

    it('revokes a pending invitation', async () => {
      const list = await call('get', '/admin/acme-e2e/invitations', actors.alice).expect(200);
      const pending = (list.body.invitations as { id: string; email: string }[]).find((i) => i.email === 'y@e2e.test')!;
      await call('delete', `/admin/acme-e2e/invitations/${pending.id}`, actors.alice).expect(204);
      const after = await call('get', '/admin/acme-e2e/invitations', actors.alice).expect(200);
      expect((after.body.invitations as { email: string }[]).map((i) => i.email)).not.toContain('y@e2e.test');
    });
  });

  // --- guardrails ---------------------------------------------------------------------------------

  describe('guardrails', () => {
    it('Manager cannot do what the role does not grant (403 names the permission)', async () => {
      const res = await call('post', '/admin/acme-e2e/roles', actors.erin, { name: 'Nope', permissions: [] }).expect(403);
      expect(res.body.message).toContain('roles:create');
      await call('post', `/admin/acme-e2e/users/${actors.carol.id}/suspend`, actors.erin, { reason: 'not allowed' }).expect(403);
      await call('get', '/admin/acme-e2e/audit/export', actors.erin).expect(403);
    });

    it('escalation: nobody hands out a role carrying permissions they lack', async () => {
      // Manager -> Admin
      await call('put', `/admin/acme-e2e/users/${actors.carol.id}/roles`, actors.erin, { roleIds: [ids.admin] }).expect(403);
      // Admin lacks org:update, so Admin cannot hand out Owner
      await call('put', `/admin/acme-e2e/users/${actors.carol.id}/roles`, actors.bob, { roleIds: [ids.owner] }).expect(403);
      // ...nor invite someone as Owner
      await call('post', '/admin/acme-e2e/invitations', actors.bob, { emails: ['o@e2e.test'], roleId: ids.owner }).expect(403);
      // ...nor build a custom role with permissions they do not hold
      await call('post', '/admin/acme-e2e/roles', actors.bob, { name: 'Sneaky', permissions: ['org:update'] }).expect(403);
    });

    it('escalation: cannot manage someone with more access', async () => {
      await call('post', `/admin/acme-e2e/users/${actors.alice.id}/suspend`, actors.bob, { reason: 'coup attempt' }).expect(403);
      await call('delete', `/admin/acme-e2e/users/${actors.alice.id}`, actors.bob, { reason: 'coup attempt' }).expect(403);
    });

    it('self-lockout: you cannot change your own roles, suspend or remove yourself', async () => {
      await call('put', `/admin/acme-e2e/users/${actors.bob.id}/roles`, actors.bob, { roleIds: [ids.owner] }).expect(403);
      await call('post', `/admin/acme-e2e/users/${actors.bob.id}/suspend`, actors.bob, { reason: 'self harm' }).expect(400);
      await call('delete', `/admin/acme-e2e/users/${actors.alice.id}`, actors.alice, { reason: 'leave now' }).expect(400);
    });

    it('last owner: the sole Owner cannot be removed, suspended or demoted', async () => {
      // root is a platform Super Admin, so it passes every "more access" check
      await call('delete', `/admin/acme-e2e/users/${actors.alice.id}`, actors.root, { reason: 'cleanup' }).expect(409);
      await call('post', `/admin/acme-e2e/users/${actors.alice.id}/suspend`, actors.root, { reason: 'cleanup' }).expect(409);
      await call('put', `/admin/acme-e2e/users/${actors.alice.id}/roles`, actors.root, { roleIds: [ids.member] }).expect(409);
    });

    it('with a second Owner the first can be demoted', async () => {
      await call('put', `/admin/acme-e2e/users/${actors.bob.id}/roles`, actors.alice, { roleIds: [ids.owner] }).expect(204);
      await call('put', `/admin/acme-e2e/users/${actors.alice.id}/roles`, actors.bob, { roleIds: [ids.admin] }).expect(204);
      // and back, so later steps keep a known shape
      await call('put', `/admin/acme-e2e/users/${actors.alice.id}/roles`, actors.bob, { roleIds: [ids.owner] }).expect(204);
      await call('put', `/admin/acme-e2e/users/${actors.bob.id}/roles`, actors.alice, { roleIds: [ids.admin] }).expect(204);
    });

    it('a role in use cannot be deleted until it is vacated', async () => {
      const roles = await call('get', '/admin/acme-e2e/roles', actors.alice).expect(200);
      const viewer = (roles.body.roles as { id: string; name: string }[]).find((r) => r.name === 'Viewer')!;
      await call('put', `/admin/acme-e2e/users/${actors.carol.id}/roles`, actors.alice, { roleIds: [viewer.id] }).expect(204);
      const blocked = await call('delete', `/admin/acme-e2e/roles/${viewer.id}`, actors.alice, { reason: 'tidy up' }).expect(409);
      expect(blocked.body.message).toContain('1 member');
      await call('put', `/admin/acme-e2e/users/${actors.carol.id}/roles`, actors.alice, { roleIds: [ids.member] }).expect(204);
      await call('delete', `/admin/acme-e2e/roles/${viewer.id}`, actors.alice, { reason: 'tidy up' }).expect(204);
    });

    it('sensitive actions require a reason', async () => {
      await call('post', `/admin/acme-e2e/users/${actors.carol.id}/suspend`, actors.alice, {}).expect(400);
      await call('post', `/admin/acme-e2e/users/${actors.carol.id}/suspend`, actors.alice, { reason: 'x' }).expect(400);
    });
  });

  // --- cache invalidation ----------------------------------------------------------------------------

  describe('permission cache', () => {
    it('role edits take effect immediately for everyone holding the role', async () => {
      const made = await call('post', '/admin/acme-e2e/roles', actors.alice, {
        name: 'Reader',
        permissions: ['admin:access', 'users:read'],
      }).expect(201);
      const rid = made.body.role.id as string;
      await call('put', `/admin/acme-e2e/users/${actors.carol.id}/roles`, actors.alice, { roleIds: [rid] }).expect(204);

      // warm the cache, then change the role
      await call('get', '/admin/acme-e2e/users', actors.carol).expect(200);
      await call('get', '/admin/acme-e2e/users', actors.carol).expect(200);
      await call('patch', `/admin/acme-e2e/roles/${rid}`, actors.alice, { permissions: ['admin:access'] }).expect(200);
      const denied = await call('get', '/admin/acme-e2e/users', actors.carol).expect(403);
      expect(denied.body.message).toContain('users:read');

      await call('put', `/admin/acme-e2e/users/${actors.carol.id}/roles`, actors.alice, { roleIds: [ids.member] }).expect(204);
      await call('get', '/admin/acme-e2e/context', actors.carol).expect(404);
    });

    it('suspending a membership revokes access at once', async () => {
      await call('get', '/admin/acme-e2e/context', actors.erin).expect(200);
      await call('post', `/admin/acme-e2e/users/${actors.erin.id}/suspend`, actors.bob, { reason: 'investigation' }).expect(204);
      await call('get', '/admin/acme-e2e/context', actors.erin).expect(404);
      const suspended = await call('get', '/admin/acme-e2e/users?status=SUSPENDED', actors.alice).expect(200);
      expect(suspended.body.users.map((u: { id: string }) => u.id)).toEqual([actors.erin.id]);
      await call('post', `/admin/acme-e2e/users/${actors.erin.id}/restore`, actors.bob, {}).expect(204);
      await call('get', '/admin/acme-e2e/context', actors.erin).expect(200);
    });
  });

  // --- user directory ---------------------------------------------------------------------------------

  describe('user directory', () => {
    it('searches, filters and paginates with keyset cursors', async () => {
      const search = await call('get', '/admin/acme-e2e/users?q=ALI', actors.alice).expect(200);
      expect(search.body.users.map((u: { email: string }) => u.email)).toEqual([actors.alice.email]);

      const p1 = await call('get', '/admin/acme-e2e/users?limit=2', actors.alice).expect(200);
      expect(p1.body.users).toHaveLength(2);
      expect(p1.body.nextCursor).toBeTruthy();
      const p2 = await call('get', `/admin/acme-e2e/users?limit=2&cursor=${p1.body.nextCursor}`, actors.alice).expect(200);
      const seen = new Set([...p1.body.users, ...p2.body.users].map((u: { id: string }) => u.id));
      expect(seen.size).toBe(4);
      expect(p2.body.nextCursor).toBeNull();
      await call('get', '/admin/acme-e2e/users?cursor=%%%', actors.alice).expect(400);
    });

    it('explains where each effective permission comes from', async () => {
      const res = await call('get', `/admin/acme-e2e/users/${actors.bob.id}`, actors.alice).expect(200);
      const grant = (res.body.grants as { permission: string; via: string[] }[]).find((g) => g.permission === 'users:suspend');
      expect(grant?.via).toEqual(['Admin']);
    });

    it('platform scope lists every user and platform roles', async () => {
      const res = await call('get', `/admin/platform/users?q=${actors.root.email}`, actors.root).expect(200);
      expect(res.body.users[0].roles.map((r: { name: string }) => r.name)).toEqual(['Super Admin']);
      const detail = await call('get', `/admin/platform/users/${actors.alice.id}`, actors.root).expect(200);
      expect(detail.body.memberships).toEqual([{ slug: 'acme-e2e', name: 'Acme', status: 'ACTIVE', roles: ['Owner'] }]);
    });
  });

  // --- platform operators -----------------------------------------------------------------------------

  describe('platform operators', () => {
    it('Super Admin can appoint Support; nobody changes their own platform roles', async () => {
      const supportId = await roleId(actors.root, 'platform', 'Support');
      await call('put', `/admin/platform/users/${actors.sam.id}/roles`, actors.root, { roleIds: [supportId] }).expect(204);
      await call('put', `/admin/platform/users/${actors.root.id}/roles`, actors.root, { roleIds: [] }).expect(403);
      // Support cannot appoint anyone
      await call('put', `/admin/platform/users/${actors.zed.id}/roles`, actors.sam, { roleIds: [supportId] }).expect(403);
    });

    it('platform permissions that are org-capable carry into every org', async () => {
      await call('get', '/admin/acme-e2e/users', actors.sam).expect(200);
      await call('get', '/admin/globex-e2e/audit', actors.sam).expect(200);
      // ...but write permissions Support lacks stay out
      await call('post', '/admin/acme-e2e/invitations', actors.sam, { emails: ['q@e2e.test'], roleId: ids.member }).expect(403);
      await call('post', `/admin/acme-e2e/users/${actors.carol.id}/suspend`, actors.sam, { reason: 'no no no' }).expect(403);
    });

    it('suspending an account kills its sessions immediately', async () => {
      await call('get', '/auth/me', actors.zed).expect(200);
      await call('post', `/admin/platform/users/${actors.zed.id}/suspend`, actors.root, { reason: 'abuse report 17' }).expect(204);
      await call('get', '/auth/me', actors.zed).expect(401);
      await call('post', `/admin/platform/users/${actors.root.id}/suspend`, actors.root, { reason: 'oops oops' }).expect(400);
      await call('post', `/admin/platform/users/${actors.zed.id}/restore`, actors.root, {}).expect(204);
    });

    it('suspending an org cuts off its members but not platform operators', async () => {
      await call('put', `/admin/platform/orgs/${ids.globex}/status`, actors.root, { status: 'SUSPENDED', reason: 'unpaid invoice' }).expect(200);
      await call('get', '/admin/globex-e2e/context', actors.dave).expect(404);
      await call('get', '/admin/globex-e2e/context', actors.root).expect(200);
      await call('put', `/admin/platform/orgs/${ids.globex}/status`, actors.root, { status: 'ACTIVE', reason: 'paid up' }).expect(200);
      await call('get', '/admin/globex-e2e/context', actors.dave).expect(200);
    });
  });

  // --- sessions ------------------------------------------------------------------------------------------

  describe('sessions', () => {
    it('lists only the org members sessions and revokes them', async () => {
      const res = await call('get', '/admin/acme-e2e/sessions', actors.alice).expect(200);
      const emails = new Set((res.body.sessions as { user: { email: string } }[]).map((s) => s.user.email));
      expect(emails.has(actors.bob.email)).toBe(true);
      expect(emails.has(actors.dave.email)).toBe(false);

      const bobSession = (res.body.sessions as { id: string; user: { id: string } }[]).find((s) => s.user.id === actors.bob.id)!;
      await call('delete', `/admin/acme-e2e/sessions/${bobSession.id}`, actors.alice).expect(200);
      await call('get', '/auth/me', actors.bob).expect(401);
      // bob logs in again for the rest of the run
      actors.bob = await mkActor('bob');
    });

    it('revoking all of a users sessions reports the count', async () => {
      const res = await call('delete', `/admin/acme-e2e/users/${actors.erin.id}/sessions`, actors.alice).expect(200);
      expect(res.body.revoked).toBeGreaterThanOrEqual(1);
      await call('get', '/auth/me', actors.erin).expect(401);
      actors.erin = await mkActor('erin');
    });
  });

  // --- impersonation ----------------------------------------------------------------------------------------

  describe('impersonation', () => {
    it('is audited, read-only, blocked from admin and reversible', async () => {
      const start = await call('post', `/admin/platform/users/${actors.carol.id}/impersonate`, actors.sam, {
        reason: 'ticket 4521: cannot see dashboard',
        minutes: 10,
      }).expect(200);
      const imp = cookieFrom(start, 'pabbar_session')!;
      const parked = cookieFrom(start, 'pabbar_admin_return')!;
      expect(parked).toBe(actors.sam.token);
      const impCookie = `pabbar_session=${imp}`;

      const me = await call('get', '/auth/me', impCookie).expect(200);
      expect(me.body.user.email).toBe(actors.carol.email);
      expect(me.body.impersonation.by.email).toBe(actors.sam.email);

      // read-only: no profile edits, no account deletion, no admin
      await call('patch', '/auth/me', impCookie, { name: 'Hijacked' }).expect(403);
      await call('delete', '/auth/me', impCookie).expect(403);
      await call('get', '/admin/me', impCookie).expect(200);
      await call('get', '/admin/platform/users', impCookie).expect(403);

      const stop = await call('post', '/auth/impersonation/stop', `${impCookie}; pabbar_admin_return=${parked}`).expect(204);
      expect(cookieFrom(stop, 'pabbar_session')).toBe(actors.sam.token);
      await call('get', '/auth/me', impCookie).expect(401);
      const back = await call('get', '/auth/me', actors.sam).expect(200);
      expect(back.body.impersonation).toBeUndefined();
    });

    it('cannot target platform staff, yourself, or be started without permission', async () => {
      await call('post', `/admin/platform/users/${actors.root.id}/impersonate`, actors.sam, { reason: 'curiosity' }).expect(403);
      await call('post', `/admin/platform/users/${actors.sam.id}/impersonate`, actors.sam, { reason: 'curiosity' }).expect(400);
      await call('post', `/admin/platform/users/${actors.carol.id}/impersonate`, actors.alice, { reason: 'curiosity' }).expect(404);
      await call('post', `/admin/acme-e2e/users/${actors.carol.id}/impersonate`, actors.root, { reason: 'curiosity' }).expect(403);
    });

    it('the stop endpoint refuses ordinary sessions', async () => {
      await call('post', '/auth/impersonation/stop', actors.alice).expect(400);
    });
  });

  // --- audit ------------------------------------------------------------------------------------------------------

  describe('audit log', () => {
    it('records who did what, newest first, scoped to the org', async () => {
      const res = await call('get', '/admin/acme-e2e/audit?limit=100', actors.alice).expect(200);
      const events = res.body.events as { action: string; orgId: string; actor: { email: string }; reason: string | null; at: string }[];
      const actions = events.map((e) => e.action);
      for (const expected of [
        'role.create',
        'role.update',
        'role.delete',
        'invitation.create',
        'invitation.accept',
        'invitation.revoke',
        'user.roles.update',
        'user.suspend',
        'user.restore',
        'security.update',
        'session.revoke',
        'user.sessions.revoke',
      ]) {
        expect(actions, expected).toContain(expected);
      }
      expect(events.every((e) => e.orgId === ids.acme)).toBe(true);
      const times = events.map((e) => e.at);
      expect(times).toEqual([...times].sort().reverse());
      const suspend = events.find((e) => e.action === 'user.suspend')!;
      expect(suspend.actor.email).toBe(actors.bob.email);
      expect(suspend.reason).toBe('investigation');
    });

    it('filters by action prefix and paginates', async () => {
      const users = await call('get', '/admin/acme-e2e/audit?action=user.&limit=100', actors.alice).expect(200);
      expect(users.body.events.length).toBeGreaterThan(0);
      expect(users.body.events.every((e: { action: string }) => e.action.startsWith('user.'))).toBe(true);

      const p1 = await call('get', '/admin/acme-e2e/audit?limit=3', actors.alice).expect(200);
      const p2 = await call('get', `/admin/acme-e2e/audit?limit=3&cursor=${p1.body.nextCursor}`, actors.alice).expect(200);
      const ids1 = new Set(p1.body.events.map((e: { id: string }) => e.id));
      expect(p2.body.events.some((e: { id: string }) => ids1.has(e.id))).toBe(false);
    });

    it('platform scope sees all orgs; an org never sees platform-level or other-org events', async () => {
      const platform = await call('get', '/admin/platform/audit?limit=100', actors.root).expect(200);
      const orgs = new Set((platform.body.events as { orgId: string | null }[]).map((e) => e.orgId));
      expect(orgs.has(ids.acme)).toBe(true);
      expect(orgs.has(ids.globex)).toBe(true);
      expect(orgs.has(null)).toBe(true); // platform-level events (impersonation, platform suspend)

      const only = await call('get', `/admin/platform/audit?orgId=${ids.globex}&limit=100`, actors.root).expect(200);
      expect(only.body.events.every((e: { orgId: string }) => e.orgId === ids.globex)).toBe(true);
      const none = await call('get', '/admin/platform/audit?orgId=none&limit=100', actors.root).expect(200);
      expect(none.body.events.every((e: { orgId: string | null }) => e.orgId === null)).toBe(true);

      const acme = await call('get', '/admin/acme-e2e/audit?limit=100', actors.alice).expect(200);
      expect(acme.body.events.some((e: { orgId: string | null }) => e.orgId !== ids.acme)).toBe(false);
    });

    it('logs impersonation start and stop against the operator', async () => {
      const res = await call('get', '/admin/platform/audit?action=user.impersonate.&limit=20', actors.root).expect(200);
      const events = res.body.events as { action: string; actor: { email: string }; targetLabel: string }[];
      expect(events.map((e) => e.action).sort()).toEqual(['user.impersonate.start', 'user.impersonate.stop']);
      expect(events.every((e) => e.actor.email === actors.sam.email && e.targetLabel === actors.carol.email)).toBe(true);
    });

    it('exports CSV for holders of audit:export only, and audits the export', async () => {
      const res = await call('get', '/admin/acme-e2e/audit/export?action=user.', actors.alice).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toContain('at,action,actor_email');
      expect(lines.length).toBeGreaterThan(2);
      await call('get', '/admin/acme-e2e/audit/export', actors.bob).expect(200);
      await call('get', '/admin/acme-e2e/audit/export', actors.erin).expect(403);
      const log = await call('get', '/admin/acme-e2e/audit?action=audit.export', actors.alice).expect(200);
      expect(log.body.events.length).toBeGreaterThanOrEqual(2);
    });

    it('is immutable at the database level', async () => {
      const row = await prisma.auditLog.findFirstOrThrow();
      await expect(prisma.auditLog.update({ where: { id: row.id }, data: { reason: 'tampered' } })).rejects.toThrow(/immutable/i);
    });
  });

  // --- overview + misc ----------------------------------------------------------------------------------------------

  describe('overview', () => {
    it('returns capped counts and recent activity', async () => {
      const res = await call('get', '/admin/acme-e2e/overview', actors.alice).expect(200);
      expect(res.body.stats.members).toEqual({ value: 4, capped: false });
      expect(res.body.recent.length).toBeGreaterThan(0);
      const platform = await call('get', '/admin/platform/overview', actors.root).expect(200);
      expect(platform.body.stats.orgs.value).toBe(3);
    });

    it('hides recent activity from people without audit:read', async () => {
      const res = await call('get', '/admin/acme-e2e/overview', actors.erin).expect(200);
      expect(res.body.recent).toBeNull();
    });
  });
});
