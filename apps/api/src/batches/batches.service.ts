import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BatchFeedCreate,
  BatchHarvestCreate,
  BatchIllnessCreate,
  BatchMortalityCreate,
  BatchSamplingCreate,
  BatchWaterQualityCreate,
  HerdBatchCreate,
  HerdBatchListQuery,
  HerdBatchUpdate,
  PageResult,
} from '@farm/contracts';
import type {
  BatchFeedEvent,
  BatchHarvestEvent,
  BatchIllnessEvent,
  BatchMortalityEvent,
  BatchSamplingEvent,
  BatchWaterQualityLog,
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

export interface WaterQualityDto {
  id: string;
  batchId: string;
  recordedAt: string;
  temperatureC: number | null;
  ph: number | null;
  dissolvedO2: number | null;
  notes: string | null;
  createdAt: string;
}

export interface SamplingDto {
  id: string;
  batchId: string;
  sampledAt: string;
  sampleCount: number;
  totalWeightGrams: number;
  estimatedCount: number;
  avgWeightGrams: number;
  notes: string | null;
  createdAt: string;
}

export interface HarvestDto {
  id: string;
  batchId: string;
  quantityKg: number;
  fishCount: number | null;
  quality: string | null;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
}

export interface FeedDto {
  id: string;
  batchId: string;
  quantityKg: number;
  feedType: string | null;
  inventoryItemId: string | null;
  occurredAt: string;
  notes: string | null;
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

  async listWaterQuality(
    user: RequestUser,
    batchId: string,
  ): Promise<WaterQualityDto[]> {
    await this.requireFishBatch(user.farmId, batchId);
    const rows = await this.prisma.batchWaterQualityLog.findMany({
      where: { batchId, farmId: user.farmId },
      orderBy: { recordedAt: 'desc' },
    });
    return rows.map(toWaterQualityDto);
  }

  async addWaterQuality(
    user: RequestUser,
    batchId: string,
    input: BatchWaterQualityCreate,
    requestId?: string,
  ): Promise<WaterQualityDto> {
    await this.requireFishBatch(user.farmId, batchId);
    const row = await this.prisma.batchWaterQualityLog.create({
      data: {
        farmId: user.farmId,
        batchId,
        recordedAt: input.recordedAt,
        temperatureC: input.temperatureC,
        ph: input.ph,
        dissolvedO2: input.dissolvedO2,
        notes: input.notes,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.water-quality',
      entityType: 'herdBatch',
      entityId: batchId,
      requestId,
    });

    return toWaterQualityDto(row);
  }

  async listSampling(user: RequestUser, batchId: string): Promise<SamplingDto[]> {
    await this.requireFishBatch(user.farmId, batchId);
    const rows = await this.prisma.batchSamplingEvent.findMany({
      where: { batchId, farmId: user.farmId },
      orderBy: { sampledAt: 'desc' },
    });
    return rows.map(toSamplingDto);
  }

  async addSampling(
    user: RequestUser,
    batchId: string,
    input: BatchSamplingCreate,
    requestId?: string,
  ): Promise<SamplingDto> {
    const batch = await this.requireFishBatch(user.farmId, batchId);
    const avgWeightGrams = input.totalWeightGrams / input.sampleCount;
    const estimatedCount = input.estimatedCount ?? batch.currentCount;

    const row = await this.prisma.$transaction(async (tx) => {
      if (input.estimatedCount !== undefined) {
        await tx.herdBatch.update({
          where: { id: batchId },
          data: { currentCount: input.estimatedCount },
        });
      }
      return tx.batchSamplingEvent.create({
        data: {
          farmId: user.farmId,
          batchId,
          sampledAt: input.sampledAt,
          sampleCount: input.sampleCount,
          totalWeightGrams: input.totalWeightGrams,
          estimatedCount,
          avgWeightGrams,
          notes: input.notes,
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.sampling',
      entityType: 'herdBatch',
      entityId: batchId,
      metadata: { avgWeightGrams, estimatedCount },
      requestId,
    });

    return toSamplingDto(row);
  }

  async listHarvest(user: RequestUser, batchId: string): Promise<HarvestDto[]> {
    await this.requireFishBatch(user.farmId, batchId);
    const rows = await this.prisma.batchHarvestEvent.findMany({
      where: { batchId, farmId: user.farmId },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map(toHarvestDto);
  }

  async addHarvest(
    user: RequestUser,
    batchId: string,
    input: BatchHarvestCreate,
    requestId?: string,
  ): Promise<HarvestDto> {
    const batch = await this.requireFishBatch(user.farmId, batchId);
    const reduce =
      input.reduceHeadcount === true && input.fishCount !== undefined;

    if (reduce && input.fishCount! > batch.currentCount) {
      throw new BadRequestException({
        code: 'HARVEST_EXCEEDS_COUNT',
        message: 'Harvest fish count cannot exceed current headcount',
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (reduce) {
        await tx.herdBatch.update({
          where: { id: batchId },
          data: { currentCount: batch.currentCount - input.fishCount! },
        });
      }
      return tx.batchHarvestEvent.create({
        data: {
          farmId: user.farmId,
          batchId,
          quantityKg: input.quantityKg,
          fishCount: input.fishCount,
          quality: input.quality,
          occurredAt: input.occurredAt,
          notes: input.notes,
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.harvest',
      entityType: 'herdBatch',
      entityId: batchId,
      metadata: {
        quantityKg: input.quantityKg,
        fishCount: input.fishCount,
        reduceHeadcount: reduce,
      },
      requestId,
    });

    return toHarvestDto(row);
  }

  async listFeed(user: RequestUser, batchId: string): Promise<FeedDto[]> {
    await this.requireBatch(user.farmId, batchId);
    const rows = await this.prisma.batchFeedEvent.findMany({
      where: { batchId, farmId: user.farmId },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map(toFeedDto);
  }

  async addFeed(
    user: RequestUser,
    batchId: string,
    input: BatchFeedCreate,
    requestId?: string,
  ): Promise<FeedDto> {
    await this.requireBatch(user.farmId, batchId);

    const row = await this.prisma.$transaction(async (tx) => {
      if (input.inventoryItemId) {
        const item = await tx.inventoryItem.findFirst({
          where: {
            id: input.inventoryItemId,
            farmId: user.farmId,
            deletedAt: null,
          },
        });
        if (!item) {
          throw new NotFoundException({
            code: 'INVENTORY_NOT_FOUND',
            message: 'Inventory item not found',
          });
        }
        const stock = Number(item.currentStock);
        if (input.quantityKg > stock) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_STOCK',
            message: 'Feed quantity exceeds current inventory stock',
          });
        }
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: stock - input.quantityKg },
        });
        await tx.stockMovement.create({
          data: {
            farmId: user.farmId,
            itemId: item.id,
            type: 'OUT',
            quantity: input.quantityKg,
            reason: `Feed for batch ${batchId}`,
            userId: user.id,
          },
        });
      }

      return tx.batchFeedEvent.create({
        data: {
          farmId: user.farmId,
          batchId,
          quantityKg: input.quantityKg,
          feedType: input.feedType,
          inventoryItemId: input.inventoryItemId,
          occurredAt: input.occurredAt,
          notes: input.notes,
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'batches.feed',
      entityType: 'herdBatch',
      entityId: batchId,
      metadata: {
        quantityKg: input.quantityKg,
        inventoryItemId: input.inventoryItemId,
      },
      requestId,
    });

    return toFeedDto(row);
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

  private async requireFishBatch(
    farmId: string,
    id: string,
  ): Promise<HerdBatch> {
    const batch = await this.requireBatch(farmId, id);
    if (batch.kind !== 'FISH') {
      throw new BadRequestException({
        code: 'BATCH_KIND_REQUIRED',
        message: 'This operation is only available for FISH batches',
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

function toWaterQualityDto(row: BatchWaterQualityLog): WaterQualityDto {
  return {
    id: row.id,
    batchId: row.batchId,
    recordedAt: row.recordedAt.toISOString(),
    temperatureC: row.temperatureC !== null ? Number(row.temperatureC) : null,
    ph: row.ph !== null ? Number(row.ph) : null,
    dissolvedO2: row.dissolvedO2 !== null ? Number(row.dissolvedO2) : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSamplingDto(row: BatchSamplingEvent): SamplingDto {
  return {
    id: row.id,
    batchId: row.batchId,
    sampledAt: row.sampledAt.toISOString(),
    sampleCount: row.sampleCount,
    totalWeightGrams: Number(row.totalWeightGrams),
    estimatedCount: row.estimatedCount,
    avgWeightGrams: Number(row.avgWeightGrams),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toHarvestDto(row: BatchHarvestEvent): HarvestDto {
  return {
    id: row.id,
    batchId: row.batchId,
    quantityKg: Number(row.quantityKg),
    fishCount: row.fishCount,
    quality: row.quality,
    occurredAt: row.occurredAt.toISOString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toFeedDto(row: BatchFeedEvent): FeedDto {
  return {
    id: row.id,
    batchId: row.batchId,
    quantityKg: Number(row.quantityKg),
    feedType: row.feedType,
    inventoryItemId: row.inventoryItemId,
    occurredAt: row.occurredAt.toISOString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}
