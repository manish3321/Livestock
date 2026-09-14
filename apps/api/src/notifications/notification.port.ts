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

/**
 * Notification port. The foundation ships a logging adapter; the FCM
 * adapter is swapped in by configuring FCM_SERVICE_ACCOUNT_JSON, keeping
 * every caller unchanged.
 */
export interface NotificationPort {
  sendToDevice(fcmToken: string, message: PushMessage): Promise<void>;
  sendSms(message: SmsMessage): Promise<void>;
  enqueueVoice(call: VoiceCall): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
