import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import { BatchesService } from '../src/batches/batches.service';
import type { RequestUser } from '../src/common/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeAudit } from './fakes';

const FARM_ID = randomUUID();

function user(farmId = FARM_ID): RequestUser {
  return {
    id: randomUUID(),
    email: 'worker@farm.local',
    farmId,
    role: 'WORKER',
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS.WORKER,
  };
}

type Row = Record<string, any>;

/** Tiny in-memory table: filters by equality / null on the given where keys. */
function table(rows: Row[]) {
  const matches = (r: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => r[k] === v);
  return {
    rows,
    findMany: async ({ where, orderBy }: any = {}) => {
      let out = rows.filter((r) => matches(r, where ?? {}));
      const key = orderBy && Object.keys(orderBy)[0];
      if (key) {
        const dir = orderBy[key] === 'desc' ? -1 : 1;
        out = [...out].sort(
          (a, b) => (a[key].getTime() - b[key].getTime()) * dir,
        );
      }
      return out;
    },
    findFirst: async ({ where }: any) =>
      rows.find((r) => matches(r, where)) ?? null,
    aggregate: async ({ where, _sum }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      const field = Object.keys(_sum)[0]!;
      return {
        _sum: {
          [field]: hit.length
            ? hit.reduce((s, r) => s + Number(r[field]), 0)
            : null,
        },
        _count: hit.length,
      };
    },
  };
}

class BatchesFakePrisma {
  herdBatch = table([]);
  batchIllnessEvent = table([]);
  batchMortalityEvent = table([]);
  batchFeedEvent = table([]);
  batchWaterQualityLog = table([]);
  batchSamplingEvent = table([]);
  batchHarvestEvent = table([]);
  expense = table([]);
  revenue = table([]);
  healthRecord = table([]);
}

const at = (iso: string) => new Date(iso);

function seedBatch(prisma: BatchesFakePrisma, kind: string, farmId = FARM_ID) {
  const id = randomUUID();
  prisma.herdBatch.rows.push({
    id,
    farmId,
    kind,
    category: kind === 'FISH' ? 'ROHU' : 'LAYER',
    name: `${kind} batch`,
    ageFromMonths: 1,
    ageToMonths: 6,
    initialCount: 100,
    currentCount: 90,
    deadCount: 10,
    notes: null,
    deletedAt: null,
    createdAt: at('2026-01-01T00:00:00Z'),
    updatedAt: at('2026-01-02T00:00:00Z'),
  });
  const common = { batchId: id, farmId, notes: null };
  prisma.batchIllnessEvent.rows.push(
    {
      ...common,
      id: randomUUID(),
      condition: 'FEVER',
      count: 3,
      occurredAt: at('2026-02-01T00:00:00Z'),
      resolvedAt: null,
      createdAt: at('2026-02-01T00:00:00Z'),
    },
    {
      ...common,
      id: randomUUID(),
      condition: 'DIARRHEA',
      count: 2,
      occurredAt: at('2026-03-01T00:00:00Z'),
      resolvedAt: null,
      createdAt: at('2026-03-01T00:00:00Z'),
    },
    {
      ...common,
      id: randomUUID(),
      condition: 'FEVER',
      count: 4,
      occurredAt: at('2026-01-10T00:00:00Z'),
      resolvedAt: at('2026-01-20T00:00:00Z'),
      createdAt: at('2026-01-10T00:00:00Z'),
    },
  );
  prisma.batchMortalityEvent.rows.push(
    {
      ...common,
      id: randomUUID(),
      count: 6,
      reason: 'heat',
      occurredAt: at('2026-02-10T00:00:00Z'),
      createdAt: at('2026-02-10T00:00:00Z'),
    },
    {
      ...common,
      id: randomUUID(),
      count: 4,
      reason: null,
      occurredAt: at('2026-03-10T00:00:00Z'),
      createdAt: at('2026-03-10T00:00:00Z'),
    },
  );
  prisma.batchFeedEvent.rows.push(
    {
      ...common,
      id: randomUUID(),
      quantityKg: 12.5,
      feedType: 'starter',
      inventoryItemId: null,
      occurredAt: at('2026-02-02T00:00:00Z'),
      createdAt: at('2026-02-02T00:00:00Z'),
    },
    {
      ...common,
      id: randomUUID(),
      quantityKg: 8,
      feedType: null,
      inventoryItemId: randomUUID(),
      occurredAt: at('2026-02-20T00:00:00Z'),
      createdAt: at('2026-02-20T00:00:00Z'),
    },
  );
  // Fish-only logs exist for every seeded batch so the non-fish case proves
  // the detail payload leaves them out rather than relying on empty tables.
  prisma.batchWaterQualityLog.rows.push({
    ...common,
    id: randomUUID(),
    recordedAt: at('2026-02-05T00:00:00Z'),
    temperatureC: 26.5,
    ph: 7.2,
    dissolvedO2: 5.1,
    createdAt: at('2026-02-05T00:00:00Z'),
  });
  prisma.batchSamplingEvent.rows.push({
    ...common,
    id: randomUUID(),
    sampledAt: at('2026-02-15T00:00:00Z'),
    sampleCount: 10,
    totalWeightGrams: 2500,
    estimatedCount: 90,
    avgWeightGrams: 250,
    createdAt: at('2026-02-15T00:00:00Z'),
  });
  prisma.batchHarvestEvent.rows.push({
    ...common,
    id: randomUUID(),
    quantityKg: 40,
    fishCount: 80,
    quality: 'STANDARD',
    occurredAt: at('2026-03-20T00:00:00Z'),
    createdAt: at('2026-03-20T00:00:00Z'),
  });
  prisma.expense.rows.push(
    { farmId, herdBatchId: id, amount: 1000 },
    { farmId, herdBatchId: id, amount: 250 },
  );
  prisma.revenue.rows.push({ farmId, herdBatchId: id, amount: 4000 });
  prisma.healthRecord.rows.push({ farmId, herdBatchId: id, cost: 150 });
  return id;
}

describe('BatchesService.detail', () => {
  let prisma: BatchesFakePrisma;
  let service: BatchesService;

  beforeEach(() => {
    prisma = new BatchesFakePrisma();
    service = new BatchesService(prisma as unknown as PrismaService, fakeAudit);
  });

  it('returns exactly what the separate single-purpose methods return (FISH)', async () => {
    const id = seedBatch(prisma, 'FISH');
    const u = user();

    const detail = await service.detail(u, id);

    expect(detail.batch).toEqual(await service.get(u, id));
    expect(detail.economics).toEqual(await service.economics(u, id));
    expect(detail.illness).toEqual(await service.listIllness(u, id));
    expect(detail.mortality).toEqual(await service.listMortality(u, id));
    expect(detail.feed).toEqual(await service.listFeed(u, id));
    expect(detail.waterQuality).toEqual(await service.listWaterQuality(u, id));
    expect(detail.sampling).toEqual(await service.listSampling(u, id));
    expect(detail.harvest).toEqual(await service.listHarvest(u, id));

    // Sanity: the comparison above is not vacuous.
    expect(detail.batch.sickCount).toBe(5);
    expect(detail.batch.sickByCondition).toEqual({ FEVER: 3, DIARRHEA: 2 });
    expect(detail.illness).toHaveLength(3);
    expect(detail.economics.investedTotal).toBe(1400);
    expect(detail.economics.net).toBe(2600);
    expect(detail.waterQuality).toHaveLength(1);
    expect(detail.sampling).toHaveLength(1);
    expect(detail.harvest).toHaveLength(1);
    // Histories keep the newest-first order of the single routes.
    expect(detail.mortality.map((m) => m.count)).toEqual([4, 6]);
  });

  it('matches the single methods for a non-FISH batch and leaves fish sections empty', async () => {
    const id = seedBatch(prisma, 'POULTRY');
    const u = user();

    const detail = await service.detail(u, id);

    expect(detail.batch).toEqual(await service.get(u, id));
    expect(detail.economics).toEqual(await service.economics(u, id));
    expect(detail.illness).toEqual(await service.listIllness(u, id));
    expect(detail.mortality).toEqual(await service.listMortality(u, id));
    expect(detail.feed).toEqual(await service.listFeed(u, id));
    // The fish routes answer 400 for other kinds; the combined payload is empty.
    await expect(service.listWaterQuality(u, id)).rejects.toThrow();
    expect(detail.waterQuality).toEqual([]);
    expect(detail.sampling).toEqual([]);
    expect(detail.harvest).toEqual([]);
  });

  it('404s for a batch in another farm or an unknown id', async () => {
    const id = seedBatch(prisma, 'FISH');
    await expect(service.detail(user(randomUUID()), id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.detail(user(), randomUUID())).rejects.toThrow(
      NotFoundException,
    );
  });
});
