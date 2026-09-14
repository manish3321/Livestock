import type { LocalAlert, NotificationEngine } from '../core/notify';

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
  try {
    const mod = await import('@notifee/react-native');
    const notifee = mod.default;
    const channelId = await notifee.createChannel({
      id: 'shed-critical',
      name: 'Shed alerts',
      importance: mod.AndroidImportance.HIGH,
    });
    await notifee.requestPermission();
    return {
      async schedule(alerts: LocalAlert[]) {
        for (const alert of alerts) {
          await notifee.createTriggerNotification(
            {
              id: alert.id,
              title: alert.title,
              body: alert.body,
              android: { channelId },
            },
            { type: mod.TriggerType.TIMESTAMP, timestamp: alert.fireAt },
          );
        }
      },
      async cancelAll() {
        await notifee.cancelAllNotifications();
      },
    };
  } catch {
    return new MemoryNotificationEngine();
  }
}
