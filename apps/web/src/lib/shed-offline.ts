import type { MilkEntryCreate, MilkEntryDto, ScanCreate, ScanResolveDto } from '@farm/contracts';
import { patchMilk, postMilk, postScan } from '../api/rounds';

const QUEUE_KEY = 'farm.shed.queue';
const CACHE_KEY = 'farm.shed.cache';
const ROUND_KEY = 'farm.shed.round';

export type ShedQueuedOp =
  | { kind: 'milk'; body: MilkEntryCreate }
  | { kind: 'milk-patch'; id: string; litres: number; reason?: string }
  | { kind: 'scan'; body: ScanCreate };

interface ShedCache {
  remaining: Array<{
    id: string;
    shortNo: string | null;
    tag: string;
    name: string | null;
    species: string;
    penName: string | null;
    photoUrl: string | null;
    usualLitres: number | null;
    withholdActive: boolean;
  }>;
  scans: Record<string, ScanResolveDto>;
  recorded?: number;
  expected?: number;
}

export function readShedCache(): ShedCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ShedCache) : { remaining: [], scans: {} };
  } catch {
    return { remaining: [], scans: {} };
  }
}

export function writeShedCache(cache: ShedCache): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function rememberActiveRound(id: string | null, mode?: string, session?: string | null): void {
  if (!id) {
    localStorage.removeItem(ROUND_KEY);
    return;
  }
  localStorage.setItem(ROUND_KEY, JSON.stringify({ id, mode, session }));
}

export function readActiveRound(): { id: string; mode?: string; session?: string | null } | null {
  try {
    const raw = localStorage.getItem(ROUND_KEY);
    return raw ? (JSON.parse(raw) as { id: string; mode?: string; session?: string | null }) : null;
  } catch {
    return null;
  }
}

export function enqueueShedOp(op: ShedQueuedOp): void {
  const queue = readQueue();
  queue.push(op);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function readQueue(): ShedQueuedOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ShedQueuedOp[]) : [];
  } catch {
    return [];
  }
}

export async function flushShedQueue(): Promise<void> {
  const pending = readQueue();
  if (!pending.length) return;
  const leftover: ShedQueuedOp[] = [];
  for (const op of pending) {
    try {
      if (op.kind === 'milk') await postMilk(op.body);
      else if (op.kind === 'milk-patch') await patchMilk(op.id, { litres: op.litres, reason: op.reason });
      else await postScan(op.body);
    } catch {
      leftover.push(op);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(leftover));
}

export function cacheScan(dto: ScanResolveDto): void {
  const cache = readShedCache();
  cache.scans[dto.animal.id] = dto;
  writeShedCache(cache);
}

export function cachedScan(animalId: string): ScanResolveDto | undefined {
  return readShedCache().scans[animalId];
}

export function resolveCachedByNumber(q: string): ShedCache['remaining'] {
  const digits = q.replace(/\D/g, '').replace(/^0+/, '');
  const upper = q.trim().toUpperCase();
  return readShedCache().remaining.filter((a) => {
    const hn = (a.shortNo ?? '').toUpperCase();
    return hn === upper || (digits && hn.endsWith(digits));
  });
}

export async function saveMilkOnlineOrQueue(
  body: MilkEntryCreate,
  existingId?: string | null,
): Promise<MilkEntryDto | { queued: true }> {
  if (existingId) {
    try {
      return await patchMilk(existingId, { litres: body.litres, reason: 'shed-correction' });
    } catch {
      enqueueShedOp({ kind: 'milk-patch', id: existingId, litres: body.litres, reason: 'shed-correction' });
      return { queued: true };
    }
  }
  try {
    return await postMilk(body);
  } catch (err) {
    if (!navigator.onLine || err instanceof TypeError) {
      enqueueShedOp({ kind: 'milk', body });
      return { queued: true };
    }
    throw err;
  }
}
