import { describe, expect, it } from 'vitest';
import { matchRosterByQuery, optimisticScanFromRoster } from './shed-scan';

describe('optimisticScanFromRoster', () => {
  it('opens a milk pad DTO from roster fields without waiting on the API', () => {
    const dto = optimisticScanFromRoster(
      {
        id: 'a1',
        shortNo: 'B05',
        name: 'Bella',
        species: 'BUFFALO',
        penName: 'A',
        photoUrl: null,
        status: 'LACTATING',
        isPregnant: false,
        withholdActive: false,
        usualLitres: 10,
      },
      'MILKING',
    );
    expect(dto.animal.shortNo).toBe('B05');
    expect(dto.nextAction).toBe('MILK_ENTRY');
    expect(dto.context.rolling7Mean).toBe(10);
    expect(dto.context.expectedRangeLow).toBe(6);
    expect(dto.context.expectedRangeHigh).toBe(14);
    expect(dto.blocks).toEqual([]);
  });

  it('marks withhold animals so Sold stays blocked', () => {
    const dto = optimisticScanFromRoster(
      {
        id: 'a2',
        shortNo: 'B06',
        name: null,
        species: 'BUFFALO',
        penName: null,
        photoUrl: null,
        status: 'LACTATING',
        isPregnant: false,
        withholdActive: true,
        usualLitres: null,
      },
      'MILKING',
    );
    expect(dto.blocks[0]?.kind).toBe('MILK_WITHHOLD');
  });
});

describe('matchRosterByQuery', () => {
  const rows = [
    { id: '1', shortNo: 'B05', tag: 'T5', name: 'Bella' },
    { id: '2', shortNo: 'B12', tag: 'T12', name: 'Maya' },
  ];

  it('matches herd number digits like 05 → B05', () => {
    expect(matchRosterByQuery(rows, '05').map((r) => r.shortNo)).toEqual(['B05']);
    expect(matchRosterByQuery(rows, 'B05').map((r) => r.shortNo)).toEqual(['B05']);
  });
});
