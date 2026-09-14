import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CooperativeReportQuery,
  DailyReportQuery,
  InsuranceClaimQuery,
  MonthlyReportQuery,
  ReportQuery,
  VaccinationProofQuery,
} from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { budgetVariance, nepalSeason } from '../expenses/expense-rules';
import { groupCooperativeByDay, monthBoundsUtc, nepalDayBoundsUtc } from './report-rules';

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

  async periodPack(
    user: RequestUser,
    kind: 'daily' | 'weekly' | 'quarterly' | 'annual',
    date?: Date,
  ) {
    const { from, to, label } = periodBounds(kind, date ?? new Date());
    const [overview, health, production] = await Promise.all([
      this.farmOverview(user, { from, to }),
      this.healthSummary(user, { from, to }),
      this.prisma.productionEntry.groupBy({
        by: ['type'],
        where: { farmId: user.farmId, entryDate: { gte: from, lt: to } },
        _sum: { quantity: true },
        _count: true,
      }),
    ]);
    return {
      kind,
      label,
      from: from.toISOString(),
      to: to.toISOString(),
      overview,
      health,
      production: production.map((p) => ({
        type: p.type,
        entries: p._count,
        quantity: Number(p._sum.quantity ?? 0),
      })),
    };
  }

  async periodPackCsv(
    user: RequestUser,
    kind: 'daily' | 'weekly' | 'quarterly' | 'annual',
    date?: Date,
  ): Promise<string> {
    const pack = await this.periodPack(user, kind, date);
    const finance = pack.overview.finance as {
      totalRevenue: number;
      totalExpenses: number;
      netProfit: number;
    };
    const lines = [
      ['kind', pack.kind].join(','),
      ['label', csv(pack.label)].join(','),
      ['from', pack.from].join(','),
      ['to', pack.to].join(','),
      ['revenue', finance.totalRevenue].join(','),
      ['expenses', finance.totalExpenses].join(','),
      ['netProfit', finance.netProfit].join(','),
      '',
      'productionType,entries,quantity',
      ...pack.production.map((p) => [p.type, p.entries, p.quantity].join(',')),
    ];
    return lines.join('\n');
  }

  async daily(user: RequestUser, query: DailyReportQuery) {
    const date = query.date ?? new Date();
    const { from, to } = nepalDayBoundsUtc(date);
    const farmId = user.farmId;
    const [
      milk,
      treatments,
      heats,
      services,
      calvings,
      tasksDone,
      tasksOpen,
    ] = await Promise.all([
      this.prisma.productionEntry.findMany({
        where: { farmId, type: 'MILK', entryDate: { gte: from, lt: to } },
        select: {
          quantity: true,
          destination: true,
          session: true,
          animal: { select: { herdNumber: true, tag: true } },
        },
      }),
      this.prisma.healthEvent.findMany({
        where: { farmId, eventAt: { gte: from, lt: to }, deletedAt: null },
        select: {
          type: true,
          eventAt: true,
          provisionalDiagnosis: true,
          animal: { select: { herdNumber: true, tag: true } },
        },
      }),
      this.prisma.heatEvent.findMany({
        where: { farmId, observedAt: { gte: from, lt: to } },
        select: { observedAt: true, animal: { select: { herdNumber: true, tag: true } } },
      }),
      this.prisma.breedingService.findMany({
        where: { farmId, serviceDate: { gte: from, lt: to } },
        select: { serviceDate: true, animal: { select: { herdNumber: true, tag: true } } },
      }),
      this.prisma.calvingEvent.findMany({
        where: { farmId, calvingAt: { gte: from, lt: to } },
        select: { calvingAt: true, dam: { select: { herdNumber: true, tag: true } } },
      }),
      this.prisma.task.findMany({
        where: {
          farmId,
          deletedAt: null,
          status: 'DONE',
          completedAt: { gte: from, lt: to },
        },
        select: { type: true, titleEn: true, titleNp: true },
      }),
      this.prisma.task.findMany({
        where: {
          farmId,
          deletedAt: null,
          status: { in: ['PENDING', 'SNOOZED'] },
          dueAt: { lt: to },
        },
        select: { type: true, titleEn: true, titleNp: true, dueAt: true, priority: true },
      }),
    ]);

    const litres = milk.reduce((s, m) => s + Number(m.quantity), 0);
    const sold = milk
      .filter((m) => m.destination === 'SOLD')
      .reduce((s, m) => s + Number(m.quantity), 0);

    return {
      date: from.toISOString().slice(0, 10),
      from: from.toISOString(),
      to: to.toISOString(),
      milk: {
        entries: milk.length,
        litres,
        soldLitres: sold,
        rows: milk.map((m) => ({
          herdNumber: m.animal?.herdNumber ?? m.animal?.tag ?? null,
          litres: Number(m.quantity),
          destination: m.destination,
          session: m.session,
        })),
      },
      treatments: treatments.map((t) => ({
        type: t.type,
        at: t.eventAt.toISOString(),
        diagnosis: t.provisionalDiagnosis,
        herdNumber: t.animal.herdNumber ?? t.animal.tag,
      })),
      breeding: {
        heats: heats.length,
        services: services.length,
        calvings: calvings.length,
      },
      tasksDone: tasksDone.length,
      tasksMissed: tasksOpen.length,
      tasksOpen: tasksOpen.map((t) => ({
        type: t.type,
        titleEn: t.titleEn,
        dueAt: t.dueAt.toISOString(),
        priority: t.priority,
      })),
    };
  }

  async monthly(user: RequestUser, query: MonthlyReportQuery) {
    const { from, to } = monthBoundsUtc(query.year, query.month);
    const prior = monthBoundsUtc(query.year - 1, query.month);
    const farmId = user.farmId;
    const [
      milkNow,
      milkPrior,
      revenueNow,
      revenuePrior,
      expensesNow,
      expensesPrior,
      budgets,
      health,
      heats,
      calvings,
      feed,
      herd,
    ] = await Promise.all([
      this.prisma.productionEntry.aggregate({
        where: { farmId, type: 'MILK', entryDate: { gte: from, lt: to } },
        _sum: { quantity: true },
      }),
      this.prisma.productionEntry.aggregate({
        where: { farmId, type: 'MILK', entryDate: { gte: prior.from, lt: prior.to } },
        _sum: { quantity: true },
      }),
      this.prisma.revenue.aggregate({
        where: { farmId, revenueDate: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
      this.prisma.revenue.aggregate({
        where: { farmId, revenueDate: { gte: prior.from, lt: prior.to } },
        _sum: { amount: true },
      }),
      this.prisma.expense.findMany({
        where: { farmId, status: 'APPROVED', expenseDate: { gte: from, lt: to } },
        select: { category: true, amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { farmId, status: 'APPROVED', expenseDate: { gte: prior.from, lt: prior.to } },
        _sum: { amount: true },
      }),
      this.prisma.expenseBudget.findMany({
        where: { farmId, year: query.year, month: query.month },
      }),
      this.prisma.healthEvent.count({
        where: { farmId, eventAt: { gte: from, lt: to }, deletedAt: null },
      }),
      this.prisma.heatEvent.count({
        where: { farmId, observedAt: { gte: from, lt: to } },
      }),
      this.prisma.calvingEvent.count({
        where: { farmId, calvingAt: { gte: from, lt: to } },
      }),
      this.prisma.feedRecord.aggregate({
        where: { farmId, date: { gte: from, lt: to } },
        _sum: { qty: true },
      }),
      this.prisma.animal.groupBy({
        by: ['species', 'status'],
        where: { farmId, deletedAt: null },
        _count: true,
      }),
    ]);

    const actualByCat = new Map<string, number>();
    for (const e of expensesNow) {
      actualByCat.set(e.category, (actualByCat.get(e.category) ?? 0) + Number(e.amount));
    }
    const budgetRows = budgets.map((b) => {
      const actual = actualByCat.get(b.category) ?? 0;
      const amount = Number(b.amount);
      return {
        category: b.category,
        budget: amount,
        actual,
        ...budgetVariance(actual, amount),
      };
    });
    const totalExpenses = [...actualByCat.values()].reduce((s, n) => s + n, 0);
    const totalRevenue = Number(revenueNow._sum.amount ?? 0);

    return {
      year: query.year,
      month: query.month,
      season: nepalSeason(query.month),
      from: from.toISOString(),
      to: to.toISOString(),
      milk: {
        litres: Number(milkNow._sum.quantity ?? 0),
        litresLastYear: Number(milkPrior._sum.quantity ?? 0),
      },
      money: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        revenueLastYear: Number(revenuePrior._sum.amount ?? 0),
        expensesLastYear: Number(expensesPrior._sum.amount ?? 0),
        budget: budgetRows,
        alerts: budgetRows.filter((r) => r.alert === 'OVER'),
      },
      healthEvents: health,
      breeding: { heats, calvings },
      feedKg: Number(feed._sum.qty ?? 0),
      herd: herd.map((h) => ({
        species: h.species,
        status: h.status,
        count: h._count,
      })),
    };
  }

  async cooperative(user: RequestUser, query: CooperativeReportQuery) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);
    const deliveries = await this.prisma.milkDelivery.findMany({
      where: {
        farmId: user.farmId,
        tank: { round: { roundDate: { gte: from, lte: to } } },
      },
      include: { tank: { include: { round: { select: { roundDate: true, session: true } } } } },
    });
    const days = groupCooperativeByDay(
      deliveries.map((d) => ({
        date: d.tank.round.roundDate,
        litresSent: Number(d.litresSent),
        litresAccepted: d.litresAccepted != null ? Number(d.litresAccepted) : null,
        litresRejected: d.litresRejected != null ? Number(d.litresRejected) : null,
        fat: d.centreFat != null ? Number(d.centreFat) : d.tank.compositeFat != null ? Number(d.tank.compositeFat) : null,
        snf: d.centreSnf != null ? Number(d.centreSnf) : d.tank.compositeSnf != null ? Number(d.tank.compositeSnf) : null,
        scc: d.centreScc,
      })),
    );
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      totals: {
        litresSent: days.reduce((s, d) => s + d.litresSent, 0),
        litresAccepted: days.reduce((s, d) => s + d.litresAccepted, 0),
        litresRejected: days.reduce((s, d) => s + d.litresRejected, 0),
      },
    };
  }

  async vaccinationProof(user: RequestUser, query: VaccinationProofQuery) {
    const rows = await this.prisma.vaccinationRecord.findMany({
      where: {
        farmId: user.farmId,
        ...(query.disease ? { disease: query.disease } : {}),
        ...(query.from || query.to
          ? {
              administeredAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      include: {
        animal: { select: { tag: true, herdNumber: true, name: true, species: true } },
      },
      orderBy: { administeredAt: 'desc' },
    });
    return {
      from: query.from?.toISOString() ?? null,
      to: query.to?.toISOString() ?? null,
      disease: query.disease ?? null,
      count: rows.length,
      items: rows.map((r) => ({
        animalTag: r.animal.tag,
        herdNumber: r.animal.herdNumber,
        name: r.animal.name,
        species: r.animal.species,
        disease: r.disease,
        lotNumber: r.lotNumber,
        administeredAt: r.administeredAt.toISOString(),
        administeredBy: r.administeredBy,
      })),
    };
  }

  async insuranceClaim(user: RequestUser, query: InsuranceClaimQuery) {
    const row = await this.prisma.mortalityRecord.findFirst({
      where: { farmId: user.farmId, animalId: query.animalId },
      include: {
        animal: {
          select: {
            tag: true,
            herdNumber: true,
            name: true,
            species: true,
            breed: true,
            gender: true,
            dateOfBirth: true,
            status: true,
            purchaseCost: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'MORTALITY_NOT_FOUND',
        message: 'No death record for this animal',
      });
    }
    return {
      animal: {
        tag: row.animal.tag,
        herdNumber: row.animal.herdNumber,
        name: row.animal.name,
        species: row.animal.species,
        breed: row.animal.breed,
        gender: row.animal.gender,
        dateOfBirth: row.animal.dateOfBirth?.toISOString() ?? null,
        status: row.animal.status,
        purchaseCost: row.animal.purchaseCost != null ? Number(row.animal.purchaseCost) : null,
      },
      deathAt: row.deathAt.toISOString(),
      causeCategory: row.causeCategory,
      suspectedDisease: row.suspectedDisease,
      postMortemDone: row.postMortemDone,
      postMortemFindings: row.postMortemFindings,
      disposalMethod: row.disposalMethod,
      estimatedLossNpr: row.estimatedLossNpr != null ? Number(row.estimatedLossNpr) : null,
      insuranceClaimFiled: row.insuranceClaimFiled,
      insuranceClaimStatus: row.insuranceClaimStatus,
    };
  }

  async vetHistory(user: RequestUser, animalId: string) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId, farmId: user.farmId, deletedAt: null },
      select: {
        tag: true,
        herdNumber: true,
        name: true,
        species: true,
        breed: true,
        gender: true,
        status: true,
        isPregnant: true,
      },
    });
    if (!animal) {
      throw new NotFoundException({
        code: 'ANIMAL_NOT_FOUND',
        message: 'Animal not found',
      });
    }
    const [events, vaccinations, udder, withholds] = await Promise.all([
      this.prisma.healthEvent.findMany({
        where: { farmId: user.farmId, animalId, deletedAt: null },
        orderBy: { eventAt: 'desc' },
        take: 50,
        include: { medications: true },
      }),
      this.prisma.vaccinationRecord.findMany({
        where: { farmId: user.farmId, animalId },
        orderBy: { administeredAt: 'desc' },
      }),
      this.prisma.udderCheck.findMany({
        where: { farmId: user.farmId, animalId },
        orderBy: { checkDate: 'desc' },
        take: 20,
      }),
      this.prisma.milkWithhold.findMany({
        where: { farmId: user.farmId, animalId },
        orderBy: { startDate: 'desc' },
      }),
    ]);
    return {
      animal,
      events: events.map((e) => ({
        type: e.type,
        eventAt: e.eventAt.toISOString(),
        diagnosis: e.finalDiagnosis ?? e.provisionalDiagnosis,
        outcome: e.outcome,
        costNpr: e.totalCostNpr != null ? Number(e.totalCostNpr) : null,
        medications: e.medications.map((m) => ({
          lotNumber: m.lotNumber,
          doseAmount: Number(m.doseAmount),
          route: m.route,
        })),
      })),
      vaccinations: vaccinations.map((v) => ({
        disease: v.disease,
        lotNumber: v.lotNumber,
        administeredAt: v.administeredAt.toISOString(),
      })),
      udder: udder.map((u) => ({
        checkDate: u.checkDate.toISOString(),
        classification: u.classification,
        appearance: u.appearance,
      })),
      withholds: withholds.map((w) => ({
        drugName: w.drugName,
        startDate: w.startDate.toISOString(),
        endDate: w.endDate.toISOString(),
        clearedAt: w.clearedAt?.toISOString() ?? null,
      })),
    };
  }
}

function rangeFilter(query: ReportQuery): { gte?: Date; lte?: Date } | undefined {
  if (!query.from && !query.to) return undefined;
  return {
    ...(query.from ? { gte: query.from } : {}),
    ...(query.to ? { lte: query.to } : {}),
  };
}

function periodBounds(
  kind: 'daily' | 'weekly' | 'quarterly' | 'annual',
  date: Date,
): { from: Date; to: Date; label: string } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  if (kind === 'daily') {
    const from = new Date(Date.UTC(y, m, d));
    const to = new Date(Date.UTC(y, m, d + 1));
    return { from, to, label: from.toISOString().slice(0, 10) };
  }
  if (kind === 'weekly') {
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const from = new Date(Date.UTC(y, m, d + mondayOffset));
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 7));
    return { from, to, label: `Week of ${from.toISOString().slice(0, 10)}` };
  }
  if (kind === 'quarterly') {
    const q = Math.floor(m / 3);
    const from = new Date(Date.UTC(y, q * 3, 1));
    const to = new Date(Date.UTC(y, q * 3 + 3, 1));
    return { from, to, label: `Q${q + 1} ${y}` };
  }
  return {
    from: new Date(Date.UTC(y, 0, 1)),
    to: new Date(Date.UTC(y + 1, 0, 1)),
    label: String(y),
  };
}

function csv(value: string | null | undefined): string {
  if (!value) return '';
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
