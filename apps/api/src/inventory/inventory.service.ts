import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  inventoryAlertLevel,
  type InventoryCreate,
  type InventoryUpdate,
  type PageQuery,
  type PageResult,
  type RestockCreate,
  type StockMovementCreate,
} from '@farm/contracts';
import type { InventoryItem, RestockRequest, StockMovement } from '@prisma/client';
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
  unitCost: number | null;
  valuation: number;
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

export interface StockMovementDto {
  id: string;
  farmId: string;
  itemId: string;
  type: string;
  quantity: number;
  reason: string | null;
  userId: string;
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
        unitCost: input.unitCost,
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
        ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
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

  /**
   * Mark a restock request as RECEIVED: bump stock and write an IN movement.
   */
  async receiveRestock(
    user: RequestUser,
    requestId: string,
    auditRequestId?: string,
  ): Promise<RestockRequestDto> {
    const req = await this.prisma.restockRequest.findFirst({
      where: { id: requestId, farmId: user.farmId },
    });
    if (!req) {
      throw new NotFoundException({
        code: 'RESTOCK_NOT_FOUND',
        message: 'Restock request not found',
      });
    }
    if (req.status === 'RECEIVED') {
      throw new BadRequestException({
        code: 'RESTOCK_ALREADY_RECEIVED',
        message: 'Restock request is already RECEIVED',
      });
    }
    if (req.status === 'REJECTED') {
      throw new BadRequestException({
        code: 'RESTOCK_REJECTED',
        message: 'Cannot receive a rejected restock request',
      });
    }

    const qty = Number(req.quantity);
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: req.itemId, farmId: user.farmId, deletedAt: null },
      });
      if (!item) {
        throw new NotFoundException({
          code: 'INVENTORY_NOT_FOUND',
          message: 'Inventory item not found',
        });
      }
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { currentStock: Number(item.currentStock) + qty },
      });
      await tx.stockMovement.create({
        data: {
          farmId: user.farmId,
          itemId: item.id,
          type: 'IN',
          quantity: qty,
          reason: `Restock received (${req.id})`,
          userId: user.id,
        },
      });
      return tx.restockRequest.update({
        where: { id: req.id },
        data: { status: 'RECEIVED' },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'inventory.restock.receive',
      entityType: 'restockRequest',
      entityId: req.id,
      metadata: { itemId: req.itemId, quantity: qty },
      requestId: auditRequestId,
    });

    return toRestockDto(updated);
  }

  async listMovements(
    user: RequestUser,
    itemId: string,
  ): Promise<StockMovementDto[]> {
    await this.requireItem(user.farmId, itemId);
    const rows = await this.prisma.stockMovement.findMany({
      where: { farmId: user.farmId, itemId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toMovementDto);
  }

  async createMovement(
    user: RequestUser,
    itemId: string,
    input: StockMovementCreate,
    requestId?: string,
  ): Promise<StockMovementDto> {
    const item = await this.requireItem(user.farmId, itemId);
    const current = Number(item.currentStock);
    let nextStock: number;
    if (input.type === 'IN') {
      nextStock = current + input.quantity;
    } else if (input.type === 'OUT') {
      nextStock = current - input.quantity;
    } else {
      // ADJUST: set absolute stock level
      nextStock = input.quantity;
    }

    if (nextStock < 0) {
      const { ensureTask } = await import('../jobs/task-writer');
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        type: 'STOCK_REORDER',
        titleEn: `Negative stock: ${item.name} — record the purchase`,
        titleNp: `${item.name} स्टक ऋणात्मक — किनबेच रेकर्ड गर्नुहोस्`,
        dueAt: new Date(),
        priority: 'NORMAL',
        sourceRefType: 'inventoryItem',
        sourceRefId: item.id,
      });
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: nextStock },
      });
      return tx.stockMovement.create({
        data: {
          farmId: user.farmId,
          itemId,
          type: input.type,
          quantity: input.quantity,
          reason: input.reason,
          userId: user.id,
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'inventory.movement',
      entityType: 'inventoryItem',
      entityId: itemId,
      metadata: { type: input.type, quantity: input.quantity },
      requestId,
    });

    return toMovementDto(movement);
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
  const unitCost = i.unitCost != null ? Number(i.unitCost) : null;
  return {
    id: i.id,
    farmId: i.farmId,
    name: i.name,
    category: i.category,
    unit: i.unit,
    currentStock: current,
    minimumStock: minimum,
    unitCost,
    valuation: unitCost != null ? current * unitCost : 0,
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

function toMovementDto(m: StockMovement): StockMovementDto {
  return {
    id: m.id,
    farmId: m.farmId,
    itemId: m.itemId,
    type: m.type,
    quantity: Number(m.quantity),
    reason: m.reason,
    userId: m.userId,
    createdAt: m.createdAt.toISOString(),
  };
}
