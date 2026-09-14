import type { CachedTask, FarmStore } from './store';

const LOCAL_ALERT_TYPES = new Set(['COLOSTRUM_FEED', 'VACCINATION_DUE']);

export interface LocalAlert {
  id: string;
  taskId: string;
  type: string;
  title: string;
  body: string;
  fireAt: number;
}

/**
 * The notification engine runs on the device. Alerts already pulled onto the
 * phone still fire after three days with no signal.
 */
export function alertsFromTasks(tasks: CachedTask[], now = new Date(), locale: 'en' | 'ne' = 'ne'): LocalAlert[] {
  const nowMs = now.getTime();
  const alerts: LocalAlert[] = [];
  for (const task of tasks) {
    if (task.status !== 'PENDING' && task.status !== 'SNOOZED') continue;
    if (!LOCAL_ALERT_TYPES.has(task.type)) continue;
    const fireAt = new Date(task.dueAt).getTime();
    if (!Number.isFinite(fireAt)) continue;
    if (fireAt < nowMs - 60_000) continue;
    alerts.push({
      id: `task:${task.id}`,
      taskId: task.id,
      type: task.type,
      title: locale === 'ne' ? task.titleNp : task.titleEn,
      body: task.type === 'COLOSTRUM_FEED' ? (locale === 'ne' ? 'पहुँलो दूध खुवाउनुहोस्' : 'Feed colostrum now') : locale === 'ne' ? 'खोप दिनुहोस्' : 'Vaccinate today',
      fireAt,
    });
  }
  return alerts.sort((a, b) => a.fireAt - b.fireAt);
}

export function alertsFromStore(store: FarmStore, now = new Date(), locale: 'en' | 'ne' = 'ne'): LocalAlert[] {
  return alertsFromTasks([...store.tasks.values()], now, locale);
}

export interface NotificationEngine {
  schedule(alerts: LocalAlert[]): Promise<void>;
  cancelAll(): Promise<void>;
}

export async function syncLocalAlerts(
  engine: NotificationEngine,
  store: FarmStore,
  now = new Date(),
  locale: 'en' | 'ne' = 'ne',
): Promise<LocalAlert[]> {
  const alerts = alertsFromStore(store, now, locale);
  await engine.cancelAll();
  await engine.schedule(alerts);
  return alerts;
}
