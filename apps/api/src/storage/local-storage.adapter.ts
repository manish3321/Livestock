import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { StoragePort, StoredFile } from './storage.port';

const ROOT = join(process.cwd(), 'uploads');

/** Development driver: files under ./uploads. */
@Injectable()
export class LocalStorageAdapter implements StoragePort {
  async put(key: string, contents: Buffer, _contentType: string): Promise<StoredFile> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  private resolve(key: string): string {
    const path = normalize(join(ROOT, key));
    if (!path.startsWith(ROOT)) throw new Error('Invalid storage key');
    return path;
  }
}
