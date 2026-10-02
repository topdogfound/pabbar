import { describe, expect, it, vi } from 'vitest';
import { SessionCleanupService } from './session-cleanup.service.js';

describe('SessionCleanupService', () => {
  const prisma = () => ({
    session: {
      findMany: vi.fn().mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  });

  it('purges expired sessions in batches', async () => {
    const p = prisma();
    const svc = new SessionCleanupService(p as any, null);
    expect(await svc.run()).toBe(2);
    expect(p.session.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
  });

  it('skips when another instance holds the lock', async () => {
    const p = prisma();
    const svc = new SessionCleanupService(p as any, { set: vi.fn().mockResolvedValue(null) } as any);
    expect(await svc.run()).toBe(0);
    expect(p.session.findMany).not.toHaveBeenCalled();
  });
});
