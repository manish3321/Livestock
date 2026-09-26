import { describe, expect, it } from 'vitest';
import { destFromActionPath } from '../src/lib/action-path';

describe('destFromActionPath', () => {
  it('parses breeding form + animalId', () => {
    expect(destFromActionPath('/breeding?form=heat&animalId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toEqual({
      name: 'Breeding',
      params: {
        form: 'heat',
        animalId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
  });

  it('parses health type query', () => {
    expect(destFromActionPath('/health?type=VACCINATION&animalId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toEqual({
      name: 'Health',
      params: {
        type: 'VACCINATION',
        animalId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
  });

  it('parses shed marker mode', () => {
    expect(destFromActionPath('/shed?mode=MARKER_PLACEMENT')).toEqual({
      name: 'Shed',
      params: { mode: 'MARKER_PLACEMENT' },
    });
  });

  it('parses animal detail path', () => {
    expect(destFromActionPath('/animals/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toEqual({
      name: 'AnimalDetail',
      params: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    });
  });

  it('returns null for empty', () => {
    expect(destFromActionPath(null)).toBeNull();
    expect(destFromActionPath('')).toBeNull();
  });
});
