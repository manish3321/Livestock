import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import { AnimalsService } from '../src/animals/animals.service';
import type { RequestUser } from '../src/common/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FakePrisma, fakeAudit } from './fakes';

const FARM_ID = randomUUID();

function user(role: 'ADMIN' | 'MANAGER' | 'WORKER' = 'WORKER'): RequestUser {
  return {
    id: randomUUID(),
    email: `${role.toLowerCase()}@farm.local`,
    farmId: FARM_ID,
    role,
    sessionId: randomUUID(),
    permissions: ROLE_PERMISSIONS[role],
  };
}

class AnimalsFakePrisma extends FakePrisma {
  weights = new Map<string, Array<Record<string, unknown>>>();

  constructor() {
    super();
    const base = this.animal;

    this.animal = {
      findUnique: base.findUnique,
      create: base.create,
      update: base.update,
      findFirst: async ({ where, include }: any) => {
        const a = [...this.animals.values()].find(
          (x) =>
            x.id === where.id &&
            x.farmId === where.farmId &&
            (where.deletedAt === null ? !x.deletedAt : true),
        );
        if (!a) return null;
        return {
          ...a,
          weights: include?.weights
            ? [...(this.weights.get(a.id) ?? [])].sort(
                (x: any, y: any) =>
                  new Date(y.recordedAt).getTime() - new Date(x.recordedAt).getTime(),
              )
            : undefined,
        };
      },
      findMany: async ({ where, orderBy, skip, take, include }: any) => {
        let rows = [...this.animals.values()].filter((a) => {
          if (a.farmId !== where.farmId) return false;
          if (where.deletedAt === null && a.deletedAt) return false;
          if (where.species && a.species !== where.species) return false;
          if (where.status && a.status !== where.status) return false;
          if (where.gender && a.gender !== where.gender) return false;
          if (where.OR) {
            const q = String(where.OR[0].tag.contains).toLowerCase();
            const hay = `${a.tag} ${a.name ?? ''} ${a.breed}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        const sortKey = Object.keys(orderBy ?? { tag: 'asc' })[0] ?? 'tag';
        const dir = orderBy?.[sortKey] === 'desc' ? -1 : 1;
        rows = rows.sort((a: any, b: any) =>
          a[sortKey] < b[sortKey] ? -1 * dir : a[sortKey] > b[sortKey] ? 1 * dir : 0,
        );
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length)).map((a) => ({
          ...a,
          weights: include?.weights
            ? (this.weights.get(a.id) ?? []).slice(0, include.weights.take ?? 99)
            : undefined,
        }));
      },
      count: async ({ where }: any) =>
        [...this.animals.values()].filter((a) => {
          if (a.farmId !== where.farmId) return false;
          if (where.deletedAt === null && a.deletedAt) return false;
          if (where.species && a.species !== where.species) return false;
          if (where.status && a.status !== where.status) return false;
          if (where.OR) {
            const q = String(where.OR[0].tag.contains).toLowerCase();
            const hay = `${a.tag} ${a.name ?? ''} ${a.breed}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        }).length,
    } as any;

    this.weightRecord = {
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          farmId: data.farmId,
          animalId: data.animalId,
          weightKg: data.weightKg,
          recordedAt: data.recordedAt,
          notes: data.notes ?? null,
          createdAt: new Date(),
        };
        const list = this.weights.get(data.animalId) ?? [];
        list.unshift(row);
        this.weights.set(data.animalId, list);
        return row;
      },
    };
  }
}

describe('AnimalsService', () => {
  let prisma: AnimalsFakePrisma;
  let service: AnimalsService;

  beforeEach(() => {
    prisma = new AnimalsFakePrisma();
    service = new AnimalsService(prisma as unknown as PrismaService, fakeAudit);
  });

  it('creates an animal with optional initial weight', async () => {
    const created = await service.create(user(), {
      tag: 'BUF100',
      name: 'Kalimati',
      species: 'BUFFALO',
      breed: 'Murrah',
      gender: 'FEMALE',
      status: 'ACTIVE',
      initialWeightKg: 480,
    });
    expect(created.tag).toBe('BUF100');
    expect(created.currentWeightKg).toBe(480);
    expect(created.weights).toHaveLength(1);
    expect(prisma.changeLog).toHaveLength(1);
  });

  it('rejects duplicate tags', async () => {
    await service.create(user(), {
      tag: 'COW100',
      species: 'COW',
      breed: 'Jersey',
      gender: 'FEMALE',
      status: 'ACTIVE',
    });
    await expect(
      service.create(user(), {
        tag: 'COW100',
        species: 'COW',
        breed: 'Holstein',
        gender: 'FEMALE',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('lists with species filter and search', async () => {
    await service.create(user(), {
      tag: 'BUF101',
      name: 'Gauri',
      species: 'BUFFALO',
      breed: 'Murrah',
      gender: 'FEMALE',
      status: 'ACTIVE',
    });
    await service.create(user(), {
      tag: 'COW101',
      name: 'Twilight',
      species: 'COW',
      breed: 'Jersey',
      gender: 'FEMALE',
      status: 'SICK',
    });

    const buffalo = await service.list(user(), {
      page: 1,
      pageSize: 25,
      sort: 'tag',
      order: 'asc',
      species: 'BUFFALO',
    });
    expect(buffalo.total).toBe(1);
    expect(buffalo.items[0]?.tag).toBe('BUF101');

    const search = await service.list(user(), {
      page: 1,
      pageSize: 25,
      sort: 'tag',
      order: 'asc',
      q: 'twilight',
    });
    expect(search.total).toBe(1);
    expect(search.items[0]?.status).toBe('SICK');
  });

  it('soft-deletes and hides the animal from list', async () => {
    const created = await service.create(user('MANAGER'), {
      tag: 'PIG100',
      species: 'PIG',
      breed: 'Hampshire',
      gender: 'MALE',
      status: 'ACTIVE',
    });
    await service.remove(user('MANAGER'), created.id);
    await expect(service.get(user(), created.id)).rejects.toThrow(NotFoundException);
    const list = await service.list(user(), {
      page: 1,
      pageSize: 25,
      sort: 'tag',
      order: 'asc',
    });
    expect(list.total).toBe(0);
  });

  it('exports CSV with header and rows', async () => {
    await service.create(user(), {
      tag: 'GOT100',
      name: 'Maya',
      species: 'GOAT',
      breed: 'Boer',
      gender: 'FEMALE',
      status: 'ACTIVE',
      notes: 'Needs deworming, soon',
    });
    const csv = await service.exportCsv(user());
    expect(csv.split('\n')[0]).toContain('tag,name,species');
    expect(csv).toContain('GOT100');
    expect(csv).toContain('"Needs deworming, soon"');
  });
});
