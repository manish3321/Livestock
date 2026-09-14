import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { MilkService } from '../src/milk/milk.service';
import { HealthRecordsService } from '../src/health-records/health-records.service';
import { WithholdsService } from '../src/withholds/withholds.service';
import { addUtcDays, nepalSixAmOn, withholdEndDate } from '../src/withholds/withhold-rules';
import { fakeAudit } from './fakes';

const FARM = randomUUID();

function user(): RequestUser {
  return {
    id: randomUUID(),
    email: 'worker@farm.local',
    farmId: FARM,
    role: 'WORKER',
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS.WORKER,
  };
}

class WithholdFake {
  animals = new Map<string, any>();
  items = new Map<string, any>();
  health: any[] = [];
  milkWithholds: any[] = [];
  meatWithholds: any[] = [];
  markers: any[] = [];
  tasks: any[] = [];
  entries: any[] = [];
  audits: any[] = [];

  inventoryItem = {
    findFirst: async ({ where }: any) =>
      [...this.items.values()].find((i) => i.id === where.id && i.farmId === where.farmId) ?? null,
  };

  milkWithhold = {
    findFirst: async ({ where }: any) => {
      const rows = this.milkWithholds.filter((h) => matchHold(h, where));
      rows.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
      return rows[0] ?? null;
    },
    findMany: async ({ where }: any) => this.milkWithholds.filter((h) => matchHold(h, where)),
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), clearedAt: null, ...data };
      this.milkWithholds.push(row);
      return row;
    },
  };

  meatWithhold = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.meatWithholds.push(row);
      return row;
    },
  };

  healthRecord = {
    findFirst: async ({ where }: any) => {
      const row = this.health.find((h) => h.id === where.id && h.farmId === where.farmId);
      if (!row) return null;
      return { ...row, animal: this.animals.get(row.animalId), herdBatch: null };
    },
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
      this.health.push(row);
      return { ...row, animal: this.animals.get(row.animalId), herdBatch: null };
    },
    update: async ({ where, data }: any) => {
      const row = this.health.find((h) => h.id === where.id);
      Object.assign(row, data);
      return { ...row, animal: this.animals.get(row.animalId), herdBatch: null };
    },
  };

  animal = {
    findFirst: async ({ where }: any) => {
      const a = [...this.animals.values()].find(
        (x) => x.id === where.id && x.farmId === where.farmId && !x.deletedAt,
      );
      if (!a) return null;
      return { ...a, health: a.health ?? [], production: a.production ?? [] };
    },
  };

  animalMarker = {
    findFirst: async ({ where }: any) =>
      this.markers.find(
        (m) =>
          m.farmId === where.farmId &&
          m.animalId === where.animalId &&
          m.meaning === where.meaning &&
          !m.removedAt,
      ) ?? null,
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.markers.push(row);
      return row;
    },
  };

  task = {
    findFirst: async ({ where }: any) =>
      this.tasks.find(
        (t) =>
          t.farmId === where.farmId &&
          t.animalId === where.animalId &&
          t.type === where.type &&
          t.status === (where.status ?? 'PENDING'),
      ) ?? null,
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), status: 'PENDING', ...data };
      this.tasks.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.tasks.find((t) => t.id === where.id);
      Object.assign(row, data);
      return row;
    },
  };

  productionEntry = {
    findMany: async ({ where }: any) =>
      this.entries.filter((e) => !where?.milkRoundId || e.milkRoundId === where.milkRoundId),
    findFirst: async () => null,
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.entries.push(row);
      return row;
    },
  };

  milkRound = {
    findUnique: async () => null,
    findFirst: async () => ({ id: randomUUID(), farmId: FARM, status: 'OPEN', session: 'MORNING' }),
    create: async ({ data }: any) => ({ id: randomUUID(), status: 'OPEN', ...data }),
  };

  recordingRound = { findFirst: async () => null, update: async () => ({}) };

  addAnimal() {
    const row = {
      id: randomUUID(),
      farmId: FARM,
      tag: 'B01',
      herdNumber: 'B01',
      name: 'Kali',
      status: 'LACTATING',
      gender: 'FEMALE',
      deletedAt: null,
      health: [],
      production: [],
    };
    this.animals.set(row.id, row);
    return row;
  }

  addOxytet() {
    const row = {
      id: randomUUID(),
      farmId: FARM,
      name: 'Oxytetracycline',
      withdrawalDaysMilk: 4,
      withdrawalDaysMeat: 0,
      deletedAt: null,
    };
    this.items.set(row.id, row);
    return row;
  }
}

function matchHold(h: any, where: any) {
  if (where?.farmId && h.farmId !== where.farmId) return false;
  if (where?.animalId && h.animalId !== where.animalId) return false;
  if (where?.clearedAt === null && h.clearedAt) return false;
  if (where?.endDate?.gte && h.endDate < where.endDate.gte) return false;
  return true;
}

describe('withhold date math', () => {
  it('ends 8 days out for a 4-day oxytet course (4 + 4)', () => {
    const first = new Date(Date.UTC(2026, 2, 1));
    const end = withholdEndDate(first, 4, 4);
    expect(end.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(addUtcDays(first, 8).getTime()).toBe(end.getTime());
  });

  it('schedules the end task at 06:00 NPT', () => {
    const end = new Date(Date.UTC(2026, 2, 9));
    const due = nepalSixAmOn(end);
    expect(due.toISOString()).toBe('2026-03-09T00:15:00.000Z');
  });
});

describe('Phase 3 milk withdrawal', () => {
  let db: WithholdFake;
  let withholds: WithholdsService;
  let health: HealthRecordsService;
  let milk: MilkService;
  let actor: RequestUser;

  beforeEach(() => {
    db = new WithholdFake();
    withholds = new WithholdsService(db as any, fakeAudit);
    health = new HealthRecordsService(db as any, fakeAudit, withholds);
    milk = new MilkService(db as any, fakeAudit);
    actor = user();
  });

  it('records oxytet for 4 days and withholds until day 8', async () => {
    const animal = db.addAnimal();
    const item = db.addOxytet();
    const first = new Date(Date.UTC(2026, 2, 1, 8, 0, 0));
    await health.create(actor, {
      type: 'TREATMENT',
      title: 'Oxytet mastitis',
      animalId: animal.id,
      inventoryItemId: item.id,
      durationDays: 4,
      performedAt: first,
    });
    expect(db.milkWithholds).toHaveLength(1);
    expect(db.milkWithholds[0].endDate.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(db.markers[0]).toMatchObject({ color: 'RED', meaning: 'MILK_WITHHOLD' });
    expect(db.tasks[0].type).toBe('MILK_WITHHOLD_END');
    expect(db.tasks[0].dueAt.toISOString()).toBe('2026-03-09T00:15:00.000Z');
  });

  it('stacks a second overlapping treatment — later endDate wins, first row stays', async () => {
    const animal = db.addAnimal();
    const item = db.addOxytet();
    const first = new Date(Date.UTC(2026, 2, 1));
    await health.create(actor, {
      type: 'TREATMENT',
      title: 'Oxytet 1',
      animalId: animal.id,
      inventoryItemId: item.id,
      durationDays: 4,
      performedAt: first,
    });
    await health.create(actor, {
      type: 'TREATMENT',
      title: 'Oxytet 2',
      animalId: animal.id,
      inventoryItemId: item.id,
      durationDays: 6,
      performedAt: new Date(Date.UTC(2026, 2, 3)),
    });
    expect(db.milkWithholds).toHaveLength(2);
    const active = await withholds.activeMilkForAnimal(FARM, animal.id, new Date(Date.UTC(2026, 2, 4)));
    expect(active?.endDate.slice(0, 10)).toBe('2026-03-13');
    expect(db.milkWithholds[0].endDate.toISOString().slice(0, 10)).toBe('2026-03-09');
  });

  it('POST milk SOLD under an active withhold returns 422 MILK_WITHHOLD_ACTIVE', async () => {
    const animal = db.addAnimal();
    const item = db.addOxytet();
    await health.create(actor, {
      type: 'TREATMENT',
      title: 'Oxytet',
      animalId: animal.id,
      inventoryItemId: item.id,
      durationDays: 4,
      performedAt: new Date(),
    });
    try {
      await milk.createEntry(actor, {
        animalId: animal.id,
        session: 'MORNING',
        litres: 8,
        disposal: 'SOLD',
      });
      throw new Error('expected 422');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getStatus()).toBe(422);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'MILK_WITHHOLD_ACTIVE',
      });
    }
  });

  it('excludes withheld animals from tank expected litres', async () => {
    const animal = db.addAnimal();
    db.milkWithholds.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: animal.id,
      drugName: 'Oxytetracycline',
      startDate: new Date(),
      endDate: new Date(Date.now() + 5 * 86400000),
      clearedAt: null,
    });
    const ids = await withholds.animalIdsWithActiveMilk(FARM);
    expect(ids.has(animal.id)).toBe(true);
  });
});
