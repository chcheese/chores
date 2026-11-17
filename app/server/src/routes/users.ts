import { count, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { apiTokens, ROLES, type User, users } from "../db/schema.js";
import type { ChoreService } from "../domain/service.js";
import { TEMPLATES } from "../domain/templates.js";
import { createSession, destroySession, HttpError, requireAuth, requireRole, SESSION_COOKIE } from "../lib/auth.js";
import type { Config } from "../lib/config.js";
import { hashPin, randomSecret, sha256, verifyPin } from "../lib/crypto.js";
import { ChoreViewSchema, ErrorSchema, IdParams, PinSchema, TemplateSchema, UserSchema, UserSummarySchema } from "./schemas.js";

const errors = { 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema };

export const toUserDto = (u: User) => ({
  id: u.id,
  name: u.name,
  avatar: u.avatar,
  color: u.color,
  role: u.role,
  pointsTotal: u.pointsTotal,
  active: u.active,
  hasPin: u.pinHash != null,
  createdAt: u.createdAt,
});

const UserInput = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.enum(ROLES).default("adult"),
  avatar: z.string().max(16).default("🙂"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#5b8def"),
  pin: PinSchema.optional(),
});

export const userRoutes =
  (db: Db, svc: ChoreService, config: Config): FastifyPluginAsyncZod =>
  async (app) => {
    const userCount = () => db.select({ n: count() }).from(users).get()?.n ?? 0;
    const setCookie = (reply: import("fastify").FastifyReply, userId: number) => {
      const { cookie, expires } = createSession(db, userId, config.sessionDays);
      reply.setCookie(SESSION_COOKIE, cookie, { path: "/", httpOnly: true, sameSite: "lax", secure: config.cookieSecure, expires });
    };

    // ------------------------------------------------------------ setup

    app.get(
      "/api/setup",
      { schema: { tags: ["Setup"], summary: "Ist die Ersteinrichtung nötig?", response: { 200: z.object({ needsSetup: z.boolean() }) } } },
      async () => ({ needsSetup: userCount() === 0 }),
    );

    app.post(
      "/api/setup",
      {
        schema: {
          tags: ["Setup"],
          summary: "Ersteinrichtung: ersten Admin anlegen, optional Vorlagen übernehmen",
          body: UserInput.omit({ role: true }).extend({ pin: PinSchema, importTemplates: z.boolean().default(false) }),
          response: { 201: UserSchema, ...errors },
        },
      },
      async (req, reply) => {
        if (userCount() > 0) throw new HttpError(409, "Bereits eingerichtet");
        const { pin, importTemplates, ...rest } = req.body;
        const user = db.insert(users).values({ ...rest, role: "admin", pinHash: hashPin(pin) }).returning().get();
        if (importTemplates) svc.importTemplates("all");
        setCookie(reply, user.id);
        return reply.code(201).send(toUserDto(user));
      },
    );

    // ------------------------------------------------------------- auth

    app.get(
      "/api/auth/users",
      {
        schema: {
          tags: ["Anmeldung"],
          summary: "Benutzer für den Login-Bildschirm",
          response: { 200: z.array(UserSummarySchema.extend({ hasPin: z.boolean() })) },
        },
      },
      async () =>
        db
          .select()
          .from(users)
          .where(eq(users.active, true))
          .orderBy(users.name)
          .all()
          .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, color: u.color, hasPin: u.pinHash != null })),
    );

    app.post(
      "/api/auth/login",
      {
        config: { rateLimit: { max: 10, timeWindow: "5 minutes" } },
        schema: {
          tags: ["Anmeldung"],
          summary: "Mit Benutzer + PIN anmelden",
          body: z.object({ userId: z.number().int().positive(), pin: PinSchema }),
          response: { 200: UserSchema, ...errors },
        },
      },
      async (req, reply) => {
        const user = db.select().from(users).where(eq(users.id, req.body.userId)).get();
        if (!user || !user.active || !verifyPin(req.body.pin, user.pinHash)) throw new HttpError(401, "PIN falsch");
        setCookie(reply, user.id);
        return toUserDto(user);
      },
    );

    app.post(
      "/api/auth/logout",
      { schema: { tags: ["Anmeldung"], summary: "Abmelden", response: { 204: z.null() } } },
      async (req, reply) => {
        destroySession(db, req.cookies[SESSION_COOKIE]);
        reply.clearCookie(SESSION_COOKIE, { path: "/" });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/api/auth/me",
      {
        preHandler: requireAuth,
        schema: {
          tags: ["Anmeldung"],
          summary: "Aktuelle Anmeldung",
          response: { 200: z.object({ kind: z.enum(["session", "token"]), user: UserSchema.nullable(), tokenName: z.string().nullable() }), ...errors },
        },
      },
      async (req) => {
        const a = req.auth!;
        return a.kind === "session"
          ? { kind: "session" as const, user: toUserDto(a.user), tokenName: null }
          : { kind: "token" as const, user: null, tokenName: a.tokenName };
      },
    );

    // ------------------------------------------------------------ users

    app.get(
      "/api/users",
      { preHandler: requireAuth, schema: { tags: ["Benutzer"], summary: "Alle Benutzer", response: { 200: z.array(UserSchema), ...errors } } },
      async () => db.select().from(users).orderBy(users.name).all().map(toUserDto),
    );

    app.post(
      "/api/users",
      {
        preHandler: requireRole("admin"),
        schema: { tags: ["Benutzer"], summary: "Benutzer anlegen", body: UserInput, response: { 201: UserSchema, ...errors } },
      },
      async (req, reply) => {
        const { pin, ...rest } = req.body;
        if (db.select().from(users).where(eq(users.name, rest.name)).get()) throw new HttpError(409, "Name bereits vergeben");
        const user = db.insert(users).values({ ...rest, pinHash: pin ? hashPin(pin) : null }).returning().get();
        return reply.code(201).send(toUserDto(user));
      },
    );

    app.patch(
      "/api/users/:id",
      {
        preHandler: requireAuth,
        schema: {
          tags: ["Benutzer"],
          summary: "Benutzer ändern (Admin) bzw. eigene PIN/Avatar ändern",
          params: IdParams,
          body: UserInput.partial().extend({ active: z.boolean().optional(), pin: PinSchema.nullable().optional() }),
          response: { 200: UserSchema, ...errors },
        },
      },
      async (req) => {
        const a = req.auth!;
        const isAdmin = a.kind === "session" && a.user.role === "admin";
        const isSelf = a.kind === "session" && a.user.id === req.params.id;
        if (!isAdmin && !isSelf) throw new HttpError(403, "Keine Berechtigung");
        const { pin, ...rest } = req.body;
        if (!isAdmin && (rest.role !== undefined || rest.active !== undefined)) throw new HttpError(403, "Rolle/Aktiv nur durch Admin");
        const existing = db.select().from(users).where(eq(users.id, req.params.id)).get();
        if (!existing) throw new HttpError(404, "Benutzer nicht gefunden");
        if (existing.role === "admin" && (rest.role && rest.role !== "admin" || rest.active === false)) {
          const admins = db.select().from(users).where(eq(users.role, "admin")).all().filter((u) => u.active);
          if (admins.length <= 1) throw new HttpError(409, "Der letzte Admin kann nicht herabgestuft oder deaktiviert werden");
        }
        const updated = db
          .update(users)
          .set({ ...rest, ...(pin !== undefined ? { pinHash: pin ? hashPin(pin) : null } : {}) })
          .where(eq(users.id, req.params.id))
          .returning()
          .get();
        return toUserDto(updated!);
      },
    );

    app.delete(
      "/api/users/:id",
      {
        preHandler: requireRole("admin"),
        schema: { tags: ["Benutzer"], summary: "Benutzer löschen (Historie bleibt, ohne Zuordnung)", params: IdParams, response: { 204: z.null(), ...errors } },
      },
      async (req, reply) => {
        const user = db.select().from(users).where(eq(users.id, req.params.id)).get();
        if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
        if (req.auth?.kind === "session" && req.auth.user.id === user.id) throw new HttpError(409, "Du kannst dich nicht selbst löschen");
        db.delete(users).where(eq(users.id, user.id)).run();
        return reply.code(204).send(null);
      },
    );

    // ----------------------------------------------------------- tokens

    const TokenSchema = z.object({ id: z.number(), name: z.string(), createdAt: z.string(), lastUsedAt: z.string().nullable() });

    app.get(
      "/api/tokens",
      { preHandler: requireRole("admin"), schema: { tags: ["API-Tokens"], summary: "API-Tokens", response: { 200: z.array(TokenSchema), ...errors } } },
      async () =>
        db
          .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
          .from(apiTokens)
          .orderBy(desc(apiTokens.createdAt))
          .all(),
    );

    app.post(
      "/api/tokens",
      {
        preHandler: requireRole("admin"),
        schema: {
          tags: ["API-Tokens"],
          summary: "API-Token erstellen (wird nur einmal angezeigt)",
          body: z.object({ name: z.string().trim().min(1).max(60) }),
          response: { 201: TokenSchema.extend({ token: z.string() }), ...errors },
        },
      },
      async (req, reply) => {
        const token = `chores_${randomSecret()}`;
        const row = db.insert(apiTokens).values({ name: req.body.name, tokenHash: sha256(token) }).returning().get();
        return reply.code(201).send({ id: row.id, name: row.name, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, token });
      },
    );

    app.delete(
      "/api/tokens/:id",
      { preHandler: requireRole("admin"), schema: { tags: ["API-Tokens"], summary: "API-Token widerrufen", params: IdParams, response: { 204: z.null(), ...errors } } },
      async (req, reply) => {
        db.delete(apiTokens).where(eq(apiTokens.id, req.params.id)).run();
        return reply.code(204).send(null);
      },
    );

    // -------------------------------------------------------- templates

    app.get(
      "/api/templates",
      { preHandler: requireAuth, schema: { tags: ["Vorlagen"], summary: "Vorlage-Katalog", response: { 200: z.array(TemplateSchema), ...errors } } },
      async () => TEMPLATES,
    );

    app.post(
      "/api/templates/import",
      {
        preHandler: requireRole("adult"),
        schema: {
          tags: ["Vorlagen"],
          summary: "Aufgaben aus Vorlagen anlegen",
          body: z.object({ keys: z.union([z.literal("all"), z.array(z.string()).min(1)]) }),
          response: { 201: z.array(ChoreViewSchema), ...errors },
        },
      },
      async (req, reply) => reply.code(201).send(svc.importTemplates(req.body.keys)),
    );
  };
