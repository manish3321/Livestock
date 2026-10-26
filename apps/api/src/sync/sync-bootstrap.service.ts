import { Injectable, Logger } from '@nestjs/common';
import type { SyncBootstrapResponse } from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { AnimalsService } from '../animals/animals.service';
import { BatchesService } from '../batches/batches.service';
import { BreedingService } from '../breeding/breeding.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FarmMembersService } from '../farms/farm-members.service';
import { FeedService } from '../feed/feed.service';
import { HealthRecordsService } from '../health-records/health-records.service';
import { InventoryService } from '../inventory/inventory.service';
import { PnlService } from '../pnl/pnl.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionService } from '../production/production.service';
import { ReportsService } from '../reports/reports.service';
import { RevenueService } from '../revenue/revenue.service';
import { TasksService } from '../tasks/tasks.service';

const PAGE = { page: 1, pageSize: 100, order: 'asc' as const };

/**
 * Builds the offline module snapshot the phone used to fetch as 18 separate routes.
 * Each piece runs in parallel; permission gaps and failures become null.
 */
@Injectable()
export class SyncBootstrapService {
  private readonly log = new Logger(SyncBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly animals: AnimalsService,
    private readonly batches: BatchesService,
    private readonly expenses: ExpensesService,
    private readonly revenue: RevenueService,
    private readonly inventory: InventoryService,
    private readonly health: HealthRecordsService,
    private readonly breeding: BreedingService,
    private readonly production: ProductionService,
    private readonly feed: FeedService,
    private readonly pnl: PnlService,
    private readonly reports: ReportsService,
    private readonly members: FarmMembersService,
    private readonly tasks: TasksService,
  ) {}

  async snapshot(user: RequestUser): Promise<SyncBootstrapResponse> {
    const dueBefore = new Date(Date.now() + 30 * 864e5);
    const can = (perm: string) => user.permissions.includes(perm as never);

    const entries: Array<[string, () => Promise<unknown>]> = [
      ['dashboard', () => this.dashboard.summary(user)],
      [
        'animals',
        () =>
          can('animals:read')
            ? this.animals.list(user, { ...PAGE, sort: 'tag', order: 'asc' })
            : Promise.resolve(null),
      ],
      [
        'batches',
        () =>
          can('animals:read') ? this.batches.list(user, { ...PAGE }) : Promise.resolve(null),
      ],
      [
        'groups',
        () =>
          can('animals:read')
            ? this.batches.list(user, { ...PAGE, kind: 'POULTRY' })
            : Promise.resolve(null),
      ],
      [
        'fish',
        () =>
          can('animals:read')
            ? this.batches.list(user, { ...PAGE, kind: 'FISH' })
            : Promise.resolve(null),
      ],
      [
        'expenses',
        () => (can('expenses:read') ? this.expenses.list(user, { ...PAGE }) : Promise.resolve(null)),
      ],
      [
        'revenue',
        () => (can('revenue:read') ? this.revenue.list(user, { ...PAGE }) : Promise.resolve(null)),
      ],
      [
        'inventory',
        () =>
          can('inventory:read')
            ? this.inventory.list(user, { ...PAGE })
            : Promise.resolve(null),
      ],
      [
        'health',
        () =>
          can('health:read')
            ? this.health.list(user, { ...PAGE, due: 'all' })
            : Promise.resolve(null),
      ],
      [
        'breeding',
        () =>
          can('breeding:read') ? this.breeding.list(user, { ...PAGE }) : Promise.resolve(null),
      ],
      [
        'production',
        () =>
          can('production:read')
            ? this.production.list(user, { ...PAGE })
            : Promise.resolve(null),
      ],
      [
        'feed',
        () => (can('feed:read') ? this.feed.list(user, { ...PAGE }) : Promise.resolve(null)),
      ],
      [
        'pnl',
        () =>
          can('finance:read')
            ? this.pnl.get(user, { period: 'monthly' })
            : Promise.resolve(null),
      ],
      [
        'reports',
        () => (can('reports:read') ? this.reports.farmOverview(user, {}) : Promise.resolve(null)),
      ],
      [
        'audit',
        () =>
          can('audit:read')
            ? this.listAudit(user.farmId, 50)
            : Promise.resolve(null),
      ],
      [
        'members',
        () => (can('users:manage') ? this.members.list(user) : Promise.resolve(null)),
      ],
      [
        'cohort',
        () => (can('animals:read') ? this.animals.cohort(user) : Promise.resolve(null)),
      ],
      [
        'tasks',
        () =>
          can('tasks:read')
            ? this.tasks.list(user, { page: 1, pageSize: 100, dueBefore })
            : Promise.resolve(null),
      ],
    ];

    const settled = await Promise.all(
      entries.map(async ([key, run]) => {
        try {
          return [key, await run()] as const;
        } catch (err) {
          this.log.warn(`bootstrap ${key} failed: ${(err as Error).message}`);
          return [key, null] as const;
        }
      }),
    );

    return {
      fetchedAt: new Date().toISOString(),
      modules: Object.fromEntries(settled),
    };
  }

  private async listAudit(farmId: string, pageSize: number) {
    const where = { farmId };
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, page: 1, pageSize, total };
  }
}
