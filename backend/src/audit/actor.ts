import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/** Who did it, snapshotted: the audit row must stay readable after the user is gone. */
export interface AuditActor {
  id: string | null;
  email: string | null;
  name: string | null;
  impersonatorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export function actorFrom(req: Request): AuditActor {
  const user = req.user;
  const incoming = req.get('x-request-id');
  return {
    id: user?.id ?? null,
    email: user?.email ?? null,
    name: user?.name ?? null,
    impersonatorId: req.impersonatorId ?? null,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    requestId: incoming && incoming.length <= 64 ? incoming : randomUUID(),
  };
}
