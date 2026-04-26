/**
 * Runner chain resolution — Brief 215 AC #6 coverage.
 */
import { describe, it, expect } from "vitest";
import { resolveChain } from "./resolution.js";
import type {
  ProjectResolutionRef,
  ProjectRunnerResolutionRef,
  WorkItemResolutionRef,
} from "./resolution.js";
import { type RunnerKind } from "./kinds.js";

const PROJECT_ID = "proj_1";

function project(opts: Partial<ProjectResolutionRef> = {}): ProjectResolutionRef {
  return {
    id: PROJECT_ID,
    defaultRunnerKind: opts.defaultRunnerKind ?? null,
    fallbackRunnerKind: opts.fallbackRunnerKind ?? null,
    runnerChain: opts.runnerChain ?? null,
  };
}

function runner(
  kind: RunnerKind,
  overrides: Partial<ProjectRunnerResolutionRef> = {}
): ProjectRunnerResolutionRef {
  return {
    projectId: PROJECT_ID,
    kind,
    mode: kind === "local-mac-mini" ? "local" : "cloud",
    enabled: true,
    lastHealthStatus: "healthy",
    ...overrides,
  };
}

function workItem(
  overrides: Partial<WorkItemResolutionRef> = {}
): WorkItemResolutionRef {
  return { id: "wi_1", ...overrides };
}

describe("resolveChain", () => {
  it("noEligibleRunner when project has nothing configured and no override", () => {
    const r = resolveChain(workItem(), project(), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("noEligibleRunner");
  });

  it("returns [default, fallback] when no chain JSON and both kinds configured/healthy", () => {
    const r = resolveChain(
      workItem(),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [runner("claude-code-routine"), runner("local-mac-mini")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["claude-code-routine", "local-mac-mini"]);
  });

  it("runner_chain JSON overrides default+fallback", () => {
    const r = resolveChain(
      workItem(),
      project({
        defaultRunnerKind: "claude-code-routine",
        fallbackRunnerKind: "local-mac-mini",
        runnerChain: ["github-action", "claude-managed-agent"],
      }),
      [runner("github-action"), runner("claude-managed-agent")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["github-action", "claude-managed-agent"]);
  });

  it("workItem.runnerOverride is prepended (and deduped if also in chain)", () => {
    const r = resolveChain(
      workItem({ runnerOverride: "local-mac-mini" }),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [runner("local-mac-mini"), runner("claude-code-routine")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["local-mac-mini", "claude-code-routine"]);
  });

  it("mode_required=cloud filters out local-mac-mini", () => {
    const r = resolveChain(
      workItem({ runnerModeRequired: "cloud" }),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [runner("claude-code-routine"), runner("local-mac-mini")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["claude-code-routine"]);
  });

  it("mode_required=local filters out cloud kinds", () => {
    const r = resolveChain(
      workItem({ runnerModeRequired: "local" }),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [runner("claude-code-routine"), runner("local-mac-mini")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["local-mac-mini"]);
  });

  it("mode_required=any imposes no constraint", () => {
    const r = resolveChain(
      workItem({ runnerModeRequired: "any" }),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [runner("claude-code-routine"), runner("local-mac-mini")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["claude-code-routine", "local-mac-mini"]);
  });

  it("modeFilteredEmpty when no chain entries match required mode", () => {
    const r = resolveChain(
      workItem({ runnerModeRequired: "cloud" }),
      project({ defaultRunnerKind: "local-mac-mini" }),
      [runner("local-mac-mini")]
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("modeFilteredEmpty");
  });

  it("disabled project_runners are filtered", () => {
    const r = resolveChain(
      workItem(),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [
        runner("claude-code-routine", { enabled: false }),
        runner("local-mac-mini", { enabled: true }),
      ]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["local-mac-mini"]);
  });

  it("configMissing when chain has kinds without enabled rows", () => {
    const r = resolveChain(
      workItem(),
      project({ defaultRunnerKind: "claude-code-routine" }),
      [] // no project_runners rows
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("configMissing");
  });

  it("unhealthy filtered unless only-option-remaining", () => {
    // healthy peer present → unhealthy filtered out
    const withPeer = resolveChain(
      workItem(),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [
        runner("claude-code-routine", { lastHealthStatus: "rate_limited" }),
        runner("local-mac-mini", { lastHealthStatus: "healthy" }),
      ]
    );
    expect(withPeer.ok).toBe(true);
    if (withPeer.ok) expect(withPeer.chain).toEqual(["local-mac-mini"]);

    // no healthy peer → unhealthy kept (dispatcher will surface)
    const onlyOption = resolveChain(
      workItem(),
      project({ defaultRunnerKind: "claude-code-routine" }),
      [runner("claude-code-routine", { lastHealthStatus: "rate_limited" })]
    );
    expect(onlyOption.ok).toBe(true);
    if (onlyOption.ok) expect(onlyOption.chain).toEqual(["claude-code-routine"]);
  });

  it("`unknown` health is treated as healthy", () => {
    const r = resolveChain(
      workItem(),
      project({ defaultRunnerKind: "claude-code-routine", fallbackRunnerKind: "local-mac-mini" }),
      [
        runner("claude-code-routine", { lastHealthStatus: "unknown" }),
        runner("local-mac-mini", { lastHealthStatus: "healthy" }),
      ]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["claude-code-routine", "local-mac-mini"]);
  });

  it("dedupes when override matches a chain entry", () => {
    const r = resolveChain(
      workItem({ runnerOverride: "local-mac-mini" }),
      project({
        runnerChain: ["local-mac-mini", "claude-code-routine"],
      }),
      [runner("local-mac-mini"), runner("claude-code-routine")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["local-mac-mini", "claude-code-routine"]);
  });

  it("dedupes when chain itself contains duplicates", () => {
    const r = resolveChain(
      workItem(),
      project({
        runnerChain: ["claude-code-routine", "claude-code-routine", "local-mac-mini"],
      }),
      [runner("claude-code-routine"), runner("local-mac-mini")]
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chain).toEqual(["claude-code-routine", "local-mac-mini"]);
  });
});
