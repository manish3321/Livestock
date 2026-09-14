import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { HealthRecordsService } from '../src/health-records/health-records.service';
import { fakeAudit, fakeSpeciesConfig } from './fakes';

const FARM = randomUUID();

function user(): RequestUser {
  return {
    id: randomUUID(),
    email: 'manager@farm.local',
    farmId: FARM,
    role: 'MANAGER',
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS.MANAGER,
  };
}

describe('Phase 8 health depth', () => {
  const animals = new Map<string, any>();
  const records: any[] = [];
  const tasks: any[] = [];
  const events: any[] = [];
  const doses: any[] = [];
  const udders: any[] = [];
  const db: any = {
    healthRecord: {
      create: async ({ data, include }: any) => {
        const row = {
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          milkWithholdUntil: null,
          meatWithholdUntil: null,
          animal: include?.animal ? animals.get(data.animalId) : null,
          herdBatch: null,
          ...data,
        };
        records.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => records.find((r) => r.id === where.id) ?? null,
    },
    animal: {
      findFirst: async ({ where }: any) => animals.get(where.id) ?? null,
      update: async ({ where, data }: any) => Object.assign(animals.get(where.id), data),
    },
    healthEvent: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        events.push(row);
        return row;
      },
    },
    medicationAdministration: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        doses.push(row);
        return row;
      },
    },
    udderCheck: {
      findMany: async () => udders.filter((u) => u.classification === 'SUBCLINICAL'),
      create: async ({ data }: any) => {
        const row = { id: data.id ?? randomUUID(), ...data };
        udders.push(row);
        return row;
      },
    },
    task: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), status: 'PENDING', ...data };
        tasks.push(row);
        return row;
      },
    },
    dailyMetric: {
      findFirst: async () => ({ rolling7Mean: 8 }),
      aggregate: async () => ({
        _sum: { feedCostNpr: 0, healthCostNpr: 0, allocatedLabourNpr: 0, otherCostNpr: 0 },
      }),
    },
    mortalityRecord: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ ...data, estimatedLossNpr: data.estimatedLossNpr }),
    },
    animalStatusHistory: { create: async () => ({}) },
  };
  const withholds = { applyFromTreatment: async () => undefined };
  const profit = { effectivePrice: async () => ({ effectivePrice: 48.36 }) };
  let svc: HealthRecordsService;
  let actor: RequestUser;
  let animalId: string;

  beforeEach(() => {
    records.length = 0;
    tasks.length = 0;
    events.length = 0;
    doses.length = 0;
    udders.length = 0;
    animals.clear();
    animalId = randomUUID();
    animals.set(animalId, {
      id: animalId,
      farmId: FARM,
      tag: 'B01',
      herdNumber: 'B01',
      species: 'BUFFALO',
      status: 'LACTATING',
      deletedAt: null,
      purchaseCost: 40000,
      lactationStartDate: new Date(Date.now() - 100 * 86400000),
      expectedLactationDays: 242,
    });
    svc = new HealthRecordsService(
      db as never,
      fakeAudit,
      withholds as never,
      fakeSpeciesConfig,
      profit as never,
    );
    actor = user();
  });

  it('creates 7 remaining MEDICATION_DOSE tasks for a 4-day twice-daily course', async () => {
    await svc.create(actor, {
      type: 'TREATMENT',
      title: 'Oxytet',
      animalId,
      durationDays: 4,
      frequencyPerDay: 2,
      performedAt: new Date(),
    });
    expect(tasks.filter((t) => t.type === 'MEDICATION_DOSE')).toHaveLength(7);
    expect(tasks.filter((t) => t.type === 'TREATMENT_FOLLOWUP')).toHaveLength(2);
  });

  it('classifies CMT 0/0/2/3 with normal appearance as SUBCLINICAL', async () => {
    const check = await svc.createUdderCheck(actor, {
      animalId,
      method: 'CMT',
      quarterScores: { LF: 0, RF: 0, LR: 2, RR: 3 },
      appearance: 'NORMAL',
      signs: [],
    });
    expect(check.classification).toBe('SUBCLINICAL');
    expect(check.discardMilk).toBe(false);
    expect(tasks.some((t) => t.type === 'VET_URGENT')).toBe(false);
  });

  it('creates a treatment task for CLINICAL mastitis', async () => {
    const check = await svc.createUdderCheck(actor, {
      animalId,
      method: 'CMT',
      quarterScores: { LF: 0, RF: 0, LR: 2, RR: 3 },
      appearance: 'CLOTS',
      signs: [],
    });
    expect(check.classification).toBe('CLINICAL');
    expect(check.discardMilk).toBe(true);
    expect(tasks.some((t) => t.type === 'VET_URGENT')).toBe(true);
  });

  it('flags temperature outside the buffalo range', async () => {
    const row = await svc.create(actor, {
      type: 'CHECKUP',
      title: 'Fever check',
      animalId,
      temperatureC: 40.8,
      performedAt: new Date(),
    });
    expect(row.temperatureOutOfRange).toBe(true);
  });

  it('includes remaining lactation in mortality loss at 100 days in milk', async () => {
    const rec = await svc.recordMortality(actor, {
      animalId,
      deathAt: new Date(),
      causeCategory: 'DISEASE',
    });
    expect(rec.remainingLactationValue).toBeGreaterThan(0);
    expect(rec.estimatedLossNpr).toBeGreaterThan(rec.baseValue);
  });
});
