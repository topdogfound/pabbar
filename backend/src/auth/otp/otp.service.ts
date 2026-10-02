import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { OtpPurpose } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OTP_SENDERS, type OtpChannelName, type OtpSender } from './otp-sender.js';

export const OTP_TTL_MINUTES = 10;
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 10;

/**
 * What a code is for. Codes are scoped to (channel, destination, purpose, user):
 * an EMAIL_CHANGE code can't sign anyone in, a login code can't change an email,
 * and one scope's requests never cancel or rate-limit another scope's codes.
 */
export type OtpScope = { purpose: 'LOGIN' } | { purpose: 'EMAIL_CHANGE'; userId: string };
const LOGIN: OtpScope = { purpose: 'LOGIN' };

function scopeWhere(scope: OtpScope): { purpose: OtpPurpose; userId: string | null } {
  return { purpose: scope.purpose, userId: scope.purpose === 'LOGIN' ? null : scope.userId };
}

@Injectable()
export class OtpService {
  private readonly senders: Map<OtpChannelName, OtpSender>;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(OTP_SENDERS) senders: OtpSender[],
  ) {
    this.senders = new Map(senders.map((s) => [s.channel, s]));
    this.secret = config.getOrThrow<string>('OTP_SECRET');
  }

  /** Issues a code. Returns the normalized destination and resend delay. */
  async request(
    channel: OtpChannelName,
    rawDestination: string,
    opts: { scope?: OtpScope; ip?: string } = {},
  ) {
    const sender = this.sender(channel);
    const destination = sender.normalize(rawDestination);
    const scope = opts.scope ?? LOGIN;
    const scoped = { channel, destination, ...scopeWhere(scope) };
    const now = new Date();

    const latest = await this.prisma.otpChallenge.findFirst({
      where: scoped,
      orderBy: { createdAt: 'desc' },
    });
    if (latest) {
      const wait =
        OTP_RESEND_SECONDS -
        Math.floor((now.getTime() - latest.createdAt.getTime()) / 1000);
      if (wait > 0) {
        throw new HttpException(
          { message: 'Please wait before requesting another code.', resendIn: wait },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const lastHour = await this.prisma.otpChallenge.count({
      where: { ...scoped, createdAt: { gt: new Date(now.getTime() - 3600_000) } },
    });
    if (lastHour >= OTP_MAX_PER_HOUR) {
      throw new HttpException(
        { message: 'Too many codes requested. Try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        ...scoped,
        codeHash: this.hash(scope, destination, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
        ip: opts.ip,
      },
    });

    // On a failed send, drop the new row so the previous code stays valid and
    // the attempt doesn't count toward the cooldown or hourly cap.
    try {
      await sender.send(destination, code, OTP_TTL_MINUTES);
    } catch {
      await this.prisma.otpChallenge.delete({ where: { id: challenge.id } });
      throw new ServiceUnavailableException('Could not send the code. Please try again.');
    }

    // Only the newest code (per scope) is ever valid.
    await this.prisma.otpChallenge.updateMany({
      where: { ...scoped, consumedAt: null, id: { not: challenge.id } },
      data: { consumedAt: now },
    });
    return { destination, resendIn: OTP_RESEND_SECONDS };
  }

  /** Verifies a code, consuming it on success. Returns the normalized destination. */
  async verify(
    channel: OtpChannelName,
    rawDestination: string,
    code: string,
    scope: OtpScope = LOGIN,
  ) {
    const destination = this.sender(channel).normalize(rawDestination);
    const invalid = new BadRequestException('Invalid or expired code.');

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { channel, destination, ...scopeWhere(scope), consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !challenge ||
      challenge.expiresAt < new Date() ||
      challenge.attempts >= OTP_MAX_ATTEMPTS
    ) {
      throw invalid;
    }

    // Count the attempt first so concurrent guesses can't exceed the limit.
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (count === 0) throw invalid;

    const expected = Buffer.from(challenge.codeHash);
    const actual = Buffer.from(this.hash(scope, destination, code));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw invalid;
    }

    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw invalid;

    return { destination };
  }

  private sender(channel: OtpChannelName) {
    const sender = this.senders.get(channel);
    if (!sender) throw new BadRequestException('Unsupported channel.');
    return sender;
  }

  /** Binds the code to its scope too, so a row can't be redeemed under another one. */
  private hash(scope: OtpScope, destination: string, code: string) {
    const { purpose, userId } = scopeWhere(scope);
    return createHmac('sha256', this.secret)
      .update(`${purpose}:${userId ?? ''}:${destination}:${code}`)
      .digest('hex');
  }
}
