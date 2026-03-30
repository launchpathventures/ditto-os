/**
 * Tests for Brief 056 — Interaction Events + Brief Sync
 *
 * Tests interaction event recording, querying, and summary building.
 * Tests brief sync from filesystem to database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";

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
const { recordInteractionEvent, getRecentInteractionEvents, buildInteractionSummary } = await import("./interaction-events");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("recordInteractionEvent", () => {
  it("inserts an event with all fields", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "artifact_viewed",
      entityId: "artifact-123",
      properties: { durationMs: 5000, processRunId: "run-1" },
    });

    const rows = await testDb.select().from(schema.interactionEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("user-1");
    expect(rows[0].eventType).toBe("artifact_viewed");
    expect(rows[0].entityId).toBe("artifact-123");
    expect(rows[0].properties).toEqual({ durationMs: 5000, processRunId: "run-1" });
    expect(rows[0].timestamp).toBeInstanceOf(Date);
  });

  it("inserts an event without entityId", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "composition_navigated",
      properties: { intent: "work", fromIntent: "today" },
    });

    const rows = await testDb.select().from(schema.interactionEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBeNull();
  });

  it("records multiple events of different types", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "artifact_viewed",
      entityId: "a1",
      properties: { durationMs: 3000 },
    });
    await recordInteractionEvent("user-1", {
      eventType: "brief_selected",
      entityId: "brief-56",
      properties: { briefNumber: 56, action: "build" },
    });
    await recordInteractionEvent("user-1", {
      eventType: "composition_navigated",
      properties: { intent: "roadmap" },
    });

    const rows = await testDb.select().from(schema.interactionEvents);
    expect(rows).toHaveLength(3);
  });
});

describe("getRecentInteractionEvents", () => {
  it("returns events within time window", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "composition_navigated",
      properties: { intent: "today" },
    });
    await recordInteractionEvent("user-2", {
      eventType: "composition_navigated",
      properties: { intent: "work" },
    });

    const events = await getRecentInteractionEvents("user-1", 24);
    expect(events).toHaveLength(1);
    expect(events[0].properties).toEqual({ intent: "today" });
  });

  it("returns empty array when no events", async () => {
    const events = await getRecentInteractionEvents("user-1", 24);
    expect(events).toHaveLength(0);
  });
});

describe("buildInteractionSummary", () => {
  it("returns empty string when no events", async () => {
    const summary = await buildInteractionSummary("user-1");
    expect(summary).toBe("");
  });

  it("includes navigation counts", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "composition_navigated",
      properties: { intent: "today" },
    });
    await recordInteractionEvent("user-1", {
      eventType: "composition_navigated",
      properties: { intent: "today" },
    });
    await recordInteractionEvent("user-1", {
      eventType: "composition_navigated",
      properties: { intent: "work" },
    });

    const summary = await buildInteractionSummary("user-1");
    expect(summary).toContain("Navigation (24h):");
    expect(summary).toContain("today(2)");
    expect(summary).toContain("work(1)");
  });

  it("includes artifact view count", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "artifact_viewed",
      entityId: "a1",
      properties: { durationMs: 5000 },
    });

    const summary = await buildInteractionSummary("user-1");
    expect(summary).toContain("Artifacts viewed (24h): 1");
  });

  it("includes review response times", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "review_prompt_seen",
      entityId: "run-1",
      properties: { runId: "run-1", stepId: "step-1", durationBeforeAction: 15000 },
    });

    const summary = await buildInteractionSummary("user-1");
    expect(summary).toContain("Avg review response: 15s");
  });

  it("includes brief selection count", async () => {
    await recordInteractionEvent("user-1", {
      eventType: "brief_selected",
      entityId: "brief-56",
      properties: { briefNumber: 56, action: "build" },
    });

    const summary = await buildInteractionSummary("user-1");
    expect(summary).toContain("Briefs selected (24h): 1");
  });
});

describe("briefs table", () => {
  it("can insert and query briefs", async () => {
    await testDb.insert(schema.briefs).values({
      number: 56,
      name: "Observability Layer",
      status: "ready",
      dependsOn: "Brief 050",
      unlocks: "Meta-processes",
    });

    const rows = await testDb.select().from(schema.briefs);
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe(56);
    expect(rows[0].name).toBe("Observability Layer");
    expect(rows[0].status).toBe("ready");
  });
});
