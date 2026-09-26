import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { ProfitService } from '../profit/profit.service';
import { VaccinationsService } from '../vaccinations/vaccinations.service';
import { nepalSixAmOn } from '../withholds/withhold-rules';
import { ensureTask } from './task-writer';

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

  private async generateForFarm(farmId: string, now: Date): Promise<void> {
    await this.expireOldTasks(farmId, now);
    await this.vaccinationTasks(farmId, now);
    await this.breedingTasks(farmId, now);
    await this.silentHeatTasks(farmId, now);
    await this.withholdEndTasks(farmId, now);
    await this.stockTasks(farmId, now);
    await this.missingMilkTasks(farmId, now);
    await this.financeTasks(farmId, now);
    if (this.profit) {
      await this.profit.generateDailyMetrics(farmId, now);
    }
  }

  private async expireOldTasks(farmId: string, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - 30 * DAY);
    await this.prisma.task.updateMany({
      where: {
        farmId,
        status: { in: ['PENDING', 'SNOOZED'] },
        dueAt: { lt: cutoff },
        priority: { not: 'CRITICAL' },
      },
      data: { status: 'EXPIRED' },
    });
  }

  private async vaccinationTasks(farmId: string, now: Date): Promise<void> {
    if (!this.vaccinations) return;
    await this.vaccinations.generateForFarm(farmId, now);
  }

  private async breedingTasks(farmId: string, now: Date): Promise<void> {
    const open = await this.prisma.breedingRecord.findMany({
      where: {
        farmId,
        pregnancyStatus: { in: ['PREGNANT', 'CONFIRMED', 'OPEN'] },
      },
      include: { mother: true },
    });

    for (const rec of open) {
      if (!rec.mother || rec.mother.deletedAt) continue;
      const label = rec.mother.herdNumber ?? rec.mother.tag;
      const cfg = await this.species.forSpecies(rec.mother.species);

      if (rec.pregnancyStatus === 'OPEN' || rec.pregnancyStatus === 'PREGNANT') {
        const checkAt = new Date(rec.matingDate.getTime() + cfg.pregnancyCheckEarliestDays * DAY);
        await ensureTask(this.prisma, {
          farmId,
          animalId: rec.motherId,
          type: 'PREGNANCY_CHECK',
          titleEn: `Pregnancy check ${label}`,
          titleNp: `${label} को गर्भ जाँच`,
          dueAt: checkAt,
          priority: 'HIGH',
          sourceRefType: 'breedingRecord',
          sourceRefId: rec.id,
        });
      }

      if (rec.pregnancyStatus === 'CONFIRMED' || rec.pregnancyStatus === 'PREGNANT') {
        const dryOff = new Date(rec.dueDate.getTime() - cfg.dryOffDaysBeforeCalving * DAY);
        await ensureTask(this.prisma, {
          farmId,
          animalId: rec.motherId,
          type: 'DRY_OFF',
          titleEn: `Dry off ${label}`,
          titleNp: `${label} सुकाउने बेला`,
          dueAt: dryOff,
          priority: 'HIGH',
          sourceRefType: 'breedingRecord',
          sourceRefId: rec.id,
        });
        for (const days of [7, 3, 1, 0]) {
          const when = new Date(rec.dueDate.getTime() - days * DAY);
          await ensureTask(this.prisma, {
            farmId,
            animalId: rec.motherId,
            type: 'CALVING_WATCH',
            titleEn: days === 0 ? `${label} due to calve today` : `${label} calving in ${days} day(s)`,
            titleNp: days === 0 ? `${label} आज बियाउने` : `${label} ${days} दिनमा बियाउने`,
            dueAt: when,
            priority: 'CRITICAL',
            sourceRefType: 'breedingRecord',
            sourceRefId: rec.id,
          });
        }
      }

    }

    const heats = await this.prisma.heatEvent.findMany({
      where: { farmId, observedAt: { gte: new Date(now.getTime() - 4 * DAY) } },
      include: { animal: true },
    });
    for (const heat of heats) {
      const cfg = await this.species.forSpecies(heat.animal.species);
      const watch = new Date(heat.observedAt.getTime() + (cfg.estrusCycleDays - 2) * DAY);
      watch.setHours(5, 0, 0, 0);
      const label = heat.animal.herdNumber ?? heat.animal.tag;
      await ensureTask(this.prisma, {
        farmId,
        animalId: heat.animalId,
        type: 'HEAT_WATCH',
        titleEn: `Heat watch ${label}`,
        titleNp: `${label} रजस्वला हेर्ने`,
        dueAt: watch,
        priority: 'HIGH',
        sourceRefType: 'heatEvent',
        sourceRefId: heat.id,
      });
      const windowOpen = new Date(
        heat.observedAt.getTime() + cfg.serviceWindowStartHours * 60 * 60 * 1000,
      );
      await ensureTask(this.prisma, {
        farmId,
        animalId: heat.animalId,
        type: 'SERVICE_WINDOW',
        titleEn: `Breed ${label} within ${cfg.serviceWindowEndHours} hours of standing heat`,
        titleNp: `${label} लाई ${cfg.serviceWindowEndHours} घण्टाभित्र सेवा दिनुहोस्`,
        dueAt: windowOpen,
        priority: 'HIGH',
        sourceRefType: 'heatEvent',
        sourceRefId: heat.id,
      });
    }
  }

  private async silentHeatTasks(farmId: string, now: Date): Promise<void> {
    const cfg = await this.species.forSpecies('BUFFALO');
    if (cfg.silentHeatCheckHour == null) return;

    const herd = await this.prisma.animal.findMany({
      where: {
        farmId,
        deletedAt: null,
        species: 'BUFFALO',
        gender: 'FEMALE',
        isPregnant: false,
        status: { notIn: [...EXIT] },
      },
    });
    const since = new Date(now.getTime() - 30 * DAY);
    for (const animal of herd) {
      if (!animal.lactationStartDate) continue;
      const dim = (now.getTime() - animal.lactationStartDate.getTime()) / DAY;
      if (dim < cfg.voluntaryWaitingDays) continue;
      const recent = await this.prisma.heatEvent.findFirst({
        where: { farmId, animalId: animal.id, observedAt: { gte: since } },
      });
      if (recent) continue;
      const due = new Date(now);
      due.setHours(cfg.silentHeatCheckHour, 0, 0, 0);
      const label = animal.herdNumber ?? animal.tag;
      await ensureTask(this.prisma, {
        farmId,
        animalId: animal.id,
        type: 'SILENT_HEAT_CHECK',
        titleEn: `Check ${label} between 4 and 7am — buffalo silent heat`,
        titleNp: `${label} बिहान ४ देखि ७ बजेसम्म हेर्नुहोस् — मौन रजस्वला`,
        dueAt: due,
        priority: 'NORMAL',
        sourceRefType: 'silentHeat',
        sourceRefId: animal.id,
      });
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

  private async missingMilkTasks(farmId: string, now: Date): Promise<void> {
    const evening = new Date(now);
    evening.setHours(20, 0, 0, 0);
    if (now < evening) return;

    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const herd = await this.prisma.animal.findMany({
      where: {
        farmId,
        deletedAt: null,
        gender: 'FEMALE',
        status: { notIn: [...EXIT, 'DRY'] },
      },
    });
    const recorded = await this.prisma.productionEntry.findMany({
      where: { farmId, type: 'MILK', entryDate: { gte: start } },
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
