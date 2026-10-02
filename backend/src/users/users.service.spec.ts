import { ConflictException, ForbiddenException } from '@nestjs/common';
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
  const storage = {
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    publicUrl: (k: string) => `/uploads/${k}`,
  };
  return { prisma, storage, service: new UsersService(prisma as any, storage as any) };
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

describe('UsersService profile', () => {
  it('toPublicUser prefers the uploaded avatar and formats the date', () => {
    const { service } = setup();
    const base: any = { id: 'u', email: 'a@b.com', name: 'A', avatarUrl: 'https://g/x.png', gender: 'OTHER' };
    expect(service.toPublicUser({ ...base, avatarKey: 'avatars/u/k.webp', dateOfBirth: new Date('1990-05-06T00:00:00Z') })).toEqual({
      id: 'u', email: 'a@b.com', name: 'A', avatarUrl: '/uploads/avatars/u/k.webp', dateOfBirth: '1990-05-06', gender: 'OTHER',
    });
    const pub = service.toPublicUser({ ...base, avatarKey: null, dateOfBirth: null });
    expect(pub.avatarUrl).toBe('https://g/x.png');
    expect(pub.dateOfBirth).toBeNull();
  });

  it('updateProfile issues one update; null clears, undefined leaves alone', async () => {
    const { prisma, service } = setup();
    await service.updateProfile('u1', { name: 'N', dateOfBirth: null, gender: 'FEMALE' });
    expect(prisma.user.update).toHaveBeenCalledOnce();
    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data).toEqual({ name: 'N', gender: 'FEMALE', dateOfBirth: null });
    await service.updateProfile('u1', { dateOfBirth: '2000-01-02' });
    const d2 = prisma.user.update.mock.calls[1][0].data;
    expect(d2.dateOfBirth).toEqual(new Date('2000-01-02T00:00:00.000Z'));
    expect(d2.name).toBeUndefined();
  });

  it('isEmailTaken ignores the caller', async () => {
    const { service } = setup({ userByEmail: { id: 'u1' } });
    expect(await service.isEmailTaken('a@b.com', 'u1')).toBe(false);
    expect(await service.isEmailTaken('a@b.com', 'u2')).toBe(true);
  });

  it('changeEmail maps a unique violation to 409', async () => {
    const { prisma, service } = setup();
    (prisma as any).$transaction = vi.fn().mockRejectedValue({ code: 'P2002' });
    await expect(service.changeEmail('u1', 'x@y.com')).rejects.toBeInstanceOf(ConflictException);
  });

  it('changeEmail updates identity and user in one transaction', async () => {
    const { prisma, service } = setup();
    const tx = {
      identity: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn() },
      user: { update: vi.fn().mockResolvedValue({ id: 'u1' }) },
    };
    (prisma as any).$transaction = vi.fn((fn: any) => fn(tx));
    await service.changeEmail('u1', 'x@y.com');
    expect(tx.identity.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', provider: 'email' },
      data: { providerUserId: 'x@y.com' },
    });
    expect(tx.identity.create).not.toHaveBeenCalled();
    expect(tx.user.update.mock.calls[0][0].data.email).toBe('x@y.com');
  });

  it('setAvatar stores a new key and deletes the previous object', async () => {
    const { prisma, storage, service } = setup();
    await service.setAvatar({ id: 'u1', avatarKey: 'avatars/u1/old.webp' }, Buffer.from('x'));
    const key = storage.put.mock.calls[0][0] as string;
    expect(key).toMatch(/^avatars\/u1\/.+\.webp$/);
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ avatarKey: key });
    expect(storage.delete).toHaveBeenCalledWith('avatars/u1/old.webp');
  });

  it('setAvatar cleans up the new object if the DB update fails', async () => {
    const { prisma, storage, service } = setup();
    prisma.user.update.mockRejectedValueOnce(new Error('db'));
    await expect(service.setAvatar({ id: 'u1', avatarKey: null }, Buffer.from('x'))).rejects.toThrow('db');
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
  });

  it('removeAvatar clears both the uploaded and the OAuth picture', async () => {
    const { prisma, storage, service } = setup();
    await service.removeAvatar({ id: 'u1', avatarKey: 'avatars/u1/old.webp' });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ avatarKey: null, avatarUrl: null });
    expect(storage.delete).toHaveBeenCalledWith('avatars/u1/old.webp');
  });

  it('deleteAccount deletes the user then the avatar object', async () => {
    const { prisma, storage, service } = setup();
    (prisma.user as any).delete = vi.fn().mockResolvedValue({});
    await service.deleteAccount({ id: 'u1', avatarKey: 'avatars/u1/a.webp' });
    expect((prisma.user as any).delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(storage.delete).toHaveBeenCalledWith('avatars/u1/a.webp');
  });
});
