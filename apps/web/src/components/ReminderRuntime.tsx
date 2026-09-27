import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listUpcomingTasks } from '../api/tasks';
import {
  cacheTasksForOffline,
  collectDueLocalPushes,
  flushReminderQueue,
  markFired,
  readCachedTasks,
} from '../lib/reminder-offline';

function nepalHour(now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? '0');
}

function showLocalPush(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  new Notification(title, { body, tag: title });
}

/**
 * Tasks for the next 30 days live on the device. Due work fires as a local
 * push with no signal; completions upload when the tower is back.
 */
export function ReminderRuntime() {
  const { i18n } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    const lang = i18n.language === 'ne' ? 'ne' : 'en';

    const refresh = async () => {
      try {
        const page = await listUpcomingTasks();
        if (!cancelled) cacheTasksForOffline(page.items);
      } catch {
        /* keep the last cache */
      }
    };

    const tick = () => {
      const due = collectDueLocalPushes(readCachedTasks(), new Date(), nepalHour(new Date()), true, lang);
      for (const row of due) {
        showLocalPush(row.title, row.body);
        markFired(row.taskIds);
      }
    };

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    void refresh().then(tick);
    const interval = window.setInterval(tick, 60_000);
    const onOnline = () => {
      void flushReminderQueue();
      void refresh();
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [i18n.language]);

  return null;
}
