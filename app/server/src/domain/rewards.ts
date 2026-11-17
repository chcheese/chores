import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { chores, type ClaimStatus, completions, type Reward, rewardClaims, rewards, settings, users } from "../db/schema.js";
import { addDays, type CalendarDate, diffDays, localDate } from "./dates.js";
import { ConflictError, NotFoundError, ValidationError } from "./service.js";

// ---------------------------------------------------------------- levels

/** Lifetime points needed for level n: 0, 50, 150, 300, 500, 750 … (50 · n(n−1)/2). */
export const levelThreshold = (level: number): number => (50 * level * (level - 1)) / 2;

export function levelFor(points: number): { level: number; levelFloor: number; levelNext: number } {
  let level = 1;
  while (levelThreshold(level + 1) <= points) level++;
  return { level, levelFloor: levelThreshold(level), levelNext: levelThreshold(level + 1) };
}

// --------------------------------------------------------------- streaks

/** Current and best run of consecutive days with at least one completed chore. */
export function streaks(days: CalendarDate[], today: CalendarDate): { current: number; best: number } {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: CalendarDate | null = null;
  for (const d of sorted) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  // The current streak is still alive if the last day was today or yesterday.
  const current = prev && diffDays(prev, today) <= 1 ? run : 0;
  return { current, best };
}

// ---------------------------------------------------------------- badges

export interface BadgeDef {
  key: string;
  title: string;
  icon: string;
  description: string;
}

export interface Badge extends BadgeDef {
  earnedAt: string | null;
}

export const BADGES: BadgeDef[] = [
  { key: "erste", title: "Erste Schritte", icon: "🌱", description: "Die erste Aufgabe erledigt" },
  { key: "zehn", title: "Fleissig", icon: "⭐", description: "10 Aufgaben erledigt" },
  { key: "fuenfzig", title: "Profi", icon: "🌟", description: "50 Aufgaben erledigt" },
  { key: "hundert", title: "Haushalts-Held", icon: "🏆", description: "100 Aufgaben erledigt" },
  { key: "serie3", title: "Dranbleiber", icon: "🔥", description: "3 Tage in Folge etwas erledigt" },
  { key: "serie7", title: "Wochenserie", icon: "⚡", description: "7 Tage in Folge etwas erledigt" },
  { key: "turbo", title: "Turbo", icon: "🚀", description: "5 Aufgaben an einem Tag" },
  { key: "retter", title: "Retter", icon: "🛟", description: "Eine überfällige Aufgabe erledigt" },
  { key: "allrounder", title: "Allrounder", icon: "🧭", description: "Aufgaben in 5 verschiedenen Bereichen erledigt" },
  { key: "punkte500", title: "Punktesammler", icon: "💎", description: "500 Punkte gesammelt" },
];

export interface DoneEntry {
  doneAt: string;
  points: number;
  room: string;
  /** Due date before this completion (from the undo snapshot). */
  dueBefore: string;
  toleranceDays: number;
}

/** Walks a user's completions in order and records when each badge was first earned. */
export function computeBadges(entries: DoneEntry[], tz: string): Badge[] {
  const earned = new Map<string, string>();
  const earn = (key: string, at: string) => earned.has(key) || earned.set(key, at);
  const perDay = new Map<string, number>();
  const rooms = new Set<string>();
  const days: CalendarDate[] = [];
  let count = 0;
  let points = 0;
  for (const e of [...entries].sort((a, b) => a.doneAt.localeCompare(b.doneAt))) {
    const day = localDate(new Date(e.doneAt), tz);
    count++;
    points += e.points;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    if (e.room) rooms.add(e.room);
    days.push(day);
    if (count >= 1) earn("erste", e.doneAt);
    if (count >= 10) earn("zehn", e.doneAt);
    if (count >= 50) earn("fuenfzig", e.doneAt);
    if (count >= 100) earn("hundert", e.doneAt);
    if (points >= 500) earn("punkte500", e.doneAt);
    if ((perDay.get(day) ?? 0) >= 5) earn("turbo", e.doneAt);
    if (rooms.size >= 5) earn("allrounder", e.doneAt);
    if (diffDays(e.dueBefore, day) > e.toleranceDays) earn("retter", e.doneAt);
    const { best } = streaks(days, day);
    if (best >= 3) earn("serie3", e.doneAt);
    if (best >= 7) earn("serie7", e.doneAt);
  }
  return BADGES.map((b) => ({ ...b, earnedAt: earned.get(b.key) ?? null }));
}

// ------------------------------------------------------------- allowance

export interface AllowanceSettings {
  enabled: boolean;
  /** How many points are worth one Swiss franc. */
  pointsPerFranc: number;
}

export const DEFAULT_ALLOWANCE: AllowanceSettings = { enabled: false, pointsPerFranc: 50 };

/** Points → Rappen, rounded down to 5 Rappen (smallest Swiss coin). */
export function rappenFor(points: number, pointsPerFranc: number): number {
  if (points <= 0) return 0;
  return Math.floor((points * 100) / pointsPerFranc / 5) * 5;
}

/** Rappen → points needed (rounded up, so a payout never costs less than it is worth). */
export function pointsFor(rappen: number, pointsPerFranc: number): number {
  return Math.ceil((rappen * pointsPerFranc) / 100);
}

export const formatChf = (rappen: number): string => `CHF ${(rappen / 100).toFixed(2)}`;

// --------------------------------------------------------------- service

export interface Progress {
  userId: number;
  pointsTotal: number;
  /** Points that can still be spent (lifetime minus pending/approved rewards). */
  balance: number;
  /** Children with pocket money enabled: balance worth in Rappen; else null. */
  allowanceRappen: number | null;
  level: number;
  levelFloor: number;
  levelNext: number;
  streak: number;
  bestStreak: number;
  doneCount: number;
  doneThisWeek: number;
  badges: Badge[];
}

export class RewardService {
  constructor(
    private readonly db: Db,
    private readonly clock: { tz: string; now?: () => Date },
  ) {}

  private today(): CalendarDate {
    return localDate(this.clock.now?.() ?? new Date(), this.clock.tz);
  }

  // ---------------------------------------------------------- rewards

  list(includeInactive = false): Reward[] {
    const q = this.db.select().from(rewards);
    return (includeInactive ? q : q.where(eq(rewards.active, true))).orderBy(asc(rewards.cost), asc(rewards.title)).all();
  }

  get(id: number): Reward {
    const r = this.db.select().from(rewards).where(eq(rewards.id, id)).get();
    if (!r) throw new NotFoundError(`Belohnung ${id} nicht gefunden`);
    return r;
  }

  create(input: { title: string; description?: string; icon?: string; cost: number }): Reward {
    return this.db.insert(rewards).values(input).returning().get();
  }

  update(id: number, patch: Partial<{ title: string; description: string; icon: string; cost: number; active: boolean }>): Reward {
    this.get(id);
    return this.db.update(rewards).set(patch).where(eq(rewards.id, id)).returning().get()!;
  }

  delete(id: number): void {
    this.get(id);
    this.db.delete(rewards).where(eq(rewards.id, id)).run();
  }

  // ----------------------------------------------------------- claims

  /** Points reserved by pending or granted rewards. */
  private spent(userId: number): number {
    const row = this.db
      .select({ n: sql<number>`coalesce(sum(${rewardClaims.cost}), 0)` })
      .from(rewardClaims)
      .where(and(eq(rewardClaims.userId, userId), inArray(rewardClaims.status, ["pending", "approved"])))
      .get();
    return Number(row?.n ?? 0);
  }

  balance(userId: number): number {
    const u = this.db.select({ p: users.pointsTotal }).from(users).where(eq(users.id, userId)).get();
    if (!u) throw new NotFoundError(`Benutzer ${userId} nicht gefunden`);
    return u.p - this.spent(userId);
  }

  // -------------------------------------------------------- allowance

  getAllowance(): AllowanceSettings {
    const row = this.db.select().from(settings).where(eq(settings.key, "allowance")).get();
    return { ...DEFAULT_ALLOWANCE, ...((row?.value as Partial<AllowanceSettings> | undefined) ?? {}) };
  }

  setAllowance(patch: Partial<AllowanceSettings>): AllowanceSettings {
    const value = { ...this.getAllowance(), ...patch };
    this.db.insert(settings).values({ key: "allowance", value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
    return value;
  }

  private payoutClaim(userId: number, rappen: number, status: "pending" | "approved", deciderId: number | null, note: string) {
    const a = this.getAllowance();
    if (!a.enabled) throw new ValidationError("Taschengeld ist nicht eingeschaltet");
    const user = this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new NotFoundError(`Benutzer ${userId} nicht gefunden`);
    if (user.role !== "child") throw new ValidationError("Taschengeld gibt es nur für Kinder");
    if (rappen < 5 || rappen % 5 !== 0) throw new ValidationError("Betrag in 5-Rappen-Schritten, mindestens CHF 0.05");
    const cost = pointsFor(rappen, a.pointsPerFranc);
    const balance = this.balance(userId);
    if (cost > balance) throw new ValidationError(`Zu wenig Punkte: ${formatChf(rappen)} braucht ${cost}, vorhanden ${balance}`);
    const now = (this.clock.now?.() ?? new Date()).toISOString();
    return this.db
      .insert(rewardClaims)
      .values({
        rewardId: null,
        kind: "payout",
        title: `Taschengeld ${formatChf(rappen)}`,
        icon: "💰",
        cost,
        amountRappen: rappen,
        note,
        userId,
        status,
        requestedAt: now,
        ...(status === "approved" ? { decidedAt: now, decidedBy: deciderId } : {}),
      })
      .returning()
      .get();
  }

  /** A child asks for pocket money; an adult approves like a reward. */
  requestPayout(userId: number, rappen: number) {
    return this.db.transaction(() => this.payoutClaim(userId, rappen, "pending", null, ""));
  }

  /** An adult records cash handed out (booked as approved right away). */
  payout(userId: number, rappen: number, deciderId: number | null, note = "") {
    return this.db.transaction(() => this.payoutClaim(userId, rappen, "approved", deciderId, note));
  }

  claim(userId: number, rewardId: number) {
    return this.db.transaction(() => {
      const r = this.get(rewardId);
      if (!r.active) throw new ValidationError("Diese Belohnung ist nicht verfügbar");
      const balance = this.balance(userId);
      if (balance < r.cost) throw new ValidationError(`Zu wenig Punkte: ${balance} von ${r.cost}`);
      return this.db
        .insert(rewardClaims)
        .values({ rewardId: r.id, title: r.title, icon: r.icon, cost: r.cost, userId, status: "pending", requestedAt: (this.clock.now?.() ?? new Date()).toISOString() })
        .returning()
        .get();
    });
  }

  claims(filter: { status?: ClaimStatus; userId?: number; kind?: "reward" | "payout"; limit?: number } = {}) {
    const conds = [
      ...(filter.kind ? [eq(rewardClaims.kind, filter.kind)] : []),
      ...(filter.status ? [eq(rewardClaims.status, filter.status)] : []),
      ...(filter.userId != null ? [eq(rewardClaims.userId, filter.userId)] : []),
    ];
    return this.db
      .select()
      .from(rewardClaims)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(rewardClaims.requestedAt), desc(rewardClaims.id))
      .limit(filter.limit ?? 100)
      .all();
  }

  getClaim(id: number) {
    const c = this.db.select().from(rewardClaims).where(eq(rewardClaims.id, id)).get();
    if (!c) throw new NotFoundError(`Antrag ${id} nicht gefunden`);
    return c;
  }

  decide(id: number, approve: boolean, deciderId: number | null) {
    const c = this.getClaim(id);
    if (c.status !== "pending") throw new ConflictError("Dieser Antrag ist bereits entschieden");
    return this.db
      .update(rewardClaims)
      .set({ status: approve ? "approved" : "rejected", decidedAt: (this.clock.now?.() ?? new Date()).toISOString(), decidedBy: deciderId })
      .where(eq(rewardClaims.id, id))
      .returning()
      .get()!;
  }

  /** Withdraws a pending claim (points are freed again). */
  withdraw(id: number): void {
    const c = this.getClaim(id);
    if (c.status !== "pending") throw new ConflictError("Nur offene Anträge können zurückgezogen werden");
    this.db.delete(rewardClaims).where(eq(rewardClaims.id, id)).run();
  }

  // --------------------------------------------------------- progress

  progress(): Progress[] {
    const today = this.today();
    const weekStart = addDays(today, -6);
    const allowance = this.getAllowance();
    const all = this.db
      .select({
        userId: completions.userId,
        doneAt: completions.doneAt,
        points: completions.points,
        room: chores.room,
        prevState: completions.prevState,
        toleranceDays: chores.toleranceDays,
      })
      .from(completions)
      .innerJoin(chores, eq(chores.id, completions.choreId))
      .where(eq(completions.kind, "done"))
      .all();
    return this.db
      .select()
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.name))
      .all()
      .map((u) => {
        const mine = all.filter((c) => c.userId === u.id);
        const days = mine.map((c) => localDate(new Date(c.doneAt), this.clock.tz));
        const { current, best } = streaks(days, today);
        const balance = u.pointsTotal - this.spent(u.id);
        return {
          userId: u.id,
          pointsTotal: u.pointsTotal,
          balance,
          allowanceRappen: allowance.enabled && u.role === "child" ? rappenFor(balance, allowance.pointsPerFranc) : null,
          ...levelFor(u.pointsTotal),
          streak: current,
          bestStreak: best,
          doneCount: mine.length,
          doneThisWeek: days.filter((d) => d >= weekStart).length,
          badges: computeBadges(
            mine.map((c) => ({ doneAt: c.doneAt, points: c.points, room: c.room, dueBefore: c.prevState.nextDue, toleranceDays: c.toleranceDays })),
            this.clock.tz,
          ),
        };
      });
  }
}
