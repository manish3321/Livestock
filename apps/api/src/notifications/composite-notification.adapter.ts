import { Injectable, Logger } from '@nestjs/common';
import { FcmNotificationAdapter } from './fcm-notification.adapter';
import { LoggingNotificationAdapter } from './logging-notification.adapter';
import type { NotificationPort, PushMessage, SmsMessage, VoiceCall } from './notification.port';

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/**
 * Routes device tokens to Expo Push API (Expo Go / EAS Expo tokens) or FCM HTTP v1
 * (native FCM/APNs device tokens). SMS uses Twilio when configured.
 */
@Injectable()
export class CompositeNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('Notifications');
  private readonly log = new LoggingNotificationAdapter();

  constructor(
    private readonly fcm: FcmNotificationAdapter | null,
    private readonly twilio: {
      accountSid: string;
      authToken: string;
      from: string;
    } | null,
  ) {}

  async sendToDevice(token: string, message: PushMessage): Promise<void> {
    if (isExpoPushToken(token)) {
      await this.sendExpo(token, message);
      return;
    }
    if (this.fcm) {
      await this.fcm.sendToDevice(token, message);
      return;
    }
    await this.log.sendToDevice(token, message);
  }

  async sendSms(message: SmsMessage): Promise<void> {
    if (!this.twilio) {
      await this.log.sendSms(message);
      return;
    }
    const auth = Buffer.from(`${this.twilio.accountSid}:${this.twilio.authToken}`).toString('base64');
    const body = new URLSearchParams({
      To: message.to,
      From: this.twilio.from,
      Body: message.body,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.twilio.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Twilio SMS ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  async enqueueVoice(call: VoiceCall): Promise<void> {
    return this.log.enqueueVoice(call);
  }

  private async sendExpo(token: string, message: PushMessage): Promise<void> {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: 'default',
        priority: 'high',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Expo push ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
