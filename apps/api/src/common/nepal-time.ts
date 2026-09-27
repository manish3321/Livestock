/**
 * Nepal Time is UTC+05:45 and has no daylight saving.
 *
 * Every reminder hour in this product is a Nepal wall-clock hour: the buffalo
 * silent-heat check is worth something at 04:00 and nothing at 09:45. Date's
 * setHours/getHours read the server's own zone, which is UTC on the deployment
 * target, so they must never be used to place or read a reminder hour.
 *
 * Asia/Kathmandu day boundaries live in notifications/notification-rules
 * (nepalDayBounds, nepalHour); this module holds the offset those hours share.
 */
export const NEPAL_UTC_OFFSET_MINUTES = 5 * 60 + 45;

const MINUTE_MS = 60 * 1000;

/** The instant of hour:00 Nepal time, on the Nepal calendar date `date` falls on. */
export function atNepalHour(date: Date, hour: number): Date {
  const wall = new Date(date.getTime() + NEPAL_UTC_OFFSET_MINUTES * MINUTE_MS);
  const at = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), hour, 0, 0, 0);
  return new Date(at - NEPAL_UTC_OFFSET_MINUTES * MINUTE_MS);
}

/** The Nepal wall-clock hour of an instant, 0–23, whatever the server zone is. */
export function nepalHourOf(date: Date): number {
  return new Date(date.getTime() + NEPAL_UTC_OFFSET_MINUTES * MINUTE_MS).getUTCHours();
}
