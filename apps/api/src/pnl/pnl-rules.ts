import { PNL_RATIO_TARGETS } from '@farm/contracts';

export type RatioBand = 'LOW' | 'IN_RANGE' | 'HIGH' | 'NONE';

export function sharePct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return (part / total) * 100;
}

/** Total cost divided by litres actually sold. Null when nothing was sold. */
export function breakEvenPriceNpr(totalExpenses: number, soldLitres: number): number | null {
  if (soldLitres <= 0) return null;
  return totalExpenses / soldLitres;
}

export function bandStatus(
  value: number | null,
  min?: number,
  max?: number,
): RatioBand {
  if (value == null) return 'NONE';
  if (min != null && value < min) return 'LOW';
  if (max != null && value > max) return 'HIGH';
  return 'IN_RANGE';
}

export function buildRatioSnapshot(input: {
  revenue: number;
  expenses: number;
  feed: number;
  labour: number;
  health: number;
  soldLitres: number;
}) {
  const marginPct = sharePct(input.revenue - input.expenses, input.revenue);
  const feedSharePct = sharePct(input.feed, input.revenue);
  const labourSharePct = sharePct(input.labour, input.revenue);
  const healthSharePct = sharePct(input.health, input.revenue);
  return {
    targets: PNL_RATIO_TARGETS,
    marginPct,
    marginStatus: bandStatus(
      marginPct,
      PNL_RATIO_TARGETS.marginHealthyMinPct,
      PNL_RATIO_TARGETS.marginHealthyMaxPct,
    ),
    feedSharePct,
    feedStatus: bandStatus(
      feedSharePct,
      PNL_RATIO_TARGETS.feedShareMinPct,
      PNL_RATIO_TARGETS.feedShareMaxPct,
    ),
    labourSharePct,
    labourStatus: bandStatus(
      labourSharePct,
      PNL_RATIO_TARGETS.labourShareMinPct,
      PNL_RATIO_TARGETS.labourShareMaxPct,
    ),
    healthSharePct,
    healthStatus: bandStatus(healthSharePct, undefined, PNL_RATIO_TARGETS.healthShareMaxPct),
    breakEvenPriceNpr: breakEvenPriceNpr(input.expenses, input.soldLitres),
    soldLitres: input.soldLitres,
  };
}

export function yoyDelta(current: number, prior: number | null): number | null {
  if (prior == null) return null;
  return current - prior;
}
