import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db/client.js";
import { computeBadges, levelFor, streaks } from "../src/domain/rewards.js";
import { loadConfig } from "../src/lib/config.js";

describe("levels, streaks, badges", () => {
  it("levels grow with lifetime points", () => {
    expect(levelFor(0)).toEqual({ level: 1, levelFloor: 0, levelNext: 50 });
    expect(levelFor(49).level).toBe(1);
    expect(levelFor(50)).toEqual({ level: 2, levelFloor: 50, levelNext: 150 });
    expect(levelFor(300).level).toBe(4);
  });

  it("counts consecutive days; a streak survives until the end of the next day", () => {
    const days = ["2026-11-10", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-14"];
    expect(streaks(days, "2026-11-15")).toEqual({ current: 3, best: 3 });
    expect(streaks(days, "2026-11-16")).toEqual({ current: 0, best: 3 });
    expect(streaks([], "2026-11-16")).toEqual({ current: 0, best: 0 });
  });

  it("records when badges were earned", () => {
    const e = (doneAt: string, extra: Partial<{ room: string; dueBefore: string }> = {}) => ({
      doneAt,
      points: 10,
      room: extra.room ?? "Küche",
      dueBefore: extra.dueBefore ?? doneAt.slice(0, 10),
      toleranceDays: 2,
    });
    const badges = computeBadges(
      [e("2026-11-01T08:00:00Z"), e("2026-11-02T08:00:00Z"), e("2026-11-03T08:00:00Z", { dueBefore: "2026-10-20" })],
      "Europe/Zurich",
    );
    const got = Object.fromEntries(badges.map((b) => [b.key, b.earnedAt]));
    expect(got.erste).toBe("2026-11-01T08:00:00Z");
    expect(got.serie3).toBe("2026-11-03T08:00:00Z");
    expect(got.retter).toBe("2026-11-03T08:00:00Z");
    expect(got.zehn).toBeNull();
  });
});

type App = Awaited<ReturnType<typeof buildApp>>["app"];
let app: App;
let clock: Date;
let adminCookie: string;
let kidCookie: string;
let kidId: number;

const config = { ...loadConfig({}), dbFile: ":memory:", tz: "Europe/Zurich" };

async function req(method: string, url: string, opts: { body?: unknown; cookie?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await app.inject({ method: method as "GET", url, headers, ...(opts.body !== undefined ? { payload: opts.body as object } : {}) });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, cookie: res.cookies.find((c) => c.name === "chores_session") };
}

beforeEach(async () => {
  clock = new Date("2026-11-17T08:00:00Z");
  ({ app } = await buildApp({ config, db: openDb(":memory:"), now: () => clock, logger: false }));
  const setup = await req("POST", "/api/setup", { body: { name: "Mami", pin: "1234" } });
  adminCookie = `chores_session=${setup.cookie!.value}`;
  kidId = (await req("POST", "/api/users", { cookie: adminCookie, body: { name: "Lena", role: "child", pin: "1111" } })).body.id;
  kidCookie = `chores_session=${(await req("POST", "/api/auth/login", { body: { userId: kidId, pin: "1111" } })).cookie!.value}`;
});

afterEach(async () => {
  await app.close();
});

describe("rewards API", () => {
  it("child earns points, claims a reward, an adult approves", async () => {
    const chore = (await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "Tisch decken", scheduleType: "after_completion", intervalValue: 1, points: 30 } })).body;
    const reward = (await req("POST", "/api/rewards", { cookie: adminCookie, body: { title: "30 Min Tablet", icon: "📱", cost: 50 } })).body;
    expect((await req("POST", "/api/rewards", { cookie: kidCookie, body: { title: "x", cost: 1 } })).status).toBe(403);

    await req("POST", `/api/chores/${chore.id}/complete`, { cookie: kidCookie });
    const tooPoor = await req("POST", `/api/rewards/${reward.id}/claim`, { cookie: kidCookie });
    expect(tooPoor.status).toBe(400);
    expect(tooPoor.body.error).toContain("30 von 50");

    clock = new Date("2026-11-18T08:00:00Z");
    await req("POST", `/api/chores/${chore.id}/complete`, { cookie: kidCookie });
    const claim = await req("POST", `/api/rewards/${reward.id}/claim`, { cookie: kidCookie });
    expect(claim.status).toBe(201);
    expect(claim.body).toMatchObject({ status: "pending", cost: 50, userId: kidId });

    const progress = (await req("GET", "/api/progress", { cookie: kidCookie })).body.find((p: { userId: number }) => p.userId === kidId);
    expect(progress).toMatchObject({ pointsTotal: 60, balance: 10, level: 2, streak: 2, doneCount: 2 });
    expect(progress.badges.find((b: { key: string }) => b.key === "erste").earnedAt).not.toBeNull();

    // Children cannot decide; an API token (Home Assistant) can.
    expect((await req("POST", `/api/claims/${claim.body.id}/approve`, { cookie: kidCookie })).status).toBe(403);
    const token = (await req("POST", "/api/tokens", { cookie: adminCookie, body: { name: "HA" } })).body.token;
    const pending = (await req("GET", "/api/claims?status=pending", { token })).body;
    expect(pending).toHaveLength(1);
    const ok = await req("POST", `/api/claims/${claim.body.id}/approve`, { token });
    expect(ok.body).toMatchObject({ status: "approved", decidedBy: null });
    expect((await req("POST", `/api/claims/${claim.body.id}/reject`, { cookie: adminCookie })).status).toBe(409);
  });

  it("rejecting or withdrawing frees the points; children only see their own claims", async () => {
    const chore = (await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "Zimmer", scheduleType: "after_completion", points: 40 } })).body;
    const reward = (await req("POST", "/api/rewards", { cookie: adminCookie, body: { title: "Glace", cost: 40 } })).body;
    await req("POST", `/api/chores/${chore.id}/complete`, { cookie: kidCookie });
    const c1 = (await req("POST", `/api/rewards/${reward.id}/claim`, { cookie: kidCookie })).body;
    expect((await req("POST", `/api/rewards/${reward.id}/claim`, { cookie: kidCookie })).status).toBe(400);
    await req("POST", `/api/claims/${c1.id}/reject`, { cookie: adminCookie });
    const c2 = (await req("POST", `/api/rewards/${reward.id}/claim`, { cookie: kidCookie })).body;
    expect((await req("DELETE", `/api/claims/${c2.id}`, { cookie: kidCookie })).status).toBe(204);
    const balance = (await req("GET", "/api/progress", { cookie: kidCookie })).body.find((p: { userId: number }) => p.userId === kidId).balance;
    expect(balance).toBe(40);

    // The admin's own claims are invisible to the child.
    await req("POST", `/api/chores/${chore.id}/complete`, { cookie: adminCookie });
    await req("POST", `/api/rewards/${reward.id}/claim`, { cookie: adminCookie });
    const seen = (await req("GET", "/api/claims", { cookie: kidCookie })).body;
    expect(seen.every((c: { userId: number }) => c.userId === kidId)).toBe(true);
  });
});
