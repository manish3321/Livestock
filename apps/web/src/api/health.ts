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
  cost: number | null;
  medicine?: string | null;
  dosage?: string | null;
  method?: string | null;
  vetName?: string | null;
  outcome?: string | null;
  followUpAt?: string | null;
  cmtResult?: string | null;
  milkWithholdUntil?: string | null;
  meatWithholdUntil?: string | null;
  batchNumber?: string | null;
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

export function updateHealthRecord(
  id: string,
  body: Partial<HealthCreate>,
): Promise<HealthRecordDto> {
  return api(`/v1/health-records/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteHealthRecord(id: string): Promise<void> {
  return api(`/v1/health-records/${id}`, { method: 'DELETE' });
}

export function groupVaccinate(body: import('@farm/contracts').GroupVaccinate) {
  return api<{ created: number; blocked: string[] }>('/v1/health-records/group-vaccinate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function batchVaccinate(body: import('@farm/contracts').BatchVaccinate) {
  return api<{
    recorded: Array<{ animalId: string; vaccinationId: string }>;
    skipped: Array<{ animalId: string; reason: string }>;
    movements: number;
  }>('/v1/health/vaccinations/batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listHealthCalendar(from?: Date, to?: Date): Promise<HealthRecordDto[]> {
  return api(`/v1/health-records/calendar${toQuery({ from, to })}`);
}

export function createUdderCheck(body: import('@farm/contracts').UdderCheckCreate) {
  return api<import('@farm/contracts').UdderCheckDto>('/v1/udder-checks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function recordMortality(body: import('@farm/contracts').MortalityRecordCreate) {
  return api<import('@farm/contracts').MortalityRecordDto>('/v1/mortality', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
