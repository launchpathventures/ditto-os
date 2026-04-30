/**
 * Brief 226 — Persona-fit scoring.
 *
 * Maps detected stack signals to a USER-FACING DESCRIPTOR string only.
 * Internal persona-shape vocabulary stays inside this module — never
 * exported. Per Reviewer Critical #4 on the Designer's spec, the user
 * surface MUST NOT carry persona names ("Jordan-shaped" etc.).
 *
 * Type-system enforcement (Brief 226 §Constraints — IMPORTANT #8):
 *   `scorePersonaFit(signals)` returns ONLY `{ descriptor: string }`.
 *   Internal labels are NOT part of the public surface. A unit test
 *   asserts the descriptor never matches the internal-label pattern.
 */

import type { StackSignals } from "@ditto/core";

/**
 * Internal scoring rubric — keys are the internal persona-shape labels
 * (NOT exported). Each entry pairs a signal predicate with the user-facing
 * descriptor returned when the predicate fires.
 *
 * Order matters: the FIRST predicate that matches wins.
 */
interface ShapeRule {
  /** Internal label — used only in this module's logs / testing. */
  internalLabel: string;
  /** True when the signals match this shape. */
  matches: (signals: StackSignals) => boolean;
  /** User-facing descriptor — must NEVER include the internal label. */
  descriptor: string;
}

const HAS_TESTS = (s: StackSignals) => s.testFrameworks.length > 0;
const HAS_CI = (s: StackSignals) => s.ci.provider !== "none";
const HAS_CLAUDE_HARNESS = (s: StackSignals) =>
  s.harness.flavours.some((f) => f === "claude-code" || f === "claude-md");
const HAS_KIND = (kind: string) => (s: StackSignals) =>
  s.buildSystems.some((b) => b.kind === kind);

const RULES: ShapeRule[] = [
  {
    internalLabel: "agentcrm-shaped",
    matches: (s) =>
      HAS_KIND("node")(s) &&
      HAS_TESTS(s) &&
      HAS_CI(s) &&
      HAS_CLAUDE_HARNESS(s),
    descriptor: "AI-driven product code, mature CI, agent-aware",
  },
  {
    internalLabel: "jordan-shaped",
    matches: (s) =>
      HAS_KIND("node")(s) && HAS_TESTS(s) && HAS_CI(s),
    descriptor: "mid-size org tooling, mature CI",
  },
  {
    internalLabel: "lisa-shaped",
    matches: (s) =>
      HAS_KIND("node")(s) && HAS_TESTS(s) && !HAS_CI(s),
    descriptor: "team-output review with quality gating",
  },
  {
    internalLabel: "nadia-shaped",
    matches: (s) =>
      (HAS_KIND("python")(s) || HAS_KIND("ruby")(s)) && HAS_TESTS(s),
    descriptor: "data / scripting toolchain, test-backed",
  },
  {
    internalLabel: "rob-shaped-glue",
    matches: (s) => s.buildSystems.length === 0 && !HAS_TESTS(s) && !HAS_CI(s),
    descriptor: "five-script glue repo, no test harness yet",
  },
  {
    internalLabel: "polyglot-shaped",
    matches: (s) =>
      s.buildSystems.length > 1 ||
      (HAS_KIND("rust")(s) && HAS_KIND("node")(s)),
    descriptor: "polyglot monorepo",
  },
];

const FALLBACK_DESCRIPTOR = "small project, no clear stack signature";

/**
 * Public API. Returns only the user-facing descriptor string — internal
 * persona-shape labels are NOT exposed in the return type.
 */
export function scorePersonaFit(signals: StackSignals): { descriptor: string } {
  for (const rule of RULES) {
    if (rule.matches(signals)) return { descriptor: rule.descriptor };
  }
  return { descriptor: FALLBACK_DESCRIPTOR };
}
