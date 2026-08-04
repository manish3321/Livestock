import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BatchIllnessCreate,
  BatchMortalityCreate,
  HerdBatchCreate,
  HerdBatchListQuery,
  HerdBatchUpdate,
  PageResult,
} from '@farm/contracts';
import type {
  BatchIllnessEvent,
  BatchMortalityEvent,
  HerdBatch,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface HerdBatchDto {
  id: string;
  farmId: string;
  kind: string;
  category: string;
  name: string;
  ageFromMonths: number | null;
  ageToMonths: number | null;
  initialCount: number;
  currentCount: number;
  deadCount: number;
  sickCount: number;
  sickByCondition: Record<string, number>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IllnessDto {
  id: string;
  batchId: string;
  condition: string;
  count: number;
  occurredAt: string;
  resolvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MortalityDto {
  id: string;
  batchId: string;
  count: number;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
}

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: RequestUser,
    query: HerdBatchListQuery,
  ): Promise<PageResult<HerdBatchDto>> {
    const where = {
      farmId: user.farmId,
      deletedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { category: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.herdBatch.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          illness: { where: { resolvedAt: null } },
        },
      }),
      this.prisma.herdBatch.count({ where }),
    ]);

    return {
      items: rows.map((r) => toDto(r, r.illness)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: RequestUser, id: string): Promise<HerdBatchDto> {
    const batch = await this.requireBatch(user.farmId, id);
    const illness = await this.prisma.batchIllnessEvent.findMany({
      where: { batchId: id, resolvedAt: null },
    });
    return toDto(batch, illness);
  }

  async create(
    user: RequestUser,
    input: HerdBatchCreate,
    requestId?: string,
  ): Promise<HerdBatchDto> {
    const batch = await this.prisma.herdBatch.create({
      data: {
        farmId: user.farmId,
        kind: input.kind,
        category: input.category.toUpperCase(),
        name: input.name,
        ageFromMonths: input.ageFromMonths ?? null,
        ageToMonths: input.ageToMonths ?? null,
        initialCount: input.initialCount,
        currentCount: input.initialCount,
        deadCount: 0,
        notes: input.notes,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.create',
      entityType: 'herdBatch',
      entityId: batch.id,
      requestId,
    });

    return toDto(batch, []);
  }

  async update(
    user: RequestUser,
    id: string,
    input: HerdBatchUpdate,
    requestId?: string,
  ): Promise<HerdBatchDto> {
    await this.requireBatch(user.farmId, id);
    const batch = await this.prisma.herdBatch.update({
      where: { id },
      data: {
        ...(input.category !== undefined
          ? { category: input.category.toUpperCase() }
          : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.ageFromMonths !== undefined
          ? { ageFromMonths: input.ageFromMonths }
          : {}),
        ...(input.ageToMonths !== undefined
          ? { ageToMonths: input.ageToMonths }
          : {}),
        ...(input.currentCount !== undefined
          ? { currentCount: input.currentCount }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.update',
      entityType: 'herdBatch',
      entityId: batch.id,
      requestId,
    });

    const illness = await this.prisma.batchIllnessEvent.findMany({
      where: { batchId: id, resolvedAt: null },
    });
    return toDto(batch, illness);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    await this.requireBatch(user.farmId, id);
    await this.prisma.herdBatch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.delete',
      entityType: 'herdBatch',
      entityId: id,
      requestId,
    });
  }

  async listIllness(user: RequestUser, batchId: string): Promise<IllnessDto[]> {
    await this.requireBatch(user.farmId, batchId);
    const rows = await this.prisma.batchIllnessEvent.findMany({
      where: { batchId, farmId: user.farmId },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map(toIllnessDto);
  }

  async addIllness(
    user: RequestUser,
    batchId: string,
    input: BatchIllnessCreate,
    requestId?: string,
  ): Promise<IllnessDto> {
    const batch = await this.requireBatch(user.farmId, batchId);
    if (input.count > batch.currentCount) {
      throw new BadRequestException({
        code: 'ILLNESS_EXCEEDS_COUNT',
        message: 'Sick count cannot exceed current headcount',
      });
    }

    const row = await this.prisma.batchIllnessEvent.create({
      data: {
        farmId: user.farmId,
        batchId,
        condition: input.condition,
        count: input.count,
        occurredAt: input.occurredAt,
        notes: input.notes,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.illness',
      entityType: 'herdBatch',
      entityId: batchId,
      metadata: { condition: input.condition, count: input.count },
      requestId,
    });

    return toIllnessDto(row);
  }

  async listMortality(user: RequestUser, batchId: string): Promise<MortalityDto[]> {
    await this.requireBatch(user.farmId, batchId);
    const rows = await this.prisma.batchMortalityEvent.findMany({
      where: { batchId, farmId: user.farmId },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map(toMortalityDto);
  }

  async addMortality(
    user: RequestUser,
    batchId: string,
    input: BatchMortalityCreate,
    requestId?: string,
  ): Promise<MortalityDto> {
    const batch = await this.requireBatch(user.farmId, batchId);
    if (input.count > batch.currentCount) {
      throw new BadRequestException({
        code: 'MORTALITY_EXCEEDS_COUNT',
        message: 'Death count cannot exceed current headcount',
      });
    }

    const [row] = await this.prisma.$transaction([
      this.prisma.batchMortalityEvent.create({
        data: {
          farmId: user.farmId,
          batchId,
          count: input.count,
          reason: input.reason,
          occurredAt: input.occurredAt,
        },
      }),
      this.prisma.herdBatch.update({
        where: { id: batchId },
        data: {
          currentCount: batch.currentCount - input.count,
          deadCount: batch.deadCount + input.count,
        },
      }),
    ]);

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.mortality',
      entityType: 'herdBatch',
      entityId: batchId,
      metadata: { count: input.count, reason: input.reason },
      requestId,
    });

    return toMortalityDto(row);
  }

  private async requireBatch(farmId: string, id: string): Promise<HerdBatch> {
    const batch = await this.prisma.herdBatch.findFirst({
      where: { id, farmId, deletedAt: null },
    });
    if (!batch) {
      throw new NotFoundException({
        code: 'BATCH_NOT_FOUND',
        message: 'Herd batch not found',
      });
    }
    return batch;
  }
}

function toDto(
  batch: HerdBatch,
  illness: BatchIllnessEvent[],
): HerdBatchDto {
  const sickByCondition: Record<string, number> = {};
  let sickCount = 0;
  for (const e of illness) {
    sickByCondition[e.condition] = (sickByCondition[e.condition] ?? 0) + e.count;
    sickCount += e.count;
  }
  return {
    id: batch.id,
    farmId: batch.farmId,
    kind: batch.kind,
    category: batch.category,
    name: batch.name,
    ageFromMonths: batch.ageFromMonths,
    ageToMonths: batch.ageToMonths,
    initialCount: batch.initialCount,
    currentCount: batch.currentCount,
    deadCount: batch.deadCount,
    sickCount,
    sickByCondition,
    notes: batch.notes,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}

function toIllnessDto(row: BatchIllnessEvent): IllnessDto {
  return {
    id: row.id,
    batchId: row.batchId,
    condition: row.condition,
    count: row.count,
    occurredAt: row.occurredAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMortalityDto(row: BatchMortalityEvent): MortalityDto {
  return {
    id: row.id,
    batchId: row.batchId,
    count: row.count,
    reason: row.reason,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
