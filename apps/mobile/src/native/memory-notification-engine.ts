import type { LocalAlert, NotificationEngine } from '../core/notify';

/** In-memory fallback when expo-notifications is unavailable. */
export class MemoryNotificationEngine implements NotificationEngine {
  scheduled: LocalAlert[] = [];

  async schedule(alerts: LocalAlert[]): Promise<void> {
    this.scheduled = [...alerts];
  }

  async cancelAll(): Promise<void> {
    this.scheduled = [];
  }
}
