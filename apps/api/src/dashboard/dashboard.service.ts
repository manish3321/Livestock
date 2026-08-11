import { Injectable } from '@nestjs/common';
import { inventoryAlertLevel } from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardAlertItem {
  id: string;
  title: string;
  detail?: string | null;
  dueAt?: string | null;
}

export interface DashboardSummary {
  animalCount: number;
  /** Omitted when caller lacks finance:read */
  revenueTotal?: number | null;
  expenseTotal?: number | null;
  netProfit?: number | null;
  financeTrend?: Array<{ month: string; revenue: number; expenses: number }>;
  speciesDistribution: Array<{ species: string; count: number }>;
  alerts: {
    healthOverdue: DashboardAlertItem[];
    inventoryCritical: DashboardAlertItem[];
    pendingApprovals: DashboardAlertItem[];
    inventoryExpiring?: DashboardAlertItem[];
    unpaidRevenue?: DashboardAlertItem[];
  };
  recentActivity: Array<{
    id: string;
    kind: string;
    summary: string;
    createdAt: string;
  }>;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: RequestUser): Promise<DashboardSummary> {
    const farmId = user.farmId;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const canFinance = user.permissions.includes('finance:read');

    const [
      batches,
      revenueAgg,
      expenseAgg,
      healthOverdue,
      inventory,
      pendingApprovals,
      recent,
    ] = await Promise.all([
      this.prisma.herdBatch.findMany({
        where: { farmId, deletedAt: null },
        select: { kind: true, category: true, currentCount: true, deadCount: true },
      }),
      canFinance
        ? this.prisma.revenue.aggregate({
            where: { farmId, revenueDate: { gte: monthStart } },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
      canFinance
        ? this.prisma.expense.aggregate({
            where: {
              farmId,
              expenseDate: { gte: monthStart },
              status: 'APPROVED',
            },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
      this.prisma.healthRecord.findMany({
        where: { farmId, nextDueAt: { lt: now } },
        orderBy: { nextDueAt: 'asc' },
        take: 10,
        select: { id: true, title: true, type: true, nextDueAt: true },
      }),
      this.prisma.inventoryItem.findMany({
        where: { farmId, deletedAt: null },
        select: {
          id: true,
          name: true,
          currentStock: true,
          minimumStock: true,
          unit: true,
        },
      }),
      this.prisma.expense.findMany({
        where: { farmId, status: { in: ['PENDING', 'ESCALATED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          description: true,
          category: true,
          amount: true,
          status: true,
        },
      }),
      this.prisma.auditEvent.findMany({
        where: { farmId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const speciesCounts: Record<string, number> = {};
    let animalCount = 0;
    for (const b of batches) {
      animalCount += b.currentCount;
      const key = `${b.kind}:${b.category}`;
      speciesCounts[key] = (speciesCounts[key] ?? 0) + b.currentCount;
    }
    const speciesDistribution = Object.entries(speciesCounts)
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count);

    const inventoryCritical = inventory
      .filter(
        (i) =>
          inventoryAlertLevel(Number(i.currentStock), Number(i.minimumStock)) ===
          'CRITICAL',
      )
      .map((i) => ({
        id: i.id,
        title: i.name,
        detail: `${Number(i.currentStock)} ${i.unit} (min ${Number(i.minimumStock)})`,
        dueAt: null as string | null,
      }));

    const monthRevenue = Number(revenueAgg?._sum.amount ?? 0);
    const monthExpenses = Number(expenseAgg?._sum.amount ?? 0);

    let financeTrend: Array<{ month: string; revenue: number; expenses: number }> | undefined;
    if (canFinance) {
      financeTrend = [];
      for (let i = 5; i >= 0; i--) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
        const [rev, exp] = await Promise.all([
          this.prisma.revenue.aggregate({
            where: { farmId, revenueDate: { gte: start, lt: end } },
            _sum: { amount: true },
          }),
          this.prisma.expense.aggregate({
            where: {
              farmId,
              expenseDate: { gte: start, lt: end },
              status: 'APPROVED',
            },
            _sum: { amount: true },
          }),
        ]);
        financeTrend.push({
          month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
          revenue: Number(rev._sum.amount ?? 0),
          expenses: Number(exp._sum.amount ?? 0),
        });
      }
    }

    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [expiring, unpaidRev] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          farmId,
          deletedAt: null,
          expiryDate: { gte: now, lte: in30 },
        },
        take: 10,
        select: { id: true, name: true, expiryDate: true },
      }),
      canFinance
        ? this.prisma.revenue.findMany({
            where: { farmId, paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
            orderBy: { revenueDate: 'desc' },
            take: 10,
            select: {
              id: true,
              invoiceNumber: true,
              amount: true,
              buyerName: true,
              paymentStatus: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      animalCount,
      ...(canFinance
        ? {
            revenueTotal: monthRevenue,
            expenseTotal: monthExpenses,
            netProfit: monthRevenue - monthExpenses,
            financeTrend,
          }
        : {
            revenueTotal: null,
            expenseTotal: null,
            netProfit: null,
          }),
      speciesDistribution,
      alerts: {
        healthOverdue: healthOverdue.map((h) => ({
          id: h.id,
          title: h.title,
          detail: h.type,
          dueAt: h.nextDueAt?.toISOString() ?? null,
        })),
        inventoryCritical,
        pendingApprovals: pendingApprovals.map((e) => ({
          id: e.id,
          title: e.description,
          detail: `${e.category} · NPR ${Number(e.amount)} · ${e.status}`,
          dueAt: null,
        })),
        inventoryExpiring: expiring.map((i) => ({
          id: i.id,
          title: i.name,
          detail: 'Expires soon',
          dueAt: i.expiryDate?.toISOString() ?? null,
        })),
        unpaidRevenue: unpaidRev.map((r) => ({
          id: r.id,
          title: r.invoiceNumber,
          detail: `NPR ${Number(r.amount)} · ${r.paymentStatus}${r.buyerName ? ` · ${r.buyerName}` : ''}`,
          dueAt: null,
        })),
      },
      recentActivity: recent.map((e) => ({
        id: e.id,
        kind: e.action,
        summary: [e.entityType, e.entityId].filter(Boolean).join(' ') || e.action,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}
