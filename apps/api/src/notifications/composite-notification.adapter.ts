import { Injectable, Logger } from '@nestjs/common';
import { FcmNotificationAdapter } from './fcm-notification.adapter';
import { LoggingNotificationAdapter } from './logging-notification.adapter';
import type {
  EmailMessage,
  NotificationPort,
  PushMessage,
  SmsMessage,
  VoiceCall,
} from './notification.port';

export type SmsConfig =
  | { provider: 'sparrow'; token: string; from: string }
  | { provider: 'twilio'; accountSid: string; authToken: string; from: string };

export type EmailConfig =
  | { provider: 'resend'; apiKey: string; from: string }
  | { provider: 'smtp'; smtpUrl: string; from: string };

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/** Sparrow wants the 10-digit local mobile number (98XXXXXXXX), not +977. */
export function toNepalLocalMobile(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 13 && digits.startsWith('977') ? digits.slice(3) : digits;
}

/**
 * Routes device tokens to Expo Push API (Expo Go / EAS Expo tokens) or FCM HTTP v1
 * (native FCM/APNs device tokens). SMS uses Sparrow SMS (Nepal) or Twilio when configured.
 */
@Injectable()
export class CompositeNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('Notifications');
  private readonly log = new LoggingNotificationAdapter();

  constructor(
    private readonly fcm: FcmNotificationAdapter | null,
    private readonly sms: SmsConfig | null,
    private readonly email: EmailConfig | null = null,
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

  async sendSms(message: SmsMessage): Promise<{ sent: boolean; detail: string }> {
    if (!this.sms) {
      return this.log.sendSms(message);
    }
    if (this.sms.provider === 'sparrow') {
      return this.sendSparrow(this.sms, message);
    }
    const twilio = this.sms;
    const auth = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64');
    const body = new URLSearchParams({
      To: message.to,
      From: twilio.from,
      Body: message.body,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Twilio SMS ${res.status}: ${text.slice(0, 200)}`);
      return { sent: false, detail: `twilio_${res.status}` };
    }
    return { sent: true, detail: text.slice(0, 200) || 'twilio_ok' };
  }

  async enqueueVoice(call: VoiceCall): Promise<void> {
    return this.log.enqueueVoice(call);
  }

  async sendEmail(message: EmailMessage): Promise<{ sent: boolean; detail: string }> {
    if (!this.email) {
      return this.log.sendEmail(message);
    }
    if (this.email.provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.email.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.email.from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        this.logger.warn(`Resend email ${res.status}: ${text.slice(0, 200)}`);
        return { sent: false, detail: `resend_${res.status}` };
      }
      return { sent: true, detail: text.slice(0, 200) };
    }
    // SMTP_URL is accepted for config discovery; raw SMTP needs a client we do not vendor.
    this.logger.warn('SMTP_URL is set but only RESEND_API_KEY delivery is implemented');
    return { sent: false, detail: 'smtp_not_implemented_use_RESEND_API_KEY' };
  }

  private async sendSparrow(
    config: Extract<SmsConfig, { provider: 'sparrow' }>,
    message: SmsMessage,
  ): Promise<{ sent: boolean; detail: string }> {
    const body = new URLSearchParams({
      token: config.token,
      from: config.from,
      to: toNepalLocalMobile(message.to),
      text: message.body,
    });
    const res = await fetch('https://api.sparrowsms.com/v2/sms/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Sparrow SMS ${res.status}: ${text.slice(0, 200)}`);
      return { sent: false, detail: `sparrow_${res.status}` };
    }
    return { sent: true, detail: text.slice(0, 200) || 'sparrow_ok' };
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
