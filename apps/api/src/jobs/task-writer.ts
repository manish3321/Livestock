import type { Prisma, TaskPriority, TaskStatus, TaskType } from '@prisma/client';

type TaskRow = { id: string; status: TaskStatus; dueAt: Date; titleEn: string; titleNp: string };

type TaskDb = {
  task: {
    findFirst: (args: {
      where: Prisma.TaskWhereInput;
      orderBy?: Prisma.TaskOrderByWithRelationInput;
    }) => Promise<TaskRow | null>;
    create: (args: { data: Prisma.TaskUncheckedCreateInput }) => Promise<{ id?: string } | unknown>;
    update: (args: {
      where: { id: string };
      data: Prisma.TaskUncheckedUpdateInput;
    }) => Promise<{ id?: string } | unknown>;
    updateMany: (args: {
      where: Prisma.TaskWhereInput;
      data: Prisma.TaskUncheckedUpdateInput;
    }) => Promise<unknown>;
  };
};

/** Calendar day bounds in UTC for due-day matching (same animal + type + due day). */
export function dueDayBounds(dueAt: Date): { gte: Date; lt: Date } {
  const gte = new Date(Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth(), dueAt.getUTCDate()));
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

/** Dose slots are hours apart on the same calendar day — match the exact due instant. */
const EXACT_DUE_TYPES = new Set<TaskType>(['MEDICATION_DOSE']);

function openTaskWhere(
  data: { farmId: string; type: TaskType; dueAt: Date; animalId?: string | null },
): Prisma.TaskWhereInput {
  const animalId = data.animalId ?? null;
  const dueAt = EXACT_DUE_TYPES.has(data.type)
    ? data.dueAt
    : (() => {
        const { gte, lt } = dueDayBounds(data.dueAt);
        return { gte, lt };
      })();
  return {
    farmId: data.farmId,
    type: data.type,
    status: { in: ['PENDING', 'SNOOZED'] },
    deletedAt: null,
    dueAt,
    ...(animalId ? { animalId } : { animalId: null }),
  };
}

/**
 * Idempotent open-task upsert: one PENDING/SNOOZED row per farm + animal + type + due day
 * (exact dueAt for MEDICATION_DOSE). Updates title/priority/refs on an existing open row
 * instead of inserting a duplicate.
 */
export async function ensureTask(
  db: Pick<TaskDb, 'task'>,
  data: {
    farmId: string;
    type: TaskType;
    titleEn: string;
    titleNp: string;
    dueAt: Date;
    priority?: TaskPriority;
    animalId?: string | null;
    sourceRefType?: string | null;
    sourceRefId?: string | null;
  },
): Promise<string | null> {
  const { gte } = dueDayBounds(data.dueAt);
  const animalId = data.animalId ?? null;
  const where = openTaskWhere(data);

  const existing = await db.task.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    await db.task.update({
      where: { id: existing.id },
      data: {
        titleEn: data.titleEn,
        titleNp: data.titleNp,
        dueAt: data.dueAt,
        dueDayUtc: gte,
        priority: data.priority ?? 'NORMAL',
        sourceRefType: data.sourceRefType ?? null,
        sourceRefId: data.sourceRefId ?? null,
      },
    });
    return existing.id;
  }

  try {
    const row = (await db.task.create({
      data: {
        farmId: data.farmId,
        animalId,
        type: data.type,
        titleEn: data.titleEn,
        titleNp: data.titleNp,
        dueAt: data.dueAt,
        dueDayUtc: gte,
        priority: data.priority ?? 'NORMAL',
        source: 'AUTO',
        sourceRefType: data.sourceRefType ?? null,
        sourceRefId: data.sourceRefId ?? null,
      },
    })) as { id?: string };
    return row?.id ?? null;
  } catch {
    // Race: unique index (or parallel create) — re-read the open row.
    const raced = await db.task.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return raced?.id ?? null;
  }
}

/** Cancel open work because a later event replaced it. History stays readable. */
export async function supersedeOpenTasks(
  db: Pick<TaskDb, 'task'> & { task: Pick<TaskDb['task'], 'updateMany'> },
  where: {
    farmId: string;
    animalId: string;
    types: TaskType[];
  },
  supersededBy?: string | null,
): Promise<void> {
  if (where.types.length === 0) return;
  await db.task.updateMany({
    where: {
      farmId: where.farmId,
      animalId: where.animalId,
      type: { in: where.types },
      status: { in: ['PENDING', 'SNOOZED'] },
    },
    data: { status: 'SUPERSEDED', supersededBy: supersededBy ?? null },
  });
}

export async function completeOpenTasksOfType(
  db: Pick<TaskDb, 'task'> & { task: Pick<TaskDb['task'], 'updateMany'> },
  where: {
    farmId: string;
    animalId: string;
    types: TaskType[];
  },
  userId: string,
): Promise<void> {
  if (where.types.length === 0) return;
  await db.task.updateMany({
    where: {
      farmId: where.farmId,
      animalId: where.animalId,
      type: { in: where.types },
      status: { in: ['PENDING', 'SNOOZED'] },
    },
    data: { status: 'DONE', completedAt: new Date(), completedById: userId },
  });
}

export async function completeOpenTask(
  db: {
    task: {
      findFirst: (args: {
        where: Prisma.TaskWhereInput;
      }) => Promise<{ id: string } | null>;
      update: (args: {
        where: { id: string };
        data: Prisma.TaskUncheckedUpdateInput;
      }) => Promise<unknown>;
    };
  },
  where: {
    farmId: string;
    type: TaskType;
    animalId?: string;
    sourceRefId?: string;
  },
  userId: string,
): Promise<void> {
  const task = await db.task.findFirst({
    where: {
      farmId: where.farmId,
      type: where.type,
      status: { in: ['PENDING', 'SNOOZED'] },
      ...(where.animalId ? { animalId: where.animalId } : {}),
      ...(where.sourceRefId ? { sourceRefId: where.sourceRefId } : {}),
    },
  });
  if (!task) return;
  await db.task.update({
    where: { id: task.id },
    data: { status: 'DONE', completedAt: new Date(), completedById: userId },
  });
}

export const PROTOCOL_TASK_IDS: Record<string, string> = {
  FMD: '00000000-0000-4000-8000-0000000000f1',
  HS: '00000000-0000-4000-8000-0000000000f2',
  BQ: '00000000-0000-4000-8000-0000000000f3',
  BRUCELLOSIS: '00000000-0000-4000-8000-0000000000f4',
  BRUCELLA: '00000000-0000-4000-8000-0000000000f4',
  DEWORMING: '00000000-0000-4000-8000-0000000000f5',
  DEWORM: '00000000-0000-4000-8000-0000000000f5',
  ANTHRAX: '00000000-0000-4000-8000-0000000000f6',
  ECTOPARASITE: '00000000-0000-4000-8000-0000000000f7',
};
