/**
 * Tests for workspace readiness detection (Brief 110).
 *
 * Covers: active process threshold (3+), goal decomposition threshold (4+ sub-goals),
 * already-has-workspace skip, keyword signal detection, dismissal respect.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Import after mock
const {
  checkWorkspaceReadiness,
  countActiveProcesses,
  hasLargeGoalDecomposition,
  hasControlSignals,
  ACTIVE_PROCESS_THRESHOLD,
  SUB_GOAL_THRESHOLD,
} = await import("./workspace-readiness");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;

  // Create process record required by FK
  testDb.insert(schema.processes).values({
    id: "test-process",
    name: "Test Process",
    slug: "test-process",
    definition: {},
  }).run();
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Helper: create a network user
// ============================================================

function createUser(overrides: Partial<{
  id: string;
  email: string;
  status: "active" | "workspace" | "churned";
  personId: string;
}> = {}) {
  const id = overrides.id ?? randomUUID();
  const personId = overrides.personId ?? randomUUID();

  // Create person record first (for FK)
  testDb.insert(schema.people).values({
    id: personId,
    userId: id,
    name: "Test User",
    source: "manual",
  }).run();

  testDb.insert(schema.networkUsers).values({
    id,
    email: overrides.email ?? `test-${id.slice(0, 8)}@example.com`,
    status: overrides.status ?? "active",
    personId,
  }).run();

  return { id, personId };
}

// ============================================================
// Helper: create active process runs linked to a user
// ============================================================

function createActiveProcessRuns(userId: string, personId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const runId = randomUUID();

    testDb.insert(schema.processRuns).values({
      id: runId,
      processId: "test-process",
      status: "running",
      triggeredBy: "test",
      inputs: {},
    }).run();

    testDb.insert(schema.interactions).values({
      id: randomUUID(),
      userId,
      personId,
      type: "outreach_sent",
      channel: "email",
      mode: "selling",
      processRunId: runId,
    }).run();
  }
}

// ============================================================
// Helper: create a goal work item with decomposition
// ============================================================

function createGoalWithSubGoals(subGoalCount: number) {
  const decomposition = Array.from({ length: subGoalCount }, (_, i) => ({
    taskId: `task-${i}`,
    stepId: `step-${i}`,
    dependsOn: [] as string[],
    status: "pending",
  }));

  testDb.insert(schema.workItems).values({
    id: randomUUID(),
    type: "goal",
    status: "in_progress",
    content: "Grow the business",
    source: "conversation",
    decomposition,
  }).run();
}

// ============================================================
// Helper: create interactions with keywords
// ============================================================

function createInteractionWithSummary(userId: string, personId: string, summary: string) {
  testDb.insert(schema.interactions).values({
    id: randomUUID(),
    userId,
    personId,
    type: "reply_received",
    channel: "email",
    mode: "nurture",
    summary,
  }).run();
}

// ============================================================
// Tests: checkWorkspaceReadiness
// ============================================================

describe("checkWorkspaceReadiness", () => {
  it("returns ready: true when user has 3+ active processes (AC1)", async () => {
    const user = createUser();
    createActiveProcessRuns(user.id, user.personId, 3);

    const result = await checkWorkspaceReadiness(user.id);

    expect(result.ready).toBe(true);
    expect(result.reason).toContain("3 active processes");
  });

  it("returns ready: true when user has more than 3 active processes", async () => {
    const user = createUser();
    createActiveProcessRuns(user.id, user.personId, 5);

    const result = await checkWorkspaceReadiness(user.id);

    expect(result.ready).toBe(true);
    expect(result.reason).toContain("5 active processes");
  });

  it("returns ready: true when goal has 4+ sub-goals (AC2)", async () => {
    const user = createUser();
    createGoalWithSubGoals(4);

    const result = await checkWorkspaceReadiness(user.id);

    expect(result.ready).toBe(true);
    expect(result.reason).toContain("complex");
  });

  it("returns ready: false when thresholds not met (AC3)", async () => {
    const user = createUser();
    createActiveProcessRuns(user.id, user.personId, 2); // below threshold
    createGoalWithSubGoals(2); // below threshold

    const result = await checkWorkspaceReadiness(user.id);

    expect(result.ready).toBe(false);
    expect(result.reason).toBe("thresholds_not_met");
  });

  it("returns ready: false when user already has a workspace (AC4)", async () => {
    const user = createUser({ status: "workspace" });
    createActiveProcessRuns(user.id, user.personId, 5); // would normally trigger

    const result = await checkWorkspaceReadiness(user.id);

    expect(result.ready).toBe(false);
    expect(result.reason).toBe("already_has_workspace");
  });

  it("returns ready: false when user not found", async () => {
    const result = await checkWorkspaceReadiness("nonexistent-user");

    expect(result.ready).toBe(false);
    expect(result.reason).toBe("user_not_found");
  });

  it("detects keyword signals in recent interactions", async () => {
    const user = createUser();
    createInteractionWithSummary(user.id, user.personId, "Can I see the pipeline of everything?");

    const result = await checkWorkspaceReadiness(user.id);

    expect(result.ready).toBe(true);
    expect(result.reason).toContain("pipeline");
  });

  it("detects batch review keyword", async () => {
    const user = createUser();
    createInteractionWithSummary(user.id, user.personId, "I'd like to do a batch review of all the intros");

    const result = await checkWorkspaceReadiness(user.id);

    expect(result.ready).toBe(true);
    expect(result.reason).toContain("batch review");
  });
});

// ============================================================
// Tests: countActiveProcesses
// ============================================================

describe("countActiveProcesses", () => {
  it("returns 0 when no interactions exist", async () => {
    const user = createUser();
    const count = await countActiveProcesses(user.id);
    expect(count).toBe(0);
  });

  it("counts only running/waiting processes", async () => {
    const user = createUser();

    // Create 2 running + 1 completed
    createActiveProcessRuns(user.id, user.personId, 2);

    const completedRunId = randomUUID();
    testDb.insert(schema.processRuns).values({
      id: completedRunId,
      processId: "test-process",
      status: "approved",
      triggeredBy: "test",
      inputs: {},
    }).run();
    testDb.insert(schema.interactions).values({
      id: randomUUID(),
      userId: user.id,
      personId: user.personId,
      type: "outreach_sent",
      channel: "email",
      mode: "selling",
      processRunId: completedRunId,
    }).run();

    const count = await countActiveProcesses(user.id);
    expect(count).toBe(2);
  });
});

// ============================================================
// Tests: hasLargeGoalDecomposition
// ============================================================

describe("hasLargeGoalDecomposition", () => {
  it("returns false when no goals exist", async () => {
    const user = createUser();
    const result = await hasLargeGoalDecomposition(user.id);
    expect(result).toBe(false);
  });

  it("returns true when goal has 4+ decomposition entries", async () => {
    const user = createUser();
    createGoalWithSubGoals(5);

    const result = await hasLargeGoalDecomposition(user.id);
    expect(result).toBe(true);
  });

  it("returns false when goal has fewer than 4 decomposition entries", async () => {
    const user = createUser();
    createGoalWithSubGoals(3);

    const result = await hasLargeGoalDecomposition(user.id);
    expect(result).toBe(false);
  });
});

// ============================================================
// Tests: hasControlSignals
// ============================================================

describe("hasControlSignals", () => {
  it("returns null when no matching keywords", async () => {
    const user = createUser();
    createInteractionWithSummary(user.id, user.personId, "Thanks for the update, looks good!");

    const result = await hasControlSignals(user.id);
    expect(result).toBeNull();
  });

  it("returns matching keyword when found", async () => {
    const user = createUser();
    createInteractionWithSummary(user.id, user.personId, "Can you show me everything you're working on?");

    const result = await hasControlSignals(user.id);
    expect(result).toBe("show me everything");
  });

  it("is case-insensitive", async () => {
    const user = createUser();
    createInteractionWithSummary(user.id, user.personId, "I want MORE CONTROL over the process");

    const result = await hasControlSignals(user.id);
    expect(result).toBe("more control");
  });
});

// ============================================================
// Tests: composeStatusEmail with workspace suggestion (AC5, AC8)
// ============================================================

describe("composeStatusEmail with workspace suggestion", () => {
  it("weaves suggestion naturally into the body when reason provided", async () => {
    const { composeStatusEmail } = await import("./status-composer");

    const data = {
      userId: "u1",
      userEmail: "test@example.com",
      userName: "Alex",
      personId: "p1",
      newInteractions: 3,
      completedRuns: 1,
      pendingApprovals: 0,
      activeRuns: 3,
      highlights: ["3 new replies received"],
    };

    const { body } = composeStatusEmail(
      data,
      "3 active processes running — a workspace would give you a much better view",
    );

    // AC8: natural, woven in, not a standalone CTA
    expect(body).toContain("By the way");
    expect(body).toContain("3 active processes");
    expect(body).toContain("reply \"yes\"");
    // Should still have the normal sign-off after the suggestion
    expect(body).toContain("Reply to this email");
  });

  it("omits suggestion when no reason provided", async () => {
    const { composeStatusEmail } = await import("./status-composer");

    const data = {
      userId: "u1",
      userEmail: "test@example.com",
      personId: "p1",
      newInteractions: 1,
      completedRuns: 0,
      pendingApprovals: 0,
      activeRuns: 1,
      highlights: ["1 new reply received"],
    };

    const { body } = composeStatusEmail(data);

    expect(body).not.toContain("By the way");
    expect(body).not.toContain("workspace");
  });
});
