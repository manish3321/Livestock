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
  labourPercentOfRevenue: number | null;
  healthPercentOfRevenue: number | null;
  profitPerAnimal: number | null;
  soldLitres: number;
  breakEvenPriceNpr: number | null;
  ratios: PnlApiResponse['ratios'] | null;
  prior: PnlApiResponse['prior'];
}

/** Raw API payload from GET /v1/pnl */
interface PnlApiResponse {
  period: 'monthly' | 'quarterly' | 'yearly';
  year: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  feedPercentOfRevenue?: number | null;
  labourPercentOfRevenue?: number | null;
  healthPercentOfRevenue?: number | null;
  profitPerAnimal?: number | null;
  animalCount?: number;
  soldLitres?: number;
  breakEvenPriceNpr?: number | null;
  ratios?: {
    marginPct: number | null;
    marginStatus: string;
    feedSharePct: number | null;
    feedStatus: string;
    labourSharePct: number | null;
    labourStatus: string;
    healthSharePct: number | null;
    healthStatus: string;
    breakEvenPriceNpr: number | null;
    soldLitres: number;
    targets: {
      marginHealthyMinPct: number;
      marginHealthyMaxPct: number;
      feedShareMinPct: number;
      feedShareMaxPct: number;
      labourShareMinPct: number;
      labourShareMaxPct: number;
      healthShareMaxPct: number;
    };
  };
  prior?: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    revenueDelta: number | null;
    expenseDelta: number | null;
    profitDelta: number | null;
  } | null;
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
    labourPercentOfRevenue: raw.labourPercentOfRevenue ?? null,
    healthPercentOfRevenue: raw.healthPercentOfRevenue ?? null,
    profitPerAnimal: raw.profitPerAnimal ?? null,
    soldLitres: raw.soldLitres ?? 0,
    breakEvenPriceNpr: raw.breakEvenPriceNpr ?? null,
    ratios: raw.ratios ?? null,
    prior: raw.prior ?? null,
    streams: (raw.byRevenueSource ?? []).map((s) => ({
      name: s.key,
      revenue: s.revenue,
      expense: s.expenses,
      margin: s.revenue - s.expenses,
      lossMaking: s.lossMaking,
    })),
  };
}
