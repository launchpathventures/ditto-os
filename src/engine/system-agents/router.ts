/**
 * Router — System Agent Module
 *
 * LLM-based process routing (Mode 2). Receives active domain process
 * descriptions as context and selects the best matching process for a work item.
 *
 * Uses the Anthropic SDK directly (not the ai-agent executor path) to maintain
 * structured JSON output control. Goes through the harness pipeline via the
 * script executor + systemAgent pattern, same as other system agents.
 *
 * Provenance: Inngest AgentKit RoutingAgent + Mastra Networks schema-driven routing
 */

import type { StepExecutionResult } from "../step-executor";
import { createCompletion, extractText, getConfiguredModel } from "../llm";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";

interface RoutingResult {
  processSlug: string | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export interface TaskRouteMatch {
  processSlug: string | null;
  confidence: number; // 0-1
  reasoning: string;
}

interface ProcessSummary {
  slug: string;
  name: string;
  description: string;
}

/**
 * Execute routing as a system agent step.
 * Receives work item content + available process descriptions from run inputs.
 * Returns the best matching process slug (or null if no match).
 */
export async function executeRouter(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const content = inputs.content as string;
  const workItemType = inputs.workItemType as string;
  const availableProcesses = inputs.availableProcesses as ProcessSummary[];

  if (!content) {
    throw new Error("Router requires content input");
  }

  if (!availableProcesses || availableProcesses.length === 0) {
    // No processes to route to — return null match
    return {
      outputs: {
        "routing-result": {
          processSlug: null,
          confidence: "high",
          reasoning: "No active domain processes available for routing",
        } satisfies RoutingResult,
      },
      confidence: "high",
      logs: ["No active domain processes available — nothing to route to"],
    };
  }

  // Build the routing prompt
  const processDescriptions = availableProcesses
    .map((p) => `- **${p.name}** (slug: \`${p.slug}\`): ${p.description || "No description"}`)
    .join("\n");

  const systemPrompt = `You are a work item router for Ditto. Your job is to match incoming work items to the best available process.

You MUST respond with ONLY a JSON object (no markdown, no explanation outside the JSON):
{
  "processSlug": "<slug of the best matching process, or null if no match>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence explaining your choice>"
}

Rules:
- Select the process whose description best matches the work item content
- If no process is a reasonable match, return processSlug: null
- confidence "high" = strong match, "medium" = plausible match, "low" = weak/uncertain match
- Only select from the provided processes — never invent a slug`;

  const userMessage = `## Work Item
Type: ${workItemType || "unknown"}
Content: ${content}

## Available Processes
${processDescriptions}`;

  try {
    const response = await createCompletion({
      model: getConfiguredModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 256,
    });

    const text = extractText(response.content);

    // Parse the JSON response
    const result = parseRoutingResponse(text, availableProcesses);

    return {
      outputs: {
        "routing-result": result,
      },
      tokensUsed: response.tokensUsed,
      costCents: response.costCents,
      confidence: result.confidence,
      logs: [
        `Routed to: ${result.processSlug ?? "none"}`,
        `Confidence: ${result.confidence}`,
        `Reasoning: ${result.reasoning}`,
        `Tokens: ${response.tokensUsed}`,
      ],
    };
  } catch (error) {
    // On API failure, return no match with low confidence
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      outputs: {
        "routing-result": {
          processSlug: null,
          confidence: "low",
          reasoning: `Routing failed: ${errMsg}`,
        } satisfies RoutingResult,
      },
      confidence: "low",
      logs: [`Router API call failed: ${errMsg}`],
    };
  }
}

/**
 * Parse the LLM's JSON response, validating the process slug exists.
 */
function parseRoutingResponse(
  text: string,
  availableProcesses: ProcessSummary[],
): RoutingResult {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json?\s*\n?/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned) as RoutingResult;

    // Validate the slug exists in available processes
    if (parsed.processSlug) {
      const found = availableProcesses.find((p) => p.slug === parsed.processSlug);
      if (!found) {
        return {
          processSlug: null,
          confidence: "low",
          reasoning: `LLM suggested "${parsed.processSlug}" which is not an available process`,
        };
      }
    }

    return {
      processSlug: parsed.processSlug ?? null,
      confidence: parsed.confidence || "medium",
      reasoning: parsed.reasoning || "No reasoning provided",
    };
  } catch {
    return {
      processSlug: null,
      confidence: "low",
      reasoning: `Failed to parse routing response: ${text.slice(0, 100)}`,
    };
  }
}

// ============================================================
// Rule-based task-to-process matching (Brief 074)
//
// Keyword matching + slug exact match for v1.
// LLM-based routing (executeRouter above) is for v2.
//
// Provenance: Brief 074 — deterministic routing before LLM routing
// ============================================================

/**
 * Match a task's content to an available process using rule-based matching.
 * Returns confidence 0-1 and the matched process slug.
 *
 * Strategy:
 * 1. Slug exact match: if taskContent contains a process slug → confidence 1.0
 * 2. Keyword matching: tokenize content and match against process name/description
 *    → confidence based on keyword overlap ratio
 */
export async function matchTaskToProcess(
  taskContent: string,
): Promise<TaskRouteMatch> {
  // Load all active domain processes
  const processes = await db
    .select({
      slug: schema.processes.slug,
      name: schema.processes.name,
      description: schema.processes.description,
    })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  if (processes.length === 0) {
    return {
      processSlug: null,
      confidence: 0,
      reasoning: "No active processes available for matching",
    };
  }

  return matchTaskToProcessFromList(taskContent, processes);
}

/**
 * Pure matching logic — testable without DB.
 * Exported for testing.
 */
export function matchTaskToProcessFromList(
  taskContent: string,
  processes: Array<{ slug: string; name: string; description: string | null }>,
): TaskRouteMatch {
  const contentLower = taskContent.toLowerCase();

  // 1. Slug word-boundary match — highest confidence
  // Uses word boundary regex to avoid false positives (e.g., "report" matching "reporting")
  for (const proc of processes) {
    const slugLower = proc.slug.toLowerCase();
    const boundaryPattern = new RegExp(`\\b${slugLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (boundaryPattern.test(contentLower)) {
      return {
        processSlug: proc.slug,
        confidence: 1.0,
        reasoning: `Slug word-boundary match: content contains "${proc.slug}"`,
      };
    }
  }

  // 2. Keyword matching against process name and description
  const contentTokens = tokenize(contentLower);

  let bestMatch: TaskRouteMatch = {
    processSlug: null,
    confidence: 0,
    reasoning: "No matching process found via keyword matching",
  };

  for (const proc of processes) {
    const nameTokens = tokenize(proc.name.toLowerCase());
    const descTokens = proc.description
      ? tokenize(proc.description.toLowerCase())
      : [];
    const processTokens = [...new Set([...nameTokens, ...descTokens])];

    if (processTokens.length === 0) continue;

    // Count how many process tokens appear in the content
    const matchedTokens = processTokens.filter((token) =>
      contentTokens.includes(token),
    );

    // Confidence = matched / total process tokens, capped at 1.0
    const confidence = matchedTokens.length / processTokens.length;

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        processSlug: proc.slug,
        confidence: Math.round(confidence * 100) / 100,
        reasoning: `Keyword match: ${matchedTokens.length}/${processTokens.length} tokens matched (${matchedTokens.join(", ")})`,
      };
    }
  }

  return bestMatch;
}

/** Tokenize a string into meaningful words (drop short/common words). */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "and",
    "but", "or", "nor", "not", "so", "yet", "both", "either",
    "neither", "each", "every", "all", "any", "few", "more",
    "most", "other", "some", "such", "no", "only", "own", "same",
    "than", "too", "very", "just", "because", "this", "that",
    "these", "those", "it", "its", "if", "then", "else",
  ]);

  return text
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length >= 2 && !stopWords.has(word));
}
