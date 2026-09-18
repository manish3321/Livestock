import { describe, expect, it } from 'vitest';
import type { SpeciesConfigDto } from '@farm/contracts';
import { SYSTEM_REMINDER_RULES } from '../src/breeding/reminder-catalog';
import { nepalHourIn } from './fakes';
import {
  planReminders,
  resolveFarmRules,
  type ReminderContext,
} from '../src/breeding/reminder-engine';

const buffalo: SpeciesConfigDto = {
  species: 'BUFFALO',
  gestationDays: 310,
  lactationDays: 242,
  voluntaryWaitingDays: 60,
  estrusCycleDays: 21,
  ageFirstServiceMonths: 30,
  pregnancyCheckEarliestDays: 45,
  targetCalvingIntervalDays: 425,
  dryOffDaysBeforeCalving: 60,
  gestationVarianceDays: 10,
  minWeightFirstServiceKg: 300,
  serviceWindowStartHours: 12,
  serviceWindowEndHours: 18,
  silentHeatCheckHour: 4,
  fatMinPercent: 6.5,
  fatMaxPercent: 8,
  tempMinC: 37.5,
  tempMaxC: 39.5,
};

const cow: SpeciesConfigDto = {
  ...buffalo,
  species: 'COW',
  gestationDays: 283,
  lactationDays: 286,
  voluntaryWaitingDays: 50,
  ageFirstServiceMonths: 15,
  pregnancyCheckEarliestDays: 35,
  targetCalvingIntervalDays: 380,
  gestationVarianceDays: 7,
  minWeightFirstServiceKg: 250,
  silentHeatCheckHour: null,
  fatMinPercent: 3.5,
  fatMaxPercent: 4.5,
  tempMinC: 38.0,
  tempMaxC: 39.3,
};

const now = new Date('2026-06-01T03:00:00+05:45');

function ctx(over: Partial<ReminderContext> = {}): ReminderContext {
  return {
    species: 'BUFFALO',
    shortNo: 'B12',
    now,
    anchorAt: now,
    anchorId: '00000000-0000-4000-8000-0000000000aa',
    animalId: '00000000-0000-4000-8000-0000000000bb',
    ...over,
  };
}

function codes(planned: Array<{ code: string }>): string[] {
  return planned.map((row) => row.code).sort();
}

describe('reminder rule table', () => {
  it('gives COLOSTRUM_1 voice among its channels', () => {
    const rule = SYSTEM_REMINDER_RULES.find((row) => row.code === 'COLOSTRUM_1');
    expect(rule?.channels).toEqual(['PUSH', 'SMS', 'VOICE']);
  });

  it('creates three colostrum tasks at +2h, then +6h after the first, then +8h after the second', () => {
    const calving = planReminders(SYSTEM_REMINDER_RULES, ctx({ event: 'CALVING' }), buffalo);
    const first = calving.find((row) => row.code === 'COLOSTRUM_1');
    expect(first).toBeTruthy();
    expect(first!.dueAt.getTime() - now.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(calving.some((row) => row.code === 'COLOSTRUM_2')).toBe(false);

    const secondAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const afterFirst = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ event: 'COLOSTRUM_1_DONE', anchorAt: secondAt }),
      buffalo,
    );
    const second = afterFirst.find((row) => row.code === 'COLOSTRUM_2');
    expect(second!.dueAt.getTime() - secondAt.getTime()).toBe(6 * 60 * 60 * 1000);

    const thirdAt = new Date(secondAt.getTime() + 6 * 60 * 60 * 1000);
    const afterSecond = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ event: 'COLOSTRUM_2_DONE', anchorAt: thirdAt }),
      buffalo,
    );
    const third = afterSecond.find((row) => row.code === 'COLOSTRUM_3');
    expect(third!.dueAt.getTime() - thirdAt.getTime()).toBe(8 * 60 * 60 * 1000);
  });

  it('sends a buffalo entering ANESTRUS_SUSPECTED a 04:00 silent-heat check', () => {
    const planned = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ enteredStage: 'ANESTRUS_SUSPECTED', species: 'BUFFALO' }),
      buffalo,
    );
    const silent = planned.find((row) => row.code === 'SILENT_HEAT_BUFFALO');
    expect(silent).toBeTruthy();
    expect(nepalHourIn(silent!.dueAt)).toBe(4);
    expect(planned.some((row) => row.code === 'SILENT_HEAT_CATTLE')).toBe(false);
  });

  it('sends a cow in the same state a 05:00 silent-heat check', () => {
    const planned = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ enteredStage: 'ANESTRUS_SUSPECTED', species: 'COW' }),
      cow,
    );
    const silent = planned.find((row) => row.code === 'SILENT_HEAT_CATTLE');
    expect(silent).toBeTruthy();
    expect(nepalHourIn(silent!.dueAt)).toBe(5);
    expect(planned.some((row) => row.code === 'SILENT_HEAT_BUFFALO')).toBe(false);
  });

  it('fires ANESTRUS_MINERAL at VWP+30 and does not make ANESTRUS_VET due yet', () => {
    const lactationStart = addDays(now, -(buffalo.voluntaryWaitingDays + 30));
    const planned = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({
        enteredStage: 'ANESTRUS_SUSPECTED',
        lactationStart,
        daysQuiet: 30,
      }),
      buffalo,
    );
    const mineral = planned.find((row) => row.code === 'ANESTRUS_MINERAL');
    const vet = planned.find((row) => row.code === 'ANESTRUS_VET');
    expect(mineral).toBeTruthy();
    expect(Math.round((mineral!.dueAt.getTime() - now.getTime()) / DAY_MS)).toBe(0);
    expect(vet).toBeTruthy();
    expect(Math.round((vet!.dueAt.getTime() - now.getTime()) / DAY_MS)).toBe(30);
  });

  it('fires ANESTRUS_VET at VWP+60', () => {
    const lactationStart = addDays(now, -(buffalo.voluntaryWaitingDays + 60));
    const planned = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ enteredStage: 'ANESTRUS_SUSPECTED', lactationStart, daysQuiet: 60 }),
      buffalo,
    );
    const vet = planned.find((row) => row.code === 'ANESTRUS_VET');
    expect(Math.round((vet!.dueAt.getTime() - now.getTime()) / DAY_MS)).toBe(0);
  });

  it('puts a rupee figure in ANESTRUS_DECISION and does not flag a recommended option', () => {
    const rule = SYSTEM_REMINDER_RULES.find((row) => row.code === 'ANESTRUS_DECISION')!;
    expect(rule.actionKeys).toEqual(['cidr', 'wait', 'sell']);
    expect(rule.titleEn.toLowerCase()).toContain('none of these is recommended');
    const planned = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({
        enteredStage: 'ANESTRUS_SUSPECTED',
        lactationStart: addDays(now, -(buffalo.voluntaryWaitingDays + 90)),
        daysQuiet: 90,
        costOfDelay: 14880,
      }),
      buffalo,
    );
    const decision = planned.find((row) => row.code === 'ANESTRUS_DECISION')!;
    expect(decision.titleEn).toContain('NPR 14880');
    expect(decision.titleNp).toContain('14880');
  });

  it('fires REPEAT_BREEDER_FLAG on the third service, before the outcome is known', () => {
    const tooSoon = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ event: 'SERVICE_3', serviceCount: 2 }),
      buffalo,
    );
    expect(tooSoon.some((row) => row.code === 'REPEAT_BREEDER_FLAG')).toBe(false);
    const planned = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ event: 'SERVICE_3', serviceCount: 3, aiCost: 6000 }),
      buffalo,
    );
    const flag = planned.find((row) => row.code === 'REPEAT_BREEDER_FLAG')!;
    expect(flag.titleEn).toContain('energy deficit');
    expect(flag.titleEn).toContain('NPR 6000');
    expect(flag.titleEn.indexOf('energy deficit')).toBeLessThan(flag.titleEn.indexOf('uterine infection'));
  });

  it('schedules buffalo PREG_CHECK_DUE at +45 days and cattle at +35', () => {
    const b = planReminders(SYSTEM_REMINDER_RULES, ctx({ event: 'SERVICE' }), buffalo).find(
      (row) => row.code === 'PREG_CHECK_DUE',
    )!;
    const c = planReminders(SYSTEM_REMINDER_RULES, ctx({ event: 'SERVICE', species: 'COW' }), cow).find(
      (row) => row.code === 'PREG_CHECK_DUE',
    )!;
    expect(Math.round((b.dueAt.getTime() - now.getTime()) / DAY_MS)).toBe(45);
    expect(Math.round((c.dueAt.getTime() - now.getTime()) / DAY_MS)).toBe(35);
  });

  it('schedules CALVING_LATE at EDD+10 for buffalo and EDD+7 for cattle', () => {
    const edd = new Date('2026-09-01T00:00:00+05:45');
    const b = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ event: 'PREG_CONFIRMED', expectedCalvingDate: edd }),
      buffalo,
    ).find((row) => row.code === 'CALVING_LATE')!;
    const c = planReminders(
      SYSTEM_REMINDER_RULES,
      ctx({ event: 'PREG_CONFIRMED', species: 'COW', expectedCalvingDate: edd }),
      cow,
    ).find((row) => row.code === 'CALVING_LATE')!;
    expect(Math.round((b.dueAt.getTime() - edd.getTime()) / DAY_MS)).toBe(10);
    expect(Math.round((c.dueAt.getTime() - edd.getTime()) / DAY_MS)).toBe(7);
  });

  it('lets a farm row with the same code override the system default', () => {
    const farm = [
      {
        ...SYSTEM_REMINDER_RULES.find((row) => row.code === 'HEAT_WATCH_DAILY')!,
        fireAtHour: 6,
        titleEn: 'Farm heat watch {shortNo}',
        titleNp: 'फार्म गर्मी {shortNo}',
      },
    ];
    const merged = resolveFarmRules(SYSTEM_REMINDER_RULES, farm);
    const daily = merged.find((row) => row.code === 'HEAT_WATCH_DAILY')!;
    expect(daily.fireAtHour).toBe(6);
    expect(daily.titleEn).toContain('Farm');
  });

  it('keeps every system rule active with En and Np titles', () => {
    expect(SYSTEM_REMINDER_RULES.length).toBeGreaterThanOrEqual(40);
    for (const rule of SYSTEM_REMINDER_RULES) {
      expect(rule.titleEn.length).toBeGreaterThan(0);
      expect(rule.titleNp.length).toBeGreaterThan(0);
      expect(rule.channels.length).toBeGreaterThan(0);
    }
    expect(codes(SYSTEM_REMINDER_RULES).includes('COLOSTRUM_1')).toBe(true);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
