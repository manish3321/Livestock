import { Injectable } from '@nestjs/common';
import type { PnlQuery } from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { buildRatioSnapshot, yoyDelta, type RatioBand } from './pnl-rules';

export interface PnlStream {
  key: string;
  revenue: number;
  expenses: number;
  margin: number;
  lossMaking: boolean;
}

export interface PnlTotals {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  feed: number;
  labour: number;
  health: number;
  soldLitres: number;
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
  labourPercentOfRevenue: number | null;
  healthPercentOfRevenue: number | null;
  profitPerAnimal: number | null;
  animalCount: number;
  soldLitres: number;
  breakEvenPriceNpr: number | null;
  ratios: {
    targets: {
      marginHealthyMinPct: number;
      marginHealthyMaxPct: number;
      feedShareMinPct: number;
      feedShareMaxPct: number;
      labourShareMinPct: number;
      labourShareMaxPct: number;
      healthShareMaxPct: number;
    };
    marginPct: number | null;
    marginStatus: RatioBand;
    feedSharePct: number | null;
    feedStatus: RatioBand;
    labourSharePct: number | null;
    labourStatus: RatioBand;
    healthSharePct: number | null;
    healthStatus: RatioBand;
    breakEvenPriceNpr: number | null;
    soldLitres: number;
  };
  prior: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    revenueDelta: number | null;
    expenseDelta: number | null;
    profitDelta: number | null;
  } | null;
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
    const { from, to } = periodRange(query.period, year, query.month);
    const current = await this.totals(user.farmId, from, to);
    const priorRange = shiftYear(from, to, -1);
    const priorTotals = await this.totals(user.farmId, priorRange.from, priorRange.to);

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

    const streamKeys = new Set([
      ...Object.keys(revBySource),
      ...Object.keys(STREAM_EXPENSE_CATEGORIES),
    ]);

    const byRevenueSource: PnlStream[] = [...streamKeys].map((key) => {
      const revenue = revBySource[key] ?? 0;
      const cats = STREAM_EXPENSE_CATEGORIES[key] ?? [];
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

    const ratios = buildRatioSnapshot({
      revenue: current.totalRevenue,
      expenses: current.totalExpenses,
      feed: current.feed,
      labour: current.labour,
      health: current.health,
      soldLitres: current.soldLitres,
    });
    const priorHadActivity = priorTotals.totalRevenue > 0 || priorTotals.totalExpenses > 0;

    return {
      period: query.period,
      year,
      from: from.toISOString(),
      to: to.toISOString(),
      totalRevenue: current.totalRevenue,
      totalExpenses: current.totalExpenses,
      netProfit: current.netProfit,
      margin: current.totalRevenue > 0 ? current.netProfit / current.totalRevenue : 0,
      feedPercentOfRevenue: ratios.feedSharePct != null ? ratios.feedSharePct / 100 : null,
      labourPercentOfRevenue: ratios.labourSharePct != null ? ratios.labourSharePct / 100 : null,
      healthPercentOfRevenue: ratios.healthSharePct != null ? ratios.healthSharePct / 100 : null,
      profitPerAnimal: animalCount > 0 ? current.netProfit / animalCount : null,
      animalCount,
      soldLitres: current.soldLitres,
      breakEvenPriceNpr: ratios.breakEvenPriceNpr,
      ratios,
      prior: priorHadActivity
        ? {
            totalRevenue: priorTotals.totalRevenue,
            totalExpenses: priorTotals.totalExpenses,
            netProfit: priorTotals.netProfit,
            revenueDelta: yoyDelta(current.totalRevenue, priorTotals.totalRevenue),
            expenseDelta: yoyDelta(current.totalExpenses, priorTotals.totalExpenses),
            profitDelta: yoyDelta(current.netProfit, priorTotals.netProfit),
          }
        : null,
      byRevenueSource,
      byExpenseCategory: Object.entries(expByCategory).map(([key, amount]) => ({
        key,
        amount,
      })),
      lossMakingStreams: byRevenueSource.filter((s) => s.lossMaking).map((s) => s.key),
    };
  }

  private async totals(farmId: string, from: Date, to: Date): Promise<PnlTotals> {
    const [revenues, expenses, milk] = await Promise.all([
      this.prisma.revenue.findMany({
        where: { farmId, revenueDate: { gte: from, lt: to } },
        select: { amount: true },
      }),
      this.prisma.expense.findMany({
        where: { farmId, expenseDate: { gte: from, lt: to }, status: 'APPROVED' },
        select: { category: true, amount: true },
      }),
      this.prisma.productionEntry.findMany({
        where: {
          farmId,
          type: 'MILK',
          destination: 'SOLD',
          entryDate: { gte: from, lt: to },
        },
        select: { quantity: true },
      }),
    ]);
    const totalRevenue = revenues.reduce((s, r) => s + Number(r.amount), 0);
    let feed = 0;
    let labour = 0;
    let health = 0;
    let totalExpenses = 0;
    for (const e of expenses) {
      const amount = Number(e.amount);
      totalExpenses += amount;
      if (e.category === 'FEED') feed += amount;
      if (e.category === 'LABOR') labour += amount;
      if (e.category === 'MEDICINE') health += amount;
    }
    const soldLitres = milk.reduce((s, m) => s + Number(m.quantity), 0);
    return {
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      feed,
      labour,
      health,
      soldLitres,
    };
  }
}

function periodRange(
  period: 'monthly' | 'quarterly' | 'yearly',
  year: number,
  month?: number,
): { from: Date; to: Date } {
  const now = new Date();
  if (period === 'yearly') {
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }
  if (period === 'quarterly') {
    const q =
      month != null
        ? Math.floor((month - 1) / 3)
        : year === now.getUTCFullYear()
          ? Math.floor(now.getUTCMonth() / 3)
          : 0;
    return {
      from: new Date(Date.UTC(year, q * 3, 1)),
      to: new Date(Date.UTC(year, q * 3 + 3, 1)),
    };
  }
  const m =
    month != null
      ? month - 1
      : year === now.getUTCFullYear()
        ? now.getUTCMonth()
        : 0;
  return {
    from: new Date(Date.UTC(year, m, 1)),
    to: new Date(Date.UTC(year, m + 1, 1)),
  };
}

function shiftYear(from: Date, to: Date, years: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(from.getUTCFullYear() + years, from.getUTCMonth(), from.getUTCDate())),
    to: new Date(Date.UTC(to.getUTCFullYear() + years, to.getUTCMonth(), to.getUTCDate())),
  };
}
