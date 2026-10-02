import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface VerifiedIdentity {
  provider: 'email' | 'google' | 'github' | 'phone';
  providerUserId: string;
  /** Must already be verified by the provider / OTP. */
  email?: string;
  phone?: string;
  name?: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Login-only entry point: resolves the user for a verified identity,
   * linking to an existing user by verified email/phone, or provisioning a
   * new one on first sign-in. There is no separate signup flow.
   */
  async findOrCreateByVerifiedIdentity(input: VerifiedIdentity) {
    const { provider, providerUserId } = input;
    const email = input.email?.trim().toLowerCase();
    const now = new Date();

    const existingIdentity = await this.prisma.identity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      include: { user: true },
    });
    if (existingIdentity) {
      return this.assertActive(existingIdentity.user);
    }

    const matched = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : input.phone
        ? await this.prisma.user.findUnique({ where: { phone: input.phone } })
        : null;

    if (matched) {
      this.assertActive(matched);
      return this.prisma.user.update({
        where: { id: matched.id },
        data: {
          emailVerifiedAt: email ? (matched.emailVerifiedAt ?? now) : undefined,
          phoneVerifiedAt: input.phone
            ? (matched.phoneVerifiedAt ?? now)
            : undefined,
          name: matched.name ?? input.name,
          avatarUrl: matched.avatarUrl ?? input.avatarUrl,
          identities: { create: { provider, providerUserId } },
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email,
        emailVerifiedAt: email ? now : undefined,
        phone: input.phone,
        phoneVerifiedAt: input.phone ? now : undefined,
        name: input.name,
        avatarUrl: input.avatarUrl,
        identities: { create: { provider, providerUserId } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  private assertActive<T extends { status: string }>(user: T): T {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('This account is disabled.');
    }
    return user;
  }
}
