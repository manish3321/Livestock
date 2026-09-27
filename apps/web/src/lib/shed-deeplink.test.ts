import { describe, expect, it } from 'vitest';
import { isShedMilkDeepLink, shedModeFromParams } from './shed-deeplink';

describe('isShedMilkDeepLink', () => {
  it('is true when an animal is present without a mode', () => {
    expect(isShedMilkDeepLink(new URLSearchParams('animal=a1'))).toBe(true);
  });

  it('is true for animal + MILKING', () => {
    expect(isShedMilkDeepLink(new URLSearchParams('animal=a1&mode=MILKING'))).toBe(true);
  });

  it('is false without an animal or for non-milking modes', () => {
    expect(isShedMilkDeepLink(new URLSearchParams())).toBe(false);
    expect(isShedMilkDeepLink(new URLSearchParams('mode=MILKING'))).toBe(false);
    expect(isShedMilkDeepLink(new URLSearchParams('animal=a1&mode=VACCINATION'))).toBe(false);
  });
});

describe('shedModeFromParams', () => {
  it('defaults animal-only deep links to MILKING', () => {
    expect(shedModeFromParams(new URLSearchParams('animal=a1'))).toBe('MILKING');
  });

  it('respects an explicit recording mode', () => {
    expect(shedModeFromParams(new URLSearchParams('mode=VACCINATION'))).toBe('VACCINATION');
  });
});
