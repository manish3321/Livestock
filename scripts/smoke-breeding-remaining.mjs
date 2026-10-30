/**
 * Finish remaining breeding smokes without a physical phone:
 * 1) Seed COLOSTRUM urgencies GREEN / AMBER / RED via calving + lactationStart tweak
 * 2) Complete VWP service write with confirm path (API-level)
 * 3) Assert board shape mobile Walk needs (groups, doBy/why/late/urgency, actions)
 *
 * Run with API up: node scripts/smoke-breeding-remaining.mjs
 */
import { PrismaClient } from '../apps/api/node_modules/@prisma/client/index.js';

const API = process.env.API_URL ?? 'http://localhost:4001';
const prisma = new PrismaClient();

async function login() {
  const res = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@farm.local', password: 'ChangeMe123!' }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.accessToken;
}

async function api(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  return json;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureColostrumColors(token, farmId) {
  // Pick three open/pregnant dams (or any female buffalo/cow) and force fresh calving + COLOSTRUM tasks.
  const dams = await prisma.animal.findMany({
    where: {
      farmId,
      deletedAt: null,
      gender: 'FEMALE',
      species: { in: ['BUFFALO', 'COW'] },
      status: { notIn: ['SOLD', 'DEAD', 'CULLED'] },
    },
    take: 3,
    orderBy: { herdNumber: 'asc' },
  });
  assert(dams.length >= 3, `need ≥3 females, got ${dams.length}`);

  const hoursOffsets = [1, 4, 8]; // green, amber, red
  const results = [];

  for (let i = 0; i < 3; i++) {
    const dam = dams[i];
    const hoursAgo = hoursOffsets[i];
    const calvingAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    await api(token, '/v1/breeding/calving', {
      method: 'POST',
      body: JSON.stringify({
        damId: dam.id,
        calvingAt: calvingAt.toISOString(),
        calves: [{ sex: 'FEMALE', birthWeightKg: 28 }],
        complications: 'NONE',
        placentaExpelledWithin12h: true,
        difficulty: 'EASY',
        outcome: 'LIVE_SINGLE',
      }),
    });

    // COLOSTRUM tasks are on the calf — backdate calf DOB for G/A/R hours.
    const calf = await prisma.animal.findFirst({
      where: { farmId, damId: dam.id, source: 'BORN', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    assert(calf, `no calf for dam ${dam.herdNumber ?? dam.tag}`);
    await prisma.animal.update({
      where: { id: calf.id },
      data: { dateOfBirth: calvingAt },
    });
    await prisma.animal.update({
      where: { id: dam.id },
      data: { lactationStartDate: calvingAt },
    });

    results.push({
      damId: dam.id,
      calfId: calf.id,
      shortNo: calf.herdNumber ?? calf.tag,
      hoursAgo,
    });
  }

  const board = await api(token, '/v1/breeding/board');
  const colo = board.groups.find((g) => g.key === 'COLOSTRUM');
  assert(colo, 'COLOSTRUM group missing after calving');
  assert(colo.items.length >= 3, `expected ≥3 colostrum rows, got ${colo.items.length}`);

  const urgencies = new Set(colo.items.map((r) => r.urgency));
  assert(urgencies.has('GREEN'), `missing GREEN in ${[...urgencies]}`);
  assert(urgencies.has('AMBER'), `missing AMBER in ${[...urgencies]}`);
  assert(urgencies.has('RED'), `missing RED in ${[...urgencies]}`);
  assert(colo.colour === 'RED', `expected group RED when any row >6h, got ${colo.colour}`);

  for (const row of colo.items) {
    assert(row.doByEn && row.whyEn, `colostrum row ${row.shortNo} missing doBy/why`);
    assert(row.actions?.some((a) => a.key === 'RECORD_COLOSTRUM'), `no RECORD_COLOSTRUM on ${row.shortNo}`);
  }

  console.log('OK colostrum colours', {
    groupColour: colo.colour,
    rows: colo.items.map((r) => `${r.shortNo}:${r.urgency}:${r.whyEn}`),
    seeded: results,
  });
  return { board, colo };
}

async function completeVwpService(token, farmId) {
  const configs = await api(token, '/v1/species-config');
  const cfg = (configs ?? []).find((row) => row.species === 'BUFFALO');
  const vwp = cfg?.voluntaryWaitingDays ?? 60;
  const lac = new Date(Date.now() - Math.floor(vwp / 2) * 24 * 60 * 60 * 1000);

  const dam =
    (await prisma.animal.findFirst({
      where: {
        farmId,
        deletedAt: null,
        gender: 'FEMALE',
        species: 'BUFFALO',
        isPregnant: false,
        lactationStartDate: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    })) ??
    (await prisma.animal.findFirst({
      where: { farmId, deletedAt: null, gender: 'FEMALE', species: 'BUFFALO' },
    }));

  assert(dam, 'no buffalo dam for VWP service');
  await prisma.animal.update({
    where: { id: dam.id },
    data: { lactationStartDate: lac, isPregnant: false, expectedCalvingDate: null },
  });

  const created = await api(token, '/v1/breeding', {
    method: 'POST',
    body: JSON.stringify({
      motherId: dam.id,
      matingType: 'AI',
      fatherTagOrAi: 'SMOKE-STRW-1',
      matingDate: new Date().toISOString().slice(0, 10),
      pregnancyStatus: 'OPEN',
    }),
  });

  assert(created?.id, 'service create returned no id');
  assert(created.motherId === dam.id, 'wrong mother');
  console.log('OK VWP service write', {
    breedingId: created.id,
    mother: dam.herdNumber ?? dam.tag,
    daysIntoVwp: Math.floor(vwp / 2),
    status: created.pregnancyStatus,
  });
  return created;
}

async function assertMobileBoardContract(board) {
  // Fields BreedingScreen Walk path reads from /v1/breeding/board
  for (const group of board.groups) {
    assert(group.key && group.labelEn && group.items, `bad group ${JSON.stringify(group.key)}`);
    for (const row of group.items) {
      assert(row.taskId && row.animalId && row.shortNo, `row ids missing in ${group.key}`);
      assert('doByEn' in row && 'whyEn' in row && 'lateEn' in row && 'urgency' in row, `timing fields missing on ${row.shortNo}`);
      assert(Array.isArray(row.actions), `actions missing on ${row.shortNo}`);
    }
  }
  assert(typeof board.decisionQueue?.count === 'number', 'decisionQueue.count missing');
  assert(typeof board.summary?.totalActions === 'number', 'summary.totalActions missing');
  console.log('OK mobile board contract', {
    groups: board.groups.map((g) => `${g.key}:${g.items.length}`),
    decisions: board.decisionQueue.count,
    total: board.summary.totalActions,
  });
}

async function main() {
  const token = await login();
  const me = await api(token, '/v1/auth/me');
  const farmId = me.farmId ?? me.user?.farmId;
  assert(farmId, 'no farmId on /auth/me');

  const { board } = await ensureColostrumColors(token, farmId);
  await assertMobileBoardContract(board);
  await completeVwpService(token, farmId);

  // Re-fetch board after service for mobile parity check
  const board2 = await api(token, '/v1/breeding/board');
  await assertMobileBoardContract(board2);
  console.log('ALL SMOKES PASSED');
}

main()
  .catch((err) => {
    console.error('FAIL', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
