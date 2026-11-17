import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ROLES = ["admin", "adult", "child"] as const;
export type Role = (typeof ROLES)[number];

export const SCHEDULE_TYPES = ["after_completion", "fixed"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const INTERVAL_UNITS = ["day", "week", "month"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export const ASSIGNMENT_MODES = ["anyone", "user", "rotation"] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export const COMPLETION_KINDS = ["done", "skip"] as const;
export type CompletionKind = (typeof COMPLETION_KINDS)[number];

export const CLAIM_STATUSES = ["pending", "approved", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  role: text("role", { enum: ROLES }).notNull().default("adult"),
  avatar: text("avatar").notNull().default("🙂"),
  color: text("color").notNull().default("#5b8def"),
  /** scrypt hash "salt:hash" (hex); null = no PIN set (login not possible). */
  pinHash: text("pin_hash"),
  pointsTotal: integer("points_total").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const chores = sqliteTable(
  "chores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    room: text("room").notNull().default(""),
    icon: text("icon").notNull().default("🧹"),
    points: integer("points").notNull().default(10),
    active: integer("active", { mode: "boolean" }).notNull().default(true),

    scheduleType: text("schedule_type", { enum: SCHEDULE_TYPES }).notNull(),
    intervalValue: integer("interval_value").notNull().default(7),
    intervalUnit: text("interval_unit", { enum: INTERVAL_UNITS }).notNull().default("day"),
    /** Optional RRULE body (fixed only), e.g. "FREQ=WEEKLY;BYDAY=SA". Overrides interval. */
    rrule: text("rrule"),
    /** Calendar date (YYYY-MM-DD) the fixed rhythm is anchored to. */
    anchorDate: text("anchor_date"),
    /** Days after next_due during which the chore is "due" before it turns "overdue". */
    toleranceDays: integer("tolerance_days").notNull().default(2),

    /** Calendar date (YYYY-MM-DD, Europe/Zurich) the chore is next due. */
    nextDue: text("next_due").notNull(),
    /** ISO timestamp of the last "done" completion. */
    lastDone: text("last_done"),

    assignmentMode: text("assignment_mode", { enum: ASSIGNMENT_MODES }).notNull().default("anyone"),
    assignedUserId: integer("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    /** JSON array of user ids for rotation. */
    rotationUserIds: text("rotation_user_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
    rotationIndex: integer("rotation_index").notNull().default(0),

    /** Optional usage trigger: chore becomes due once counterValue >= counterTarget. */
    counterTarget: integer("counter_target"),
    counterValue: integer("counter_value").notNull().default(0),
    counterLabel: text("counter_label").notNull().default(""),

    /** Estimated effort in minutes (null = unknown). */
    durationMinutes: integer("duration_minutes"),
    /** Months (1–12) the chore is in season; empty = all year. */
    activeMonths: text("active_months", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),

    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("chores_next_due_idx").on(t.nextDue)],
);

/** Snapshot of the chore fields a completion changes, so it can be undone. */
export interface ChoreStateSnapshot {
  nextDue: string;
  lastDone: string | null;
  rotationIndex: number;
  counterValue: number;
}

export const completions = sqliteTable(
  "completions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    choreId: integer("chore_id")
      .notNull()
      .references(() => chores.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: COMPLETION_KINDS }).notNull().default("done"),
    doneAt: text("done_at").notNull(),
    points: integer("points").notNull().default(0),
    note: text("note").notNull().default(""),
    prevState: text("prev_state", { mode: "json" }).$type<ChoreStateSnapshot>().notNull(),
  },
  (t) => [index("completions_chore_idx").on(t.choreId, t.doneAt), index("completions_user_idx").on(t.userId)],
);

export const apiTokens = sqliteTable("api_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** sha256 hex of the token; the token itself is only shown once. */
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: createdAt(),
  lastUsedAt: text("last_used_at"),
});

export const sessions = sqliteTable("sessions", {
  /** sha256 hex of the session cookie value. */
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: text("expires_at").notNull(),
});

/** Small key/value store for app-wide settings (e.g. vacation mode). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const rewards = sqliteTable("rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("🎁"),
  cost: integer("cost").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const rewardClaims = sqliteTable(
  "reward_claims",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rewardId: integer("reward_id").references(() => rewards.id, { onDelete: "set null" }),
    /** Copied from the reward so history survives edits/deletes. */
    title: text("title").notNull(),
    icon: text("icon").notNull(),
    cost: integer("cost").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: CLAIM_STATUSES }).notNull().default("pending"),
    requestedAt: text("requested_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    decidedAt: text("decided_at"),
    decidedBy: integer("decided_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("reward_claims_user_idx").on(t.userId), index("reward_claims_status_idx").on(t.status)],
);

export type User = typeof users.$inferSelect;
export type Chore = typeof chores.$inferSelect;
export type NewChore = typeof chores.$inferInsert;
export type Completion = typeof completions.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type RewardClaim = typeof rewardClaims.$inferSelect;
