import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { RequestUser } from '../src/common/types';
import { MilkService } from '../src/milk/milk.service';
import { RoundsService } from '../src/rounds/rounds.service';
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

class RecordingFake {
  animals = new Map<string, any>();
  rounds = new Map<string, any>();
  skips: any[] = [];
  scans: any[] = [];
  milkRounds = new Map<string, any>();
  milkSkips: any[] = [];
  tanks = new Map<string, any>();
  entries: any[] = [];
  revisions: any[] = [];
  tasks: any[] = [];

  $transaction = async (arg: any) => {
    if (typeof arg === 'function') return arg(this);
    return Promise.all(arg);
  };

  milkWithhold = {
    findFirst: async () => null,
    findMany: async () => [],
  };

  recordingRound = {
    findFirst: async ({ where }: any) =>
      [...this.rounds.values()].find((r) => matchRound(r, where)) ?? null,
    create: async ({ data }: any) => {
      const row = {
        id: randomUUID(),
        recordedCount: 0,
        skippedCount: 0,
        status: 'ACTIVE',
        startedAt: new Date(),
        finishedAt: null,
        totalLitres: null,
        durationSeconds: null,
        secondsPerAnimal: null,
        ...data,
      };
      this.rounds.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.rounds.get(where.id);
      if (!row) throw new Error('round missing');
      if (data.recordedCount?.increment) row.recordedCount += data.recordedCount.increment;
      Object.assign(row, omitIncrement(data));
      return row;
    },
    findMany: async ({ where }: any) =>
      [...this.rounds.values()].filter((r) => r.farmId === where.farmId),
    count: async ({ where }: any) =>
      [...this.rounds.values()].filter((r) => !where?.id || r.id === where.id).length,
  };

  roundSkip = {
    findMany: async ({ where }: any) => this.skips.filter((s) => s.roundId === where.roundId),
    count: async ({ where }: any) => this.skips.filter((s) => s.roundId === where.roundId).length,
    upsert: async ({ where, create, update }: any) => {
      const found = this.skips.find(
        (s) => s.roundId === where.roundId_animalId.roundId && s.animalId === where.roundId_animalId.animalId,
      );
      if (found) {
        Object.assign(found, update);
        return found;
      }
      const row = { id: randomUUID(), ...create };
      this.skips.push(row);
      return row;
    },
  };

  scanEvent = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), scannedAt: new Date(), ...data };
      this.scans.push(row);
      return row;
    },
    findFirst: async ({ where }: any) =>
      this.scans.find(
        (s) =>
          s.farmId === where.farmId &&
          s.roundId === where.roundId &&
          s.animalId === where.animalId &&
          s.success === where.success,
      ) ?? null,
    findMany: async ({ where }: any) =>
      this.scans.filter((s) => s.roundId === where.roundId && s.success),
  };

  animal = {
    findFirst: async ({ where, include }: any) => {
      const row = [...this.animals.values()].find(
        (a) =>
          a.id === where.id &&
          a.farmId === where.farmId &&
          (where.deletedAt === null ? !a.deletedAt : true),
      );
      return row ? withIncludes(row, include, this) : null;
    },
    findMany: async ({ where, include }: any) => {
      return [...this.animals.values()]
        .filter((a) => {
          if (a.farmId !== where.farmId) return false;
          if (where.deletedAt === null && a.deletedAt) return false;
          if (where.gender && a.gender !== where.gender) return false;
          if (where.status?.notIn && where.status.notIn.includes(a.status)) return false;
          return true;
        })
        .map((a) => withIncludes(a, include, this));
    },
  };

  productionEntry = {
    findFirst: async ({ where, select }: any) => {
      const row = this.entries.find((e) => matchEntry(e, where));
      if (!row) return null;
      return select ? { id: row.id, quantity: row.quantity } : row;
    },
    findMany: async ({ where }: any) => this.entries.filter((e) => matchEntry(e, where)),
    create: async ({ data }: any) => {
      const dup = this.entries.find((e) => matchEntry(e, data));
      if (dup) {
        const err = new Error('Unique constraint');
        (err as any).code = 'P2002';
        throw err;
      }
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.entries.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.entries.find((e) => e.id === where.id);
      Object.assign(row, data);
      return row;
    },
    aggregate: async ({ where }: any) => {
      const rows = this.entries.filter((e) => matchEntry(e, where));
      return { _sum: { quantity: rows.reduce((s, e) => s + Number(e.quantity), 0) } };
    },
  };

  productionRevision = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.revisions.push(row);
      return row;
    },
  };

  milkRound = {
    findUnique: async ({ where }: any) => {
      const key = where.farmId_roundDate_session;
      return (
        [...this.milkRounds.values()].find(
          (r) =>
            r.farmId === key.farmId &&
            r.roundDate.getTime() === key.roundDate.getTime() &&
            r.session === key.session,
        ) ?? null
      );
    },
    findFirst: async ({ where, include }: any) => {
      const row = [...this.milkRounds.values()].find((r) => r.id === where.id && r.farmId === where.farmId);
      if (!row) return null;
      return {
        ...row,
        tank: include?.tank ? this.tanks.get(row.id) ?? null : undefined,
        skipped: include?.skipped ? this.milkSkips.filter((s) => s.roundId === row.id) : undefined,
        entries: include?.entries
          ? this.entries.filter((e) => e.milkRoundId === row.id).map((e) => ({ ...e, animal: this.animals.get(e.animalId) }))
          : undefined,
      };
    },
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), status: 'OPEN', ...data };
      this.milkRounds.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.milkRounds.get(where.id);
      Object.assign(row, data);
      return row;
    },
  };

  milkRoundSkip = {
    upsert: async ({ where, create, update }: any) => {
      const found = this.milkSkips.find(
        (s) => s.roundId === where.roundId_animalId.roundId && s.animalId === where.roundId_animalId.animalId,
      );
      if (found) {
        Object.assign(found, update);
        return found;
      }
      const row = { id: randomUUID(), ...create };
      this.milkSkips.push(row);
      return row;
    },
  };

  milkTank = {
    upsert: async ({ where, create, update }: any) => {
      const existing = [...this.tanks.values()].find((t) => t.roundId === where.roundId);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: randomUUID(), ...create };
      this.tanks.set(row.roundId, row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = [...this.tanks.values()].find((t) => t.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
  };

  task = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.tasks.push(row);
      return row;
    },
  };

  addAnimal(partial: Record<string, unknown>) {
    const row = {
      id: randomUUID(),
      farmId: FARM,
      tag: 'T',
      herdNumber: null,
      name: null,
      species: 'BUFFALO',
      gender: 'FEMALE',
      status: 'LACTATING',
      isPregnant: false,
      shed: '1',
      photoUrl: null,
      deletedAt: null,
      lactationStartDate: new Date(Date.now() - 40 * 86400000),
      expectedCalvingDate: null,
      ...partial,
    };
    this.animals.set(row.id, row);
    return row;
  }
}

function omitIncrement(data: any) {
  const next = { ...data };
  delete next.recordedCount;
  return next;
}

function matchRound(r: any, where: any) {
  if (where.id && r.id !== where.id) return false;
  if (where.farmId && r.farmId !== where.farmId) return false;
  if (where.status && r.status !== where.status) return false;
  if (where.mode && r.mode !== where.mode) return false;
  if (where.date && r.date.getTime() !== where.date.getTime()) return false;
  if (where.session && r.session !== where.session) return false;
  return true;
}

function matchEntry(e: any, where: any) {
  if (!where) return true;
  if (where.id && e.id !== where.id) return false;
  if (where.farmId && e.farmId !== where.farmId) return false;
  if (where.animalId?.not === null && !e.animalId) return false;
  if (typeof where.animalId === 'string' && e.animalId !== where.animalId) return false;
  if (where.type && e.type !== where.type) return false;
  if (where.session && e.session !== where.session) return false;
  if (where.entryDate instanceof Date && e.entryDate.getTime() !== where.entryDate.getTime()) return false;
  if (where.milkRoundId && e.milkRoundId !== where.milkRoundId) return false;
  if (where.destination && e.destination !== where.destination) return false;
  return true;
}

function withIncludes(animal: any, include: any, _db: RecordingFake) {
  if (!include) return animal;
  return {
    ...animal,
    health: include.health
      ? (animal.health ?? []).filter((h: any) => !h.milkWithholdUntil || h.milkWithholdUntil >= new Date())
      : undefined,
    production: include.production ? (animal.production ?? []) : undefined,
    markers: include.markers ? (animal.markers ?? []).filter((m: any) => !m.removedAt) : undefined,
  };
}

describe('Phase 2 scan-to-record', () => {
  let db: RecordingFake;
  let rounds: RoundsService;
  let milk: MilkService;
  let actor: RequestUser;

  beforeEach(() => {
    db = new RecordingFake();
    milk = new MilkService(db as any, fakeAudit);
    rounds = new RoundsService(db as any, fakeAudit, milk);
    actor = user();
  });

  it('creates a round, records twenty animals, and finishes with secondsPerAnimal', async () => {
    const herd = Array.from({ length: 20 }, (_, i) =>
      db.addAnimal({ herdNumber: `B${String(i + 1).padStart(2, '0')}`, name: `A${i}` }),
    );
    const round = await rounds.create(actor, { mode: 'MILKING', session: 'MORNING' });
    for (const animal of herd) {
      await milk.createEntry(actor, {
        animalId: animal.id,
        session: 'MORNING',
        litres: 10,
        disposal: 'SOLD',
        roundId: round.id,
      });
    }
    const remaining = await rounds.remaining(actor, round.id);
    expect(remaining.remaining).toHaveLength(0);
    expect(remaining.recorded).toBe(20);

    const finished = await rounds.finish(actor, round.id, { skips: [] });
    expect(finished.status).toBe('FINISHED');
    expect(finished.recordedCount).toBe(20);
    expect(finished.secondsPerAnimal).not.toBeNull();
    expect(finished.totalLitres).toBe(200);
  });

  it('returns 409 on a second POST /milk for the same animal/date/session', async () => {
    const animal = db.addAnimal({ herdNumber: 'B01' });
    await milk.createEntry(actor, { animalId: animal.id, session: 'MORNING', litres: 8, disposal: 'SOLD' });
    await expect(
      milk.createEntry(actor, { animalId: animal.id, session: 'MORNING', litres: 9, disposal: 'SOLD' }),
    ).rejects.toBeInstanceOf(ConflictException);
    try {
      await milk.createEntry(actor, { animalId: animal.id, session: 'MORNING', litres: 9, disposal: 'SOLD' });
    } catch (err) {
      expect((err as ConflictException).getResponse()).toMatchObject({ code: 'DUPLICATE_MILK_RECORD' });
    }
  });

  it('returns 422 MILK_WITHHOLD_ACTIVE when selling under an active withhold', async () => {
    const animal = db.addAnimal({
      herdNumber: 'B05',
      health: [{ milkWithholdUntil: new Date(Date.now() + 86400000), medicine: 'Oxytetracycline', title: 'Oxytet' }],
    });
    try {
      await milk.createEntry(actor, { animalId: animal.id, session: 'MORNING', litres: 6, disposal: 'SOLD' });
      throw new Error('expected 422');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getStatus()).toBe(422);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'MILK_WITHHOLD_ACTIVE',
      });
    }
  });

  it('returns 422 ANIMAL_NOT_MILKING for dry or sold animals', async () => {
    const dry = db.addAnimal({ herdNumber: 'B09', status: 'DRY' });
    await expect(
      milk.createEntry(actor, { animalId: dry.id, session: 'MORNING', litres: 4, disposal: 'SOLD' }),
    ).rejects.toMatchObject({ response: { code: 'ANIMAL_NOT_MILKING' } });
  });

  it('scan payload includes a withhold block and alreadyRecordedThisRound', async () => {
    const animal = db.addAnimal({
      herdNumber: 'B12',
      name: 'Kali',
      health: [{ milkWithholdUntil: new Date(Date.now() + 86400000), medicine: 'Oxytetracycline', title: 'Oxytet' }],
      production: [{ quantity: 12.4, entryDate: new Date(Date.now() - 2 * 86400000) }],
    });
    const round = await rounds.create(actor, { mode: 'MILKING', session: 'MORNING' });
    const first = await rounds.scan(actor, { rawPayload: animal.id, method: 'CAMERA', roundId: round.id });
    expect(first.blocks[0]?.kind).toBe('MILK_WITHHOLD');
    expect(first.blocks[0]?.blocksDisposal).toEqual(['SOLD']);
    expect(first.context.alreadyRecordedThisRound).toBe(false);
    expect(first.context.rolling7Mean).toBeCloseTo(12.4);
    expect(first.context.expectedRangeLow).toBeCloseTo(7.4);
    expect(first.context.expectedRangeHigh).toBeCloseTo(17.4);
    expect(first.nextAction).toBe('MILK_ENTRY');

    await milk.createEntry(actor, {
      animalId: animal.id,
      session: 'MORNING',
      litres: 11,
      disposal: 'DISCARDED',
      roundId: round.id,
    });
    const again = await rounds.scan(actor, { rawPayload: `/a/${animal.id}`, method: 'CAMERA', roundId: round.id });
    expect(again.context.alreadyRecordedThisRound).toBe(true);
    expect(again.context.existingValue).toBe(11);
  });

  it('search ranking used by scans returns both species for 42', async () => {
    db.addAnimal({ herdNumber: 'B42', species: 'BUFFALO', photoUrl: '/b42.jpg', shed: '1' });
    db.addAnimal({ herdNumber: 'C42', species: 'COW', photoUrl: '/c42.jpg', shed: '2' });
    db.addAnimal({ herdNumber: 'B07', species: 'BUFFALO' });
    const { AnimalsService } = await import('../src/animals/animals.service');
    const { fakeSpeciesConfig } = await import('./fakes');
    const animals = new AnimalsService(db as any, fakeAudit, fakeSpeciesConfig, { issue: async () => 'B99' } as any);
    const hits = await animals.search(actor, '42');
    expect(hits.map((h) => h.shortNo).sort()).toEqual(['B42', 'C42']);
    expect(hits.every((h) => h.species && h.photoUrl !== undefined && h.penName !== undefined)).toBe(true);
  });

  it('remaining lists only unrecorded lactating animals and finish writes RoundSkip rows', async () => {
    const a = db.addAnimal({ herdNumber: 'B01', status: 'LACTATING' });
    const b = db.addAnimal({ herdNumber: 'B02', status: 'LACTATING' });
    db.addAnimal({ herdNumber: 'B03', status: 'DRY' });
    db.addAnimal({ herdNumber: 'B04', status: 'SOLD' });
    const round = await rounds.create(actor, { mode: 'MILKING', session: 'MORNING' });
    await milk.createEntry(actor, { animalId: a.id, session: 'MORNING', litres: 9, disposal: 'SOLD', roundId: round.id });
    const left = await rounds.remaining(actor, round.id);
    expect(left.remaining.map((r) => r.shortNo)).toEqual(['B02']);
    const finished = await rounds.finish(actor, round.id, {
      skips: [{ animalId: b.id, reason: 'NOT_MILKED', note: 'lame' }],
    });
    expect(finished.skippedCount).toBe(1);
    expect(db.skips).toHaveLength(1);
    expect(db.skips[0]).toMatchObject({ animalId: b.id, reason: 'NOT_MILKED' });
  });
});
