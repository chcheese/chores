import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { type Db, openDb } from "./db/client.js";
import { ChoreService, ConflictError, NotFoundError, ValidationError } from "./domain/service.js";
import { HttpError, resolveAuth } from "./lib/auth.js";
import type { Config } from "./lib/config.js";
import { choreRoutes } from "./routes/chores.js";
import { userRoutes } from "./routes/users.js";

export const VERSION = "0.1.0";

export interface BuildOptions {
  config: Config;
  db?: Db;
  now?: () => Date;
  logger?: boolean;
}

export async function buildApp({ config, db: givenDb, now, logger = true }: BuildOptions) {
  const db = givenDb ?? openDb(config.dbFile);
  const svc = new ChoreService(db, { tz: config.tz, now });

  const app = Fastify({
    logger: logger ? { level: config.logLevel } : false,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const msg = err.validation.map((v) => `${v.instancePath || "/"} ${v.message}`).join("; ");
      return reply.code(400).send({ error: msg });
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof ValidationError) return reply.code(400).send({ error: err.message });
    if (err instanceof ConflictError) return reply.code(409).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: "Interner Fehler" });
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: { title: "Chores API", version: VERSION, description: "Haushaltsaufgaben – REST-API" },
      components: {
        securitySchemes: {
          bearer: { type: "http", scheme: "bearer", description: "API-Token (Einstellungen → API-Tokens)" },
          session: { type: "apiKey", in: "cookie", name: "chores_session" },
        },
      },
      security: [{ bearer: [] }, { session: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (req) => {
    if (req.url.startsWith("/api/")) req.auth = resolveAuth(db, req);
  });

  app.get(
    "/api/health",
    {
      schema: {
        tags: ["System"],
        summary: "Health-Check",
        response: { 200: z.object({ status: z.literal("ok"), version: z.string(), time: z.string(), today: z.string(), tz: z.string() }) },
      },
    },
    async () => {
      db.$client.prepare("select 1").get();
      return { status: "ok" as const, version: VERSION, time: svc.now().toISOString(), today: svc.today(), tz: config.tz };
    },
  );

  await app.register(choreRoutes(svc));
  await app.register(userRoutes(db, svc, config));

  // Web UI (built SPA), served from the same container.
  const webDist = config.webDist ? resolve(config.webDist) : null;
  if (webDist && existsSync(resolve(webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "Nicht gefunden" });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "Nicht gefunden" }));
  }

  app.addHook("onClose", async () => db.$client.close());

  return { app, db, svc };
}
