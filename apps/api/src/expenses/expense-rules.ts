import {
  EXPENSE_ESCALATION_THRESHOLDS,
  type ExpenseCategory,
} from '@farm/contracts';

/** Workers submit; over the category limit goes to the owner. */
export function approvalStatusFor(
  category: ExpenseCategory,
  amount: number,
): 'PENDING' | 'ESCALATED' {
  const threshold = EXPENSE_ESCALATION_THRESHOLDS[category];
  return amount > threshold ? 'ESCALATED' : 'PENDING';
}

/** Nepal monsoon is June–September; dry season is the rest of the year. */
export function nepalSeason(month: number): 'MONSOON' | 'DRY' {
  return month >= 6 && month <= 9 ? 'MONSOON' : 'DRY';
}

export function budgetVariance(
  actual: number,
  budget: number,
): { variance: number; variancePct: number | null; alert: 'OVER' | 'OK' | 'NONE' } {
  if (budget <= 0) {
    return { variance: actual, variancePct: null, alert: 'NONE' };
  }
  const variance = actual - budget;
  return {
    variance,
    variancePct: (variance / budget) * 100,
    alert: actual > budget ? 'OVER' : 'OK',
  };
}
