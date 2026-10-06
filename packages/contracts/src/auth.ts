import { z } from 'zod';
import type { Permission, Role } from './roles';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  deviceName: z.string().max(120).optional(),
  platform: z.enum(['web', 'android', 'ios']).default('web'),
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

/**
 * Nepal mobile (NTC 974–976/984–986, Ncell 980–982, Smart 961/962/988) in E.164.
 * Accepts `98XXXXXXXX`, `+977 98…`, `977-98…`. Landlines cannot receive SMS.
 */
export function normalizeNepalMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 13 && digits.startsWith('977') ? digits.slice(3) : digits;
  return /^9[678]\d{8}$/.test(local) ? `+977${local}` : null;
}

export const NEPAL_MOBILE_ERROR = 'Enter a Nepal mobile number like 98XXXXXXXX';

/** Optional phone field: blank clears it (null), otherwise it must be a Nepal mobile. */
export const optionalNepalMobileSchema = z
  .union([z.string(), z.null()])
  .optional()
  .superRefine((value, ctx) => {
    if (typeof value === 'string' && value.trim() && !normalizeNepalMobile(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NEPAL_MOBILE_ERROR });
    }
  })
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null || !value.trim()) return null;
    return normalizeNepalMobile(value);
  });

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: optionalNepalMobileSchema,
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** E.164 Nepal mobile for SMS alerts; null when not set. */
  phone?: string | null;
  farmId: string;
  farmName: string;
  farmMode: 'HOUSEHOLD' | 'COMMERCIAL';
  /** Whether livestock is tracked animal-by-animal or as counted batches. */
  livestockTrackingMode: 'INDIVIDUAL' | 'BATCH';
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
