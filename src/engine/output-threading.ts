/**
 * Output Threading — LLM-Based Output Extraction and Shaping
 *
 * Takes completed sub-goal outputs and shapes them as input for
 * dependent sub-goals. The orchestrator contextually extracts relevant
 * output and maps it to what the next sub-goal needs.
 *
 * V1 is LLM-based (no formal schema enforcement). The LLM receives
 * the source sub-goal's output and the target sub-goal's description,
 * and returns the relevant extracted/shaped data.
 *
 * Provenance: Original to Ditto, inspired by multi-agent handoff patterns
 * (AutoGen, Mastra). Brief 103.
 */

import { createCompletion, extractText } from "./llm";

// ============================================================
// Types
// ============================================================

export interface ThreadingInput {
  /** ID of the source sub-goal whose output we're extracting from */
  sourceSubGoalId: string;
  /** Title of the source sub-goal */
  sourceSubGoalTitle: string;
  /** The output data from the completed source sub-goal */
  sourceOutput: Record<string, unknown>;
  /** ID of the target sub-goal that needs shaped input */
  targetSubGoalId: string;
  /** Title of the target sub-goal */
  targetSubGoalTitle: string;
  /** Description of what the target sub-goal needs */
  targetSubGoalDescription: string;
}

export interface ThreadingResult {
  /** The shaped input for the target sub-goal */
  shapedInput: Record<string, unknown>;
  /** What was extracted and why */
  reasoning: string;
  /** LLM cost (cents) */
  costCents: number;
}

export interface ReThreadingRequest {
  /** The original threading input */
  original: ThreadingInput;
  /** User correction / what was wrong */
  correction: string;
}

// ============================================================
// Main functions
// ============================================================

/**
 * Thread outputs from a completed sub-goal to a dependent sub-goal.
 *
 * Uses model_hint: fast (mapping, not deep reasoning).
 */
export async function threadOutputs(input: ThreadingInput): Promise<ThreadingResult> {
  const sourceOutputStr = JSON.stringify(input.sourceOutput, null, 2);

  const response = await createCompletion({
    purpose: "analysis", // fast model for mapping
    system: `You are an output threading engine. Extract relevant data from a completed sub-goal's output and shape it as input for the next sub-goal.

Rules:
1. Only extract data that is RELEVANT to the target sub-goal
2. Reshape/rename fields to match what the target sub-goal naturally expects
3. Preserve data fidelity — don't summarize or lose detail
4. If no relevant data exists, return an empty object with explanation

Output ONLY a JSON object (no markdown fences):
{
  "shapedInput": { ... },
  "reasoning": "What was extracted and why"
}`,
    messages: [{
      role: "user",
      content: `## Source Sub-Goal: "${input.sourceSubGoalTitle}"
Output:
${sourceOutputStr.slice(0, 4000)}

## Target Sub-Goal: "${input.targetSubGoalTitle}"
Description: ${input.targetSubGoalDescription}

Extract relevant output from the source and shape it as input for the target.`,
    }],
    maxTokens: 1024,
  });

  const text = extractText(response.content);

  try {
    const cleaned = text
      .replace(/```json?\s*\n?/g, "")
      .replace(/```\s*$/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      shapedInput: Record<string, unknown>;
      reasoning: string;
    };

    return {
      shapedInput: parsed.shapedInput || {},
      reasoning: parsed.reasoning || "Output threaded",
      costCents: response.costCents,
    };
  } catch {
    // Fallback: pass the full source output through
    return {
      shapedInput: { _rawSourceOutput: input.sourceOutput },
      reasoning: "Failed to parse LLM threading response — passing raw output",
      costCents: response.costCents,
    };
  }
}

/**
 * Re-thread outputs after user correction (AC14).
 *
 * When a user flags "wrong input" on a sub-goal that received
 * threaded output, this re-runs threading with the correction context.
 */
export async function reThreadOutputs(request: ReThreadingRequest): Promise<ThreadingResult> {
  const sourceOutputStr = JSON.stringify(request.original.sourceOutput, null, 2);

  const response = await createCompletion({
    purpose: "analysis",
    system: `You are an output threading engine. A previous threading attempt was flagged as incorrect by the user. Re-extract and reshape the data with their correction in mind.

Rules:
1. Apply the user's correction to guide extraction
2. Only extract data that is RELEVANT to the target sub-goal
3. Preserve data fidelity
4. If the correction makes the source data irrelevant, return an empty object

Output ONLY a JSON object (no markdown fences):
{
  "shapedInput": { ... },
  "reasoning": "What was corrected and why"
}`,
    messages: [{
      role: "user",
      content: `## User Correction
${request.correction}

## Source Sub-Goal: "${request.original.sourceSubGoalTitle}"
Output:
${sourceOutputStr.slice(0, 4000)}

## Target Sub-Goal: "${request.original.targetSubGoalTitle}"
Description: ${request.original.targetSubGoalDescription}

Re-extract with the correction applied.`,
    }],
    maxTokens: 1024,
  });

  const text = extractText(response.content);

  try {
    const cleaned = text
      .replace(/```json?\s*\n?/g, "")
      .replace(/```\s*$/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      shapedInput: Record<string, unknown>;
      reasoning: string;
    };

    return {
      shapedInput: parsed.shapedInput || {},
      reasoning: parsed.reasoning || "Output re-threaded with correction",
      costCents: response.costCents,
    };
  } catch {
    return {
      shapedInput: { _rawSourceOutput: request.original.sourceOutput },
      reasoning: "Failed to parse re-threading response — passing raw output",
      costCents: response.costCents,
    };
  }
}
