import { Injectable } from '@nestjs/common';
import type { PaymentStatementCreate } from '@farm/contracts';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { ensureTask } from '../jobs/task-writer';
import { PrismaService } from '../prisma/prisma.service';
import {
  YIELD_DROP_CAUSES,
  dailyLabour,
  daysInMilk,
  mean,
  perHead,
  resolvePrice,
  shouldSuppressYieldDrop,
  stdev,
  weightedEffectivePrice,
  yieldDropImmediate,
  yieldDropSustained,
  type PriceSource,
} from './profit-rules';

const DAY = 24 * 60 * 60 * 1000;
const EXIT = ['SOLD', 'DEAD', 'CULLED'] as const;
const OTHER_EXCLUDE = ['FEED', 'MEDICINE', 'LABOR'] as const;

export interface ProfitabilityRow {
  animalId: string;
  shortNo: string | null;
  herdNumber: string | null;
  tag: string;
  name: string | null;
  photo: string | null;
  species: string;
  litres: number;
  litres30d: number;
  revenue: number;
  feedCost: number;
  healthCost: number;
  labourCost: number;
  otherCost: number;
  profit: number;
  feedCostPerLitre: number | null;
  costPerLitre: number | null;
  rank: number;
  trend: 'up' | 'down' | 'flat';
  bottomDecile: boolean;
}

export interface ProfitabilityResponse {
  items: ProfitabilityRow[];
  price: number;
  priceSource: PriceSource;
  headlineRate: number;
}

@Injectable()
export class ProfitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async recordPayment(user: RequestUser, input: PaymentStatementCreate, requestId?: string) {
    const litres = input.litres;
    const net = input.netPaid;
    const effective = litres > 0 ? net / litres : 0;
    const statement = await this.prisma.paymentStatement.create({
      data: {
        farmId: user.farmId,
        ...input,
        effectivePrice: effective,
      },
    });
    await this.prisma.cooperativePayment.upsert({
      where: {
        farmId_cooperativeId_periodStart: {
          farmId: user.farmId,
          cooperativeId: user.farmId,
          periodStart: input.periodStart,
        },
      },
      update: {
        periodEnd: input.periodEnd,
        litresSupplied: litres,
        basePriceNpr: input.baseRate * litres,
        fatBonusNpr: input.fatBonus,
        snfBonusNpr: input.snfBonus,
        qualityPenaltyNpr: input.sccPenalty,
        coolingDeductionNpr: input.coolingCharge,
        transportDeductionNpr: input.transport,
        membershipDeductionNpr: input.membership,
        loanRepaymentNpr: input.feedCredit,
        netPayableNpr: net,
        effectivePriceNpr: effective,
      },
      create: {
        farmId: user.farmId,
        cooperativeId: user.farmId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        litresSupplied: litres,
        basePriceNpr: input.baseRate * litres,
        fatBonusNpr: input.fatBonus,
        snfBonusNpr: input.snfBonus,
        qualityPenaltyNpr: input.sccPenalty,
        coolingDeductionNpr: input.coolingCharge,
        transportDeductionNpr: input.transport,
        membershipDeductionNpr: input.membership,
        loanRepaymentNpr: input.feedCredit,
        netPayableNpr: net,
        effectivePriceNpr: effective,
      },
    });
    await this.refreshFarmPrice(user.farmId);
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'payments.create',
      entityType: 'cooperativePayment',
      entityId: statement.id,
      requestId,
    });
    return statement;
  }

  async refreshFarmPrice(farmId: string): Promise<number | null> {
    const payments = await this.prisma.cooperativePayment.findMany({
      where: { farmId },
      orderBy: { periodEnd: 'desc' },
      take: 3,
    });
    const price = weightedEffectivePrice(
      payments.map((p) => ({
        netPayableNpr: Number(p.netPayableNpr),
        litresSupplied: Number(p.litresSupplied),
      })),
    );
    await this.prisma.farm.update({
      where: { id: farmId },
      data: { effectivePriceNpr: price },
    });
    return price;
  }

  async effectivePrice(farmId: string) {
    const farm = await this.prisma.farm.findUniqueOrThrow({ where: { id: farmId } });
    const resolved = resolvePrice({
      milkPriceNpr: Number(farm.milkPriceNpr),
      effectivePriceNpr: farm.effectivePriceNpr != null ? Number(farm.effectivePriceNpr) : null,
    });
    const latest = await this.prisma.cooperativePayment.findFirst({
      where: { farmId },
      orderBy: { periodEnd: 'desc' },
    });
    return {
      litres: latest ? Number(latest.litresSupplied) : 0,
      netPaid: latest ? Number(latest.netPayableNpr) : 0,
      effectivePrice: resolved.price,
      effectivePriceNpr: resolved.price,
      headlineRate: Number(farm.milkPriceNpr),
      periodEnd: latest?.periodEnd.toISOString() ?? null,
      source: resolved.source,
    };
  }

  async profitability(
    farmId: string,
    from = new Date(Date.now() - 30 * DAY),
    to = new Date(),
    sort: 'profit_desc' | 'profit_asc' = 'profit_desc',
  ): Promise<ProfitabilityResponse> {
    const farm = await this.prisma.farm.findUniqueOrThrow({ where: { id: farmId } });
    const resolved = resolvePrice({
      milkPriceNpr: Number(farm.milkPriceNpr),
      effectivePriceNpr: farm.effectivePriceNpr != null ? Number(farm.effectivePriceNpr) : null,
    });
    const herd = await this.prisma.animal.findMany({
      where: { farmId, deletedAt: null, status: { notIn: [...EXIT] } },
    });
    const activeCount = herd.length || 1;
    const [milk, feeds, healthEvents, healthRecords, expenses] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where: {
          farmId,
          type: 'MILK',
          destination: 'SOLD',
          entryDate: { gte: from, lte: to },
          animalId: { not: null },
        },
      }),
      this.prisma.feedRecord.findMany({
        where: { farmId, date: { gte: from, lte: to } },
      }),
      this.prisma.healthEvent.findMany({
        where: { farmId, eventAt: { gte: from, lte: to } },
      }),
      this.prisma.healthRecord.findMany({
        where: { farmId, performedAt: { gte: from, lte: to } },
      }),
      this.prisma.expense.findMany({
        where: {
          farmId,
          status: 'APPROVED',
          animalId: null,
          category: { notIn: [...OTHER_EXCLUDE] },
          expenseDate: { gte: from, lte: to },
        },
      }),
    ]);

    const windowDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
    const labourEach = dailyLabour(Number(farm.labourMonthlyNpr), activeCount) * windowDays;
    const herdFeed = feeds.filter((f) => !f.animalId).reduce((s, f) => s + Number(f.qty) * Number(f.costPerUnit), 0);
    const herdFeedEach = perHead(herdFeed, activeCount);
    const otherEach = perHead(
      expenses.reduce((s, e) => s + Number(e.amount), 0),
      activeCount,
    );

    const rows: ProfitabilityRow[] = herd.map((a) => {
      const litres = milk.filter((m) => m.animalId === a.id).reduce((s, m) => s + Number(m.quantity), 0);
      const animalFeed = feeds
        .filter((f) => f.animalId === a.id)
        .reduce((s, f) => s + Number(f.qty) * Number(f.costPerUnit), 0);
      const feedCost = animalFeed + herdFeedEach;
      const healthCost =
        healthEvents.filter((h) => h.animalId === a.id).reduce((s, h) => s + Number(h.totalCostNpr ?? 0), 0) +
        healthRecords.filter((h) => h.animalId === a.id).reduce((s, h) => s + Number(h.cost ?? 0), 0);
      const revenue = litres * resolved.price;
      const totalCost = feedCost + healthCost + labourEach + otherEach;
      const profit = revenue - totalCost;
      return {
        animalId: a.id,
        shortNo: a.herdNumber,
        herdNumber: a.herdNumber,
        tag: a.tag,
        name: a.name,
        photo: a.photoUrl,
        species: a.species,
        litres,
        litres30d: litres,
        revenue,
        feedCost,
        healthCost,
        labourCost: labourEach,
        otherCost: otherEach,
        profit,
        feedCostPerLitre: litres > 0 ? feedCost / litres : null,
        costPerLitre: litres > 0 ? totalCost / litres : null,
        rank: 0,
        trend: 'flat',
        bottomDecile: false,
      };
    });

    rows.sort((a, b) => (sort === 'profit_asc' ? a.profit - b.profit : b.profit - a.profit));
    rows.forEach((r, i) => {
      r.rank = i + 1;
    });
    const cut = Math.max(1, Math.ceil(rows.length * 0.1));
    for (let i = rows.length - cut; i < rows.length; i++) {
      if (rows[i]) rows[i]!.bottomDecile = true;
    }

    const mid = new Date((from.getTime() + to.getTime()) / 2);
    for (const row of rows) {
      const early = milk
        .filter((m) => m.animalId === row.animalId && m.entryDate < mid)
        .reduce((s, m) => s + Number(m.quantity), 0);
      const late = milk
        .filter((m) => m.animalId === row.animalId && m.entryDate >= mid)
        .reduce((s, m) => s + Number(m.quantity), 0);
      row.trend = late > early * 1.05 ? 'up' : late < early * 0.95 ? 'down' : 'flat';
    }

    return {
      items: rows,
      price: resolved.price,
      priceSource: resolved.source,
      headlineRate: Number(farm.milkPriceNpr),
    };
  }

  async generateDailyMetrics(farmId: string, now = new Date()): Promise<number> {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const next = new Date(day.getTime() + DAY);
    const farm = await this.prisma.farm.findUniqueOrThrow({ where: { id: farmId } });
    const resolved = resolvePrice({
      milkPriceNpr: Number(farm.milkPriceNpr),
      effectivePriceNpr: farm.effectivePriceNpr != null ? Number(farm.effectivePriceNpr) : null,
    });
    const herd = await this.prisma.animal.findMany({
      where: { farmId, deletedAt: null, status: { notIn: [...EXIT] } },
    });
    const activeCount = herd.length || 1;
    const [milk, feeds, healthEvents, expenses] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where: { farmId, type: 'MILK', destination: 'SOLD', entryDate: { gte: day, lt: next } },
      }),
      this.prisma.feedRecord.findMany({ where: { farmId, date: { gte: day, lt: next } } }),
      this.prisma.healthEvent.findMany({
        where: { farmId, eventAt: { gte: day, lt: next } },
      }),
      this.prisma.expense.findMany({
        where: {
          farmId,
          status: 'APPROVED',
          animalId: null,
          category: { notIn: [...OTHER_EXCLUDE] },
          expenseDate: { gte: day, lt: next },
        },
      }),
    ]);
    const labour = dailyLabour(Number(farm.labourMonthlyNpr), activeCount);
    const herdFeed = feeds.filter((f) => !f.animalId).reduce((s, f) => s + Number(f.qty) * Number(f.costPerUnit), 0);
    const other = perHead(
      expenses.reduce((s, e) => s + Number(e.amount), 0),
      activeCount,
    );
    const priorMilk = await this.prisma.productionEntry.findMany({
      where: {
        farmId,
        type: 'MILK',
        destination: 'SOLD',
        entryDate: { gte: new Date(day.getTime() - 10 * DAY), lt: day },
      },
    });

    let written = 0;
    for (const animal of herd) {
      const litres = milk.filter((m) => m.animalId === animal.id).reduce((s, m) => s + Number(m.quantity), 0);
      const animalFeed = feeds
        .filter((f) => f.animalId === animal.id)
        .reduce((s, f) => s + Number(f.qty) * Number(f.costPerUnit), 0);
      const feedCost = animalFeed + perHead(herdFeed, activeCount);
      const healthCost = healthEvents
        .filter((h) => h.animalId === animal.id)
        .reduce((s, h) => s + Number(h.totalCostNpr ?? 0), 0);
      const revenue = litres * resolved.price;
      const total = feedCost + healthCost + labour + other;
      const byDay = new Map<string, number>();
      for (const m of priorMilk.filter((p) => p.animalId === animal.id)) {
        const key = m.entryDate.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + Number(m.quantity));
      }
      const window = dailyTotalsInWindow(byDay, day, 8, 2);
      await this.prisma.dailyMetric.upsert({
        where: { animalId_date: { animalId: animal.id, date: day } },
        update: {
          litres,
          daysInMilk: daysInMilk(animal.lactationStartDate, now),
          feedCostNpr: feedCost,
          healthCostNpr: healthCost,
          allocatedLabourNpr: labour,
          otherCostNpr: other,
          revenueNpr: revenue,
          profitNpr: revenue - total,
          costPerLitreNpr: litres > 0 ? total / litres : null,
          feedCostPerLitreNpr: litres > 0 ? feedCost / litres : null,
          rolling7Mean: window.length ? mean(window) : null,
          rolling7Stdev: stdev(window),
        },
        create: {
          animalId: animal.id,
          farmId,
          date: day,
          litres,
          daysInMilk: daysInMilk(animal.lactationStartDate, now),
          feedCostNpr: feedCost,
          healthCostNpr: healthCost,
          allocatedLabourNpr: labour,
          otherCostNpr: other,
          revenueNpr: revenue,
          profitNpr: revenue - total,
          costPerLitreNpr: litres > 0 ? total / litres : null,
          feedCostPerLitreNpr: litres > 0 ? feedCost / litres : null,
          rolling7Mean: window.length ? mean(window) : null,
          rolling7Stdev: stdev(window),
        },
      });
      written += 1;
    }
    await this.yieldDropTasks(farmId, herd, now, day);
    return written;
  }

  private async yieldDropTasks(
    farmId: string,
    herd: Array<{
      id: string;
      tag: string;
      herdNumber: string | null;
      species: string;
      lactationStartDate: Date | null;
    }>,
    now: Date,
    day: Date,
  ): Promise<void> {
    const from = new Date(day.getTime() - 10 * DAY);
    const next = new Date(day.getTime() + DAY);
    const [milk, holds] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where: {
          farmId,
          type: 'MILK',
          animalId: { in: herd.map((a) => a.id) },
          entryDate: { gte: from, lt: next },
        },
      }),
      this.prisma.milkWithhold.findMany({
        where: { farmId, clearedAt: null, endDate: { gte: now } },
      }),
    ]);
    const holdSet = new Set(holds.map((h) => h.animalId));

    for (const animal of herd) {
      const byDay = new Map<string, number>();
      for (const m of milk.filter((p) => p.animalId === animal.id)) {
        const key = m.entryDate.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + Number(m.quantity));
      }
      const todayKey = day.toISOString().slice(0, 10);
      const todayTotal = byDay.get(todayKey) ?? 0;
      const window = dailyTotalsInWindow(byDay, day, 8, 2);
      const last3 = [1, 2, 3].map((n) => {
        const d = new Date(day.getTime() - n * DAY);
        return byDay.get(d.toISOString().slice(0, 10)) ?? 0;
      });
      const rolling = mean(window);
      if (
        shouldSuppressYieldDrop({
          species: animal.species,
          daysInMilk: daysInMilk(animal.lactationStartDate, now),
          withholdOpen: holdSet.has(animal.id),
          priorRecordDays: byDay.size,
        })
      ) {
        continue;
      }
      const high = yieldDropImmediate(todayTotal, rolling);
      const normal = !high && yieldDropSustained(last3, rolling);
      if (!high && !normal) continue;
      const label = animal.herdNumber ?? animal.tag;
      const causes = YIELD_DROP_CAUSES.join(', ');
      await ensureTask(this.prisma, {
        farmId,
        animalId: animal.id,
        type: 'YIELD_DROP',
        titleEn: `${label} yield dropped — check ${causes}`,
        titleNp: `${label} दूध घट्यो — पहिले मास्टाइटिस हेर्नुहोस्`,
        dueAt: now,
        priority: high ? 'HIGH' : 'NORMAL',
        sourceRefType: 'yieldDrop',
        sourceRefId: animal.id,
      });
    }
  }
}

function dailyTotalsInWindow(
  byDay: Map<string, number>,
  today: Date,
  fromDaysAgo: number,
  toDaysAgo: number,
): number[] {
  const out: number[] = [];
  for (let n = fromDaysAgo; n >= toDaysAgo; n--) {
    const d = new Date(today.getTime() - n * DAY);
    const key = d.toISOString().slice(0, 10);
    if (byDay.has(key)) out.push(byDay.get(key)!);
  }
  return out;
}
