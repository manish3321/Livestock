import { Injectable } from '@nestjs/common';
import type { ReportQuery } from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async farmOverview(user: RequestUser, query: ReportQuery) {
    const farmId = user.farmId;
    const dateFilter = rangeFilter(query);

    const [
      farm,
      animalCount,
      groupCount,
      fishBatchCount,
      revenue,
      expenses,
      production,
    ] = await Promise.all([
      this.prisma.farm.findUniqueOrThrow({ where: { id: farmId } }),
      this.prisma.animal.count({ where: { farmId, deletedAt: null } }),
      this.prisma.animalGroup.count({ where: { farmId, deletedAt: null } }),
      this.prisma.fishBatch.count({ where: { farmId, deletedAt: null } }),
      this.prisma.revenue.aggregate({
        where: { farmId, ...(dateFilter ? { revenueDate: dateFilter } : {}) },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: {
          farmId,
          status: 'APPROVED',
          ...(dateFilter ? { expenseDate: dateFilter } : {}),
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.productionEntry.groupBy({
        by: ['type'],
        where: {
          farmId,
          ...(dateFilter ? { entryDate: dateFilter } : {}),
        },
        _sum: { quantity: true },
        _count: true,
      }),
    ]);

    const totalRevenue = Number(revenue._sum.amount ?? 0);
    const totalExpenses = Number(expenses._sum.amount ?? 0);

    return {
      farm: {
        id: farm.id,
        name: farm.name,
        location: farm.location,
        currency: farm.currency,
      },
      counts: { animals: animalCount, groups: groupCount, fishBatches: fishBatchCount },
      finance: {
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        revenueEntries: revenue._count,
        expenseEntries: expenses._count,
      },
      production: production.map((p) => ({
        type: p.type,
        entries: p._count,
        quantity: Number(p._sum.quantity ?? 0),
      })),
      from: query.from?.toISOString() ?? null,
      to: query.to?.toISOString() ?? null,
    };
  }

  async animalInventory(user: RequestUser, query: ReportQuery) {
    const animals = await this.prisma.animal.findMany({
      where: {
        farmId: user.farmId,
        deletedAt: null,
        ...(query.species ? { species: query.species as never } : {}),
      },
      orderBy: { tag: 'asc' },
      include: { weights: { orderBy: { recordedAt: 'desc' }, take: 1 } },
    });

    const bySpecies: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const a of animals) {
      bySpecies[a.species] = (bySpecies[a.species] ?? 0) + 1;
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    }

    return {
      total: animals.length,
      bySpecies,
      byStatus,
      items: animals.map((a) => ({
        id: a.id,
        tag: a.tag,
        name: a.name,
        species: a.species,
        breed: a.breed,
        gender: a.gender,
        status: a.status,
        currentWeightKg: a.weights[0] ? Number(a.weights[0].weightKg) : null,
      })),
    };
  }

  async animalInventoryCsv(user: RequestUser, query: ReportQuery): Promise<string> {
    const report = await this.animalInventory(user, query);
    const header = [
      'tag',
      'name',
      'species',
      'breed',
      'gender',
      'status',
      'currentWeightKg',
    ].join(',');
    const lines = report.items.map((a) =>
      [
        a.tag,
        csv(a.name),
        a.species,
        csv(a.breed),
        a.gender,
        a.status,
        a.currentWeightKg ?? '',
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  async healthSummary(user: RequestUser, query: ReportQuery) {
    const farmId = user.farmId;
    const now = new Date();
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 7);
    const dateFilter = rangeFilter(query);

    const [byType, overdue, dueSoon, recent] = await Promise.all([
      this.prisma.healthRecord.groupBy({
        by: ['type'],
        where: {
          farmId,
          ...(dateFilter ? { performedAt: dateFilter } : {}),
        },
        _count: true,
      }),
      this.prisma.healthRecord.count({
        where: { farmId, nextDueAt: { lt: now } },
      }),
      this.prisma.healthRecord.count({
        where: { farmId, nextDueAt: { gte: now, lte: soon } },
      }),
      this.prisma.healthRecord.findMany({
        where: {
          farmId,
          ...(dateFilter ? { performedAt: dateFilter } : {}),
        },
        orderBy: { performedAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      byType: byType.map((t) => ({ type: t.type, count: t._count })),
      overdue,
      dueSoon,
      recent: recent.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        animalId: r.animalId,
        groupId: r.groupId,
        performedAt: r.performedAt.toISOString(),
        nextDueAt: r.nextDueAt?.toISOString() ?? null,
      })),
    };
  }

  async herdMonthly(
    user: RequestUser,
    year: number,
    month: number,
    kind?: 'LIVESTOCK' | 'POULTRY' | 'FISH',
  ) {
    const farmId = user.farmId;
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const batches = await this.prisma.herdBatch.findMany({
      where: {
        farmId,
        deletedAt: null,
        ...(kind ? { kind } : {}),
      },
      orderBy: [{ kind: 'asc' }, { category: 'asc' }, { name: 'asc' }],
      include: {
        illness: {
          where: { occurredAt: { gte: from, lt: to } },
        },
        mortality: {
          where: { occurredAt: { gte: from, lt: to } },
        },
      },
    });

    const rows = batches.map((b) => {
      const sickByCondition: Record<string, number> = {};
      let sickLogged = 0;
      for (const e of b.illness) {
        sickByCondition[e.condition] = (sickByCondition[e.condition] ?? 0) + e.count;
        sickLogged += e.count;
      }
      const diedThisMonth = b.mortality.reduce((s, m) => s + m.count, 0);
      return {
        id: b.id,
        kind: b.kind,
        category: b.category,
        name: b.name,
        ageFromMonths: b.ageFromMonths,
        ageToMonths: b.ageToMonths,
        initialCount: b.initialCount,
        currentCount: b.currentCount,
        deadCount: b.deadCount,
        diedThisMonth,
        sickLoggedThisMonth: sickLogged,
        sickByCondition,
      };
    });

    return {
      year,
      month,
      kind: kind ?? 'ALL',
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        batches: rows.length,
        currentHeadcount: rows.reduce((s, r) => s + r.currentCount, 0),
        deadTotal: rows.reduce((s, r) => s + r.deadCount, 0),
        diedThisMonth: rows.reduce((s, r) => s + r.diedThisMonth, 0),
        sickLoggedThisMonth: rows.reduce((s, r) => s + r.sickLoggedThisMonth, 0),
      },
      rows,
    };
  }

  async herdMonthlyCsv(
    user: RequestUser,
    year: number,
    month: number,
    kind?: 'LIVESTOCK' | 'POULTRY' | 'FISH',
  ): Promise<string> {
    const report = await this.herdMonthly(user, year, month, kind);
    const header = [
      'kind',
      'category',
      'batchName',
      'ageFromMonths',
      'ageToMonths',
      'initialCount',
      'currentCount',
      'deadCount',
      'diedThisMonth',
      'sickLoggedThisMonth',
      'sickByCondition',
    ].join(',');
    const lines = report.rows.map((r) =>
      [
        r.kind,
        r.category,
        csv(r.name),
        r.ageFromMonths ?? '',
        r.ageToMonths ?? '',
        r.initialCount,
        r.currentCount,
        r.deadCount,
        r.diedThisMonth,
        r.sickLoggedThisMonth,
        csv(
          Object.entries(r.sickByCondition)
            .map(([k, v]) => `${k}:${v}`)
            .join(';'),
        ),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }
}

function rangeFilter(query: ReportQuery): { gte?: Date; lte?: Date } | undefined {
  if (!query.from && !query.to) return undefined;
  return {
    ...(query.from ? { gte: query.from } : {}),
    ...(query.to ? { lte: query.to } : {}),
  };
}

function csv(value: string | null | undefined): string {
  if (!value) return '';
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
