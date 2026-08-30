import type { PnlQuery } from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface PnlStream {
  name: string;
  revenue: number;
  expense: number;
  margin: number;
  lossMaking: boolean;
}

export interface PnlReport {
  period: 'monthly' | 'quarterly' | 'yearly';
  year: number;
  streams: PnlStream[];
  totals: {
    revenue: number;
    expense: number;
    margin: number;
  };
  feedPercentOfRevenue: number | null;
  healthPercentOfRevenue: number | null;
  profitPerAnimal: number | null;
}

/** Raw API payload from GET /v1/pnl */
interface PnlApiResponse {
  period: 'monthly' | 'quarterly' | 'yearly';
  year: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  feedPercentOfRevenue?: number | null;
  healthPercentOfRevenue?: number | null;
  profitPerAnimal?: number | null;
  animalCount?: number;
  byRevenueSource: Array<{
    key: string;
    revenue: number;
    expenses: number;
    margin: number;
    lossMaking: boolean;
  }>;
}

export async function getPnl(query: Partial<PnlQuery> = {}): Promise<PnlReport> {
  const raw = await api<PnlApiResponse>(`/v1/pnl${toQuery(query)}`);
  return {
    period: raw.period,
    year: raw.year,
    totals: {
      revenue: raw.totalRevenue,
      expense: raw.totalExpenses,
      margin: raw.netProfit,
    },
    feedPercentOfRevenue: raw.feedPercentOfRevenue ?? null,
    healthPercentOfRevenue: raw.healthPercentOfRevenue ?? null,
    profitPerAnimal: raw.profitPerAnimal ?? null,
    streams: (raw.byRevenueSource ?? []).map((s) => ({
      name: s.key,
      revenue: s.revenue,
      expense: s.expenses,
      margin: s.revenue - s.expenses,
      lossMaking: s.lossMaking,
    })),
  };
}
