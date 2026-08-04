import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EXPENSE_ESCALATION_THRESHOLDS,
  type ExpenseCreate,
  type ExpenseListQuery,
  type ExpenseReview,
  type PageResult,
} from '@farm/contracts';
import type { Expense } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface ExpenseDto {
  id: string;
  farmId: string;
  category: string;
  amount: number;
  expenseDate: string;
  description: string;
  receiptNumber: string | null;
  status: string;
  submittedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
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
    status: e.status,
    submittedById: e.submittedById,
    reviewedById: e.reviewedById,
    reviewedAt: e.reviewedAt?.toISOString() ?? null,
    reviewNote: e.reviewNote,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
