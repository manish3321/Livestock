import type { Prisma, TaskPriority, TaskType } from '@prisma/client';

type TaskDb = {
  task: {
    create: (args: { data: Prisma.TaskUncheckedCreateInput }) => Promise<unknown>;
  };
};

/** Idempotent insert: the pending-task unique index turns a repeat into a no-op. */
export async function ensureTask(
  db: TaskDb,
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
): Promise<void> {
  await db.task
    .create({
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
    })
    .catch(() => undefined);
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
