import { describe, expect, it } from 'vitest';
import { TAG_SEQUENCE_BLOCK_SIZE, type TagSequenceBlockDto } from '@farm/contracts';
import { createStore } from '../src/core/store';
import { needsClaim, remainingInBlock, rememberBlock, takeNextShortNo } from '../src/core/tag-blocks';

function block(overrides: Partial<TagSequenceBlockDto> = {}): TagSequenceBlockDto {
  return {
    id: 'block-1',
    farmId: 'farm',
    species: 'BUFFALO',
    deviceId: 'android-device-1',
    rangeStart: 1,
    rangeEnd: TAG_SEQUENCE_BLOCK_SIZE,
    nextValue: 1,
    letter: 'B',
    issuedAt: new Date().toISOString(),
    exhaustedAt: null,
    ...overrides,
  };
}

describe('offline tag sequence blocks', () => {
  it('issues B01 then B02 from a claimed block of 100', () => {
    const store = createStore();
    rememberBlock(store, block());
    expect(takeNextShortNo(store, 'BUFFALO')).toMatchObject({ shortNo: 'B01', tag: 'BUF001' });
    expect(takeNextShortNo(store, 'BUFFALO')).toMatchObject({ shortNo: 'B02', tag: 'BUF002' });
    expect(remainingInBlock(store.tagBlocks[0]!)).toBe(TAG_SEQUENCE_BLOCK_SIZE - 2);
  });

  it('does not reuse another device range stored on this phone', () => {
    const store = createStore();
    rememberBlock(store, block({ species: 'COW', rangeStart: 101, rangeEnd: 200, nextValue: 101, letter: 'C' }));
    expect(takeNextShortNo(store, 'BUFFALO')).toEqual({ exhausted: true });
    expect(needsClaim(store, 'BUFFALO')).toBe(true);
  });
});
