import {
  SPECIES_HERD_LETTER,
  SPECIES_TAG_PREFIX,
  TAG_SEQUENCE_BLOCK_SIZE,
  type Species,
  type TagSequenceBlockDto,
} from '@farm/contracts';
import type { FarmStore } from './store';

export function remainingInBlock(block: TagSequenceBlockDto): number {
  if (block.exhaustedAt) return 0;
  return Math.max(0, block.rangeEnd - block.nextValue + 1);
}

export function openBlock(store: FarmStore, species: Species): TagSequenceBlockDto | null {
  const open = store.tagBlocks
    .filter((b) => b.species === species && remainingInBlock(b) > 0)
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  return open[0] ?? null;
}

export function rememberBlock(store: FarmStore, block: TagSequenceBlockDto): void {
  store.tagBlocks = store.tagBlocks.filter((b) => b.id !== block.id);
  store.tagBlocks.push(block);
}

export function needsClaim(store: FarmStore, species: Species, minRemaining = 10): boolean {
  const block = openBlock(store, species);
  return !block || remainingInBlock(block) < minRemaining;
}

export function takeNextShortNo(
  store: FarmStore,
  species: Species,
): { shortNo: string; tag: string; seq: number } | { exhausted: true } {
  const block = openBlock(store, species);
  if (!block) return { exhausted: true };
  const seq = block.nextValue;
  block.nextValue += 1;
  if (block.nextValue > block.rangeEnd) block.exhaustedAt = new Date().toISOString();
  return {
    seq,
    shortNo: `${SPECIES_HERD_LETTER[species]}${String(seq).padStart(2, '0')}`,
    tag: `${SPECIES_TAG_PREFIX[species]}${String(seq).padStart(3, '0')}`,
  };
}

export { TAG_SEQUENCE_BLOCK_SIZE };
