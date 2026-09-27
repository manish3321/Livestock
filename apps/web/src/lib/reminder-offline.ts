import type { TaskDismissReason, TaskDto } from '@farm/contracts';
import { completeTask, dismissTask } from '../api/tasks';

const TASKS_KEY = 'farm.reminders.tasks';
const QUEUE_KEY = 'farm.reminders.queue';
const FIRED_KEY = 'farm.reminders.fired';
export const OFFLINE_TASK_HORIZON_DAYS = 30;

const NEVER_BATCH = new Set(['COLOSTRUM_FEED', 'CALVING_WATCH', 'VET_URGENT', 'SYNC_INJECTION']);
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderQueuedOp =
  | { kind: 'complete'; taskId: string }
  | { kind: 'dismiss'; taskId: string; reason: TaskDismissReason };

export type LocalReminder = {
  id: string;
  title: string;
  body: string;
  taskIds: string[];
  priority: string;
};

/** Cache open work due in the next 30 days so the phone can fire without signal. */
export function cacheTasksForOffline(tasks: TaskDto[], now = new Date()): TaskDto[] {
  const horizon = now.getTime() + OFFLINE_TASK_HORIZON_DAYS * DAY_MS;
  const open = tasks.filter(
    (task) =>
      (task.status === 'PENDING' || task.status === 'SNOOZED') &&
      new Date(task.dueAt).getTime() <= horizon,
  );
  localStorage.setItem(TASKS_KEY, JSON.stringify(open));
  return open;
}

export function readCachedTasks(): TaskDto[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? (JSON.parse(raw) as TaskDto[]) : [];
  } catch {
    return [];
  }
}

export function readFiredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markFired(ids: string[]): void {
  const next = readFiredIds();
  for (const id of ids) next.add(id);
  localStorage.setItem(FIRED_KEY, JSON.stringify([...next]));
}

export function dueLocalReminders(tasks: TaskDto[], now: Date, fired: Set<string>): TaskDto[] {
  return tasks.filter(
    (task) =>
      !fired.has(task.id) &&
      (task.status === 'PENDING' || task.status === 'SNOOZED') &&
      new Date(task.dueAt).getTime() <= now.getTime(),
  );
}

/** Quiet hours 20:00–05:00 Nepal clock, same exceptions as the server. */
export function holdLocalReminder(input: {
  priority: string;
  hour: number;
  type: string;
  silentHeatOptIn?: boolean;
}): boolean {
  if (input.priority === 'CRITICAL') return false;
  if (input.type === 'SILENT_HEAT_CHECK' && input.silentHeatOptIn && input.hour === 4) return false;
  return input.hour >= 20 || input.hour < 5;
}

export function groupLocalReminders(tasks: TaskDto[], lang: 'en' | 'ne' = 'en'): LocalReminder[] {
  const singles: LocalReminder[] = [];
  const buckets = new Map<string, TaskDto[]>();
  for (const task of tasks) {
    if (NEVER_BATCH.has(task.type)) {
      singles.push({
        id: task.id,
        title: lang === 'ne' ? task.titleNp : task.titleEn,
        body: lang === 'ne' ? task.titleNp : task.titleEn,
        taskIds: [task.id],
        priority: task.priority,
      });
      continue;
    }
    const list = buckets.get(task.type) ?? [];
    list.push(task);
    buckets.set(task.type, list);
  }
  const grouped = [...buckets.values()].map((group) => {
    const first = group[0]!;
    if (group.length === 1) {
      return {
        id: first.id,
        title: lang === 'ne' ? first.titleNp : first.titleEn,
        body: lang === 'ne' ? first.titleNp : first.titleEn,
        taskIds: [first.id],
        priority: first.priority,
      };
    }
    return {
      id: first.id,
      title:
        lang === 'ne'
          ? `आज बिहान ${group.length} पशुको गर्मी हेर्नुहोस्`
          : groupTitleEn(first.type, group.length),
      body: lang === 'ne' ? first.titleNp : first.titleEn,
      taskIds: group.map((row) => row.id),
      priority: first.priority,
    };
  });
  return [...grouped, ...singles];
}

function groupTitleEn(type: string, n: number): string {
  if (type === 'HEAT_WATCH') return `${n} animals to check for heat this morning`;
  if (type === 'SILENT_HEAT_CHECK') return `${n} animals to check for silent heat`;
  if (type === 'PREGNANCY_CHECK') return `${n} animals due for pregnancy check`;
  return `${n} animals: ${type.replace(/_/g, ' ').toLowerCase()}`;
}

/** SMS and voice need a tower. Offline always degrades to local push. */
export function localDeliveryChannel(): 'PUSH' {
  return 'PUSH';
}

/** SMS on reconnect only if the task is still open — never a late bill for finished work. */
export function smsOnReconnect(online: boolean, stillPending: boolean): boolean {
  return online && stillPending;
}

export function enqueueReminderOp(op: ReminderQueuedOp): void {
  const queue = readReminderQueue();
  queue.push(op);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function readReminderQueue(): ReminderQueuedOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ReminderQueuedOp[]) : [];
  } catch {
    return [];
  }
}

export async function flushReminderQueue(): Promise<void> {
  const pending = readReminderQueue();
  if (pending.length === 0) return;
  const leftover: ReminderQueuedOp[] = [];
  for (const op of pending) {
    try {
      if (op.kind === 'complete') await completeTask(op.taskId);
      else await dismissTask(op.taskId, { reason: op.reason });
    } catch {
      leftover.push(op);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(leftover));
}

export function collectDueLocalPushes(
  tasks: TaskDto[],
  now: Date,
  hour: number,
  silentHeatOptIn = true,
  lang: 'en' | 'ne' = 'en',
): LocalReminder[] {
  const due = dueLocalReminders(tasks, now, readFiredIds()).filter(
    (task) =>
      !holdLocalReminder({
        priority: task.priority,
        hour,
        type: task.type,
        silentHeatOptIn,
      }),
  );
  return groupLocalReminders(due, lang);
}
