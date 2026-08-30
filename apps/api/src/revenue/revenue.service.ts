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
  qualityBonus: number | null;
  qualityPenalty: number | null;
  deductions: number | null;
  deductionNote: string | null;
  revenueDate: string;
  buyerName: string | null;
  buyerContact: string | null;
  paymentTerms: string | null;
  paymentStatus: string;
  invoiceNumber: string;
  notes: string | null;
  animalId: string | null;
  herdBatchId: string | null;
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
    const amount = settledAmount(
      input.quantity,
      input.rate,
      input.qualityBonus,
      input.qualityPenalty,
      input.deductions,
    );
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
        animalId: input.animalId,
        herdBatchId: input.herdBatchId,
        qualityBonus: input.qualityBonus,
        qualityPenalty: input.qualityPenalty,
        deductions: input.deductions,
        deductionNote: input.deductionNote,
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
    const bonus =
      input.qualityBonus !== undefined
        ? input.qualityBonus
        : current.qualityBonus != null
          ? Number(current.qualityBonus)
          : 0;
    const penalty =
      input.qualityPenalty !== undefined
        ? input.qualityPenalty
        : current.qualityPenalty != null
          ? Number(current.qualityPenalty)
          : 0;
    const deductions =
      input.deductions !== undefined
        ? input.deductions
        : current.deductions != null
          ? Number(current.deductions)
          : 0;
    const amount = settledAmount(quantity, rate, bonus, penalty, deductions);

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
        ...(input.animalId !== undefined ? { animalId: input.animalId } : {}),
        ...(input.herdBatchId !== undefined ? { herdBatchId: input.herdBatchId } : {}),
        ...(input.qualityBonus !== undefined ? { qualityBonus: input.qualityBonus } : {}),
        ...(input.qualityPenalty !== undefined
          ? { qualityPenalty: input.qualityPenalty }
          : {}),
        ...(input.deductions !== undefined ? { deductions: input.deductions } : {}),
        ...(input.deductionNote !== undefined
          ? { deductionNote: input.deductionNote }
          : {}),
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

function settledAmount(
  quantity: number,
  rate: number,
  bonus?: number | null,
  penalty?: number | null,
  deductions?: number | null,
): number {
  return quantity * rate + (bonus ?? 0) - (penalty ?? 0) - (deductions ?? 0);
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
    qualityBonus: r.qualityBonus != null ? Number(r.qualityBonus) : null,
    qualityPenalty: r.qualityPenalty != null ? Number(r.qualityPenalty) : null,
    deductions: r.deductions != null ? Number(r.deductions) : null,
    deductionNote: r.deductionNote,
    revenueDate: r.revenueDate.toISOString(),
    buyerName: r.buyerName,
    buyerContact: r.buyerContact,
    paymentTerms: r.paymentTerms,
    paymentStatus: r.paymentStatus,
    invoiceNumber: r.invoiceNumber,
    notes: r.notes,
    animalId: r.animalId,
    herdBatchId: r.herdBatchId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
