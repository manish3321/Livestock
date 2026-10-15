import type { ChangeRequestDto } from '@farm/contracts';
import { api } from './client';

export function listChangeRequests(params: { status?: string; mine?: boolean } = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.mine) q.set('mine', '1');
  const qs = q.toString();
  return api<ChangeRequestDto[]>(`/v1/change-requests${qs ? `?${qs}` : ''}`);
}

export function pendingChangeCount() {
  return api<{ count: number }>('/v1/change-requests/pending-count');
}

export function approveChange(id: string, note?: string) {
  return api<ChangeRequestDto>(`/v1/change-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export function rejectChange(id: string, note?: string) {
  return api<ChangeRequestDto>(`/v1/change-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export function cancelChange(id: string) {
  return api<ChangeRequestDto>(`/v1/change-requests/${id}/cancel`, { method: 'POST', body: '{}' });
}
