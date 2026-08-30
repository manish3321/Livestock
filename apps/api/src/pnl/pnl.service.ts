import { Injectable } from '@nestjs/common';
import type { PnlQuery } from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface PnlStream {
  key: string;
  revenue: number;
  expenses: number;
  margin: number;
  lossMaking: boolean;
}

export interface PnlReport {
  period: string;
  year: number;
  from: string;
  to: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
  feedPercentOfRevenue: number | null;
  healthPercentOfRevenue: number | null;
  profitPerAnimal: number | null;
  animalCount: number;
  byRevenueSource: PnlStream[];
  byExpenseCategory: Array<{ key: string; amount: number }>;
  lossMakingStreams: string[];
}

/** Rough cost-center mapping for stream margin flags. */
const STREAM_EXPENSE_CATEGORIES: Record<string, string[]> = {
  MILK: ['FEED', 'MEDICINE', 'LABOR'],
  EGGS: ['FEED', 'MEDICINE', 'LABOR'],
  FISH: ['FEED', 'EQUIPMENT', 'LABOR'],
  MEAT: ['FEED', 'MEDICINE', 'TRANSPORT'],
};

@Injectable()
export class PnlService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: RequestUser, query: PnlQuery): Promise<PnlReport> {
    const year = query.year ?? new Date().getUTCFullYear();
    const { from, to } = periodRange(query.period, year);

    const [revenues, expenses, animalCount] = await Promise.all([
      this.prisma.revenue.findMany({
        where: { farmId: user.farmId, revenueDate: { gte: from, lt: to } },
        select: { source: true, amount: true },
      }),
      this.prisma.expense.findMany({
        where: {
          farmId: user.farmId,
          expenseDate: { gte: from, lt: to },
          status: 'APPROVED',
        },
        select: { category: true, amount: true },
      }),
      this.prisma.animal.count({
        where: { farmId: user.farmId, deletedAt: null },
      }),
    ]);

    const revBySource: Record<string, number> = {};
    for (const r of revenues) {
      revBySource[r.source] = (revBySource[r.source] ?? 0) + Number(r.amount);
    }

    const expByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expByCategory[e.category] = (expByCategory[e.category] ?? 0) + Number(e.amount);
    }

    const totalRevenue = Object.values(revBySource).reduce((a, b) => a + b, 0);
    const totalExpenses = Object.values(expByCategory).reduce((a, b) => a + b, 0);
    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? netProfit / totalRevenue : 0;

    const streamKeys = new Set([
      ...Object.keys(revBySource),
      ...Object.keys(STREAM_EXPENSE_CATEGORIES),
    ]);

    const byRevenueSource: PnlStream[] = [...streamKeys].map((key) => {
      const revenue = revBySource[key] ?? 0;
      const cats = STREAM_EXPENSE_CATEGORIES[key] ?? [];
      // Split each shared category evenly across streams that claim it and have activity.
      let streamExpenses = 0;
      for (const cat of cats) {
        const catTotal = expByCategory[cat] ?? 0;
        if (catTotal === 0) continue;
        const claimants = Object.entries(STREAM_EXPENSE_CATEGORIES)
          .filter(([, cs]) => cs.includes(cat))
          .map(([k]) => k)
          .filter((k) => (revBySource[k] ?? 0) > 0 || k === key);
        const denom = Math.max(1, claimants.length);
        streamExpenses += catTotal / denom;
      }
      const streamMargin =
        revenue > 0 ? (revenue - streamExpenses) / revenue : streamExpenses > 0 ? -1 : 0;
      return {
        key,
        revenue,
        expenses: streamExpenses,
        margin: streamMargin,
        lossMaking: revenue - streamExpenses < 0 && (revenue > 0 || streamExpenses > 0),
      };
    });

    const feedCost = expByCategory.FEED ?? 0;
    const healthCost = expByCategory.MEDICINE ?? 0;

    return {
      period: query.period,
      year,
      from: from.toISOString(),
      to: to.toISOString(),
      totalRevenue,
      totalExpenses,
      netProfit,
      margin,
      feedPercentOfRevenue: totalRevenue > 0 ? feedCost / totalRevenue : null,
      healthPercentOfRevenue: totalRevenue > 0 ? healthCost / totalRevenue : null,
      profitPerAnimal: animalCount > 0 ? netProfit / animalCount : null,
      animalCount,
      byRevenueSource,
      byExpenseCategory: Object.entries(expByCategory).map(([key, amount]) => ({
        key,
        amount,
      })),
      lossMakingStreams: byRevenueSource.filter((s) => s.lossMaking).map((s) => s.key),
    };
  }
}

function periodRange(
  period: 'monthly' | 'quarterly' | 'yearly',
  year: number,
): { from: Date; to: Date } {
  const now = new Date();
  if (period === 'yearly') {
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }
  if (period === 'quarterly') {
    const q = year === now.getUTCFullYear() ? Math.floor(now.getUTCMonth() / 3) : 0;
    return {
      from: new Date(Date.UTC(year, q * 3, 1)),
      to: new Date(Date.UTC(year, q * 3 + 3, 1)),
    };
  }
  const month = year === now.getUTCFullYear() ? now.getUTCMonth() : 0;
  return {
    from: new Date(Date.UTC(year, month, 1)),
    to: new Date(Date.UTC(year, month + 1, 1)),
  };
}
