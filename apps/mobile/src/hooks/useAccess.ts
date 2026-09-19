import { useCallback, useMemo } from 'react';
import {
  MODULE_ACCESS,
  hasPermission,
  type ModuleKey,
  type Permission,
} from '@farm/contracts';
import { useFarm } from '../state/FarmProvider';

/** Permission + module gates matching web AuthProvider helpers. */
export function useAccess() {
  const { user } = useFarm();

  const can = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      if (user.permissions?.includes(permission)) return true;
      return hasPermission(user.role, permission);
    },
    [user],
  );

  const canModule = useCallback(
    (module: ModuleKey) => {
      if (!user) return false;
      return MODULE_ACCESS[module].includes(user.role);
    },
    [user],
  );

  const household = user?.farmMode === 'HOUSEHOLD';
  const commercial = user?.farmMode === 'COMMERCIAL';

  return useMemo(
    () => ({
      user,
      can,
      canModule,
      household: Boolean(household),
      commercial: Boolean(commercial),
    }),
    [user, can, canModule, household, commercial],
  );
}
