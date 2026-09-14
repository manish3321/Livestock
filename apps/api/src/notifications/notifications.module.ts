import { Global, Module } from '@nestjs/common';
import { FcmNotificationAdapter, parseServiceAccount } from './fcm-notification.adapter';
import { LoggingNotificationAdapter } from './logging-notification.adapter';
import { DevicesController, NotificationsController } from './notifications.controller';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NOTIFICATION_PORT } from './notification.port';

function notificationAdapter() {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!json) return new LoggingNotificationAdapter();
  try {
    parseServiceAccount(json);
    return new FcmNotificationAdapter(json);
  } catch {
    return new LoggingNotificationAdapter();
  }
}

/**
 * Firebase Cloud Messaging via HTTP v1 when FCM_SERVICE_ACCOUNT_JSON is set;
 * otherwise the logging adapter. SMS and voice stay on the logging sink.
 */
@Global()
@Module({
  controllers: [DevicesController, NotificationsController],
  providers: [
    { provide: NOTIFICATION_PORT, useFactory: notificationAdapter },
    NotificationDispatchService,
  ],
  exports: [NOTIFICATION_PORT, NotificationDispatchService],
})
export class NotificationsModule {}
