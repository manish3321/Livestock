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

/** Stale Postgres TaskType labels → current Prisma schema values. */
const REMAP = {
  ANESTRUS_VET: 'SILENT_HEAT_CHECK',
  ANESTRUS: 'SILENT_HEAT_CHECK',
  ANESTRUS_MINERAL: 'SILENT_HEAT_CHECK',
  ANESTRUS_DECISION: 'REPEAT_BREEDER',
  SYNC_INJECTION: 'SERVICE_WINDOW',
  SYNC_AI: 'SERVICE_WINDOW',
  FEED_TRANSITION: 'TREATMENT_FOLLOWUP',
  PROTOCOL_BROKEN: 'VET_URGENT',
  CALF_HEALTH_CHECK: 'POSTPARTUM_CHECK',
  CYCLING_UNBRED: 'HEAT_WATCH',
  PD_STALLED: 'PREGNANCY_CHECK',
};

const SCHEMA_TYPES = new Set([
  'VACCINATION_DUE',
  'MEDICATION_DOSE',
  'COLOSTRUM_FEED',
  'CALVING_WATCH',
  'HEAT_WATCH',
  'SILENT_HEAT_CHECK',
  'SERVICE_WINDOW',
  'PREGNANCY_CHECK',
  'DRY_OFF',
  'POSTPARTUM_CHECK',
  'REPEAT_BREEDER',
  'VET_URGENT',
  'MILK_WITHHOLD_END',
  'STOCK_REORDER',
  'LOT_EXPIRING',
  'MISSING_PRODUCTION',
  'YIELD_DROP',
  'STOCK_RECONCILE',
  'TANK_VARIANCE',
  'APPLY_MARKER',
  'REMOVE_MARKER',
  'RETAG_REQUIRED',
  'TREATMENT_FOLLOWUP',
]);

const p = new PrismaClient();

async function main() {
  for (const [from, to] of Object.entries(REMAP)) {
    const n = await p.$executeRawUnsafe(
      `UPDATE "Task" SET type = '${to}'::"TaskType" WHERE type::text = '${from}'`,
    );
    if (n) console.log(`${from} -> ${to}: ${n}`);
    try {
      const pn = await p.$executeRawUnsafe(
        `UPDATE "NotificationPreference" SET "taskType" = '${to}'::"TaskType" WHERE "taskType"::text = '${from}'`,
      );
      if (pn) console.log(`pref ${from} -> ${to}: ${pn}`);
    } catch {
      /* table/column may not exist in older DBs */
    }
  }

  const after = await p.$queryRawUnsafe(
    `SELECT type::text AS type, count(*)::int AS n FROM "Task" GROUP BY type::text ORDER BY n DESC`,
  );
  const unknown = after.filter((r) => !SCHEMA_TYPES.has(r.type));
  console.log('task types after:', JSON.stringify(after));
  if (unknown.length) {
    console.error('still unknown:', JSON.stringify(unknown));
    process.exitCode = 1;
  } else {
    console.log('all Task.type values are in Prisma TaskType');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
