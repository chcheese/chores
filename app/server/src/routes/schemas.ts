import { z } from "zod";
import { isCalendarDate } from "../domain/dates.js";
import { validateRrule } from "../domain/schedule.js";
import { TEMPLATE_CATEGORIES } from "../domain/templates.js";
import { ASSIGNMENT_MODES, COMPLETION_KINDS, INTERVAL_UNITS, ROLES, SCHEDULE_TYPES } from "../db/schema.js";

export const CalendarDateSchema = z
  .string()
  .refine(isCalendarDate, "Datum im Format YYYY-MM-DD erwartet")
  .meta({ example: "2026-11-21" });

export const IdParams = z.object({ id: z.coerce.number().int().positive() });

export const ErrorSchema = z.object({ error: z.string() });

export const UserSummarySchema = z.object({ id: z.number(), name: z.string(), avatar: z.string(), color: z.string() });

export const UserSchema = UserSummarySchema.extend({
  role: z.enum(ROLES),
  pointsTotal: z.number(),
  active: z.boolean(),
  hasPin: z.boolean(),
  createdAt: z.string(),
});

const choreFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  room: z.string().max(80),
  icon: z.string().max(16),
  points: z.number().int().min(0).max(1000),
  active: z.boolean(),
  scheduleType: z.enum(SCHEDULE_TYPES),
  intervalValue: z.number().int().min(1).max(3650),
  intervalUnit: z.enum(INTERVAL_UNITS),
  rrule: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .refine((v) => v == null || v === "" || validateRrule(v) === null, { message: "Ungültige RRULE" })
    .transform((v) => (v ? v.replace(/^RRULE:/i, "") : null)),
  anchorDate: CalendarDateSchema.nullable(),
  toleranceDays: z.number().int().min(0).max(365),
  nextDue: CalendarDateSchema,
  assignmentMode: z.enum(ASSIGNMENT_MODES),
  assignedUserId: z.number().int().positive().nullable(),
  rotationUserIds: z.array(z.number().int().positive()).max(20),
  counterTarget: z.number().int().min(1).max(100000).nullable(),
  counterValue: z.number().int().min(0),
  counterLabel: z.string().max(40),
  durationMinutes: z.number().int().min(1).max(1440).nullable(),
  activeMonths: z
    .array(z.number().int().min(1).max(12))
    .max(12)
    .transform((m) => [...new Set(m)].sort((a, b) => a - b))
    .refine((m) => m.length < 12, { message: "Alle 12 Monate = ganzjährig, bitte leer lassen" })
    .meta({ description: "Saison: Monate 1–12, leer = ganzjährig" }),
};

export const ChoreCreateSchema = z
  .object({
    ...choreFields,
    /** Optional: when the chore was last done (after_completion), used to compute the first due date. */
    lastDoneDate: CalendarDateSchema.nullable(),
  })
  .partial()
  .required({ title: true, scheduleType: true });

export const ChorePatchSchema = z.object(choreFields).partial();

export const ChoreViewSchema = z.object({
  id: z.number(),
  ...choreFields,
  rrule: z.string().nullable(),
  lastDone: z.string().nullable(),
  rotationIndex: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(["ok", "due", "overdue"]),
  daysUntilDue: z.number().meta({ description: "Tage bis fällig, negativ = Tage seit Fälligkeit" }),
  counterReached: z.boolean(),
  assignee: UserSummarySchema.nullable(),
  activeMonths: z.array(z.number()),
  freshness: z.number().meta({ description: "Zustand 1 = frisch erledigt … 0 = fällig" }),
  inSeason: z.boolean().meta({ description: "false = ausserhalb der Saison (ruht)" }),
  paused: z.boolean().meta({ description: "true = Ferienmodus aktiv" }),
});

export const CompletionSchema = z.object({
  id: z.number(),
  choreId: z.number(),
  choreTitle: z.string(),
  choreIcon: z.string(),
  userId: z.number().nullable(),
  kind: z.enum(COMPLETION_KINDS),
  doneAt: z.string(),
  points: z.number(),
  note: z.string(),
});

export const TemplateSchema = z.object({
  key: z.string(),
  category: z.enum(TEMPLATE_CATEGORIES),
  durationMinutes: z.number(),
  activeMonths: z.array(z.number()),
  title: z.string(),
  description: z.string(),
  room: z.string(),
  icon: z.string(),
  points: z.number(),
  scheduleType: z.enum(SCHEDULE_TYPES),
  intervalValue: z.number(),
  intervalUnit: z.enum(INTERVAL_UNITS),
});

export const PinSchema = z.string().regex(/^\d{4,8}$/, "PIN: 4 bis 8 Ziffern");

/** Request body that may be omitted entirely (Fastify passes `null` for an empty POST). */
export const optionalBody = <T extends z.ZodType>(schema: T) => z.preprocess((v) => v ?? {}, schema);
