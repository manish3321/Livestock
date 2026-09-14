import { describe, expect, it } from 'vitest';
import { EXPENSE_ESCALATION_THRESHOLDS } from '@farm/contracts';
import {
  approvalStatusFor,
  budgetVariance,
  nepalSeason,
} from '../src/expenses/expense-rules';

describe('expense-rules', () => {
  it('keeps the published NPR thresholds: feed higher than medicine', () => {
    expect(EXPENSE_ESCALATION_THRESHOLDS.FEED).toBe(50000);
    expect(EXPENSE_ESCALATION_THRESHOLDS.MEDICINE).toBe(25000);
    expect(EXPENSE_ESCALATION_THRESHOLDS.FEED).toBeGreaterThan(
      EXPENSE_ESCALATION_THRESHOLDS.MEDICINE,
    );
  });

  it('workers stay PENDING at the limit and escalate only when over it', () => {
    expect(approvalStatusFor('FEED', 50000)).toBe('PENDING');
    expect(approvalStatusFor('FEED', 50000.01)).toBe('ESCALATED');
    expect(approvalStatusFor('MEDICINE', 25000)).toBe('PENDING');
    expect(approvalStatusFor('MEDICINE', 25000.01)).toBe('ESCALATED');
  });

  it('flags budget overruns and treats monsoon as June–September', () => {
    expect(budgetVariance(8000, 10000).alert).toBe('OK');
    expect(budgetVariance(12000, 10000).alert).toBe('OVER');
    expect(budgetVariance(12000, 10000).variance).toBe(2000);
    expect(budgetVariance(50, 0).alert).toBe('NONE');
    expect(nepalSeason(6)).toBe('MONSOON');
    expect(nepalSeason(10)).toBe('DRY');
  });
});
