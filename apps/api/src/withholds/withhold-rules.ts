import { startOfUtcDay } from '../milk/milk-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

export function addUtcDays(d: Date, days: number): Date {
  return new Date(startOfUtcDay(d).getTime() + days * DAY_MS);
}

/**
 * lastDoseDate = firstDoseAt + durationDays
 * endDate = lastDoseDate + withdrawalDays
 * = firstDoseAt + durationDays + withdrawalDays
 */
export function withholdEndDate(
  firstDoseAt: Date,
  durationDays: number,
  withdrawalDays: number,
): Date {
  return addUtcDays(firstDoseAt, durationDays + withdrawalDays);
}

/** 06:00 Asia/Kathmandu on the given calendar date (NPT = UTC+5:45). */
export function nepalSixAmOn(date: Date): Date {
  const day = startOfUtcDay(date);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 15, 0, 0));
}

export const WITHHOLD_MESSAGE_NP = 'दूध बेच्नु हुँदैन';
