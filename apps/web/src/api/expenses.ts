import type {
  ApprovalStatus,
  ExpenseBudgetUpsert,
  ExpenseCategory,
  ExpenseCreate,
  ExpenseListQuery,
  ExpenseReview,
  PageResult,
  RecurringExpenseCreate,
} from '@farm/contracts';
import { api, getAccessToken } from './client';
import { toQuery } from './query';

export interface ExpenseDto {
  id: string;
  farmId: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description: string;
  receiptNumber: string | null;
  receiptUrl: string | null;
  gstAmount: number | null;
  supplier: string | null;
  paymentStatus: string;
  status: ApprovalStatus;
  submittedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  animalId: string | null;
  herdBatchId: string | null;
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

export async function uploadExpenseReceipt(id: string, file: File): Promise<ExpenseDto> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/v1/expenses/${id}/receipt`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = (await res.json()) as { message?: string };
      if (err.message) message = err.message;
    } catch {
      /* ignore */
    }
    throw new Error(message || 'Upload failed');
  }
  return (await res.json()) as ExpenseDto;
}

export function listBudgets(year: number, month: number): Promise<ExpenseBudgetDto[]> {
  return api(`/v1/expenses/budgets${toQuery({ year, month })}`);
}

export function upsertBudget(body: ExpenseBudgetUpsert): Promise<ExpenseBudgetDto> {
  return api('/v1/expenses/budgets', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function listRecurring(): Promise<RecurringExpenseDto[]> {
  return api('/v1/expenses/recurring');
}

export function createRecurring(body: RecurringExpenseCreate): Promise<RecurringExpenseDto> {
  return api('/v1/expenses/recurring', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function generateRecurringMonth(): Promise<{
  created: number;
  expenses: ExpenseDto[];
}> {
  return api('/v1/expenses/recurring/generate-month', { method: 'POST' });
}
