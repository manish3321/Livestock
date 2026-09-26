import { Global, Module } from '@nestjs/common';
import { CompositeNotificationAdapter } from './composite-notification.adapter';
import { FcmNotificationAdapter, parseServiceAccount } from './fcm-notification.adapter';
import { DevicesController, NotificationsController } from './notifications.controller';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NOTIFICATION_PORT } from './notification.port';

function notificationAdapter() {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  let fcm: FcmNotificationAdapter | null = null;
  if (json) {
    try {
      parseServiceAccount(json);
      fcm = new FcmNotificationAdapter(json);
    } catch {
      fcm = null;
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const twilio = sid && token && from ? { accountSid: sid, authToken: token, from } : null;

  // Always use composite so Expo Push tokens work without FCM credentials.
  return new CompositeNotificationAdapter(fcm, twilio);
}

/**
 * FCM / Expo push when credentials exist; Twilio SMS when configured;
 * otherwise logging. Voice stays on the logging sink.
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
