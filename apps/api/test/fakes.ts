import { randomUUID } from 'node:crypto';
import type { AuditService } from '../src/audit/audit.service';
import type { SpeciesConfigService } from '../src/species-config/species-config.service';

/** No-op audit sink for unit tests. */
export const fakeAudit = {
  record: async () => undefined,
} as unknown as AuditService;

/**
 * Nepal wall-clock hour of an instant, read through Intl.
 *
 * Deliberately a different mechanism from the production helper in
 * common/nepal-time, so an hour assertion cannot pass by agreeing with the code
 * it is checking. Never assert Date#getHours: that reads the machine's zone and
 * so passes whatever the value is.
 */
export function nepalHourIn(date: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? '-1');
}

/**
 * Reproductive constants for tests. Buffalo and cow values match the seed, so a
 * test asserting a due date is checking the real gestation length.
 */
const SPECIES_CONSTANTS: Record<string, Record<string, number | null>> = {
  BUFFALO: {
    gestationDays: 310,
    lactationDays: 242,
    voluntaryWaitingDays: 60,
    estrusCycleDays: 21,
    ageFirstServiceMonths: 30,
    pregnancyCheckEarliestDays: 45,
    targetCalvingIntervalDays: 425,
    dryOffDaysBeforeCalving: 60,
    gestationVarianceDays: 10,
    minWeightFirstServiceKg: 300,
    serviceWindowStartHours: 12,
    serviceWindowEndHours: 18,
    silentHeatCheckHour: 4,
    fatMinPercent: 6.5,
    fatMaxPercent: 8,
    tempMinC: 37.5,
    tempMaxC: 39.5,
  },
  COW: {
    gestationDays: 283,
    lactationDays: 286,
    voluntaryWaitingDays: 50,
    estrusCycleDays: 21,
    ageFirstServiceMonths: 15,
    pregnancyCheckEarliestDays: 35,
    targetCalvingIntervalDays: 380,
    dryOffDaysBeforeCalving: 60,
    gestationVarianceDays: 7,
    minWeightFirstServiceKg: 250,
    serviceWindowStartHours: 12,
    serviceWindowEndHours: 18,
    silentHeatCheckHour: null,
    fatMinPercent: 3.5,
    fatMaxPercent: 4.5,
    tempMinC: 38.0,
    tempMaxC: 39.3,
  },
  PIG: {
    gestationDays: 114,
    lactationDays: 60,
    voluntaryWaitingDays: 30,
    estrusCycleDays: 21,
    ageFirstServiceMonths: 8,
    pregnancyCheckEarliestDays: 30,
    targetCalvingIntervalDays: 180,
    dryOffDaysBeforeCalving: 0,
    gestationVarianceDays: 3,
    minWeightFirstServiceKg: 120,
    serviceWindowStartHours: 12,
    serviceWindowEndHours: 18,
    silentHeatCheckHour: null,
    fatMinPercent: 5,
    fatMaxPercent: 8,
    tempMinC: 38.7,
    tempMaxC: 40.0,
  },
  GOAT: {
    gestationDays: 150,
    lactationDays: 180,
    voluntaryWaitingDays: 45,
    estrusCycleDays: 21,
    ageFirstServiceMonths: 10,
    pregnancyCheckEarliestDays: 35,
    targetCalvingIntervalDays: 240,
    dryOffDaysBeforeCalving: 30,
    gestationVarianceDays: 3,
    minWeightFirstServiceKg: 25,
    serviceWindowStartHours: 12,
    serviceWindowEndHours: 18,
    silentHeatCheckHour: null,
    fatMinPercent: 5,
    fatMaxPercent: 8,
    tempMinC: 38.5,
    tempMaxC: 40.5,
  },
};

export const fakeSpeciesConfig = {
  forSpecies: async (species: string) => ({
    species,
    ...SPECIES_CONSTANTS[species],
  }),
  all: async () =>
    Object.entries(SPECIES_CONSTANTS).map(([species, c]) => ({ species, ...c })),
  invalidate: () => undefined,
} as unknown as SpeciesConfigService;

interface AnimalRow {
  id: string;
  farmId: string;
  tag: string;
  herdNumber: string | null;
  name: string | null;
  species: string;
  breed: string;
  dateOfBirth: Date | null;
  gender: string;
  color: string | null;
  source: string | null;
  motherTag: string | null;
  purchaseDate: Date | null;
  purchaseCost: number | null;
  sellerName: string | null;
  distinguishingMarks: string | null;
  status: string;
  dobIsEstimated: boolean;
  ageAtAcquisitionMonths: number | null;
  isPregnant: boolean;
  pregnancyConfirmedDate: Date | null;
  expectedCalvingDate: Date | null;
  lactationNumber: number;
  lactationStartDate: Date | null;
  expectedLactationDays: number | null;
  breedComposition: unknown;
  breedingStock?: boolean;
  doNotBreed?: boolean;
  doNotBreedReason?: string | null;
  reproStage?: string;
  reproStageSince?: Date | null;
  reproStageComputedAt?: Date | null;
  notes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * In-memory stand-in for the PrismaClient surface used by SyncService and
 * AnimalApplier. Keeps unit tests runnable without a database.
 */
export class FakePrisma {
  animals = new Map<string, AnimalRow>();
  mutationRecords = new Map<string, Record<string, unknown>>();
  changeLog: Array<Record<string, unknown>> = [];
  devices = new Map<string, Record<string, unknown>>();
  private seq = 0n;

  $transaction = async <T>(fn: (tx: this) => Promise<T>): Promise<T> => fn(this);

  device = {
    upsert: async ({ where, update, create }: any) => {
      const existing = this.devices.get(where.id);
      const row = existing ? { ...existing, ...update } : { id: where.id, ...create };
      this.devices.set(where.id, row);
      return row;
    },
  };

  syncMutationRecord = {
    findUnique: async ({ where }: any) =>
      this.mutationRecords.get(where.clientMutationId) ?? null,
    create: async ({ data }: any) => {
      this.mutationRecords.set(data.clientMutationId, data);
      return data;
    },
  };

  changeLogEntry = {
    create: async ({ data }: any) => {
      this.seq += 1n;
      const row = { seq: this.seq, createdAt: new Date(), ...data };
      this.changeLog.push(row);
      return row;
    },
    findMany: async ({ where, take }: any) => {
      const rows = this.changeLog
        .filter(
          (e: any) => e.farmId === where.farmId && e.seq > (where.seq?.gt ?? -1n),
        )
        .sort((a: any, b: any) => (a.seq < b.seq ? -1 : 1));
      return rows.slice(0, take);
    },
  };

  animal = {
    findUnique: async ({ where }: any) => {
      if (where.id) return this.animals.get(where.id) ?? null;
      if (where.farmId_tag) {
        for (const a of this.animals.values()) {
          if (a.farmId === where.farmId_tag.farmId && a.tag === where.farmId_tag.tag) {
            return a;
          }
        }
      }
      return null;
    },
    findFirst: async ({ where }: any) => {
      for (const a of this.animals.values()) {
        if (where.id && a.id !== where.id) continue;
        if (where.farmId && a.farmId !== where.farmId) continue;
        if (where.herdNumber && a.herdNumber !== where.herdNumber) continue;
        if (where.deletedAt === null && a.deletedAt != null) continue;
        return a;
      }
      return null;
    },
    create: async ({ data }: any) => {
      const row: AnimalRow = {
        id: data.id ?? randomUUID(),
        farmId: data.farmId,
        tag: data.tag,
        herdNumber: data.herdNumber ?? null,
        name: data.name ?? null,
        species: data.species,
        breed: data.breed,
        dateOfBirth: data.dateOfBirth ?? null,
        gender: data.gender,
        color: data.color ?? null,
        source: data.source ?? null,
        motherTag: data.motherTag ?? null,
        purchaseDate: data.purchaseDate ?? null,
        purchaseCost: data.purchaseCost ?? null,
        sellerName: data.sellerName ?? null,
        distinguishingMarks: data.distinguishingMarks ?? null,
        status: data.status ?? 'ACTIVE',
        dobIsEstimated: data.dobIsEstimated ?? false,
        ageAtAcquisitionMonths: data.ageAtAcquisitionMonths ?? null,
        isPregnant: data.isPregnant ?? false,
        pregnancyConfirmedDate: data.pregnancyConfirmedDate ?? null,
        expectedCalvingDate: data.expectedCalvingDate ?? null,
        lactationNumber: data.lactationNumber ?? 0,
        lactationStartDate: data.lactationStartDate ?? null,
        expectedLactationDays: data.expectedLactationDays ?? null,
        breedComposition: data.breedComposition ?? null,
        breedingStock: data.breedingStock ?? true,
        doNotBreed: data.doNotBreed ?? false,
        doNotBreedReason: data.doNotBreedReason ?? null,
        reproStage: data.reproStage ?? 'NOT_BREEDING',
        reproStageSince: data.reproStageSince ?? null,
        reproStageComputedAt: data.reproStageComputedAt ?? null,
        notes: data.notes ?? null,
        version: data.version ?? 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      this.animals.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.animals.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  weightRecord = {
    create: async ({ data }: any) => ({ id: randomUUID(), ...data }),
  };

  animalTag = {
    create: async ({ data }: any) => ({ id: randomUUID(), ...data }),
  };

  animalStatusHistory = {
    create: async ({ data }: any) => {
      const row = {
        id: randomUUID(),
        fromStatus: data.fromStatus ?? null,
        reason: data.reason ?? null,
        changedBy: data.changedBy ?? null,
        deviceId: data.deviceId ?? null,
        changedAt: new Date(),
        createdAt: new Date(),
        ...data,
      };
      this.statusHistory.push(row);
      return row;
    },
    findMany: async ({ where }: any) =>
      this.statusHistory.filter(
        (h: any) => !where?.animalId || h.animalId === where.animalId,
      ),
  };

  statusHistory: Array<Record<string, unknown>> = [];
  milkWithholds: Array<Record<string, unknown>> = [];

  milkWithhold = {
    findFirst: async ({ where }: any) =>
      this.milkWithholds.find(
        (h: any) =>
          (!where?.farmId || h.farmId === where.farmId) &&
          (!where?.animalId || h.animalId === where.animalId) &&
          (!where?.clearedAt || h.clearedAt === where.clearedAt) &&
          (!where?.endDate?.gte || h.endDate >= where.endDate.gte),
      ) ?? null,
    findMany: async ({ where }: any) =>
      this.milkWithholds.filter(
        (h: any) => !where?.farmId || h.farmId === where.farmId,
      ),
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), clearedAt: null, ...data };
      this.milkWithholds.push(row);
      return row;
    },
  };

  sequences = new Map<string, { id: string; farmId: string; species: string; nextNumber: number; reservedThrough: number }>();
  tagBlocks: Array<{
    id: string;
    farmId: string;
    species: string;
    deviceId: string;
    rangeStart: number;
    rangeEnd: number;
    nextValue: number;
    issuedAt: Date;
    exhaustedAt: Date | null;
  }> = [];
  tasks: Array<Record<string, unknown>> = [];

  herdNumberSequence = {
    upsert: async ({ where, update, create }: any) => {
      const key = `${where.farmId_species.farmId}:${where.farmId_species.species}`;
      const existing = this.sequences.get(key);
      if (!existing) {
        const row = { id: randomUUID(), ...create };
        this.sequences.set(key, row);
        return row;
      }
      if (update.nextNumber?.increment) existing.nextNumber += update.nextNumber.increment;
      if (update.reservedThrough?.increment) existing.reservedThrough += update.reservedThrough.increment;
      return existing;
    },
  };

  tagSequenceBlock = {
    findFirst: async ({ where }: any) => {
      const rows = this.tagBlocks.filter((b) => {
        if (where.farmId && b.farmId !== where.farmId) return false;
        if (where.species && b.species !== where.species) return false;
        if (where.deviceId && b.deviceId !== where.deviceId) return false;
        if (where.exhaustedAt === null && b.exhaustedAt != null) return false;
        if (where.rangeStart?.lte != null && b.rangeStart > where.rangeStart.lte) return false;
        if (where.rangeEnd?.gte != null && b.rangeEnd < where.rangeEnd.gte) return false;
        return true;
      });
      return rows.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0] ?? null;
    },
    findMany: async ({ where }: any) =>
      this.tagBlocks.filter(
        (b) =>
          (!where?.farmId || b.farmId === where.farmId) &&
          (!where?.deviceId || b.deviceId === where.deviceId),
      ),
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), issuedAt: new Date(), exhaustedAt: null, ...data };
      this.tagBlocks.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.tagBlocks.find((b) => b.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
  };

  task = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), status: 'PENDING', ...data };
      this.tasks.push(row);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      const matches = this.tasks.filter((task: any) => {
        if (where.farmId && task.farmId !== where.farmId) return false;
        if (where.animalId && task.animalId !== where.animalId) return false;
        if (where.type?.in && !where.type.in.includes(task.type)) return false;
        if (where.status?.in && !where.status.in.includes(task.status)) return false;
        return true;
      });
      for (const task of matches) Object.assign(task, data);
      return { count: matches.length };
    },
  };
}
