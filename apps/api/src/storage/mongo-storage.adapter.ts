import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { GridFSBucket, MongoClient } from 'mongodb';
import { loadEnv } from '../config/env';
import type { StoragePort, StoredFile } from './storage.port';

/**
 * Production file driver: receipts and exports in MongoDB GridFS.
 * Requires MONGODB_URI. MONGODB_BUCKET names the GridFS collection prefix.
 */
@Injectable()
export class MongoStorageAdapter implements StoragePort, OnModuleDestroy {
  private readonly logger = new Logger('MongoStorage');
  private client: MongoClient | undefined;
  private bucket: GridFSBucket | undefined;

  async put(key: string, contents: Buffer, contentType: string): Promise<StoredFile> {
    const bucket = await this.ensureBucket();
    await this.delete(key);
    await new Promise<void>((resolve, reject) => {
      const stream = bucket.openUploadStream(key, {
        metadata: { key, contentType },
      });
      stream.once('error', reject);
      stream.once('finish', () => resolve());
      stream.end(contents);
    });
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    const bucket = await this.ensureBucket();
    const files = await bucket.find({ filename: key }).toArray();
    if (files.length === 0) {
      throw new Error(`Mongo storage get failed: not found (${key})`);
    }
    const chunks: Buffer[] = [];
    const download = bucket.openDownloadStreamByName(key);
    for await (const chunk of download) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const bucket = await this.ensureBucket();
    const files = await bucket.find({ filename: key }).toArray();
    await Promise.all(files.map((file) => bucket.delete(file._id)));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.bucket = undefined;
  }

  private async ensureBucket(): Promise<GridFSBucket> {
    if (this.bucket) return this.bucket;
    const env = loadEnv();
    if (!env.MONGODB_URI) {
      throw new Error('MONGODB_URI is required when STORAGE_DRIVER=mongodb');
    }
    this.client = new MongoClient(env.MONGODB_URI);
    await this.client.connect();
    this.bucket = new GridFSBucket(this.client.db(), {
      bucketName: env.MONGODB_BUCKET,
    });
    this.logger.log(`GridFS ready (bucket ${env.MONGODB_BUCKET})`);
    return this.bucket;
  }
}
