import { z } from 'zod';

/** Standardized API error envelope returned by every non-2xx response. */
export const apiErrorSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const idSchema = z.string().uuid();

/** Header used for idempotent mutating requests. */
export const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';
