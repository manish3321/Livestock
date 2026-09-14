import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { ProfitService } from '../src/profit/profit.service';
import { fakeAudit } from './fakes';

const FARM = randomUUID();
const DAY = 24 * 60 * 60 * 1000;

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

class ProfitFake {
  farm = {
    milkPriceNpr: 62,
    effectivePriceNpr: 48.36,
    labourMonthlyNpr: 0,
  };
  animals = new Map<string, any>();
  milk: any[] = [];
  feeds: any[] = [];
  healthEvents: any[] = [];
  healthRecords: any[] = [];
  expenses: any[] = [];
  metrics: any[] = [];
  payments: any[] = [];
  statements: any[] = [];
  tasks: any[] = [];
  holds: any[] = [];

  $transaction = async (fn: any) => fn(this);

  farm_ = {
    findUniqueOrThrow: async () => ({ id: FARM, ...this.farm }),
    update: async ({ data }: any) => {
      Object.assign(this.farm, data);
      return { id: FARM, ...this.farm };
    },
  };

  get farmFind() {
    return this.farm_;
  }
}

function makeDb() {
  const db = new ProfitFake();
  const prisma: any = {
    farm: {
      findUniqueOrThrow: async () => ({ id: FARM, ...db.farm }),
      update: async ({ data }: any) => {
        Object.assign(db.farm, data);
        return { id: FARM, ...db.farm };
      },
    },
    animal: {
      findMany: async () => [...db.animals.values()],
    },
    productionEntry: {
      findMany: async ({ where }: any) =>
        db.milk.filter((m) => {
          if (where.animalId?.not === null && !m.animalId) return false;
          if (where.animalId?.in && !where.animalId.in.includes(m.animalId)) return false;
          if (where.entryDate?.gte && m.entryDate < where.entryDate.gte) return false;
          if (where.entryDate?.lte && m.entryDate > where.entryDate.lte) return false;
          if (where.entryDate?.lt && !(m.entryDate < where.entryDate.lt)) return false;
          return true;
        }),
    },
    feedRecord: {
      findMany: async () => db.feeds,
    },
    healthEvent: {
      findMany: async () => db.healthEvents,
    },
    healthRecord: {
      findMany: async () => db.healthRecords,
    },
    expense: {
      findMany: async () => db.expenses,
    },
    dailyMetric: {
      upsert: async ({ where, create, update }: any) => {
        const existing = db.metrics.find(
          (m) => m.animalId === where.animalId_date.animalId && m.date.getTime() === where.animalId_date.date.getTime(),
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: randomUUID(), ...create };
        db.metrics.push(row);
        return row;
      },
    },
    cooperativePayment: {
      findMany: async () => db.payments,
      findFirst: async () => db.payments[0] ?? null,
      upsert: async ({ create }: any) => {
        const row = { id: randomUUID(), ...create };
        db.payments.unshift(row);
        return row;
      },
    },
    paymentStatement: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        db.statements.push(row);
        return row;
      },
    },
    milkWithhold: {
      findMany: async () => db.holds,
    },
    task: {
      create: async ({ data }: any) => {
        const dup = db.tasks.find(
          (t) =>
            t.farmId === data.farmId &&
            t.animalId === data.animalId &&
            t.type === data.type &&
            t.sourceRefId === data.sourceRefId &&
            t.status === 'PENDING',
        );
        if (dup) throw new Error('unique');
        const row = { id: randomUUID(), status: 'PENDING', ...data };
        db.tasks.push(row);
        return row;
      },
    },
    _db: db,
  };
  return prisma;
}

function buffalo(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    farmId: FARM,
    tag: 'B1',
    herdNumber: 'B1',
    name: 'Kali',
    photoUrl: null,
    species: 'BUFFALO',
    status: 'LACTATING',
    deletedAt: null,
    lactationStartDate: new Date(Date.now() - 90 * DAY),
    ...overrides,
  };
}

describe('ProfitService Phase 6', () => {
  let prisma: any;
  let svc: ProfitService;

  beforeEach(() => {
    prisma = makeDb();
    svc = new ProfitService(prisma, fakeAudit);
  });

  it('allocates herd-level feed per head in DailyMetric', async () => {
    const a = buffalo();
    const b = buffalo({ tag: 'B2', herdNumber: 'B2' });
    prisma._db.animals.set(a.id, a);
    prisma._db.animals.set(b.id, b);
    prisma._db.feeds.push({
      animalId: null,
      date: new Date(),
      qty: 10,
      costPerUnit: 40,
    });
    await svc.generateDailyMetrics(FARM, new Date());
    expect(prisma._db.metrics).toHaveLength(2);
    expect(prisma._db.metrics.every((m: any) => Number(m.feedCostNpr) === 200)).toBe(true);
  });

  it('uses Farm.effectivePriceNpr, never milkPriceNpr', async () => {
    const a = buffalo();
    prisma._db.animals.set(a.id, a);
    prisma._db.milk.push({
      animalId: a.id,
      quantity: 10,
      entryDate: new Date(),
      type: 'MILK',
      destination: 'SOLD',
    });
    const result = await svc.profitability(FARM);
    expect(result.price).toBe(48.36);
    expect(result.price).not.toBe(62);
    expect(result.priceSource).toBe('payments');
    expect(result.items[0]?.revenue).toBeCloseTo(483.6);
  });

  it('computes Farm.effectivePriceNpr below the headline rate', async () => {
    await svc.recordPayment(user(), {
      periodStart: new Date('2026-08-01'),
      periodEnd: new Date('2026-08-15'),
      litres: 1000,
      baseRate: 62,
      fatBonus: 0,
      snfBonus: 0,
      sccPenalty: 0,
      coolingCharge: 4000,
      transport: 3000,
      membership: 1640,
      feedCredit: 5000,
      netPaid: 48360,
    });
    expect(prisma._db.farm.effectivePriceNpr).toBeCloseTo(48.36);
    expect(prisma._db.farm.effectivePriceNpr).toBeLessThan(62);
  });

  it('does not raise YIELD_DROP for a buffalo at 250 DIM with a 30% drop', async () => {
    const a = buffalo({ lactationStartDate: new Date(Date.now() - 250 * DAY) });
    prisma._db.animals.set(a.id, a);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    prisma._db.milk.push({ animalId: a.id, quantity: 7, entryDate: today });
    for (let n = 2; n <= 8; n++) {
      prisma._db.milk.push({
        animalId: a.id,
        quantity: 10,
        entryDate: new Date(today.getTime() - n * DAY),
      });
    }
    await svc.generateDailyMetrics(FARM, today);
    expect(prisma._db.tasks.some((t: any) => t.type === 'YIELD_DROP')).toBe(false);
  });

  it('raises a HIGH YIELD_DROP listing mastitis first at 90 DIM with a 25% drop', async () => {
    const a = buffalo({ lactationStartDate: new Date(Date.now() - 90 * DAY) });
    prisma._db.animals.set(a.id, a);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    prisma._db.milk.push({ animalId: a.id, quantity: 7.5, entryDate: today });
    for (let n = 2; n <= 8; n++) {
      prisma._db.milk.push({
        animalId: a.id,
        quantity: 10,
        entryDate: new Date(today.getTime() - n * DAY),
      });
    }
    await svc.generateDailyMetrics(FARM, today);
    const task = prisma._db.tasks.find((t: any) => t.type === 'YIELD_DROP');
    expect(task).toBeTruthy();
    expect(task.priority).toBe('HIGH');
    expect(task.titleEn.toLowerCase()).toContain('mastitis');
  });
});
