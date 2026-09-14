import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { BatchVaccinate } from '@farm/contracts';
import { ensureTask } from '../jobs/task-writer';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { derivedSlotId } from '../breeding/breeding-rules';
import {
  appliesToAnimal,
  lotIsExpired,
  nextDueDate,
  pickFefoLot,
  type ProtocolRow,
} from './vaccination-rules';

const DAY = 24 * 60 * 60 * 1000;
const EXIT = ['SOLD', 'DEAD', 'CULLED'] as const;

@Injectable()
export class VaccinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generateForFarm(farmId: string, now = new Date()): Promise<number> {
    const protocols = await this.prisma.vaccineProtocol.findMany({
      where: {
        active: true,
        OR: [{ farmId: null }, { farmId }],
      },
    });
    const farmOverrides = new Set(protocols.filter((p) => p.farmId === farmId).map((p) => p.disease));
    const applicable = protocols.filter((p) => p.farmId === farmId || !farmOverrides.has(p.disease));

    const herd = await this.prisma.animal.findMany({
      where: { farmId, deletedAt: null, status: { notIn: [...EXIT] } },
    });
    const records = await this.prisma.vaccinationRecord.findMany({
      where: { farmId, animalId: { in: herd.map((a) => a.id) } },
      orderBy: { administeredAt: 'desc' },
    });
    const lastByAnimalDisease = new Map<string, { at: Date; disputed: boolean; nextDueOn: Date | null }>();
    for (const rec of records) {
      const key = `${rec.animalId}:${rec.disease}`;
      if (!lastByAnimalDisease.has(key)) {
        lastByAnimalDisease.set(key, {
          at: rec.administeredAt,
          disputed: rec.disputedEfficacy,
          nextDueOn: rec.nextDueOn,
        });
      }
    }

    const horizon = new Date(now.getTime() + 60 * DAY);
    let created = 0;
    for (const protocol of applicable) {
      for (const animal of herd) {
        if (!appliesToAnimal(protocol as ProtocolRow, animal)) continue;
        const last = lastByAnimalDisease.get(`${animal.id}:${protocol.disease}`);
        const given = records.filter((r) => r.animalId === animal.id && r.disease === protocol.disease);
        const boosterAlready = given.length >= 2;
        const due = nextDueDate(
          protocol as ProtocolRow,
          animal,
          last?.at ?? null,
          boosterAlready,
          now,
          horizon,
        );
        if (!due) continue;
        const label = animal.herdNumber ?? animal.tag;
        const before = await this.prisma.task.count({
          where: {
            farmId,
            animalId: animal.id,
            type: 'VACCINATION_DUE',
            sourceRefId: protocol.id,
            status: { in: ['PENDING', 'SNOOZED'] },
          },
        });
        await ensureTask(this.prisma, {
          farmId,
          animalId: animal.id,
          type: 'VACCINATION_DUE',
          titleEn: `${protocol.disease} due for ${label}`,
          titleNp: `${protocol.diseaseNp ?? protocol.disease} ${label} लाई दिन बाँकी`,
          dueAt: due,
          priority: due <= now ? 'HIGH' : 'NORMAL',
          sourceRefType: 'vaccineProtocol',
          sourceRefId: protocol.id,
        });
        const after = await this.prisma.task.count({
          where: {
            farmId,
            animalId: animal.id,
            type: 'VACCINATION_DUE',
            sourceRefId: protocol.id,
            status: { in: ['PENDING', 'SNOOZED'] },
          },
        });
        if (after > before) created += 1;
      }
    }
    return created;
  }

  async batch(user: RequestUser, input: BatchVaccinate, requestId?: string) {
    const animals = await this.prisma.animal.findMany({
      where: { id: { in: input.animalIds }, farmId: user.farmId, deletedAt: null },
    });
    const protocols = await this.prisma.vaccineProtocol.findMany({
      where: { active: true, OR: [{ farmId: null }, { farmId: user.farmId }] },
    });
    const item = input.itemId
      ? await this.prisma.inventoryItem.findFirst({
          where: { id: input.itemId, farmId: user.farmId, deletedAt: null },
        })
      : null;
    if (input.itemId && !item) {
      throw new NotFoundException({ code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' });
    }

    const lots = item
      ? await this.prisma.stockLot.findMany({ where: { farmId: user.farmId, itemId: item.id } })
      : [];
    const lot =
      (input.lotId ? lots.find((l) => l.id === input.lotId) : null) ??
      pickFefoLot(lots.map((l) => ({ ...l, qtyRemaining: Number(l.qtyRemaining) })));
    if (input.lotId && !lot) {
      throw new NotFoundException({ code: 'LOT_NOT_FOUND', message: 'Lot not found' });
    }

    const at = input.administeredAt;
    if (lot && lotIsExpired(lot, at) && !input.expiredLotReason) {
      throw new UnprocessableEntityException({
        code: 'EXPIRED_LOT_REASON_REQUIRED',
        message: 'This lot has expired. Record why you are still using it.',
      });
    }
    const expired = lot ? lotIsExpired(lot, at) : false;

    const recorded: Array<{ animalId: string; vaccinationId: string; healthEventId: string }> = [];
    const skipped: Array<{ animalId: string; reason: string }> = [];
    let movements = 0;

    for (const animal of animals) {
      const protocol = matchProtocol(protocols as ProtocolRow[], animal, input, item?.name);
      if (protocol?.pregnancyContraindicated && animal.isPregnant) {
        skipped.push({ animalId: animal.id, reason: 'PREGNANT_CONTRAINDICATED' });
        continue;
      }

      const event = await this.prisma.healthEvent.create({
        data: {
          farmId: user.farmId,
          animalId: animal.id,
          type: protocol?.disease === 'DEWORMING' ? 'DEWORMING' : 'VACCINATION',
          eventAt: at,
          roundId: input.roundId,
          notes: input.expiredLotReason,
        },
      });
      const nextDue =
        protocol?.boosterAfterDays && !expired
          ? new Date(at.getTime() + protocol.boosterAfterDays * DAY)
          : protocol?.repeatIntervalDays
            ? new Date(at.getTime() + protocol.repeatIntervalDays * DAY)
            : null;
      const vax = await this.prisma.vaccinationRecord.create({
        data: {
          healthEventId: event.id,
          animalId: animal.id,
          farmId: user.farmId,
          disease: protocol?.disease ?? item?.name ?? 'VACCINE',
          protocolId: protocol?.id,
          itemId: item?.id,
          lotId: lot?.id,
          lotNumber: lot?.lotNumber,
          roundId: input.roundId,
          administeredAt: at,
          doseAmount: input.doseAmount,
          route: input.route,
          administeredBy: input.administeredBy,
          disputedEfficacy: expired,
          scheduleWasEstimatedAge: animal.dobIsEstimated,
          nextDueOn: nextDue,
        },
      });
      await this.prisma.healthRecord.create({
        data: {
          farmId: user.farmId,
          type: protocol?.disease === 'DEWORMING' ? 'DEWORMING' : 'VACCINATION',
          title: protocol?.disease ?? item?.name ?? 'Vaccination',
          animalId: animal.id,
          inventoryItemId: item?.id,
          batchNumber: lot?.lotNumber,
          performedAt: at,
          nextDueAt: nextDue,
          notes: input.expiredLotReason,
        },
      });

      if (item && lot) {
        await this.prisma.stockMovement.create({
          data: {
            farmId: user.farmId,
            itemId: item.id,
            lotId: lot.id,
            type: 'OUT',
            quantity: 1,
            reason: `Vaccinate ${protocol?.disease ?? item.name}`,
            userId: user.id,
          },
        });
        await this.prisma.stockLot.update({
          where: { id: lot.id },
          data: { qtyRemaining: { decrement: 1 } },
        });
        await this.prisma.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: { decrement: 1 } },
        });
        movements += 1;
      }

      const dueTask = protocol
        ? await this.prisma.task.findFirst({
            where: {
              farmId: user.farmId,
              animalId: animal.id,
              type: 'VACCINATION_DUE',
              sourceRefId: protocol.id,
              status: { in: ['PENDING', 'SNOOZED'] },
            },
          })
        : null;

      if (expired && dueTask) {
        await this.prisma.task.update({
          where: { id: dueTask.id },
          data: { dueAt: new Date(at.getTime() + 7 * DAY), status: 'PENDING' },
        });
      } else if (dueTask) {
        await this.prisma.task.update({
          where: { id: dueTask.id },
          data: { status: 'DONE', completedAt: at, completedById: user.id },
        });
        if (protocol?.boosterAfterDays) {
          const label = animal.herdNumber ?? animal.tag;
          await ensureTask(this.prisma, {
            farmId: user.farmId,
            animalId: animal.id,
            type: 'VACCINATION_DUE',
            titleEn: `${protocol.disease} booster due for ${label}`,
            titleNp: `${protocol.diseaseNp ?? protocol.disease} बुस्टर ${label}`,
            dueAt: new Date(at.getTime() + protocol.boosterAfterDays * DAY),
            priority: 'HIGH',
            sourceRefType: 'vaccineBooster',
            sourceRefId: derivedSlotId(protocol.id, protocol.boosterAfterDays),
          });
        }
      }

      if (input.roundId) {
        await this.prisma.recordingRound.updateMany({
          where: { id: input.roundId, farmId: user.farmId },
          data: { recordedCount: { increment: 1 } },
        });
      }

      recorded.push({ animalId: animal.id, vaccinationId: vax.id, healthEventId: event.id });
    }

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'health.vaccinations.batch',
      entityType: 'vaccinationRecord',
      entityId: recorded[0]?.vaccinationId ?? user.farmId,
      metadata: { recorded: recorded.length, skipped: skipped.length, movements },
      requestId,
    });

    return { recorded, skipped, movements };
  }
}

function matchProtocol(
  protocols: ProtocolRow[],
  _animal: { species: string; gender: string; isPregnant: boolean },
  input: BatchVaccinate,
  itemName?: string,
): ProtocolRow | undefined {
  const named = input.disease ?? itemName;
  if (named) return protocols.find((p) => p.disease === named);
  return undefined;
}
