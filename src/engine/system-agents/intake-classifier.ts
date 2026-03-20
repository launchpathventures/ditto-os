/**
 * Intake Classifier — System Agent Module
 *
 * Code-based (Mode 1) work item classifier. Maps keyword patterns to work item types.
 * No LLM calls — deterministic, fast, free.
 *
 * Provenance: Inngest AgentKit FnRouter (code-based deterministic routing, Mode 1 of three-mode)
 * Trust progression: start deterministic, graduate to LLM when code-based proves insufficient.
 */

import type { StepExecutionResult } from "../step-executor";
import type { WorkItemType } from "../../db/schema";

interface ClassificationResult {
  type: WorkItemType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  matchedKeyword: string | null;
}

/** Question indicators — words/phrases that signal a question */
const QUESTION_PATTERNS = [
  /^(why|what|how|when|where|who|which|is|are|do|does|can|could|should|would)\b/i,
  /\?$/,
];

/** Goal indicators — aspirational, achievement-oriented language */
const GOAL_PATTERNS = [
  /\b(goal|achieve|target|improve|increase|reduce|ensure|maintain)\b/i,
];

/** Insight indicators — learning, realization language */
const INSIGHT_PATTERNS = [
  /\b(learned|realized|realized|noticed|discovered|insight|finding|observation)\b/i,
  /\b(turns out|it seems|apparently|interestingly)\b/i,
];

/** Outcome indicators — time-bound goals with deadlines */
const OUTCOME_PATTERNS = [
  /\b(by|before|until|deadline|due|end of)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|tomorrow|next week|this week|end of week|end of month|eow|eom)\b/i,
  /\b(by|before)\s+\w+day\b/i,
];

/**
 * Classify a work item from free text content.
 * Returns the most specific match; defaults to "task" (most common type).
 */
export function classifyWorkItem(content: string): ClassificationResult {
  const trimmed = content.trim();

  // Check question patterns first (strongest signal — sentence structure)
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      const match = trimmed.match(pattern);
      return {
        type: "question",
        confidence: "high",
        reasoning: "Sentence structure indicates a question",
        matchedKeyword: match?.[0] ?? "?",
      };
    }
  }

  // Check outcome patterns (time-bound goals — more specific than goals)
  for (const pattern of OUTCOME_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type: "outcome",
        confidence: "medium",
        reasoning: "Contains deadline/time-bound language",
        matchedKeyword: match[0],
      };
    }
  }

  // Check insight patterns
  for (const pattern of INSIGHT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type: "insight",
        confidence: "medium",
        reasoning: "Contains learning/realization language",
        matchedKeyword: match[0],
      };
    }
  }

  // Check goal patterns
  for (const pattern of GOAL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type: "goal",
        confidence: "medium",
        reasoning: "Contains aspirational/achievement language",
        matchedKeyword: match[0],
      };
    }
  }

  // Default: task (most common work item type)
  // Confidence is "low" when no keyword matched — signals potential fallback
  const hasActionVerb = /\b(need|want|fix|send|create|build|update|check|review|follow up|draft|prepare|schedule|call|email)\b/i.test(trimmed);

  if (hasActionVerb) {
    const match = trimmed.match(/\b(need|want|fix|send|create|build|update|check|review|follow up|draft|prepare|schedule|call|email)\b/i);
    return {
      type: "task",
      confidence: "medium",
      reasoning: "Contains action verb",
      matchedKeyword: match?.[0] ?? null,
    };
  }

  return {
    type: "task",
    confidence: "low",
    reasoning: "No strong keyword match — defaulting to task",
    matchedKeyword: null,
  };
}

/**
 * Execute intake classification as a system agent step.
 * Receives work item content from run inputs, returns classification result.
 */
export async function executeIntakeClassifier(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const content = inputs.content as string;

  if (!content) {
    throw new Error("Intake classifier requires content input");
  }

  const result = classifyWorkItem(content);

  return {
    outputs: {
      "classification-result": result,
    },
    confidence: result.confidence,
    logs: [
      `Classified "${content.slice(0, 80)}${content.length > 80 ? "..." : ""}" as ${result.type}`,
      `Confidence: ${result.confidence}`,
      `Reasoning: ${result.reasoning}`,
      ...(result.matchedKeyword ? [`Matched keyword: "${result.matchedKeyword}"`] : []),
    ],
  };
}
