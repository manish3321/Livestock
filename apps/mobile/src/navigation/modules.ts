import {
  modulesForRole,
  type LivestockTrackingMode,
  type ModuleKey,
  type Role,
} from '@farm/contracts';
import type { RootStackParamList } from './types';

export const HOUSEHOLD_HIDDEN: ReadonlySet<ModuleKey> = new Set(['pnl', 'reports']);
export const NON_NAV_MODULES: ReadonlySet<ModuleKey> = new Set(['admin']);

export function livestockModuleOrder(mode: LivestockTrackingMode): ModuleKey[] {
  return mode === 'BATCH' ? ['batches', 'animals'] : ['animals', 'batches'];
}

export function navigableModules(
  role: Role,
  options: { household: boolean; trackingMode?: LivestockTrackingMode },
): ModuleKey[] {
  return modulesForRole(role).filter(
    (m) => !NON_NAV_MODULES.has(m) && !(options.household && HOUSEHOLD_HIDDEN.has(m)),
  );
}

export type NavGroup = { labelKey: string; modules: ModuleKey[] };

export function navGroups(livestock: ModuleKey[]): NavGroup[] {
  return [
    { labelKey: 'nav.group.home', modules: ['dashboard', 'shed', 'inbox'] },
    {
      labelKey: 'nav.group.farm',
      modules: [
        ...livestock,
        'groups',
        'fish',
        'scan',
        'health',
        'breeding',
        'production',
        'feed',
        'inventory',
      ],
    },
    { labelKey: 'nav.group.money', modules: ['expenses', 'revenue', 'pnl'] },
    { labelKey: 'nav.group.insights', modules: ['reports'] },
  ];
}

export const MODULE_ROUTE: Record<ModuleKey, keyof RootStackParamList> = {
  dashboard: 'Dashboard',
  animals: 'Animals',
  batches: 'Batches',
  groups: 'Groups',
  fish: 'Fish',
  scan: 'Scan',
  expenses: 'Expenses',
  revenue: 'Revenue',
  pnl: 'Pnl',
  inventory: 'Inventory',
  health: 'Health',
  breeding: 'Breeding',
  production: 'Production',
  feed: 'Feed',
  reports: 'Reports',
  admin: 'Admin',
  shed: 'Shed',
  inbox: 'Inbox',
};

export const ROLE_LABEL: Record<Role, { en: string; ne: string }> = {
  ADMIN: { en: 'Admin', ne: 'एडमिन' },
  MANAGER: { en: 'Manager', ne: 'म्यानेजर' },
  WORKER: { en: 'Worker', ne: 'कर्मी' },
  VET: { en: 'Veterinarian', ne: 'भेटेरिनरी' },
  COOP: { en: 'Cooperative', ne: 'सहकारी' },
};
