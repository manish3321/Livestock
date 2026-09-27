import { describe, expect, it } from 'vitest';
import { alertsFromTasks, syncLocalAlerts } from '../src/core/notify';
import { MemoryNotificationEngine } from '../src/native/memory-notification-engine';
import { createStore } from '../src/core/store';

describe('on-device notification engine', () => {
  it('schedules colostrum and vaccination alerts three days out so they fire offline', async () => {
    const now = new Date('2026-09-14T03:00:00+05:45');
    const colostrumDue = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const vaxDue = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const store = createStore();
    store.tasks.set('c1', {
      id: 'c1',
      animalId: null,
      type: 'COLOSTRUM_FEED',
      titleEn: 'Colostrum +2h',
      titleNp: 'पहुँलो दूध +२ घण्टा',
      dueAt: colostrumDue.toISOString(),
      priority: 'CRITICAL',
      status: 'PENDING',
    });
    store.tasks.set('v1', {
      id: 'v1',
      animalId: null,
      type: 'VACCINATION_DUE',
      titleEn: 'FMD',
      titleNp: 'एफएमडी खोप',
      dueAt: vaxDue.toISOString(),
      priority: 'HIGH',
      status: 'PENDING',
    });
    store.tasks.set('heat', {
      id: 'h1',
      animalId: null,
      type: 'HEAT_WATCH',
      titleEn: 'Heat',
      titleNp: 'गर्मी',
      dueAt: vaxDue.toISOString(),
      priority: 'HIGH',
      status: 'PENDING',
    });

    const engine = new MemoryNotificationEngine();
    const alerts = await syncLocalAlerts(engine, store, now, 'ne');
    expect(alerts.map((a) => a.type).sort()).toEqual(['COLOSTRUM_FEED', 'VACCINATION_DUE']);
    expect(engine.scheduled).toHaveLength(2);
    expect(engine.scheduled.some((a) => a.fireAt === vaxDue.getTime())).toBe(true);
    expect(alertsFromTasks([...store.tasks.values()], now).some((a) => a.type === 'HEAT_WATCH')).toBe(false);
  });
});
