/**
 * Role-based access control shared between API (enforcement) and
 * web (navigation and action visibility).
 *
 * The API is the source of truth: clients use this map only to decide
 * what to render, never to authorize.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'WORKER', 'VET', 'COOP'] as const;
export type Role = (typeof ROLES)[number];

/** Product modules. Keys are stable identifiers used in routes. */
export const MODULES = [
  'dashboard',
  'animals',
  'batches',
  'groups',
  'fish',
  'scan',
  'expenses',
  'revenue',
  'pnl',
  'inventory',
  'health',
  'breeding',
  'production',
  'feed',
  'reports',
  'admin',
  'shed',
  'inbox',
] as const;
export type ModuleKey = (typeof MODULES)[number];

export const PERMISSIONS = [
  // Operational records
  'animals:read',
  'animals:write',
  'animals:delete',
  'groups:read',
  'groups:write',
  'fish:read',
  'fish:write',
  'health:read',
  'health:write',
  'breeding:read',
  'breeding:write',
  'production:read',
  'production:write',
  'feed:read',
  'feed:write',
  // Inventory
  'inventory:read',
  'inventory:write',
  'inventory:restock-request',
  // Money
  'expenses:read',
  'expenses:submit',
  'expenses:approve',
  'expenses:approve-escalated',
  'revenue:read',
  'revenue:write',
  'finance:read',
  // Reporting / export
  'reports:read',
  'export:data',
  // Administration
  'users:manage',
  'farm:manage',
  'audit:read',
  // Sync (optional API clients)
  'sync:use',
  'tasks:read',
  'tasks:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const WORKER_PERMISSIONS: Permission[] = [
  'animals:read',
  'animals:write',
  'groups:read',
  'groups:write',
  'fish:read',
  'fish:write',
  'health:read',
  'health:write',
  'breeding:read',
  'breeding:write',
  'production:read',
  'production:write',
  'feed:read',
  'feed:write',
  'inventory:read',
  'inventory:restock-request',
  'expenses:read',
  'expenses:submit',
  'sync:use',
  'tasks:read',
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...WORKER_PERMISSIONS,
  'animals:delete',
  'inventory:write',
  'expenses:approve',
  'revenue:read',
  'revenue:write',
  'finance:read',
  'reports:read',
  'export:data',
  'tasks:manage',
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  'expenses:approve-escalated',
  'users:manage',
  'farm:manage',
  'audit:read',
];

const VET_PERMISSIONS: Permission[] = [
  'animals:read',
  'health:read',
  'health:write',
  'breeding:read',
  'breeding:write',
  'production:read',
  'tasks:read',
  'sync:use',
];

const COOP_PERMISSIONS: Permission[] = [
  'animals:read',
  'production:read',
  'reports:read',
  'finance:read',
  'revenue:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  WORKER: WORKER_PERMISSIONS,
  VET: VET_PERMISSIONS,
  COOP: COOP_PERMISSIONS,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Which roles can see each module in navigation.
 * Workers never see financial modules (also enforced server-side).
 */
export const MODULE_ACCESS: Record<ModuleKey, readonly Role[]> = {
  dashboard: ['ADMIN', 'MANAGER', 'WORKER', 'VET', 'COOP'],
  animals: ['ADMIN', 'MANAGER', 'WORKER', 'VET', 'COOP'],
  batches: ['ADMIN', 'MANAGER', 'WORKER', 'VET', 'COOP'],
  groups: ['ADMIN', 'MANAGER', 'WORKER'],
  fish: ['ADMIN', 'MANAGER', 'WORKER'],
  scan: ['ADMIN', 'MANAGER', 'WORKER', 'VET'],
  expenses: ['ADMIN', 'MANAGER', 'WORKER'],
  revenue: ['ADMIN', 'MANAGER', 'COOP'],
  pnl: ['ADMIN', 'MANAGER'],
  inventory: ['ADMIN', 'MANAGER', 'WORKER', 'VET'],
  health: ['ADMIN', 'MANAGER', 'WORKER', 'VET'],
  breeding: ['ADMIN', 'MANAGER', 'WORKER', 'VET'],
  production: ['ADMIN', 'MANAGER', 'WORKER', 'COOP'],
  feed: ['ADMIN', 'MANAGER', 'WORKER'],
  reports: ['ADMIN', 'MANAGER', 'COOP'],
  admin: ['ADMIN'],
  shed: ['ADMIN', 'MANAGER', 'WORKER', 'VET'],
  inbox: ['ADMIN', 'MANAGER', 'WORKER', 'VET'],
};

export function modulesForRole(role: Role): ModuleKey[] {
  return MODULES.filter((m) => MODULE_ACCESS[m].includes(role));
}
