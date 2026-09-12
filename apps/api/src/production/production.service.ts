import { Injectable } from '@nestjs/common';
import type {
  PageResult,
  ProductionCreate,
  ProductionListQuery,
} from '@farm/contracts';
import type { ProductionEntry } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface ProductionEntryDto {
  id: string;
  farmId: string;
  type: string;
  entryDate: string;
  quantity: number;
  unit: string;
  quality: string | null;
  animalId: string | null;
  groupId: string | null;
  batchId: string | null;
  herdBatchId: string | null;
  animalTag: string | null;
  animalName: string | null;
  herdBatchName: string | null;
  milkerName: string | null;
  appearance: string | null;
  fatPercent: number | null;
  snfPercent: number | null;
  scc: number | null;
  collectionMethod: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

type ProductionWithRelations = ProductionEntry & {
  animal?: { tag: string; name: string | null } | null;
  herdBatch?: { name: string } | null;
};

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: RequestUser,
    query: ProductionListQuery,
  ): Promise<PageResult<ProductionEntryDto>> {
    const where = {
      farmId: user.farmId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            entryDate: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where,
        include: {
          animal: { select: { tag: true, name: true } },
          herdBatch: { select: { name: true } },
        },
        orderBy: { entryDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.productionEntry.count({ where }),
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
    input: ProductionCreate,
    requestId?: string,
  ): Promise<ProductionEntryDto> {
    const row = await this.prisma.productionEntry.create({
      data: {
        farmId: user.farmId,
        type: input.type,
        entryDate: input.entryDate,
        quantity: input.quantity,
        unit: input.unit,
        quality: input.quality,
        animalId: input.animalId,
        groupId: input.groupId,
        batchId: input.batchId,
        herdBatchId: input.herdBatchId,
        milkerName: input.milkerName,
        appearance: input.appearance,
        fatPercent: input.fatPercent,
        snfPercent: input.snfPercent,
        scc: input.scc,
        collectionMethod: input.collectionMethod,
        session: input.session,
        destination: input.destination,
        proteinPercent: input.proteinPercent,
        lactosePercent: input.lactosePercent,
        udderFlag: input.udderFlag ?? false,
        notes: input.notes,
      },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'production.create',
      entityType: 'productionEntry',
      entityId: row.id,
      requestId,
    });

    return toDto(row);
  }
}

function toDto(r: ProductionWithRelations): ProductionEntryDto {
  return {
    id: r.id,
    farmId: r.farmId,
    type: r.type,
    entryDate: r.entryDate.toISOString(),
    quantity: Number(r.quantity),
    unit: r.unit,
    quality: r.quality,
    animalId: r.animalId,
    groupId: r.groupId,
    batchId: r.batchId,
    herdBatchId: r.herdBatchId,
    animalTag: r.animal?.tag ?? null,
    animalName: r.animal?.name ?? null,
    herdBatchName: r.herdBatch?.name ?? null,
    milkerName: r.milkerName,
    appearance: r.appearance,
    fatPercent: r.fatPercent != null ? Number(r.fatPercent) : null,
    snfPercent: r.snfPercent != null ? Number(r.snfPercent) : null,
    scc: r.scc,
    collectionMethod: r.collectionMethod,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
