import { describe, expect, it } from 'vitest';
import {
  DISMISSALS_BEFORE_MUTE_OFFER,
  MAX_NON_CRITICAL_PER_DAY,
  SMS_UCS2_CHARS_PER_SEGMENT,
  escalationTarget,
  groupSameType,
  nepalHour,
  NEVER_BATCH_TYPES,
  offerMute,
  shouldHoldUntilMorning,
  silentHeatOptIn,
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

  it('groups six heat-watch tasks into one morning notification', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`,
      type: 'HEAT_WATCH',
      titleEn: `Heat watch B${i}`,
      titleNp: `गर्मी B${i}`,
      priority: 'NORMAL',
    }));
    const groups = groupSameType(tasks);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.titleEn).toBe('6 animals to check for heat this morning');
    expect(groups[0]?.titleNp).toContain('6');
  });

  it('never batches a colostrum task', () => {
    const tasks = Array.from({ length: 3 }, (_, i) => ({
      id: `c${i}`,
      type: 'COLOSTRUM_FEED',
      titleEn: `Colostrum ${i}`,
      titleNp: `बिगौती ${i}`,
      priority: 'CRITICAL',
    }));
    expect(groupSameType(tasks)).toHaveLength(3);
    expect(NEVER_BATCH_TYPES.has('COLOSTRUM_FEED')).toBe(true);
    expect(NEVER_BATCH_TYPES.has('CALVING_WATCH')).toBe(true);
    expect(NEVER_BATCH_TYPES.has('VET_URGENT')).toBe(true);
    expect(NEVER_BATCH_TYPES.has('SYNC_INJECTION')).toBe(true);
  });

  it('lets SILENT_HEAT_CHECK through at 04:00 when opted in', () => {
    expect(
      shouldHoldUntilMorning({
        priority: 'NORMAL',
        hour: 4,
        type: 'SILENT_HEAT_CHECK',
        silentHeatOptIn: true,
      }),
    ).toBe(false);
    expect(
      shouldHoldUntilMorning({
        priority: 'NORMAL',
        hour: 4,
        type: 'SILENT_HEAT_CHECK',
        silentHeatOptIn: false,
      }),
    ).toBe(true);
  });

  it('defaults silent-heat opt-in on for a buffalo farm', () => {
    expect(silentHeatOptIn(undefined, true)).toBe(true);
    expect(silentHeatOptIn(undefined, false)).toBe(false);
    expect(silentHeatOptIn({ push: true, muted: true }, true)).toBe(false);
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

  it('offers to mute a type after three dismissals, never for CRITICAL', () => {
    expect(offerMute(2)).toBe(false);
    expect(offerMute(DISMISSALS_BEFORE_MUTE_OFFER)).toBe(true);
    expect(offerMute(DISMISSALS_BEFORE_MUTE_OFFER, 'CRITICAL')).toBe(false);
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
