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

const PAGE_SIZE = 100;
const PAGE = { page: 1, pageSize: PAGE_SIZE, order: 'asc' as const };
/** Hard stop per module so a runaway total can't hang bootstrap (20 x 100 = 2000 rows). */
export const MAX_BOOTSTRAP_PAGES = 20;

interface PagedResult {
  items: unknown[];
  page?: number;
  pageSize?: number;
  total?: number;
}

function isPaged(v: unknown): v is PagedResult {
  return !!v && typeof v === 'object' && Array.isArray((v as PagedResult).items);
}

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
            ? this.paged('animals', (page) => this.animals.list(user, { ...PAGE, page, sort: 'tag', order: 'asc' }))
            : Promise.resolve(null),
      ],
      [
        'batches',
        () =>
          can('animals:read') ? this.paged('batches', (page) => this.batches.list(user, { ...PAGE, page })) : Promise.resolve(null),
      ],
      [
        'groups',
        () =>
          can('animals:read')
            ? this.paged('groups', (page) => this.batches.list(user, { ...PAGE, page, kind: 'POULTRY' }))
            : Promise.resolve(null),
      ],
      [
        'fish',
        () =>
          can('animals:read')
            ? this.paged('fish', (page) => this.batches.list(user, { ...PAGE, page, kind: 'FISH' }))
            : Promise.resolve(null),
      ],
      [
        'expenses',
        () => (can('expenses:read') ? this.paged('expenses', (page) => this.expenses.list(user, { ...PAGE, page })) : Promise.resolve(null)),
      ],
      [
        'revenue',
        () => (can('revenue:read') ? this.paged('revenue', (page) => this.revenue.list(user, { ...PAGE, page })) : Promise.resolve(null)),
      ],
      [
        'inventory',
        () =>
          can('inventory:read')
            ? this.paged('inventory', (page) => this.inventory.list(user, { ...PAGE, page }))
            : Promise.resolve(null),
      ],
      [
        'health',
        () =>
          can('health:read')
            ? this.paged('health', (page) => this.health.list(user, { ...PAGE, page, due: 'all' }))
            : Promise.resolve(null),
      ],
      [
        'breeding',
        () =>
          can('breeding:read') ? this.paged('breeding', (page) => this.breeding.list(user, { ...PAGE, page })) : Promise.resolve(null),
      ],
      [
        'production',
        () =>
          can('production:read')
            ? this.paged('production', (page) => this.production.list(user, { ...PAGE, page }))
            : Promise.resolve(null),
      ],
      [
        'feed',
        () => (can('feed:read') ? this.paged('feed', (page) => this.feed.list(user, { ...PAGE, page })) : Promise.resolve(null)),
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
            ? this.paged('tasks', (page) => this.tasks.list(user, { page, pageSize: PAGE_SIZE, dueBefore }))
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

  /**
   * Walk list pages 1..N and merge `items`. Stops when a page is short, empty,
   * or the collected count reaches `total`; capped at MAX_BOOTSTRAP_PAGES.
   * Returns the first response's shape with items combined, page 1, and
   * pageSize widened to cover the combined list.
   */
  private async paged<T>(module: string, fetchPage: (page: number) => Promise<T>): Promise<T> {
    const first = await fetchPage(1);
    if (!isPaged(first)) return first;

    const items: unknown[] = [...first.items];
    let total = first.total;
    let last: PagedResult = first;
    let pages = 1;

    while (
      last.items.length > 0 &&
      last.items.length >= (first.pageSize ?? PAGE_SIZE) &&
      (total === undefined || items.length < total)
    ) {
      if (pages >= MAX_BOOTSTRAP_PAGES) {
        this.log.warn(
          `bootstrap ${module} hit ${MAX_BOOTSTRAP_PAGES}-page cap (${items.length}/${total ?? '?'} rows)`,
        );
        break;
      }
      const next = await fetchPage(pages + 1);
      pages += 1;
      if (!isPaged(next)) break;
      items.push(...next.items);
      if (next.total !== undefined) total = next.total;
      last = next;
    }

    if (pages === 1) return first;
    return {
      ...first,
      items,
      page: 1,
      pageSize: Math.max(first.pageSize ?? PAGE_SIZE, items.length),
      ...(total !== undefined ? { total } : {}),
    } as T;
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
