import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GroupCreate,
  GroupUpdate,
  MortalityCreate,
  PageQuery,
  PageResult,
} from '@farm/contracts';
import type { AnimalGroup, GroupMortalityEvent } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export interface GroupDto {
  id: string;
  farmId: string;
  name: string;
  poultryType: string;
  breed: string;
  initialCount: number;
  currentCount: number;
  startedAt: string;
  healthStatus: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MortalityDto {
  id: string;
  groupId: string;
  count: number;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, query: PageQuery): Promise<PageResult<GroupDto>> {
    const where = { farmId: user.farmId, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.animalGroup.findMany({
        where,
        orderBy: { name: query.order ?? 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.animalGroup.count({ where }),
    ]);
    return {
      items: rows.map(toDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(user: RequestUser, id: string): Promise<GroupDto> {
    return toDto(await this.requireGroup(user.farmId, id));
  }

  async create(
    user: RequestUser,
    input: GroupCreate,
    requestId?: string,
  ): Promise<GroupDto> {
    const group = await this.prisma.animalGroup.create({
      data: {
        farmId: user.farmId,
        name: input.name,
        poultryType: input.poultryType,
        breed: input.breed,
        initialCount: input.initialCount,
        currentCount: input.initialCount,
        startedAt: input.startedAt,
        healthStatus: input.healthStatus,
        notes: input.notes,
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'groups.create',
      entityType: 'animalGroup',
      entityId: group.id,
      requestId,
    });

    return toDto(group);
  }

  async update(
    user: RequestUser,
    id: string,
    input: GroupUpdate,
    requestId?: string,
  ): Promise<GroupDto> {
    await this.requireGroup(user.farmId, id);
    const group = await this.prisma.animalGroup.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.poultryType !== undefined ? { poultryType: input.poultryType } : {}),
        ...(input.breed !== undefined ? { breed: input.breed } : {}),
        ...(input.initialCount !== undefined ? { initialCount: input.initialCount } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.healthStatus !== undefined ? { healthStatus: input.healthStatus } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'groups.update',
      entityType: 'animalGroup',
      entityId: group.id,
      requestId,
    });

    return toDto(group);
  }

  async remove(user: RequestUser, id: string, requestId?: string): Promise<void> {
    await this.requireGroup(user.farmId, id);
    await this.prisma.animalGroup.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'groups.delete',
      entityType: 'animalGroup',
      entityId: id,
      requestId,
    });
  }

  async addMortality(
    user: RequestUser,
    groupId: string,
    input: MortalityCreate,
    requestId?: string,
  ): Promise<MortalityDto> {
    const group = await this.requireGroup(user.farmId, groupId);
    const nextCount = Math.max(0, group.currentCount - input.count);

    const event = await this.prisma.$transaction(async (tx) => {
      await tx.animalGroup.update({
        where: { id: groupId },
        data: { currentCount: nextCount },
      });
      return tx.groupMortalityEvent.create({
        data: {
          farmId: user.farmId,
          groupId,
          count: input.count,
          reason: input.reason,
          occurredAt: input.occurredAt,
        },
      });
    });

    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'groups.mortality',
      entityType: 'animalGroup',
      entityId: groupId,
      metadata: { count: input.count, currentCount: nextCount },
      requestId,
    });

    return toMortalityDto(event);
  }

  private async requireGroup(farmId: string, id: string): Promise<AnimalGroup> {
    const group = await this.prisma.animalGroup.findFirst({
      where: { id, farmId, deletedAt: null },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }
    return group;
  }
}

function toDto(g: AnimalGroup): GroupDto {
  return {
    id: g.id,
    farmId: g.farmId,
    name: g.name,
    poultryType: g.poultryType,
    breed: g.breed,
    initialCount: g.initialCount,
    currentCount: g.currentCount,
    startedAt: g.startedAt.toISOString(),
    healthStatus: g.healthStatus,
    notes: g.notes,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    deletedAt: g.deletedAt?.toISOString() ?? null,
  };
}

function toMortalityDto(e: GroupMortalityEvent): MortalityDto {
  return {
    id: e.id,
    groupId: e.groupId,
    count: e.count,
    reason: e.reason,
    occurredAt: e.occurredAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}
