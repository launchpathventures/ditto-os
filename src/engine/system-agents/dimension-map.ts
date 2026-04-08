/**
 * Dimension Map — Clarity Assessment for Goal Decomposition
 *
 * Evaluates how well a goal is understood across six dimensions before
 * the orchestrator attempts decomposition. The Self (Goal Framing
 * meta-process) drives the consultative conversation using these
 * assessments; the orchestrator receives the resulting DimensionMap
 * and guards against decomposing with insufficient clarity.
 *
 * Provenance:
 * - Consultative selling MEDDIC/BANT (structured qualification)
 * - ADR-015 (Goal Framing meta-process)
 * - Brief 102
 */

import type {
  ClarityLevel,
  DimensionAssessment,
  DimensionMap,
  DimensionName,
} from "@ditto/core";

// ============================================================
// Clarity Assessment
// ============================================================

/** Default questions mapped to each dimension when clarity is insufficient */
const DIMENSION_QUESTIONS: Record<DimensionName, string> = {
  outcome: "What does success look like? How would you know this goal is achieved?",
  assets: "What resources, capabilities, or existing work can we build on?",
  constraints: "Are there budget limits, deadlines, regulatory requirements, or technical constraints?",
  context: "What's the current state? Any competitive or industry context I should know?",
  infrastructure: "What tools, systems, or integrations are already in place?",
  risk_tolerance: "How much autonomy should I have? Should I check with you before acting, or move fast?",
};

/**
 * Assess clarity across all six dimensions for a goal description.
 *
 * This is a heuristic assessment based on keyword/phrase analysis.
 * It provides a starting point — the Self may refine via conversation
 * before passing to the orchestrator.
 */
export function assessClarity(
  goalDescription: string,
  existingContext?: Record<string, string>,
): DimensionMap {
  const dimensions: DimensionAssessment[] = [];

  for (const dim of Object.keys(DIMENSION_QUESTIONS) as DimensionName[]) {
    const contextValue = existingContext?.[dim];
    const assessment = assessDimension(dim, goalDescription, contextValue);
    dimensions.push(assessment);
  }

  const overallClarity = computeOverallClarity(dimensions);
  const readyToDecompose = isDecompositionReady({ dimensions, overallClarity, readyToDecompose: false });

  return {
    dimensions,
    overallClarity,
    readyToDecompose,
  };
}

/**
 * Check whether the dimension map has sufficient clarity for decomposition.
 *
 * Rule: outcome MUST be "clear" or "partial". If outcome is "unknown" or
 * "vague", decomposition is blocked — we don't know what success looks like.
 */
export function isDecompositionReady(map: DimensionMap): boolean {
  const outcomeDim = map.dimensions.find(d => d.dimension === "outcome");
  if (!outcomeDim) return false;
  return outcomeDim.level !== "unknown" && outcomeDim.level !== "vague";
}

/**
 * Extract questions for dimensions that need clarification.
 * Returns only questions for dimensions that are "vague" or "unknown".
 */
export function getClarityQuestions(
  map: DimensionMap,
): Array<{ dimension: DimensionName; question: string }> {
  return map.dimensions
    .filter(d => d.level === "vague" || d.level === "unknown")
    .map(d => ({
      dimension: d.dimension,
      question: d.question || DIMENSION_QUESTIONS[d.dimension],
    }));
}

// ============================================================
// Internal helpers
// ============================================================

/** Heuristic signals that indicate clarity per dimension */
const DIMENSION_SIGNALS: Record<DimensionName, { clear: RegExp[]; partial: RegExp[] }> = {
  outcome: {
    clear: [
      /\b(?:achieve|deliver|complete|launch|ship|build|create|increase|reduce|improve)\b/i,
      /\b(?:by|within|before|deadline|target|goal is|success means)\b/i,
    ],
    partial: [
      /\b(?:want|need|would like|hoping|try|explore|figure out)\b/i,
    ],
  },
  assets: {
    clear: [
      /\b(?:have|using|existing|already|current|our)\b.*\b(?:system|tool|team|process|data|code)\b/i,
    ],
    partial: [
      /\b(?:some|might have|probably|think we have)\b/i,
    ],
  },
  constraints: {
    clear: [
      /\b(?:budget|deadline|must|cannot|limit|regulation|compliance|within)\b/i,
      /\$[\d,]+|\d+\s*(?:days?|weeks?|months?)\b/i,
    ],
    partial: [
      /\b(?:around|about|roughly|flexible|prefer)\b/i,
    ],
  },
  context: {
    clear: [
      /\b(?:industry|market|competitor|customer|user|client|sector)\b/i,
    ],
    partial: [
      /\b(?:similar|like|kind of|sort of)\b/i,
    ],
  },
  infrastructure: {
    clear: [
      /\b(?:use|run|deploy|host|integrate|API|platform|stack|database|CRM)\b/i,
    ],
    partial: [
      /\b(?:might|could|considering|evaluating)\b/i,
    ],
  },
  risk_tolerance: {
    clear: [
      /\b(?:autonomous|supervised|careful|aggressive|conservative|fast|cautious|check with me)\b/i,
    ],
    partial: [
      /\b(?:depends|usually|normally|standard)\b/i,
    ],
  },
};

function assessDimension(
  dimension: DimensionName,
  goalDescription: string,
  contextValue?: string,
): DimensionAssessment {
  const text = contextValue
    ? `${goalDescription} ${contextValue}`
    : goalDescription;

  const signals = DIMENSION_SIGNALS[dimension];

  // Check for clear signals first
  const hasClearSignal = signals.clear.some(re => re.test(text));
  const hasPartialSignal = signals.partial.some(re => re.test(text));

  // If explicit context was provided for this dimension, it's at least partial
  if (contextValue) {
    const level: ClarityLevel = hasClearSignal ? "clear" : "partial";
    return {
      dimension,
      level,
      evidence: contextValue,
    };
  }

  let level: ClarityLevel;
  let evidence: string;

  if (hasClearSignal) {
    level = "partial"; // heuristic match = partial at best; LLM or user confirms to "clear"
    evidence = "Goal description contains relevant signals";
  } else if (hasPartialSignal) {
    level = "vague";
    evidence = "Weak signals detected — needs clarification";
  } else {
    level = "unknown";
    evidence = "No signals detected for this dimension";
  }

  return {
    dimension,
    level,
    evidence,
    question: level === "vague" || level === "unknown"
      ? DIMENSION_QUESTIONS[dimension]
      : undefined,
  };
}

function computeOverallClarity(dimensions: DimensionAssessment[]): ClarityLevel {
  const levels = dimensions.map(d => d.level);

  if (levels.every(l => l === "clear")) return "clear";
  if (levels.some(l => l === "unknown")) return "unknown";
  if (levels.some(l => l === "vague")) return "vague";
  return "partial";
}
