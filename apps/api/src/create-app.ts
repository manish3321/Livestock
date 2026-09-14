import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AbstractHttpAdapter } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

function corsOrigin(allowed: string[]): (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void {
  return (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
    try {
      const host = new URL(origin).hostname;
      if (host.endsWith('.vercel.app') || host === 'vercel.app') return cb(null, true);
    } catch {
      /* ignore */
    }
    return cb(null, false);
  };
}

/** Shared Nest bootstrap so local `main` and the Vercel function stay in lockstep. */
export async function createFarmApp(
  adapter?: AbstractHttpAdapter,
): Promise<{ app: INestApplication; port: number }> {
  const env = loadEnv();
  const app = adapter
    ? await NestFactory.create(AppModule, adapter, { logger: ['error', 'warn', 'log'] })
    : await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  app.use(helmet());
  app.enableCors({
    origin: corsOrigin(env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)),
    credentials: false,
  });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  app.enableShutdownHooks();
  return { app, port: env.PORT };
}
