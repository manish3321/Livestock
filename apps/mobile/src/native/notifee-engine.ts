import type { LocalAlert, NotificationEngine } from '../core/notify';

/** In-memory alerts for Expo Go. Native Notifee/FCM is wired in EAS builds later. */
export class MemoryNotificationEngine implements NotificationEngine {
  scheduled: LocalAlert[] = [];

  async schedule(alerts: LocalAlert[]): Promise<void> {
    this.scheduled = [...alerts];
  }

  async cancelAll(): Promise<void> {
    this.scheduled = [];
  }
}

export async function createNotifeeEngine(): Promise<NotificationEngine> {
  return new MemoryNotificationEngine();
}
