import { Global, Module } from '@nestjs/common';
import { LoggingNotificationAdapter } from './logging-notification.adapter';
import { NOTIFICATION_PORT } from './notification.port';

/**
 * Firebase Cloud Messaging integration point. The concrete FCM adapter
 * (firebase-admin) is added when push notifications land in a later slice;
 * consumers depend only on NOTIFICATION_PORT.
 */
@Global()
@Module({
  providers: [{ provide: NOTIFICATION_PORT, useClass: LoggingNotificationAdapter }],
  exports: [NOTIFICATION_PORT],
})
export class NotificationsModule {}
