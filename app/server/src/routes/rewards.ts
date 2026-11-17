import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CLAIM_STATUSES } from "../db/schema.js";
import type { RewardService } from "../domain/rewards.js";
import { HttpError, requireAuth, requireRole, requireRoleOrToken } from "../lib/auth.js";
import { ErrorSchema, IdParams, optionalBody } from "./schemas.js";

const errors = { 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema };
const tags = ["Belohnungen"];

const RewardSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
  cost: z.number(),
  active: z.boolean(),
  createdAt: z.string(),
});

const RewardInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  icon: z.string().max(16).default("🎁"),
  cost: z.number().int().min(1).max(100000),
});

const ClaimSchema = z.object({
  id: z.number(),
  rewardId: z.number().nullable(),
  title: z.string(),
  icon: z.string(),
  cost: z.number(),
  userId: z.number(),
  status: z.enum(CLAIM_STATUSES),
  requestedAt: z.string(),
  decidedAt: z.string().nullable(),
  decidedBy: z.number().nullable(),
});

const BadgeSchema = z.object({ key: z.string(), title: z.string(), icon: z.string(), description: z.string(), earnedAt: z.string().nullable() });

const ProgressSchema = z.object({
  userId: z.number(),
  pointsTotal: z.number().meta({ description: "Alle je verdienten Punkte (für Level)" }),
  balance: z.number().meta({ description: "Noch einlösbare Punkte" }),
  level: z.number(),
  levelFloor: z.number(),
  levelNext: z.number(),
  streak: z.number().meta({ description: "Tage in Folge mit mindestens einer erledigten Aufgabe" }),
  bestStreak: z.number(),
  doneCount: z.number(),
  doneThisWeek: z.number(),
  badges: z.array(BadgeSchema),
});

export const rewardRoutes =
  (rs: RewardService): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      "/api/rewards",
      {
        preHandler: requireAuth,
        schema: {
          tags,
          summary: "Belohnungen",
          querystring: z.object({ include_inactive: z.stringbool().optional() }),
          response: { 200: z.array(RewardSchema), ...errors },
        },
      },
      async (req) => rs.list(req.query.include_inactive),
    );

    app.post(
      "/api/rewards",
      { preHandler: requireRole("adult"), schema: { tags, summary: "Belohnung anlegen", body: RewardInput, response: { 201: RewardSchema, ...errors } } },
      async (req, reply) => reply.code(201).send(rs.create(req.body)),
    );

    app.patch(
      "/api/rewards/:id",
      {
        preHandler: requireRole("adult"),
        schema: {
          tags,
          summary: "Belohnung ändern",
          params: IdParams,
          body: RewardInput.partial().extend({ active: z.boolean().optional() }),
          response: { 200: RewardSchema, ...errors },
        },
      },
      async (req) => rs.update(req.params.id, req.body),
    );

    app.delete(
      "/api/rewards/:id",
      { preHandler: requireRole("adult"), schema: { tags, summary: "Belohnung löschen", params: IdParams, response: { 204: z.null(), ...errors } } },
      async (req, reply) => {
        rs.delete(req.params.id);
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/api/rewards/:id/claim",
      {
        preHandler: requireRole("child"),
        schema: {
          tags,
          summary: "Belohnung einlösen (Antrag, Erwachsene geben frei)",
          params: IdParams,
          body: optionalBody(z.object({})),
          response: { 201: ClaimSchema, ...errors },
        },
      },
      async (req, reply) => {
        const user = req.auth!.kind === "session" ? req.auth!.user : null;
        if (!user) throw new HttpError(403, "Keine Berechtigung");
        return reply.code(201).send(rs.claim(user.id, req.params.id));
      },
    );

    app.get(
      "/api/claims",
      {
        preHandler: requireAuth,
        schema: {
          tags,
          summary: "Eingelöste Belohnungen (Kinder sehen nur ihre eigenen)",
          querystring: z.object({
            status: z.enum(CLAIM_STATUSES).optional(),
            user_id: z.coerce.number().int().positive().optional(),
            limit: z.coerce.number().int().min(1).max(500).default(100),
          }),
          response: { 200: z.array(ClaimSchema), ...errors },
        },
      },
      async (req) => {
        const a = req.auth!;
        const userId = a.kind === "session" && a.user.role === "child" ? a.user.id : req.query.user_id;
        return rs.claims({ status: req.query.status, userId, limit: req.query.limit });
      },
    );

    for (const [action, approve] of [
      ["approve", true],
      ["reject", false],
    ] as const) {
      app.post(
        `/api/claims/:id/${action}`,
        {
          preHandler: requireRoleOrToken("adult"),
          schema: {
            tags,
            summary: approve ? "Antrag freigeben" : "Antrag ablehnen (Punkte werden wieder frei)",
            params: IdParams,
            body: optionalBody(z.object({})),
            response: { 200: ClaimSchema, ...errors },
          },
        },
        async (req) => rs.decide(req.params.id, approve, req.auth!.kind === "session" ? req.auth!.user.id : null),
      );
    }

    app.delete(
      "/api/claims/:id",
      {
        preHandler: requireRole("child"),
        schema: { tags, summary: "Offenen Antrag zurückziehen", params: IdParams, response: { 204: z.null(), ...errors } },
      },
      async (req, reply) => {
        const a = req.auth!;
        const claim = rs.getClaim(req.params.id);
        if (a.kind === "session" && a.user.role === "child" && claim.userId !== a.user.id) throw new HttpError(403, "Keine Berechtigung");
        rs.withdraw(claim.id);
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/api/progress",
      {
        preHandler: requireAuth,
        schema: { tags, summary: "Punkte, Level, Serien und Abzeichen pro Person", response: { 200: z.array(ProgressSchema), ...errors } },
      },
      async () => rs.progress(),
    );
  };
