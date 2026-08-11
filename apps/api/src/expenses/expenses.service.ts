import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EXPENSE_ESCALATION_THRESHOLDS,
  type ExpenseBudgetQuery,
  type ExpenseBudgetUpsert,
  type ExpenseCreate,
  type ExpenseListQuery,
  type ExpenseReview,
  type PageResult,
  type RecurringExpenseCreate,
} from '@farm/contracts';
import type {
  Expense,
  ExpenseBudget,
  RecurringExpense,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { StoragePort } from '../storage/storage.port';

export interface ExpenseDto {
  id: string;
  farmId: string;
  category: string;
  amount: number;
  expenseDate: string;
  description: string;
  receiptNumber: string | null;
  receiptUrl: string | null;
  gstAmount: number | null;
  supplier: string | null;
  paymentStatus: string;
  status: string;
  submittedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseBudgetDto {
  id: string;
  farmId: string;
  category: string;
  year: number;
  month: number;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpenseDto {
  id: string;
  farmId: string;
  category: string;
  amount: number;
  description: string;
  supplier: string | null;
  gstAmount: number | null;
  dayOfMonth: number;
  active: boolean;
  lastGeneratedYear: number | null;
  lastGeneratedMonth: number | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: RequestUser,
    query: ExpenseListQuery,
  ): Promise<PageResult<ExpenseDto>> {
    const where = {
      farmId: user.farmId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.expense.count({ where }),
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
    input: ExpenseCreate,
    requestId?: string,
  ): Promise<ExpenseDto> {
    const threshold = EXPENSE_ESCALATION_THRESHOLDS[input.category];
    const status = input.amount > threshold ? 'ESCALATED' : 'PENDING';

    const expense = await this.prisma.expense.create({
      data: {
        farmId: user.farmId,
        category: input.category,
        amount: input.amount,
        expenseDate: input.expenseDate,
        description: input.description,
        receiptNumber: input.receiptNumber,
        gstAmount: input.gstAmount,
        supplier: input.supplier,
        paymentStatus: input.paymentStatus ?? 'UNPAID',
        status,
        submittedById: user.id,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'expenses.create',
      entityType: 'expense',
      entityId: expense.id,
      metadata: { status, amount: input.amount },
      requestId,
    });

    return toDto(expense);
  }

  async review(
    user: RequestUser,
    id: string,
    input: ExpenseReview,
    requestId?: string,
  ): Promise<ExpenseDto> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, farmId: user.farmId },
    });
    if (!expense) {
      throw new NotFoundException({
        code: 'EXPENSE_NOT_FOUND',
        message: 'Expense not found',
      });
    }

    if (expense.status === 'APPROVED' || expense.status === 'REJECTED') {
      throw new BadRequestException({
        code: 'EXPENSE_ALREADY_REVIEWED',
        message: `Expense is already ${expense.status}`,
      });
    }

    if (expense.status === 'PENDING') {
      if (!user.permissions.includes('expenses:approve')) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Role lacks permission: expenses:approve',
        });
      }
    } else if (expense.status === 'ESCALATED') {
      if (!user.permissions.includes('expenses:approve-escalated')) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Role lacks permission: expenses:approve-escalated',
        });
      }
    }

    const nextStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'expenses.review',
      entityType: 'expense',
      entityId: id,
      metadata: { decision: input.decision, status: nextStatus },
      requestId,
    });

    return toDto(updated);
  }

  async uploadReceipt(
    user: RequestUser,
    id: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    storage: StoragePort,
    requestId?: string,
  ): Promise<ExpenseDto> {
    const expense = await this.requireExpense(user.farmId, id);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `receipts/${user.farmId}/${id}-${safeName}`;
    await storage.put(key, file.buffer, file.mimetype || 'application/octet-stream');

    const receiptUrl = `/v1/expenses/${id}/receipt/file`;
    const updated = await this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        receiptStorageKey: key,
        receiptUrl,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'expenses.receipt',
      entityType: 'expense',
      entityId: id,
      metadata: { key },
      requestId,
    });

    return toDto(updated);
  }

  async getReceiptBuffer(
    user: RequestUser,
    id: string,
    storage: StoragePort,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const expense = await this.requireExpense(user.farmId, id);
    if (!expense.receiptStorageKey) {
      throw new NotFoundException({
        code: 'RECEIPT_NOT_FOUND',
        message: 'No receipt uploaded for this expense',
      });
    }
    const buffer = await storage.get(expense.receiptStorageKey);
    const filename = expense.receiptStorageKey.split('/').pop() ?? 'receipt';
    return {
      buffer,
      contentType: guessContentType(filename),
      filename,
    };
  }

  async listBudgets(
    user: RequestUser,
    query: ExpenseBudgetQuery,
  ): Promise<ExpenseBudgetDto[]> {
    const rows = await this.prisma.expenseBudget.findMany({
      where: { farmId: user.farmId, year: query.year, month: query.month },
      orderBy: { category: 'asc' },
    });
    return rows.map(toBudgetDto);
  }

  async upsertBudget(
    user: RequestUser,
    input: ExpenseBudgetUpsert,
    requestId?: string,
  ): Promise<ExpenseBudgetDto> {
    const row = await this.prisma.expenseBudget.upsert({
      where: {
        farmId_category_year_month: {
          farmId: user.farmId,
          category: input.category,
          year: input.year,
          month: input.month,
        },
      },
      create: {
        farmId: user.farmId,
        category: input.category,
        year: input.year,
        month: input.month,
        amount: input.amount,
      },
      update: { amount: input.amount },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'expenses.budget',
      entityType: 'expenseBudget',
      entityId: row.id,
      metadata: {
        category: input.category,
        year: input.year,
        month: input.month,
        amount: input.amount,
      },
      requestId,
    });

    return toBudgetDto(row);
  }

  async listRecurring(user: RequestUser): Promise<RecurringExpenseDto[]> {
    const rows = await this.prisma.recurringExpense.findMany({
      where: { farmId: user.farmId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecurringDto);
  }

  async createRecurring(
    user: RequestUser,
    input: RecurringExpenseCreate,
    requestId?: string,
  ): Promise<RecurringExpenseDto> {
    const row = await this.prisma.recurringExpense.create({
      data: {
        farmId: user.farmId,
        category: input.category,
        amount: input.amount,
        description: input.description,
        supplier: input.supplier,
        gstAmount: input.gstAmount,
        dayOfMonth: input.dayOfMonth,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'expenses.recurring.create',
      entityType: 'recurringExpense',
      entityId: row.id,
      requestId,
    });

    return toRecurringDto(row);
  }

  async generateMonth(
    user: RequestUser,
    requestId?: string,
  ): Promise<{ created: number; expenses: ExpenseDto[] }> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const templates = await this.prisma.recurringExpense.findMany({
      where: {
        farmId: user.farmId,
        active: true,
        NOT: {
          AND: [{ lastGeneratedYear: year }, { lastGeneratedMonth: month }],
        },
      },
    });

    const created: ExpenseDto[] = [];
    for (const tpl of templates) {
      const day = Math.min(tpl.dayOfMonth, daysInMonth(year, month));
      const expenseDate = new Date(Date.UTC(year, month - 1, day));
      const amount = Number(tpl.amount);
      const threshold = EXPENSE_ESCALATION_THRESHOLDS[tpl.category];
      const status = amount > threshold ? 'ESCALATED' : 'PENDING';

      const expense = await this.prisma.$transaction(async (tx) => {
        const row = await tx.expense.create({
          data: {
            farmId: user.farmId,
            category: tpl.category,
            amount: tpl.amount,
            expenseDate,
            description: tpl.description,
            supplier: tpl.supplier,
            gstAmount: tpl.gstAmount,
            paymentStatus: 'UNPAID',
            status,
            submittedById: user.id,
          },
        });
        await tx.recurringExpense.update({
          where: { id: tpl.id },
          data: { lastGeneratedYear: year, lastGeneratedMonth: month },
        });
        return row;
      });

      created.push(toDto(expense));
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'expenses.recurring.generate',
      entityType: 'recurringExpense',
      metadata: { year, month, created: created.length },
      requestId,
    });

    return { created: created.length, expenses: created };
  }

  private async requireExpense(farmId: string, id: string): Promise<Expense> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, farmId },
    });
    if (!expense) {
      throw new NotFoundException({
        code: 'EXPENSE_NOT_FOUND',
        message: 'Expense not found',
      });
    }
    return expense;
  }
}

function toDto(e: Expense): ExpenseDto {
  return {
    id: e.id,
    farmId: e.farmId,
    category: e.category,
    amount: Number(e.amount),
    expenseDate: e.expenseDate.toISOString(),
    description: e.description,
    receiptNumber: e.receiptNumber,
    receiptUrl: e.receiptUrl,
    gstAmount: e.gstAmount != null ? Number(e.gstAmount) : null,
    supplier: e.supplier,
    paymentStatus: e.paymentStatus,
    status: e.status,
    submittedById: e.submittedById,
    reviewedById: e.reviewedById,
    reviewedAt: e.reviewedAt?.toISOString() ?? null,
    reviewNote: e.reviewNote,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function toBudgetDto(b: ExpenseBudget): ExpenseBudgetDto {
  return {
    id: b.id,
    farmId: b.farmId,
    category: b.category,
    year: b.year,
    month: b.month,
    amount: Number(b.amount),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function toRecurringDto(r: RecurringExpense): RecurringExpenseDto {
  return {
    id: r.id,
    farmId: r.farmId,
    category: r.category,
    amount: Number(r.amount),
    description: r.description,
    supplier: r.supplier,
    gstAmount: r.gstAmount != null ? Number(r.gstAmount) : null,
    dayOfMonth: r.dayOfMonth,
    active: r.active,
    lastGeneratedYear: r.lastGeneratedYear,
    lastGeneratedMonth: r.lastGeneratedMonth,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function guessContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}
