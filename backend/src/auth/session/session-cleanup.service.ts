import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS, type RedisClient } from '../../redis/redis.module.js';

const LOCK_KEY = 'lock:session-cleanup';
const LOCK_TTL_MS = 10 * 60_000;
const BATCH = 1000;

/** Hourly purge of expired sessions; a Redis lock keeps it to one instance. */
@Injectable()
export class SessionCleanupService {
  private readonly log = new Logger(SessionCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    if (this.redis) {
      const got = await this.redis
        .set(LOCK_KEY, randomUUID(), 'PX', LOCK_TTL_MS, 'NX')
        .catch(() => null);
      if (got !== 'OK') return 0;
    }
    return this.purge();
  }

  async purge(now = new Date()) {
    let total = 0;
    for (;;) {
      const rows = await this.prisma.session.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true },
        take: BATCH,
      });
      if (rows.length === 0) break;
      const { count } = await this.prisma.session.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      total += count;
      if (rows.length < BATCH) break;
    }
    if (total > 0) this.log.log(`Deleted ${total} expired sessions`);
    return total;
  }
}
