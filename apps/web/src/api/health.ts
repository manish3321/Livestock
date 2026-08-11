import type { HealthCreate, HealthListQuery, PageResult } from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface HealthRecordDto {
  id: string;
  farmId: string;
  type: string;
  title: string;
  animalId: string | null;
  groupId: string | null;
  herdBatchId?: string | null;
  animalTag?: string | null;
  animalName?: string | null;
  herdBatchName?: string | null;
  performedAt: string;
  nextDueAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listHealthRecords(
  query: Partial<HealthListQuery> = {},
): Promise<PageResult<HealthRecordDto>> {
  return api(`/v1/health-records${toQuery(query)}`);
}

export function createHealthRecord(body: HealthCreate): Promise<HealthRecordDto> {
  return api('/v1/health-records', { method: 'POST', body: JSON.stringify(body) });
}
