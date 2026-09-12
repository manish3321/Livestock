import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NEPAL_VACCINE_PROTOCOLS } from '@farm/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { SpeciesConfigService } from '../species-config/species-config.service';
import { PROTOCOL_TASK_IDS, ensureTask } from './task-writer';

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
    await this.withholdEndTasks(farmId, now);
    await this.stockTasks(farmId, now);
    await this.missingMilkTasks(farmId, now);
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
    const herd = await this.prisma.animal.findMany({
      where: { farmId, deletedAt: null, status: { notIn: [...EXIT] } },
      select: {
        id: true,
        herdNumber: true,
        tag: true,
        species: true,
        gender: true,
        dateOfBirth: true,
        isPregnant: true,
        health: {
          where: { type: { in: ['VACCINATION', 'DEWORMING'] } },
          orderBy: { performedAt: 'desc' },
          take: 20,
        },
      },
    });

    const horizon = new Date(now.getTime() + 60 * DAY);
    for (const protocol of NEPAL_VACCINE_PROTOCOLS) {
      for (const animal of herd) {
        if (protocol.sex === 'FEMALE' && animal.gender !== 'FEMALE') continue;
        const ageMonths = animal.dateOfBirth
          ? (now.getTime() - animal.dateOfBirth.getTime()) / (30.44 * DAY)
          : 24;
        if (ageMonths < protocol.firstDoseMonths) continue;

        const last = animal.health.find((h) =>
          h.title.toUpperCase().includes(protocol.key) || h.title.includes(protocol.titleEn),
        );
        let due = last?.nextDueAt ?? last?.performedAt ?? animal.dateOfBirth ?? now;
        if (last?.performedAt && protocol.intervalDays) {
          due = new Date(last.performedAt.getTime() + protocol.intervalDays * DAY);
        } else if (!last && animal.dateOfBirth) {
          due = new Date(animal.dateOfBirth);
          due.setMonth(due.getMonth() + protocol.firstDoseMonths);
        }
        if (due < now) due = now;
        if (due > horizon) continue;

        const label = animal.herdNumber ?? animal.tag;
        await ensureTask(this.prisma, {
          farmId,
          animalId: animal.id,
          type: 'VACCINATION_DUE',
          titleEn: `${protocol.titleEn} due for ${label}`,
          titleNp: `${protocol.titleNp} ${label} लाई दिन बाँकी`,
          dueAt: due,
          priority: due <= now ? 'HIGH' : 'NORMAL',
          sourceRefType: 'vaccineProtocol',
          sourceRefId: PROTOCOL_TASK_IDS[protocol.key] ?? null,
        });
      }
    }
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

      if (rec.mother.species === 'BUFFALO' && rec.pregnancyStatus === 'OPEN') {
        const expectedHeat = new Date(rec.matingDate.getTime() + cfg.estrusCycleDays * DAY);
        const silentAt = new Date(expectedHeat.getTime() + 30 * DAY);
        silentAt.setHours(4, 30, 0, 0);
        if (silentAt <= new Date(now.getTime() + 60 * DAY)) {
          await ensureTask(this.prisma, {
            farmId,
            animalId: rec.motherId,
            type: 'SILENT_HEAT_CHECK',
            titleEn: `Look at ${label} before dawn — buffalo silent heat`,
            titleNp: `${label} बिहान ४:३० मा हेर्नुहोस् — मौन रजस्वला`,
            dueAt: silentAt,
            priority: 'NORMAL',
            sourceRefType: 'breedingRecord',
            sourceRefId: rec.id,
          });
        }
      }
    }

    const heats = await this.prisma.heatLog.findMany({
      where: { farmId, observedAt: { gte: new Date(now.getTime() - 4 * DAY) } },
      include: { animal: true },
    });
    for (const heat of heats) {
      const watch = new Date(heat.observedAt.getTime() + 19 * DAY);
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
        sourceRefType: 'heatLog',
        sourceRefId: heat.id,
      });
      const windowOpen = new Date(heat.observedAt.getTime() + 12 * 60 * 60 * 1000);
      await ensureTask(this.prisma, {
        farmId,
        animalId: heat.animalId,
        type: 'SERVICE_WINDOW',
        titleEn: `Breed ${label} within 18 hours of standing heat`,
        titleNp: `${label} लाई १८ घण्टाभित्र सेवा दिनुहोस्`,
        dueAt: windowOpen,
        priority: 'HIGH',
        sourceRefType: 'heatLog',
        sourceRefId: heat.id,
      });
    }
  }

  private async withholdEndTasks(farmId: string, now: Date): Promise<void> {
    const holds = await this.prisma.healthRecord.findMany({
      where: {
        farmId,
        milkWithholdUntil: { gte: now, lte: new Date(now.getTime() + 7 * DAY) },
      },
      include: { animal: true },
    });
    for (const h of holds) {
      if (!h.animal || !h.milkWithholdUntil) continue;
      const due = new Date(h.milkWithholdUntil);
      due.setHours(6, 0, 0, 0);
      const label = h.animal.herdNumber ?? h.animal.tag;
      await ensureTask(this.prisma, {
        farmId,
        animalId: h.animalId,
        type: 'MILK_WITHHOLD_END',
        titleEn: `Withhold ends for ${label}`,
        titleNp: `${label} को दूध रोक अब सकिन्छ`,
        dueAt: due,
        priority: 'NORMAL',
        sourceRefType: 'healthRecord',
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
}
