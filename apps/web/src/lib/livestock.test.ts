import { describe, expect, it } from 'vitest';
import type { Permission } from '@farm/contracts';
import { herdRowActions, parseSpeciesParam } from './livestock';

describe('parseSpeciesParam', () => {
  it('accepts livestock species and ignores other values', () => {
    expect(parseSpeciesParam('COW')).toBe('COW');
    expect(parseSpeciesParam('GOAT')).toBe('GOAT');
    expect(parseSpeciesParam('POULTRY')).toBe('');
    expect(parseSpeciesParam(null)).toBe('');
  });
});

describe('herdRowActions', () => {
  it('opens record tabs for anyone who can read livestock', () => {
    const can = (permission: Permission) => permission === 'animals:read';
    const visible = herdRowActions('a1', can);
    expect(visible.map((a) => a.id)).toEqual([
      'milk',
      'vaccine',
      'treatment',
      'heat',
      'weight',
      'profile',
    ]);
    expect(visible.find((a) => a.id === 'milk')?.to).toBe('/animals/a1?tab=milk');
    expect(visible.find((a) => a.id === 'profile')?.to).toBe('/animals/a1');
  });
});
