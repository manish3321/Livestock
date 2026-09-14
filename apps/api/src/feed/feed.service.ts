import { Injectable, NotFoundException } from '@nestjs/common';
import type { FeedCreate, FeedListQuery, PageResult } from '@farm/contracts';
import type { FeedLog } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { ensureTask } from '../jobs/task-writer';
import { PrismaService } from '../prisma/prisma.service';
import { remainingFromMovements } from '../profit/profit-rules';
import { pickFefoLot } from '../vaccinations/vaccination-rules';

export interface FeedLogDto {
  id: string;
  farmId: string;
  animalId: string | null;
  herdBatchId: string | null;
  animalTag: string | null;
  herdBatchName: string | null;
  feedType: string;
  quantityKg: number;
  costPerKg: number | null;
  totalCost: number | null;
  condition: string | null;
  accepted: boolean;
  inventoryItemId: string | null;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
}

export interface FeedFcrDto {
  feedCost: number;
  milkLiters: number;
  eggCount: number;
  fishKg: number;
  feedCostPerLiter: number | null;
  feedCostPerDozen: number | null;
  feedCostPerKgFish: number | null;
  season: {
    key: string;
    label: string;
    warning: string | null;
  };
}

type FeedWithRelations = FeedLog & {
  animal?: { tag: string } | null;
  herdBatch?: { name: string } | null;
};

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, query: FeedListQuery): Promise<PageResult<FeedLogDto>> {
    const where = {
      farmId: user.farmId,
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...(query.herdBatchId ? { herdBatchId: query.herdBatchId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.feedLog.findMany({
        where,
        include: {
          animal: { select: { tag: true } },
          herdBatch: { select: { name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.feedLog.count({ where }),
    ]);
    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(user: RequestUser, input: FeedCreate, requestId?: string): Promise<FeedLogDto> {
    const totalCost =
      input.costPerKg !== undefined ? input.costPerKg * input.quantityKg : undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      let lotId: string | undefined;
      if (input.inventoryItemId) {
        const item = await tx.inventoryItem.findFirst({
          where: { id: input.inventoryItemId, farmId: user.farmId, deletedAt: null },
        });
        if (!item) {
          throw new NotFoundException({
            code: 'INVENTORY_NOT_FOUND',
            message: 'Inventory item not found',
          });
        }
        const lots = await tx.stockLot.findMany({ where: { farmId: user.farmId, itemId: item.id } });
        const picked = pickFefoLot(
          lots.map((l) => ({
            id: l.id,
            lotNumber: l.lotNumber,
            qtyRemaining: Number(l.qtyRemaining),
            expiryDate: l.expiryDate,
            receivedOn: l.receivedOn,
          })),
        );
        const lot = picked ? lots.find((l) => l.id === picked.id) : undefined;
        lotId = lot?.id;
        const nextStock = Number(item.currentStock) - input.quantityKg;
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: nextStock },
        });
        await tx.stockMovement.create({
          data: {
            farmId: user.farmId,
            itemId: item.id,
            lotId,
            type: 'OUT',
            quantity: input.quantityKg,
            reason: input.animalId ? 'Feed animal' : 'Feed herd',
            userId: user.id,
          },
        });
        if (lot) {
          const movements = await tx.stockMovement.findMany({ where: { lotId: lot.id } });
          const remaining = remainingFromMovements(
            Number(lot.qtyReceived),
            movements.map((m) => ({ type: m.type, quantity: Number(m.quantity) })),
          );
          await tx.stockLot.update({
            where: { id: lot.id },
            data: { qtyRemaining: remaining },
          });
          if (remaining < 0) {
            await ensureTask(tx, {
              farmId: user.farmId,
              type: 'STOCK_RECONCILE',
              titleEn: `${item.name} lot ${lot.lotNumber} went negative — record the purchase`,
              titleNp: `${item.name} ${lot.lotNumber} ऋणात्मक — किनबेच रेकर्ड गर्नुहोस्`,
              dueAt: new Date(),
              priority: 'HIGH',
              sourceRefType: 'stockLot',
              sourceRefId: lot.id,
            });
          }
        } else if (nextStock < 0) {
          await ensureTask(tx, {
            farmId: user.farmId,
            type: 'STOCK_RECONCILE',
            titleEn: `${item.name} went negative — record the purchase`,
            titleNp: `${item.name} ऋणात्मक — किनबेच रेकर्ड गर्नुहोस्`,
            dueAt: new Date(),
            priority: 'HIGH',
            sourceRefType: 'inventoryItem',
            sourceRefId: item.id,
          });
        }
      }

      const date = new Date(
        Date.UTC(input.occurredAt.getUTCFullYear(), input.occurredAt.getUTCMonth(), input.occurredAt.getUTCDate()),
      );
      await tx.feedRecord.create({
        data: {
          farmId: user.farmId,
          date,
          animalId: input.animalId,
          itemId: input.inventoryItemId,
          lotId,
          qty: input.quantityKg,
          unit: 'KG',
          costPerUnit: input.costPerKg ?? 0,
          recordedById: user.id,
        },
      });

      return tx.feedLog.create({
        data: {
          farmId: user.farmId,
          animalId: input.animalId,
          herdBatchId: input.herdBatchId,
          feedType: input.feedType,
          quantityKg: input.quantityKg,
          costPerKg: input.costPerKg,
          totalCost,
          condition: input.condition,
          accepted: input.accepted ?? true,
          inventoryItemId: input.inventoryItemId,
          occurredAt: input.occurredAt,
          notes: input.notes,
        },
        include: {
          animal: { select: { tag: true } },
          herdBatch: { select: { name: true } },
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'feed.create',
      entityType: 'feedLog',
      entityId: row.id,
      requestId,
    });
    return toDto(row);
  }

  async fcr(user: RequestUser): Promise<FeedFcrDto> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [feed, milk, eggs, fish, batchFeeds] = await Promise.all([
      this.prisma.feedLog.aggregate({
        where: { farmId: user.farmId, occurredAt: { gte: monthStart } },
        _sum: { totalCost: true },
      }),
      this.prisma.productionEntry.aggregate({
        where: { farmId: user.farmId, type: 'MILK', entryDate: { gte: monthStart } },
        _sum: { quantity: true },
      }),
      this.prisma.productionEntry.aggregate({
        where: { farmId: user.farmId, type: 'EGGS', entryDate: { gte: monthStart } },
        _sum: { quantity: true },
      }),
      this.prisma.productionEntry.aggregate({
        where: { farmId: user.farmId, type: 'FISH', entryDate: { gte: monthStart } },
        _sum: { quantity: true },
      }),
      this.prisma.batchFeedEvent.findMany({
        where: { farmId: user.farmId, occurredAt: { gte: monthStart } },
        include: { inventoryItem: { select: { unitCost: true } } },
      }),
    ]);
    const batchFeedCost = batchFeeds.reduce((sum, row) => {
      const unit = row.inventoryItem?.unitCost != null ? Number(row.inventoryItem.unitCost) : 0;
      return sum + Number(row.quantityKg) * unit;
    }, 0);
    const feedCost = Number(feed._sum.totalCost ?? 0) + batchFeedCost;
    const milkLiters = Number(milk._sum.quantity ?? 0);
    const eggCount = Number(eggs._sum.quantity ?? 0);
    const fishKg = Number(fish._sum.quantity ?? 0);
    return {
      feedCost,
      milkLiters,
      eggCount,
      fishKg,
      feedCostPerLiter: milkLiters > 0 ? feedCost / milkLiters : null,
      feedCostPerDozen: eggCount > 0 ? feedCost / (eggCount / 12) : null,
      feedCostPerKgFish: fishKg > 0 ? feedCost / fishKg : null,
      season: nepalSeason(now),
    };
  }
}

export function nepalSeason(now: Date): { key: string; label: string; warning: string | null } {
  const month = now.getUTCMonth() + 1;
  if (month >= 6 && month <= 9) {
    return {
      key: 'monsoon',
      label: 'Monsoon (Jun–Sep)',
      warning: 'Peak forage — make hay/silage for the dry season.',
    };
  }
  if (month === 10) {
    return {
      key: 'post-monsoon',
      label: 'Post-monsoon',
      warning: 'Hay-making window. Conserve forage now.',
    };
  }
  if (month >= 11 || month <= 4) {
    return {
      key: 'dry',
      label: 'Dry season (Nov–Apr)',
      warning: 'Severe forage shortage risk. Use reserves and plan concentrate purchases.',
    };
  }
  return {
    key: 'pre-monsoon',
    label: 'Pre-monsoon (May)',
    warning: 'Prepare shelter and feed storage before monsoon.',
  };
}

function toDto(r: FeedWithRelations): FeedLogDto {
  return {
    id: r.id,
    farmId: r.farmId,
    animalId: r.animalId,
    herdBatchId: r.herdBatchId,
    animalTag: r.animal?.tag ?? null,
    herdBatchName: r.herdBatch?.name ?? null,
    feedType: r.feedType,
    quantityKg: Number(r.quantityKg),
    costPerKg: r.costPerKg != null ? Number(r.costPerKg) : null,
    totalCost: r.totalCost != null ? Number(r.totalCost) : null,
    condition: r.condition,
    accepted: r.accepted,
    inventoryItemId: r.inventoryItemId,
    occurredAt: r.occurredAt.toISOString(),
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}
