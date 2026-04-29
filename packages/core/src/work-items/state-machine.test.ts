/**
 * Brief 220 AC #2 — exhaustive transition matrix tests for the brief-state
 * state machine. Verifies the deploy-gate arc + retry path + non-deploy
 * preservation per Brief 220 §D1.
 */

import { describe, expect, it } from "vitest";

import { briefStateValues } from "../db/schema.js";
import {
  BRIEF_STATE_TRANSITIONS,
  transitionBriefState,
} from "./state-machine.js";

describe("BRIEF_STATE_TRANSITIONS", () => {
  it("covers every BriefState value (no missing source state)", () => {
    for (const state of briefStateValues) {
      expect(BRIEF_STATE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it("never references an unknown target state", () => {
    const valid = new Set<string>(briefStateValues);
    for (const [from, targets] of Object.entries(BRIEF_STATE_TRANSITIONS)) {
      for (const t of targets) {
        expect(
          valid.has(t),
          `${from} → ${t} references unknown state`,
        ).toBe(true);
      }
    }
  });
});

describe("transitionBriefState — deploy-gate arc (Brief 220 §D1)", () => {
  it("admits shipped → deploying (happy-path entry)", () => {
    expect(transitionBriefState("shipped", "deploying")).toEqual({
      ok: true,
      to: "deploying",
    });
  });

  it("admits shipped → deployed (out-of-order webhook delivery — Reviewer-fix H3)", () => {
    expect(transitionBriefState("shipped", "deployed")).toEqual({
      ok: true,
      to: "deployed",
    });
  });

  it("admits shipped → deploy_failed (out-of-order webhook delivery — Reviewer-fix H3)", () => {
    expect(transitionBriefState("shipped", "deploy_failed")).toEqual({
      ok: true,
      to: "deploy_failed",
    });
  });

  it("admits shipped → archived (non-deploy-gated projects — Reviewer-fix H4)", () => {
    expect(transitionBriefState("shipped", "archived")).toEqual({
      ok: true,
      to: "archived",
    });
  });

  it("admits deploying → deployed (happy-path success)", () => {
    expect(transitionBriefState("deploying", "deployed")).toEqual({
      ok: true,
      to: "deployed",
    });
  });

  it("admits deploying → deploy_failed (happy-path failure/error)", () => {
    expect(transitionBriefState("deploying", "deploy_failed")).toEqual({
      ok: true,
      to: "deploy_failed",
    });
  });

  it("admits deploy_failed → deploying (retry)", () => {
    expect(transitionBriefState("deploy_failed", "deploying")).toEqual({
      ok: true,
      to: "deploying",
    });
  });

  it("admits deploy_failed → deployed (out-of-order retry success)", () => {
    expect(transitionBriefState("deploy_failed", "deployed")).toEqual({
      ok: true,
      to: "deployed",
    });
  });

  it("admits deployed → archived (terminal close-out)", () => {
    expect(transitionBriefState("deployed", "archived")).toEqual({
      ok: true,
      to: "archived",
    });
  });

  it("admits deploy_failed → archived (user gives up)", () => {
    expect(transitionBriefState("deploy_failed", "archived")).toEqual({
      ok: true,
      to: "archived",
    });
  });
});

describe("transitionBriefState — illegal deploy-gate transitions", () => {
  it("rejects deployed → shipped (no retreat)", () => {
    expect(transitionBriefState("deployed", "shipped")).toEqual({
      ok: false,
      reason: "illegal-transition",
      from: "deployed",
      attempted: "shipped",
    });
  });

  it("rejects deployed → deploying (no re-deploy from deployed)", () => {
    expect(transitionBriefState("deployed", "deploying")).toEqual({
      ok: false,
      reason: "illegal-transition",
      from: "deployed",
      attempted: "deploying",
    });
  });

  it("rejects deployed → blocked (post-deploy issues are new work items)", () => {
    expect(transitionBriefState("deployed", "blocked")).toEqual({
      ok: false,
      reason: "illegal-transition",
      from: "deployed",
      attempted: "blocked",
    });
  });

  it("rejects deployed → deploy_failed", () => {
    expect(transitionBriefState("deployed", "deploy_failed")).toEqual({
      ok: false,
      reason: "illegal-transition",
      from: "deployed",
      attempted: "deploy_failed",
    });
  });

  it("rejects archived → anything (terminal)", () => {
    for (const target of briefStateValues) {
      const r = transitionBriefState("archived", target);
      expect(r.ok).toBe(false);
      if (r.ok === false) {
        expect(r.reason).toBe("terminal-state");
      }
    }
  });

  it("rejects idempotent self-transitions (deploying → deploying)", () => {
    // Replay-rejection: webhook handler relies on this to audit duplicates.
    expect(transitionBriefState("deploying", "deploying")).toEqual({
      ok: false,
      reason: "illegal-transition",
      from: "deploying",
      attempted: "deploying",
    });
  });
});

describe("transitionBriefState — Brief 223 non-deploy semantics preserved", () => {
  // Smoke-test the Brief-223-era arcs to ensure this brief didn't regress them.
  const cases: Array<[string, "ok" | "no", string, string]> = [
    ["backlog → approved", "ok", "backlog", "approved"],
    ["backlog → blocked", "ok", "backlog", "blocked"],
    ["backlog → archived", "ok", "backlog", "archived"],
    ["approved → active", "ok", "approved", "active"],
    ["active → review", "ok", "active", "review"],
    ["review → shipped", "ok", "review", "shipped"],
    ["review → blocked", "ok", "review", "blocked"],
    ["blocked → approved", "ok", "blocked", "approved"],
    ["blocked → active", "ok", "blocked", "active"],
    ["backlog → review (skip)", "no", "backlog", "review"],
    ["approved → shipped (skip)", "no", "approved", "shipped"],
    ["active → deployed (skip)", "no", "active", "deployed"],
  ];
  for (const [label, expected, from, to] of cases) {
    it(label, () => {
      const r = transitionBriefState(from as never, to as never);
      expect(r.ok).toBe(expected === "ok");
    });
  }
});
