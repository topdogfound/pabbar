import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { StorageService } from './storage.service.js';

export const UPLOADS_PATH = '/uploads';

@Injectable()
export class LocalStorageService extends StorageService {
  readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.get<string>('UPLOADS_DIR') ?? 'uploads');
    this.baseUrl = (config.get<string>('ASSETS_BASE_URL') ?? UPLOADS_PATH).replace(/\/+$/, '');
  }

  async put(key: string, data: Buffer, _contentType: string) {
    const file = this.pathFor(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }

  publicUrl(key: string) {
    return `${this.baseUrl}/${key}`;
  }

  private pathFor(key: string) {
    const file = resolve(this.root, key);
    if (!file.startsWith(this.root + sep)) throw new Error('Invalid storage key.');
    return file;
  }
}
