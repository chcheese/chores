import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db/client.js";
import { loadConfig } from "../src/lib/config.js";

type App = Awaited<ReturnType<typeof buildApp>>["app"];

let app: App;
let clock: Date;
let adminCookie: string;

const config = { ...loadConfig({}), dbFile: ":memory:", tz: "Europe/Zurich" };

async function req(method: string, url: string, opts: { body?: unknown; cookie?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await app.inject({ method: method as "GET", url, headers, ...(opts.body !== undefined ? { payload: opts.body as object } : {}) });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, cookie: res.cookies.find((c) => c.name === "chores_session") };
}

beforeEach(async () => {
  // Tuesday 17 Nov 2026, 09:00 in Zurich
  clock = new Date("2026-11-17T08:00:00Z");
  ({ app } = await buildApp({ config, db: openDb(":memory:"), now: () => clock, logger: false }));
  const setup = await req("POST", "/api/setup", { body: { name: "Claudio", pin: "1234", avatar: "🦊" } });
  expect(setup.status).toBe(201);
  adminCookie = `chores_session=${setup.cookie!.value}`;
});

afterEach(async () => {
  await app.close();
});

describe("setup & auth", () => {
  it("only allows setup once", async () => {
    expect((await req("GET", "/api/setup")).body).toEqual({ needsSetup: false });
    expect((await req("POST", "/api/setup", { body: { name: "X", pin: "1111" } })).status).toBe(409);
  });

  it("requires auth for the API", async () => {
    expect((await req("GET", "/api/chores")).status).toBe(401);
    expect((await req("GET", "/api/health")).status).toBe(200);
  });

  it("logs in with user + PIN and rejects wrong PINs", async () => {
    const users = (await req("GET", "/api/auth/users")).body;
    expect(users).toEqual([expect.objectContaining({ name: "Claudio", hasPin: true })]);
    expect((await req("POST", "/api/auth/login", { body: { userId: users[0].id, pin: "9999" } })).status).toBe(401);
    const ok = await req("POST", "/api/auth/login", { body: { userId: users[0].id, pin: "1234" } });
    expect(ok.status).toBe(200);
    const me = await req("GET", "/api/auth/me", { cookie: `chores_session=${ok.cookie!.value}` });
    expect(me.body.user.name).toBe("Claudio");
  });

  it("API tokens work for HA, but cannot manage chores", async () => {
    const t = await req("POST", "/api/tokens", { cookie: adminCookie, body: { name: "Home Assistant" } });
    expect(t.status).toBe(201);
    expect(t.body.token).toMatch(/^chores_/);
    expect((await req("GET", "/api/chores/due", { token: t.body.token })).status).toBe(200);
    expect((await req("POST", "/api/chores", { token: t.body.token, body: { title: "x", scheduleType: "after_completion" } })).status).toBe(403);
    expect((await req("GET", "/api/tokens", { token: t.body.token })).status).toBe(403);
    expect((await req("GET", "/api/chores", { token: "chores_wrong" })).status).toBe(401);
  });

  it("protects the last admin", async () => {
    const me = (await req("GET", "/api/auth/me", { cookie: adminCookie })).body.user;
    expect((await req("PATCH", `/api/users/${me.id}`, { cookie: adminCookie, body: { role: "adult" } })).status).toBe(409);
  });
});

describe("chores", () => {
  it("creates an after_completion chore and completes it", async () => {
    const created = await req("POST", "/api/chores", {
      cookie: adminCookie,
      body: { title: "Betten beziehen", scheduleType: "after_completion", intervalValue: 14, intervalUnit: "day", points: 20 },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ nextDue: "2026-11-17", status: "due" });

    const done = await req("POST", `/api/chores/${created.body.id}/complete`, { cookie: adminCookie });
    expect(done.status).toBe(200);
    expect(done.body.chore).toMatchObject({ nextDue: "2026-12-01", status: "ok", daysUntilDue: 14 });
    const me = (await req("GET", "/api/auth/me", { cookie: adminCookie })).body.user;
    expect(me.pointsTotal).toBe(20);

    const history = await req("GET", `/api/completions?chore_id=${created.body.id}`, { cookie: adminCookie });
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ kind: "done", points: 20, userId: me.id });
  });

  it("uses the Zurich calendar day for late-night completions", async () => {
    const c = (await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "Saugen", scheduleType: "after_completion", intervalValue: 7 } })).body;
    clock = new Date("2026-11-17T23:30:00Z"); // 00:30 on the 18th in Zurich
    const done = await req("POST", `/api/chores/${c.id}/complete`, { cookie: adminCookie });
    expect(done.body.chore.nextDue).toBe("2026-11-25");
  });

  it("status turns overdue after the tolerance", async () => {
    const c = (await req("POST", "/api/chores", {
      cookie: adminCookie,
      body: { title: "Bad", scheduleType: "after_completion", intervalValue: 7, nextDue: "2026-11-14", toleranceDays: 2 },
    })).body;
    expect(c.status).toBe("overdue");
    const due = (await req("GET", "/api/chores/due", { cookie: adminCookie })).body;
    expect(due.map((d: { id: number }) => d.id)).toContain(c.id);
  });

  it("snoozes, skips and undoes", async () => {
    const c = (await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "Wischen", scheduleType: "after_completion", intervalValue: 14, points: 10 } })).body;
    const snoozed = await req("POST", `/api/chores/${c.id}/snooze`, { cookie: adminCookie, body: { days: 3 } });
    expect(snoozed.body.nextDue).toBe("2026-11-20");

    const skipped = await req("POST", `/api/chores/${c.id}/skip`, { cookie: adminCookie });
    expect(skipped.body.chore.nextDue).toBe("2026-12-04");

    const undone = await req("DELETE", `/api/completions/${skipped.body.completion_id}`, { cookie: adminCookie });
    expect(undone.status).toBe(200);
    expect(undone.body.nextDue).toBe("2026-11-20");
  });

  it("undo restores due date, rotation and points, but only for the latest entry", async () => {
    const admin = (await req("GET", "/api/auth/me", { cookie: adminCookie })).body.user;
    const lisa = (await req("POST", "/api/users", { cookie: adminCookie, body: { name: "Lisa", pin: "4321" } })).body;
    const c = (await req("POST", "/api/chores", {
      cookie: adminCookie,
      body: { title: "Bad", scheduleType: "after_completion", intervalValue: 7, points: 25, assignmentMode: "rotation", rotationUserIds: [admin.id, lisa.id] },
    })).body;
    expect(c.assignee.name).toBe("Claudio");

    const first = await req("POST", `/api/chores/${c.id}/complete`, { cookie: adminCookie });
    expect(first.body.chore.assignee.name).toBe("Lisa");
    const second = await req("POST", `/api/chores/${c.id}/complete`, { cookie: adminCookie, body: { user_id: lisa.id } });
    expect(second.body.chore.assignee.name).toBe("Claudio");

    expect((await req("DELETE", `/api/completions/${first.body.completion_id}`, { cookie: adminCookie })).status).toBe(409);
    const undone = await req("DELETE", `/api/completions/${second.body.completion_id}`, { cookie: adminCookie });
    expect(undone.body.assignee.name).toBe("Lisa");
    const users = (await req("GET", "/api/users", { cookie: adminCookie })).body;
    expect(users.find((u: { id: number }) => u.id === lisa.id).pointsTotal).toBe(0);
    expect(users.find((u: { id: number }) => u.id === admin.id).pointsTotal).toBe(25);
  });

  it("API-token completions are attributed to the current assignee", async () => {
    const lisa = (await req("POST", "/api/users", { cookie: adminCookie, body: { name: "Lisa" } })).body;
    const c = (await req("POST", "/api/chores", {
      cookie: adminCookie,
      body: { title: "Saugen", scheduleType: "after_completion", intervalValue: 7, points: 15, assignmentMode: "user", assignedUserId: lisa.id },
    })).body;
    const token = (await req("POST", "/api/tokens", { cookie: adminCookie, body: { name: "HA" } })).body.token;
    const done = await req("POST", `/api/chores/${c.id}/complete`, { token });
    expect(done.status).toBe(200);
    const hist = (await req("GET", `/api/completions?chore_id=${c.id}`, { token })).body;
    expect(hist[0].userId).toBe(lisa.id);
  });

  it("counter triggers make a chore due and reset on completion", async () => {
    const c = (await req("POST", "/api/chores", {
      cookie: adminCookie,
      body: { title: "GS-Filter", scheduleType: "after_completion", intervalValue: 1, intervalUnit: "month", counterTarget: 30, counterLabel: "Spülgänge", nextDue: "2026-12-17" },
    })).body;
    const token = (await req("POST", "/api/tokens", { cookie: adminCookie, body: { name: "HA" } })).body.token;
    let v = (await req("POST", `/api/chores/${c.id}/counter`, { token, body: { by: 29 } })).body;
    expect(v).toMatchObject({ counterValue: 29, status: "ok" });
    v = (await req("POST", `/api/chores/${c.id}/counter`, { token })).body;
    expect(v).toMatchObject({ counterValue: 30, status: "due", counterReached: true });
    const done = (await req("POST", `/api/chores/${c.id}/complete`, { token })).body.chore;
    expect(done).toMatchObject({ counterValue: 0, status: "ok", nextDue: "2026-12-17" });
  });

  it("fixed chores with RRULE", async () => {
    const c = await req("POST", "/api/chores", {
      cookie: adminCookie,
      body: { title: "Altpapier bündeln", scheduleType: "fixed", rrule: "FREQ=WEEKLY;BYDAY=SA", anchorDate: "2026-11-01" },
    });
    expect(c.status).toBe(201);
    expect(c.body.nextDue).toBe("2026-11-21");
    const done = await req("POST", `/api/chores/${c.body.id}/complete`, { cookie: adminCookie });
    expect(done.body.chore.nextDue).toBe("2026-11-28");
    const bad = await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "x", scheduleType: "fixed", rrule: "FREQ=BOGUS" } });
    expect(bad.status).toBe(400);
  });

  it("changing the interval recomputes the due date from the last completion", async () => {
    const c = (await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "Saugen", scheduleType: "after_completion", intervalValue: 7 } })).body;
    await req("POST", `/api/chores/${c.id}/complete`, { cookie: adminCookie });
    const patched = await req("PATCH", `/api/chores/${c.id}`, { cookie: adminCookie, body: { intervalValue: 10 } });
    expect(patched.body.nextDue).toBe("2026-11-27");
  });

  it("validates input", async () => {
    expect((await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "" , scheduleType: "fixed" } })).status).toBe(400);
    expect((await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "x", scheduleType: "after_completion", nextDue: "2026-02-30" } })).status).toBe(400);
    expect((await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "x", scheduleType: "after_completion", assignmentMode: "user", assignedUserId: 999 } })).status).toBe(400);
    expect((await req("GET", "/api/chores/999", { cookie: adminCookie })).status).toBe(404);
  });
});

describe("roles", () => {
  it("children can complete (always for themselves) but not manage or skip", async () => {
    const kid = (await req("POST", "/api/users", { cookie: adminCookie, body: { name: "Mia", role: "child", pin: "1111" } })).body;
    const kidCookie = `chores_session=${(await req("POST", "/api/auth/login", { body: { userId: kid.id, pin: "1111" } })).cookie!.value}`;
    const c = (await req("POST", "/api/chores", { cookie: adminCookie, body: { title: "Tisch abräumen", scheduleType: "after_completion", intervalValue: 1, points: 5 } })).body;

    expect((await req("POST", "/api/chores", { cookie: kidCookie, body: { title: "x", scheduleType: "after_completion" } })).status).toBe(403);
    expect((await req("POST", `/api/chores/${c.id}/skip`, { cookie: kidCookie })).status).toBe(403);
    const admin = (await req("GET", "/api/auth/me", { cookie: adminCookie })).body.user;
    const done = await req("POST", `/api/chores/${c.id}/complete`, { cookie: kidCookie, body: { user_id: admin.id } });
    expect(done.status).toBe(200);
    const hist = (await req("GET", `/api/completions?chore_id=${c.id}`, { cookie: kidCookie })).body;
    expect(hist[0].userId).toBe(kid.id);
  });
});

describe("templates", () => {
  it("imports the catalogue staggered over two weeks", async () => {
    const all = await req("POST", "/api/templates/import", { cookie: adminCookie, body: { keys: "all" } });
    expect(all.status).toBe(201);
    expect(all.body).toHaveLength(15);
    const due = (await req("GET", "/api/chores/due", { cookie: adminCookie })).body;
    expect(due.length).toBeLessThanOrEqual(2);
    const dates = all.body.map((c: { nextDue: string }) => c.nextDue).sort();
    expect(dates[0]).toBe("2026-11-17");
    expect(dates.at(-1) < "2026-12-01").toBe(true);
    const mattress = all.body.find((c: { title: string }) => c.title.startsWith("Matratzen"));
    expect(mattress).toMatchObject({ scheduleType: "fixed", anchorDate: mattress.nextDue });
    expect(JSON.stringify(all.body)).not.toContain("ß");
  });

  it("serves OpenAPI docs", async () => {
    const res = await app.inject({ method: "GET", url: "/api/docs/json" });
    expect(res.statusCode).toBe(200);
    const spec = JSON.parse(res.body);
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(["/api/chores/due", "/api/chores/{id}/complete", "/api/chores/{id}/counter"]));
  });
});
