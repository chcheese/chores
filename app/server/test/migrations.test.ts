import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openDb } from "../src/db/client.js";
import { chores } from "../src/db/schema.js";
import { ChoreService } from "../src/domain/service.js";

const dir = mkdtempSync(join(tmpdir(), "chores-mig-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("migrations", () => {
  it("re-opening an existing database keeps data and does not re-run migrations", () => {
    const file = join(dir, "chores.sqlite");
    const db1 = openDb(file);
    new ChoreService(db1, { tz: "Europe/Zurich" }).importTemplates("all");
    db1.$client.close();

    const db2 = openDb(file);
    expect(db2.select().from(chores).all()).toHaveLength(15);
    const applied = db2.$client.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number };
    expect(applied.n).toBeGreaterThan(0);
    db2.$client.close();
  });
});
