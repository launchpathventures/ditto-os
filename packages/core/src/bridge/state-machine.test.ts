/**
 * Bridge state machine — exhaustive transition coverage.
 *
 * Brief 212 AC #2: legal-transition table is exhaustive; illegal transitions
 * (notably the revoked → succeeded race) return an error result.
 */
import { describe, it, expect } from "vitest";
import {
  transition,
  isTerminal,
  bridgeJobStateValues,
  bridgeJobEventValues,
  type BridgeJobState,
  type BridgeJobEvent,
} from "./state-machine.js";

const TERMINAL: BridgeJobState[] = ["succeeded", "failed", "orphaned", "cancelled", "revoked"];

describe("bridge state machine", () => {
  it("legal transitions from queued", () => {
    expect(transition("queued", "dispatch")).toEqual({ ok: true, to: "dispatched" });
    expect(transition("queued", "cancel")).toEqual({ ok: true, to: "cancelled" });
    expect(transition("queued", "revoke")).toEqual({ ok: true, to: "revoked" });
  });

  it("legal transitions from dispatched", () => {
    expect(transition("dispatched", "first-frame")).toEqual({ ok: true, to: "running" });
    expect(transition("dispatched", "cancel")).toEqual({ ok: true, to: "cancelled" });
    expect(transition("dispatched", "revoke")).toEqual({ ok: true, to: "revoked" });
  });

  it("legal transitions from running", () => {
    expect(transition("running", "succeed")).toEqual({ ok: true, to: "succeeded" });
    expect(transition("running", "fail")).toEqual({ ok: true, to: "failed" });
    expect(transition("running", "stale")).toEqual({ ok: true, to: "orphaned" });
    expect(transition("running", "cancel")).toEqual({ ok: true, to: "cancelled" });
    expect(transition("running", "revoke")).toEqual({ ok: true, to: "revoked" });
  });

  it("rejects illegal transitions from queued", () => {
    for (const ev of ["first-frame", "succeed", "fail", "stale"] as BridgeJobEvent[]) {
      const r = transition("queued", ev);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("illegal-transition");
    }
  });

  it("rejects illegal transitions from dispatched", () => {
    for (const ev of ["dispatch", "succeed", "fail", "stale"] as BridgeJobEvent[]) {
      const r = transition("dispatched", ev);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("illegal-transition");
    }
  });

  it("rejects illegal transitions from running", () => {
    for (const ev of ["dispatch", "first-frame"] as BridgeJobEvent[]) {
      const r = transition("running", ev);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("illegal-transition");
    }
  });

  it("revoked → succeeded race is rejected (AC #2 explicit case)", () => {
    const r = transition("revoked", "succeed");
    expect(r).toEqual({
      ok: false,
      reason: "terminal-state",
      from: "revoked",
      event: "succeed",
    });
  });

  it("rejects ALL events from every terminal state", () => {
    for (const from of TERMINAL) {
      for (const ev of bridgeJobEventValues) {
        const r = transition(from, ev);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.reason).toBe("terminal-state");
          expect(r.from).toBe(from);
          expect(r.event).toBe(ev);
        }
      }
    }
  });

  it("isTerminal classifies all 8 states correctly", () => {
    const expected: Record<BridgeJobState, boolean> = {
      queued: false,
      dispatched: false,
      running: false,
      succeeded: true,
      failed: true,
      orphaned: true,
      cancelled: true,
      revoked: true,
    };
    for (const s of bridgeJobStateValues) {
      expect(isTerminal(s)).toBe(expected[s]);
    }
  });

  it("every (state, event) pair has a defined outcome (legal or rejected)", () => {
    // Sanity — no transition() call should ever throw or hang.
    for (const from of bridgeJobStateValues) {
      for (const ev of bridgeJobEventValues) {
        const r = transition(from, ev);
        expect(typeof r.ok).toBe("boolean");
      }
    }
  });
});
