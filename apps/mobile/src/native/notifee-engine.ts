import * as Notifications from 'expo-notifications';
import type { LocalAlert, NotificationEngine } from '../core/notify';
import { MemoryNotificationEngine } from './memory-notification-engine';

function channelFor(type: string): string {
  if (type === 'COLOSTRUM_FEED' || type === 'CALVING_WATCH' || type === 'VET_URGENT') {
    return 'farm-critical';
  }
  return 'farm-default';
}

/**
 * Schedules local OS notifications from cached tasks so critical reminders
 * still fire when the phone is offline for a few days.
 */
export class ExpoNotificationEngine implements NotificationEngine {
  async schedule(alerts: LocalAlert[]): Promise<void> {
    await this.cancelAll();
    const now = Date.now();
    for (const alert of alerts.slice(0, 64)) {
      const seconds = Math.max(1, Math.round((alert.fireAt - now) / 1000));
      if (seconds > 60 * 60 * 24 * 14) continue;
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: alert.title,
            body: alert.body,
            data: { taskId: alert.taskId, type: alert.type },
            sound: true,
          },
          trigger: {
            seconds,
            channelId: channelFor(alert.type),
          },
        });
      } catch {
        /* skip individual schedule failures */
      }
    }
  }

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}

export async function createNotifeeEngine(): Promise<NotificationEngine> {
  try {
    return new ExpoNotificationEngine();
  } catch {
    return new MemoryNotificationEngine();
  }
}

export { MemoryNotificationEngine } from './memory-notification-engine';
