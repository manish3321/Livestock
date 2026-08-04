import type {
  ApprovalStatus,
  ExpenseCategory,
  ExpenseCreate,
  ExpenseListQuery,
  ExpenseReview,
  PageResult,
} from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface ExpenseDto {
  id: string;
  farmId: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description: string;
  receiptNumber: string | null;
  status: ApprovalStatus;
  submittedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listExpenses(
  query: Partial<ExpenseListQuery> = {},
): Promise<PageResult<ExpenseDto>> {
  return api(`/v1/expenses${toQuery(query)}`);
}

export function createExpense(body: ExpenseCreate): Promise<ExpenseDto> {
  return api('/v1/expenses', { method: 'POST', body: JSON.stringify(body) });
}

export function reviewExpense(id: string, body: ExpenseReview): Promise<ExpenseDto> {
  return api(`/v1/expenses/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
