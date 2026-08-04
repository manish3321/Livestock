import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PageResult,
  RevenueCreate,
  RevenueListQuery,
  RevenueUpdate,
} from '@farm/contracts';
import type { Revenue } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface RevenueDto {
  id: string;
  farmId: string;
  source: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  revenueDate: string;
  buyerName: string | null;
  buyerContact: string | null;
  paymentTerms: string | null;
  paymentStatus: string;
  invoiceNumber: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: RequestUser,
    query: RevenueListQuery,
  ): Promise<PageResult<RevenueDto>> {
    const where = {
      farmId: user.farmId,
      ...(query.source ? { source: query.source } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.revenue.findMany({
        where,
        orderBy: { revenueDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.revenue.count({ where }),
    ]);
    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: RequestUser, id: string): Promise<RevenueDto> {
    return toDto(await this.requireRevenue(user.farmId, id));
  }

  async create(
    user: RequestUser,
    input: RevenueCreate,
    requestId?: string,
  ): Promise<RevenueDto> {
    const amount = input.quantity * input.rate;
    const invoiceNumber = await this.nextInvoiceNumber(user.farmId, input.revenueDate);

    const row = await this.prisma.revenue.create({
      data: {
        farmId: user.farmId,
        source: input.source,
        quantity: input.quantity,
        unit: input.unit,
        rate: input.rate,
        amount,
        revenueDate: input.revenueDate,
        buyerName: input.buyerName,
        buyerContact: input.buyerContact,
        paymentTerms: input.paymentTerms,
        paymentStatus: input.paymentStatus,
        invoiceNumber,
        notes: input.notes,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'revenue.create',
      entityType: 'revenue',
      entityId: row.id,
      metadata: { invoiceNumber, amount },
      requestId,
    });

    return toDto(row);
  }

  async update(
    user: RequestUser,
    id: string,
    input: RevenueUpdate,
    requestId?: string,
  ): Promise<RevenueDto> {
    const current = await this.requireRevenue(user.farmId, id);
    const quantity = input.quantity ?? Number(current.quantity);
    const rate = input.rate ?? Number(current.rate);
    const amount =
      input.quantity !== undefined || input.rate !== undefined
        ? quantity * rate
        : Number(current.amount);

    const row = await this.prisma.revenue.update({
      where: { id },
      data: {
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.rate !== undefined ? { rate: input.rate } : {}),
        amount,
        ...(input.revenueDate !== undefined ? { revenueDate: input.revenueDate } : {}),
        ...(input.buyerName !== undefined ? { buyerName: input.buyerName } : {}),
        ...(input.buyerContact !== undefined ? { buyerContact: input.buyerContact } : {}),
        ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
        ...(input.paymentStatus !== undefined
          ? { paymentStatus: input.paymentStatus }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'revenue.update',
      entityType: 'revenue',
      entityId: row.id,
      requestId,
    });

    return toDto(row);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    await this.requireRevenue(user.farmId, id);
    await this.prisma.revenue.delete({ where: { id } });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'revenue.delete',
      entityType: 'revenue',
      entityId: id,
      requestId,
    });
  }

  private async nextInvoiceNumber(farmId: string, revenueDate: Date): Promise<string> {
    const ymd = revenueDate.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INV-${ymd}-`;
    const start = new Date(revenueDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const count = await this.prisma.revenue.count({
      where: {
        farmId,
        revenueDate: { gte: start, lt: end },
      },
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  private async requireRevenue(farmId: string, id: string): Promise<Revenue> {
    const row = await this.prisma.revenue.findFirst({ where: { id, farmId } });
    if (!row) {
      throw new NotFoundException({
        code: 'REVENUE_NOT_FOUND',
        message: 'Revenue not found',
      });
    }
    return row;
  }
}

function toDto(r: Revenue): RevenueDto {
  return {
    id: r.id,
    farmId: r.farmId,
    source: r.source,
    quantity: Number(r.quantity),
    unit: r.unit,
    rate: Number(r.rate),
    amount: Number(r.amount),
    revenueDate: r.revenueDate.toISOString(),
    buyerName: r.buyerName,
    buyerContact: r.buyerContact,
    paymentTerms: r.paymentTerms,
    paymentStatus: r.paymentStatus,
    invoiceNumber: r.invoiceNumber,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
