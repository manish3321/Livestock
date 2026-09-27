import { afterEach, describe, expect, it } from 'vitest';
import type { TaskDto } from '@farm/contracts';
import {
  OFFLINE_TASK_HORIZON_DAYS,
  cacheTasksForOffline,
  collectDueLocalPushes,
  dueLocalReminders,
  groupLocalReminders,
  holdLocalReminder,
  localDeliveryChannel,
  smsOnReconnect,
} from './reminder-offline';

function task(partial: Partial<TaskDto> & Pick<TaskDto, 'id' | 'type'>): TaskDto {
  return {
    farmId: 'farm',
    animalId: null,
    animalHerdNumber: 'B10',
    animalName: 'Maya',
    batchId: null,
    titleEn: partial.titleEn ?? partial.type,
    titleNp: partial.titleNp ?? partial.type,
    dueAt: partial.dueAt ?? '2026-03-17T05:00:00.000Z',
    priority: partial.priority ?? 'NORMAL',
    status: partial.status ?? 'PENDING',
    assignedToId: null,
    source: 'AUTO',
    sourceRefType: null,
    sourceRefId: null,
    snoozeCount: 0,
    snoozedUntil: null,
    completedAt: null,
    dismissReason: null,
    actionPath: '/inbox',
    ...partial,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe('reminder offline', () => {
  it('keeps tasks due within 30 days', () => {
    const now = new Date('2026-03-17T00:00:00Z');
    const kept = cacheTasksForOffline(
      [
        task({
          id: 'soon',
          type: 'HEAT_WATCH',
          dueAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        task({
          id: 'far',
          type: 'HEAT_WATCH',
          dueAt: new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      now,
    );
    expect(kept.map((row) => row.id)).toEqual(['soon']);
    expect(OFFLINE_TASK_HORIZON_DAYS).toBe(30);
  });

  it('groups six heat watches and never batches colostrum', () => {
    const heats = Array.from({ length: 6 }, (_, i) =>
      task({ id: `h${i}`, type: 'HEAT_WATCH', titleEn: `Heat ${i}`, titleNp: `गर्मी ${i}` }),
    );
    expect(groupLocalReminders(heats)).toHaveLength(1);
    expect(groupLocalReminders(heats)[0]?.title).toBe('6 animals to check for heat this morning');
    const colostrum = Array.from({ length: 3 }, (_, i) =>
      task({
        id: `c${i}`,
        type: 'COLOSTRUM_FEED',
        priority: 'CRITICAL',
        titleEn: `Colostrum ${i}`,
      }),
    );
    expect(groupLocalReminders(colostrum)).toHaveLength(3);
  });

  it('holds NORMAL at 21:00 and delivers CRITICAL and silent heat at 04:00', () => {
    expect(holdLocalReminder({ priority: 'NORMAL', hour: 21, type: 'STOCK_REORDER' })).toBe(true);
    expect(holdLocalReminder({ priority: 'CRITICAL', hour: 21, type: 'COLOSTRUM_FEED' })).toBe(false);
    expect(
      holdLocalReminder({
        priority: 'NORMAL',
        hour: 4,
        type: 'SILENT_HEAT_CHECK',
        silentHeatOptIn: true,
      }),
    ).toBe(false);
  });

  it('degrades SMS and voice to local push while offline', () => {
    expect(localDeliveryChannel()).toBe('PUSH');
    expect(smsOnReconnect(false, true)).toBe(false);
    expect(smsOnReconnect(true, false)).toBe(false);
    expect(smsOnReconnect(true, true)).toBe(true);
  });

  it('only fires due, unfired tasks', () => {
    const now = new Date('2026-03-17T06:00:00Z');
    const due = dueLocalReminders(
      [
        task({ id: 'due', type: 'HEAT_WATCH', dueAt: '2026-03-17T05:00:00.000Z' }),
        task({ id: 'later', type: 'HEAT_WATCH', dueAt: '2026-03-17T08:00:00.000Z' }),
      ],
      now,
      new Set(['later']),
    );
    expect(due.map((row) => row.id)).toEqual(['due']);
  });

  it('collects a local push for a due heat watch in the morning', () => {
    cacheTasksForOffline([
      task({
        id: 'h1',
        type: 'HEAT_WATCH',
        titleEn: 'Heat watch B10',
        dueAt: '2026-03-17T00:00:00.000Z',
      }),
    ]);
    const pushes = collectDueLocalPushes(readFromCache(), new Date('2026-03-17T06:00:00.000Z'), 6);
    expect(pushes).toHaveLength(1);
  });
});

function readFromCache(): TaskDto[] {
  return JSON.parse(localStorage.getItem('farm.reminders.tasks') ?? '[]') as TaskDto[];
}
