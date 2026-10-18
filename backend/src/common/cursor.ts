import { BadRequestException } from '@nestjs/common';

/**
 * Opaque keyset cursor over (timestamp, id). Both columns are immutable per
 * row, so rows can never move between pages and a cursor stays valid even if
 * the row it points at is deleted.
 */
export const encodeCursor = (at: Date, id: string) =>
  Buffer.from(`${at.getTime()}.${id}`).toString('base64url');

export function decodeCursor(cursor: string): { at: Date; id: string } {
  const [ms, id] = Buffer.from(cursor, 'base64url').toString().split('.', 2);
  const at = new Date(Number(ms));
  if (!id || Number.isNaN(at.getTime())) throw new BadRequestException('Invalid cursor.');
  return { at, id };
}

/** Prisma `where` fragment selecting rows strictly after `cursor` in (field desc, id desc) order. */
export function afterCursor<F extends string>(field: F, cursor: string | undefined) {
  if (!cursor) return {};
  const { at, id } = decodeCursor(cursor);
  return {
    OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: id } }],
  } as Record<'OR', Record<string, unknown>[]>;
}

export const clampLimit = (limit: number | undefined, def = 25, max = 100) =>
  Math.min(Math.max(limit ?? def, 1), max);
