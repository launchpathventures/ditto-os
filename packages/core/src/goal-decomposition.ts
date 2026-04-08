/**
 * Goal Decomposition Types — @ditto/core
 *
 * Engine-primitive types for LLM-powered goal decomposition.
 * These are reusable by any consumer (ProcessOS, etc.) — no Ditto-specific
 * concepts (Self, personas, network, workspace).
 *
 * Provenance:
 * - LangGraph plan-and-execute (sub-goal generation)
 * - Consultative selling MEDDIC/BANT (dimension map for clarity)
 * - Hypothesis-driven planning (explicit assumptions)
 * - Brief 102
 */

// ============================================================
// Clarity Assessment (Dimension Map)
// ============================================================

/** How well a single dimension of a goal is understood */
export type ClarityLevel = "clear" | "partial" | "vague" | "unknown";

/** A single dimension of goal clarity */
export interface DimensionAssessment {
  dimension: DimensionName;
  level: ClarityLevel;
  evidence: string;
  question?: string; // clarifying question if not clear
}

/** The six dimensions assessed before goal decomposition */
export const DIMENSION_NAMES = [
  "outcome",        // What does success look like?
  "assets",         // What resources/capabilities exist?
  "constraints",    // Budget, time, regulatory, technical limits
  "context",        // Industry, competitive landscape, current state
  "infrastructure", // Tools, systems, integrations in place
  "risk_tolerance", // How much autonomy/experimentation is acceptable?
] as const;

export type DimensionName = (typeof DIMENSION_NAMES)[number];

/** Full clarity assessment across all six dimensions */
export interface DimensionMap {
  dimensions: DimensionAssessment[];
  overallClarity: ClarityLevel;
  readyToDecompose: boolean;
}

// ============================================================
// Sub-Goal & Decomposition
// ============================================================

/** Whether a sub-goal maps to an existing process or needs one built */
export type SubGoalRouting = "find" | "build";

/** A single sub-goal produced by decomposition */
export interface SubGoal {
  id: string;
  title: string;
  description: string;
  routing: SubGoalRouting;
  dependsOn: string[]; // other sub-goal IDs
  estimatedComplexity: "low" | "medium" | "high";
}

/** Phase grouping when sub-goals exceed the target count */
export interface GoalPhase {
  id: string;
  name: string;
  subGoalIds: string[];
  dependsOn: string[]; // other phase IDs
}

/** The full output of goal-level decomposition */
export interface GoalDecomposition {
  goalId: string;
  goalDescription: string;
  dimensionMap: DimensionMap;
  subGoals: SubGoal[];
  phases?: GoalPhase[]; // present when >8 sub-goals are grouped
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
  webSearchesUsed: number;
}

/** Result when decomposition isn't ready — needs more clarity */
export interface ClarityNeeded {
  ready: false;
  dimensionMap: DimensionMap;
  questions: Array<{
    dimension: DimensionName;
    question: string;
  }>;
  reasoning: string;
}

/** Result when decomposition succeeds */
export interface DecompositionReady {
  ready: true;
  decomposition: GoalDecomposition;
}

/** Union result from the decomposition attempt */
export type GoalDecompositionResult = ClarityNeeded | DecompositionReady;
