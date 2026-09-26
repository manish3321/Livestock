const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

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
const p = new PrismaClient();

(async () => {
  const rows = await p.task.findMany({ take: 5, orderBy: { dueAt: 'asc' } });
  console.log('findMany ok:', rows.length, rows.map((r) => r.type).join(', '));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
