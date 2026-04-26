/**
 * Brief 223 — work-items brief-equivalent validators (Zod, no DB).
 */
import { describe, it, expect } from "vitest";
import {
  briefStateSchema,
  workItemBriefInputSchema,
  workItemStatusUpdateSchema,
} from "./brief-validation.js";

describe("briefStateSchema", () => {
  it("accepts canonical brief states", () => {
    for (const s of [
      "backlog",
      "approved",
      "active",
      "review",
      "shipped",
      "blocked",
      "archived",
    ] as const) {
      expect(briefStateSchema.parse(s)).toBe(s);
    }
  });

  it("rejects unknown states", () => {
    expect(() => briefStateSchema.parse("intake")).toThrow();
    expect(() => briefStateSchema.parse("done")).toThrow();
  });
});

describe("workItemBriefInputSchema", () => {
  it("accepts a minimal valid input", () => {
    const r = workItemBriefInputSchema.parse({
      projectId: "proj-1",
      type: "feature",
      title: "Add bearer rotation",
      body: "Rotate the runner bearer atomically with audit row.",
    });
    expect(r.title).toBe("Add bearer rotation");
  });

  it("rejects empty title or body", () => {
    expect(() =>
      workItemBriefInputSchema.parse({
        projectId: "p",
        type: "fix",
        title: "",
        body: "x",
      }),
    ).toThrow();
  });

  it("clamps risk score range", () => {
    expect(() =>
      workItemBriefInputSchema.parse({
        projectId: "p",
        type: "fix",
        title: "t",
        body: "b",
        riskScore: 101,
      }),
    ).toThrow();
    expect(() =>
      workItemBriefInputSchema.parse({
        projectId: "p",
        type: "fix",
        title: "t",
        body: "b",
        riskScore: -1,
      }),
    ).toThrow();
  });

  it("clamps confidence to 0–1", () => {
    expect(() =>
      workItemBriefInputSchema.parse({
        projectId: "p",
        type: "fix",
        title: "t",
        body: "b",
        confidence: 1.5,
      }),
    ).toThrow();
  });
});

describe("workItemStatusUpdateSchema", () => {
  it("accepts payload without stepRunId (waiver path)", () => {
    const r = workItemStatusUpdateSchema.parse({ state: "shipped" });
    expect(r.state).toBe("shipped");
    expect(r.stepRunId).toBeUndefined();
  });

  it("accepts payload with stepRunId + dispatch refs", () => {
    const r = workItemStatusUpdateSchema.parse({
      state: "active",
      stepRunId: "step-1",
      runnerKind: "claude-code-routine",
      externalRunId: "ext-1",
    });
    expect(r.runnerKind).toBe("claude-code-routine");
  });

  it("rejects invalid state", () => {
    expect(() =>
      workItemStatusUpdateSchema.parse({ state: "intake" }),
    ).toThrow();
  });

  it("rejects malformed prUrl", () => {
    expect(() =>
      workItemStatusUpdateSchema.parse({
        state: "review",
        prUrl: "not-a-url",
      }),
    ).toThrow();
  });
});
