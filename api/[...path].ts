import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express from 'express';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { createFarmApp as CreateFarmApp } from '../apps/api/src/create-app';

/**
 * Vercel serverless entry for the Nest API.
 *
 * The static web app posts to same-origin `/v1/...`. vercel.json rewrites
 * those to `/api/v1/...`, this function strips `/api`, and Nest sees the
 * same routes as localhost.
 *
 * Load the compiled API so Nest decorator metadata is already emitted.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createFarmApp } = require('../apps/api/dist/create-app') as {
  createFarmApp: typeof CreateFarmApp;
};

export const config = {
  api: { bodyParser: false },
};

let server: express.Express | null = null;

async function getServer(): Promise<express.Express> {
  if (server) return server;
  const instance = express();
  const { app } = await createFarmApp(new ExpressAdapter(instance));
  await app.init();
  server = instance;
  return instance;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (typeof req.url === 'string' && req.url.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  const app = await getServer();
  app(req, res);
}
