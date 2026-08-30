import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GESTATION_DAYS,
  type BreedingCreate,
  type BreedingListQuery,
  type BreedingUpdate,
  type PageResult,
  type Species,
} from '@farm/contracts';
import type { Animal, BreedingRecord } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

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
  notes: string | null;
  daysRemaining: number | null;
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
    return {
      items: rows.map(toDto),
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

    const gestationDays = GESTATION_DAYS[mother.species as Species];
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

function toDto(r: BreedingWithMother): BreedingRecordDto {
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
    notes: r.notes,
    daysRemaining: daysRemaining(r.dueDate, r.pregnancyStatus),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
