import type { RootStackParamList } from '../navigation/types';

export type AppDest = {
  name: keyof RootStackParamList;
  params?: object;
};

/** Parse task `actionPath` values like `/breeding?form=heat&animalId=…` into stack destinations. */
export function destFromActionPath(path: string | undefined | null): AppDest | null {
  if (!path) return null;
  const raw = path.trim();
  if (!raw) return null;

  const qIndex = raw.indexOf('?');
  const pathname = (qIndex >= 0 ? raw.slice(0, qIndex) : raw).replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : '');

  const animalId = query.get('animalId') ?? undefined;
  const breedingId = query.get('breedingId') ?? undefined;
  const form = query.get('form') ?? undefined;
  const type = query.get('type') ?? undefined;
  const mode = query.get('mode') ?? undefined;
  const tab = query.get('tab') ?? undefined;

  const animalMatch = pathname.match(/\/animals\/([a-f0-9-]{36})$/i);
  if (animalMatch?.[1]) {
    return {
      name: 'AnimalDetail',
      params: { id: animalMatch[1], ...(tab ? { tab } : {}), ...(mode ? { mode } : {}) },
    };
  }

  const batchMatch = pathname.match(/\/batches\/([a-f0-9-]{36})$/i);
  if (batchMatch?.[1]) return { name: 'BatchDetail', params: { id: batchMatch[1] } };

  if (pathname.endsWith('/breeding') || pathname === '/breeding') {
    return {
      name: 'Breeding',
      params: {
        ...(form ? { form } : {}),
        ...(animalId ? { animalId } : {}),
        ...(breedingId ? { breedingId } : {}),
      },
    };
  }

  if (pathname.endsWith('/health') || pathname === '/health') {
    return {
      name: 'Health',
      params: {
        ...(type ? { type } : {}),
        ...(animalId ? { animalId } : {}),
      },
    };
  }

  if (pathname.endsWith('/shed') || pathname === '/shed') {
    return { name: 'Shed', params: mode ? { mode, ...(animalId ? { animalId } : {}) } : animalId ? { animalId } : undefined };
  }

  if (pathname.endsWith('/scan') || pathname === '/scan') return { name: 'Scan' };
  if (pathname.endsWith('/expenses') || pathname === '/expenses') {
    return { name: 'Expenses', params: animalId ? { animalId } : undefined };
  }
  if (pathname.endsWith('/inventory') || pathname === '/inventory') return { name: 'Inventory' };
  if (pathname.endsWith('/feed') || pathname === '/feed') {
    return { name: 'Feed', params: animalId ? { animalId } : undefined };
  }
  if (pathname.endsWith('/revenue') || pathname === '/revenue') {
    return { name: 'Revenue', params: animalId ? { animalId } : undefined };
  }
  if (pathname.endsWith('/animals') || pathname === '/animals') {
    return animalId
      ? { name: 'AnimalDetail', params: { id: animalId } }
      : { name: 'Animals' };
  }
  if (pathname.endsWith('/inbox') || pathname === '/inbox') return { name: 'Inbox' };
  if (pathname.endsWith('/production') || pathname === '/production') return { name: 'Production' };

  return null;
}
