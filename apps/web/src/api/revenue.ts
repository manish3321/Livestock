import type {
  PageResult,
  PaymentStatus,
  RevenueCreate,
  RevenueListQuery,
  RevenueSource,
} from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface RevenueDto {
  id: string;
  farmId: string;
  source: RevenueSource;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  qualityBonus?: number | null;
  qualityPenalty?: number | null;
  deductions?: number | null;
  deductionNote?: string | null;
  revenueDate: string;
  buyerName: string | null;
  buyerContact: string | null;
  paymentTerms: string | null;
  paymentStatus: PaymentStatus;
  invoiceNumber: string;
  notes: string | null;
  animalId: string | null;
  herdBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listRevenue(
  query: Partial<RevenueListQuery> = {},
): Promise<PageResult<RevenueDto>> {
  return api(`/v1/revenue${toQuery(query)}`);
}

export function createRevenue(body: RevenueCreate): Promise<RevenueDto> {
  return api('/v1/revenue', { method: 'POST', body: JSON.stringify(body) });
}
