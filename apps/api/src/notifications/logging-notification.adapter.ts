import { Injectable, Logger } from '@nestjs/common';
import type { NotificationPort, PushMessage } from './notification.port';

/** Used in development and whenever Firebase credentials are absent. */
@Injectable()
export class LoggingNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('Notifications');

  async sendToDevice(fcmToken: string, message: PushMessage): Promise<void> {
    this.logger.log(
      `push -> ${fcmToken.slice(0, 12)}…: ${message.title} — ${message.body}`,
    );
  }
}
