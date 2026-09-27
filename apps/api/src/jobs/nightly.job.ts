import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { ProfitService } from '../profit/profit.service';
import { VaccinationsService } from '../vaccinations/vaccinations.service';
import { nepalSixAmOn } from '../withholds/withhold-rules';
import { ensureTask } from './task-writer';
import { nepalDayBounds } from '../notifications/notification-rules';
import { atNepalHour } from '../common/nepal-time';
import { ReproStageService } from '../breeding/repro-stage.service';
import { ReminderEngineService } from '../breeding/reminder-engine.service';

const DAY = 24 * 60 * 60 * 1000;
const EXIT = ['SOLD', 'DEAD', 'CULLED'] as const;

/**
 * Nightly generators run at 01:00 Nepal time. Running twice must change nothing
 * — every insert hits the pending-task unique index.
 */
@Injectable()
export class NightlyJob {
  private readonly logger = new Logger(NightlyJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly species: SpeciesConfigService,
    private readonly vaccinations?: VaccinationsService,
    private readonly profit?: ProfitService,
    @Optional() private readonly reproStage?: ReproStageService,
    @Optional() private readonly reminders?: ReminderEngineService,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'Asia/Kathmandu' })
  async tick(): Promise<void> {
    await this.run();
  }

  async run(now = new Date()): Promise<void> {
    const farms = await this.prisma.farm.findMany({ select: { id: true } });
    for (const farm of farms) {
      try {
        await this.generateForFarm(farm.id, now);
      } catch (err) {
        this.logger.error(`Nightly failed for farm ${farm.id}`, err);
      }
    }
    this.logger.log(`Nightly job finished for ${farms.length} farm(s)`);
  }

  async runFarm(farmId: string, now = new Date()): Promise<void> {
    await this.generateForFarm(farmId, now);
  }

  private async generateForFarm(farmId: string, now: Date): Promise<void> {
    await this.reproStage?.recomputeFarm(farmId, now);
    await this.reminders?.generateStageReminders(farmId, now);
    await this.reminders?.generateEventReminders(farmId, now);
    await this.reminders?.escalateAnestrus(farmId, now);
    await this.checkProtocolIntegrity(farmId, now);
    await this.expireStaleTasks(farmId, now);
    await this.computeBreedingMetrics(farmId, now);
    await this.vaccinationTasks(farmId, now);
    await this.withholdEndTasks(farmId, now);
    await this.stockTasks(farmId, now);
    await this.missingMilkTasks(farmId, now);
    await this.financeTasks(farmId, now);
  }

  private async expireStaleTasks(farmId: string, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - 30 * DAY);
    const result = await this.prisma.task.updateMany({
      where: {
        farmId,
        status: { in: ['PENDING', 'SNOOZED'] },
        dueAt: { lt: cutoff },
      },
      data: { status: 'EXPIRED' },
    });
    const expired = (result as { count?: number }).count ?? 0;
    if (expired > 0) this.logger.log(`Expired ${expired} stale task(s) for farm ${farmId}`);
  }

  private async computeBreedingMetrics(farmId: string, now: Date): Promise<void> {
    await this.reproStage?.stageDurations(farmId, undefined, undefined, now);
    if (this.profit) await this.profit.generateDailyMetrics(farmId, now);
  }

  private async vaccinationTasks(farmId: string, now: Date): Promise<void> {
    if (!this.vaccinations) return;
    await this.vaccinations.generateForFarm(farmId, now);
  }

  private async checkProtocolIntegrity(farmId: string, now: Date): Promise<void> {
    const { start } = nepalDayBounds(now);
    const overdue = await this.prisma.task.findMany({
      where: {
        farmId,
        type: 'SYNC_INJECTION',
        status: { in: ['PENDING', 'SNOOZED'] },
        dueAt: { lt: start },
      },
    });
    const seen = new Set<string>();
    for (const task of overdue) {
      const enrollmentId = task.sourceRefType?.startsWith('sync:') ? task.sourceRefType.slice(5) : null;
      if (!enrollmentId || seen.has(enrollmentId) || !task.animalId) continue;
      seen.add(enrollmentId);
      const enrollment = await this.prisma.syncEnrollment.findFirst({
        where: { id: enrollmentId, farmId, status: 'ACTIVE' },
        include: { protocol: true, animal: { select: { herdNumber: true, tag: true } } },
      });
      if (!enrollment) continue;
      const stepDay = Math.round((task.dueAt.getTime() - enrollment.startDate.getTime()) / DAY);
      await this.prisma.syncEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'BROKEN',
          brokenAtStep: stepDay,
          brokenReason: `Day ${stepDay} injection missed`,
        },
      });
      await this.prisma.task.updateMany({
        where: {
          farmId,
          animalId: enrollment.animalId,
          sourceRefType: `sync:${enrollment.id}`,
          status: { in: ['PENDING', 'SNOOZED'] },
        },
        data: { status: 'SUPERSEDED' },
      });
      const label = enrollment.animal.herdNumber ?? enrollment.animal.tag;
      const protocolName = enrollment.protocol.nameEn;
      await ensureTask(this.prisma, {
        farmId,
        animalId: enrollment.animalId,
        type: 'PROTOCOL_BROKEN',
        titleEn: `${protocolName} for ${label} is void — the day ${stepDay} injection was missed. Restart from the beginning, or switch to a CIDR protocol.`,
        titleNp: `${label} को ${enrollment.protocol.nameNp} रद्द — दिन ${stepDay} को सुई छुट्यो। सुरुबाट वा सिडरमा सार्नुहोस्।`,
        dueAt: now,
        priority: 'HIGH',
        sourceRefType: 'syncEnrollment',
        sourceRefId: enrollment.id,
      });
      await this.reproStage?.recomputeAnimal(farmId, enrollment.animalId, 'PROTOCOL_BROKEN', now);
    }
  }

  private async withholdEndTasks(farmId: string, now: Date): Promise<void> {
    const holds = await this.prisma.milkWithhold.findMany({
      where: {
        farmId,
        clearedAt: null,
        endDate: { gte: now, lte: new Date(now.getTime() + 7 * DAY) },
      },
      include: { animal: true },
    });
    for (const h of holds) {
      const due = nepalSixAmOn(h.endDate);
      const label = h.animal.herdNumber ?? h.animal.tag;
      await ensureTask(this.prisma, {
        farmId,
        animalId: h.animalId,
        type: 'MILK_WITHHOLD_END',
        titleEn: `Withhold ends for ${label}`,
        titleNp: `${label} को दूध रोक अब सकिन्छ`,
        dueAt: due,
        priority: 'NORMAL',
        sourceRefType: 'milkWithhold',
        sourceRefId: h.id,
      });
    }
  }

  private async stockTasks(farmId: string, now: Date): Promise<void> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { farmId, deletedAt: null },
    });
    for (const item of items) {
      if (Number(item.currentStock) <= Number(item.minimumStock)) {
        await ensureTask(this.prisma, {
          farmId,
          type: 'STOCK_REORDER',
          titleEn: `Low stock: ${item.name}`,
          titleNp: `स्टक कम: ${item.name}`,
          dueAt: now,
          priority: 'NORMAL',
          sourceRefType: 'inventoryItem',
          sourceRefId: item.id,
        });
      }
      if (item.expiryDate) {
        const days = (item.expiryDate.getTime() - now.getTime()) / DAY;
        if (days <= 30) {
          await ensureTask(this.prisma, {
            farmId,
            type: 'LOT_EXPIRING',
            titleEn: `${item.name} expires ${item.expiryDate.toISOString().slice(0, 10)}`,
            titleNp: `${item.name} म्याद ${item.expiryDate.toISOString().slice(0, 10)}`,
            dueAt: item.expiryDate,
            priority: days <= 7 ? 'HIGH' : 'NORMAL',
            sourceRefType: 'inventoryItem',
            sourceRefId: item.id,
          });
        }
      }
    }
    const lots = await this.prisma.stockLot.findMany({
      where: { farmId },
      include: { item: { select: { name: true } } },
    });
    for (const lot of lots) {
      if (!lot.expiryDate) continue;
      const days = (lot.expiryDate.getTime() - now.getTime()) / DAY;
      if (days <= 30) {
        await ensureTask(this.prisma, {
          farmId,
          type: 'LOT_EXPIRING',
          titleEn: `${lot.item.name} lot ${lot.lotNumber} expires ${lot.expiryDate.toISOString().slice(0, 10)}`,
          titleNp: `${lot.item.name} ${lot.lotNumber} म्याद ${lot.expiryDate.toISOString().slice(0, 10)}`,
          dueAt: lot.expiryDate,
          priority: days <= 7 ? 'HIGH' : 'NORMAL',
          sourceRefType: 'stockLot',
          sourceRefId: lot.id,
        });
      }
      if (Number(lot.qtyRemaining) < 0) {
        await ensureTask(this.prisma, {
          farmId,
          type: 'STOCK_RECONCILE',
          titleEn: `${lot.item.name} lot ${lot.lotNumber} is negative — record the purchase`,
          titleNp: `${lot.item.name} ${lot.lotNumber} ऋणात्मक — किनबेच रेकर्ड गर्नुहोस्`,
          dueAt: now,
          priority: 'HIGH',
          sourceRefType: 'stockLot',
          sourceRefId: lot.id,
        });
      }
    }
  }

  /** Nightly runs at 01:00 NPT, so the milking day that just closed is yesterday's. */
  private async missingMilkTasks(farmId: string, now: Date): Promise<void> {
    const { start, end } = nepalDayBounds(new Date(now.getTime() - DAY));
    const evening = atNepalHour(start, 20);

    const herd = await this.prisma.animal.findMany({
      where: {
        farmId,
        deletedAt: null,
        gender: 'FEMALE',
        status: { notIn: [...EXIT, 'DRY'] },
      },
    });
    const recorded = await this.prisma.productionEntry.findMany({
      where: { farmId, type: 'MILK', entryDate: { gte: start, lt: end } },
      select: { animalId: true },
    });
    const seen = new Set(recorded.map((r) => r.animalId).filter(Boolean));
    for (const a of herd) {
      if (seen.has(a.id)) continue;
      await ensureTask(this.prisma, {
        farmId,
        animalId: a.id,
        type: 'MISSING_PRODUCTION',
        titleEn: `No milk recorded for ${a.herdNumber ?? a.tag}`,
        titleNp: `${a.herdNumber ?? a.tag} को दूध रेकर्ड छैन`,
        dueAt: evening,
        priority: 'LOW',
        sourceRefType: 'milkDay',
        sourceRefId: null,
      });
    }
  }

  /** Pending expense approvals + unpaid / partial revenue → Inbox + push. */
  private async financeTasks(farmId: string, now: Date): Promise<void> {
    const expenses = await this.prisma.expense.findMany({
      where: {
        farmId,
        status: { in: ['PENDING', 'ESCALATED'] },
      },
      take: 100,
    });
    for (const e of expenses) {
      await ensureTask(this.prisma, {
        farmId,
        type: 'EXPENSE_APPROVAL',
        titleEn: `Expense approval: ${e.category} (${e.amount})`,
        titleNp: `खर्च स्वीकृत: ${e.category} (${e.amount})`,
        dueAt: now,
        priority: 'HIGH',
        sourceRefType: 'Expense',
        sourceRefId: e.id,
      });
    }

    const revenues = await this.prisma.revenue.findMany({
      where: {
        farmId,
        paymentStatus: { in: ['PENDING', 'PARTIAL'] },
      },
      take: 100,
    });
    for (const r of revenues) {
      await ensureTask(this.prisma, {
        farmId,
        type: 'UNPAID_REVENUE',
        titleEn: `Unpaid revenue: ${r.source} (${r.amount})`,
        titleNp: `आम्दानी बाँकी: ${r.source} (${r.amount})`,
        dueAt: now,
        priority: 'NORMAL',
        sourceRefType: 'Revenue',
        sourceRefId: r.id,
      });
    }
  }
}
