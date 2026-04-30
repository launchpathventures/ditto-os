/**
 * Brief 226 — Runner + trust-tier recommendation heuristics.
 *
 * Maps the analyser's detected signals to a recommended runner kind and
 * trust tier, plus 1-2 alternatives each. Heuristics, not invariants —
 * the user can override at the picker. Mapping table comes from §Constraints
 * of Brief 226.
 */

import { runnerKindValues } from "@ditto/core";
import type {
  RunnerRecommendation,
  TrustTierRecommendation,
} from "@ditto/core";
import type { StackSignals } from "@ditto/core";

type RunnerKind = (typeof runnerKindValues)[number];

// ============================================================
// Runner recommendation
// ============================================================

interface RunnerCandidate {
  kind: RunnerKind;
  rationale: string;
}

const NODE_TS_RUNNER: RunnerCandidate = {
  kind: "claude-code-routine",
  rationale: "TypeScript / Node-shaped repo — Claude Code Routine is the proven path.",
};

const LARGE_REPO_RUNNER: RunnerCandidate = {
  kind: "local-mac-mini",
  rationale: "Large monorepo — local Mac mini avoids cloud clone overhead and keeps sensitive data on your network.",
};

const GITHUB_ACTION_RUNNER: RunnerCandidate = {
  kind: "github-action",
  rationale: "GitHub Actions already wired in — keep iteration hands-off via the GitHub Action runner.",
};

const SUPERVISED_LOCAL_RUNNER: RunnerCandidate = {
  kind: "local-mac-mini",
  rationale: "No tests / CI yet — run on your Mac mini for fast iteration while supervised.",
};

function pickRunner(signals: StackSignals): {
  recommended: RunnerCandidate;
  alternatives: RunnerCandidate[];
} {
  const isNode = signals.buildSystems.some((b) => b.kind === "node");
  const hasCatalyst = signals.harness.flavours.includes("catalyst");
  const hasGithubActions = signals.ci.provider === "github-actions";
  const hasNoTestsNoCI =
    signals.testFrameworks.length === 0 && signals.ci.provider === "none";
  const isLarge = (signals.fileCount ?? 0) > 5000;

  if (hasCatalyst) {
    return {
      recommended: {
        kind: "claude-code-routine",
        rationale: "Catalyst harness already detected — Claude Code Routine plugs into it directly.",
      },
      alternatives: [LARGE_REPO_RUNNER, GITHUB_ACTION_RUNNER],
    };
  }

  if (hasNoTestsNoCI) {
    return {
      recommended: SUPERVISED_LOCAL_RUNNER,
      alternatives: [
        {
          kind: "claude-code-routine",
          rationale: "Switch to cloud once tests + CI are in place.",
        },
      ],
    };
  }

  if (isNode && isLarge) {
    return {
      recommended: LARGE_REPO_RUNNER,
      alternatives: [NODE_TS_RUNNER, GITHUB_ACTION_RUNNER],
    };
  }

  if (isNode) {
    return {
      recommended: NODE_TS_RUNNER,
      alternatives: [LARGE_REPO_RUNNER, GITHUB_ACTION_RUNNER],
    };
  }

  if (hasGithubActions) {
    return {
      recommended: GITHUB_ACTION_RUNNER,
      alternatives: [LARGE_REPO_RUNNER, NODE_TS_RUNNER],
    };
  }

  return {
    recommended: SUPERVISED_LOCAL_RUNNER,
    alternatives: [NODE_TS_RUNNER, GITHUB_ACTION_RUNNER],
  };
}

export function recommendRunner(signals: StackSignals): RunnerRecommendation {
  const { recommended, alternatives } = pickRunner(signals);
  return {
    kind: recommended.kind,
    rationale: recommended.rationale,
    alternatives: alternatives.map((a) => ({ kind: a.kind, rationale: a.rationale })),
  };
}

// ============================================================
// Trust-tier recommendation
// ============================================================

interface TierCandidate {
  tier: "supervised" | "spot_checked" | "autonomous" | "critical";
  rationale: string;
}

export function recommendTrustTier(
  signals: StackSignals,
): TrustTierRecommendation {
  const hasTests = signals.testFrameworks.length > 0;
  const hasCI = signals.ci.provider !== "none";

  if (hasTests && hasCI) {
    const recommended: TierCandidate = {
      tier: "spot_checked",
      rationale:
        "Tests + CI present → Ditto can advance work and you sample-review changes.",
    };
    const alternatives: TierCandidate[] = [
      {
        tier: "supervised",
        rationale: "Pick this if you want to review every output until you're comfortable.",
      },
      {
        tier: "autonomous",
        rationale: "Pick this once Ditto has earned a track record on this project.",
      },
    ];
    return {
      tier: recommended.tier,
      rationale: recommended.rationale,
      alternatives,
    };
  }

  // Default — no tests / no CI / unknown.
  const recommended: TierCandidate = {
    tier: "supervised",
    rationale:
      "No tests / CI yet → review every output before it lands. Trust earns into spot-checked.",
  };
  const alternatives: TierCandidate[] = [
    {
      tier: "spot_checked",
      rationale: "Pick this once you've added tests and CI.",
    },
  ];
  return {
    tier: recommended.tier,
    rationale: recommended.rationale,
    alternatives,
  };
}
