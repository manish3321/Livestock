import { z } from 'zod';
import type { Permission, Role } from './roles';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  deviceName: z.string().max(120).optional(),
  platform: z.enum(['web', 'android']).default('web'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export interface TokenPair {
  accessToken: string;
  /** Opaque rotating refresh token. Stored hashed server-side. */
  refreshToken: string;
  /** Access token TTL in seconds. */
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  farmId: string;
  farmName: string;
  role: Role;
  permissions: Permission[];
}

export interface LoginResponse extends TokenPair {
  user: AuthUser;
}

/** JWT access-token payload claims. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  farmId: string;
  role: Role;
  sessionId: string;
}
