import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  PageResult,
  TaskComplete,
  TaskDismiss,
  TaskDto,
  TaskListQuery,
  TaskReassign,
  TaskSnooze,
  TaskType,
} from '@farm/contracts';
import type { Task } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { PrismaService } from '../prisma/prisma.service';
import { offerMute } from '../notifications/notification-rules';

const SNOOZE_MS: Record<TaskSnooze['preset'], number> = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

const ACTION_PATH: Record<TaskType, string> = {
  VACCINATION_DUE: '/health?type=VACCINATION',
  MEDICATION_DOSE: '/health?type=TREATMENT',
  COLOSTRUM_FEED: '/breeding?form=colostrum',
  CALVING_WATCH: '/breeding?form=calving',
  HEAT_WATCH: '/breeding?form=heat',
  SILENT_HEAT_CHECK: '/breeding?form=heat',
  SERVICE_WINDOW: '/breeding?form=service',
  PREGNANCY_CHECK: '/breeding?form=pd',
  DRY_OFF: '/animals',
  POSTPARTUM_CHECK: '/health?type=CHECKUP',
  REPEAT_BREEDER: '/breeding?form=service',
  VET_URGENT: '/health?type=TREATMENT',
  MILK_WITHHOLD_END: '/shed',
  STOCK_REORDER: '/inventory',
  LOT_EXPIRING: '/inventory',
  MISSING_PRODUCTION: '/shed',
  YIELD_DROP: '/shed',
  STOCK_RECONCILE: '/inventory',
  TANK_VARIANCE: '/shed',
  APPLY_MARKER: '/shed?mode=MARKER_PLACEMENT',
  REMOVE_MARKER: '/shed?mode=MARKER_PLACEMENT',
  RETAG_REQUIRED: '/animals',
  TREATMENT_FOLLOWUP: '/health?type=TREATMENT',
};

const SCAN_ONLY_TASKS = new Set<TaskType>(['APPLY_MARKER', 'REMOVE_MARKER']);

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly notifications?: NotificationDispatchService,
  ) {}

  async list(user: RequestUser, query: TaskListQuery): Promise<PageResult<TaskDto>> {
    const where = {
      farmId: user.farmId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : { status: { in: ['PENDING', 'SNOOZED'] as Array<'PENDING' | 'SNOOZED'> } }),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dueBefore ? { dueAt: { lte: query.dueBefore } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: { animal: { select: { herdNumber: true, name: true } } },
        orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      items: rows.map((r) => toDto(r)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async complete(
    user: RequestUser,
    id: string,
    input: TaskComplete = {},
    requestId?: string,
  ): Promise<TaskDto> {
    const task = await this.requirePending(user.farmId, id);
    if (SCAN_ONLY_TASKS.has(task.type) && !input.byScan) {
      throw new UnprocessableEntityException({
        code: 'SCAN_REQUIRED',
        message: 'This band task can only be completed by scanning the animal',
      });
    }
    const row = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        completedById: user.id,
      },
      include: { animal: { select: { herdNumber: true, name: true } } },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'tasks.complete',
      entityType: 'task',
      entityId: id,
      requestId,
    });
    await this.notifications?.acknowledge(user.farmId, id);
    return toDto(row);
  }

  async snooze(
    user: RequestUser,
    id: string,
    input: TaskSnooze,
    requestId?: string,
  ): Promise<TaskDto> {
    const task = await this.requirePending(user.farmId, id);
    if (task.snoozeCount >= 3) {
      throw new BadRequestException({
        code: 'SNOOZE_EXHAUSTED',
        message: 'This reminder has been delayed three times. Do it or dismiss it.',
      });
    }
    const until = new Date(Date.now() + (SNOOZE_MS[input.preset] ?? SNOOZE_MS['1h']));
    const row = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'SNOOZED',
        snoozedUntil: until,
        snoozeCount: task.snoozeCount + 1,
        dueAt: until,
      },
      include: { animal: { select: { herdNumber: true, name: true } } },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'tasks.snooze',
      entityType: 'task',
      entityId: id,
      metadata: { preset: input.preset },
      requestId,
    });
    return toDto(row);
  }

  async dismiss(
    user: RequestUser,
    id: string,
    input: TaskDismiss,
    requestId?: string,
  ): Promise<TaskDto> {
    const task = await this.requirePending(user.farmId, id);
    const row = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'DISMISSED',
        dismissReason: input.reason,
        dismissNote: input.note,
        completedById: user.id,
        completedAt: new Date(),
      },
      include: { animal: { select: { herdNumber: true, name: true } } },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'tasks.dismiss',
      entityType: 'task',
      entityId: id,
      metadata: { reason: input.reason },
      requestId,
    });
    await this.notifications?.acknowledge(user.farmId, id);
    const dismissals = await this.prisma.task.count({
      where: {
        farmId: user.farmId,
        type: task.type,
        status: 'DISMISSED',
        completedById: user.id,
      },
    });
    return toDto(row, { offerMute: offerMute(dismissals) });
  }

  async reassign(
    user: RequestUser,
    id: string,
    input: TaskReassign,
    requestId?: string,
  ): Promise<TaskDto> {
    const task = await this.requirePending(user.farmId, id);
    const row = await this.prisma.task.update({
      where: { id: task.id },
      data: { assignedToId: input.assignedToId },
      include: { animal: { select: { herdNumber: true, name: true } } },
    });
    await this.audit.record({
      farmId: user.farmId,
      userId: user.id,
      action: 'tasks.reassign',
      entityType: 'task',
      entityId: id,
      requestId,
    });
    return toDto(row);
  }

  private async requirePending(farmId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, farmId, deletedAt: null },
    });
    if (!task) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found' });
    }
    if (task.status !== 'PENDING' && task.status !== 'SNOOZED') {
      throw new BadRequestException({
        code: 'TASK_NOT_OPEN',
        message: 'Only open reminders can be changed',
      });
    }
    return task;
  }
}

function toDto(
  r: Task & { animal?: { herdNumber: string | null; name: string | null } | null },
  extra?: { offerMute?: boolean },
): TaskDto {
  return {
    id: r.id,
    farmId: r.farmId,
    animalId: r.animalId,
    animalHerdNumber: r.animal?.herdNumber ?? null,
    animalName: r.animal?.name ?? null,
    batchId: r.batchId,
    type: r.type as TaskType,
    titleEn: r.titleEn,
    titleNp: r.titleNp,
    dueAt: r.dueAt.toISOString(),
    priority: r.priority,
    status: r.status,
    assignedToId: r.assignedToId,
    source: r.source,
    sourceRefType: r.sourceRefType,
    sourceRefId: r.sourceRefId,
    snoozeCount: r.snoozeCount,
    snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    dismissReason: r.dismissReason,
    actionPath: buildActionPath(
      r.type as TaskType,
      r.animalId,
      r.sourceRefType,
      r.sourceRefId,
      r.id,
    ),
    ...(extra?.offerMute ? { offerMute: true } : {}),
  };
}

function buildActionPath(
  type: TaskType,
  animalId: string | null,
  sourceRefType: string | null,
  sourceRefId: string | null,
  taskId?: string,
): string {
  const base = ACTION_PATH[type] ?? '/inbox';
  const params = new URLSearchParams();
  if (animalId) params.set('animalId', animalId);
  if (taskId && type === 'COLOSTRUM_FEED') params.set('taskId', taskId);
  if (sourceRefType === 'breedingRecord' && sourceRefId) {
    params.set('breedingId', sourceRefId);
  }
  const qs = params.toString();
  if (!qs) return base;
  return base.includes('?') ? `${base}&${qs}` : `${base}?${qs}`;
}
