import type { GroupCreate, MortalityCreate, PageResult } from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface GroupDto {
  id: string;
  farmId: string;
  name: string;
  poultryType: string;
  breed: string;
  initialCount: number;
  currentCount: number;
  startedAt: string;
  healthStatus: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MortalityDto {
  id: string;
  groupId: string;
  count: number;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
}

export function listGroups(
  query: { page?: number; pageSize?: number } = {},
): Promise<PageResult<GroupDto>> {
  return api(`/v1/groups${toQuery(query)}`);
}

export function createGroup(body: GroupCreate): Promise<GroupDto> {
  return api('/v1/groups', { method: 'POST', body: JSON.stringify(body) });
}

export function logMortality(id: string, body: MortalityCreate): Promise<MortalityDto> {
  return api(`/v1/groups/${id}/mortality`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
