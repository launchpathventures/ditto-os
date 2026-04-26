/**
 * Seed projects on boot — Brief 215 AC #19 idempotence.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import { seedProjectsOnBoot } from "./seed-on-boot";
import { projects } from "../../db/schema";

let testDb: TestDb;
let cleanup: () => void;

beforeEach(() => {
  process.env.SEED_GITHUB_OWNER = "test-owner";
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => {
  cleanup();
  delete process.env.SEED_GITHUB_OWNER;
});

describe("seedProjectsOnBoot", () => {
  it("seeds two rows on empty table", async () => {
    const r = await seedProjectsOnBoot({ db: testDb as any });
    expect(r).toEqual({ seeded: true, inserted: 2 });

    const rows = await testDb.select().from(projects);
    expect(rows).toHaveLength(2);
    const slugs = rows.map((r) => r.slug).sort();
    expect(slugs).toEqual(["agent-crm", "ditto"]);

    const agentCrm = rows.find((r) => r.slug === "agent-crm")!;
    expect(agentCrm.harnessType).toBe("catalyst");
    expect(agentCrm.defaultRunnerKind).toBe("claude-code-routine");
    expect(agentCrm.fallbackRunnerKind).toBe("local-mac-mini");
    expect(agentCrm.deployTarget).toBe("vercel");
    expect(agentCrm.status).toBe("active");
    expect(agentCrm.runnerBearerHash).toBeNull();
    expect(agentCrm.githubRepo).toBe("test-owner/agent-crm");

    const ditto = rows.find((r) => r.slug === "ditto")!;
    expect(ditto.harnessType).toBe("native");
    expect(ditto.defaultRunnerKind).toBe("local-mac-mini");
    expect(ditto.fallbackRunnerKind).toBeNull();
    expect(ditto.deployTarget).toBe("manual");
  });

  it("is idempotent — re-boot does not re-insert", async () => {
    await seedProjectsOnBoot({ db: testDb as any });
    const r2 = await seedProjectsOnBoot({ db: testDb as any });
    expect(r2).toEqual({ seeded: false, inserted: 0 });

    const rows = await testDb.select().from(projects);
    expect(rows).toHaveLength(2);
  });
});
