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

/** HIGH TANK_VARIANCE when worse than −8% (short) — over-fill is rejected before save. */
export function shouldRaiseTankVariance(
  varianceLitres: number,
  variancePct: number | null,
): boolean {
  return variancePct != null && variancePct < -8;
}

/** Tank/delivery cannot claim more litres than were milked as SOLD. */
export function assertNotAboveMilked(claimed: number, milkedSold: number): void {
  if (claimed > milkedSold + 1e-9) {
    const err = new Error(
      `Cannot record ${claimed} L — only ${milkedSold} L was milked for sale`,
    ) as Error & { code: string };
    err.code = 'TANK_ABOVE_MILKED';
    throw err;
  }
}
