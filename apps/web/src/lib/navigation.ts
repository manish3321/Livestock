/**
 * Navigation rules shared by the sidebar and the dashboard shortcut grid.
 * Role visibility still comes from MODULE_ACCESS in @farm/contracts; this only
 * decides presentation.
 */
import { modulesForRole, type LivestockTrackingMode, type ModuleKey, type Role } from '@farm/contracts';

/** Modules hidden in household mode (still available when farm is commercial). */
export const HOUSEHOLD_HIDDEN: ReadonlySet<ModuleKey> = new Set(['pnl', 'reports']);

/**
 * Modules that are a route namespace rather than one navigable page. `admin`
 * gates /admin/members and /admin/audit, which get their own sidebar section.
 */
export const NON_NAV_MODULES: ReadonlySet<ModuleKey> = new Set(['admin']);

/**
 * Livestock entries in the order the farm's tracking mode implies. Both are
 * always reachable — a farm tracking individuals still pens grower stock in
 * batches — but the primary surface leads.
 */
export function livestockModuleOrder(mode: LivestockTrackingMode): ModuleKey[] {
  return mode === 'BATCH' ? ['batches', 'animals'] : ['animals', 'batches'];
}

/** Modules a role may see in navigation, after mode-based hiding. */
export function navigableModules(
  role: Role,
  options: { household: boolean },
): ModuleKey[] {
  return modulesForRole(role).filter(
    (m) => !NON_NAV_MODULES.has(m) && !(options.household && HOUSEHOLD_HIDDEN.has(m)),
  );
}
