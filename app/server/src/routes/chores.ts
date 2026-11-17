import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError, requireAuth, requireRole, requireRoleOrToken } from "../lib/auth.js";
import type { ChoreService } from "../domain/service.js";
import {
  CalendarDateSchema,
  ChoreCreateSchema,
  ChorePatchSchema,
  ChoreViewSchema,
  CompletionSchema,
  ErrorSchema,
  IdParams,
  optionalBody,
} from "./schemas.js";

const VacationSchema = z.object({ from: CalendarDateSchema, until: CalendarDateSchema, active: z.boolean() });

const tags = ["Aufgaben"];
const errors = { 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema };

export const choreRoutes =
  (svc: ChoreService): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      "/api/chores",
      {
        preHandler: requireAuth,
        schema: {
          tags,
          summary: "Alle Aufgaben mit Status",
          querystring: z.object({ include_inactive: z.stringbool().optional() }),
          response: { 200: z.array(ChoreViewSchema), ...errors },
        },
      },
      async (req) => svc.list({ includeInactive: req.query.include_inactive }),
    );

    app.get(
      "/api/chores/due",
      {
        preHandler: requireAuth,
        schema: {
          tags,
          summary: "Fällige und überfällige Aufgaben (für Home Assistant / MagicMirror)",
          response: { 200: z.array(ChoreViewSchema), ...errors },
        },
      },
      async () => svc.listDue(),
    );

    app.get(
      "/api/chores/:id",
      { preHandler: requireAuth, schema: { tags, summary: "Eine Aufgabe", params: IdParams, response: { 200: ChoreViewSchema, ...errors } } },
      async (req) => svc.getView(req.params.id),
    );

    app.post(
      "/api/chores",
      {
        preHandler: requireRole("adult"),
        schema: { tags, summary: "Aufgabe anlegen", body: ChoreCreateSchema, response: { 201: ChoreViewSchema, ...errors } },
      },
      async (req, reply) => reply.code(201).send(svc.create(req.body)),
    );

    app.patch(
      "/api/chores/:id",
      {
        preHandler: requireRole("adult"),
        schema: { tags, summary: "Aufgabe ändern", params: IdParams, body: ChorePatchSchema, response: { 200: ChoreViewSchema, ...errors } },
      },
      async (req) => svc.update(req.params.id, req.body),
    );

    app.delete(
      "/api/chores/:id",
      { preHandler: requireRole("adult"), schema: { tags, summary: "Aufgabe löschen", params: IdParams, response: { 204: z.null(), ...errors } } },
      async (req, reply) => {
        svc.delete(req.params.id);
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/api/chores/:id/complete",
      {
        preHandler: requireAuth,
        schema: {
          tags,
          summary: "Aufgabe erledigen",
          description:
            "Ohne user_id wird die Erledigung der angemeldeten Person (Web-UI) bzw. der aktuell zugewiesenen Person (API-Token) zugeschrieben.",
          params: IdParams,
          body: optionalBody(z.object({ user_id: z.number().int().positive().nullable().optional(), note: z.string().max(500).optional() })),
          response: { 200: z.object({ chore: ChoreViewSchema, completion_id: z.number() }), ...errors },
        },
      },
      async (req) => {
        let userId = req.body.user_id;
        const auth = req.auth!;
        if (auth.kind === "session") {
          // Children can only record their own work.
          if (auth.user.role === "child") userId = auth.user.id;
          else userId ??= auth.user.id;
        }
        const { chore, completion } = svc.complete(req.params.id, { userId, note: req.body.note });
        return { chore, completion_id: completion.id };
      },
    );

    app.post(
      "/api/chores/:id/skip",
      {
        preHandler: requireRoleOrToken("adult"),
        schema: {
          tags,
          summary: "Aufgabe für diesen Zyklus überspringen (ohne Punkte)",
          params: IdParams,
          body: optionalBody(z.object({ note: z.string().max(500).optional() })),
          response: { 200: z.object({ chore: ChoreViewSchema, completion_id: z.number() }), ...errors },
        },
      },
      async (req) => {
        const userId = req.auth?.kind === "session" ? req.auth.user.id : null;
        const { chore, completion } = svc.skip(req.params.id, { userId, note: req.body.note });
        return { chore, completion_id: completion.id };
      },
    );

    app.post(
      "/api/chores/:id/snooze",
      {
        preHandler: requireRoleOrToken("adult"),
        schema: {
          tags,
          summary: "Aufgabe um X Tage verschieben",
          params: IdParams,
          body: optionalBody(z.object({ days: z.number().int().min(1).max(365).default(1) })),
          response: { 200: ChoreViewSchema, ...errors },
        },
      },
      async (req) => svc.snooze(req.params.id, req.body.days),
    );

    app.post(
      "/api/chores/:id/counter",
      {
        preHandler: requireRoleOrToken("adult"),
        schema: {
          tags,
          summary: "Zähler erhöhen (z.B. Spülgänge, von Home Assistant)",
          params: IdParams,
          body: optionalBody(z.object({ by: z.number().int().min(-1000).max(1000).default(1) })),
          response: { 200: ChoreViewSchema, ...errors },
        },
      },
      async (req) => svc.incrementCounter(req.params.id, req.body.by),
    );

    app.get(
      "/api/completions",
      {
        preHandler: requireAuth,
        schema: {
          tags: ["Historie"],
          summary: "Historie der Erledigungen",
          querystring: z.object({
            chore_id: z.coerce.number().int().positive().optional(),
            user_id: z.coerce.number().int().positive().optional(),
            limit: z.coerce.number().int().min(1).max(500).default(50),
            offset: z.coerce.number().int().min(0).default(0),
          }),
          response: { 200: z.array(CompletionSchema), ...errors },
        },
      },
      async (req) =>
        svc.completionsList({ choreId: req.query.chore_id, userId: req.query.user_id, limit: req.query.limit, offset: req.query.offset }),
    );

    app.delete(
      "/api/completions/:id",
      {
        preHandler: requireAuth,
        schema: {
          tags: ["Historie"],
          summary: "Erledigung rückgängig machen (nur der jeweils letzte Eintrag einer Aufgabe)",
          params: IdParams,
          response: { 200: ChoreViewSchema, ...errors, 409: ErrorSchema },
        },
      },
      async (req) => {
        const auth = req.auth!;
        if (auth.kind === "session" && auth.user.role === "child") {
          const own = svc.completionsList({ userId: auth.user.id, limit: 500 }).some((c) => c.id === req.params.id);
          if (!own) throw new HttpError(403, "Keine Berechtigung");
        }
        return svc.undoCompletion(req.params.id);
      },
    );

    // --------------------------------------------------------------- plan

    app.get(
      "/api/plan",
      {
        preHandler: requireAuth,
        schema: {
          tags: ["Aufgaben"],
          summary: "Tagesplan: dringendste Aufgaben, die ins Zeitbudget passen",
          querystring: z.object({
            minutes: z.coerce.number().int().min(1).max(600),
            user_id: z.coerce.number().int().positive().optional().meta({ description: "Nur Aufgaben dieser Person bzw. für alle" }),
          }),
          response: {
            200: z.object({
              minutes: z.number(),
              usedMinutes: z.number(),
              items: z.array(ChoreViewSchema),
              leftOver: z.number().meta({ description: "Fällige Aufgaben, die nicht mehr Platz hatten" }),
              withoutDuration: z.number().meta({ description: "Fällige Aufgaben ohne Zeitangabe (nicht planbar)" }),
            }),
            ...errors,
          },
        },
      },
      async (req) => {
        const a = req.auth!;
        const userId = a.kind === "session" && a.user.role === "child" ? a.user.id : req.query.user_id;
        return svc.plan(req.query.minutes, { userId });
      },
    );

    // ----------------------------------------------------------- vacation

    app.get(
      "/api/vacation",
      {
        preHandler: requireAuth,
        schema: { tags: ["Ferien"], summary: "Ferienmodus (null = keiner geplant)", response: { 200: VacationSchema.nullable(), ...errors } },
      },
      async () => svc.getVacation(),
    );

    app.put(
      "/api/vacation",
      {
        preHandler: requireRoleOrToken("adult"),
        schema: {
          tags: ["Ferien"],
          summary: "Ferienmodus planen/ändern",
          description:
            "Während der Ferien ist nichts fällig. Danach verschieben sich Aufgaben mit Rhythmus «nach Erledigung» um die Ferientage, feste Termine in den Ferien entfallen.",
          body: z.object({ from: CalendarDateSchema, until: CalendarDateSchema }),
          response: { 200: VacationSchema, ...errors },
        },
      },
      async (req) => svc.setVacation(req.body),
    );

    app.delete(
      "/api/vacation",
      {
        preHandler: requireRoleOrToken("adult"),
        schema: { tags: ["Ferien"], summary: "Ferien beenden bzw. absagen", response: { 204: z.null(), ...errors } },
      },
      async (_req, reply) => {
        svc.endVacation();
        return reply.code(204).send(null);
      },
    );
  };
