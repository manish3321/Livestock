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
  RoundTodayDto,
  ScanCreate,
  ScanResolveDto,
} from '@farm/contracts';
import { api } from './client';

export function startRound(body: RecordingRoundCreate): Promise<RecordingRoundDto> {
  return api('/v1/rounds', { method: 'POST', body: JSON.stringify(body) });
}

export function getActiveRound(
  mode?: RecordingMode,
  session?: MilkSession,
): Promise<RecordingRoundDto | null> {
  const qs = new URLSearchParams();
  if (mode) qs.set('mode', mode);
  if (session) qs.set('session', session);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return api(`/v1/rounds/active${suffix}`);
}

export function getRoundRemaining(id: string): Promise<RoundRemainingDto> {
  return api(`/v1/rounds/${id}/remaining`);
}

/** Who is still not done today for a mode/session, even before a round is started. */
export function getRoundToday(mode: RecordingMode, session?: MilkSession): Promise<RoundTodayDto> {
  const qs = new URLSearchParams({ mode });
  if (session) qs.set('session', session);
  return api(`/v1/rounds/today?${qs.toString()}`);
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
