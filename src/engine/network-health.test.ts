/**
 * Network Health Evaluator tests (Brief 293)
 *
 * Pure-module tests — no DB, no mocking. Cover each of the 8 v1 rules,
 * the precedence (suppress > queue-for-review > downgrade > pass), and
 * the audit-trail invariant (every triggered rule appears in `reasons`).
 */

import { describe, expect, it } from "vitest";
import type { NetworkHealthSignal } from "./connection-proposal";
import {
  NETWORK_HEALTH_RULE_IDS,
  evaluateNetworkHealth,
  summarizeNetworkHealth,
} from "./network-health";

function baseInput(overrides: Partial<Parameters<typeof evaluateNetworkHealth>[0]> = {}) {
  return {
    signal: {} as NetworkHealthSignal,
    confidence: "medium" as const,
    ...overrides,
  };
}

describe("evaluateNetworkHealth", () => {
  it("passes when no rule fires", () => {
    const result = evaluateNetworkHealth(baseInput());
    expect(result.kind).toBe("pass");
    expect(result.reasons).toHaveLength(0);
    expect(result.downgradedConfidence).toBeNull();
  });

  it("suppresses on explicit block (rule 1)", () => {
    const result = evaluateNetworkHealth(baseInput({ signal: { blocked: true } }));
    expect(result.kind).toBe("suppress");
    expect(result.reasons.map((r) => r.ruleId)).toContain("blocked");
  });

  it("suppresses on anti-persona match (rule 2)", () => {
    const result = evaluateNetworkHealth(
      baseInput({ signal: { antiPersonaRisk: true } }),
    );
    expect(result.kind).toBe("suppress");
    expect(result.reasons.map((r) => r.ruleId)).toContain("anti-persona");
  });

  it("suppresses on over-contact (rule 3) — high-demand, recently-contacted, or overContact", () => {
    for (const flag of ["highDemand", "recentlyContacted", "overContact"] as const) {
      const result = evaluateNetworkHealth(
        baseInput({ signal: { [flag]: true } as NetworkHealthSignal }),
      );
      expect(result.kind).toBe("suppress");
      expect(result.reasons.map((r) => r.ruleId)).toContain("over-contact");
    }
  });

  it("suppresses when requester is over their outstanding-ask ceiling (rule 4)", () => {
    const result = evaluateNetworkHealth(
      baseInput({ requesterOutstandingAskCount: 5, requesterOutstandingAskCeiling: 5 }),
    );
    expect(result.kind).toBe("suppress");
    expect(result.reasons.map((r) => r.ruleId)).toContain("requester-over-asking");
  });

  it("suppresses on duplicate cooldown (rule 5)", () => {
    const result = evaluateNetworkHealth(
      baseInput({ signal: { duplicateCooldown: true } }),
    );
    expect(result.kind).toBe("suppress");
    expect(result.reasons.map((r) => r.ruleId)).toContain("duplicate-cooldown");
  });

  it("downgrades on stale evidence (rule 6) — does NOT suppress", () => {
    const result = evaluateNetworkHealth(
      baseInput({ confidence: "high", evidenceMaxAgeDays: 90 }),
    );
    expect(result.kind).toBe("downgrade");
    expect(result.downgradedConfidence).toBe("medium");
    expect(result.reasons.map((r) => r.ruleId)).toContain("stale-evidence");
  });

  it("queues for review on commercial sensitivity (rule 7)", () => {
    const result = evaluateNetworkHealth(baseInput({ commercialSensitive: true }));
    expect(result.kind).toBe("queue-for-review");
    expect(result.reasons.map((r) => r.ruleId)).toContain("commercial-sensitive");
  });

  it("suppresses low-confidence proposals unless broad exploration is enabled (rule 8)", () => {
    const blocked = evaluateNetworkHealth(baseInput({ confidence: "low" }));
    expect(blocked.kind).toBe("suppress");
    expect(blocked.reasons.map((r) => r.ruleId)).toContain("low-confidence");

    const allowed = evaluateNetworkHealth(
      baseInput({ confidence: "low", broadExploration: true }),
    );
    expect(allowed.kind).toBe("pass");
  });

  it("precedence: suppress wins over queue-for-review wins over downgrade", () => {
    const all = evaluateNetworkHealth(
      baseInput({
        signal: {
          blocked: true,
          staleEvidence: true,
        },
        commercialSensitive: true,
        confidence: "high",
      }),
    );
    // suppress wins; downgrade + queue-for-review still recorded in reasons.
    expect(all.kind).toBe("suppress");
    const ids = all.reasons.map((r) => r.ruleId);
    expect(ids).toEqual(
      expect.arrayContaining(["blocked", "stale-evidence", "commercial-sensitive"]),
    );

    const noSuppress = evaluateNetworkHealth(
      baseInput({
        commercialSensitive: true,
        signal: { staleEvidence: true },
        confidence: "high",
      }),
    );
    expect(noSuppress.kind).toBe("queue-for-review");
  });

  it("exposes all 8 rule ids on NETWORK_HEALTH_RULE_IDS", () => {
    expect(NETWORK_HEALTH_RULE_IDS).toHaveLength(8);
    expect(new Set(NETWORK_HEALTH_RULE_IDS).size).toBe(8);
  });
});

describe("summarizeNetworkHealth", () => {
  it("tallies per-decision counts and rule hits across a run", () => {
    const decisions = [
      evaluateNetworkHealth(baseInput()),
      evaluateNetworkHealth(baseInput({ signal: { blocked: true } })),
      evaluateNetworkHealth(baseInput({ confidence: "high", evidenceMaxAgeDays: 90 })),
      evaluateNetworkHealth(baseInput({ commercialSensitive: true })),
    ];
    const summary = summarizeNetworkHealth(decisions);
    expect(summary.counts.pass).toBe(1);
    expect(summary.counts.suppress).toBe(1);
    expect(summary.counts.downgrade).toBe(1);
    expect(summary.counts["queue-for-review"]).toBe(1);
    expect(summary.ruleHits["blocked"]).toBe(1);
    expect(summary.ruleHits["stale-evidence"]).toBe(1);
    expect(summary.ruleHits["commercial-sensitive"]).toBe(1);
  });
});
