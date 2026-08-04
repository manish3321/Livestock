import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { LocalStorageAdapter } from './local-storage.adapter';
import { STORAGE_PORT } from './storage.port';
import { SupabaseStorageAdapter } from './supabase-storage.adapter';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: () =>
        loadEnv().STORAGE_DRIVER === 'supabase'
          ? new SupabaseStorageAdapter()
          : new LocalStorageAdapter(),
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
