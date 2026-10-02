import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Gender, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { parseDob } from '../auth/dto/profile.dto.js';

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
}

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

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
  private readonly log = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Uploaded avatar (via storage/CDN) wins over an OAuth-provided picture. */
  toPublicUser(u: User): PublicUser {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarKey ? this.storage.publicUrl(u.avatarKey) : (u.avatarUrl ?? null),
      dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString().slice(0, 10) : null,
      gender: u.gender ?? null,
    };
  }

  /** Single UPDATE. Only provided fields change; null clears dateOfBirth/gender. */
  updateProfile(
    userId: string,
    dto: { name?: string; dateOfBirth?: string | null; gender?: Gender | null },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        gender: dto.gender,
        dateOfBirth:
          dto.dateOfBirth === undefined
            ? undefined
            : dto.dateOfBirth === null
              ? null
              : parseDob(dto.dateOfBirth),
      },
    });
  }

  async setAvatar(user: Pick<User, 'id' | 'avatarKey'>, image: Buffer) {
    const key = `avatars/${user.id}/${randomUUID()}.webp`;
    await this.storage.put(key, image, 'image/webp');
    let updated: User;
    try {
      updated = await this.prisma.user.update({ where: { id: user.id }, data: { avatarKey: key } });
    } catch (err) {
      await this.deleteObject(key);
      throw err;
    }
    if (user.avatarKey) await this.deleteObject(user.avatarKey);
    return updated;
  }

  /** Clears both the uploaded and the OAuth-provided picture. */
  async removeAvatar(user: Pick<User, 'id' | 'avatarKey'>) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarKey: null, avatarUrl: null },
    });
    if (user.avatarKey) await this.deleteObject(user.avatarKey);
    return updated;
  }

  /** True when another account already owns this (normalized) email. */
  async isEmailTaken(email: string, exceptUserId: string) {
    const other = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return !!other && other.id !== exceptUserId;
  }

  /** Atomically moves the user and their email identity to a verified address. */
  async changeEmail(userId: string, email: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const moved = await tx.identity.updateMany({
          where: { userId, provider: 'email' },
          data: { providerUserId: email },
        });
        if (moved.count === 0) {
          await tx.identity.create({
            data: { userId, provider: 'email', providerUserId: email },
          });
        }
        return tx.user.update({
          where: { id: userId },
          data: { email, emailVerifiedAt: new Date() },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('That email is already in use.');
      }
      throw err;
    }
  }

  /** Hard delete; identities and sessions cascade. */
  async deleteAccount(user: Pick<User, 'id' | 'avatarKey'>) {
    await this.prisma.user.delete({ where: { id: user.id } });
    if (user.avatarKey) await this.deleteObject(user.avatarKey);
  }

  private async deleteObject(key: string) {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.log.warn(`Failed to delete ${key}: ${(err as Error).message}`);
    }
  }

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
