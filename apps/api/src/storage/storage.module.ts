import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { LocalStorageAdapter } from './local-storage.adapter';
import { MongoStorageAdapter } from './mongo-storage.adapter';
import { STORAGE_PORT } from './storage.port';

@Global()
@Module({
  providers: [
    LocalStorageAdapter,
    MongoStorageAdapter,
    {
      provide: STORAGE_PORT,
      useFactory: (local: LocalStorageAdapter, mongo: MongoStorageAdapter) =>
        loadEnv().STORAGE_DRIVER === 'mongodb' ? mongo : local,
      inject: [LocalStorageAdapter, MongoStorageAdapter],
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
