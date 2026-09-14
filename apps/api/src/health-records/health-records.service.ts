import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  HEALTH_DEFAULT_INTERVAL_DAYS,
  NEPAL_VACCINE_PROTOCOLS,
  type GroupVaccinate,
  type HealthCreate,
  type HealthListQuery,
  type PageResult,
} from '@farm/contracts';
import { ensureTask } from '../jobs/task-writer';
import type { HealthRecord, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { WithholdsService } from '../withholds/withholds.service';

export interface HealthRecordDto {
  id: string;
  farmId: string;
  type: string;
  title: string;
  animalId: string | null;
  groupId: string | null;
  herdBatchId: string | null;
  animalTag: string | null;
  animalName: string | null;
  herdBatchName: string | null;
  cost: number | null;
  medicine: string | null;
  dosage: string | null;
  method: string | null;
  vetName: string | null;
  outcome: string | null;
  followUpAt: string | null;
  cmtResult: string | null;
  milkWithholdUntil: string | null;
  meatWithholdUntil: string | null;
  batchNumber: string | null;
  performedAt: string;
  nextDueAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

type HealthWithRelations = HealthRecord & {
  animal?: { tag: string; name: string | null } | null;
  herdBatch?: { name: string } | null;
};

@Injectable()
export class HealthRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly withholds: WithholdsService,
  ) {}

  async list(
    user: RequestUser,
    query: HealthListQuery,
  ): Promise<PageResult<HealthRecordDto>> {
    const now = new Date();
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 7);

    const dueFilter: Prisma.HealthRecordWhereInput =
      query.due === 'overdue'
        ? { nextDueAt: { lt: now } }
        : query.due === 'due_soon'
          ? { nextDueAt: { gte: now, lte: soon } }
          : {};

    const where: Prisma.HealthRecordWhereInput = {
      farmId: user.farmId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...dueFilter,
    };

    const [rows, total] = await Promise.all([
      this.prisma.healthRecord.findMany({
        where,
        include: {
          animal: { select: { tag: true, name: true } },
          herdBatch: { select: { name: true } },
        },
        orderBy: { performedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.healthRecord.count({ where }),
    ]);

    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async calendar(
    user: RequestUser,
    query: import('@farm/contracts').HealthCalendarQuery,
  ): Promise<HealthRecordDto[]> {
    const now = new Date();
    const from = query.from ?? now;
    const to = query.to ?? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.healthRecord.findMany({
      where: {
        farmId: user.farmId,
        nextDueAt: { gte: from, lte: to },
      },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
      orderBy: { nextDueAt: 'asc' },
      take: 200,
    });
    return rows.map(toDto);
  }

  async get(user: RequestUser, id: string): Promise<HealthRecordDto> {
    const row = await this.prisma.healthRecord.findFirst({
      where: { id, farmId: user.farmId },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'HEALTH_RECORD_NOT_FOUND',
        message: 'Health record not found',
      });
    }
    return toDto(row);
  }

  async create(
    user: RequestUser,
    input: HealthCreate,
    requestId?: string,
  ): Promise<HealthRecordDto> {
    let nextDueAt = input.nextDueAt;
    if (!nextDueAt) {
      const days = HEALTH_DEFAULT_INTERVAL_DAYS[input.type];
      if (days) {
        nextDueAt = new Date(input.performedAt);
        nextDueAt.setDate(nextDueAt.getDate() + days);
      }
    }

    const row = await this.prisma.healthRecord.create({
      data: {
        farmId: user.farmId,
        type: input.type,
        title: input.title,
        animalId: input.animalId,
        groupId: input.groupId,
        herdBatchId: input.herdBatchId,
        cost: input.cost,
        medicine: input.medicine,
        dosage: input.dosage,
        method: input.method,
        vetName: input.vetName,
        outcome: input.outcome,
        followUpAt: input.followUpAt,
        cmtResult: input.cmtResult,
        milkWithholdUntil: input.milkWithholdUntil,
        meatWithholdUntil: input.meatWithholdUntil,
        batchNumber: input.batchNumber,
        inventoryItemId: input.inventoryItemId,
        durationDays: input.durationDays,
        performedAt: input.performedAt,
        nextDueAt,
        notes: input.notes,
      },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'health.create',
      entityType: 'healthRecord',
      entityId: row.id,
      requestId,
    });

    if (input.animalId) {
      await this.withholds.applyFromTreatment(user, {
        animalId: input.animalId,
        healthEventId: row.id,
        inventoryItemId: input.inventoryItemId,
        medicine: input.medicine ?? input.title,
        firstDoseAt: input.performedAt,
        durationDays: input.durationDays ?? 0,
        explicitMilkUntil: input.milkWithholdUntil,
        explicitMeatUntil: input.meatWithholdUntil,
      });
    }

    if (input.animalId && input.doseCount && input.doseCount > 1) {
      const hours = input.doseIntervalHours ?? 12;
      for (let i = 1; i < input.doseCount; i++) {
        await ensureTask(this.prisma, {
          farmId: user.farmId,
          animalId: input.animalId,
          type: 'MEDICATION_DOSE',
          titleEn: `Dose ${i + 1}/${input.doseCount} — ${input.title}`,
          titleNp: `खुराक ${i + 1}/${input.doseCount} — ${input.title}`,
          dueAt: new Date(input.performedAt.getTime() + i * hours * 60 * 60 * 1000),
          priority: 'HIGH',
          sourceRefType: 'healthRecord',
          sourceRefId: row.id,
        });
      }
    }

    return this.get(user, row.id);
  }

  async groupVaccinate(user: RequestUser, input: GroupVaccinate, requestId?: string) {
    const protocol = NEPAL_VACCINE_PROTOCOLS.find((p) => p.key === input.protocolKey);
    const animals = await this.prisma.animal.findMany({
      where: { id: { in: input.animalIds }, farmId: user.farmId, deletedAt: null },
    });
    const blocked: string[] = [];
    const created: HealthRecordDto[] = [];
    for (const animal of animals) {
      if (protocol?.blockPregnant && animal.isPregnant && !input.pregnantOverride) {
        blocked.push(animal.herdNumber ?? animal.tag);
        continue;
      }
      if (protocol?.blockPregnant && animal.isPregnant && input.pregnantOverride && !input.pregnantOverrideReason) {
        throw new BadRequestException({
          code: 'OVERRIDE_REASON_REQUIRED',
          message: 'Giving this vaccine to a pregnant animal needs a reason',
        });
      }
      created.push(
        await this.create(
          user,
          {
            type: protocol?.key === 'DEWORM' ? 'DEWORMING' : 'VACCINATION',
            title: input.title,
            animalId: animal.id,
            performedAt: input.performedAt,
            batchNumber: input.batchNumber,
            milkWithholdUntil: input.milkWithholdUntil,
            meatWithholdUntil: input.meatWithholdUntil,
            notes: input.pregnantOverrideReason,
          },
          requestId,
        ),
      );
    }
    if (input.inventoryItemId && created.length) {
      const item = await this.prisma.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, farmId: user.farmId, deletedAt: null },
      });
      if (item) {
        const next = Number(item.currentStock) - created.length;
        await this.prisma.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: next },
        });
        await this.prisma.stockMovement.create({
          data: {
            farmId: user.farmId,
            itemId: item.id,
            type: 'OUT',
            quantity: created.length,
            reason: `Group vaccinate ${input.title}`,
            userId: user.id,
          },
        });
      }
    }
    return { created: created.length, blocked, records: created };
  }

  async update(
    user: RequestUser,
    id: string,
    input: Partial<HealthCreate>,
    requestId?: string,
  ): Promise<HealthRecordDto> {
    await this.requireRecord(user.farmId, id);
    const row = await this.prisma.healthRecord.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.animalId !== undefined ? { animalId: input.animalId } : {}),
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(input.herdBatchId !== undefined ? { herdBatchId: input.herdBatchId } : {}),
        ...(input.cost !== undefined ? { cost: input.cost } : {}),
        ...(input.performedAt !== undefined ? { performedAt: input.performedAt } : {}),
        ...(input.nextDueAt !== undefined ? { nextDueAt: input.nextDueAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.medicine !== undefined ? { medicine: input.medicine } : {}),
        ...(input.dosage !== undefined ? { dosage: input.dosage } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.vetName !== undefined ? { vetName: input.vetName } : {}),
        ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
        ...(input.followUpAt !== undefined ? { followUpAt: input.followUpAt } : {}),
        ...(input.cmtResult !== undefined ? { cmtResult: input.cmtResult } : {}),
        ...(input.milkWithholdUntil !== undefined
          ? { milkWithholdUntil: input.milkWithholdUntil }
          : {}),
      },
      include: {
        animal: { select: { tag: true, name: true } },
        herdBatch: { select: { name: true } },
      },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'health.update',
      entityType: 'healthRecord',
      entityId: row.id,
      requestId,
    });
    return toDto(row);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    await this.requireRecord(user.farmId, id);
    await this.prisma.healthRecord.delete({ where: { id } });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'health.delete',
      entityType: 'healthRecord',
      entityId: id,
      requestId,
    });
  }

  private async requireRecord(farmId: string, id: string): Promise<HealthRecord> {
    const row = await this.prisma.healthRecord.findFirst({ where: { id, farmId } });
    if (!row) {
      throw new NotFoundException({
        code: 'HEALTH_RECORD_NOT_FOUND',
        message: 'Health record not found',
      });
    }
    return row;
  }
}

function toDto(r: HealthWithRelations): HealthRecordDto {
  return {
    id: r.id,
    farmId: r.farmId,
    type: r.type,
    title: r.title,
    animalId: r.animalId,
    groupId: r.groupId,
    herdBatchId: r.herdBatchId,
    animalTag: r.animal?.tag ?? null,
    animalName: r.animal?.name ?? null,
    herdBatchName: r.herdBatch?.name ?? null,
    cost: r.cost != null ? Number(r.cost) : null,
    medicine: r.medicine,
    dosage: r.dosage,
    method: r.method,
    vetName: r.vetName,
    outcome: r.outcome,
    followUpAt: r.followUpAt?.toISOString() ?? null,
    cmtResult: r.cmtResult,
    milkWithholdUntil: r.milkWithholdUntil?.toISOString() ?? null,
    meatWithholdUntil: r.meatWithholdUntil?.toISOString() ?? null,
    batchNumber: r.batchNumber,
    performedAt: r.performedAt.toISOString(),
    nextDueAt: r.nextDueAt?.toISOString() ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
