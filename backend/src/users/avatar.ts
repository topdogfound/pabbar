import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIZE = 512;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Detects the real format from magic bytes (never trust the client MIME). */
export function sniffImageType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Validates an uploaded file and returns a metadata-free 512px webp. */
export async function processAvatar(file: { mimetype: string; buffer: Buffer; size?: number }) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new BadRequestException('Only JPEG, PNG or WebP images are allowed.');
  }
  if (file.buffer.length > AVATAR_MAX_BYTES) {
    throw new BadRequestException('Image must be 2 MB or smaller.');
  }
  if (sniffImageType(file.buffer) !== file.mimetype) {
    throw new BadRequestException('File content does not match its type.');
  }
  try {
    return await sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new BadRequestException('Could not read that image.');
  }
}
