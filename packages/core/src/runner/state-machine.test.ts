/**
 * Runner dispatch state machine — exhaustive transition coverage.
 *
 * Brief 215 AC #5: legal/illegal transitions covered; happy path
 * queued→dispatched→running→succeeded; rejection of revoked→succeeded;
 * `reset` only valid from terminal states.
 */
import { describe, it, expect } from "vitest";
import {
  transitionDispatch,
  isTerminalDispatchStatus,
  runnerDispatchEventValues,
} from "./state-machine.js";
import {
  runnerDispatchStatusValues,
  type RunnerDispatchStatus,
} from "./kinds.js";

const TERMINAL: RunnerDispatchStatus[] = [
  "succeeded",
  "failed",
  "timed_out",
  "rate_limited",
  "cancelled",
  "revoked",
];

describe("runner dispatch state machine", () => {
  describe("happy path", () => {
    it("queued → dispatched → running → succeeded", () => {
      expect(transitionDispatch("queued", "dispatch")).toEqual({ ok: true, to: "dispatched" });
      expect(transitionDispatch("dispatched", "start")).toEqual({ ok: true, to: "running" });
      expect(transitionDispatch("running", "succeed")).toEqual({ ok: true, to: "succeeded" });
    });
  });

  describe("legal transitions from queued", () => {
    it("dispatch / fail / cancel / revoke", () => {
      expect(transitionDispatch("queued", "dispatch")).toEqual({ ok: true, to: "dispatched" });
      expect(transitionDispatch("queued", "fail")).toEqual({ ok: true, to: "failed" });
      expect(transitionDispatch("queued", "cancel")).toEqual({ ok: true, to: "cancelled" });
      expect(transitionDispatch("queued", "revoke")).toEqual({ ok: true, to: "revoked" });
    });
  });

  describe("legal transitions from dispatched", () => {
    it("start / fail / cancel / revoke / rate_limit / timeout", () => {
      expect(transitionDispatch("dispatched", "start")).toEqual({ ok: true, to: "running" });
      expect(transitionDispatch("dispatched", "fail")).toEqual({ ok: true, to: "failed" });
      expect(transitionDispatch("dispatched", "cancel")).toEqual({ ok: true, to: "cancelled" });
      expect(transitionDispatch("dispatched", "revoke")).toEqual({ ok: true, to: "revoked" });
      expect(transitionDispatch("dispatched", "rate_limit")).toEqual({ ok: true, to: "rate_limited" });
      expect(transitionDispatch("dispatched", "timeout")).toEqual({ ok: true, to: "timed_out" });
    });
  });

  describe("legal transitions from running", () => {
    it("succeed / fail / timeout / rate_limit / cancel / revoke", () => {
      expect(transitionDispatch("running", "succeed")).toEqual({ ok: true, to: "succeeded" });
      expect(transitionDispatch("running", "fail")).toEqual({ ok: true, to: "failed" });
      expect(transitionDispatch("running", "timeout")).toEqual({ ok: true, to: "timed_out" });
      expect(transitionDispatch("running", "rate_limit")).toEqual({ ok: true, to: "rate_limited" });
      expect(transitionDispatch("running", "cancel")).toEqual({ ok: true, to: "cancelled" });
      expect(transitionDispatch("running", "revoke")).toEqual({ ok: true, to: "revoked" });
    });
  });

  describe("distinct cloud failure shapes", () => {
    it("running → rate_limited and running → timed_out are distinct terminals", () => {
      expect(transitionDispatch("running", "rate_limit")).toEqual({ ok: true, to: "rate_limited" });
      expect(transitionDispatch("running", "timeout")).toEqual({ ok: true, to: "timed_out" });
      expect(isTerminalDispatchStatus("rate_limited")).toBe(true);
      expect(isTerminalDispatchStatus("timed_out")).toBe(true);
    });
  });

  describe("revoked is terminal one-way", () => {
    it("rejects revoked → succeeded (late frame race)", () => {
      const r = transitionDispatch("revoked", "succeed");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.from).toBe("revoked");
        expect(r.event).toBe("succeed");
      }
    });

    it("rejects revoked → reset (one-way)", () => {
      const r = transitionDispatch("revoked", "reset");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("revoked-terminal");
    });
  });

  describe("reset valid from non-revoked terminal states only", () => {
    it("succeeded / failed / timed_out / rate_limited / cancelled → queued", () => {
      const resettable: RunnerDispatchStatus[] = [
        "succeeded",
        "failed",
        "timed_out",
        "rate_limited",
        "cancelled",
      ];
      for (const from of resettable) {
        expect(transitionDispatch(from, "reset")).toEqual({ ok: true, to: "queued" });
      }
    });

    it("rejects reset from non-terminal states", () => {
      const nonTerminal: RunnerDispatchStatus[] = ["queued", "dispatched", "running"];
      for (const from of nonTerminal) {
        const r = transitionDispatch(from, "reset");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("non-terminal-reset");
      }
    });
  });

  describe("isTerminalDispatchStatus correctness", () => {
    it("terminal states", () => {
      for (const s of TERMINAL) expect(isTerminalDispatchStatus(s)).toBe(true);
    });

    it("non-terminal states", () => {
      for (const s of ["queued", "dispatched", "running"] as const) {
        expect(isTerminalDispatchStatus(s)).toBe(false);
      }
    });
  });

  describe("exhaustive coverage", () => {
    it("every state ∈ runnerDispatchStatusValues is reachable in the table", () => {
      // Smoke that the transition function handles every state without throwing.
      for (const from of runnerDispatchStatusValues) {
        for (const event of runnerDispatchEventValues) {
          const r = transitionDispatch(from, event);
          expect(typeof r.ok).toBe("boolean");
        }
      }
    });
  });
});
