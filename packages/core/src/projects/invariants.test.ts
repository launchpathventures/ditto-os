/**
 * Project status-transition invariants — Brief 215 AC #18 coverage.
 */
import { describe, it, expect } from "vitest";
import {
  validateStatusTransition,
  type ProjectInvariantSnapshot,
} from "./invariants.js";
import type { RunnerKind } from "../runner/index.js";

function snapshot(opts: {
  defaultRunnerKind?: RunnerKind | null;
  enabled?: RunnerKind[];
}): ProjectInvariantSnapshot {
  return {
    defaultRunnerKind: opts.defaultRunnerKind ?? null,
    enabledRunnerKinds: new Set(opts.enabled ?? []),
  };
}

describe("validateStatusTransition", () => {
  it("rejects analysing → active when defaultRunnerKind is null", () => {
    const r = validateStatusTransition("analysing", "active", snapshot({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("needs-default-runner");
  });

  it("rejects analysing → active when default kind has no enabled row", () => {
    const r = validateStatusTransition(
      "analysing",
      "active",
      snapshot({ defaultRunnerKind: "claude-code-routine", enabled: [] })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("default-runner-not-enabled");
  });

  it("accepts analysing → active when invariants satisfied", () => {
    const r = validateStatusTransition(
      "analysing",
      "active",
      snapshot({
        defaultRunnerKind: "local-mac-mini",
        enabled: ["local-mac-mini"],
      })
    );
    expect(r.ok).toBe(true);
  });

  it("rejects archived → active (one-way archive)", () => {
    const r = validateStatusTransition(
      "archived",
      "active",
      snapshot({ defaultRunnerKind: "local-mac-mini", enabled: ["local-mac-mini"] })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("archive-is-one-way");
  });

  it("rejects archived → paused (one-way archive)", () => {
    const r = validateStatusTransition("archived", "paused", snapshot({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("archive-is-one-way");
  });

  it("accepts active → paused (no runner check needed)", () => {
    const r = validateStatusTransition("active", "paused", snapshot({}));
    expect(r.ok).toBe(true);
  });

  it("accepts paused → active when invariants hold", () => {
    const r = validateStatusTransition(
      "paused",
      "active",
      snapshot({
        defaultRunnerKind: "local-mac-mini",
        enabled: ["local-mac-mini"],
      })
    );
    expect(r.ok).toBe(true);
  });

  it("accepts active → archived (one-way archive entry)", () => {
    const r = validateStatusTransition("active", "archived", snapshot({}));
    expect(r.ok).toBe(true);
  });

  it("no-op transitions (same state) are accepted", () => {
    const r = validateStatusTransition("active", "active", snapshot({}));
    expect(r.ok).toBe(true);
  });

  // Brief 225 — Cancel and Don't-onboard paths flip analysing → archived.
  it("accepts analysing → archived (Brief 225 Cancel + Don't-onboard regression guard)", () => {
    const r = validateStatusTransition("analysing", "archived", snapshot({}));
    expect(r.ok).toBe(true);
  });
});
