import { createSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { LoggingNotificationAdapter } from './logging-notification.adapter';
import type { NotificationPort, PushMessage, SmsMessage, VoiceCall } from './notification.port';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

/**
 * FCM HTTP v1 via service-account JWT. No firebase-admin — same pattern as
 * the R2 adapter (raw HTTPS + node:crypto).
 */
@Injectable()
export class FcmNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('FCM');
  private readonly fallback = new LoggingNotificationAdapter();
  private cachedToken: { value: string; exp: number } | null = null;

  constructor(private readonly json: string) {}

  async sendToDevice(fcmToken: string, message: PushMessage): Promise<void> {
    const sa = parseServiceAccount(this.json);
    const access = await this.accessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title: message.title, body: message.body },
            data: message.data,
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`FCM ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  async sendSms(message: SmsMessage): Promise<void> {
    return this.fallback.sendSms(message);
  }

  async enqueueVoice(call: VoiceCall): Promise<void> {
    return this.fallback.enqueueVoice(call);
  }

  private async accessToken(sa: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.exp > now + 60) {
      return this.cachedToken.value;
    }
    const jwt = signServiceJwt(sa, now);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      throw new Error(`FCM oauth failed: ${res.status}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { value: body.access_token, exp: now + (body.expires_in ?? 3600) };
    return body.access_token;
  }
}

export function parseServiceAccount(json: string): ServiceAccount {
  const parsed = JSON.parse(json) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is missing project_id, client_email, or private_key');
  }
  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

export function signServiceJwt(sa: ServiceAccount, now: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(data);
  return `${data}.${sign.sign(sa.private_key, 'base64url')}`;
}
