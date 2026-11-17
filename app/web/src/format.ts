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
