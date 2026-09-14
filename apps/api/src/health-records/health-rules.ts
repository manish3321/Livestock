/** Remaining doses after the one just given. 4 days × 2/day − 1 = 7. */
export function remainingDoseCount(
  durationDays: number,
  frequencyPerDay: number,
  dosesGiven = 1,
): number {
  return Math.max(0, durationDays * frequencyPerDay - dosesGiven);
}

export function hoursBetweenDoses(frequencyPerDay: number): number {
  return 24 / Math.max(1, frequencyPerDay);
}

export type QuarterScores = { LF: number; RF: number; LR: number; RR: number };
export type MastitisClass = 'HEALTHY' | 'SUBCLINICAL' | 'CLINICAL';
export type Quarter = 'LF' | 'RF' | 'LR' | 'RR';

const QUARTERS: Quarter[] = ['LF', 'RF', 'LR', 'RR'];

/** Section 5.11. */
export function classifyMastitis(input: {
  quarterScores: QuarterScores;
  appearance: string;
  signs?: string[];
  sccThousand?: number | null;
}): MastitisClass {
  const visibleSigns = (input.signs ?? []).filter((s) => s !== 'NONE');
  if (input.appearance !== 'NORMAL' || visibleSigns.length > 0) return 'CLINICAL';
  const worst = Math.max(...QUARTERS.map((q) => input.quarterScores[q] ?? 0));
  if (worst >= 2 || (input.sccThousand != null && input.sccThousand > 400)) return 'SUBCLINICAL';
  return 'HEALTHY';
}

export function affectedQuarters(
  scores: QuarterScores,
  classification: MastitisClass,
): Quarter[] {
  const scored = QUARTERS.filter((q) => (scores[q] ?? 0) >= 2);
  if (classification === 'CLINICAL' && scored.length === 0) return [...QUARTERS];
  return scored;
}

export function temperatureOutOfRange(tempC: number, minC: number, maxC: number): boolean {
  return tempC < minC || tempC > maxC;
}

/** Section 5.13 — remaining lactation is only for a lactating animal. */
export function remainingLactationValue(input: {
  status: string;
  daysInMilk: number | null;
  lactationDays: number;
  rolling7Mean: number | null;
  effectivePriceNpr: number;
}): number {
  if (input.status !== 'LACTATING') return 0;
  if (input.daysInMilk == null || input.rolling7Mean == null || input.rolling7Mean <= 0) return 0;
  const remainingDays = Math.max(0, input.lactationDays - input.daysInMilk);
  return remainingDays * input.rolling7Mean * input.effectivePriceNpr;
}

export function estimatedMortalityLoss(baseValue: number, remainingLactation: number): number {
  return baseValue + remainingLactation;
}
