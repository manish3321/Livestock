import { SPECIES, type Permission, type Species } from '@farm/contracts';
import { animalActions, type AnimalAction, type AnimalActionId } from './animal-actions';

const HERD_ROW_ACTION_IDS: AnimalActionId[] = [
  'milk',
  'vaccine',
  'treatment',
  'heat',
  'weight',
  'profile',
];

export const ANIMAL_RECORD_TABS = [
  'overview',
  'milk',
  'vaccine',
  'treatment',
  'heat',
  'weight',
] as const;
export type AnimalRecordTab = (typeof ANIMAL_RECORD_TABS)[number];
export type AnimalRecordMode = 'records' | 'add';

export function parseSpeciesParam(value: string | null | undefined): Species | '' {
  if (value && (SPECIES as readonly string[]).includes(value)) return value as Species;
  return '';
}

export function parseAnimalTab(value: string | null | undefined): AnimalRecordTab {
  if (value && (ANIMAL_RECORD_TABS as readonly string[]).includes(value)) {
    return value as AnimalRecordTab;
  }
  return 'overview';
}

export function parseRecordMode(value: string | null | undefined): AnimalRecordMode {
  return value === 'add' ? 'add' : 'records';
}

export function animalRecordPath(
  animalId: string,
  tab: AnimalRecordTab,
  mode: AnimalRecordMode = 'records',
): string {
  if (tab === 'overview') return `/animals/${animalId}`;
  const query = new URLSearchParams({ tab });
  if (mode === 'add') query.set('mode', 'add');
  return `/animals/${animalId}?${query.toString()}`;
}

/** Compact livestock-row actions: open that animal's records, not a farm-wide add form. */
export function herdRowActions(
  animalId: string,
  can: (permission: Permission) => boolean,
): AnimalAction[] {
  if (!can('animals:read')) return [];
  const byId = Object.fromEntries(animalActions(animalId).map((action) => [action.id, action]));
  return HERD_ROW_ACTION_IDS.flatMap((id) => {
    const action = byId[id];
    if (!action) return [];
    return [
      {
        ...action,
        permission: 'animals:read',
        to:
          id === 'profile'
            ? `/animals/${animalId}`
            : animalRecordPath(animalId, id as AnimalRecordTab),
      },
    ];
  });
}
