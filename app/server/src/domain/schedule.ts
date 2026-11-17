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
