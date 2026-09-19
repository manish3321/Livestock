import type { Permission } from '@farm/contracts';
import type { RootStackParamList } from '../navigation/types';

export type AnimalActionId =
  | 'milk'
  | 'vaccine'
  | 'treatment'
  | 'heat'
  | 'service'
  | 'pd'
  | 'calving'
  | 'colostrum'
  | 'weight'
  | 'feed'
  | 'expense'
  | 'revenue'
  | 'profile';

export type AnimalActionGroup = 'record' | 'breeding' | 'more';

export type NavDest = {
  name: keyof RootStackParamList;
  params?: object;
};

export interface AnimalAction {
  id: AnimalActionId;
  dest: NavDest;
  permission: Permission;
  labelKey: string;
  group: AnimalActionGroup;
}

export function animalActions(animalId: string): AnimalAction[] {
  return [
    {
      id: 'milk',
      dest: { name: 'Shed', params: { animalId, mode: 'MILKING' } },
      permission: 'rounds:write',
      labelKey: 'qr.action.milk',
      group: 'record',
    },
    {
      id: 'vaccine',
      dest: { name: 'Health', params: { animalId, type: 'VACCINATION' } },
      permission: 'health:write',
      labelKey: 'qr.action.vaccine',
      group: 'record',
    },
    {
      id: 'treatment',
      dest: { name: 'Health', params: { animalId, type: 'TREATMENT' } },
      permission: 'health:write',
      labelKey: 'qr.action.treatment',
      group: 'record',
    },
    {
      id: 'heat',
      dest: { name: 'Breeding', params: { form: 'heat', animalId } },
      permission: 'breeding:write',
      labelKey: 'qr.action.heat',
      group: 'breeding',
    },
    {
      id: 'service',
      dest: { name: 'Breeding', params: { form: 'service', animalId } },
      permission: 'breeding:write',
      labelKey: 'qr.action.service',
      group: 'breeding',
    },
    {
      id: 'pd',
      dest: { name: 'Breeding', params: { form: 'pd', animalId } },
      permission: 'breeding:write',
      labelKey: 'qr.action.pd',
      group: 'breeding',
    },
    {
      id: 'calving',
      dest: { name: 'Breeding', params: { form: 'calving', animalId } },
      permission: 'breeding:write',
      labelKey: 'qr.action.calving',
      group: 'breeding',
    },
    {
      id: 'colostrum',
      dest: { name: 'Breeding', params: { form: 'colostrum', animalId } },
      permission: 'breeding:write',
      labelKey: 'qr.action.colostrum',
      group: 'breeding',
    },
    {
      id: 'weight',
      dest: { name: 'AnimalDetail', params: { id: animalId, tab: 'weight' } },
      permission: 'animals:write',
      labelKey: 'qr.action.weight',
      group: 'more',
    },
    {
      id: 'feed',
      dest: { name: 'Feed', params: { animalId } },
      permission: 'feed:write',
      labelKey: 'qr.action.feed',
      group: 'more',
    },
    {
      id: 'expense',
      dest: { name: 'Expenses', params: { animalId } },
      permission: 'expenses:submit',
      labelKey: 'qr.action.expense',
      group: 'more',
    },
    {
      id: 'revenue',
      dest: { name: 'Revenue', params: { animalId } },
      permission: 'revenue:write',
      labelKey: 'qr.action.revenue',
      group: 'more',
    },
    {
      id: 'profile',
      dest: { name: 'AnimalDetail', params: { id: animalId } },
      permission: 'animals:read',
      labelKey: 'qr.action.profile',
      group: 'more',
    },
  ];
}

export function visibleAnimalActions(
  animalId: string,
  can: (permission: Permission) => boolean,
): AnimalAction[] {
  return animalActions(animalId).filter((action) => can(action.permission));
}

const HERD_ROW_ACTION_IDS: AnimalActionId[] = [
  'milk',
  'vaccine',
  'treatment',
  'heat',
  'weight',
  'profile',
];

export function herdRowActions(
  animalId: string,
  can: (permission: Permission) => boolean,
): AnimalAction[] {
  if (!can('animals:read')) return [];
  const byId = Object.fromEntries(animalActions(animalId).map((action) => [action.id, action]));
  return HERD_ROW_ACTION_IDS.flatMap((id) => {
    const action = byId[id];
    if (!action) return [];
    const dest: NavDest =
      id === 'profile'
        ? { name: 'AnimalDetail', params: { id: animalId } }
        : id === 'weight'
          ? { name: 'AnimalDetail', params: { id: animalId, tab: 'weight' } }
          : id === 'milk'
            ? { name: 'AnimalDetail', params: { id: animalId, tab: 'milk' } }
            : id === 'vaccine'
              ? { name: 'AnimalDetail', params: { id: animalId, tab: 'vaccine' } }
              : id === 'treatment'
                ? { name: 'AnimalDetail', params: { id: animalId, tab: 'treatment' } }
                : { name: 'AnimalDetail', params: { id: animalId, tab: 'heat' } };
    return [{ ...action, permission: 'animals:read' as Permission, dest }];
  });
}
