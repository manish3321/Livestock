import { useAuth } from '../auth/auth-context';
import { isCommercial, isHousehold } from '../lib/farmMode';

/** Current farm mode for progressive disclosure of advanced dairy/finance fields. */
export function useFarmMode() {
  const { user } = useAuth();
  return {
    farmMode: user?.farmMode ?? 'HOUSEHOLD',
    commercial: isCommercial(user),
    household: isHousehold(user),
    livestockTrackingMode: user?.livestockTrackingMode ?? 'INDIVIDUAL',
  };
}
