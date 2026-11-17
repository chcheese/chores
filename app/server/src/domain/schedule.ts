import rrulePkg from "rrule";
import type { AssignmentMode, IntervalUnit, ScheduleType } from "../db/schema.js";
import { addDays, addMonths, type CalendarDate, diffDays, fromUtc, maxDate, toUtc } from "./dates.js";

// rrule ships CommonJS; under NodeNext the named exports live on the default export.
const { RRule } = rrulePkg as unknown as typeof import("rrule");

export interface ScheduleSpec {
  scheduleType: ScheduleType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  rrule: string | null;
  anchorDate: string | null;
}

export type ChoreStatus = "ok" | "due" | "overdue";

export function addInterval(date: CalendarDate, value: number, unit: IntervalUnit): CalendarDate {
  switch (unit) {
    case "day":
      return addDays(date, value);
    case "week":
      return addDays(date, value * 7);
    case "month":
      return addMonths(date, value);
  }
}

/** Approximate interval length in days (for UI sorting / staggering only). */
export function intervalDays(value: number, unit: IntervalUnit): number {
  return unit === "day" ? value : unit === "week" ? value * 7 : value * 30;
}

/** Validates an RRULE body; returns an error message or null. */
export function validateRrule(rule: string): string | null {
  try {
    const opts = RRule.parseString(rule);
    if (opts.freq === undefined) return "RRULE braucht FREQ";
    if (opts.count !== undefined || opts.until !== undefined) return "COUNT/UNTIL werden nicht unterstützt";
    new RRule({ ...opts, dtstart: new Date(Date.UTC(2026, 0, 1)) });
    return null;
  } catch (e) {
    return `Ungültige RRULE: ${(e as Error).message}`;
  }
}

/**
 * First occurrence of a fixed schedule strictly after `after`.
 * Interval rhythms are counted from the anchor (each step computed from the
 * anchor, so month-end clamping never drifts: Jan 31 → Feb 28 → Mar 31).
 */
export function nextFixedOccurrence(spec: ScheduleSpec, after: CalendarDate): CalendarDate {
  const anchor = spec.anchorDate ?? after;

  if (spec.rrule) {
    const opts = RRule.parseString(spec.rrule);
    const rule = new RRule({ ...opts, dtstart: toUtc(anchor) });
    const next = rule.after(toUtc(after), false);
    if (!next) throw new Error(`RRULE "${spec.rrule}" has no occurrence after ${after}`);
    return fromUtc(next);
  }

  if (anchor > after) return anchor;
  const step = spec.intervalValue;
  if (spec.intervalUnit === "month") {
    // Jump close to the target, then walk forward.
    const monthsBetween =
      (toUtc(after).getUTCFullYear() - toUtc(anchor).getUTCFullYear()) * 12 +
      (toUtc(after).getUTCMonth() - toUtc(anchor).getUTCMonth());
    let k = Math.max(0, Math.floor(monthsBetween / step) - 1);
    let candidate = addMonths(anchor, k * step);
    while (candidate <= after) {
      k += 1;
      candidate = addMonths(anchor, k * step);
    }
    return candidate;
  }
  const stepDays = spec.intervalUnit === "week" ? step * 7 : step;
  const k = Math.floor(diffDays(anchor, after) / stepDays) + 1;
  return addDays(anchor, k * stepDays);
}

/**
 * Next due date after the chore was completed (or skipped) on `onDate`.
 * - after_completion: interval counted from the completion day.
 * - fixed: next rhythm date after both the completion day and the current due
 *   date (finishing Saturday's chore on Thursday moves it to the *following*
 *   Saturday, not to the one two days later).
 */
export function nextDueAfter(spec: ScheduleSpec, currentNextDue: CalendarDate, onDate: CalendarDate): CalendarDate {
  if (spec.scheduleType === "after_completion") {
    return addInterval(onDate, spec.intervalValue, spec.intervalUnit);
  }
  return nextFixedOccurrence(spec, maxDate(onDate, currentNextDue));
}

/** Skipping a cycle: like completing, but measured from whichever is later, today or the due date. */
export function nextDueAfterSkip(spec: ScheduleSpec, currentNextDue: CalendarDate, today: CalendarDate): CalendarDate {
  const base = maxDate(today, currentNextDue);
  if (spec.scheduleType === "after_completion") {
    return addInterval(base, spec.intervalValue, spec.intervalUnit);
  }
  return nextFixedOccurrence(spec, base);
}

/** Snoozing moves the due date X days past whichever is later, today or the due date. */
export function snoozedDue(currentNextDue: CalendarDate, today: CalendarDate, days: number): CalendarDate {
  return addDays(maxDate(today, currentNextDue), days);
}

/** Initial due date for a newly created chore. */
export function initialNextDue(spec: ScheduleSpec, today: CalendarDate, lastDoneDate?: CalendarDate | null): CalendarDate {
  if (spec.scheduleType === "fixed") {
    const anchor = spec.anchorDate ?? today;
    // The anchor itself counts as an occurrence.
    return anchor >= today ? anchor : nextFixedOccurrence(spec, addDays(today, -1));
  }
  if (lastDoneDate) return addInterval(lastDoneDate, spec.intervalValue, spec.intervalUnit);
  return today;
}

export interface StatusInput {
  nextDue: CalendarDate;
  toleranceDays: number;
  counterTarget: number | null;
  counterValue: number;
}

export interface StatusResult {
  status: ChoreStatus;
  /** Days until due (negative = days overdue past the due date). */
  daysUntilDue: number;
  counterReached: boolean;
}

export function computeStatus(input: StatusInput, today: CalendarDate): StatusResult {
  const daysUntilDue = diffDays(today, input.nextDue);
  const counterReached = input.counterTarget != null && input.counterTarget > 0 && input.counterValue >= input.counterTarget;
  let status: ChoreStatus;
  if (daysUntilDue < -input.toleranceDays) status = "overdue";
  else if (daysUntilDue <= 0 || counterReached) status = "due";
  else status = "ok";
  return { status, daysUntilDue, counterReached };
}

export interface AssignmentInput {
  assignmentMode: AssignmentMode;
  assignedUserId: number | null;
  rotationUserIds: number[];
  rotationIndex: number;
}

/** The user currently responsible, or null for "anyone". */
export function currentAssignee(a: AssignmentInput): number | null {
  if (a.assignmentMode === "user") return a.assignedUserId;
  if (a.assignmentMode === "rotation" && a.rotationUserIds.length > 0) {
    return a.rotationUserIds[a.rotationIndex % a.rotationUserIds.length] ?? null;
  }
  return null;
}

/** Rotation index after a completion: the turn passes to the next person in the list. */
export function nextRotationIndex(a: AssignmentInput): number {
  if (a.assignmentMode !== "rotation" || a.rotationUserIds.length === 0) return a.rotationIndex;
  return (a.rotationIndex + 1) % a.rotationUserIds.length;
}

// ------------------------------------------------------------- seasons

/** Month (1–12) of a calendar date. */
export const monthOf = (date: CalendarDate): number => Number(date.slice(5, 7));

export function inSeason(date: CalendarDate, months: number[]): boolean {
  return months.length === 0 || months.includes(monthOf(date));
}

/** First date ≥ `date` that lies in season (the date itself, or the 1st of the next season month). */
export function seasonStart(date: CalendarDate, months: number[]): CalendarDate {
  if (inSeason(date, months)) return date;
  let first = `${date.slice(0, 7)}-01`;
  for (let i = 0; i < 12; i++) {
    first = addMonths(first, 1);
    if (inSeason(first, months)) return first;
  }
  return date; // unreachable for a non-empty month list
}

/**
 * Moves a computed due date into the season. Fixed rhythms stay on their own
 * occurrences (the first one inside the season); everything else starts on the
 * first day of the season.
 */
export function fitSeason(spec: ScheduleSpec, months: number[], due: CalendarDate): CalendarDate {
  if (months.length === 0 || inSeason(due, months)) return due;
  if (spec.scheduleType === "fixed") {
    let d = due;
    for (let i = 0; i < 1000 && !inSeason(d, months); i++) {
      d = nextFixedOccurrence(spec, maxDate(addDays(seasonStart(d, months), -1), d));
    }
    if (inSeason(d, months)) return d;
  }
  return seasonStart(due, months);
}

// ----------------------------------------------------------- condition

/** Rough length of one cycle in days, used for the condition bar. */
export function approxCycleDays(spec: ScheduleSpec): number {
  if (spec.rrule) {
    const weekly = /FREQ=WEEKLY(?:;INTERVAL=(\d+))?;BYDAY=([A-Z,]+)/.exec(spec.rrule);
    if (weekly?.[2]) return Math.max(1, Math.round((7 * Number(weekly[1] ?? 1)) / weekly[2].split(",").length));
    if (/FREQ=MONTHLY/.test(spec.rrule)) return 30;
    if (/FREQ=DAILY/.test(spec.rrule)) return 1;
    if (/FREQ=YEARLY/.test(spec.rrule)) return 365;
  }
  return intervalDays(spec.intervalValue, spec.intervalUnit);
}

/**
 * How "fresh" a chore is: 1 right after it was done, sliding to 0 on the due
 * date (like a dirt meter). Measured from the last completion (so snoozing
 * stretches the bar), or from one cycle before the due date without history.
 */
export function freshness(spec: ScheduleSpec, nextDue: CalendarDate, lastDoneDate: CalendarDate | null, today: CalendarDate): number {
  const start = lastDoneDate && lastDoneDate < nextDue ? lastDoneDate : addDays(nextDue, -approxCycleDays(spec));
  const total = diffDays(start, nextDue);
  if (total <= 0) return today >= nextDue ? 0 : 1;
  const left = diffDays(today, nextDue);
  return Math.min(1, Math.max(0, left / total));
}

// ------------------------------------------------------------ vacation

export interface Vacation {
  from: CalendarDate;
  until: CalendarDate;
}

export function onVacation(v: Vacation | null, today: CalendarDate): boolean {
  return v != null && v.from <= today && today <= v.until;
}

/**
 * New due date once a vacation (`from` … `lastDay`, inclusive) is over.
 * - after_completion: the clock stopped during the vacation, so the due date
 *   moves by the number of vacation days that fell after the last completion.
 * - fixed: dates that fell into the vacation are dropped; the chore continues
 *   with the first occurrence after it.
 */
export function dueAfterVacation(
  spec: ScheduleSpec,
  nextDue: CalendarDate,
  lastDoneDate: CalendarDate | null,
  from: CalendarDate,
  lastDay: CalendarDate,
): CalendarDate {
  if (lastDay < from) return nextDue;
  if (spec.scheduleType === "fixed") {
    return nextDue <= lastDay ? nextFixedOccurrence(spec, lastDay) : nextDue;
  }
  const start = lastDoneDate ? maxDate(from, addDays(lastDoneDate, 1)) : from;
  const days = diffDays(start, lastDay) + 1;
  return days > 0 ? addDays(nextDue, days) : nextDue;
}
