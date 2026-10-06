import { describe, expect, it } from 'vitest';
import { farmMemberUpdateSchema, normalizeNepalMobile, profileUpdateSchema } from '../src';

describe('Nepal mobile numbers', () => {
  it('normalizes the common ways people type a number', () => {
    expect(normalizeNepalMobile('9812345678')).toBe('+9779812345678');
    expect(normalizeNepalMobile('+977 981-234-5678')).toBe('+9779812345678');
    expect(normalizeNepalMobile('9779841234567')).toBe('+9779841234567');
    expect(normalizeNepalMobile('9612345678')).toBe('+9779612345678');
  });

  it('rejects landlines and short numbers', () => {
    expect(normalizeNepalMobile('014412345')).toBeNull();
    expect(normalizeNepalMobile('98123')).toBeNull();
    expect(normalizeNepalMobile('+15551234567')).toBeNull();
  });

  it('stores E.164, clears on blank, and leaves phone untouched when omitted', () => {
    expect(profileUpdateSchema.parse({ phone: '9812345678' }).phone).toBe('+9779812345678');
    expect(profileUpdateSchema.parse({ phone: '' }).phone).toBeNull();
    expect(profileUpdateSchema.parse({ phone: null }).phone).toBeNull();
    expect(farmMemberUpdateSchema.parse({ role: 'WORKER' }).phone).toBeUndefined();
    expect(profileUpdateSchema.safeParse({ phone: '01-4412345' }).success).toBe(false);
  });
});
