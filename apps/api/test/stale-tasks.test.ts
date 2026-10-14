import { describe, expect, it } from 'vitest';
import { staleLadderStepIds, type OpenTaskRow } from '../src/jobs/stale-tasks';

const NOW = new Date('2026-10-14T03:00:00Z');
const day = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);

function row(id: string, over: Partial<OpenTaskRow>): OpenTaskRow {
  return {
    id,
    animalId: 'cow-1',
    type: 'CALVING_WATCH',
    sourceRefType: 'rule:CALVING_WATCH_7',
    dueAt: day(-1),
    ...over,
  };
}

describe('staleLadderStepIds', () => {
  it('keeps only the newest due step of a ladder for one animal', () => {
    const ids = staleLadderStepIds(
      [
        row('w7', { dueAt: day(-7) }),
        row('w3', { dueAt: day(-3), sourceRefType: 'rule:CALVING_WATCH_3' }),
        row('w1', { dueAt: day(-1), sourceRefType: 'rule:CALVING_WATCH_1' }),
      ],
      NOW,
    );
    expect(ids.sort()).toEqual(['w3', 'w7']);
  });

  it('leaves future steps, other animals and other task types alone', () => {
    const ids = staleLadderStepIds(
      [
        row('past', { dueAt: day(-2) }),
        row('future', { dueAt: day(2), sourceRefType: 'rule:CALVING_TODAY' }),
        row('other-cow', { animalId: 'cow-2', dueAt: day(-5) }),
        row('heat', { type: 'HEAT_WATCH', sourceRefType: 'rule:HEAT_WATCH_DAILY', dueAt: day(-4) }),
      ],
      NOW,
    );
    expect(ids).toEqual([]);
  });

  it('never touches tasks that are not reminder-ladder steps', () => {
    const ids = staleLadderStepIds(
      [
        row('fmd', { type: 'VACCINATION_DUE', sourceRefType: 'vaccineProtocol', dueAt: day(-9) }),
        row('hs', { type: 'VACCINATION_DUE', sourceRefType: 'vaccineProtocol', dueAt: day(-2) }),
        row('farm', { animalId: null, type: 'STOCK_REORDER', sourceRefType: 'rule:X', dueAt: day(-9) }),
      ],
      NOW,
    );
    expect(ids).toEqual([]);
  });
});
