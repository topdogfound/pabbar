import { Global, Logger, Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/** `null` when REDIS_URL is unset (allowed in non-production only). */
export const REDIS = Symbol('REDIS');
export type RedisClient = Redis | null;

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RedisClient => {
        const url = config.get<string>('REDIS_URL');
        const log = new Logger('Redis');
        if (!url) {
          if (config.get('NODE_ENV') === 'production') {
            throw new Error('REDIS_URL is required in production.');
          }
          log.warn(
            'REDIS_URL not set: using in-memory rate limiting and no session cache (single instance only).',
          );
          return null;
        }
        const client = new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
        client.on('error', (err) => log.error(err.message));
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async onApplicationShutdown() {
    await this.redis?.quit().catch(() => undefined);
  }
}
