import { Injectable, NotFoundException } from '@nestjs/common';
import {
  inventoryAlertLevel,
  type InventoryCreate,
  type InventoryUpdate,
  type PageQuery,
  type PageResult,
  type RestockCreate,
} from '@farm/contracts';
import type { InventoryItem, RestockRequest } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface InventoryItemDto {
  id: string;
  farmId: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  expiryDate: string | null;
  supplier: string | null;
  batchLotNumber: string | null;
  notes: string | null;
  alertLevel: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RestockRequestDto {
  id: string;
  itemId: string;
  quantity: number;
  status: string;
  notes: string | null;
  requestedBy: string;
  createdAt: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: RequestUser,
    query: PageQuery,
  ): Promise<PageResult<InventoryItemDto>> {
    const where = { farmId: user.farmId, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: RequestUser, id: string): Promise<InventoryItemDto> {
    return toDto(await this.requireItem(user.farmId, id));
  }

  async create(
    user: RequestUser,
    input: InventoryCreate,
    requestId?: string,
  ): Promise<InventoryItemDto> {
    const item = await this.prisma.inventoryItem.create({
      data: {
        farmId: user.farmId,
        name: input.name,
        category: input.category,
        unit: input.unit,
        currentStock: input.currentStock,
        minimumStock: input.minimumStock,
        expiryDate: input.expiryDate,
        supplier: input.supplier,
        batchLotNumber: input.batchLotNumber,
        notes: input.notes,
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'inventory.create',
      entityType: 'inventoryItem',
      entityId: item.id,
      requestId,
    });
    return toDto(item);
  }

  async update(
    user: RequestUser,
    id: string,
    input: InventoryUpdate,
    requestId?: string,
  ): Promise<InventoryItemDto> {
    await this.requireItem(user.farmId, id);
    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.currentStock !== undefined ? { currentStock: input.currentStock } : {}),
        ...(input.minimumStock !== undefined ? { minimumStock: input.minimumStock } : {}),
        ...(input.expiryDate !== undefined ? { expiryDate: input.expiryDate } : {}),
        ...(input.supplier !== undefined ? { supplier: input.supplier } : {}),
        ...(input.batchLotNumber !== undefined
          ? { batchLotNumber: input.batchLotNumber }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'inventory.update',
      entityType: 'inventoryItem',
      entityId: item.id,
      requestId,
    });
    return toDto(item);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    await this.requireItem(user.farmId, id);
    await this.prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'inventory.delete',
      entityType: 'inventoryItem',
      entityId: id,
      requestId,
    });
  }

  async requestRestock(
    user: RequestUser,
    itemId: string,
    input: RestockCreate,
    requestId?: string,
  ): Promise<RestockRequestDto> {
    await this.requireItem(user.farmId, itemId);
    const req = await this.prisma.restockRequest.create({
      data: {
        farmId: user.farmId,
        itemId,
        quantity: input.quantity,
        notes: input.notes,
        requestedBy: user.id,
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'inventory.restock',
      entityType: 'inventoryItem',
      entityId: itemId,
      metadata: { quantity: input.quantity },
      requestId,
    });
    return toRestockDto(req);
  }

  private async requireItem(farmId: string, id: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, farmId, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'INVENTORY_NOT_FOUND',
        message: 'Inventory item not found',
      });
    }
    return item;
  }
}

function toDto(i: InventoryItem): InventoryItemDto {
  const current = Number(i.currentStock);
  const minimum = Number(i.minimumStock);
  return {
    id: i.id,
    farmId: i.farmId,
    name: i.name,
    category: i.category,
    unit: i.unit,
    currentStock: current,
    minimumStock: minimum,
    expiryDate: i.expiryDate?.toISOString() ?? null,
    supplier: i.supplier,
    batchLotNumber: i.batchLotNumber,
    notes: i.notes,
    alertLevel: inventoryAlertLevel(current, minimum),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    deletedAt: i.deletedAt?.toISOString() ?? null,
  };
}

function toRestockDto(r: RestockRequest): RestockRequestDto {
  return {
    id: r.id,
    itemId: r.itemId,
    quantity: Number(r.quantity),
    status: r.status,
    notes: r.notes,
    requestedBy: r.requestedBy,
    createdAt: r.createdAt.toISOString(),
  };
}
