import type { Prisma, TaskPriority, TaskType } from '@prisma/client';

type TaskDb = {
  task: {
    create: (args: { data: Prisma.TaskUncheckedCreateInput }) => Promise<{ id?: string } | unknown>;
    updateMany: (args: {
      where: Prisma.TaskWhereInput;
      data: Prisma.TaskUncheckedUpdateInput;
    }) => Promise<unknown>;
  };
};

/** Idempotent insert: the pending-task unique index turns a repeat into a no-op. */
export async function ensureTask(
  db: Pick<TaskDb, 'task'> & { task: Pick<TaskDb['task'], 'create'> },
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
  try {
    const row = (await db.task.create({
      data: {
        farmId: data.farmId,
        animalId: data.animalId ?? null,
        type: data.type,
        titleEn: data.titleEn,
        titleNp: data.titleNp,
        dueAt: data.dueAt,
        priority: data.priority ?? 'NORMAL',
        source: 'AUTO',
        sourceRefType: data.sourceRefType ?? null,
        sourceRefId: data.sourceRefId ?? null,
      },
    })) as { id?: string };
    return row?.id ?? null;
  } catch {
    return null;
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
