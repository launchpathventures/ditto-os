/**
 * webhook-schema tests — Brief 216 AC #7 + Brief 217 AC #5 + cross-runner sanity.
 *
 * Verifies:
 *  - claude-code-routine variant accepts a valid payload
 *  - claude-managed-agent variant accepts a valid payload (Brief 217 §D10)
 *  - rejects on missing required fields, unknown state values, malformed prUrl
 *  - local-mac-mini envelope still parses (non-regression on Brief 215)
 *  - state-mapping function returns the documented runner_dispatches.status
 *  - the kind-agnostic helper alias (cloudRunnerStateToDispatchStatus) is
 *    identical to routineStateToDispatchStatus (Brief 217 §D14 rename)
 */

import { describe, it, expect } from "vitest";
import {
  runnerWebhookSchema,
  routineStateToDispatchStatus,
  cloudRunnerStateToDispatchStatus,
} from "./webhook-schema.js";

describe("runnerWebhookSchema — claude-code-routine", () => {
  const happy = {
    runner_kind: "claude-code-routine" as const,
    state: "succeeded" as const,
    prUrl: "https://github.com/owner/repo/pull/42",
    stepRunId: "sr_01abc",
    externalRunId: "session_01xyz",
  };

  it("accepts a happy-path payload", () => {
    const r = runnerWebhookSchema.safeParse(happy);
    expect(r.success).toBe(true);
  });

  it("accepts a minimal payload (no prUrl, no error)", () => {
    const r = runnerWebhookSchema.safeParse({
      runner_kind: "claude-code-routine",
      state: "running",
      stepRunId: "sr_01abc",
      externalRunId: "session_01xyz",
    });
    expect(r.success).toBe(true);
  });

  it("rejects on missing stepRunId", () => {
    const { stepRunId: _omit, ...partial } = happy;
    void _omit;
    const r = runnerWebhookSchema.safeParse(partial);
    expect(r.success).toBe(false);
  });

  it("rejects on missing externalRunId", () => {
    const { externalRunId: _omit, ...partial } = happy;
    void _omit;
    const r = runnerWebhookSchema.safeParse(partial);
    expect(r.success).toBe(false);
  });

  it("rejects on unknown state value", () => {
    const r = runnerWebhookSchema.safeParse({
      ...happy,
      state: "exploded",
    });
    expect(r.success).toBe(false);
  });

  it("rejects on malformed prUrl", () => {
    const r = runnerWebhookSchema.safeParse({
      ...happy,
      prUrl: "not a url",
    });
    expect(r.success).toBe(false);
  });

  it("rejects on missing runner_kind discriminator", () => {
    const { runner_kind: _omit, ...partial } = happy;
    void _omit;
    const r = runnerWebhookSchema.safeParse(partial);
    expect(r.success).toBe(false);
  });
});

describe("runnerWebhookSchema — claude-managed-agent (Brief 217 §D10)", () => {
  const happy = {
    runner_kind: "claude-managed-agent" as const,
    state: "succeeded" as const,
    prUrl: "https://github.com/owner/repo/pull/42",
    stepRunId: "sr_01abc",
    externalRunId: "session_01xyz",
  };

  it("accepts a happy-path payload", () => {
    const r = runnerWebhookSchema.safeParse(happy);
    expect(r.success).toBe(true);
  });

  it("accepts a minimal payload (no prUrl, no error)", () => {
    const r = runnerWebhookSchema.safeParse({
      runner_kind: "claude-managed-agent",
      state: "running",
      stepRunId: "sr_01abc",
      externalRunId: "session_01xyz",
    });
    expect(r.success).toBe(true);
  });

  it("rejects on missing stepRunId", () => {
    const { stepRunId: _omit, ...partial } = happy;
    void _omit;
    const r = runnerWebhookSchema.safeParse(partial);
    expect(r.success).toBe(false);
  });

  it("rejects on missing externalRunId", () => {
    const { externalRunId: _omit, ...partial } = happy;
    void _omit;
    const r = runnerWebhookSchema.safeParse(partial);
    expect(r.success).toBe(false);
  });

  it("rejects on unknown state value", () => {
    const r = runnerWebhookSchema.safeParse({ ...happy, state: "exploded" });
    expect(r.success).toBe(false);
  });

  it("rejects on malformed prUrl", () => {
    const r = runnerWebhookSchema.safeParse({ ...happy, prUrl: "not a url" });
    expect(r.success).toBe(false);
  });

  it("does NOT accept the legacy { dispatch_id, payload } envelope shape", () => {
    // Brief 217 §D10 — placeholder `payload: z.unknown()` wrapper is dropped.
    const r = runnerWebhookSchema.safeParse({
      runner_kind: "claude-managed-agent",
      dispatch_id: "d_01",
      payload: { whatever: true },
    });
    expect(r.success).toBe(false);
  });
});

describe("runnerWebhookSchema — local-mac-mini regression", () => {
  it("still accepts the Brief 212 envelope shape", () => {
    const r = runnerWebhookSchema.safeParse({
      runner_kind: "local-mac-mini",
      dispatch_id: "dispatch_01abc",
      payload: {
        jobId: "job_01abc",
        exitCode: 0,
        durationMs: 1234,
        stdoutBytes: 42,
        stderrBytes: 0,
        truncated: false,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("routineStateToDispatchStatus", () => {
  it("maps running → running", () => {
    expect(routineStateToDispatchStatus("running")).toBe("running");
  });

  it("maps succeeded → succeeded", () => {
    expect(routineStateToDispatchStatus("succeeded")).toBe("succeeded");
  });

  it("maps cancelled → cancelled", () => {
    expect(routineStateToDispatchStatus("cancelled")).toBe("cancelled");
  });

  it("maps failed without error → failed", () => {
    expect(routineStateToDispatchStatus("failed")).toBe("failed");
  });

  it("maps failed + 'rate limit' error → rate_limited", () => {
    expect(routineStateToDispatchStatus("failed", "rate limit exceeded")).toBe(
      "rate_limited",
    );
    expect(routineStateToDispatchStatus("failed", "Rate-Limit hit")).toBe(
      "rate_limited",
    );
  });

  it("maps failed + 'timeout' error → timed_out", () => {
    expect(routineStateToDispatchStatus("failed", "request timed out")).toBe(
      "timed_out",
    );
    expect(routineStateToDispatchStatus("failed", "Timeout reached")).toBe(
      "timed_out",
    );
  });

  it("maps failed + generic error → failed", () => {
    expect(routineStateToDispatchStatus("failed", "auth blew up")).toBe("failed");
  });
});

describe("cloudRunnerStateToDispatchStatus (kind-agnostic alias, Brief 217 §D14)", () => {
  it("is the same function as routineStateToDispatchStatus", () => {
    expect(cloudRunnerStateToDispatchStatus).toBe(routineStateToDispatchStatus);
  });

  it("produces identical mappings", () => {
    expect(cloudRunnerStateToDispatchStatus("succeeded")).toBe("succeeded");
    expect(cloudRunnerStateToDispatchStatus("failed", "rate limit")).toBe(
      "rate_limited",
    );
    expect(cloudRunnerStateToDispatchStatus("failed", "timed out")).toBe(
      "timed_out",
    );
  });
});
