import type { User } from '../generated/prisma/client.js';
import type { Access } from '../rbac/access.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
      /** Set when a platform operator is viewing the app as `user`. */
      impersonatorId?: string;
      sessionExpiresAt?: Date;
      /** Resolved by PermissionsGuard on `/admin/:scope/*` routes. */
      access?: Access;
    }
  }
}

export {};
