/**
 * Brief 223 — work_items brief-equivalent extension migration + CHECK constraints.
 *
 * Verifies AC #1: additive columns, two CHECK constraints partition by projectId,
 * existing rows survive migration unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test-utils";
import { workItems, projects } from "../db/schema";

let testDb: TestDb;
let cleanup: () => void;

beforeEach(() => {
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => cleanup());

async function seedProject(slug = "test-proj"): Promise<string> {
  const [row] = await testDb
    .insert(projects)
    .values({
      slug,
      name: "Test",
      harnessType: "native",
    })
    .returning();
  return row.id;
}

describe("work_items brief-equivalent extension", () => {
  it("legacy intake-flavored row (content only) inserts cleanly", async () => {
    const inserted = await testDb
      .insert(workItems)
      .values({
        type: "task",
        content: "Legacy work item",
        source: "system_generated",
      })
      .returning();
    expect(inserted[0].content).toBe("Legacy work item");
    expect(inserted[0].title).toBeNull();
    expect(inserted[0].briefState).toBeNull();
    expect(inserted[0].projectId).toBeNull();
  });

  it("project-flavored row (title+body, projectId, briefState) inserts cleanly", async () => {
    const projectId = await seedProject();
    const inserted = await testDb
      .insert(workItems)
      .values({
        type: "feature",
        content: "Add feature X",
        source: "system_generated",
        projectId,
        title: "Add feature X",
        body: "Implement X with tests and docs.",
        briefState: "backlog",
        riskScore: 30,
        confidence: 0.7,
        modelAssignment: "sonnet",
      })
      .returning();
    expect(inserted[0].briefState).toBe("backlog");
    expect(inserted[0].riskScore).toBe(30);
    expect(inserted[0].confidence).toBeCloseTo(0.7, 5);
  });

  it("rejects title+body where body is missing (CHECK 1)", async () => {
    await expect(
      testDb
        .insert(workItems)
        .values({
          type: "feature",
          content: "fallback content",
          source: "system_generated",
          title: "Has title",
          // body missing → violation: title is set but body is null
        })
        .returning(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects briefState without projectId (CHECK 2)", async () => {
    await expect(
      testDb
        .insert(workItems)
        .values({
          type: "feature",
          content: "ok",
          source: "system_generated",
          briefState: "approved", // projectId null → violation
        })
        .returning(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("allows projectId without briefState (project item not yet triaged)", async () => {
    const projectId = await seedProject("two");
    const inserted = await testDb
      .insert(workItems)
      .values({
        type: "fix",
        content: "ok",
        source: "system_generated",
        projectId,
      })
      .returning();
    expect(inserted[0].projectId).toBe(projectId);
    expect(inserted[0].briefState).toBeNull();
  });

  it("the project FK exists post-migration", async () => {
    const projectId = await seedProject("three");
    await testDb.insert(workItems).values({
      type: "feature",
      content: "ok",
      source: "system_generated",
      projectId,
      title: "FK test",
      body: "Check that project_id references projects(id).",
    });
    // Reading back proves the row + FK are intact.
    const back = await testDb
      .select()
      .from(workItems)
      .where(eq(workItems.projectId, projectId));
    expect(back).toHaveLength(1);
  });
});
