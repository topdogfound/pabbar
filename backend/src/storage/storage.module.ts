import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    LocalStorageService,
    { provide: StorageService, useExisting: LocalStorageService },
  ],
  exports: [StorageService, LocalStorageService],
})
export class StorageModule {}
