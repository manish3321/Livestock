import type { Permission, Role } from '@farm/contracts';

/** Authenticated principal attached to each request by JwtAuthGuard. */
export interface RequestUser {
  id: string;
  email: string;
  farmId: string;
  role: Role;
  sessionId: string;
  permissions: readonly Permission[];
}
