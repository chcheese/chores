import { describe, expect, it } from "vitest";
import { addDays, addMonths, isCalendarDate, localDate } from "../src/domain/dates.js";
import {
  computeStatus,
  currentAssignee,
  initialNextDue,
  nextDueAfter,
  nextDueAfterSkip,
  nextFixedOccurrence,
  nextRotationIndex,
  type ScheduleSpec,
  snoozedDue,
  validateRrule,
} from "../src/domain/schedule.js";

const TZ = "Europe/Zurich";

const after = (value: number, unit: ScheduleSpec["intervalUnit"]): ScheduleSpec => ({
  scheduleType: "after_completion",
  intervalValue: value,
  intervalUnit: unit,
  rrule: null,
  anchorDate: null,
});

const fixed = (value: number, unit: ScheduleSpec["intervalUnit"], anchorDate: string, rrule: string | null = null): ScheduleSpec => ({
  scheduleType: "fixed",
  intervalValue: value,
  intervalUnit: unit,
  rrule,
  anchorDate,
});

describe("calendar dates", () => {
  it("validates dates strictly", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-2-1")).toBe(false);
  });

  it("clamps month arithmetic to the month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("adds days across DST changes without drifting", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29"); // spring forward
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25"); // fall back
    expect(addDays("2026-10-24", 14)).toBe("2026-11-07");
  });

  it("maps instants to the Zurich calendar day", () => {
    // 23:30 UTC in winter = 00:30 next day in Zurich (UTC+1)
    expect(localDate(new Date("2026-01-14T23:30:00Z"), TZ)).toBe("2026-01-15");
    // 22:30 UTC in summer = 00:30 next day in Zurich (UTC+2)
    expect(localDate(new Date("2026-07-14T22:30:00Z"), TZ)).toBe("2026-07-15");
    // 21:59 UTC in summer = 23:59 same day
    expect(localDate(new Date("2026-07-14T21:59:00Z"), TZ)).toBe("2026-07-14");
    // DST switch night 2026-03-29: 00:30 UTC = 01:30 CET, 01:30 UTC = 03:30 CEST
    expect(localDate(new Date("2026-03-29T00:30:00Z"), TZ)).toBe("2026-03-29");
    expect(localDate(new Date("2026-03-28T23:00:00Z"), TZ)).toBe("2026-03-29");
    expect(localDate(new Date("2026-03-28T22:59:00Z"), TZ)).toBe("2026-03-28");
    // Fall back 2026-10-25: 22:00 UTC on the 24th = 00:00 CEST on the 25th
    expect(localDate(new Date("2026-10-24T22:00:00Z"), TZ)).toBe("2026-10-25");
    expect(localDate(new Date("2026-10-24T21:59:00Z"), TZ)).toBe("2026-10-24");
  });
});

describe("after_completion", () => {
  it("counts the interval from the completion day", () => {
    expect(nextDueAfter(after(14, "day"), "2026-11-10", "2026-11-17")).toBe("2026-12-01");
    expect(nextDueAfter(after(14, "day"), "2026-11-20", "2026-11-17")).toBe("2026-12-01"); // early
    expect(nextDueAfter(after(6, "week"), "2026-11-17", "2026-11-17")).toBe("2026-12-29");
  });

  it("handles month intervals at month ends", () => {
    expect(nextDueAfter(after(1, "month"), "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextDueAfter(after(3, "month"), "2026-11-30", "2026-11-30")).toBe("2027-02-28");
    expect(nextDueAfter(after(1, "month"), "2028-01-30", "2028-01-30")).toBe("2028-02-29");
  });

  it("spans DST and year boundaries", () => {
    expect(nextDueAfter(after(7, "day"), "2026-03-25", "2026-03-25")).toBe("2026-04-01");
    expect(nextDueAfter(after(14, "day"), "2026-12-25", "2026-12-25")).toBe("2027-01-08");
  });

  it("skips from the later of today and the due date", () => {
    expect(nextDueAfterSkip(after(7, "day"), "2026-11-10", "2026-11-17")).toBe("2026-11-24"); // overdue
    expect(nextDueAfterSkip(after(7, "day"), "2026-11-20", "2026-11-17")).toBe("2026-11-27"); // not yet due
  });

  it("starts today, or from a known last-done date", () => {
    expect(initialNextDue(after(14, "day"), "2026-11-17")).toBe("2026-11-17");
    expect(initialNextDue(after(14, "day"), "2026-11-17", "2026-11-10")).toBe("2026-11-24");
  });
});

describe("fixed", () => {
  it("follows a day/week rhythm from the anchor", () => {
    const weekly = fixed(1, "week", "2026-11-07"); // a Saturday
    expect(nextFixedOccurrence(weekly, "2026-11-07")).toBe("2026-11-14");
    expect(nextFixedOccurrence(weekly, "2026-11-10")).toBe("2026-11-14");
    expect(nextFixedOccurrence(weekly, "2026-11-01")).toBe("2026-11-07");
    expect(nextFixedOccurrence(fixed(10, "day", "2026-01-01"), "2026-01-21")).toBe("2026-01-31");
  });

  it("does not drift at month ends (computed from the anchor each time)", () => {
    const monthly = fixed(1, "month", "2026-01-31");
    expect(nextFixedOccurrence(monthly, "2026-01-31")).toBe("2026-02-28");
    expect(nextFixedOccurrence(monthly, "2026-02-28")).toBe("2026-03-31");
    expect(nextFixedOccurrence(monthly, "2026-04-15")).toBe("2026-04-30");
    expect(nextFixedOccurrence(monthly, "2027-12-31")).toBe("2028-01-31");
  });

  it("handles multi-month rhythms (Rauchmelder every 6 months)", () => {
    const sixMonths = fixed(6, "month", "2026-03-31");
    expect(nextFixedOccurrence(sixMonths, "2026-03-31")).toBe("2026-09-30");
    expect(nextFixedOccurrence(sixMonths, "2026-09-30")).toBe("2027-03-31");
    expect(nextFixedOccurrence(sixMonths, "2030-01-01")).toBe("2030-03-31");
  });

  it("supports RRULE patterns", () => {
    const saturdays = fixed(1, "week", "2026-11-01", "FREQ=WEEKLY;BYDAY=SA");
    expect(nextFixedOccurrence(saturdays, "2026-11-17")).toBe("2026-11-21");
    expect(nextFixedOccurrence(saturdays, "2026-11-21")).toBe("2026-11-28");
    const firstOfMonth = fixed(1, "month", "2026-01-01", "FREQ=MONTHLY;BYMONTHDAY=1");
    expect(nextFixedOccurrence(firstOfMonth, "2026-11-17")).toBe("2026-12-01");
    expect(nextFixedOccurrence(firstOfMonth, "2026-12-31")).toBe("2027-01-01");
    const lastOfMonth = fixed(1, "month", "2026-01-01", "FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(nextFixedOccurrence(lastOfMonth, "2026-02-01")).toBe("2026-02-28");
    expect(nextFixedOccurrence(lastOfMonth, "2028-02-01")).toBe("2028-02-29");
    // RRULE across the DST switch stays on the calendar day
    const saturdaysAllYear = fixed(1, "week", "2026-01-01", "FREQ=WEEKLY;BYDAY=SA");
    expect(nextFixedOccurrence(saturdaysAllYear, "2026-03-27")).toBe("2026-03-28");
    expect(nextFixedOccurrence(saturdaysAllYear, "2026-03-28")).toBe("2026-04-04");
    expect(nextFixedOccurrence(saturdaysAllYear, "2026-10-24")).toBe("2026-10-31");
  });

  it("completing early moves to the occurrence after the current due date", () => {
    const saturdays = fixed(1, "week", "2026-11-01", "FREQ=WEEKLY;BYDAY=SA");
    // due Sat 21st, done Thu 19th → next is Sat 28th
    expect(nextDueAfter(saturdays, "2026-11-21", "2026-11-19")).toBe("2026-11-28");
    // due Sat 14th, done late on Tue 17th → next is Sat 21st
    expect(nextDueAfter(saturdays, "2026-11-14", "2026-11-17")).toBe("2026-11-21");
  });

  it("starts at the anchor or the first occurrence from today", () => {
    expect(initialNextDue(fixed(3, "month", "2026-12-01"), "2026-11-17")).toBe("2026-12-01");
    expect(initialNextDue(fixed(3, "month", "2026-08-17"), "2026-11-17")).toBe("2026-11-17");
    expect(initialNextDue(fixed(3, "month", "2026-08-16"), "2026-11-17")).toBe("2027-02-16");
  });

  it("validates RRULEs", () => {
    expect(validateRrule("FREQ=WEEKLY;BYDAY=SA")).toBeNull();
    expect(validateRrule("FREQ=WEEKLY;COUNT=3")).not.toBeNull();
    expect(validateRrule("NONSENSE")).not.toBeNull();
  });
});

describe("status", () => {
  const base = { toleranceDays: 2, counterTarget: null, counterValue: 0 };
  it("ok → due → overdue after the tolerance", () => {
    expect(computeStatus({ ...base, nextDue: "2026-11-18" }, "2026-11-17")).toMatchObject({ status: "ok", daysUntilDue: 1 });
    expect(computeStatus({ ...base, nextDue: "2026-11-17" }, "2026-11-17").status).toBe("due");
    expect(computeStatus({ ...base, nextDue: "2026-11-15" }, "2026-11-17").status).toBe("due");
    expect(computeStatus({ ...base, nextDue: "2026-11-14" }, "2026-11-17")).toMatchObject({ status: "overdue", daysUntilDue: -3 });
  });

  it("a reached counter makes a chore due early", () => {
    const r = computeStatus({ nextDue: "2026-12-30", toleranceDays: 2, counterTarget: 30, counterValue: 30 }, "2026-11-17");
    expect(r).toMatchObject({ status: "due", counterReached: true });
    expect(computeStatus({ nextDue: "2026-12-30", toleranceDays: 2, counterTarget: 30, counterValue: 29 }, "2026-11-17").status).toBe("ok");
  });

  it("snoozes from the later of today and the due date", () => {
    expect(snoozedDue("2026-11-10", "2026-11-17", 2)).toBe("2026-11-19");
    expect(snoozedDue("2026-11-20", "2026-11-17", 2)).toBe("2026-11-22");
  });
});

describe("assignment", () => {
  it("rotates through the user list", () => {
    const a = { assignmentMode: "rotation" as const, assignedUserId: null, rotationUserIds: [3, 5, 8], rotationIndex: 2 };
    expect(currentAssignee(a)).toBe(8);
    expect(nextRotationIndex(a)).toBe(0);
    expect(currentAssignee({ ...a, rotationIndex: 0 })).toBe(3);
  });

  it("returns the fixed user or nobody", () => {
    expect(currentAssignee({ assignmentMode: "user", assignedUserId: 4, rotationUserIds: [], rotationIndex: 0 })).toBe(4);
    expect(currentAssignee({ assignmentMode: "anyone", assignedUserId: 4, rotationUserIds: [], rotationIndex: 0 })).toBeNull();
  });
});
