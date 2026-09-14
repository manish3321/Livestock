import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { BreedingService } from '../src/breeding/breeding.service';
import { NightlyJob } from '../src/jobs/nightly.job';
import { fakeAudit, fakeSpeciesConfig } from './fakes';

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

class BreedingFake {
  animals = new Map<string, any>();
  heatEvents: any[] = [];
  heatLogs: any[] = [];
  services: any[] = [];
  records: any[] = [];
  checks: any[] = [];
  calvings: any[] = [];
  calves: any[] = [];
  feedings: any[] = [];
  tasks: any[] = [];
  markers: any[] = [];
  tags: any[] = [];
  weights: any[] = [];
  history: any[] = [];
  farms = [{ id: FARM }];

  $transaction = async (fn: any) => fn(this);

  animal = {
    findFirst: async ({ where }: any) => {
      const row = [...this.animals.values()].find((a) => matchAnimal(a, where));
      return row ?? null;
    },
    findMany: async ({ where }: any) => [...this.animals.values()].filter((a) => matchAnimal(a, where)),
    create: async ({ data }: any) => {
      const row = {
        id: randomUUID(),
        deletedAt: null,
        isPregnant: false,
        lactationNumber: 0,
        highRiskFPT: false,
        isFreemartinSuspect: false,
        dobIsEstimated: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.animals.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.animals.get(where.id);
      if (data.lactationNumber?.increment) row.lactationNumber += data.lactationNumber.increment;
      Object.assign(row, omitInc(data));
      return row;
    },
  };

  heatEvent = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), wasBred: false, ...data };
      this.heatEvents.push(row);
      return row;
    },
    count: async ({ where }: any) => this.heatEvents.filter((h) => h.animalId === where.animalId).length,
    findFirst: async ({ where }: any) =>
      this.heatEvents.find((h) => h.animalId === where.animalId && (!where.observedAt?.gte || h.observedAt >= where.observedAt.gte)) ??
      null,
    findMany: async ({ where, include }: any) =>
      this.heatEvents
        .filter((h) => {
          if (where?.farmId && h.farmId !== where.farmId) return false;
          if (where?.animalId && h.animalId !== where.animalId) return false;
          if (where?.observedAt?.gte && h.observedAt < where.observedAt.gte) return false;
          return true;
        })
        .map((h) => ({ ...h, animal: include?.animal ? this.animals.get(h.animalId) : undefined })),
  };

  heatLog = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data, animal: { tag: 'B01' } };
      this.heatLogs.push(row);
      return row;
    },
    count: async ({ where }: any) => this.heatLogs.filter((h) => h.animalId === where.animalId).length,
    findMany: async () => this.heatLogs,
  };

  breedingService = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), result: 'PENDING', serviceNo: 1, ...data };
      this.services.push(row);
      return row;
    },
    count: async ({ where }: any) =>
      this.services.filter((s) => s.animalId === where.animalId && s.result !== 'PREGNANT').length,
    findFirst: async ({ where }: any) => {
      const rows = this.services.filter((s) => (!where.id || s.id === where.id) && (!where.animalId || s.animalId === where.animalId));
      return rows.at(-1) ?? null;
    },
    update: async ({ where, data }: any) => {
      const row = this.services.find((s) => s.id === where.id);
      Object.assign(row, data);
      return row;
    },
    findMany: async () => this.services,
  };

  breedingRecord = {
    create: async ({ data }: any) => {
      const row = {
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        birthDate: null,
        offspringAnimalId: null,
        ...data,
        mother: { tag: this.animals.get(data.motherId)?.tag ?? 'B01' },
      };
      this.records.push(row);
      return row;
    },
    findFirst: async ({ where, include }: any) => {
      const row = this.records.find(
        (r) =>
          (!where.id || r.id === where.id) &&
          (!where.farmId || r.farmId === where.farmId) &&
          (!where.motherId || r.motherId === where.motherId),
      );
      if (!row) return null;
      return include?.mother ? { ...row, mother: this.animals.get(row.motherId) } : row;
    },
    findMany: async ({ where }: any) =>
      this.records.filter((r) => r.farmId === where.farmId && (!where.motherId || r.motherId === where.motherId)),
    update: async ({ where, data, include }: any) => {
      const row = this.records.find((r) => r.id === where.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return include?.mother ? { ...row, mother: { tag: this.animals.get(row.motherId)?.tag } } : row;
    },
    count: async () => this.records.length,
  };

  pregnancyCheck = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.checks.push(row);
      return row;
    },
  };

  calvingEvent = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.calvings.push(row);
      return row;
    },
    findFirst: async ({ where }: any) =>
      this.calvings.filter((c) => c.damId === where.damId && c.outcome !== 'ABORTED').at(-1) ?? null,
    findMany: async ({ where }: any) =>
      this.calvings.filter((c) => {
        if (where?.farmId && c.farmId !== where.farmId) return false;
        if (where?.damId && c.damId !== where.damId) return false;
        if (where?.outcome?.not === 'ABORTED' && c.outcome === 'ABORTED') return false;
        if (where?.outcome && !where.outcome.not && c.outcome !== where.outcome) return false;
        return true;
      }),
    count: async ({ where }: any) =>
      this.calvings.filter((c) => c.damId === where.damId && c.outcome === where.outcome).length,
  };

  calfRecord = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.calves.push(row);
      return { ...row, calving: this.calvings.find((c) => c.id === row.calvingId), animal: this.animals.get(row.animalId) };
    },
    findFirst: async ({ where }: any) => {
      const row = this.calves.find((c) => (!where.id || c.id === where.id) && (!where.animalId || c.animalId === where.animalId));
      if (!row) return null;
      return { ...row, calving: this.calvings.find((c) => c.id === row.calvingId), animal: this.animals.get(row.animalId) };
    },
  };

  colostrumFeeding = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.feedings.push(row);
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
    updateMany: async ({ where, data }: any) => {
      for (const t of this.tasks) {
        if (where.id && t.id !== where.id) continue;
        if (where.animalId && t.animalId !== where.animalId) continue;
        if (where.type?.in && !where.type.in.includes(t.type)) continue;
        Object.assign(t, data);
      }
    },
    findMany: async () => this.tasks,
  };

  animalStatusHistory = {
    create: async ({ data }: any) => {
      this.history.push(data);
      return data;
    },
  };

  animalTag = {
    create: async ({ data }: any) => {
      this.tags.push(data);
      return data;
    },
  };

  weightRecord = {
    create: async ({ data }: any) => {
      this.weights.push(data);
      return data;
    },
  };

  animalMarker = {
    updateMany: async ({ where, data }: any) => {
      for (const m of this.markers) {
        if (m.animalId === where.animalId && m.meaning === where.meaning) Object.assign(m, data);
      }
    },
  };

  farm = {
    findMany: async () => this.farms,
  };

  dailyMetric = {
    findMany: async ({ where }: any) =>
      (this.metrics ?? []).filter((m: any) => !where?.farmId || m.farmId === where.farmId),
  };
  metrics: any[] = [];

  users: any[] = [];
  user = {
    findMany: async ({ where }: any) => {
      const ids: string[] = where?.id?.in ?? [];
      return this.users.filter((u) => ids.includes(u.id));
    },
  };

  milkWithhold = { findMany: async () => [] };
  inventoryItem = { findMany: async () => [] };
  productionEntry = { findMany: async () => [] };
}

function matchAnimal(a: any, where: any): boolean {
  if (!where) return true;
  if (where.id && a.id !== where.id) return false;
  if (where.farmId && a.farmId !== where.farmId) return false;
  if (where.deletedAt === null && a.deletedAt) return false;
  if (where.species && a.species !== where.species) return false;
  if (where.gender && a.gender !== where.gender) return false;
  if (where.isPregnant === false && a.isPregnant) return false;
  if (where.status?.notIn && where.status.notIn.includes(a.status)) return false;
  return true;
}

function omitInc(data: any) {
  const out = { ...data };
  delete out.lactationNumber;
  return out;
}

function dam(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    farmId: FARM,
    tag: 'B10',
    herdNumber: 'B10',
    name: 'Maya',
    species: 'BUFFALO',
    breed: 'Murrah',
    dateOfBirth: new Date('2020-01-01'),
    gender: 'FEMALE',
    status: 'DRY',
    isPregnant: true,
    lactationNumber: 2,
    lactationStartDate: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000),
    expectedCalvingDate: new Date(),
    breedComposition: { murrah: 1 },
    deletedAt: null,
    ...overrides,
  };
}

describe('BreedingService Phase 4', () => {
  let db: BreedingFake;
  let svc: BreedingService;
  let seq = 10;

  beforeEach(() => {
    db = new BreedingFake();
    seq = 10;
    const herdNumbers = {
      issue: async () => {
        seq += 1;
        return `B${String(seq).padStart(2, '0')}`;
      },
    };
    svc = new BreedingService(db as never, fakeAudit, fakeSpeciesConfig, herdNumbers as never);
  });

  it('calving with twins creates two animals with sequential short numbers and increments lactation', async () => {
    const mother = dam();
    db.animals.set(mother.id, mother);
    const result = await svc.recordFarmCalving(user(), {
      damId: mother.id,
      calvingAt: new Date('2026-04-01T05:00:00Z'),
      calves: [
        { sex: 'FEMALE', birthWeightKg: 32 },
        { sex: 'MALE', birthWeightKg: 30 },
      ],
    });
    expect(result.calves).toHaveLength(2);
    expect(result.calves.map((c) => c.herdNumber)).toEqual(['B11', 'B12']);
    expect(result.calves[0]?.freemartin).toBe(true);
    expect(result.dam.lactationNumber).toBe(3);
    expect(result.dam.lactationStartDate?.slice(0, 10)).toBe('2026-04-01');
    expect(db.animals.get(mother.id).lactationNumber).toBe(3);
    const colostrum = db.tasks.filter((t) => t.type === 'COLOSTRUM_FEED');
    expect(colostrum).toHaveLength(6);
    expect(colostrum.every((t) => t.priority === 'CRITICAL')).toBe(true);
    const hours = colostrum.map((t) => t.titleEn.match(/\+(\d+)h/)?.[1]).filter(Boolean);
    expect(new Set(hours)).toEqual(new Set(['2', '8', '16']));
  });

  it('calving with no service succeeds and leaves sireId null', async () => {
    const mother = dam({ isPregnant: false, status: 'LACTATING' });
    db.animals.set(mother.id, mother);
    const result = await svc.recordFarmCalving(user(), {
      damId: mother.id,
      calvingAt: new Date(),
      calves: [{ sex: 'FEMALE', birthWeightKg: 28 }],
    });
    expect(result.sireId).toBeNull();
    expect(result.serviceId).toBeNull();
    expect(result.calves).toHaveLength(1);
    expect(db.tasks.filter((t) => t.type === 'COLOSTRUM_FEED')).toHaveLength(3);
  });

  it('ABORTED creates no calf and returns the dam to her prior status', async () => {
    const mother = dam({ status: 'DRY', lactationNumber: 2 });
    db.animals.set(mother.id, mother);
    const result = await svc.recordFarmCalving(user(), {
      damId: mother.id,
      outcome: 'ABORTED',
      calvingAt: new Date(),
      calves: [{ sex: 'FEMALE' }],
    });
    expect(result.calves).toHaveLength(0);
    expect(result.outcome).toBe('ABORTED');
    expect(result.dam.status).toBe('DRY');
    expect(result.dam.lactationNumber).toBe(2);
    expect(db.animals.get(mother.id).isPregnant).toBe(false);
    expect(db.animals.get(mother.id).status).toBe('DRY');
    expect([...db.animals.values()].filter((a) => a.damId === mother.id)).toHaveLength(0);
  });

  it('retained placenta creates a CRITICAL VET_URGENT task', async () => {
    const mother = dam();
    db.animals.set(mother.id, mother);
    await svc.recordFarmCalving(user(), {
      damId: mother.id,
      calvingAt: new Date(),
      complications: 'RETAINED_PLACENTA',
      placentaExpelled: false,
      calves: [{ sex: 'FEMALE' }],
    });
    const urgent = db.tasks.filter((t) => t.type === 'VET_URGENT');
    expect(urgent).toHaveLength(1);
    expect(urgent[0].priority).toBe('CRITICAL');
  });

  it('colostrum at 7 hours sets highRiskFPT and creates 21 daily tasks', async () => {
    const calfId = randomUUID();
    const dob = new Date('2026-04-01T00:00:00Z');
    db.animals.set(calfId, {
      id: calfId,
      farmId: FARM,
      tag: 'B20',
      herdNumber: 'B20',
      species: 'BUFFALO',
      breed: 'Murrah',
      gender: 'FEMALE',
      status: 'GROWING',
      dateOfBirth: dob,
      birthWeightKg: 32,
      highRiskFPT: false,
      damId: randomUUID(),
      deletedAt: null,
    });
    const calvingId = randomUUID();
    db.calvings.push({ id: calvingId, farmId: FARM, damId: db.animals.get(calfId).damId, calvingAt: dob, outcome: 'LIVE_SINGLE' });
    db.calves.push({ id: randomUUID(), calvingId, animalId: calfId, sex: 'FEMALE', birthWeightKg: 32 });

    const feeding = await svc.recordFarmColostrum(user(), {
      calfId,
      fedAt: new Date('2026-04-01T07:00:00Z'),
      volumeLitres: 2,
    });
    expect(feeding.highRiskFPT).toBe(true);
    expect(feeding.hoursAfterBirth).toBe(7);
    expect(db.animals.get(calfId).highRiskFPT).toBe(true);
    expect(db.tasks.filter((t) => t.sourceRefType === 'colostrumFpt')).toHaveLength(21);
  });

  it('heat on a pregnant animal creates a PREGNANCY_CHECK task', async () => {
    const mother = dam({ isPregnant: true });
    db.animals.set(mother.id, mother);
    await svc.logHeat(user(), {
      animalId: mother.id,
      observedAt: new Date(),
      intensity: 'STRONG',
    });
    expect(db.tasks.some((t) => t.type === 'PREGNANCY_CHECK' && t.titleEn.includes('possible loss'))).toBe(true);
  });

  it('PD estimatedDaysPregnant = 50 sets buffalo EDD to checkDate + 260', async () => {
    const mother = dam();
    db.animals.set(mother.id, mother);
    const rec = {
      id: randomUUID(),
      farmId: FARM,
      motherId: mother.id,
      matingType: 'NATURAL',
      fatherTagOrAi: null,
      matingDate: new Date('2025-12-01'),
      dueDate: new Date('2026-10-07'),
      pregnancyStatus: 'PREGNANT',
      birthDate: null,
      offspringTag: null,
      offspringAnimalId: null,
      calvingDifficulty: null,
      colostrumFed: null,
      colostrumWithin4h: null,
      colostrumLiters: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.records.push(rec);
    db.services.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: mother.id,
      serviceDate: rec.matingDate,
      method: 'NATURAL',
      result: 'PENDING',
    });
    await svc.pregnancyCheck(user(), rec.id, {
      result: 'PREGNANT',
      estimatedDaysPregnant: 50,
      checkDate: new Date('2026-03-01T00:00:00Z'),
    });
    const updated = db.animals.get(mother.id);
    expect(updated.expectedCalvingDate.toISOString().slice(0, 10)).toBe('2026-11-16');
  });
});

describe('BreedingService Phase 9', () => {
  let db: BreedingFake;
  let svc: BreedingService;
  const profit = { effectivePrice: async () => ({ effectivePrice: 48.36 }) };

  beforeEach(() => {
    db = new BreedingFake();
    svc = new BreedingService(
      db as never,
      fakeAudit,
      fakeSpeciesConfig,
      { issue: async () => 'B99' } as never,
      profit as never,
    );
  });

  it('includes remaining-interval cost using effective price, not the headline rate', async () => {
    const mother = dam({ status: 'LACTATING', isPregnant: false });
    db.animals.set(mother.id, mother);
    db.calvings.push({
      id: randomUUID(),
      farmId: FARM,
      damId: mother.id,
      calvingAt: new Date('2025-01-01'),
      outcome: 'LIVE_SINGLE',
      calvingIntervalDays: 450,
      daysOpenDays: 100,
    });
    db.metrics.push({ farmId: FARM, animalId: mother.id, rolling7Mean: 8, date: new Date() });
    db.services.push(
      { id: randomUUID(), farmId: FARM, animalId: mother.id, serviceNo: 1, result: 'FAILED', serviceDate: new Date() },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, serviceNo: 2, result: 'PREGNANT', serviceDate: new Date() },
    );
    const metrics = await svc.herdMetrics(user());
    expect(metrics.daysOpen).toBeGreaterThanOrEqual(100);
    expect(metrics.calvingIntervalDays).toBe(450);
    expect(metrics.costOfOpenDaysNpr).toBeCloseTo(25 * 8 * 48.36);
    expect(metrics.conceptionRatePct).toBe(50);
    expect(metrics.firstServiceRatePct).toBe(0);
    expect(metrics.servicesPerConception).toBe(2);
    expect(metrics.targets.conceptionRateMinPct).toBe(45);
    expect(metrics.targets.daysOpenMax).toBe(120);
    expect(metrics.targets.calvingIntervalMaxDays).toBe(425);
  });

  it('warns at service when dam and sire share a grandparent', async () => {
    const grand = dam({ tag: 'G1', herdNumber: 'G1', gender: 'FEMALE' });
    const mother = dam({ damId: grand.id, isPregnant: false, status: 'LACTATING' });
    const sire = dam({
      tag: 'S1',
      herdNumber: 'S1',
      gender: 'MALE',
      damId: grand.id,
      isPregnant: false,
      status: 'ACTIVE',
    });
    db.animals.set(grand.id, grand);
    db.animals.set(mother.id, mother);
    db.animals.set(sire.id, sire);
    const rec = await svc.create(user(), {
      motherId: mother.id,
      sireId: sire.id,
      matingDate: new Date(),
      pregnancyStatus: 'PREGNANT',
    });
    expect(rec.inbreedingWarning).toBe(true);
    expect(rec.sharedAncestorIds).toContain(grand.id);
  });

  it('reports heat detection rate by observer', async () => {
    const mother = dam({ status: 'LACTATING', isPregnant: false });
    db.animals.set(mother.id, mother);
    const observer = user();
    db.users.push({ id: observer.id, name: 'Ram' });
    db.heatEvents.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: mother.id,
      observedAt: new Date(),
      observerId: observer.id,
      signs: ['STANDING_HEAT'],
    });
    const metrics = await svc.herdMetrics(observer);
    expect(metrics.observers).toHaveLength(1);
    const row = metrics.observers[0]!;
    expect(row.heatsObserved).toBe(1);
    expect(row.standingHeatCount).toBe(1);
    expect(row.observerName).toBe('Ram');
  });
});

describe('Nightly silent heat', () => {
  it('creates SILENT_HEAT_CHECK at 04:00 for a buffalo 95 DIM with no heat in 30 days', async () => {
    const db = new BreedingFake();
    const animal = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000),
    });
    db.animals.set(animal.id, animal);
    const job = new NightlyJob(db as never, fakeSpeciesConfig);
    await (job as unknown as { silentHeatTasks: (id: string, now: Date) => Promise<void> }).silentHeatTasks(
      FARM,
      new Date(),
    );
    const silent = db.tasks.filter((t) => t.type === 'SILENT_HEAT_CHECK');
    expect(silent).toHaveLength(1);
    expect(silent[0].dueAt.getHours()).toBe(4);
    expect(silent[0].titleEn).toContain('between 4 and 7am');
  });
});
