import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AVATAR_MAX_BYTES, processAvatar, sniffImageType } from './avatar.js';

const png = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#f00' } }).png().toBuffer();

describe('avatar validation', () => {
  it('sniffs formats from magic bytes', async () => {
    expect(sniffImageType(await png())).toBe('image/png');
    expect(sniffImageType(Buffer.from('<?php echo 1;'))).toBeNull();
  });

  it('re-encodes a valid image to a 512px webp', async () => {
    const out = await processAvatar({ mimetype: 'image/png', buffer: await png() });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([512, 512]);
  });

  it('rejects disallowed MIME types', async () => {
    await expect(
      processAvatar({ mimetype: 'image/gif', buffer: await png() }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects spoofed content', async () => {
    await expect(
      processAvatar({ mimetype: 'image/png', buffer: Buffer.from('not an image at all') }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects declared type that differs from real type', async () => {
    await expect(
      processAvatar({ mimetype: 'image/jpeg', buffer: await png() }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversize files', async () => {
    const big = Buffer.concat([await png(), Buffer.alloc(AVATAR_MAX_BYTES)]);
    await expect(processAvatar({ mimetype: 'image/png', buffer: big })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
