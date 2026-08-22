import { Injectable, NotFoundException } from '@nestjs/common';
import {
  HEALTH_DEFAULT_INTERVAL_DAYS,
  type HealthCreate,
  type HealthListQuery,
  type PageResult,
} from '@farm/contracts';
import type { HealthRecord, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

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

    return toDto(row);
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
    performedAt: r.performedAt.toISOString(),
    nextDueAt: r.nextDueAt?.toISOString() ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
