export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SmsMessage {
  to: string;
  body: string;
  encoding: 'GSM7' | 'UCS2';
}

export interface VoiceCall {
  to: string;
  clipIds: string[];
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Notification port. The foundation ships a logging adapter; the FCM
 * adapter is swapped in by configuring FCM_SERVICE_ACCOUNT_JSON, keeping
 * every caller unchanged. Email sends only when RESEND_API_KEY + MAIL_FROM
 * (or SMTP_URL + MAIL_FROM) are set — otherwise adapters no-op / log.
 */
export interface NotificationPort {
  sendToDevice(fcmToken: string, message: PushMessage): Promise<void>;
  sendSms(message: SmsMessage): Promise<{ sent: boolean; detail: string }>;
  enqueueVoice(call: VoiceCall): Promise<void>;
  sendEmail(message: EmailMessage): Promise<{ sent: boolean; detail: string }>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
