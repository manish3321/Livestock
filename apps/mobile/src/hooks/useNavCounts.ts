import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '@farm/contracts';
import { getModuleCache, MODULE_CACHE_PATHS } from '../offline/module-cache';
import { useAccess } from './useAccess';
import { useFarm } from '../state/FarmProvider';

type DashAlerts = {
  healthOverdue?: unknown[];
  vaccineToday?: unknown[];
  inventoryCritical?: unknown[];
  inventoryExpiring?: unknown[];
  unpaidRevenue?: unknown[];
};

type DashboardSummary = { alerts?: DashAlerts };
type BreedingWatchDto = { totalAnimals?: number };
type BreedingBoardDto = { summary?: { totalActions?: number } };

export type NavCounts = {
  modules: Partial<Record<ModuleKey, number>>;
  pendingApprovals: number;
  /** Inbox + approvals — for a single “has notifications” affordance. */
  totalNotifications: number;
};

const POLL_MS = 60_000;

type RemoteSlice = {
  breeding: number;
  health: number;
  inventory: number;
  revenue: number;
  pendingApprovals: number;
  inboxFromApi: number | null;
};

const emptyRemote: RemoteSlice = {
  breeding: 0,
  health: 0,
  inventory: 0,
  revenue: 0,
  pendingApprovals: 0,
  inboxFromApi: null,
};

/**
 * Same badge formulas as web AppLayout: open tasks, breeding watch+board,
 * dashboard alert arrays, pending change-requests.
 */
export function useNavCounts(): NavCounts {
  const { api, store, revision, user, online } = useFarm();
  const { can, canModule } = useAccess();
  const [remote, setRemote] = useState<RemoteSlice>(emptyRemote);

  const canInbox = canModule('inbox');
  const canBreeding = canModule('breeding');
  const canHealth = canModule('health');
  const canInventory = canModule('inventory');
  const canRevenue = canModule('revenue') && can('finance:read');
  const canApprovals = can('changes:approve');
  const needDash = canHealth || canInventory || canRevenue;

  const inboxFromStore = useMemo(() => {
    let n = 0;
    for (const task of store.tasks.values()) {
      if (task.status === 'PENDING' || task.status === 'SNOOZED') n += 1;
    }
    return n;
  }, [store, revision]);

  useEffect(() => {
    if (!user) {
      setRemote(emptyRemote);
      return;
    }

    let cancelled = false;

    const seedDash = () => {
      const cached = getModuleCache<DashboardSummary>(store, 'dashboard');
      const alerts = cached?.alerts;
      if (!alerts) return;
      setRemote((prev) => ({
        ...prev,
        health: (alerts.healthOverdue?.length ?? 0) + (alerts.vaccineToday?.length ?? 0),
        inventory:
          (alerts.inventoryCritical?.length ?? 0) + (alerts.inventoryExpiring?.length ?? 0),
        revenue: canRevenue ? (alerts.unpaidRevenue?.length ?? 0) : 0,
      }));
    };
    seedDash();

    const tick = async () => {
      if (!online) return;
      try {
        const [tasksPage, dash, watch, board, pending] = await Promise.all([
          canInbox
            ? api.listOpenTasks().catch(() => null)
            : Promise.resolve(null),
          needDash
            ? api.get<DashboardSummary>(MODULE_CACHE_PATHS.dashboard).catch(() => null)
            : Promise.resolve(null),
          canBreeding
            ? api.get<BreedingWatchDto>('/v1/breeding/watch').catch(() => null)
            : Promise.resolve(null),
          canBreeding
            ? api.get<BreedingBoardDto>('/v1/breeding/board').catch(() => null)
            : Promise.resolve(null),
          canApprovals
            ? api.get<{ count: number }>('/v1/change-requests/pending-count').catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const alerts = dash?.alerts;
        const inboxFromApi = tasksPage
          ? tasksPage.items.filter((t) => t.status === 'PENDING' || t.status === 'SNOOZED')
              .length
          : null;

        setRemote({
          breeding:
            (watch?.totalAnimals ?? 0) + (board?.summary?.totalActions ?? 0),
          health: alerts
            ? (alerts.healthOverdue?.length ?? 0) + (alerts.vaccineToday?.length ?? 0)
            : emptyRemote.health,
          inventory: alerts
            ? (alerts.inventoryCritical?.length ?? 0) + (alerts.inventoryExpiring?.length ?? 0)
            : emptyRemote.inventory,
          revenue: canRevenue ? (alerts?.unpaidRevenue?.length ?? 0) : 0,
          pendingApprovals: canApprovals ? (pending?.count ?? 0) : 0,
          inboxFromApi,
        });
      } catch {
        /* keep last / store-backed counts */
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    api,
    user,
    online,
    store,
    canInbox,
    canBreeding,
    canHealth,
    canInventory,
    canRevenue,
    canApprovals,
    needDash,
  ]);

  return useMemo(() => {
    const inbox = remote.inboxFromApi ?? (canInbox ? inboxFromStore : 0);
    const modules: Partial<Record<ModuleKey, number>> = {};
    if (canInbox && inbox > 0) modules.inbox = inbox;
    if (canBreeding && remote.breeding > 0) modules.breeding = remote.breeding;
    if (canHealth && remote.health > 0) modules.health = remote.health;
    if (canInventory && remote.inventory > 0) modules.inventory = remote.inventory;
    if (canRevenue && remote.revenue > 0) modules.revenue = remote.revenue;
    const pendingApprovals = remote.pendingApprovals;
    return {
      modules,
      pendingApprovals,
      totalNotifications: inbox + pendingApprovals,
    };
  }, [
    remote,
    inboxFromStore,
    canInbox,
    canBreeding,
    canHealth,
    canInventory,
    canRevenue,
  ]);
}
