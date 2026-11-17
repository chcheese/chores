import { resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  dbFile: string;
  tz: string;
  sessionDays: number;
  /** Set when served over HTTPS (e.g. behind NPM) so the session cookie gets the Secure flag. */
  cookieSecure: boolean;
  webDist: string | null;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR ?? "./data";
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "0.0.0.0",
    dbFile: env.DB_FILE ?? resolve(dataDir, "chores.sqlite"),
    tz: env.APP_TZ ?? env.TZ ?? "Europe/Zurich",
    sessionDays: Number(env.SESSION_DAYS ?? 180),
    cookieSecure: env.COOKIE_SECURE === "true",
    webDist: env.WEB_DIST ?? null,
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
