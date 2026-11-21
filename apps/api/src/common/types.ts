import type { Permission, Role } from '@farm/contracts';

/**
 * Authenticated principal attached by JwtAuthGuard.
 * Platform operators: platformAdmin true, farmId '', permissions [].
 * Farm users: platformAdmin false, real farmId + role permissions.
 */
export interface RequestUser {
  id: string;
  email: string;
  farmId: string;
  role: Role;
  sessionId: string;
  permissions: readonly Permission[];
  /** True for platform operators. Optional on older test fixtures — treat missing as false. */
  platformAdmin?: boolean;
}
