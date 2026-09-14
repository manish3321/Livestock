import './setup-env';
import { randomUUID } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { VaccinationsService } from '../src/vaccinations/vaccinations.service';
import { fakeAudit } from './fakes';

const FARM = randomUUID();
const FMD_ID = '00000000-0000-4000-8000-0000000000f1';
const BRU_ID = '00000000-0000-4000-8000-0000000000f4';

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

class VaxFake {
  animals = new Map<string, any>();
  protocols: any[] = [];
  records: any[] = [];
  events: any[] = [];
  health: any[] = [];
  tasks: any[] = [];
  items = new Map<string, any>();
  lots: any[] = [];
  movements: any[] = [];
  rounds = new Map<string, any>();

  $transaction = async (fn: any) => fn(this);

  animal = {
    findMany: async ({ where }: any) =>
      [...this.animals.values()].filter((a) => {
        if (where.id?.in && !where.id.in.includes(a.id)) return false;
        if (where.farmId && a.farmId !== where.farmId) return false;
        if (where.deletedAt === null && a.deletedAt) return false;
        if (where.status?.notIn && where.status.notIn.includes(a.status)) return false;
        return true;
      }),
  };

  vaccineProtocol = {
    findMany: async ({ where }: any) =>
      this.protocols.filter((p) => {
        if (where.active && !p.active) return false;
        if (where.OR) {
          return where.OR.some((c: any) => (c.farmId === null && p.farmId == null) || p.farmId === c.farmId);
        }
        return true;
      }),
  };

  vaccinationRecord = {
    findMany: async ({ where }: any) =>
      this.records.filter((r) => r.farmId === where.farmId && (!where.animalId?.in || where.animalId.in.includes(r.animalId))),
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), disputedEfficacy: false, scheduleWasEstimatedAge: false, ...data };
      this.records.push(row);
      return row;
    },
  };

  healthEvent = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.events.push(row);
      return row;
    },
  };

  healthRecord = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.health.push(row);
      return row;
    },
  };

  task = {
    create: async ({ data }: any) => {
      const dup = this.tasks.find(
        (t) =>
          t.farmId === data.farmId &&
          t.animalId === data.animalId &&
          t.type === data.type &&
          t.sourceRefId === data.sourceRefId &&
          t.status === 'PENDING',
      );
      if (dup) throw new Error('unique');
      const row = { id: randomUUID(), status: 'PENDING', ...data };
      this.tasks.push(row);
      return row;
    },
    count: async ({ where }: any) =>
      this.tasks.filter(
        (t) =>
          t.farmId === where.farmId &&
          t.animalId === where.animalId &&
          t.type === where.type &&
          t.sourceRefId === where.sourceRefId &&
          (!where.status?.in || where.status.in.includes(t.status)),
      ).length,
    findFirst: async ({ where }: any) =>
      this.tasks.find(
        (t) =>
          t.farmId === where.farmId &&
          t.animalId === where.animalId &&
          t.type === where.type &&
          t.sourceRefId === where.sourceRefId &&
          where.status.in.includes(t.status),
      ) ?? null,
    update: async ({ where, data }: any) => {
      const row = this.tasks.find((t) => t.id === where.id);
      Object.assign(row, data);
      return row;
    },
  };

  inventoryItem = {
    findFirst: async ({ where }: any) => this.items.get(where.id) ?? null,
    update: async ({ where, data }: any) => {
      const row = this.items.get(where.id);
      if (data.currentStock?.decrement) row.currentStock -= data.currentStock.decrement;
      return row;
    },
  };

  stockLot = {
    findMany: async ({ where }: any) => this.lots.filter((l) => l.itemId === where.itemId),
    update: async ({ where, data }: any) => {
      const row = this.lots.find((l) => l.id === where.id);
      if (data.qtyRemaining?.decrement) row.qtyRemaining -= data.qtyRemaining.decrement;
      return row;
    },
  };

  stockMovement = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.movements.push(row);
      return row;
    },
  };

  recordingRound = {
    updateMany: async ({ where, data }: any) => {
      const row = this.rounds.get(where.id);
      if (row && data.recordedCount?.increment) row.recordedCount += data.recordedCount.increment;
    },
  };
}

function seedProtocols(db: VaxFake) {
  db.protocols.push(
    {
      id: FMD_ID,
      farmId: null,
      disease: 'FMD',
      diseaseNp: 'खोरेत',
      species: ['BUFFALO', 'COW'],
      trigger: 'AGE_BASED',
      triggerAgeDays: 180,
      boosterAfterDays: 28,
      repeatIntervalDays: 180,
      sexRestriction: 'ANY',
      pregnancyContraindicated: false,
      active: true,
    },
    {
      id: BRU_ID,
      farmId: null,
      disease: 'BRUCELLOSIS',
      diseaseNp: 'ब्रुसेलोसिस',
      species: ['BUFFALO', 'COW'],
      trigger: 'AGE_BASED',
      triggerAgeDays: 120,
      boosterAfterDays: null,
      repeatIntervalDays: null,
      sexRestriction: 'FEMALE',
      pregnancyContraindicated: true,
      active: true,
    },
  );
}

function buffalo(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    farmId: FARM,
    tag: 'B30',
    herdNumber: 'B30',
    species: 'BUFFALO',
    gender: 'FEMALE',
    status: 'LACTATING',
    isPregnant: false,
    dobIsEstimated: false,
    dateOfBirth: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    deletedAt: null,
    ...overrides,
  };
}

describe('VaccinationsService Phase 5', () => {
  let db: VaxFake;
  let svc: VaccinationsService;

  beforeEach(() => {
    db = new VaxFake();
    seedProtocols(db);
    svc = new VaccinationsService(db as never, fakeAudit);
  });

  it('creates VACCINATION_DUE for a 6-month buffalo with no FMD record, and is idempotent', async () => {
    const animal = buffalo({ dateOfBirth: new Date(Date.now() - 182 * 24 * 60 * 60 * 1000) });
    db.animals.set(animal.id, animal);
    const first = await svc.generateForFarm(FARM, new Date());
    const second = await svc.generateForFarm(FARM, new Date());
    const fmd = db.tasks.filter((t) => t.type === 'VACCINATION_DUE' && t.sourceRefId === FMD_ID);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(second).toBe(0);
    expect(fmd).toHaveLength(1);
  });

  it('does not create a Brucellosis task for a pregnant animal', async () => {
    const animal = buffalo({ isPregnant: true, dateOfBirth: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) });
    db.animals.set(animal.id, animal);
    await svc.generateForFarm(FARM, new Date());
    expect(db.tasks.some((t) => t.sourceRefId === BRU_ID)).toBe(false);
    expect(db.tasks.some((t) => t.sourceRefId === FMD_ID)).toBe(true);
  });

  it('batch-vaccinates 20 animals with 20 records and 20 stock movements', async () => {
    const itemId = randomUUID();
    const lotId = randomUUID();
    db.items.set(itemId, { id: itemId, farmId: FARM, name: 'FMD', currentStock: 50, deletedAt: null });
    db.lots.push({
      id: lotId,
      itemId,
      farmId: FARM,
      lotNumber: 'L1',
      qtyRemaining: 50,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      receivedOn: new Date(),
    });
    const ids = Array.from({ length: 20 }, (_, i) => {
      const a = buffalo({ tag: `B${i}`, herdNumber: `B${i}` });
      db.animals.set(a.id, a);
      return a.id;
    });
    const result = await svc.batch(user(), {
      animalIds: ids,
      itemId,
      lotId,
      doseAmount: 2,
      route: 'SUBCUTANEOUS',
      administeredAt: new Date(),
      disease: 'FMD',
    });
    expect(result.recorded).toHaveLength(20);
    expect(result.movements).toBe(20);
    expect(db.events).toHaveLength(20);
    expect(db.records).toHaveLength(20);
    expect(db.movements).toHaveLength(20);
  });

  it('lists a pregnant animal in skipped for a Brucellosis batch', async () => {
    const pregnant = buffalo({ isPregnant: true });
    const open = buffalo({ isPregnant: false, tag: 'B31', herdNumber: 'B31' });
    db.animals.set(pregnant.id, pregnant);
    db.animals.set(open.id, open);
    const result = await svc.batch(user(), {
      animalIds: [pregnant.id, open.id],
      doseAmount: 2,
      route: 'SUBCUTANEOUS',
      administeredAt: new Date(),
      disease: 'BRUCELLOSIS',
    });
    expect(result.skipped).toEqual([{ animalId: pregnant.id, reason: 'PREGNANT_CONTRAINDICATED' }]);
    expect(result.recorded).toHaveLength(1);
    expect(result.recorded[0]?.animalId).toBe(open.id);
  });

  it('returns 422 when the lot is expired and no reason is given', async () => {
    const animal = buffalo();
    db.animals.set(animal.id, animal);
    const itemId = randomUUID();
    const lotId = randomUUID();
    db.items.set(itemId, { id: itemId, farmId: FARM, name: 'FMD', currentStock: 5, deletedAt: null });
    db.lots.push({
      id: lotId,
      itemId,
      farmId: FARM,
      lotNumber: 'OLD',
      qtyRemaining: 5,
      expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      receivedOn: new Date('2024-01-01'),
    });
    await expect(
      svc.batch(user(), {
        animalIds: [animal.id],
        itemId,
        lotId,
        doseAmount: 2,
        route: 'SUBCUTANEOUS',
        administeredAt: new Date(),
        disease: 'FMD',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('expired lot with a reason sets disputedEfficacy and leaves the task pending with a new due date', async () => {
    const animal = buffalo();
    db.animals.set(animal.id, animal);
    db.tasks.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: animal.id,
      type: 'VACCINATION_DUE',
      sourceRefId: FMD_ID,
      status: 'PENDING',
      dueAt: new Date(),
    });
    const itemId = randomUUID();
    const lotId = randomUUID();
    db.items.set(itemId, { id: itemId, farmId: FARM, name: 'FMD', currentStock: 5, deletedAt: null });
    db.lots.push({
      id: lotId,
      itemId,
      farmId: FARM,
      lotNumber: 'OLD',
      qtyRemaining: 5,
      expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      receivedOn: new Date('2024-01-01'),
    });
    const result = await svc.batch(user(), {
      animalIds: [animal.id],
      itemId,
      lotId,
      doseAmount: 2,
      route: 'SUBCUTANEOUS',
      administeredAt: new Date(),
      expiredLotReason: 'Only vial left on the farm',
      disease: 'FMD',
    });
    expect(result.recorded).toHaveLength(1);
    expect(db.records[0].disputedEfficacy).toBe(true);
    expect(db.tasks[0].status).toBe('PENDING');
    expect(db.tasks[0].dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('FMD closes the due task and creates a booster at +28 days', async () => {
    const animal = buffalo();
    db.animals.set(animal.id, animal);
    const due = {
      id: randomUUID(),
      farmId: FARM,
      animalId: animal.id,
      type: 'VACCINATION_DUE',
      sourceRefId: FMD_ID,
      status: 'PENDING',
      dueAt: new Date(),
    };
    db.tasks.push(due);
    const at = new Date('2026-04-01T00:00:00Z');
    await svc.batch(user(), {
      animalIds: [animal.id],
      doseAmount: 2,
      route: 'SUBCUTANEOUS',
      administeredAt: at,
      disease: 'FMD',
    });
    expect(due.status).toBe('DONE');
    const booster = db.tasks.find((t) => t.titleEn?.includes('booster'));
    expect(booster).toBeTruthy();
    expect(Math.round((booster.dueAt.getTime() - at.getTime()) / (24 * 60 * 60 * 1000))).toBe(28);
  });

  it('sets scheduleWasEstimatedAge when the calf DOB is estimated', async () => {
    const animal = buffalo({ dobIsEstimated: true });
    db.animals.set(animal.id, animal);
    await svc.batch(user(), {
      animalIds: [animal.id],
      doseAmount: 2,
      route: 'SUBCUTANEOUS',
      administeredAt: new Date(),
      disease: 'FMD',
    });
    expect(db.records[0].scheduleWasEstimatedAge).toBe(true);
  });
});
