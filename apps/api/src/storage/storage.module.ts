import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { LocalStorageAdapter } from './local-storage.adapter';
import { MongoStorageAdapter } from './mongo-storage.adapter';
import { R2StorageAdapter } from './r2-storage.adapter';
import { STORAGE_PORT } from './storage.port';

@Global()
@Module({
  providers: [
    LocalStorageAdapter,
    MongoStorageAdapter,
    R2StorageAdapter,
    {
      provide: STORAGE_PORT,
      useFactory: (
        local: LocalStorageAdapter,
        mongo: MongoStorageAdapter,
        r2: R2StorageAdapter,
      ) => {
        const driver = loadEnv().STORAGE_DRIVER;
        if (driver === 'mongodb') return mongo;
        if (driver === 'r2') return r2;
        return local;
      },
      inject: [LocalStorageAdapter, MongoStorageAdapter, R2StorageAdapter],
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
