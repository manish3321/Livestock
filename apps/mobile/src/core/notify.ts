import type { CachedTask, FarmStore } from './store';

const LOCAL_ALERT_TYPES = new Set([
  'COLOSTRUM_FEED',
  'CALVING_WATCH',
  'VET_URGENT',
  'VACCINATION_DUE',
  'MEDICATION_DOSE',
  'SERVICE_WINDOW',
  'HEAT_WATCH',
  'STOCK_REORDER',
  'EXPENSE_APPROVAL',
  'UNPAID_REVENUE',
]);

function alertBody(type: string, locale: 'en' | 'ne'): string {
  const en: Record<string, string> = {
    COLOSTRUM_FEED: 'Feed colostrum now',
    CALVING_WATCH: 'Calving watch — check the animal',
    VET_URGENT: 'Urgent veterinary attention needed',
    VACCINATION_DUE: 'Vaccinate today',
    MEDICATION_DOSE: 'Medication dose due',
    SERVICE_WINDOW: 'Breeding window is open',
    HEAT_WATCH: 'Watch for heat',
    STOCK_REORDER: 'Stock is low — reorder',
    EXPENSE_APPROVAL: 'Expense waiting for approval',
    UNPAID_REVENUE: 'Payment still outstanding',
  };
  const ne: Record<string, string> = {
    COLOSTRUM_FEED: 'पहुँलो दूध खुवाउनुहोस्',
    CALVING_WATCH: 'ब्याउने समय — जाँच गर्नुहोस्',
    VET_URGENT: 'जरुरी पशुचिकित्सक चाहिन्छ',
    VACCINATION_DUE: 'खोप दिनुहोस्',
    MEDICATION_DOSE: 'औषधि खुवाउने समय',
    SERVICE_WINDOW: 'सेवा गर्ने समय खुला छ',
    HEAT_WATCH: 'गर्मी हेर्नुहोस्',
    STOCK_REORDER: 'स्टक कम — अर्डर गर्नुहोस्',
    EXPENSE_APPROVAL: 'खर्च स्वीकृत बाँकी',
    UNPAID_REVENUE: 'भुक्तानी बाँकी',
  };
  return (locale === 'ne' ? ne : en)[type] ?? (locale === 'ne' ? 'काम बाँकी' : 'Task due');
}

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
      body: alertBody(task.type, locale),
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
