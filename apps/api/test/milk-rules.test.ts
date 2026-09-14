import { describe, expect, it } from 'vitest';
import {
  mapMilkDisposal,
  parseScanPayload,
  rankAnimalMatch,
  toApiDisposal,
} from '../src/milk/milk-rules';

describe('milk-rules', () => {
  it('maps cooperative disposal names onto the live destination enum', () => {
    expect(mapMilkDisposal('FED_TO_CALVES')).toBe('CALF');
    expect(mapMilkDisposal('SOLD')).toBe('SOLD');
    expect(toApiDisposal('CALF')).toBe('FED_TO_CALVES');
  });

  it('parses printed QR paths including /a/{id}', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseScanPayload(`https://farm.example/scan/a/${id}`)).toEqual({ animalId: id });
    expect(parseScanPayload(`/a/${id}`)).toEqual({ animalId: id });
    expect(parseScanPayload(`farm://a/${id}`)).toEqual({ animalId: id });
    expect(parseScanPayload(id)).toEqual({ animalId: id });
    expect(parseScanPayload('42')).toEqual({ query: '42' });
  });

  it('ranks 42 as both B42 and C42', () => {
    const buffalo = { herdNumber: 'B42', tag: 'BUF042', name: 'Kali' };
    const cow = { herdNumber: 'C42', tag: 'COW042', name: 'Ganga' };
    const other = { herdNumber: 'B07', tag: 'BUF007', name: 'Juni' };
    expect(rankAnimalMatch('42', buffalo)).toBe(2);
    expect(rankAnimalMatch('42', cow)).toBe(2);
    expect(rankAnimalMatch('42', other)).toBeNull();
    expect(rankAnimalMatch('B42', buffalo)).toBe(0);
    expect(rankAnimalMatch('012', { herdNumber: 'B12', tag: 'X', name: null })).toBe(2);
    expect(rankAnimalMatch('b12', { herdNumber: 'B12', tag: 'X', name: null })).toBe(0);
  });
});
