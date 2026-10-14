import type { TaskType } from '@prisma/client';

/** Work tied to one moment (a heat, a dose, a feed). A few days late it can no longer be done. */
export const MOMENT_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>([
  'HEAT_WATCH',
  'SILENT_HEAT_CHECK',
  'SERVICE_WINDOW',
  'COLOSTRUM_FEED',
  'FEED_TRANSITION',
  'MEDICATION_DOSE',
  'SYNC_INJECTION',
  'SYNC_AI',
]);

export const MOMENT_EXPIRY_DAYS = 3;

export interface OpenTaskRow {
  id: string;
  animalId: string | null;
  type: TaskType;
  sourceRefType: string | null;
  dueAt: Date;
}

/**
 * Reminder-ladder steps (`rule:*`, e.g. calving in 7 / 3 / 1 days) for the same animal
 * and task type: once a later step is due, the earlier ones only repeat it.
 * Returns the ids of the earlier steps.
 */
export function staleLadderStepIds(rows: OpenTaskRow[], now: Date): string[] {
  const latest = new Map<string, OpenTaskRow>();
  const due = rows.filter(
    (r) => r.animalId && r.sourceRefType?.startsWith('rule:') && r.dueAt.getTime() <= now.getTime(),
  );
  for (const row of due) {
    const key = `${row.animalId}|${row.type}`;
    const kept = latest.get(key);
    if (!kept || row.dueAt.getTime() > kept.dueAt.getTime()) latest.set(key, row);
  }
  return due.filter((row) => latest.get(`${row.animalId}|${row.type}`) !== row).map((row) => row.id);
}
