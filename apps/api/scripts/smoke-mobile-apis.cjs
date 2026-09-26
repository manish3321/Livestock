const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv(path.join(__dirname, '..', '.env'));

const BASE = process.env.API_URL || process.env.PORT
  ? `http://127.0.0.1:${process.env.PORT || 4001}`
  : 'http://127.0.0.1:4001';

async function req(method, p, body, token) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, json };
}

(async () => {
  const live = await req('GET', '/health/live');
  console.log('health/live', live.status, live.ok);

  const login = await req('POST', '/v1/auth/login', {
    email: 'admin@farm.local',
    password: process.env.SEED_PASSWORD || 'ChangeMe123!',
    platform: 'android',
    deviceName: 'smoke-test',
  });
  if (!login.ok) {
    console.error('login failed', login.status, login.json);
    process.exit(1);
  }
  const token = login.json.accessToken;
  console.log('login ok');

  const paths = [
    '/v1/auth/me',
    '/v1/tasks?page=1&pageSize=20&dueBefore=' + encodeURIComponent(new Date(Date.now() + 30 * 864e5).toISOString()),
    '/v1/animals?page=1&pageSize=5',
    '/v1/animals/search?q=B',
    '/v1/batches?page=1&pageSize=5',
    '/v1/breeding?page=1&pageSize=5',
    '/v1/breeding/metrics',
    '/v1/health-records?page=1&pageSize=5',
    '/v1/production?page=1&pageSize=5',
    '/v1/feed?page=1&pageSize=5',
    '/v1/inventory?page=1&pageSize=5',
    '/v1/revenue?page=1&pageSize=5',
    '/v1/expenses?page=1&pageSize=5',
    '/v1/rounds/active',
    '/v1/dashboard/summary',
  ];

  let failed = 0;
  for (const p of paths) {
    const r = await req('GET', p, undefined, token);
    const mark = r.ok ? 'OK' : 'FAIL';
    if (!r.ok) failed += 1;
    const hint =
      typeof r.json === 'object' && r.json && 'message' in r.json
        ? String(r.json.message).slice(0, 80)
        : '';
    console.log(mark, r.status, p, hint);
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
