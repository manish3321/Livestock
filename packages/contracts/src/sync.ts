import { z } from 'zod';
import { SYNC_ENTITY_TYPES } from './domain';

/**
 * Offline sync protocol.
 *
 * Push: a client sends a batch of locally-recorded mutations, each
 * with a client-generated UUID (`clientMutationId`). The server applies them
 * transactionally and idempotently — re-sending an already-applied mutation
 * returns `duplicate`, never a double write.
 *
 * Pull: cursor-based incremental download of changed records, including
 * tombstones (deleted records), ordered by server change sequence.
 */

export const SYNC_OPS = ['create', 'update', 'delete'] as const;
export type SyncOp = (typeof SYNC_OPS)[number];

export const syncMutationSchema = z.object({
  clientMutationId: z.string().uuid(),
  entityType: z.enum(SYNC_ENTITY_TYPES),
  /** Client-generated UUID for creates; server id otherwise. */
  entityId: z.string().uuid(),
  op: z.enum(SYNC_OPS),
  /** Entity payload for create/update; ignored for delete. */
  payload: z.record(z.unknown()).optional(),
  /** Version the client last saw; used for conflict detection on update/delete. */
  baseVersion: z.number().int().nonnegative().optional(),
  /** Wall-clock time the user performed the action (device time). */
  occurredAt: z.coerce.date(),
});
export type SyncMutation = z.infer<typeof syncMutationSchema>;

export const syncPushRequestSchema = z.object({
  deviceId: z.string().min(8).max(120),
  mutations: z.array(syncMutationSchema).min(1).max(200),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const SYNC_RESULT_STATUSES = [
  'applied',
  'duplicate',
  'conflict',
  'failed',
] as const;
export type SyncResultStatus = (typeof SYNC_RESULT_STATUSES)[number];

export interface SyncMutationResult {
  clientMutationId: string;
  status: SyncResultStatus;
  /** Server version after apply (applied/duplicate). */
  serverVersion?: number;
  /** Current server record for conflicts so the client can reconcile. */
  current?: Record<string, unknown> | null;
  error?: string;
}

export interface SyncPushResponse {
  results: SyncMutationResult[];
}

export const syncPullQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

export interface SyncChange {
  entityType: string;
  entityId: string;
  version: number;
  /** null unless the record is a tombstone. */
  deletedAt: string | null;
  /** Full record snapshot; null for tombstones. */
  data: Record<string, unknown> | null;
  /** Server change sequence used as the pull cursor. */
  seq: number;
}

export interface SyncPullResponse {
  changes: SyncChange[];
  nextCursor: number;
  hasMore: boolean;
}

/** Client-side outbox states for sync-capable clients. */
export const OUTBOX_STATES = ['pending', 'syncing', 'synced', 'failed', 'conflict'] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];
