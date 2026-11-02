const UUID_RE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** Resolve printed QR text or a typed herd number into an animal id or search query. */
export function parseScanPayload(raw: string): { animalId?: string; query?: string } {
  const text = raw.trim();
  if (!text) return {};
  const animalMatch = text.match(new RegExp(`(?:/scan/a/|/a/|farm://a/)(${UUID_RE})`, 'i'));
  if (animalMatch?.[1]) return { animalId: animalMatch[1].toLowerCase() };
  const bare = text.match(new RegExp(`^(${UUID_RE})$`, 'i'));
  if (bare?.[1]) return { animalId: bare[1].toLowerCase() };
  return { query: text };
}

export function digitsOf(q: string): string {
  return q.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Lower is a better match. Keep in sync with apps/api/src/milk/milk-rules.ts —
 * digit match is the full numeric suffix (B21 → "21"), not String.endsWith,
 * so typing B01 / 1 does not also hit B11, B21, C21, …
 */
export function rankAnimalMatch(
  q: string,
  animal: { shortNo: string | null; tag: string; name: string | null },
): number | null {
  const raw = q.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const digits = digitsOf(raw);
  const hn = (animal.shortNo ?? '').toUpperCase();
  const tag = animal.tag.toUpperCase();
  const name = (animal.name ?? '').toUpperCase();
  const hnDigits = digitsOf(hn);
  const tagDigits = digitsOf(tag);

  if (hn && hn === upper) return 0;
  if (tag === upper) return 0;
  if (digits && hn === digits) return 1;
  if (digits && hnDigits && hnDigits === digits) return 2;
  if (digits && tagDigits && tagDigits === digits) return 3;
  if (upper.length >= 3 && name.includes(upper)) return 4;
  return null;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function expectedRange(rolling7Mean: number | null): { low: number | null; high: number | null } {
  if (rolling7Mean == null) return { low: null, high: null };
  return { low: round1(rolling7Mean * 0.6), high: round1(rolling7Mean * 1.4) };
}
