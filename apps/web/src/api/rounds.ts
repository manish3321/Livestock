import type {
  AnimalSearchHitDto,
  MilkDisposal,
  MilkEntryCreate,
  MilkEntryDto,
  MilkEntryPatch,
  MilkSession,
  RecordingMode,
  RecordingRoundCreate,
  RecordingRoundDto,
  RecordingRoundFinish,
  RoundRemainingDto,
  ScanCreate,
  ScanResolveDto,
} from '@farm/contracts';
import { api } from './client';

export function startRound(body: RecordingRoundCreate): Promise<RecordingRoundDto> {
  return api('/v1/rounds', { method: 'POST', body: JSON.stringify(body) });
}

export function getActiveRound(): Promise<RecordingRoundDto | null> {
  return api('/v1/rounds/active');
}

export function getRoundRemaining(id: string): Promise<RoundRemainingDto> {
  return api(`/v1/rounds/${id}/remaining`);
}

export function finishRound(id: string, body: RecordingRoundFinish): Promise<RecordingRoundDto> {
  return api(`/v1/rounds/${id}/finish`, { method: 'POST', body: JSON.stringify(body) });
}

export function abandonRound(id: string): Promise<RecordingRoundDto> {
  return api(`/v1/rounds/${id}/abandon`, { method: 'POST' });
}

export function postScan(body: ScanCreate): Promise<ScanResolveDto> {
  return api('/v1/scans', { method: 'POST', body: JSON.stringify(body) });
}

export function postMilk(body: MilkEntryCreate): Promise<MilkEntryDto> {
  return api('/v1/milk', { method: 'POST', body: JSON.stringify(body) });
}

export function patchMilk(id: string, body: MilkEntryPatch): Promise<MilkEntryDto> {
  return api(`/v1/milk/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function milkToday(session?: MilkSession): Promise<MilkEntryDto[]> {
  return api(`/v1/milk/today${session ? `?session=${session}` : ''}`);
}

export function searchAnimals(q: string): Promise<AnimalSearchHitDto[]> {
  return api(`/v1/animals/search?q=${encodeURIComponent(q)}`);
}

export type { MilkDisposal, RecordingMode, ScanResolveDto };
