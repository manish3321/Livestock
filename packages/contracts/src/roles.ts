/**
 * Role-based access control shared between API (enforcement) and
 * web (navigation and action visibility).
 *
 * The API is the source of truth: clients use this map only to decide
 * what to render, never to authorize.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'WORKER'] as const;
export type Role = (typeof ROLES)[number];

/** The 12 product modules. Keys are stable identifiers used in routes. */
export const MODULES = [
  'dashboard',
  'animals',
  'groups',
  'fish',
  'expenses',
  'revenue',
  'pnl',
  'inventory',
  'health',
  'breeding',
  'production',
  'reports',
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
  'inventory:read',
  'inventory:restock-request',
  'expenses:read',
  'expenses:submit',
  'sync:use',
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
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  'expenses:approve-escalated',
  'users:manage',
  'farm:manage',
  'audit:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  WORKER: WORKER_PERMISSIONS,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Which roles can see each module in navigation.
 * Workers never see financial modules (also enforced server-side).
 */
export const MODULE_ACCESS: Record<ModuleKey, readonly Role[]> = {
  dashboard: ['ADMIN', 'MANAGER', 'WORKER'],
  animals: ['ADMIN', 'MANAGER', 'WORKER'],
  groups: ['ADMIN', 'MANAGER', 'WORKER'],
  fish: ['ADMIN', 'MANAGER', 'WORKER'],
  expenses: ['ADMIN', 'MANAGER', 'WORKER'],
  revenue: ['ADMIN', 'MANAGER'],
  pnl: ['ADMIN', 'MANAGER'],
  inventory: ['ADMIN', 'MANAGER', 'WORKER'],
  health: ['ADMIN', 'MANAGER', 'WORKER'],
  breeding: ['ADMIN', 'MANAGER', 'WORKER'],
  production: ['ADMIN', 'MANAGER', 'WORKER'],
  reports: ['ADMIN', 'MANAGER'],
};

export function modulesForRole(role: Role): ModuleKey[] {
  return MODULES.filter((m) => MODULE_ACCESS[m].includes(role));
}
