import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingUpdate,
  PageResult,
  Species,
} from '@farm/contracts';
import type { Animal, BreedingRecord } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';

export interface BreedingRecordDto {
  id: string;
  farmId: string;
  motherId: string;
  motherTag: string | null;
  matingType: string;
  fatherTagOrAi: string | null;
  matingDate: string;
  dueDate: string;
  pregnancyStatus: string;
  birthDate: string | null;
  offspringTag: string | null;
  offspringAnimalId: string | null;
  calvingDifficulty: string | null;
  colostrumFed: boolean | null;
  colostrumWithin4h: boolean | null;
  colostrumLiters: number | null;
  notes: string | null;
  daysRemaining: number | null;
  daysOpen: number | null;
  calvingIntervalDays: number | null;
  repeatBreeder: boolean;
  createdAt: string;
  updatedAt: string;
}

type BreedingWithMother = BreedingRecord & {
  mother?: Pick<Animal, 'tag'> | null;
};

@Injectable()
export class BreedingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly speciesConfig: SpeciesConfigService,
  ) {}

  async list(
    user: RequestUser,
    query: BreedingListQuery,
  ): Promise<PageResult<BreedingRecordDto>> {
    const where = {
      farmId: user.farmId,
      ...(query.motherId ? { motherId: query.motherId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.breedingRecord.findMany({
        where,
        include: { mother: { select: { tag: true } } },
        orderBy: { dueDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.breedingRecord.count({ where }),
    ]);
    const motherIds = [...new Set(rows.map((r) => r.motherId))];
    const history = motherIds.length
      ? await this.prisma.breedingRecord.findMany({
          where: { farmId: user.farmId, motherId: { in: motherIds } },
          select: {
            id: true,
            motherId: true,
            pregnancyStatus: true,
            matingDate: true,
            birthDate: true,
          },
          orderBy: { matingDate: 'asc' },
        })
      : [];
    const byMother = new Map<string, typeof history>();
    for (const h of history) {
      const list = byMother.get(h.motherId) ?? [];
      list.push(h);
      byMother.set(h.motherId, list);
    }

    return {
      items: rows.map((r) => toDto(r, byMother.get(r.motherId) ?? [])),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(
    user: RequestUser,
    input: BreedingCreate,
    requestId?: string,
  ): Promise<BreedingRecordDto> {
    const mother = await this.prisma.animal.findFirst({
      where: { id: input.motherId, farmId: user.farmId, deletedAt: null },
    });
    if (!mother) {
      throw new NotFoundException({
        code: 'ANIMAL_NOT_FOUND',
        message: 'Mother animal not found',
      });
    }

    const { gestationDays } = await this.speciesConfig.forSpecies(mother.species as Species);
    const dueDate = new Date(input.matingDate);
    dueDate.setDate(dueDate.getDate() + gestationDays);

    const row = await this.prisma.breedingRecord.create({
      data: {
        farmId: user.farmId,
        motherId: input.motherId,
        matingType: input.matingType,
        fatherTagOrAi: input.fatherTagOrAi,
        matingDate: input.matingDate,
        dueDate,
        pregnancyStatus: input.pregnancyStatus,
        notes: input.notes,
      },
      include: { mother: { select: { tag: true } } },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.create',
      entityType: 'breedingRecord',
      entityId: row.id,
      metadata: { species: mother.species, dueDate: dueDate.toISOString() },
      requestId,
    });

    return toDto(row);
  }

  async listHeat(user: RequestUser, query: import('@farm/contracts').HeatListQuery) {
    const where = {
      farmId: user.farmId,
      ...(query.animalId ? { animalId: query.animalId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.heatLog.findMany({
        where,
        include: { animal: { select: { tag: true } } },
        orderBy: { observedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.heatLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        animalId: r.animalId,
        animalTag: r.animal?.tag ?? null,
        observedAt: r.observedAt.toISOString(),
        intensity: r.intensity,
        observerName: r.observerName,
        signs: r.signs,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async logHeat(
    user: RequestUser,
    input: import('@farm/contracts').HeatCreate,
    requestId?: string,
  ) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, farmId: user.farmId, deletedAt: null },
    });
    if (!animal) {
      throw new NotFoundException({
        code: 'ANIMAL_NOT_FOUND',
        message: 'Animal not found',
      });
    }
    const row = await this.prisma.heatLog.create({
      data: {
        farmId: user.farmId,
        animalId: input.animalId,
        observedAt: input.observedAt,
        intensity: input.intensity,
        observerName: input.observerName,
        signs: input.signs,
        notes: input.notes,
      },
      include: { animal: { select: { tag: true } } },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.heat',
      entityType: 'heatLog',
      entityId: row.id,
      requestId,
    });
    return {
      id: row.id,
      animalId: row.animalId,
      animalTag: row.animal?.tag ?? null,
      observedAt: row.observedAt.toISOString(),
      intensity: row.intensity,
      observerName: row.observerName,
      signs: row.signs,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async update(
    user: RequestUser,
    id: string,
    input: BreedingUpdate,
    requestId?: string,
  ): Promise<BreedingRecordDto> {
    const existing = await this.prisma.breedingRecord.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'BREEDING_NOT_FOUND',
        message: 'Breeding record not found',
      });
    }

    const row = await this.prisma.breedingRecord.update({
      where: { id },
      data: {
        ...(input.pregnancyStatus !== undefined
          ? { pregnancyStatus: input.pregnancyStatus }
          : {}),
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
        ...(input.offspringTag !== undefined ? { offspringTag: input.offspringTag } : {}),
        ...(input.offspringAnimalId !== undefined
          ? { offspringAnimalId: input.offspringAnimalId }
          : {}),
        ...(input.calvingDifficulty !== undefined
          ? { calvingDifficulty: input.calvingDifficulty }
          : {}),
        ...(input.colostrumFed !== undefined ? { colostrumFed: input.colostrumFed } : {}),
        ...(input.colostrumWithin4h !== undefined
          ? { colostrumWithin4h: input.colostrumWithin4h }
          : {}),
        ...(input.colostrumLiters !== undefined
          ? { colostrumLiters: input.colostrumLiters }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.fatherTagOrAi !== undefined
          ? { fatherTagOrAi: input.fatherTagOrAi }
          : {}),
      },
      include: { mother: { select: { tag: true } } },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'breeding.update',
      entityType: 'breedingRecord',
      entityId: row.id,
      requestId,
    });

    return toDto(row);
  }
}

function daysRemaining(dueDate: Date, pregnancyStatus: string): number | null {
  if (pregnancyStatus === 'DELIVERED' || pregnancyStatus === 'FAILED') return null;
  return Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

type MotherHistory = {
  id: string;
  motherId: string;
  pregnancyStatus: string;
  matingDate: Date;
  birthDate: Date | null;
};

function toDto(r: BreedingWithMother, history: MotherHistory[] = []): BreedingRecordDto {
  const births = history
    .filter((h) => h.pregnancyStatus === 'DELIVERED' && h.birthDate)
    .sort((a, b) => (a.birthDate!.getTime() - b.birthDate!.getTime()));
  const failed = history.filter((h) => h.pregnancyStatus === 'FAILED').length;
  const lastBirthBeforeMating = births
    .filter((h) => h.birthDate! <= r.matingDate)
    .at(-1);
  const prevBirth = r.birthDate
    ? births.filter((h) => h.birthDate! < r.birthDate!).at(-1)
    : undefined;
  const daysOpen =
    r.pregnancyStatus === 'DELIVERED' || r.pregnancyStatus === 'FAILED'
      ? null
      : lastBirthBeforeMating?.birthDate
        ? Math.ceil(
            (r.matingDate.getTime() - lastBirthBeforeMating.birthDate.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;
  const calvingIntervalDays =
    r.birthDate && prevBirth?.birthDate
      ? Math.ceil(
          (r.birthDate.getTime() - prevBirth.birthDate.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

  return {
    id: r.id,
    farmId: r.farmId,
    motherId: r.motherId,
    motherTag: r.mother?.tag ?? null,
    matingType: r.matingType,
    fatherTagOrAi: r.fatherTagOrAi,
    matingDate: r.matingDate.toISOString(),
    dueDate: r.dueDate.toISOString(),
    pregnancyStatus: r.pregnancyStatus,
    birthDate: r.birthDate?.toISOString() ?? null,
    offspringTag: r.offspringTag,
    offspringAnimalId: r.offspringAnimalId,
    calvingDifficulty: r.calvingDifficulty,
    colostrumFed: r.colostrumFed,
    colostrumWithin4h: r.colostrumWithin4h,
    colostrumLiters: r.colostrumLiters != null ? Number(r.colostrumLiters) : null,
    notes: r.notes,
    daysRemaining: daysRemaining(r.dueDate, r.pregnancyStatus),
    daysOpen,
    calvingIntervalDays,
    repeatBreeder: failed >= 3,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
