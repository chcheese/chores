import { eq, lt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../db/client.js";
import { apiTokens, type Role, sessions, type User, users } from "../db/schema.js";
import { randomSecret, sha256 } from "./crypto.js";

export const SESSION_COOKIE = "chores_session";

export type Auth = { kind: "session"; user: User } | { kind: "token"; tokenId: number; tokenName: string };

declare module "fastify" {
  interface FastifyRequest {
    auth: Auth | null;
  }
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function resolveAuth(db: Db, req: FastifyRequest): Auth | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const hash = sha256(header.slice(7).trim());
    const token = db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).get();
    if (!token) return null;
    // Throttle the write: only touch last_used_at once a minute.
    const now = new Date();
    if (!token.lastUsedAt || now.getTime() - Date.parse(token.lastUsedAt) > 60_000) {
      db.update(apiTokens).set({ lastUsedAt: now.toISOString() }).where(eq(apiTokens.id, token.id)).run();
    }
    return { kind: "token", tokenId: token.id, tokenName: token.name };
  }
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (cookie) {
    const session = db.select().from(sessions).where(eq(sessions.id, sha256(cookie))).get();
    if (!session || Date.parse(session.expiresAt) < Date.now()) return null;
    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user || !user.active) return null;
    return { kind: "session", user };
  }
  return null;
}

export function createSession(db: Db, userId: number, days: number): { cookie: string; expires: Date } {
  const cookie = randomSecret();
  const expires = new Date(Date.now() + days * 86_400_000);
  db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
  db.insert(sessions).values({ id: sha256(cookie), userId, expiresAt: expires.toISOString() }).run();
  return { cookie, expires };
}

export function destroySession(db: Db, cookie: string | undefined): void {
  if (cookie) db.delete(sessions).where(eq(sessions.id, sha256(cookie))).run();
}

const ROLE_RANK: Record<Role, number> = { child: 0, adult: 1, admin: 2 };

/** Any authenticated caller (session or API token). */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.auth) throw new HttpError(401, "Nicht angemeldet");
}

/** Logged-in user with at least the given role. API tokens do not qualify. */
export function requireRole(min: Role) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.auth) throw new HttpError(401, "Nicht angemeldet");
    if (req.auth.kind !== "session" || ROLE_RANK[req.auth.user.role] < ROLE_RANK[min]) {
      throw new HttpError(403, "Keine Berechtigung");
    }
  };
}

/** Session users with role >= min, or any API token. */
export function requireRoleOrToken(min: Role) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.auth) throw new HttpError(401, "Nicht angemeldet");
    if (req.auth.kind === "session" && ROLE_RANK[req.auth.user.role] < ROLE_RANK[min]) {
      throw new HttpError(403, "Keine Berechtigung");
    }
  };
}
