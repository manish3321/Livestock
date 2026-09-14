import type {
  AnimalCreate,
  AnimalDetailDto,
  AnimalDto,
  AnimalEconomicsDto,
  AnimalListQuery,
  AnimalProductionStatsDto,
  AnimalUpdate,
  PageResult,
  WeightCreate,
  WeightRecordDto,
} from '@farm/contracts';
import { api, getAccessToken } from '../api/client';

export function searchAnimals(q: string) {
  return api<import('@farm/contracts').AnimalSearchHitDto[]>(
    `/v1/animals/search?q=${encodeURIComponent(q)}`,
  );
}

export function listAnimals(
  query: Partial<AnimalListQuery> = {},
): Promise<PageResult<AnimalDto>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return api(`/v1/animals${qs ? `?${qs}` : ''}`);
}

export function getAnimal(id: string): Promise<AnimalDetailDto> {
  return api(`/v1/animals/${id}`);
}

export function getAnimalEconomics(id: string): Promise<AnimalEconomicsDto> {
  return api(`/v1/animals/${id}/economics`);
}

export function getAnimalProductionStats(id: string): Promise<AnimalProductionStatsDto> {
  return api(`/v1/animals/${id}/production-stats`);
}

export async function uploadAnimalPhoto(id: string, file: File): Promise<AnimalDetailDto> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/v1/animals/${id}/photo`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = (await res.json()) as { message?: string };
      if (err.message) message = err.message;
    } catch {
      /* ignore */
    }
    throw new Error(message || 'Upload failed');
  }
  return (await res.json()) as AnimalDetailDto;
}

export function createAnimal(body: AnimalCreate): Promise<AnimalDetailDto> {
  return api('/v1/animals', { method: 'POST', body: JSON.stringify(body) });
}

export function updateAnimal(id: string, body: AnimalUpdate): Promise<AnimalDetailDto> {
  return api(`/v1/animals/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteAnimal(id: string): Promise<void> {
  return api(`/v1/animals/${id}`, { method: 'DELETE' });
}

export function previewAnimalImport(csv: string) {
  return api<import('@farm/contracts').AnimalImportPreviewRow[]>('/v1/animals/import/preview', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
}

export function commitAnimalImport(rows: import('@farm/contracts').AnimalImportRow[]) {
  return api<{ created: number; errors: import('@farm/contracts').AnimalImportPreviewRow[] }>(
    '/v1/animals/import',
    { method: 'POST', body: JSON.stringify({ rows }) },
  );
}

export function printTags(ids?: string[]) {
  const qs = ids?.length ? `?ids=${ids.join(',')}` : '';
  return api<Array<{ id: string; herdNumber: string | null; tag: string; name: string | null; qrPath: string }>>(
    `/v1/animals/tags/print${qs}`,
  );
}

export function replaceTag(id: string, body: import('@farm/contracts').TagReplace) {
  return api(`/v1/animals/${id}/retag`, { method: 'POST', body: JSON.stringify(body) });
}

export function placeMarker(body: import('@farm/contracts').MarkerPlace) {
  return api('/v1/animals/markers', { method: 'POST', body: JSON.stringify(body) });
}

export function addWeight(id: string, body: WeightCreate): Promise<WeightRecordDto> {
  return api(`/v1/animals/${id}/weights`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Download CSV using the current access token (not routed through api()). */
export async function downloadAnimalsCsv(): Promise<void> {
  const token = getAccessToken();
  const res = await fetch('/v1/animals/export.csv', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `animals-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
