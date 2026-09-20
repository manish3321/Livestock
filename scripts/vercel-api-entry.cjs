'use strict';

/**
 * Vercel Node handler. The compiled Nest app already has decorator metadata.
 * Accept both `/v1/...` and rewritten `/api/v1/...` so routing works either way.
 */
require('reflect-metadata');

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

// Serverless: one Prisma client per isolate — keep the pool tiny against PgBouncer.
function withConnectionLimit(url, limit) {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}`;
}
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = withConnectionLimit(process.env.DATABASE_URL, 1);
}

const express = require('express');
const { ExpressAdapter } = require('@nestjs/platform-express');
const { createFarmApp } = require('../apps/api/dist/create-app');

let server = null;

function nestUrl(url) {
  if (typeof url !== 'string') return url;
  const q = url.indexOf('?');
  const path = q === -1 ? url : url.slice(0, q);
  const search = q === -1 ? '' : url.slice(q);
  if (path === '/api' || path.startsWith('/api/')) {
    return `${path.slice(4) || '/'}${search}`;
  }
  return url;
}

async function getServer() {
  if (server) return server;
  const instance = express();
  const { app } = await createFarmApp(new ExpressAdapter(instance));
  await app.init();
  server = instance;
  return instance;
}

module.exports = async function handler(req, res) {
  req.url = nestUrl(req.url);
  const app = await getServer();
  app(req, res);
};
