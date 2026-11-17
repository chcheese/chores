import { TZDate } from "@date-fns/tz";

/**
 * Calendar dates are plain "YYYY-MM-DD" strings. All arithmetic on them is done
 * on UTC-midnight Date objects, so daylight-saving transitions can never shift a
 * day. The only place a real time zone matters is turning an instant ("now", a
 * completion timestamp) into the calendar date it falls on in APP_TZ.
 */
export type CalendarDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = toUtc(value);
  return fromUtc(d) === value;
}

export function toUtc(date: CalendarDate): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid calendar date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function fromUtc(d: Date): CalendarDate {
  return d.toISOString().slice(0, 10);
}

/** Calendar date of an instant in the given IANA time zone. */
export function localDate(instant: Date, tz: string): CalendarDate {
  const z = new TZDate(instant.getTime(), tz);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/**
 * Adds months, clamping to the last day of the target month
 * (Jan 31 + 1 month = Feb 28/29, never Mar 3).
 */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const d = toUtc(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: CalendarDate, b: CalendarDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function maxDate(a: CalendarDate, b: CalendarDate): CalendarDate {
  return a >= b ? a : b;
}
