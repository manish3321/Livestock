import { Global, Module } from '@nestjs/common';
import { CompositeNotificationAdapter, type SmsConfig } from './composite-notification.adapter';
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

  // Always use composite so Expo Push tokens work without FCM credentials.
  return new CompositeNotificationAdapter(fcm, smsConfig());
}

/** Sparrow (Nepal) wins when its token is set; Twilio is the fallback. */
function smsConfig(): SmsConfig | null {
  const sparrowToken = process.env.SPARROW_SMS_TOKEN?.trim();
  const sparrowFrom = process.env.SPARROW_SMS_FROM?.trim();
  if (sparrowToken && sparrowFrom) {
    return { provider: 'sparrow', token: sparrowToken, from: sparrowFrom };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  return sid && token && from ? { provider: 'twilio', accountSid: sid, authToken: token, from } : null;
}

/**
 * FCM / Expo push when credentials exist; Sparrow or Twilio SMS when configured;
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
