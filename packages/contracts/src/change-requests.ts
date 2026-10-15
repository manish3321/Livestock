import { z } from 'zod';

export const CHANGE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'FAILED', 'CANCELLED'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

/** Response body (HTTP 202) when an edit was held for approval instead of applied. */
export interface PendingApprovalResponse {
  pendingApproval: true;
  changeRequestId: string;
  message: string;
}

export function isPendingApproval(value: unknown): value is PendingApprovalResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { pendingApproval?: unknown }).pendingApproval === true
  );
}

export interface ChangeRequestDto {
  id: string;
  method: 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  /** e.g. animal, health-record, milk-entry */
  entityType: string;
  entityId: string | null;
  /** Human label for the record (tag, title, ...), when known. */
  entityLabel: string | null;
  /** Fields the edit would set (empty for deletes). */
  changes: Record<string, unknown>;
  /** The same fields as they were when the edit was requested. */
  before: Record<string, unknown> | null;
  reason: string | null;
  status: ChangeRequestStatus;
  requestedBy: { id: string; name: string };
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  error: string | null;
  createdAt: string;
}

export const changeRequestReviewSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type ChangeRequestReview = z.infer<typeof changeRequestReviewSchema>;
