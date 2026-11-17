import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  type Chore,
  type ChoreStateSnapshot,
  chores,
  type Completion,
  completions,
  type NewChore,
  type User,
  users,
} from "../db/schema.js";
import { addDays, type CalendarDate, localDate } from "./dates.js";
import {
  type ChoreStatus,
  computeStatus,
  currentAssignee,
  initialNextDue,
  intervalDays,
  nextDueAfter,
  nextDueAfterSkip,
  nextRotationIndex,
  snoozedDue,
} from "./schedule.js";
import { TEMPLATES } from "./templates.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}

export interface UserSummary {
  id: number;
  name: string;
  avatar: string;
  color: string;
}

export interface ChoreView extends Chore {
  status: ChoreStatus;
  daysUntilDue: number;
  counterReached: boolean;
  assignee: UserSummary | null;
}

export interface ClockOpts {
  tz: string;
  now?: () => Date;
}

const summary = (u: User | undefined | null): UserSummary | null =>
  u ? { id: u.id, name: u.name, avatar: u.avatar, color: u.color } : null;

const snapshot = (c: Chore): ChoreStateSnapshot => ({
  nextDue: c.nextDue,
  lastDone: c.lastDone,
  rotationIndex: c.rotationIndex,
  counterValue: c.counterValue,
});

const STATUS_ORDER: Record<ChoreStatus, number> = { overdue: 0, due: 1, ok: 2 };

export class ChoreService {
  constructor(
    private readonly db: Db,
    private readonly clock: ClockOpts,
  ) {}

  now(): Date {
    return this.clock.now?.() ?? new Date();
  }

  today(): CalendarDate {
    return localDate(this.now(), this.clock.tz);
  }

  // ---------------------------------------------------------------- reads

  private userMap(): Map<number, User> {
    return new Map(this.db.select().from(users).all().map((u) => [u.id, u]));
  }

  view(c: Chore, userMap = this.userMap(), today = this.today()): ChoreView {
    const s = computeStatus(c, today);
    const assigneeId = currentAssignee(c);
    return { ...c, ...s, assignee: assigneeId != null ? summary(userMap.get(assigneeId)) : null };
  }

  list(opts: { includeInactive?: boolean } = {}): ChoreView[] {
    const rows = opts.includeInactive
      ? this.db.select().from(chores).orderBy(asc(chores.nextDue), asc(chores.title)).all()
      : this.db.select().from(chores).where(eq(chores.active, true)).orderBy(asc(chores.nextDue), asc(chores.title)).all();
    const map = this.userMap();
    const today = this.today();
    return rows
      .map((c) => this.view(c, map, today))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.nextDue.localeCompare(b.nextDue));
  }

  listDue(): ChoreView[] {
    return this.list().filter((c) => c.status !== "ok");
  }

  get(id: number): Chore {
    const c = this.db.select().from(chores).where(eq(chores.id, id)).get();
    if (!c) throw new NotFoundError(`Aufgabe ${id} nicht gefunden`);
    return c;
  }

  getView(id: number): ChoreView {
    return this.view(this.get(id));
  }

  // --------------------------------------------------------------- writes

  private validateAssignment(input: Partial<NewChore>): void {
    const ids = [
      ...(input.assignedUserId != null ? [input.assignedUserId] : []),
      ...((input.rotationUserIds as number[] | undefined) ?? []),
    ];
    if (ids.length === 0) return;
    const found = this.db.select({ id: users.id }).from(users).where(inArray(users.id, ids)).all();
    const known = new Set(found.map((u) => u.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) throw new ValidationError(`Unbekannte Benutzer: ${missing.join(", ")}`);
    if (input.assignmentMode === "user" && input.assignedUserId == null) {
      throw new ValidationError("Zuweisung 'user' braucht assignedUserId");
    }
    if (input.assignmentMode === "rotation" && ((input.rotationUserIds as number[] | undefined)?.length ?? 0) === 0) {
      throw new ValidationError("Rotation braucht mindestens einen Benutzer");
    }
  }

  create(input: Omit<NewChore, "nextDue"> & { nextDue?: string; lastDoneDate?: string | null }): ChoreView {
    const today = this.today();
    const { lastDoneDate, ...rest } = input;
    const spec = {
      scheduleType: rest.scheduleType,
      intervalValue: rest.intervalValue ?? 7,
      intervalUnit: rest.intervalUnit ?? "day",
      rrule: rest.rrule ?? null,
      anchorDate: rest.scheduleType === "fixed" ? (rest.anchorDate ?? today) : null,
    };
    this.validateAssignment(rest);
    const nextDue = rest.nextDue ?? initialNextDue(spec, today, lastDoneDate);
    const row = this.db
      .insert(chores)
      .values({ ...rest, anchorDate: spec.anchorDate, nextDue })
      .returning()
      .get();
    return this.view(row);
  }

  update(id: number, patch: Partial<NewChore>): ChoreView {
    const existing = this.get(id);
    const merged = { ...existing, ...patch };
    this.validateAssignment(merged);
    const scheduleChanged = (["scheduleType", "intervalValue", "intervalUnit", "rrule", "anchorDate"] as const).some(
      (k) => k in patch && patch[k] !== existing[k],
    );
    let nextDue = patch.nextDue ?? existing.nextDue;
    if (scheduleChanged && patch.nextDue === undefined) {
      const today = this.today();
      if (merged.scheduleType === "fixed" && !merged.anchorDate) merged.anchorDate = today;
      if (merged.scheduleType === "after_completion") merged.anchorDate = null;
      nextDue = initialNextDue(merged, today, merged.lastDone ? localDate(new Date(merged.lastDone), this.clock.tz) : null);
    }
    if (merged.assignmentMode !== "rotation") merged.rotationIndex = 0;
    const row = this.db
      .update(chores)
      .set({
        ...patch,
        anchorDate: merged.anchorDate,
        rotationIndex: merged.rotationIndex,
        nextDue,
        updatedAt: this.now().toISOString(),
      })
      .where(eq(chores.id, id))
      .returning()
      .get();
    return this.view(row!);
  }

  delete(id: number): void {
    this.get(id);
    this.db.delete(chores).where(eq(chores.id, id)).run();
  }

  /**
   * Marks a chore done. Attribution: explicit user → else current assignee → else nobody.
   * Points go to the attributed user.
   */
  complete(id: number, opts: { userId?: number | null; note?: string; at?: Date } = {}): { chore: ChoreView; completion: Completion } {
    return this.db.transaction((tx) => {
      const c = this.get(id);
      const at = opts.at ?? this.now();
      const doneDate = localDate(at, this.clock.tz);
      const userId = opts.userId ?? currentAssignee(c);
      if (userId != null && !tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) {
        throw new ValidationError(`Unbekannter Benutzer ${userId}`);
      }
      const completion = tx
        .insert(completions)
        .values({
          choreId: c.id,
          userId,
          kind: "done",
          doneAt: at.toISOString(),
          points: c.points,
          note: opts.note ?? "",
          prevState: snapshot(c),
        })
        .returning()
        .get();
      const updated = tx
        .update(chores)
        .set({
          lastDone: at.toISOString(),
          nextDue: nextDueAfter(c, c.nextDue, doneDate),
          rotationIndex: nextRotationIndex(c),
          counterValue: 0,
          updatedAt: this.now().toISOString(),
        })
        .where(eq(chores.id, c.id))
        .returning()
        .get();
      if (userId != null && c.points) {
        tx.update(users).set({ pointsTotal: sql`${users.pointsTotal} + ${c.points}` }).where(eq(users.id, userId)).run();
      }
      return { chore: this.view(updated!), completion };
    });
  }

  /** Skips the current cycle: no points; the turn stays with the same person. */
  skip(id: number, opts: { userId?: number | null; note?: string } = {}): { chore: ChoreView; completion: Completion } {
    return this.db.transaction((tx) => {
      const c = this.get(id);
      const at = this.now();
      const completion = tx
        .insert(completions)
        .values({ choreId: c.id, userId: opts.userId ?? null, kind: "skip", doneAt: at.toISOString(), points: 0, note: opts.note ?? "", prevState: snapshot(c) })
        .returning()
        .get();
      const updated = tx
        .update(chores)
        .set({ nextDue: nextDueAfterSkip(c, c.nextDue, this.today()), counterValue: 0, updatedAt: at.toISOString() })
        .where(eq(chores.id, c.id))
        .returning()
        .get();
      return { chore: this.view(updated!), completion };
    });
  }

  snooze(id: number, days: number): ChoreView {
    const c = this.get(id);
    const row = this.db
      .update(chores)
      .set({ nextDue: snoozedDue(c.nextDue, this.today(), days), updatedAt: this.now().toISOString() })
      .where(eq(chores.id, id))
      .returning()
      .get();
    return this.view(row!);
  }

  incrementCounter(id: number, by = 1): ChoreView {
    const c = this.get(id);
    if (c.counterTarget == null) throw new ValidationError("Diese Aufgabe hat keinen Zähler");
    const row = this.db
      .update(chores)
      .set({ counterValue: Math.max(0, c.counterValue + by), updatedAt: this.now().toISOString() })
      .where(eq(chores.id, id))
      .returning()
      .get();
    return this.view(row!);
  }

  /** Undoes a completion/skip. Only the most recent entry of a chore can be undone. */
  undoCompletion(completionId: number): ChoreView {
    return this.db.transaction((tx) => {
      const comp = tx.select().from(completions).where(eq(completions.id, completionId)).get();
      if (!comp) throw new NotFoundError(`Eintrag ${completionId} nicht gefunden`);
      const latest = tx
        .select({ id: completions.id })
        .from(completions)
        .where(eq(completions.choreId, comp.choreId))
        .orderBy(desc(completions.doneAt), desc(completions.id))
        .limit(1)
        .get();
      if (latest?.id !== comp.id) throw new ConflictError("Nur der letzte Eintrag einer Aufgabe kann rückgängig gemacht werden");
      const prev = comp.prevState;
      const updated = tx
        .update(chores)
        .set({ ...prev, updatedAt: this.now().toISOString() })
        .where(eq(chores.id, comp.choreId))
        .returning()
        .get();
      if (comp.userId != null && comp.points) {
        tx.update(users).set({ pointsTotal: sql`max(0, ${users.pointsTotal} - ${comp.points})` }).where(eq(users.id, comp.userId)).run();
      }
      tx.delete(completions).where(eq(completions.id, comp.id)).run();
      return this.view(updated!);
    });
  }

  completionsList(filter: { choreId?: number; userId?: number; limit?: number; offset?: number } = {}) {
    const conds = [
      ...(filter.choreId != null ? [eq(completions.choreId, filter.choreId)] : []),
      ...(filter.userId != null ? [eq(completions.userId, filter.userId)] : []),
    ];
    return this.db
      .select({
        id: completions.id,
        choreId: completions.choreId,
        choreTitle: chores.title,
        choreIcon: chores.icon,
        userId: completions.userId,
        kind: completions.kind,
        doneAt: completions.doneAt,
        points: completions.points,
        note: completions.note,
      })
      .from(completions)
      .innerJoin(chores, eq(chores.id, completions.choreId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(completions.doneAt), desc(completions.id))
      .limit(filter.limit ?? 50)
      .offset(filter.offset ?? 0)
      .all();
  }

  /**
   * Creates chores from catalogue templates. Due dates are staggered over the
   * first two weeks so a fresh install doesn't show everything as due at once.
   */
  importTemplates(keys: string[] | "all"): ChoreView[] {
    const chosen = keys === "all" ? TEMPLATES : TEMPLATES.filter((t) => keys.includes(t.key));
    const today = this.today();
    const sorted = [...chosen].sort((a, b) => intervalDays(a.intervalValue, a.intervalUnit) - intervalDays(b.intervalValue, b.intervalUnit));
    return this.db.transaction(() =>
      sorted.map((t, i) => {
        const offset = Math.min(Math.round((i * 14) / Math.max(1, sorted.length)), intervalDays(t.intervalValue, t.intervalUnit) - 1);
        const start = addDays(today, offset);
        const { key: _key, ...fields } = t;
        return this.create({
          ...fields,
          ...(t.scheduleType === "fixed" ? { anchorDate: start } : {}),
          nextDue: start,
        });
      }),
    );
  }
}
