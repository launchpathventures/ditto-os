/**
 * poll-cadences tests — Brief 217 §D10.
 */

import { describe, it, expect } from "vitest";
import {
  pollCadenceMs,
  getPollCadenceMs,
  pollableKinds,
} from "./poll-cadences.js";

describe("pollCadenceMs", () => {
  it("registers claude-managed-agent at 30s (parent §D11)", () => {
    expect(pollCadenceMs["claude-managed-agent"]).toBe(30_000);
  });

  it("registers github-action at 60s (Brief 218 §D11 — webhook-primary, polling backup)", () => {
    expect(pollCadenceMs["github-action"]).toBe(60_000);
  });

  it("does NOT register claude-code-routine — Brief 216 deviation per §What Changes", () => {
    expect(pollCadenceMs["claude-code-routine"]).toBeUndefined();
  });

  it("does NOT register local-mac-mini — local kind, no live API", () => {
    expect(pollCadenceMs["local-mac-mini"]).toBeUndefined();
  });
});

describe("getPollCadenceMs", () => {
  it("returns the cadence for claude-managed-agent", () => {
    expect(getPollCadenceMs("claude-managed-agent")).toBe(30_000);
  });

  it("returns the cadence for github-action (Brief 218)", () => {
    expect(getPollCadenceMs("github-action")).toBe(60_000);
  });

  it("returns null for unregistered kinds", () => {
    expect(getPollCadenceMs("claude-code-routine")).toBeNull();
    expect(getPollCadenceMs("local-mac-mini")).toBeNull();
  });
});

describe("pollableKinds", () => {
  it("lists only kinds with a registered cadence", () => {
    const kinds = pollableKinds();
    expect(kinds).toContain("claude-managed-agent");
    expect(kinds).toContain("github-action");
    expect(kinds).not.toContain("claude-code-routine");
    expect(kinds).not.toContain("local-mac-mini");
  });
});
