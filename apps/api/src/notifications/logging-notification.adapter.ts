import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailMessage,
  NotificationPort,
  PushMessage,
  SmsMessage,
  VoiceCall,
} from './notification.port';

/** Used in development and whenever Firebase credentials are absent. */
@Injectable()
export class LoggingNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('Notifications');

  async sendToDevice(fcmToken: string, message: PushMessage): Promise<void> {
    this.logger.log(
      `push -> ${fcmToken.slice(0, 12)}…: ${message.title} — ${message.body}`,
    );
  }

  async sendSms(message: SmsMessage): Promise<{ sent: boolean; detail: string }> {
    this.logger.log(
      `sms ${message.encoding} -> ${message.to}: ${message.body} (sms_not_configured)`,
    );
    return { sent: false, detail: 'sms_not_configured' };
  }

  async enqueueVoice(call: VoiceCall): Promise<void> {
    this.logger.log(`voice -> ${call.to}: ${call.clipIds.join(' ')}`);
  }

  async sendEmail(message: EmailMessage): Promise<{ sent: boolean; detail: string }> {
    this.logger.log(`email -> ${message.to}: ${message.subject}`);
    return { sent: false, detail: 'email_not_configured' };
  }
}
