import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingMetricsDto,
  BreedingUpdate,
  PageResult,
  PedigreeNodeDto,
} from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface BreedingDto {
  id: string;
  farmId: string;
  motherId: string;
  motherTag?: string | null;
  matingType: string;
  fatherTagOrAi: string | null;
  matingDate: string;
  dueDate: string;
  pregnancyStatus: string;
  birthDate: string | null;
  offspringTag: string | null;
  offspringAnimalId?: string | null;
  calvingDifficulty?: string | null;
  colostrumFed?: boolean | null;
  colostrumWithin4h?: boolean | null;
  colostrumLiters?: number | null;
  notes: string | null;
  daysRemaining: number | null;
  daysOpen?: number | null;
  calvingIntervalDays?: number | null;
  repeatBreeder?: boolean;
  inbreedingWarning?: boolean;
  sharedAncestorIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export function listBreeding(
  query: Partial<BreedingListQuery> = {},
): Promise<PageResult<BreedingDto>> {
  return api(`/v1/breeding${toQuery(query)}`);
}

export function createBreeding(body: BreedingCreate): Promise<BreedingDto> {
  return api('/v1/breeding', { method: 'POST', body: JSON.stringify(body) });
}

export function updateBreeding(id: string, body: BreedingUpdate): Promise<BreedingDto> {
  return api(`/v1/breeding/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteBreeding(id: string): Promise<void> {
  return api(`/v1/breeding/${id}`, { method: 'DELETE' });
}

export function recordCalving(id: string, body: import('@farm/contracts').CalvingInput) {
  return api<BreedingDto>(`/v1/breeding/${id}/calving`, { method: 'POST', body: JSON.stringify(body) });
}

export function recordFarmCalving(body: import('@farm/contracts').CalvingInput) {
  return api(`/v1/breeding/calving`, { method: 'POST', body: JSON.stringify(body) });
}

export function pregnancyCheck(id: string, body: import('@farm/contracts').PregnancyCheck) {
  return api<BreedingDto>(`/v1/breeding/${id}/pd`, { method: 'POST', body: JSON.stringify(body) });
}

export function recordColostrum(id: string, body: import('@farm/contracts').ColostrumInput) {
  return api<BreedingDto>(`/v1/breeding/${id}/colostrum`, { method: 'POST', body: JSON.stringify(body) });
}

export function recordFarmColostrum(body: import('@farm/contracts').ColostrumInput) {
  return api(`/v1/breeding/colostrum`, { method: 'POST', body: JSON.stringify(body) });
}

export interface HeatLogDto {
  id: string;
  animalId: string;
  animalTag: string | null;
  observedAt: string;
  intensity: string;
  observerName: string | null;
  signs: string | null;
  notes: string | null;
  createdAt: string;
  nextHeatAt?: string;
  serviceWindowStart?: string;
  serviceWindowEnd?: string;
  tooSoonDays?: number | null;
}

export function listHeat(animalId?: string): Promise<PageResult<HeatLogDto>> {
  return api(`/v1/breeding/heat${toQuery({ pageSize: 200, animalId })}`);
}

export function createHeat(body: import('@farm/contracts').HeatCreate): Promise<HeatLogDto> {
  return api('/v1/breeding/heat', { method: 'POST', body: JSON.stringify(body) });
}

export function updateHeat(
  id: string,
  body: import('@farm/contracts').HeatUpdate,
): Promise<HeatLogDto> {
  return api(`/v1/breeding/heat/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteHeat(id: string): Promise<void> {
  return api(`/v1/breeding/heat/${id}`, { method: 'DELETE' });
}

export function breedingMetrics(): Promise<BreedingMetricsDto> {
  return api('/v1/breeding/metrics');
}

export function stageDurations(from?: Date, to?: Date) {
  return api<import('@farm/contracts').StageDurationsDto>(
    `/v1/breeding/stage-durations${toQuery({ from, to })}`,
  );
}

export function animalPedigree(animalId: string): Promise<PedigreeNodeDto> {
  return api(`/v1/breeding/pedigree/${animalId}`);
}

export function breedingBoard(date?: string): Promise<import('@farm/contracts').BreedingBoardDto> {
  return api(`/v1/breeding/board${toQuery({ date })}`);
}

export function breedingWatch(stage?: string): Promise<import('@farm/contracts').BreedingWatchDto> {
  return api(`/v1/breeding/watch${toQuery({ stage })}`);
}

export function animalReproTimeline(animalId: string): Promise<import('@farm/contracts').ReproTimelineDto> {
  return api(`/v1/animals/${animalId}/repro-timeline`);
}

export function recordHeatObservation(body: {
  animalId: string;
  observed: boolean;
  taskId?: string;
}): Promise<{ id: string; observed: boolean; next: { form: string; animalId: string; taskId: string | null } | null }> {
  return api('/v1/breeding/heat-observation', { method: 'POST', body: JSON.stringify(body) });
}

export function completeDryOff(body: {
  animalId: string;
  taskId?: string;
  stillPregnant?: boolean;
}): Promise<{ animalId: string; status: string; driedOff: boolean; pregnancyCleared?: boolean }> {
  return api('/v1/breeding/dry-off', { method: 'POST', body: JSON.stringify(body) });
}

export function completeSyncTask(taskId: string) {
  return api(`/v1/breeding/sync-tasks/${taskId}/complete`, { method: 'POST' });
}

export function suggestProtocol(animalId: string) {
  return api<import('@farm/contracts').ProtocolSuggestDto>(
    `/v1/breeding/protocols/suggest${toQuery({ animalId })}`,
  );
}

export function enrollSync(body: {
  animalId: string;
  protocolId: string;
  startDate: Date;
}) {
  return api('/v1/breeding/sync-enrollments', { method: 'POST', body: JSON.stringify(body) });
}

export function resolveDecision(taskId: string, action: 'MINERAL_STARTED' | 'STOP' | 'ENROLLED') {
  return api(`/v1/breeding/decisions/${taskId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}
