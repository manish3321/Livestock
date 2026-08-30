/**
 * Farm operating mode helpers.
 * HOUSEHOLD = simplified Nepali household UX; COMMERCIAL = full feature surface.
 */
import type { AuthUser } from '@farm/contracts';

export function isCommercial(user: AuthUser | null | undefined): boolean {
  return user?.farmMode === 'COMMERCIAL';
}

export function isHousehold(user: AuthUser | null | undefined): boolean {
  return !isCommercial(user);
}
