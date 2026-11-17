import type { Chore, IntervalUnit } from "./api";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

/** "YYYY-MM-DD" → "Sa, 21. Nov." */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${d}. ${MONTHS[m - 1]}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function dueText(c: Pick<Chore, "status" | "daysUntilDue" | "counterReached" | "nextDue">): string {
  const d = c.daysUntilDue;
  if (c.counterReached && d > 0) return "Zähler erreicht";
  if (d === 0) return "heute fällig";
  if (d === -1) return "seit gestern fällig";
  if (d < 0) return `seit ${-d} Tagen fällig`;
  if (d === 1) return "morgen";
  if (d < 7) return `in ${d} Tagen`;
  return formatDate(c.nextDue);
}

const UNIT_LABEL: Record<IntervalUnit, [string, string]> = {
  day: ["Tag", "Tage"],
  week: ["Woche", "Wochen"],
  month: ["Monat", "Monate"],
};

export function unitLabel(unit: IntervalUnit, n: number): string {
  return UNIT_LABEL[unit][n === 1 ? 0 : 1];
}

const RRULE_DAYS: Record<string, string> = { MO: "Montag", TU: "Dienstag", WE: "Mittwoch", TH: "Donnerstag", FR: "Freitag", SA: "Samstag", SU: "Sonntag" };

export function scheduleText(c: Pick<Chore, "scheduleType" | "intervalValue" | "intervalUnit" | "rrule">): string {
  if (c.scheduleType === "fixed" && c.rrule) {
    const weekly = /FREQ=WEEKLY;BYDAY=([A-Z,]+)$/.exec(c.rrule);
    if (weekly?.[1]) {
      const names = weekly[1].split(",").map((d) => RRULE_DAYS[d] ?? d);
      return `jeden ${names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names.at(-1)}` : names[0]}`;
    }
    const monthDay = /FREQ=MONTHLY;BYMONTHDAY=(-?\d+)$/.exec(c.rrule);
    if (monthDay?.[1]) return monthDay[1] === "-1" ? "am Monatsletzten" : `jeden ${monthDay[1]}. im Monat`;
    return "eigene Regel";
  }
  const every = c.intervalValue === 1 ? `jede${c.intervalUnit === "week" ? "" : "n"} ${unitLabel(c.intervalUnit, 1)}` : `alle ${c.intervalValue} ${unitLabel(c.intervalUnit, c.intervalValue)}`;
  return c.scheduleType === "after_completion" ? `${every} nach Erledigung` : `fest, ${every}`;
}

/** Today in Europe/Zurich as YYYY-MM-DD. */
export function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
}

const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const MONTH_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

/** [4,5,6,7,8,9,10] → "April–Oktober"; [3,4,10,11] → "März–April, Okt.–Nov."; [11] → "November". */
export function seasonText(months: number[]): string {
  if (months.length === 0) return "ganzjährig";
  const sorted = [...months].sort((a, b) => a - b);
  // Group consecutive months, joining Dec→Jan across the year boundary.
  const runs: number[][] = [];
  for (const m of sorted) {
    const last = runs.at(-1);
    if (last && last.at(-1) === m - 1) last.push(m);
    else runs.push([m]);
  }
  if (runs.length > 1 && runs[0]![0] === 1 && runs.at(-1)!.at(-1) === 12) runs[0] = [...runs.pop()!, ...runs[0]!];
  if (runs.length === 1) {
    const r = runs[0]!;
    return r.length === 1 ? MONTH_NAMES[r[0]! - 1]! : `${MONTH_NAMES[r[0]! - 1]}–${MONTH_NAMES[r.at(-1)! - 1]}`;
  }
  return runs.map((r) => (r.length === 1 ? MONTH_SHORT[r[0]! - 1] : `${MONTH_SHORT[r[0]! - 1]}–${MONTH_SHORT[r.at(-1)! - 1]}`)).join(", ");
}

/** "Saison ab April" for a resting chore, from its next due date. */
export function seasonStartText(nextDue: string): string {
  return `Saison ab ${MONTH_NAMES[Number(nextDue.slice(5, 7)) - 1]}`;
}

/** 10 → "10 Min.", 90 → "1 Std. 30 Min.", 120 → "2 Std." */
export function durationText(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Condition bar colour: green while fresh, amber when getting close, red when due. */
export function freshnessColor(f: number): string {
  return f > 0.5 ? "var(--ok)" : f > 0.2 ? "var(--due)" : "var(--over)";
}

/** 250 → "CHF 2.50" */
export const formatChf = (rappen: number): string => `CHF ${(rappen / 100).toFixed(2)}`;

/** Points needed for an amount (rounded up, same as the server). */
export const pointsForRappen = (rappen: number, pointsPerFranc: number): number => Math.ceil((rappen * pointsPerFranc) / 100);
