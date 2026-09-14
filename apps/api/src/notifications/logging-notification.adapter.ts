import { Injectable, Logger } from '@nestjs/common';
import type { NotificationPort, PushMessage, SmsMessage, VoiceCall } from './notification.port';

/** Used in development and whenever Firebase credentials are absent. */
@Injectable()
export class LoggingNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('Notifications');

  async sendToDevice(fcmToken: string, message: PushMessage): Promise<void> {
    this.logger.log(
      `push -> ${fcmToken.slice(0, 12)}…: ${message.title} — ${message.body}`,
    );
  }

  async sendSms(message: SmsMessage): Promise<void> {
    this.logger.log(
      `sms ${message.encoding} -> ${message.to}: ${message.body}`,
    );
  }

  async enqueueVoice(call: VoiceCall): Promise<void> {
    this.logger.log(`voice -> ${call.to}: ${call.clipIds.join(' ')}`);
  }
}
