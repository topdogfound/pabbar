import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailOtpSender, type OtpSender } from './otp-sender.js';
import { OtpService, OTP_MAX_ATTEMPTS } from './otp.service.js';

interface Row {
  id: string;
  channel: string;
  destination: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

/** Minimal in-memory stand-in for the otpChallenge delegate. */
function fakePrisma() {
  const rows: Row[] = [];
  let nextId = 1;
  const match = (r: Row, w: any) =>
    (!w.channel || r.channel === w.channel) &&
    (!w.destination || r.destination === w.destination) &&
    (w.id === undefined || (w.id.not !== undefined ? r.id !== w.id.not : r.id === w.id)) &&
    (w.consumedAt !== null || r.consumedAt === null) &&
    (w.attempts?.lt === undefined || r.attempts < w.attempts.lt) &&
    (!w.createdAt?.gt || r.createdAt > w.createdAt.gt);
  return {
    rows,
    otpChallenge: {
      findFirst: async ({ where }: any) =>
        [...rows].reverse().find((r) => match(r, where)) ?? null,
      count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
      create: async ({ data }: any) => {
        const row: Row = {
          id: String(nextId++),
          attempts: 0,
          consumedAt: null,
          createdAt: new Date(),
          ...data,
        };
        rows.push(row);
        return row;
      },
      delete: async ({ where }: any) => {
        const i = rows.findIndex((r) => r.id === where.id);
        return rows.splice(i, 1)[0];
      },
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter((r) => match(r, where));
        for (const r of hit) {
          if (data.consumedAt) r.consumedAt = data.consumedAt;
          if (data.attempts?.increment) r.attempts += data.attempts.increment;
        }
        return { count: hit.length };
      },
    },
  };
}

describe('OtpService', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let sent: string[];
  let failSend: boolean;
  let service: OtpService;

  beforeEach(() => {
    prisma = fakePrisma();
    sent = [];
    failSend = false;
    const sender: OtpSender = {
      channel: 'EMAIL',
      normalize: (d) => d.trim().toLowerCase(),
      send: async (_d, code) => {
        if (failSend) throw new Error('smtp down');
        sent.push(code);
      },
    };
    service = new OtpService(prisma as any, { getOrThrow: () => 'secret' } as any, [sender]);
  });

  it('issues a 6-digit code and stores only a hash', async () => {
    const res = await service.request('EMAIL', ' A@B.com ');
    expect(res).toEqual({ destination: 'a@b.com', resendIn: 30 });
    expect(sent[0]).toMatch(/^\d{6}$/);
    expect(prisma.rows[0].codeHash).not.toContain(sent[0]);
  });

  it('verifies a correct code once, then rejects reuse', async () => {
    await service.request('EMAIL', 'a@b.com');
    await expect(service.verify('EMAIL', 'A@b.com', sent[0])).resolves.toEqual({
      destination: 'a@b.com',
    });
    await expect(service.verify('EMAIL', 'a@b.com', sent[0])).rejects.toThrow();
  });

  it('rejects a wrong code and locks out after max attempts', async () => {
    await service.request('EMAIL', 'a@b.com');
    const wrong = sent[0] === '000000' ? '111111' : '000000';
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(service.verify('EMAIL', 'a@b.com', wrong)).rejects.toThrow();
    }
    // Even the right code fails once attempts are exhausted.
    await expect(service.verify('EMAIL', 'a@b.com', sent[0])).rejects.toThrow();
  });

  it('rejects expired codes', async () => {
    await service.request('EMAIL', 'a@b.com');
    prisma.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.verify('EMAIL', 'a@b.com', sent[0])).rejects.toThrow();
  });

  it('enforces the resend cooldown', async () => {
    await service.request('EMAIL', 'a@b.com');
    const err = await service.request('EMAIL', 'a@b.com').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse().resendIn).toBeGreaterThan(0);
  });

  it('invalidates the previous code when a new one is issued', async () => {
    await service.request('EMAIL', 'a@b.com');
    const first = sent[0];
    prisma.rows[0].createdAt = new Date(Date.now() - 60_000);
    await service.request('EMAIL', 'a@b.com');
    if (first !== sent[1]) {
      await expect(service.verify('EMAIL', 'a@b.com', first)).rejects.toThrow();
    }
    await expect(service.verify('EMAIL', 'a@b.com', sent[1])).resolves.toBeDefined();
  });

  it('returns 503 and leaves no row or cooldown behind when a send fails', async () => {
    await service.request('EMAIL', 'a@b.com');
    prisma.rows[0].createdAt = new Date(Date.now() - 60_000);

    failSend = true;
    const err = await service.request('EMAIL', 'a@b.com').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].consumedAt).toBeNull();

    // An immediate retry isn't blocked by the failed attempt.
    failSend = false;
    await expect(service.request('EMAIL', 'a@b.com')).resolves.toBeDefined();
    expect(sent).toHaveLength(2);
  });

  it('leaves the previous code verifiable after a failed send', async () => {
    await service.request('EMAIL', 'a@b.com');
    prisma.rows[0].createdAt = new Date(Date.now() - 60_000);
    failSend = true;
    await service.request('EMAIL', 'a@b.com').catch(() => {});
    await expect(service.verify('EMAIL', 'a@b.com', sent[0])).resolves.toEqual({
      destination: 'a@b.com',
    });
  });
});

describe('EmailOtpSender', () => {
  it('normalizes emails', () => {
    expect(new EmailOtpSender({} as any).normalize('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
});

vi.mock('../../mail/mail.service.js', () => ({ MailService: class {} }));
