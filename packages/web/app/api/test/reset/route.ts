/**
 * Ditto Web — Test-Only Database Reset Endpoint
 *
 * POST /api/test/reset
 * Guarded by MOCK_LLM=true or NODE_ENV=test — returns 403 otherwise.
 * Ensures schema exists, truncates all tables, re-seeds with minimal test data.
 *
 * Used by Playwright e2e tests in beforeAll.
 * Provenance: Brief 054 (Testing Infrastructure).
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Guard: only available in test mode (MOCK_LLM=true or NODE_ENV=test)
  // Next.js dev mode overrides NODE_ENV to "development", so we also check MOCK_LLM
  if (process.env.NODE_ENV !== "test" && process.env.MOCK_LLM !== "true") {
    return NextResponse.json(
      { error: "Test reset endpoint only available in test mode" },
      { status: 403 },
    );
  }

  try {
    // Dynamic import to avoid build-time DB initialization
    const dbModule = await import("../../../../../../src/db");
    const { db, schema } = dbModule;

    // Ensure schema exists before truncating
    dbModule.ensureSchema();

    // Truncate all tables. Disable FK enforcement for the reset so we don't
    // have to hand-maintain a parent-after-child delete order as new tables
    // are added to the schema. Re-enabled before seed inserts so seed data
    // still validates referential integrity. Pattern matches migration 0003.
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    try {
      await db.delete(schema.harnessDecisions);
      await db.delete(schema.trustChanges);
      await db.delete(schema.trustSuggestions);
      await db.delete(schema.feedback);
      await db.delete(schema.processOutputs);
      await db.delete(schema.stepRuns);
      await db.delete(schema.processRuns);
      await db.delete(schema.processDependencies);
      await db.delete(schema.credentials);
      await db.delete(schema.memories);
      await db.delete(schema.improvements);
      await db.delete(schema.activities);
      await db.delete(schema.workItems);
      await db.delete(schema.sessions);
      await db.delete(schema.agents);
      await db.delete(schema.processes);
    } finally {
      await db.run(sql`PRAGMA foreign_keys = ON`);
    }

    // Seed minimal test data
    const processId = "test-process-001";
    const workItemId = "test-work-item-001";
    const sessionId = "test-session-001";

    await db.insert(schema.processes).values({
      id: processId,
      name: "Dev Builder",
      slug: "dev-builder",
      description: "Implements approved briefs as code",
      version: 1,
      status: "active",
      definition: {
        name: "Dev Builder",
        trigger: "Build Brief {briefId}",
        steps: [
          { id: "read-brief", name: "Read Brief", executor: "ai-agent" },
          { id: "implement", name: "Implement", executor: "ai-agent" },
          { id: "review", name: "Review", executor: "human" },
        ],
      },
      trustTier: "supervised",
    }).onConflictDoNothing();

    await db.insert(schema.workItems).values({
      id: workItemId,
      type: "task",
      status: "intake",
      content: "Build Brief 054: Testing Infrastructure",
      source: "conversation",
    }).onConflictDoNothing();

    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: "default",
      surface: "web",
      status: "active",
      turns: [],
    }).onConflictDoNothing();

    return NextResponse.json({ success: true, seeded: { processId, workItemId, sessionId } });
  } catch (error) {
    console.error("[/api/test/reset] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset database", details: String(error) },
      { status: 500 },
    );
  }
}
