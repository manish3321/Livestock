import { randomUUID } from 'node:crypto';
import type { AuditService } from '../src/audit/audit.service';

/** No-op audit sink for unit tests. */
export const fakeAudit = {
  record: async () => undefined,
} as unknown as AuditService;

interface AnimalRow {
  id: string;
  farmId: string;
  tag: string;
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
  status: string;
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
      const a = this.animals.get(where.id);
      return a && a.farmId === where.farmId ? a : null;
    },
    create: async ({ data }: any) => {
      const row: AnimalRow = {
        id: data.id ?? randomUUID(),
        farmId: data.farmId,
        tag: data.tag,
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
        status: data.status ?? 'ACTIVE',
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
}
