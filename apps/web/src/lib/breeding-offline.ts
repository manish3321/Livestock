import type { BreedingBoardDto, BreedingWatchDto } from '@farm/contracts';

const BOARD_KEY = 'farm.breeding.board';
const WATCH_KEY = 'farm.breeding.watch';

export function readBreedingBoardCache(): BreedingBoardDto | null {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    return raw ? (JSON.parse(raw) as BreedingBoardDto) : null;
  } catch {
    return null;
  }
}

export function writeBreedingBoardCache(board: BreedingBoardDto): void {
  localStorage.setItem(BOARD_KEY, JSON.stringify(board));
}

export function readBreedingWatchCache(): BreedingWatchDto | null {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    return raw ? (JSON.parse(raw) as BreedingWatchDto) : null;
  } catch {
    return null;
  }
}

export function writeBreedingWatchCache(watch: BreedingWatchDto): void {
  localStorage.setItem(WATCH_KEY, JSON.stringify(watch));
}
