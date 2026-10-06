import './setup-env';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompositeNotificationAdapter,
  toNepalLocalMobile,
} from '../src/notifications/composite-notification.adapter';

describe('SMS providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns +977 numbers into the 10-digit form Sparrow expects', () => {
    expect(toNepalLocalMobile('+9779812345678')).toBe('9812345678');
    expect(toNepalLocalMobile('977-981-234-5678')).toBe('9812345678');
    expect(toNepalLocalMobile('9812345678')).toBe('9812345678');
  });

  it('posts Nepali text to Sparrow with token, sender and local number', async () => {
    const fetchMock = vi.fn(async () => new Response('{"response_code":200}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CompositeNotificationAdapter(null, {
      provider: 'sparrow',
      token: 'tok',
      from: 'FarmAlert',
    });

    await adapter.sendSms({ to: '+9779812345678', body: 'बिगौती खुवाउनुहोस्', encoding: 'UCS2' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sparrowsms.com/v2/sms/');
    const params = new URLSearchParams(String(init.body));
    expect(params.get('token')).toBe('tok');
    expect(params.get('from')).toBe('FarmAlert');
    expect(params.get('to')).toBe('9812345678');
    expect(params.get('text')).toBe('बिगौती खुवाउनुहोस्');
  });

  it('logs instead of sending when no provider is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CompositeNotificationAdapter(null, null);
    await adapter.sendSms({ to: '+9779812345678', body: 'test', encoding: 'GSM7' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
