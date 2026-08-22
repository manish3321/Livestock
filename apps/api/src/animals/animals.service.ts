import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AnimalCreate,
  AnimalDetailDto,
  AnimalDto,
  AnimalEconomicsDto,
  AnimalListQuery,
  AnimalUpdate,
  PageResult,
  WeightCreate,
  WeightRecordDto,
} from '@farm/contracts';
import { Prisma, type Animal, type WeightRecord } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { toSnapshot } from '../sync/animal.applier';

@Injectable()
export class AnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: RequestUser,
    query: AnimalListQuery,
  ): Promise<PageResult<AnimalDto>> {
    const where = {
      farmId: user.farmId,
      deletedAt: null,
      ...(query.species ? { species: query.species } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.q
        ? {
            OR: [
              { tag: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { breed: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.animal.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          weights: { orderBy: { recordedAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.animal.count({ where }),
    ]);

    return {
      items: rows.map((a) => toDto(a, a.weights[0] ?? null)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: RequestUser, id: string): Promise<AnimalDetailDto> {
    const animal = await this.prisma.animal.findFirst({
      where: { id, farmId: user.farmId, deletedAt: null },
      include: { weights: { orderBy: { recordedAt: 'desc' } } },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    return {
      ...toDto(animal, animal.weights[0] ?? null),
      weights: animal.weights.map(toWeightDto),
    };
  }

  async create(
    user: RequestUser,
    input: AnimalCreate,
    requestId?: string,
  ): Promise<AnimalDetailDto> {
    const tagTaken = await this.prisma.animal.findUnique({
      where: { farmId_tag: { farmId: user.farmId, tag: input.tag } },
    });
    if (tagTaken && !tagTaken.deletedAt) {
      throw new ConflictException({
        code: 'TAG_TAKEN',
        message: `Tag ${input.tag} is already in use`,
      });
    }

    const { initialWeightKg, ...data } = input;
    const animal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.animal.create({
        data: {
          farmId: user.farmId,
          tag: data.tag,
          name: data.name,
          species: data.species,
          breed: data.breed,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          color: data.color,
          source: data.source,
          motherTag: data.motherTag,
          purchaseDate: data.purchaseDate,
          purchaseCost: data.purchaseCost,
          status: data.status,
          breedingStock: data.breedingStock ?? true,
          notes: data.notes,
          version: 1,
        },
      });

      if (initialWeightKg !== undefined) {
        await tx.weightRecord.create({
          data: {
            farmId: user.farmId,
            animalId: created.id,
            weightKg: initialWeightKg,
            recordedAt: new Date(),
          },
        });
      }

      await tx.changeLogEntry.create({
        data: {
          farmId: user.farmId,
          entityType: 'animal',
          entityId: created.id,
          version: 1,
          data: toSnapshot(created) as never,
        },
      });

      return created;
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.create',
      entityType: 'animal',
      entityId: animal.id,
      metadata: { tag: animal.tag },
      requestId,
    });

    return this.get(user, animal.id);
  }

  async update(
    user: RequestUser,
    id: string,
    input: AnimalUpdate,
    requestId?: string,
  ): Promise<AnimalDetailDto> {
    const current = await this.requireAnimal(user.farmId, id);

    if (input.tag && input.tag !== current.tag) {
      const tagTaken = await this.prisma.animal.findUnique({
        where: { farmId_tag: { farmId: user.farmId, tag: input.tag } },
      });
      if (tagTaken && tagTaken.id !== id && !tagTaken.deletedAt) {
        throw new ConflictException({
          code: 'TAG_TAKEN',
          message: `Tag ${input.tag} is already in use`,
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.animal.update({
        where: { id },
        data: { ...input, version: current.version + 1 },
      });
      await tx.changeLogEntry.create({
        data: {
          farmId: user.farmId,
          entityType: 'animal',
          entityId: row.id,
          version: row.version,
          data: toSnapshot(row) as never,
        },
      });
      return row;
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.update',
      entityType: 'animal',
      entityId: updated.id,
      requestId,
    });

    return this.get(user, updated.id);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    const current = await this.requireAnimal(user.farmId, id);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.animal.update({
        where: { id },
        data: { deletedAt: new Date(), version: current.version + 1 },
      });
      await tx.changeLogEntry.create({
        data: {
          farmId: user.farmId,
          entityType: 'animal',
          entityId: deleted.id,
          version: deleted.version,
          deletedAt: deleted.deletedAt,
          data: Prisma.DbNull,
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.delete',
      entityType: 'animal',
      entityId: id,
      requestId,
    });
  }

  async addWeight(
    user: RequestUser,
    animalId: string,
    input: WeightCreate,
    requestId?: string,
  ): Promise<WeightRecordDto> {
    await this.requireAnimal(user.farmId, animalId);
    const record = await this.prisma.weightRecord.create({
      data: {
        farmId: user.farmId,
        animalId,
        weightKg: input.weightKg,
        recordedAt: input.recordedAt,
        notes: input.notes,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'animals.weight.add',
      entityType: 'animal',
      entityId: animalId,
      metadata: { weightKg: input.weightKg },
      requestId,
    });

    return toWeightDto(record);
  }

  async economics(user: RequestUser, id: string): Promise<AnimalEconomicsDto> {
    const animal = await this.requireAnimal(user.farmId, id);

    const [expenseAgg, revenueAgg, healthAgg] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { farmId: user.farmId, animalId: id },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.revenue.aggregate({
        where: { farmId: user.farmId, animalId: id },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.healthRecord.aggregate({
        where: { farmId: user.farmId, animalId: id },
        _sum: { cost: true },
        _count: true,
      }),
    ]);

    const purchaseCost = animal.purchaseCost ? Number(animal.purchaseCost) : 0;
    const expenseTotal = expenseAgg._sum.amount ? Number(expenseAgg._sum.amount) : 0;
    const healthCostTotal = healthAgg._sum.cost ? Number(healthAgg._sum.cost) : 0;
    const revenueTotal = revenueAgg._sum.amount ? Number(revenueAgg._sum.amount) : 0;
    const investedTotal = purchaseCost + expenseTotal + healthCostTotal;
    const earnedTotal = revenueTotal;

    return {
      animalId: animal.id,
      tag: animal.tag,
      name: animal.name,
      species: animal.species,
      breedingStock: animal.breedingStock,
      purchaseCost,
      expenseTotal,
      healthCostTotal,
      investedTotal,
      revenueTotal,
      earnedTotal,
      net: earnedTotal - investedTotal,
      expenseCount: expenseAgg._count,
      revenueCount: revenueAgg._count,
      healthCount: healthAgg._count,
    };
  }

  async exportCsv(user: RequestUser): Promise<string> {
    const animals = await this.prisma.animal.findMany({
      where: { farmId: user.farmId, deletedAt: null },
      orderBy: { tag: 'asc' },
      include: { weights: { orderBy: { recordedAt: 'desc' }, take: 1 } },
    });

    const header = [
      'tag',
      'name',
      'species',
      'breed',
      'gender',
      'status',
      'color',
      'source',
      'motherTag',
      'dateOfBirth',
      'purchaseDate',
      'purchaseCost',
      'breedingStock',
      'currentWeightKg',
      'notes',
    ].join(',');

    const lines = animals.map((a) =>
      [
        a.tag,
        csv(a.name),
        a.species,
        csv(a.breed),
        a.gender,
        a.status,
        csv(a.color),
        a.source ?? '',
        csv(a.motherTag),
        a.dateOfBirth?.toISOString().slice(0, 10) ?? '',
        a.purchaseDate?.toISOString().slice(0, 10) ?? '',
        a.purchaseCost ? Number(a.purchaseCost) : '',
        a.breedingStock ? 'yes' : 'no',
        a.weights[0] ? Number(a.weights[0].weightKg) : '',
        csv(a.notes),
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }

  private async requireAnimal(farmId: string, id: string): Promise<Animal> {
    const animal = await this.prisma.animal.findFirst({
      where: { id, farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({ code: 'ANIMAL_NOT_FOUND', message: 'Animal not found' });
    }
    return animal;
  }
}

function toDto(
  animal: Animal,
  latestWeight: WeightRecord | null,
): AnimalDto {
  return {
    id: animal.id,
    farmId: animal.farmId,
    tag: animal.tag,
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    dateOfBirth: animal.dateOfBirth?.toISOString() ?? null,
    gender: animal.gender,
    color: animal.color,
    source: animal.source,
    motherTag: animal.motherTag,
    purchaseDate: animal.purchaseDate?.toISOString() ?? null,
    purchaseCost: animal.purchaseCost ? Number(animal.purchaseCost) : null,
    status: animal.status,
    breedingStock: animal.breedingStock,
    notes: animal.notes,
    currentWeightKg: latestWeight ? Number(latestWeight.weightKg) : null,
    version: animal.version,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString(),
    deletedAt: animal.deletedAt?.toISOString() ?? null,
  };
}

function toWeightDto(w: WeightRecord): WeightRecordDto {
  return {
    id: w.id,
    animalId: w.animalId,
    weightKg: Number(w.weightKg),
    recordedAt: w.recordedAt.toISOString(),
    notes: w.notes,
    createdAt: w.createdAt.toISOString(),
  };
}

function csv(value: string | null | undefined): string {
  if (!value) return '';
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
