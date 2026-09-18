import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import { SYSTEM_REMINDER_RULES } from '../src/breeding/reminder-catalog';
import type { RequestUser } from '../src/common/types';
import { BreedingService } from '../src/breeding/breeding.service';
import { BreedingBoardService } from '../src/breeding/breeding-board.service';
import { ReminderEngineService } from '../src/breeding/reminder-engine.service';
import { ReproStageService } from '../src/breeding/repro-stage.service';
import { NightlyJob } from '../src/jobs/nightly.job';
import { fakeAudit, fakeSpeciesConfig, nepalHourIn } from './fakes';

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
  farms: any[] = [{ id: FARM }];

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
        doNotBreed: false,
        reproStage: 'NOT_BREEDING',
        reproStageSince: null,
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
    count: async ({ where }: any) => [...this.animals.values()].filter((a) => matchAnimal(a, where)).length,
  };

  heatEvent = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), wasBred: false, ...data };
      this.heatEvents.push(row);
      return row;
    },
    count: async ({ where }: any) =>
      this.heatEvents.filter((h) => {
        if (where.animalId && h.animalId !== where.animalId) return false;
        if (where.farmId && h.farmId !== where.farmId) return false;
        if (where.observedAt?.gte && h.observedAt < where.observedAt.gte) return false;
        return true;
      }).length,
    findFirst: async ({ where }: any) => {
      const rows = this.heatEvents.filter((h) => {
        if (where.id && h.id !== where.id) return false;
        if (where.animalId && h.animalId !== where.animalId) return false;
        if (where.farmId && h.farmId !== where.farmId) return false;
        if (where.observedAt?.gte && h.observedAt < where.observedAt.gte) return false;
        if (where.observedAt instanceof Date && h.observedAt.getTime() !== where.observedAt.getTime()) {
          return false;
        }
        return true;
      });
      return rows.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0] ?? null;
    },
    update: async ({ where, data }: any) => {
      const row = this.heatEvents.find((h) => h.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      for (const h of this.heatEvents) {
        if (where.id && h.id !== where.id) continue;
        if (where.farmId && h.farmId !== where.farmId) continue;
        Object.assign(h, data);
      }
    },
    delete: async ({ where }: any) => {
      const idx = this.heatEvents.findIndex((h) => h.id === where.id);
      if (idx >= 0) this.heatEvents.splice(idx, 1);
    },
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
    findFirst: async ({ where, include }: any) => {
      const row = this.heatLogs.find(
        (h) =>
          (!where.id || h.id === where.id) &&
          (!where.farmId || h.farmId === where.farmId) &&
          (!where.animalId || h.animalId === where.animalId),
      );
      if (!row) return null;
      return include?.animal
        ? { ...row, animal: { tag: this.animals.get(row.animalId)?.tag ?? 'B01' } }
        : row;
    },
    update: async ({ where, data, include }: any) => {
      const row = this.heatLogs.find((h) => h.id === where.id);
      Object.assign(row, data);
      return include?.animal
        ? { ...row, animal: { tag: this.animals.get(row.animalId)?.tag ?? 'B01' } }
        : row;
    },
    delete: async ({ where }: any) => {
      const idx = this.heatLogs.findIndex((h) => h.id === where.id);
      if (idx >= 0) this.heatLogs.splice(idx, 1);
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
      this.services.filter((s) => {
        if (where.animalId && s.animalId !== where.animalId) return false;
        if (where.farmId && s.farmId !== where.farmId) return false;
        if (where.result?.not && s.result === where.result.not) return false;
        if (where.result && !where.result.not && s.result !== where.result) return false;
        if (where.serviceDate?.gte && s.serviceDate < where.serviceDate.gte) return false;
        return true;
      }).length,
    findFirst: async ({ where }: any) => {
      const rows = this.services.filter((s) => {
        if (where.id && s.id !== where.id) return false;
        if (where.animalId && s.animalId !== where.animalId) return false;
        if (where.farmId && s.farmId !== where.farmId) return false;
        if (where.serviceDate?.gte && s.serviceDate < where.serviceDate.gte) return false;
        if (where.serviceDate?.gt && s.serviceDate <= where.serviceDate.gt) return false;
        return true;
      });
      return rows.at(-1) ?? null;
    },
    update: async ({ where, data }: any) => {
      const row = this.services.find((s) => s.id === where.id);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      for (const s of this.services) {
        if (where.farmId && s.farmId !== where.farmId) continue;
        if (where.heatEventId && s.heatEventId !== where.heatEventId) continue;
        Object.assign(s, data);
      }
    },
    findMany: async ({ where, include }: any = {}) =>
      this.services
        .filter((s) => {
          if (where?.farmId && s.farmId !== where.farmId) return false;
          if (where?.animalId && s.animalId !== where.animalId) return false;
          if (where?.serviceDate?.gt && s.serviceDate <= where.serviceDate.gt) return false;
          if (where?.serviceDate?.gte && s.serviceDate < where.serviceDate.gte) return false;
          return true;
        })
        .map((s) => (include?.animal ? { ...s, animal: this.animals.get(s.animalId) } : s)),
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
          (!where.motherId || r.motherId === where.motherId) &&
          (!where.pregnancyStatus?.in || where.pregnancyStatus.in.includes(r.pregnancyStatus)),
      );
      if (!row) return null;
      const mother = this.animals.get(row.motherId);
      return include?.mother
        ? { ...row, mother: mother ? { tag: mother.tag, species: mother.species } : { tag: 'B01' } }
        : row;
    },
    findMany: async ({ where }: any) =>
      this.records.filter((r) => r.farmId === where.farmId && (!where.motherId || r.motherId === where.motherId)),
    update: async ({ where, data, include }: any) => {
      const row = this.records.find((r) => r.id === where.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return include?.mother ? { ...row, mother: { tag: this.animals.get(row.motherId)?.tag } } : row;
    },
    delete: async ({ where }: any) => {
      const idx = this.records.findIndex((r) => r.id === where.id);
      if (idx >= 0) this.records.splice(idx, 1);
    },
    count: async () => this.records.length,
  };

  pregnancyCheck = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.checks.push(row);
      return row;
    },
    count: async ({ where }: any) =>
      this.checks.filter((c) => {
        if (where.serviceId && c.serviceId !== where.serviceId) return false;
        if (where.result && c.result !== where.result) return false;
        if (where.farmId && c.farmId !== where.farmId) return false;
        return true;
      }).length,
  };

  calvingEvent = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.calvings.push(row);
      return row;
    },
    findFirst: async ({ where }: any) =>
      this.calvings.filter((c) => c.damId === where.damId && c.outcome !== 'ABORTED').at(-1) ?? null,
    findMany: async ({ where, include }: any) =>
      this.calvings
        .filter((c) => {
          if (where?.farmId && c.farmId !== where.farmId) return false;
          if (where?.damId && c.damId !== where.damId) return false;
          if (where?.calvingAt?.gte && c.calvingAt < where.calvingAt.gte) return false;
          if (where?.outcome?.not === 'ABORTED' && c.outcome === 'ABORTED') return false;
          if (where?.outcome && !where.outcome.not && c.outcome !== where.outcome) return false;
          return true;
        })
        .map((c) => ({
          ...c,
          dam: include?.dam ? this.animals.get(c.damId) : undefined,
          calves: include?.calves
            ? this.calves
                .filter((k) => k.calvingId === c.id)
                .map((k) => ({ ...k, animal: this.animals.get(k.animalId) }))
            : undefined,
        })),
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
    findFirst: async ({ where, orderBy }: any) => {
      const rows = this.feedings.filter((f) => {
        if (where?.farmId && f.farmId !== where.farmId) return false;
        if (where?.animalId && f.animalId !== where.animalId) return false;
        if (where?.calfRecordId && f.calfRecordId !== where.calfRecordId) return false;
        return true;
      });
      if (orderBy?.fedAt === 'asc') rows.sort((a, b) => a.fedAt.getTime() - b.fedAt.getTime());
      return rows[0] ?? null;
    },
    count: async ({ where }: any) =>
      this.feedings.filter((f) => !where?.calfRecordId || f.calfRecordId === where.calfRecordId).length,
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
      const row = { id: randomUUID(), status: 'PENDING', supersededBy: null, ...data };
      this.tasks.push(row);
      return row;
    },
    findFirst: async ({ where }: any) =>
      this.tasks.find((t) => {
        if (where.id && t.id !== where.id) return false;
        if (where.farmId && t.farmId !== where.farmId) return false;
        if (where.animalId && t.animalId !== where.animalId) return false;
        if (where.type && t.type !== where.type) return false;
        if (where.status?.in && !where.status.in.includes(t.status)) return false;
        if (where.status && !where.status.in && t.status !== where.status) return false;
        if (where.sourceRefId && t.sourceRefId !== where.sourceRefId) return false;
        if (where.sourceRefType && t.sourceRefType !== where.sourceRefType) return false;
        return true;
      }) ?? null,
    count: async ({ where }: any) =>
      this.tasks.filter((t) => {
        if (where.farmId && t.farmId !== where.farmId) return false;
        if (where.animalId && t.animalId !== where.animalId) return false;
        if (where.sourceRefType && t.sourceRefType !== where.sourceRefType) return false;
        return true;
      }).length,
    update: async ({ where, data }: any) => {
      const row = this.tasks.find((t) => t.id === where.id);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const t of this.tasks) {
        if (where.id && t.id !== where.id) continue;
        if (where.farmId && t.farmId !== where.farmId) continue;
        if (where.animalId && t.animalId !== where.animalId) continue;
        if (where.type?.in && !where.type.in.includes(t.type)) continue;
        if (where.type && !where.type.in && t.type !== where.type) continue;
        if (where.status?.in && !where.status.in.includes(t.status)) continue;
        if (where.sourceRefType?.in && !where.sourceRefType.in.includes(t.sourceRefType)) continue;
        else if (where.sourceRefType && !where.sourceRefType.in && t.sourceRefType !== where.sourceRefType) continue;
        if (where.supersededBy === null && t.supersededBy != null) continue;
        if (where.dueAt?.lt && !(t.dueAt && t.dueAt < where.dueAt.lt)) continue;
        if (where.priority?.not && t.priority === where.priority.not) continue;
        Object.assign(t, data);
        count += 1;
      }
      return { count };
    },
    findMany: async ({ where, include }: any = {}) =>
      this.tasks
        .filter((t) => {
          if (!where) return true;
          if (where.farmId && t.farmId !== where.farmId) return false;
          if (where.animalId && t.animalId !== where.animalId) return false;
          if (where.type?.in && !where.type.in.includes(t.type)) return false;
          if (where.type && !where.type.in && t.type !== where.type) return false;
          if (where.status?.in && !where.status.in.includes(t.status)) return false;
          if (where.dueAt?.lt && t.dueAt >= where.dueAt.lt) return false;
          if (where.deletedAt === null && t.deletedAt) return false;
          return true;
        })
        .map((t) =>
          include?.animal
            ? { ...t, animal: { ...this.animals.get(t.animalId), pen: null, breedingServices: this.services.filter((s) => s.animalId === t.animalId), heatEvents: this.heatEvents.filter((h) => h.animalId === t.animalId) } }
            : t,
        ),
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
    findFirst: async ({ where }: any) =>
      this.markers.find(
        (m) =>
          m.animalId === where.animalId &&
          m.meaning === where.meaning &&
          (where.removedAt === null ? !m.removedAt : true),
      ) ?? null,
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.markers.push(row);
      return row;
    },
  };

  heatObservation = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.observations.push(row);
      return row;
    },
    deleteMany: async ({ where }: any) => {
      this.observations = this.observations.filter((o) => {
        if (where.farmId && o.farmId !== where.farmId) return true;
        if (where.heatEventId && o.heatEventId === where.heatEventId) return false;
        return true;
      });
    },
  };
  observations: any[] = [];

  semenStraw = {
    updateMany: async ({ where, data }: any) => {
      for (const s of this.straws) {
        if (where.id && s.id !== where.id) continue;
        if (data.qtyRemaining?.decrement) s.qtyRemaining -= data.qtyRemaining.decrement;
        else Object.assign(s, data);
      }
    },
  };
  straws: any[] = [];

  syncEnrollment = {
    findMany: async ({ where }: any) =>
      this.enrollments.filter((e) => {
        if (where?.farmId && e.farmId !== where.farmId) return false;
        if (where?.status && e.status !== where.status) return false;
        if (where?.id && e.id !== where.id) return false;
        return true;
      }),
    findFirst: async ({ where, include }: any) => {
      const row = this.enrollments.find(
        (e) =>
          (!where.id || e.id === where.id) &&
          (!where.farmId || e.farmId === where.farmId) &&
          (!where.status || e.status === where.status),
      );
      if (!row) return null;
      return include?.protocol || include?.animal
        ? {
            ...row,
            protocol: this.protocols.find((p) => p.id === row.protocolId),
            animal: this.animals.get(row.animalId),
          }
        : row;
    },
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
      this.enrollments.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.enrollments.find((e) => e.id === where.id);
      Object.assign(row, data);
      return row;
    },
  };
  enrollments: any[] = [];
  protocols: any[] = [];

  farm = {
    findMany: async () => this.farms,
    findUnique: async ({ where }: any) => this.farms.find((f) => f.id === where.id) ?? this.farms[0] ?? null,
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
  stockLot = { findMany: async () => [] };
  reminderRule = { findMany: async () => [] };
  stageHistory: any[] = [];
  reproStageHistory = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), ...data };
      this.stageHistory.push(row);
      return row;
    },
    findMany: async ({ where }: any) =>
      this.stageHistory.filter((h) => {
        if (where?.farmId && h.farmId !== where.farmId) return false;
        if (where?.daysInPrevious?.not != null && h.daysInPrevious == null) return false;
        return true;
      }),
  };
}

function matchAnimal(a: any, where: any): boolean {
  if (!where) return true;
  if (where.id && a.id !== where.id) return false;
  if (where.farmId && a.farmId !== where.farmId) return false;
  if (where.deletedAt === null && a.deletedAt) return false;
  if (where.species?.in) {
    if (!where.species.in.includes(a.species)) return false;
  } else if (where.species && a.species !== where.species) return false;
  if (where.gender && a.gender !== where.gender) return false;
  if (where.isPregnant === false && a.isPregnant) return false;
  if (where.isPregnant === true && !a.isPregnant) return false;
  if (where.expectedCalvingDate?.not === null && a.expectedCalvingDate == null) return false;
  if (where.highRiskFPT === true && !a.highRiskFPT) return false;
  if (where.reproStage?.in) {
    if (!where.reproStage.in.includes(a.reproStage)) return false;
  } else if (where.reproStage && a.reproStage !== where.reproStage) return false;
  if (where.reproStageSince?.lte && !(a.reproStageSince && a.reproStageSince <= where.reproStageSince.lte)) {
    return false;
  }
  if (where.status?.notIn && where.status.notIn.includes(a.status)) return false;
  if (where.status?.in && !where.status.in.includes(a.status)) return false;
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
    doNotBreed: false,
    highRiskFPT: false,
    reproStage: 'NOT_BREEDING',
    reproStageSince: null,
    ...overrides,
  };
}

function breedingJobs(db: BreedingFake) {
  const reminders = new ReminderEngineService(db as never, fakeSpeciesConfig);
  const stages = new ReproStageService(db as never, fakeSpeciesConfig, reminders);
  const job = new NightlyJob(db as never, fakeSpeciesConfig, undefined, undefined, stages, reminders);
  return { reminders, stages, job };
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
    expect(colostrum).toHaveLength(2);
    expect(colostrum.every((t) => t.priority === 'CRITICAL')).toBe(true);
    expect(colostrum.every((t) => t.titleEn.includes('Colostrum'))).toBe(true);
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
    expect(db.tasks.filter((t) => t.type === 'COLOSTRUM_FEED')).toHaveLength(1);
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

  it('colostrum at 7 hours sets highRiskFPT and schedules a high-risk calf check', async () => {
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
    expect(db.tasks.filter((t) => t.type === 'CALF_HEALTH_CHECK')).toHaveLength(1);
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

describe('BreedingService CRUD', () => {
  let db: BreedingFake;
  let svc: BreedingService;

  beforeEach(() => {
    db = new BreedingFake();
    svc = new BreedingService(db as never, fakeAudit, fakeSpeciesConfig, {
      issue: async () => 'B99',
    } as never);
  });

  it('deletes a breeding record and clears pregnancy when none remain', async () => {
    const mother = dam({ isPregnant: true });
    db.animals.set(mother.id, mother);
    const rec = {
      id: randomUUID(),
      farmId: FARM,
      motherId: mother.id,
      matingType: 'AI',
      fatherTagOrAi: 'STR-1',
      matingDate: new Date('2026-01-01'),
      dueDate: new Date('2026-10-08'),
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
    await svc.remove(user(), rec.id);
    expect(db.records).toHaveLength(0);
    expect(db.animals.get(mother.id).isPregnant).toBe(false);
  });

  it('updates heat intensity and deletes the paired heat event', async () => {
    const mother = dam();
    db.animals.set(mother.id, mother);
    const observedAt = new Date('2026-03-01T05:00:00Z');
    const heat = await svc.logHeat(user(), {
      animalId: mother.id,
      observedAt,
      intensity: 'MEDIUM',
      notes: 'first',
    });
    const updated = await svc.updateHeat(user(), heat.id, { intensity: 'STRONG', notes: 'corrected' });
    expect(updated.intensity).toBe('STRONG');
    expect(updated.notes).toBe('corrected');
    await svc.removeHeat(user(), heat.id);
    expect(db.heatLogs).toHaveLength(0);
    expect(db.heatEvents).toHaveLength(0);
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
      expectedCalvingDate: null,
      reproStage: 'ANESTRUS_SUSPECTED',
    });
    db.animals.set(animal.id, animal);
    const { reminders } = breedingJobs(db);
    await reminders.generateStageReminders(FARM, new Date());
    const silent = db.tasks.filter((t) => t.type === 'SILENT_HEAT_CHECK');
    expect(silent).toHaveLength(1);
    expect(nepalHourIn(silent[0].dueAt)).toBe(4);
    expect(silent[0].titleEn).toContain('between 4 and 7am');
  });
});

describe('BreedingService Phase 4B chain', () => {
  let db: BreedingFake;
  let svc: BreedingService;

  beforeEach(() => {
    db = new BreedingFake();
    svc = new BreedingService(db as never, fakeAudit, fakeSpeciesConfig, { issue: async () => 'B99' } as never);
  });

  it('does not create SERVICE_WINDOW when buffalo DIM is under the waiting period', async () => {
    const mother = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });
    db.animals.set(mother.id, mother);
    const result = await svc.logHeat(user(), {
      animalId: mother.id,
      observedAt: new Date(),
      intensity: 'STRONG',
    });
    expect(result.tooSoonDays).toBeGreaterThan(0);
    expect(db.tasks.some((t) => t.type === 'SERVICE_WINDOW')).toBe(false);
    expect(db.observations.some((o) => o.observed === true)).toBe(true);
  });

  it('creates SERVICE_WINDOW at +12h when the waiting period has passed', async () => {
    const observedAt = new Date('2026-03-17T05:00:00+05:45');
    const mother = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date('2025-12-01'),
    });
    db.animals.set(mother.id, mother);
    await svc.logHeat(user(), { animalId: mother.id, observedAt, intensity: 'STRONG' });
    const window = db.tasks.find((t) => t.type === 'SERVICE_WINDOW');
    expect(window).toBeTruthy();
    expect(window.dueAt.getTime()).toBe(observedAt.getTime() + 12 * 60 * 60 * 1000);
  });

  it('recording a service marks SERVICE_WINDOW SUPERSEDED and sets wasBred', async () => {
    const mother = dam({ isPregnant: false, status: 'LACTATING', lactationStartDate: new Date('2025-11-01') });
    db.animals.set(mother.id, mother);
    const heat = await svc.logHeat(user(), {
      animalId: mother.id,
      observedAt: new Date(Date.now() - 14 * 60 * 60 * 1000),
      intensity: 'STRONG',
    });
    await svc.create(user(), {
      motherId: mother.id,
      heatEventId: heat.heatEventId,
      serviceDate: new Date(),
      method: 'AI',
      pregnancyStatus: 'PREGNANT',
    });
    expect(db.tasks.find((t) => t.type === 'SERVICE_WINDOW')?.status).toBe('SUPERSEDED');
    expect(db.heatEvents.find((h) => h.id === heat.heatEventId)?.wasBred).toBe(true);
    const pd = db.tasks.find((t) => t.type === 'PREGNANCY_CHECK');
    expect(pd).toBeTruthy();
    const days = Math.round((pd.dueAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    expect(days).toBeGreaterThanOrEqual(44);
    expect(days).toBeLessThanOrEqual(46);
    expect(db.records.find((r) => r.motherId === mother.id)?.pregnancyStatus).toBe('OPEN');
    expect(db.tasks.some((t) => t.type === 'HEAT_WATCH' && t.status === 'SUPERSEDED')).toBe(true);
  });

  it('a third service creates REPEAT_BREEDER', async () => {
    const mother = dam({ isPregnant: false, status: 'LACTATING', lactationStartDate: new Date('2025-11-01') });
    db.animals.set(mother.id, mother);
    db.services.push(
      { id: randomUUID(), farmId: FARM, animalId: mother.id, result: 'FAILED', serviceDate: new Date() },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, result: 'FAILED', serviceDate: new Date() },
    );
    await svc.create(user(), { motherId: mother.id, serviceDate: new Date(), method: 'NATURAL', pregnancyStatus: 'PREGNANT' });
    expect(db.tasks.some((t) => t.type === 'REPEAT_BREEDER')).toBe(true);
  });

  it('confirming pregnancy supersedes heat and anestrus tasks and creates dry-off plus calving watches', async () => {
    const mother = dam({ isPregnant: false, status: 'LACTATING' });
    db.animals.set(mother.id, mother);
    const rec = {
      id: randomUUID(),
      farmId: FARM,
      motherId: mother.id,
      matingType: 'AI',
      fatherTagOrAi: null,
      matingDate: new Date('2026-01-01'),
      dueDate: new Date('2026-11-07'),
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
      method: 'AI',
      result: 'PENDING',
    });
    db.tasks.push(
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'HEAT_WATCH', status: 'PENDING' },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'ANESTRUS_MINERAL', status: 'PENDING' },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'PREGNANCY_CHECK', status: 'PENDING' },
    );
    await svc.pregnancyCheck(user(), rec.id, {
      result: 'PREGNANT',
      estimatedDaysPregnant: 50,
      checkDate: new Date('2026-03-01T00:00:00Z'),
    });
    expect(db.tasks.filter((t) => t.type === 'HEAT_WATCH' || t.type === 'ANESTRUS_MINERAL').every((t) => t.status === 'SUPERSEDED')).toBe(true);
    expect(db.tasks.filter((t) => t.type === 'PREGNANCY_CHECK').every((t) => t.status === 'DONE')).toBe(true);
    expect(db.tasks.some((t) => t.type === 'DRY_OFF')).toBe(true);
    expect(db.tasks.filter((t) => t.type === 'CALVING_WATCH')).toHaveLength(6);
    expect(db.tasks.some((t) => t.type === 'FEED_TRANSITION')).toBe(true);
  });

  it('NOT_PREGNANT reopens HEAT_WATCH at +2 days', async () => {
    const mother = dam({ isPregnant: false, status: 'LACTATING' });
    db.animals.set(mother.id, mother);
    const rec = {
      id: randomUUID(),
      farmId: FARM,
      motherId: mother.id,
      matingType: 'NATURAL',
      fatherTagOrAi: null,
      matingDate: new Date(),
      dueDate: new Date(),
      pregnancyStatus: 'OPEN',
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
    const checkedAt = new Date('2026-03-01T00:00:00Z');
    db.tasks.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: mother.id,
      type: 'PREGNANCY_CHECK',
      status: 'PENDING',
      sourceRefId: rec.id,
    });
    await svc.pregnancyCheck(user(), rec.id, { result: 'NOT_PREGNANT', checkDate: checkedAt });
    expect(db.tasks.find((t) => t.sourceRefId === rec.id && t.type === 'PREGNANCY_CHECK')?.status).toBe('DONE');
    const watch = db.tasks.find((t) => t.type === 'HEAT_WATCH');
    expect(nepalHourIn(watch.dueAt)).toBe(5);
    expect(Math.round((watch.dueAt.getTime() - checkedAt.getTime()) / (24 * 60 * 60 * 1000))).toBe(2);
  });

  it('calving supersedes calving-watch and dry-off', async () => {
    const mother = dam();
    db.animals.set(mother.id, mother);
    db.tasks.push(
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'CALVING_WATCH', status: 'PENDING' },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'DRY_OFF', status: 'PENDING' },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'FEED_TRANSITION', status: 'PENDING' },
    );
    await svc.recordFarmCalving(user(), {
      damId: mother.id,
      calvingAt: new Date(),
      calves: [{ sex: 'FEMALE' }],
    });
    expect(db.tasks.filter((t) => ['CALVING_WATCH', 'DRY_OFF', 'FEED_TRANSITION'].includes(t.type)).every((t) => t.status === 'SUPERSEDED')).toBe(true);
  });

  it('abort reopens HEAT_WATCH and cancels calving watch', async () => {
    const mother = dam({ isPregnant: true, status: 'LACTATING' });
    db.animals.set(mother.id, mother);
    db.tasks.push(
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'CALVING_WATCH', status: 'PENDING' },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'DRY_OFF', status: 'PENDING' },
    );
    await svc.recordFarmCalving(user(), {
      damId: mother.id,
      calvingAt: new Date('2026-03-01T06:00:00+05:45'),
      outcome: 'ABORTED',
      calves: [],
    });
    expect(db.tasks.filter((t) => t.type === 'CALVING_WATCH' || t.type === 'DRY_OFF').every((t) => t.status === 'SUPERSEDED')).toBe(true);
    const watch = db.tasks.find((t) => t.type === 'HEAT_WATCH' && t.status === 'PENDING');
    expect(watch).toBeTruthy();
    expect(nepalHourIn(watch.dueAt)).toBe(5);
  });
});

describe('Nightly anestrus ladder', () => {
  it('creates ANESTRUS_MINERAL for a buffalo 95 days post-calving, not ANESTRUS_VET', async () => {
    const db = new BreedingFake();
    db.farms = [{ id: FARM, effectivePriceNpr: 48.36, milkPriceNpr: 62 }];
    const animal = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000),
      expectedCalvingDate: null,
    });
    db.animals.set(animal.id, animal);
    await breedingJobs(db).job.runFarm(FARM, new Date());
    expect(db.tasks.some((t) => t.type === 'ANESTRUS_MINERAL')).toBe(true);
    expect(db.tasks.some((t) => t.type === 'ANESTRUS_VET')).toBe(false);
    expect(db.tasks.some((t) => t.type === 'SILENT_HEAT_CHECK' && nepalHourIn(t.dueAt) === 4)).toBe(true);
  });

  it('does not create SILENT_HEAT_CHECK for a cow 41 days quiet', async () => {
    const db = new BreedingFake();
    db.farms = [{ id: FARM, effectivePriceNpr: 48, milkPriceNpr: 62 }];
    const animal = dam({
      species: 'COW',
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date(Date.now() - 41 * 24 * 60 * 60 * 1000),
      expectedCalvingDate: null,
    });
    db.animals.set(animal.id, animal);
    await breedingJobs(db).job.runFarm(FARM, new Date());
    expect(db.tasks.some((t) => t.type === 'SILENT_HEAT_CHECK')).toBe(false);
  });

  it('ANESTRUS_DECISION body contains a rupee figure at 150+ days', async () => {
    const db = new BreedingFake();
    db.farms = [{ id: FARM, effectivePriceNpr: 48.36, milkPriceNpr: 62 }];
    const animal = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date(Date.now() - 160 * 24 * 60 * 60 * 1000),
      expectedCalvingDate: null,
    });
    db.animals.set(animal.id, animal);
    await breedingJobs(db).job.runFarm(FARM, new Date());
    const decision = db.tasks.find((t) => t.type === 'ANESTRUS_DECISION');
    expect(decision).toBeTruthy();
    expect(decision.titleEn).toMatch(/NPR \d+/);
  });

  it('does not reopen a service window for a heat that was already bred', async () => {
    const db = new BreedingFake();
    const animal = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date('2025-11-01'),
      expectedCalvingDate: null,
    });
    db.animals.set(animal.id, animal);
    db.heatEvents.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: animal.id,
      observedAt: new Date(),
      wasBred: true,
    });
    await breedingJobs(db).reminders.generateEventReminders(FARM, new Date());
    expect(db.tasks.some((t) => t.type === 'SERVICE_WINDOW')).toBe(false);
  });

  it('anestrus ignores heats from the previous lactation', async () => {
    const db = new BreedingFake();
    db.farms = [{ id: FARM, effectivePriceNpr: 48, milkPriceNpr: 62 }];
    const lactationStart = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
    const animal = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: lactationStart,
      expectedCalvingDate: null,
    });
    db.animals.set(animal.id, animal);
    db.heatEvents.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: animal.id,
      observedAt: new Date(lactationStart.getTime() - 200 * 24 * 60 * 60 * 1000),
    });
    await breedingJobs(db).job.runFarm(FARM, new Date());
    expect(db.tasks.some((t) => t.type === 'ANESTRUS_MINERAL')).toBe(true);
  });
});

describe('Dry-off pregnancy guard', () => {
  function pregnantDamWithRecord(db: BreedingFake) {
    const mother = dam({
      isPregnant: true,
      status: 'LACTATING',
      expectedCalvingDate: new Date('2026-05-01T00:00:00Z'),
      pregnancyConfirmedDate: new Date('2026-01-01T00:00:00Z'),
    });
    db.animals.set(mother.id, mother);
    db.records.push({
      id: randomUUID(),
      farmId: FARM,
      motherId: mother.id,
      matingType: 'AI',
      matingDate: new Date('2025-07-01T00:00:00Z'),
      dueDate: new Date('2026-05-01T00:00:00Z'),
      pregnancyStatus: 'CONFIRMED',
      createdAt: new Date('2025-07-01T00:00:00Z'),
      updatedAt: new Date('2025-07-01T00:00:00Z'),
    });
    db.services.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: mother.id,
      serviceDate: new Date('2025-07-01T00:00:00Z'),
      method: 'AI',
      result: 'PENDING',
    });
    db.tasks.push(
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'DRY_OFF', status: 'PENDING' },
      { id: randomUUID(), farmId: FARM, animalId: mother.id, type: 'CALVING_WATCH', status: 'PENDING' },
    );
    const breeding = new BreedingService(
      db as never,
      fakeAudit,
      fakeSpeciesConfig,
      { issue: async () => 'B99' } as never,
    );
    const board = new BreedingBoardService(
      db as never,
      fakeAudit,
      fakeSpeciesConfig,
      undefined,
      breeding,
    );
    return { mother, board };
  }

  it('keeps her milking and reopens heat watch when she is empty at dry-off', async () => {
    const db = new BreedingFake();
    const { mother, board } = pregnantDamWithRecord(db);
    const result = await board.completeDryOff(user(), {
      animalId: mother.id,
      stillPregnant: false,
    });
    expect(result.driedOff).toBe(false);
    const after = db.animals.get(mother.id);
    expect(after.status).not.toBe('DRY');
    expect(after.isPregnant).toBe(false);
    expect(after.expectedCalvingDate).toBeNull();
    const watch = db.tasks.find((t) => t.type === 'HEAT_WATCH' && t.status === 'PENDING');
    expect(watch).toBeTruthy();
    expect(nepalHourIn(watch.dueAt)).toBe(5);
    expect(db.tasks.filter((t) => t.type === 'CALVING_WATCH').every((t) => t.status === 'SUPERSEDED')).toBe(true);
    expect(db.checks.some((c) => c.result === 'NOT_PREGNANT')).toBe(true);
  });

  it('dries her off as usual when she is confirmed still pregnant', async () => {
    const db = new BreedingFake();
    const { mother, board } = pregnantDamWithRecord(db);
    const result = await board.completeDryOff(user(), {
      animalId: mother.id,
      stillPregnant: true,
    });
    expect(result.driedOff).toBe(true);
    expect(db.animals.get(mother.id).status).toBe('DRY');
    expect(db.animals.get(mother.id).isPregnant).toBe(true);
  });

  it('tells the worker to confirm the pregnancy before drying off', () => {
    const rule = SYSTEM_REMINDER_RULES.find((row) => row.code === 'DRY_OFF_DUE');
    expect(rule?.titleEn).toMatch(/still pregnant/i);
    expect(rule?.titleNp).toContain('गर्भ');
  });
});

describe('Nightly and hourly jobs', () => {
  it('creates no extra pending tasks when nightly runs twice', async () => {
    const db = new BreedingFake();
    db.farms = [{ id: FARM, milkPriceNpr: 62 }];
    const animal = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000),
      expectedCalvingDate: null,
    });
    db.animals.set(animal.id, animal);
    const { job } = breedingJobs(db);
    const now = new Date();
    await job.runFarm(FARM, now);
    const first = db.tasks.filter((t) => t.status === 'PENDING').length;
    expect(first).toBeGreaterThan(0);
    await job.runFarm(FARM, now);
    expect(db.tasks.filter((t) => t.status === 'PENDING')).toHaveLength(first);
  });

  it('recomputes 60 animals in under 2 seconds', async () => {
    const db = new BreedingFake();
    db.farms = [{ id: FARM, milkPriceNpr: 62 }];
    for (let i = 0; i < 60; i += 1) {
      const animal = dam({
        tag: `B${String(i).padStart(2, '0')}`,
        herdNumber: `B${String(i).padStart(2, '0')}`,
        isPregnant: false,
        status: 'LACTATING',
        lactationStartDate: new Date(Date.now() - (80 + (i % 20)) * 24 * 60 * 60 * 1000),
        expectedCalvingDate: null,
      });
      db.animals.set(animal.id, animal);
    }
    const { stages } = breedingJobs(db);
    const started = Date.now();
    await stages.recomputeFarm(FARM, new Date());
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('marks an expired service window missed and reopens heat watch at estrusCycleDays', async () => {
    const db = new BreedingFake();
    const observedAt = new Date('2026-03-17T05:00:00+05:45');
    const now = new Date(observedAt.getTime() + 20 * 60 * 60 * 1000);
    const animal = dam({
      isPregnant: false,
      status: 'LACTATING',
      lactationStartDate: new Date('2025-11-01'),
      expectedCalvingDate: null,
    });
    db.animals.set(animal.id, animal);
    db.heatEvents.push({
      id: randomUUID(),
      farmId: FARM,
      animalId: animal.id,
      observedAt,
      wasBred: false,
    });
    const { reminders } = breedingJobs(db);
    await reminders.checkServiceWindows(FARM, now);
    const missed = db.tasks.find((t) => t.type === 'SERVICE_WINDOW' && t.sourceRefType === 'rule:SERVICE_WINDOW_MISSED');
    expect(missed).toBeTruthy();
    const watch = db.tasks.find((t) => t.type === 'HEAT_WATCH');
    expect(watch).toBeTruthy();
    const cfg = await fakeSpeciesConfig.forSpecies('BUFFALO');
    const days = Math.round((watch.dueAt.getTime() - observedAt.getTime()) / (24 * 60 * 60 * 1000));
    expect(days).toBe(cfg.estrusCycleDays);
  });
});
