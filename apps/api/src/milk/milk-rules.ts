import type { MilkDestination, MilkDisposal } from '@farm/contracts';

export const EXIT_STATUSES = ['SOLD', 'DEAD', 'CULLED'] as const;
export const NOT_MILKING_STATUSES = [...EXIT_STATUSES, 'DRY'] as const;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function mapMilkDisposal(disposal: MilkDisposal): MilkDestination {
  if (disposal === 'FED_TO_CALVES') return 'CALF';
  return disposal;
}

export function toApiDisposal(dest: string | null | undefined): MilkDisposal | null {
  if (!dest) return null;
  if (dest === 'CALF') return 'FED_TO_CALVES';
  if (dest === 'SOLD' || dest === 'HOUSEHOLD' || dest === 'DISCARDED' || dest === 'FED_TO_CALVES') {
    return dest;
  }
  return null;
}

const UUID_RE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** Resolve printed QR text or a typed herd number into an animal id or search query. */
export function parseScanPayload(raw: string): { animalId?: string; query?: string } {
  const text = raw.trim();
  if (!text) return {};
  const animalMatch = text.match(
    new RegExp(`(?:/scan/a/|/a/|farm://a/)(${UUID_RE})`, 'i'),
  );
  if (animalMatch?.[1]) return { animalId: animalMatch[1].toLowerCase() };
  const bare = text.match(new RegExp(`^(${UUID_RE})$`, 'i'));
  if (bare?.[1]) return { animalId: bare[1].toLowerCase() };
  return { query: text };
}

export function digitsOf(q: string): string {
  return q.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Lower is a better match. Exact short number first, then the shared
 * sequence across species (42 → B42 and C42), then tag, then name.
 */
export function rankAnimalMatch(
  q: string,
  animal: { herdNumber: string | null; tag: string; name: string | null },
): number | null {
  const raw = q.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const digits = digitsOf(raw);
  const hn = (animal.herdNumber ?? '').toUpperCase();
  const tag = animal.tag.toUpperCase();
  const name = (animal.name ?? '').toUpperCase();

  if (hn && hn === upper) return 0;
  if (digits && hn === digits) return 1;
  if (digits && hn.endsWith(digits)) return 2;
  if (tag === upper || tag.includes(upper) || (digits && tag.includes(digits))) return 3;
  if (name.includes(upper)) return 4;
  return null;
}
