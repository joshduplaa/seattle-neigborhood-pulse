/**
 * Calendar-date helpers.
 *
 * The source publishes `createddate` as a floating timestamp (no offset),
 * recorded in Seattle local time. We therefore treat dates as plain
 * `YYYY-MM-DD` strings and do arithmetic in UTC so that no browser or server
 * timezone conversion shifts a record onto a different day.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const SEATTLE_TIME_ZONE = "America/Los_Angeles";

export function isValidYmd(value: string): boolean {
  const m = YMD.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function toUtc(ymd: string): Date {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  return fromUtc(new Date(toUtc(ymd).getTime() + days * DAY_MS));
}

/** Inclusive number of calendar days from `start` to `end`. */
export function daysInRange(start: string, end: string): number {
  return Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / DAY_MS) + 1;
}

export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Monday of the ISO week containing `ymd`. */
export function startOfWeek(ymd: string): string {
  const date = toUtc(ymd);
  const offset = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(ymd, -offset);
}

export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function endOfMonth(ymd: string): string {
  const date = toUtc(startOfMonth(ymd));
  return fromUtc(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/** Today's calendar date in Seattle. */
export function seattleToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEATTLE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatShortDate(ymd: string): string {
  return shortDate.format(toUtc(ymd));
}

export function formatLongDate(ymd: string): string {
  return longDate.format(toUtc(ymd));
}

export function formatMonthYear(ymd: string): string {
  return monthYear.format(toUtc(ymd));
}

/**
 * Format a floating local timestamp (`YYYY-MM-DDTHH:mm:ss`) without shifting
 * it through the viewer's timezone.
 */
export function formatLocalTimestamp(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const date = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])),
  );
  return dateTime.format(date);
}

/** Format an absolute instant (ISO string with offset) in Seattle time. */
export function formatInstantInSeattle(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SEATTLE_TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}
