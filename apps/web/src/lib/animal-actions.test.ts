import { describe, expect, it } from 'vitest';
import type { Permission } from '@farm/contracts';
import { animalActions, visibleAnimalActions } from './animal-actions';

const ANIMAL = '11111111-1111-4111-8111-111111111111';

describe('animalActions', () => {
  it('prefills vaccine, heat, and service destinations for the scanned animal', () => {
    const byId = Object.fromEntries(animalActions(ANIMAL).map((a) => [a.id, a]));
    expect(byId.vaccine?.to).toBe(`/health?animalId=${ANIMAL}&type=VACCINATION`);
    expect(byId.heat?.to).toBe(`/breeding?form=heat&animalId=${ANIMAL}`);
    expect(byId.service?.to).toBe(`/breeding?form=service&animalId=${ANIMAL}`);
    expect(byId.milk?.to).toBe(`/shed?animal=${ANIMAL}&mode=MILKING`);
  });

  it('hides write actions the role cannot perform', () => {
    const can = (permission: Permission) =>
      permission === 'animals:read' || permission === 'health:write';
    const visible = visibleAnimalActions(ANIMAL, can);
    expect(visible.map((a) => a.id)).toEqual(['vaccine', 'treatment', 'profile']);
  });
});
