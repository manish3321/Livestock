/** Section 5.6 — tank expected litres are SOLD only. */

export function soldLitres(entries: Array<{ destination?: string | null; quantity: unknown }>): number {
  return entries
    .filter((e) => e.destination === 'SOLD')
    .reduce((sum, e) => sum + Number(e.quantity), 0);
}

export function tankVariance(actualLitres: number, expectedLitres: number): {
  varianceLitres: number;
  variancePct: number | null;
} {
  const varianceLitres = actualLitres - expectedLitres;
  if (expectedLitres <= 0) return { varianceLitres, variancePct: null };
  return { varianceLitres, variancePct: (varianceLitres / expectedLitres) * 100 };
}

/** HIGH TANK_VARIANCE when worse than −8% or any extra litres. */
export function shouldRaiseTankVariance(
  varianceLitres: number,
  variancePct: number | null,
): boolean {
  if (varianceLitres > 0) return true;
  return variancePct != null && variancePct < -8;
}
