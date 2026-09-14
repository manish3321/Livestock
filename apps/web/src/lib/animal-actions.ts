import type { Permission } from '@farm/contracts';

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

export interface AnimalAction {
  id: AnimalActionId;
  to: string;
  permission: Permission;
  labelKey: string;
  group: AnimalActionGroup;
}

/** Destinations already used by Shed / Health / Breeding query-param prefills. */
export function animalActions(animalId: string): AnimalAction[] {
  return [
    {
      id: 'milk',
      to: `/shed?animal=${animalId}&mode=MILKING`,
      permission: 'rounds:write',
      labelKey: 'qr.action.milk',
      group: 'record',
    },
    {
      id: 'vaccine',
      to: `/health?animalId=${animalId}&type=VACCINATION`,
      permission: 'health:write',
      labelKey: 'qr.action.vaccine',
      group: 'record',
    },
    {
      id: 'treatment',
      to: `/health?animalId=${animalId}&type=TREATMENT`,
      permission: 'health:write',
      labelKey: 'qr.action.treatment',
      group: 'record',
    },
    {
      id: 'heat',
      to: `/breeding?form=heat&animalId=${animalId}`,
      permission: 'breeding:write',
      labelKey: 'qr.action.heat',
      group: 'breeding',
    },
    {
      id: 'service',
      to: `/breeding?form=service&animalId=${animalId}`,
      permission: 'breeding:write',
      labelKey: 'qr.action.service',
      group: 'breeding',
    },
    {
      id: 'pd',
      to: `/breeding?form=pd&animalId=${animalId}`,
      permission: 'breeding:write',
      labelKey: 'qr.action.pd',
      group: 'breeding',
    },
    {
      id: 'calving',
      to: `/breeding?form=calving&animalId=${animalId}`,
      permission: 'breeding:write',
      labelKey: 'qr.action.calving',
      group: 'breeding',
    },
    {
      id: 'colostrum',
      to: `/breeding?form=colostrum&animalId=${animalId}`,
      permission: 'breeding:write',
      labelKey: 'qr.action.colostrum',
      group: 'breeding',
    },
    {
      id: 'weight',
      to: `/animals/${animalId}`,
      permission: 'animals:write',
      labelKey: 'qr.action.weight',
      group: 'more',
    },
    {
      id: 'feed',
      to: `/feed?animalId=${animalId}`,
      permission: 'feed:write',
      labelKey: 'qr.action.feed',
      group: 'more',
    },
    {
      id: 'expense',
      to: `/expenses?animalId=${animalId}`,
      permission: 'expenses:submit',
      labelKey: 'qr.action.expense',
      group: 'more',
    },
    {
      id: 'revenue',
      to: `/revenue?animalId=${animalId}`,
      permission: 'revenue:write',
      labelKey: 'qr.action.revenue',
      group: 'more',
    },
    {
      id: 'profile',
      to: `/animals/${animalId}`,
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
