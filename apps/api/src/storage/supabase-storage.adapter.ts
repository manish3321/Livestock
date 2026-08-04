import { Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import type { StoragePort, StoredFile } from './storage.port';

/**
 * Supabase Storage driver using the REST API directly (no SDK dependency).
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_BUCKET.
 */
@Injectable()
export class SupabaseStorageAdapter implements StoragePort {
  async put(key: string, contents: Buffer, contentType: string): Promise<StoredFile> {
    const { url } = await this.request(key, {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(contents),
    });
    return { key, url };
  }

  async get(key: string): Promise<Buffer> {
    const env = loadEnv();
    const res = await fetch(this.objectUrl(key), {
      headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new Error(`Supabase storage get failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.request(key, { method: 'DELETE' });
  }

  private objectUrl(key: string): string {
    const env = loadEnv();
    return `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_BUCKET}/${key}`;
  }

  private async request(key: string, init: RequestInit): Promise<{ url: string }> {
    const env = loadEnv();
    const url = this.objectUrl(key);
    const res = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase storage ${init.method} failed: ${res.status}`);
    }
    return { url };
  }
}
