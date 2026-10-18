import { applyDecorators } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

/**
 * Admin pages are rendered by Next on the server, so every admin shares the
 * Next server's IP. Reads are gated by session + permission and are paginated;
 * a per-IP limit would only cause false lockouts (same reasoning as /auth/me).
 */
export const ReadEndpoint = () => applyDecorators(SkipThrottle());

/** Per-IP cap on state-changing admin calls. */
export const WriteEndpoint = (limit = 60) =>
  applyDecorators(Throttle({ default: { limit, ttl: 60_000 } }));
