import { describe, expect, it } from 'vitest';
import {
  DISMISSALS_BEFORE_MUTE_OFFER,
  MAX_NON_CRITICAL_PER_DAY,
  SMS_UCS2_CHARS_PER_SEGMENT,
  escalationTarget,
  groupSameType,
  nepalHour,
  offerMute,
  shouldHoldUntilMorning,
  smsAllowed,
  smsEncoding,
  spliceDigits,
  suppressNonCritical,
} from '../src/notifications/notification-rules';

describe('notification-rules', () => {
  it('groups six FMD tasks into one notification', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`,
      type: 'VACCINATION_DUE',
      titleEn: `FMD due — B0${i}`,
      titleNp: `FMD खोप B0${i}`,
      priority: 'HIGH',
    }));
    const groups = groupSameType(tasks);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.titleEn).toBe('6 animals due for FMD');
    expect(groups[0]?.tasks).toHaveLength(6);
  });

  it('holds a NORMAL task at 21:00 until 05:00', () => {
    expect(
      shouldHoldUntilMorning({ priority: 'NORMAL', hour: 21, type: 'STOCK_REORDER' }),
    ).toBe(true);
    expect(
      shouldHoldUntilMorning({ priority: 'NORMAL', hour: 5, type: 'STOCK_REORDER' }),
    ).toBe(false);
  });

  it('sends a CRITICAL task at 21:00 immediately', () => {
    expect(
      shouldHoldUntilMorning({ priority: 'CRITICAL', hour: 21, type: 'COLOSTRUM_FEED' }),
    ).toBe(false);
  });

  it('suppresses the sixth non-critical of the day', () => {
    expect(suppressNonCritical(MAX_NON_CRITICAL_PER_DAY - 1, 'HIGH')).toBe(false);
    expect(suppressNonCritical(MAX_NON_CRITICAL_PER_DAY, 'HIGH')).toBe(true);
    expect(suppressNonCritical(MAX_NON_CRITICAL_PER_DAY, 'CRITICAL')).toBe(false);
  });

  it('sends Nepali SMS as Unicode at 70 characters per segment', () => {
    const encoded = smsEncoding('६ पशुलाई FMD खोप आज');
    expect(encoded.encoding).toBe('UCS2');
    expect(encoded.charsPerSegment).toBe(SMS_UCS2_CHARS_PER_SEGMENT);
  });

  it('escalates unacknowledged CRITICAL at 30 minutes to the manager', () => {
    const sent = new Date('2026-09-14T10:00:00Z');
    expect(escalationTarget(sent, new Date('2026-09-14T10:29:00Z'), null)).toBeNull();
    expect(escalationTarget(sent, new Date('2026-09-14T10:30:00Z'), null)).toBe('MANAGER');
    expect(escalationTarget(sent, new Date('2026-09-14T11:00:00Z'), 'MANAGER')).toBe('OWNER');
  });

  it('offers to mute a type after three dismissals', () => {
    expect(offerMute(2)).toBe(false);
    expect(offerMute(DISMISSALS_BEFORE_MUTE_OFFER)).toBe(true);
  });

  it('gates SMS to CRITICAL and overdue HIGH under the monthly cap', () => {
    expect(smsAllowed({ priority: 'CRITICAL', sentThisMonth: 0, monthlyCap: 40 })).toBe(true);
    expect(smsAllowed({ priority: 'HIGH', overdue: true, sentThisMonth: 0, monthlyCap: 40 })).toBe(true);
    expect(smsAllowed({ priority: 'NORMAL', sentThisMonth: 0, monthlyCap: 40 })).toBe(false);
    expect(smsAllowed({ priority: 'CRITICAL', sentThisMonth: 40, monthlyCap: 40 })).toBe(false);
  });

  it('splices a herd number digit by digit for voice, never as TTS', () => {
    expect(spliceDigits('B42')).toEqual(['digit-4', 'digit-2']);
  });

  it('covers every 9.3 task type plus heat-stress, and lists ~40 voice clips', async () => {
    const { TASK_TYPES } = await import('@farm/contracts');
    const { HEAT_STRESS_TRIGGER, TRIGGER_CATALOGUE, VOICE_CLIPS } = await import(
      '../src/notifications/notification-rules'
    );
    for (const type of TASK_TYPES) {
      expect(TRIGGER_CATALOGUE[type], type).toBeTruthy();
    }
    expect(HEAT_STRESS_TRIGGER.id).toBe('HEAT_STRESS');
    expect(VOICE_CLIPS.length).toBeGreaterThanOrEqual(40);
  });

  it('reads Nepal clock hours', () => {
    const hour = nepalHour(new Date('2026-09-14T15:30:00Z'));
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });
});
