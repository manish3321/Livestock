import type { FarmStore } from '../core/store';

export type AnimalSearchHit = {
  id: string;
  tag: string;
  name?: string | null;
  species?: string;
  shortNo?: string | null;
  penName?: string | null;
};

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Rank lower = better. Null = no match. Mirrors API ranking loosely. */
function rankLocal(q: string, a: AnimalSearchHit): number | null {
  const raw = q.trim().toLowerCase();
  if (!raw) return null;
  const tag = (a.tag ?? '').toLowerCase();
  const name = (a.name ?? '').toLowerCase();
  const short = (a.shortNo ?? '').toLowerCase();
  const digits = digitsOf(raw);

  if (tag === raw || short === raw) return 0;
  if (short && short.endsWith(digits) && digits.length > 0) return 1;
  if (tag.startsWith(raw) || short.startsWith(raw)) return 2;
  if (tag.includes(raw) || short.includes(raw)) return 3;
  if (name.includes(raw)) return 4;
  if (digits && (tag.includes(digits) || short.includes(digits))) return 5;
  return null;
}

/** Instant typeahead from the hydrated offline herd (no network). */
export function searchAnimalsLocal(store: FarmStore, q: string, limit = 8): AnimalSearchHit[] {
  const raw = q.trim();
  if (!raw) return [];
  const rows: Array<{ hit: AnimalSearchHit; rank: number }> = [];
  for (const a of store.animals.values()) {
    if (a.deletedAt) continue;
    const hit: AnimalSearchHit = {
      id: a.id,
      tag: a.tag,
      name: a.name,
      species: a.species,
      shortNo: a.shortNo,
      penName: a.penName,
    };
    const rank = rankLocal(raw, hit);
    if (rank == null) continue;
    rows.push({ hit, rank });
  }
  rows.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.hit.shortNo ?? a.hit.tag).localeCompare(b.hit.shortNo ?? b.hit.tag, undefined, {
        numeric: true,
      }),
  );
  return rows.slice(0, limit).map((r) => r.hit);
}
