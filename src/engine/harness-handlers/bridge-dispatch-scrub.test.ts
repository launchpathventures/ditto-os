/**
 * Verifies the AC #13 command-scrubbing invariant: credential-shaped
 * substrings in the dispatched command are masked before they reach the
 * harness_decisions audit row. Pattern-based + (later) vault-list-based.
 *
 * We test the helper indirectly via a representative set of inputs.
 */
import { describe, it, expect } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import { vi } from "vitest";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const actualSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: actualSchema,
  };
});

async function seed(db: TestDb) {
  const { processes, processRuns, stepRuns, bridgeDevices } = await import(
    "../../db/schema"
  );
  const proc = await db
    .insert(processes)
    .values({
      name: "scrub-test",
      slug: `s-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      version: 1,
      trustTier: "autonomous",
      definition: {},
    })
    .returning();
  const run = await db
    .insert(processRuns)
    .values({ processId: proc[0].id, triggeredBy: "test" })
    .returning();
  const step = await db
    .insert(stepRuns)
    .values({ processRunId: run[0].id, stepId: "s1", executorType: "ai-agent" })
    .returning();
  const device = await db
    .insert(bridgeDevices)
    .values({
      workspaceId: "default",
      deviceName: "Test",
      jwtTokenHash: "hash",
      protocolVersion: "1.0.0",
      pairedAt: new Date(),
      lastDialAt: new Date(),
      status: "active",
    })
    .returning();
  return {
    processRunId: run[0].id,
    stepRunId: step[0].id,
    deviceId: device[0].id,
  };
}

describe("AC #13 — command scrubbing", () => {
  beforeEach(() => {
    const r = createTestDb();
    testDb = r.db;
    cleanup = r.cleanup;
  });
  afterEach(() => cleanup());

  it("masks credential-shaped substrings in the audit row", async () => {
    const { dispatchBridgeJob } = await import("./bridge-dispatch.js");
    const { harnessDecisions } = await import("../../db/schema");
    const fx = await seed(testDb);

    await dispatchBridgeJob({
      stepRunId: fx.stepRunId,
      processRunId: fx.processRunId,
      trustTier: "autonomous",
      trustAction: "advance",
      deviceId: fx.deviceId,
      payload: {
        kind: "exec",
        command: "curl",
        args: [
          "-H",
          "Authorization: Bearer sk-1234567890abcdef1234567890abcdef",
          "--token",
          "ghp_1234567890abcdef1234567890",
          "--password=hunter2-very-secret-value",
          "https://example.com",
        ],
      },
    });

    const rows = await testDb.select().from(harnessDecisions);
    expect(rows).toHaveLength(1);
    const cmd = (rows[0].reviewDetails as { bridge: { command: string } }).bridge.command;
    // The literal token values must not appear.
    expect(cmd).not.toContain("sk-1234567890abcdef1234567890abcdef");
    expect(cmd).not.toContain("ghp_1234567890abcdef1234567890");
    expect(cmd).not.toContain("hunter2-very-secret-value");
    // Redaction markers should be present.
    expect(cmd).toMatch(/REDACTED/);
  });
});

// vitest-style imports are pulled in lazily above; alias here for ergonomics.
import { beforeEach, afterEach } from "vitest";
