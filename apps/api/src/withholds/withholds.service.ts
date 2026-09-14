import { Injectable } from '@nestjs/common';
import type { ActiveWithholdDto, FarmWithholdDto } from '@farm/contracts';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { ensureTask } from '../jobs/task-writer';
import { PrismaService } from '../prisma/prisma.service';
import { nepalSixAmOn, WITHHOLD_MESSAGE_NP, withholdEndDate } from './withhold-rules';

@Injectable()
export class WithholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async activeForFarm(user: RequestUser): Promise<FarmWithholdDto[]> {
    const now = new Date();
    const rows = await this.prisma.milkWithhold.findMany({
      where: { farmId: user.farmId, clearedAt: null, endDate: { gte: now } },
      include: { animal: { select: { herdNumber: true, name: true } } },
      orderBy: { endDate: 'desc' },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = latest.get(row.animalId);
      if (!existing || row.endDate > existing.endDate) latest.set(row.animalId, row);
    }
    return [...latest.values()].map((r) => ({
      id: r.id,
      animalId: r.animalId,
      shortNo: r.animal.herdNumber,
      name: r.animal.name,
      drugName: r.drugName,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      kind: 'MILK' as const,
      messageNp: WITHHOLD_MESSAGE_NP,
    }));
  }

  async activeMilkForAnimal(farmId: string, animalId: string, at = new Date()): Promise<ActiveWithholdDto | null> {
    const row = await this.prisma.milkWithhold.findFirst({
      where: { farmId, animalId, clearedAt: null, endDate: { gte: at } },
      orderBy: { endDate: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      kind: 'MILK',
      drugName: row.drugName,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      messageNp: WITHHOLD_MESSAGE_NP,
    };
  }

  async animalIdsWithActiveMilk(farmId: string, at = new Date()): Promise<Set<string>> {
    const rows = await this.prisma.milkWithhold.findMany({
      where: { farmId, clearedAt: null, endDate: { gte: at } },
      select: { animalId: true },
    });
    return new Set(rows.map((r) => r.animalId));
  }

  /**
   * Create withhold rows from a treatment. Stacks: a later endDate wins
   * for enforcement; earlier rows stay for the trail.
   */
  async applyFromTreatment(
    user: RequestUser,
    input: {
      animalId: string;
      healthEventId: string;
      inventoryItemId?: string;
      medicine?: string | null;
      firstDoseAt: Date;
      durationDays: number;
      explicitMilkUntil?: Date;
      explicitMeatUntil?: Date;
    },
  ): Promise<void> {
    const item = input.inventoryItemId
      ? await this.prisma.inventoryItem.findFirst({
          where: { id: input.inventoryItemId, farmId: user.farmId, deletedAt: null },
        })
      : null;
    const drugName = item?.name ?? input.medicine ?? 'Treatment';
    const milkDays = item?.withdrawalDaysMilk ?? 0;
    const meatDays = item?.withdrawalDaysMeat ?? 0;

    const computedMilk =
      milkDays > 0 ? withholdEndDate(input.firstDoseAt, input.durationDays, milkDays) : null;
    const milkEnd = laterDate(computedMilk, input.explicitMilkUntil);
    const computedMeat =
      meatDays > 0 ? withholdEndDate(input.firstDoseAt, input.durationDays, meatDays) : null;
    const meatEnd = laterDate(computedMeat, input.explicitMeatUntil);

    if (milkEnd) {
      const created = await this.prisma.milkWithhold.create({
        data: {
          farmId: user.farmId,
          animalId: input.animalId,
          healthEventId: input.healthEventId,
          medicationId: item?.id,
          drugName,
          startDate: input.firstDoseAt,
          endDate: milkEnd,
          reason: item ? `withdrawal ${milkDays}d + course ${input.durationDays}d` : 'manual',
        },
      });
      const stacked = await this.stackMilkEnd(user.farmId, input.animalId, milkEnd);
      await this.prisma.healthRecord.update({
        where: { id: input.healthEventId },
        data: { milkWithholdUntil: stacked },
      });
      await this.ensureRedMarker(user, input.animalId, stacked);
      await this.upsertEndTask(user.farmId, input.animalId, created.id, stacked, drugName);
      await this.audit.record({
        farmId: user.farmId,
        userId: user.id,
        action: 'withhold.milk.create',
        entityType: 'milkWithhold',
        entityId: created.id,
        metadata: { endDate: stacked.toISOString(), drugName },
      });
    }

    if (meatEnd) {
      await this.prisma.meatWithhold.create({
        data: {
          farmId: user.farmId,
          animalId: input.animalId,
          healthEventId: input.healthEventId,
          medicationId: item?.id,
          drugName,
          startDate: input.firstDoseAt,
          endDate: meatEnd,
        },
      });
      await this.prisma.healthRecord.update({
        where: { id: input.healthEventId },
        data: { meatWithholdUntil: meatEnd },
      });
    }
  }

  private async stackMilkEnd(farmId: string, animalId: string, candidate: Date): Promise<Date> {
    const latest = await this.prisma.milkWithhold.findFirst({
      where: { farmId, animalId, clearedAt: null },
      orderBy: { endDate: 'desc' },
    });
    if (latest && latest.endDate > candidate) return latest.endDate;
    return candidate;
  }

  private async ensureRedMarker(user: RequestUser, animalId: string, validUntil: Date): Promise<void> {
    const existing = await this.prisma.animalMarker.findFirst({
      where: { farmId: user.farmId, animalId, meaning: 'MILK_WITHHOLD', removedAt: null },
    });
    const marker = existing
      ? await this.prisma.animalMarker.update({
          where: { id: existing.id },
          data: {
            validUntil:
              !existing.validUntil || existing.validUntil < validUntil ? validUntil : existing.validUntil,
          },
        })
      : await this.prisma.animalMarker.create({
          data: {
            farmId: user.farmId,
            animalId,
            color: 'RED',
            meaning: 'MILK_WITHHOLD',
            placedById: user.id,
            placedByScan: false,
            validUntil,
          },
        });
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId },
      select: { herdNumber: true, tag: true },
    });
    const label = animal?.herdNumber ?? animal?.tag ?? 'animal';
    if (!marker.placedByScan) {
      await ensureTask(this.prisma, {
        farmId: user.farmId,
        animalId,
        type: 'APPLY_MARKER',
        titleEn: `Put a red band on ${label}`,
        titleNp: `${label} मा रातो ब्यान्ड लगाउनुहोस्`,
        dueAt: new Date(),
        priority: 'HIGH',
        sourceRefType: 'animalMarker',
        sourceRefId: marker.id,
      });
    }
    await ensureTask(this.prisma, {
      farmId: user.farmId,
      animalId,
      type: 'REMOVE_MARKER',
      titleEn: `Remove red band from ${label}`,
      titleNp: `${label} बाट रातो ब्यान्ड हटाउनुहोस्`,
      dueAt: marker.validUntil ?? validUntil,
      priority: 'NORMAL',
      sourceRefType: 'animalMarker',
      sourceRefId: marker.id,
    });
  }

  private async upsertEndTask(
    farmId: string,
    animalId: string,
    withholdId: string,
    endDate: Date,
    drugName: string,
  ): Promise<void> {
    const dueAt = nepalSixAmOn(endDate);
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId },
      select: { herdNumber: true, tag: true },
    });
    const label = animal?.herdNumber ?? animal?.tag ?? drugName;
    const existing = await this.prisma.task.findFirst({
      where: { farmId, animalId, type: 'MILK_WITHHOLD_END', status: 'PENDING' },
    });
    if (existing) {
      if (existing.dueAt < dueAt) {
        await this.prisma.task.update({
          where: { id: existing.id },
          data: { dueAt, sourceRefId: withholdId, sourceRefType: 'milkWithhold' },
        });
      }
      return;
    }
    await ensureTask(this.prisma, {
      farmId,
      animalId,
      type: 'MILK_WITHHOLD_END',
      titleEn: `Withhold ends for ${label} — ${drugName}`,
      titleNp: `${label} को दूध रोक सकिन्छ — ${drugName}`,
      dueAt,
      priority: 'NORMAL',
      sourceRefType: 'milkWithhold',
      sourceRefId: withholdId,
    });
  }
}

function laterDate(a?: Date | null, b?: Date | null): Date | null {
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}
