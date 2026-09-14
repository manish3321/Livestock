import { createHash, createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import type { StoragePort, StoredFile } from './storage.port';

/**
 * Cloudflare R2 via the S3 API. Phase 7 needs receipt photos in object
 * storage; local/GridFS cannot serve a cooperative delivery photo in production.
 */
@Injectable()
export class R2StorageAdapter implements StoragePort {
  async put(key: string, contents: Buffer, contentType: string): Promise<StoredFile> {
    const cfg = r2Config();
    await signed(cfg, 'PUT', key, contents, contentType);
    return { key, url: publicUrl(cfg, key) };
  }

  async get(key: string): Promise<Buffer> {
    const cfg = r2Config();
    const res = await signed(cfg, 'GET', key);
    if (!res.ok) throw new Error(`R2 get failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const cfg = r2Config();
    await signed(cfg, 'DELETE', key);
  }
}

type R2Config = {
  accountId: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicBase: string;
};

function r2Config(): R2Config {
  const env = loadEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
    throw new Error('R2_* variables are required when STORAGE_DRIVER=r2');
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKey: env.R2_ACCESS_KEY_ID,
    secretKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    publicBase: env.R2_PUBLIC_BASE_URL ?? '',
  };
}

function publicUrl(cfg: R2Config, key: string): string | undefined {
  if (!cfg.publicBase) return undefined;
  return `${cfg.publicBase.replace(/\/$/, '')}/${key}`;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

async function signed(
  cfg: R2Config,
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> {
  const region = 'auto';
  const service = 's3';
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = createHash('sha256').update(payload).digest('hex');
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${cfg.bucket}/${encodedKey}`;
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType && method === 'PUT') headers['content-type'] = contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonical = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonical).digest('hex'),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${cfg.secretKey}`, dateStamp), region), service),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: { ...headers, authorization },
    body: method === 'PUT' ? payload : undefined,
  });
}
