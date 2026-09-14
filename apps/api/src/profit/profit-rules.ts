const DAY = 24 * 60 * 60 * 1000;

/** Section 5.10 — late-lactation suppression. Not SpeciesConfig values. */
const YIELD_DROP_DIM_LIMIT: Record<string, number> = {
  BUFFALO: 200,
  COW: 240,
  CATTLE: 240,
};

export const YIELD_DROP_CAUSES = [
  'mastitis',
  'heat stress',
  'feed change',
  'illness',
  'milking error',
] as const;

export function fallbackEffectivePrice(milkPriceNpr: number): number {
  return milkPriceNpr * 0.85;
}

/** Weighted mean of the last 3 periods by litres supplied. */
export function weightedEffectivePrice(
  payments: Array<{ netPayableNpr: number; litresSupplied: number }>,
): number | null {
  const last3 = payments.slice(0, 3);
  const litres = last3.reduce((s, p) => s + p.litresSupplied, 0);
  if (litres <= 0) return null;
  const net = last3.reduce((s, p) => s + p.netPayableNpr, 0);
  return net / litres;
}

export function daysInMilk(lactationStart: Date | null | undefined, now: Date): number | null {
  if (!lactationStart) return null;
  return Math.floor((now.getTime() - lactationStart.getTime()) / DAY);
}

export function shouldSuppressYieldDrop(input: {
  species: string;
  daysInMilk: number | null;
  withholdOpen: boolean;
  priorRecordDays: number;
}): boolean {
  if (input.withholdOpen) return true;
  if (input.priorRecordDays < 4) return true;
  const limit = YIELD_DROP_DIM_LIMIT[input.species];
  if (limit != null && input.daysInMilk != null && input.daysInMilk > limit) return true;
  return false;
}

export function yieldDropImmediate(todayTotal: number, rolling7Mean: number): boolean {
  return rolling7Mean > 0 && todayTotal < rolling7Mean * 0.8;
}

export function yieldDropSustained(last3Days: number[], rolling7Mean: number): boolean {
  if (rolling7Mean <= 0 || last3Days.length < 3) return false;
  return last3Days.every((d) => d < rolling7Mean * 0.9);
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function remainingFromMovements(
  qtyReceived: number,
  movements: Array<{ type: string; quantity: number }>,
): number {
  return movements.reduce((qty, m) => {
    if (m.type === 'IN') return qty + m.quantity;
    if (m.type === 'OUT') return qty - m.quantity;
    return m.quantity;
  }, qtyReceived);
}

export function perHead(amount: number, activeCount: number): number {
  if (activeCount <= 0) return 0;
  return amount / activeCount;
}

export function dailyLabour(labourMonthlyNpr: number, activeCount: number): number {
  return perHead(labourMonthlyNpr, activeCount) / 30;
}

export type PriceSource = 'payments' | 'fallback';

export function resolvePrice(
  farm: { milkPriceNpr: number; effectivePriceNpr: number | null },
): { price: number; source: PriceSource } {
  if (farm.effectivePriceNpr != null && farm.effectivePriceNpr > 0) {
    return { price: farm.effectivePriceNpr, source: 'payments' };
  }
  return { price: fallbackEffectivePrice(Number(farm.milkPriceNpr) || 62), source: 'fallback' };
}
