import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';

function setup(opts: { identity?: any; userByEmail?: any } = {}) {
  const prisma = {
    identity: { findUnique: vi.fn().mockResolvedValue(opts.identity ?? null) },
    user: {
      findUnique: vi.fn().mockResolvedValue(opts.userByEmail ?? null),
      create: vi.fn(async ({ data }: any) => ({ id: 'new', status: 'ACTIVE', ...data })),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, status: 'ACTIVE', ...data })),
    },
  };
  return { prisma, service: new UsersService(prisma as any) };
}

describe('UsersService.findOrCreateByVerifiedIdentity', () => {
  it('auto-creates a user on first login', async () => {
    const { prisma, service } = setup();
    const user = await service.findOrCreateByVerifiedIdentity({
      provider: 'email',
      providerUserId: 'a@b.com',
      email: 'A@B.com',
    });
    expect(prisma.user.create).toHaveBeenCalledOnce();
    expect(user.email).toBe('a@b.com');
  });

  it('reuses the user for a known identity', async () => {
    const existing = { id: 'u1', status: 'ACTIVE' };
    const { prisma, service } = setup({ identity: { user: existing } });
    const user = await service.findOrCreateByVerifiedIdentity({
      provider: 'email',
      providerUserId: 'a@b.com',
      email: 'a@b.com',
    });
    expect(user).toBe(existing);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('links a new provider to the existing user with the same verified email', async () => {
    const { prisma, service } = setup({ userByEmail: { id: 'u1', status: 'ACTIVE', email: 'a@b.com' } });
    await service.findOrCreateByVerifiedIdentity({
      provider: 'google',
      providerUserId: 'g-1',
      email: 'a@b.com',
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update.mock.calls[0][0].data.identities).toEqual({
      create: { provider: 'google', providerUserId: 'g-1' },
    });
  });

  it('refuses disabled accounts', async () => {
    const { service } = setup({ identity: { user: { id: 'u1', status: 'DISABLED' } } });
    await expect(
      service.findOrCreateByVerifiedIdentity({ provider: 'email', providerUserId: 'a@b.com', email: 'a@b.com' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
