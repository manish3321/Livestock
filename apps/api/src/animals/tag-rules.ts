import { SPECIES_HERD_LETTER, SPECIES_TAG_PREFIX, type Species } from '@farm/contracts';

export function herdNumberOf(species: Species, n: number): string {
  return `${SPECIES_HERD_LETTER[species]}${String(n).padStart(2, '0')}`;
}

export function parseHerdNumber(value: string): { letter: string; n: number } | null {
  const match = value.trim().toUpperCase().match(/^([BCGP])(\d{1,6})$/);
  if (!match?.[1] || !match[2]) return null;
  return { letter: match[1], n: Number(match[2]) };
}

/** Next BUF001-style tag that still fits the create-schema regex. */
export function nextPrintableTag(tag: string): string | null {
  const match = tag.toUpperCase().match(/^([A-Z]{3})(\d{3,5})$/);
  if (!match?.[1] || !match[2]) return null;
  const next = Number(match[2]) + 1;
  if (next > 99999) return null;
  return `${match[1]}${String(next).padStart(Math.max(match[2].length, 3), '0')}`;
}

export function tagFromHerdSeq(species: Species, n: number): string {
  return `${SPECIES_TAG_PREFIX[species]}${String(n).padStart(3, '0')}`;
}
