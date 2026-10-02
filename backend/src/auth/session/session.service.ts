import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';

export const SESSION_COOKIE = 'pabbar_session';
const DAY_MS = 86_400_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class SessionService {
  private readonly ttlDays: number;
  private readonly rememberTtlDays: number;
  private readonly secure: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlDays = Number(config.get('SESSION_TTL_DAYS') ?? 1);
    this.rememberTtlDays = Number(config.get('SESSION_REMEMBER_TTL_DAYS') ?? 30);
    this.secure = config.get('NODE_ENV') === 'production';
  }

  /** Creates a session and returns the raw token (only its hash is stored). */
  async create(
    userId: string,
    opts: { remember?: boolean; userAgent?: string; ip?: string } = {},
  ) {
    const token = randomBytes(32).toString('base64url');
    const days = opts.remember ? this.rememberTtlDays : this.ttlDays;
    const expiresAt = new Date(Date.now() + days * DAY_MS);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        remember: !!opts.remember,
        userAgent: opts.userAgent?.slice(0, 255),
        ip: opts.ip,
        expiresAt,
      },
    });
    return { token, expiresAt, remember: !!opts.remember };
  }

  async validate(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      return null;
    }
    if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }
    return session;
  }

  async revoke(token: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash: this.hash(token) } });
  }

  setCookie(res: Response, session: { token: string; expiresAt: Date; remember: boolean }) {
    res.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      // Without "remember me" this is a browser-session cookie.
      ...(session.remember ? { expires: session.expiresAt } : {}),
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
