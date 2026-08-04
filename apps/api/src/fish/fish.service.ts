import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  FishBatchCreate,
  FishBatchUpdate,
  FishSamplingCreate,
  PageQuery,
  PageResult,
  WaterQualityCreate,
} from '@farm/contracts';
import type { FishBatch, FishSampling, WaterQualityLog } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface FishBatchDto {
  id: string;
  farmId: string;
  name: string;
  species: string;
  stockingDate: string;
  estimatedCount: number;
  avgWeightGrams: number;
  notes: string | null;
  harvestedAt: string | null;
  ageInDays: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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

export interface FishSamplingDto {
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

@Injectable()
export class FishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, query: PageQuery): Promise<PageResult<FishBatchDto>> {
    const where = { farmId: user.farmId, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.fishBatch.findMany({
        where,
        orderBy: { stockingDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fishBatch.count({ where }),
    ]);
    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: RequestUser, id: string): Promise<FishBatchDto> {
    return toDto(await this.requireBatch(user.farmId, id));
  }

  async create(
    user: RequestUser,
    input: FishBatchCreate,
    requestId?: string,
  ): Promise<FishBatchDto> {
    const batch = await this.prisma.fishBatch.create({
      data: {
        farmId: user.farmId,
        name: input.name,
        species: input.species,
        stockingDate: input.stockingDate,
        estimatedCount: input.estimatedCount,
        avgWeightGrams: input.avgWeightGrams,
        notes: input.notes,
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'fish.create',
      entityType: 'fishBatch',
      entityId: batch.id,
      requestId,
    });
    return toDto(batch);
  }

  async update(
    user: RequestUser,
    id: string,
    input: FishBatchUpdate,
    requestId?: string,
  ): Promise<FishBatchDto> {
    await this.requireBatch(user.farmId, id);
    const batch = await this.prisma.fishBatch.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.species !== undefined ? { species: input.species } : {}),
        ...(input.stockingDate !== undefined ? { stockingDate: input.stockingDate } : {}),
        ...(input.estimatedCount !== undefined
          ? { estimatedCount: input.estimatedCount }
          : {}),
        ...(input.avgWeightGrams !== undefined
          ? { avgWeightGrams: input.avgWeightGrams }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.harvestedAt !== undefined ? { harvestedAt: input.harvestedAt } : {}),
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'fish.update',
      entityType: 'fishBatch',
      entityId: batch.id,
      requestId,
    });
    return toDto(batch);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    await this.requireBatch(user.farmId, id);
    await this.prisma.fishBatch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'fish.delete',
      entityType: 'fishBatch',
      entityId: id,
      requestId,
    });
  }

  async addWaterQuality(
    user: RequestUser,
    batchId: string,
    input: WaterQualityCreate,
    requestId?: string,
  ): Promise<WaterQualityDto> {
    await this.requireBatch(user.farmId, batchId);
    const row = await this.prisma.waterQualityLog.create({
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
      action: 'fish.water-quality',
      entityType: 'fishBatch',
      entityId: batchId,
      requestId,
    });
    return toWaterDto(row);
  }

  async addSampling(
    user: RequestUser,
    batchId: string,
    input: FishSamplingCreate,
    requestId?: string,
  ): Promise<FishSamplingDto> {
    const batch = await this.requireBatch(user.farmId, batchId);
    const avgWeightGrams = input.totalWeightGrams / input.sampleCount;
    const estimatedCount = input.estimatedCount ?? batch.estimatedCount;

    const sampling = await this.prisma.$transaction(async (tx) => {
      await tx.fishBatch.update({
        where: { id: batchId },
        data: {
          avgWeightGrams,
          ...(input.estimatedCount !== undefined
            ? { estimatedCount: input.estimatedCount }
            : {}),
        },
      });
      return tx.fishSampling.create({
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
      action: 'fish.sampling',
      entityType: 'fishBatch',
      entityId: batchId,
      metadata: { avgWeightGrams, estimatedCount },
      requestId,
    });

    return toSamplingDto(sampling);
  }

  private async requireBatch(farmId: string, id: string): Promise<FishBatch> {
    const batch = await this.prisma.fishBatch.findFirst({
      where: { id, farmId, deletedAt: null },
    });
    if (!batch) {
      throw new NotFoundException({
        code: 'FISH_BATCH_NOT_FOUND',
        message: 'Fish batch not found',
      });
    }
    return batch;
  }
}

function ageInDays(stockingDate: Date): number {
  const ms = Date.now() - stockingDate.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function toDto(b: FishBatch): FishBatchDto {
  return {
    id: b.id,
    farmId: b.farmId,
    name: b.name,
    species: b.species,
    stockingDate: b.stockingDate.toISOString(),
    estimatedCount: b.estimatedCount,
    avgWeightGrams: Number(b.avgWeightGrams),
    notes: b.notes,
    harvestedAt: b.harvestedAt?.toISOString() ?? null,
    ageInDays: ageInDays(b.stockingDate),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    deletedAt: b.deletedAt?.toISOString() ?? null,
  };
}

function toWaterDto(w: WaterQualityLog): WaterQualityDto {
  return {
    id: w.id,
    batchId: w.batchId,
    recordedAt: w.recordedAt.toISOString(),
    temperatureC: w.temperatureC != null ? Number(w.temperatureC) : null,
    ph: w.ph != null ? Number(w.ph) : null,
    dissolvedO2: w.dissolvedO2 != null ? Number(w.dissolvedO2) : null,
    notes: w.notes,
    createdAt: w.createdAt.toISOString(),
  };
}

function toSamplingDto(s: FishSampling): FishSamplingDto {
  return {
    id: s.id,
    batchId: s.batchId,
    sampledAt: s.sampledAt.toISOString(),
    sampleCount: s.sampleCount,
    totalWeightGrams: Number(s.totalWeightGrams),
    estimatedCount: s.estimatedCount,
    avgWeightGrams: Number(s.avgWeightGrams),
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
  };
}
