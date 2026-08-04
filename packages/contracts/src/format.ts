/** Locale/formatting helpers for the web dashboard. */

export const FARM_TIMEZONE = 'Asia/Kathmandu';
export const CURRENCY = 'NPR';
export const SUPPORTED_LOCALES = ['en', 'ne'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Format an amount in Nepalese rupees using lakh/crore digit grouping,
 * e.g. 345000 -> "NPR 3,45,000".
 */
export function formatNPR(amount: number, locale: Locale = 'en'): string {
  const formatted = new Intl.NumberFormat(locale === 'ne' ? 'ne-NP' : 'en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
  return `NPR ${formatted}`;
}

export function formatDate(date: Date | string, locale: Locale = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'ne' ? 'ne-NP' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: FARM_TIMEZONE,
  }).format(d);
}

export function formatDateTime(date: Date | string, locale: Locale = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'ne' ? 'ne-NP' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FARM_TIMEZONE,
  }).format(d);
}
