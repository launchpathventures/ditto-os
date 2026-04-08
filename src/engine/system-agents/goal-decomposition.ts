/**
 * Goal Decomposition — LLM-Powered Sub-Goal Generation
 *
 * Decomposes a goal into sub-goals using LLM reasoning with structured
 * knowledge inputs: process inventory, industry patterns, dimension map,
 * and optional web-search results.
 *
 * Each sub-goal is tagged as "find" (existing process likely matches) or
 * "build" (no match expected — Brief 103 handles the build path).
 *
 * Provenance:
 * - LangGraph plan-and-execute (plan step produces sub-goals)
 * - Hypothesis-driven planning (explicit assumptions)
 * - Brief 102
 */

import { randomUUID } from "crypto";
import type {
  GoalDecomposition,
  GoalDecompositionResult,
  SubGoal,
  GoalPhase,
  DimensionMap,
} from "@ditto/core";
import { createCompletion, extractText } from "../llm";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { matchIndustry, type IndustryProfile } from "../industry-patterns";
import { webSearch } from "../web-search";
import { assessClarity, isDecompositionReady, getClarityQuestions } from "./dimension-map";

// ============================================================
// Constants
// ============================================================

const MAX_WEB_SEARCHES = 2;
const TARGET_SUBGOAL_MIN = 3;
const TARGET_SUBGOAL_MAX = 8;

// ============================================================
// Main entry point
// ============================================================

/**
 * Attempt to decompose a goal into sub-goals.
 *
 * Flow:
 * 1. Assess clarity via dimension map (or accept pre-assessed map)
 * 2. If not ready, return clarity questions
 * 3. If ready, gather context (process inventory, industry patterns, web search)
 * 4. Call LLM for decomposition
 * 5. Tag each sub-goal as find/build based on process inventory match
 * 6. Group into phases if >8 sub-goals
 */
export async function decomposeGoalWithLLM(opts: {
  goalId: string;
  goalDescription: string;
  dimensionMap?: DimensionMap;
  existingContext?: Record<string, string>;
  industrySignals?: string[];
  enableWebSearch?: boolean;
}): Promise<GoalDecompositionResult> {
  const {
    goalId,
    goalDescription,
    existingContext,
    industrySignals,
    enableWebSearch = true,
  } = opts;

  // Step 1: Assess clarity (use provided map or compute)
  const dimensionMap = opts.dimensionMap ?? assessClarity(goalDescription, existingContext);

  // Step 2: Check readiness
  if (!isDecompositionReady(dimensionMap)) {
    const questions = getClarityQuestions(dimensionMap);
    return {
      ready: false,
      dimensionMap,
      questions,
      reasoning: "Goal clarity is insufficient for decomposition — outcome dimension must be at least partial",
    };
  }

  // Step 3: Gather context
  const processInventory = await getProcessInventory();
  const industryProfile = industrySignals
    ? matchIndustry(industrySignals)
    : null;

  let webSearchResults: string[] = [];
  if (enableWebSearch) {
    webSearchResults = await gatherWebContext(goalDescription, MAX_WEB_SEARCHES);
  }

  // Step 4: Call LLM for decomposition
  const prompt = buildDecompositionPrompt({
    goalDescription,
    dimensionMap,
    processInventory,
    industryProfile,
    webSearchResults,
  });

  const response = await createCompletion({
    purpose: "analysis",
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    maxTokens: 2048,
  });

  const text = extractText(response.content);

  // Step 5: Parse LLM output
  const parsed = parseDecompositionResponse(text, goalId, goalDescription);

  // Step 6: Tag sub-goals as find/build based on process inventory
  const taggedSubGoals = tagSubGoals(parsed.subGoals, processInventory);

  // Step 7: Group into phases if needed
  const phases = taggedSubGoals.length > TARGET_SUBGOAL_MAX
    ? groupIntoPhases(taggedSubGoals)
    : undefined;

  const decomposition: GoalDecomposition = {
    goalId,
    goalDescription,
    dimensionMap,
    subGoals: taggedSubGoals,
    phases,
    assumptions: parsed.assumptions,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    webSearchesUsed: webSearchResults.length,
  };

  return {
    ready: true,
    decomposition,
  };
}

// ============================================================
// Context gathering
// ============================================================

interface ProcessInventoryItem {
  slug: string;
  name: string;
  description: string | null;
}

async function getProcessInventory(): Promise<ProcessInventoryItem[]> {
  return db
    .select({
      slug: schema.processes.slug,
      name: schema.processes.name,
      description: schema.processes.description,
    })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));
}

async function gatherWebContext(
  goalDescription: string,
  maxSearches: number,
): Promise<string[]> {
  const results: string[] = [];

  // One focused search on the goal domain
  const domainResult = await webSearch(
    `best practices for: ${goalDescription.slice(0, 200)}`,
  );
  if (domainResult) results.push(domainResult);

  // Second search only if first succeeded and we haven't hit cap
  if (results.length < maxSearches && results.length > 0) {
    const structureResult = await webSearch(
      `how to break down and plan: ${goalDescription.slice(0, 200)}`,
    );
    if (structureResult) results.push(structureResult);
  }

  return results;
}

// ============================================================
// LLM prompt construction
// ============================================================

function buildDecompositionPrompt(ctx: {
  goalDescription: string;
  dimensionMap: DimensionMap;
  processInventory: ProcessInventoryItem[];
  industryProfile: IndustryProfile | null;
  webSearchResults: string[];
}): { system: string; user: string } {
  const dimensionSummary = ctx.dimensionMap.dimensions
    .map(d => `- **${d.dimension}**: ${d.level} — ${d.evidence}`)
    .join("\n");

  const processList = ctx.processInventory.length > 0
    ? ctx.processInventory
        .map(p => `- \`${p.slug}\`: ${p.name} — ${p.description || "No description"}`)
        .join("\n")
    : "No existing processes available.";

  const industryContext = ctx.industryProfile
    ? `\n## Industry Context\nIndustry: ${ctx.industryProfile.name}\nTypical patterns:\n${ctx.industryProfile.patterns.map(p => `- ${p.name} (${p.importance}): ${p.description}`).join("\n")}`
    : "";

  const webContext = ctx.webSearchResults.length > 0
    ? `\n## Web Research\n${ctx.webSearchResults.map((r, i) => `### Search ${i + 1}\n${r}`).join("\n\n")}`
    : "";

  const system = `You are a goal decomposition engine. Your job is to break down a complex goal into actionable sub-goals.

## Rules
1. Produce ${TARGET_SUBGOAL_MIN}-${TARGET_SUBGOAL_MAX} sub-goals (if more needed, group into phases)
2. Each sub-goal must be independently actionable
3. Include dependency ordering between sub-goals (which must complete before others can start)
4. Extract explicit assumptions — things you're assuming that could be wrong
5. Assess your confidence: "high" (clear path), "medium" (reasonable path with unknowns), "low" (significant uncertainty)
6. For each sub-goal, estimate complexity: "low" (hours), "medium" (days), "high" (weeks+)

## Output Format
Respond with ONLY a JSON object (no markdown fences, no extra text):
{
  "subGoals": [
    {
      "title": "Short actionable title",
      "description": "What needs to be done and why",
      "dependsOn": [],
      "estimatedComplexity": "low" | "medium" | "high"
    }
  ],
  "assumptions": ["Assumption 1", "Assumption 2"],
  "confidence": "high" | "medium" | "low",
  "reasoning": "One paragraph explaining the decomposition strategy"
}

Important:
- Sub-goal indices (0-based) are used for dependsOn references
- dependsOn is an array of indices of other sub-goals that must complete first
- An empty dependsOn means the sub-goal can start immediately`;

  const user = `## Goal
${ctx.goalDescription}

## Clarity Assessment
${dimensionSummary}
Overall clarity: ${ctx.dimensionMap.overallClarity}

## Available Process Inventory
${processList}
${industryContext}
${webContext}

Decompose this goal into sub-goals.`;

  return { system, user };
}

// ============================================================
// Response parsing
// ============================================================

interface ParsedDecomposition {
  subGoals: SubGoal[];
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

function parseDecompositionResponse(
  text: string,
  goalId: string,
  goalDescription: string,
): ParsedDecomposition {
  try {
    const cleaned = text
      .replace(/```json?\s*\n?/g, "")
      .replace(/```\s*$/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      subGoals: Array<{
        title: string;
        description: string;
        dependsOn: number[];
        estimatedComplexity: "low" | "medium" | "high";
      }>;
      assumptions: string[];
      confidence: "high" | "medium" | "low";
      reasoning: string;
    };

    // Generate stable IDs for sub-goals
    const subGoalIds = parsed.subGoals.map(() => randomUUID());

    const subGoals: SubGoal[] = parsed.subGoals.map((sg, idx) => ({
      id: subGoalIds[idx],
      title: sg.title,
      description: sg.description,
      routing: "find" as const, // default — tagged properly in tagSubGoals()
      dependsOn: (sg.dependsOn || [])
        .filter(depIdx => depIdx >= 0 && depIdx < subGoalIds.length && depIdx !== idx)
        .map(depIdx => subGoalIds[depIdx]),
      estimatedComplexity: sg.estimatedComplexity || "medium",
    }));

    return {
      subGoals,
      assumptions: parsed.assumptions || [],
      confidence: parsed.confidence || "medium",
      reasoning: parsed.reasoning || "Decomposition completed",
    };
  } catch {
    // Fallback: single sub-goal matching the original goal
    const fallbackId = randomUUID();
    return {
      subGoals: [{
        id: fallbackId,
        title: goalDescription.slice(0, 100),
        description: goalDescription,
        routing: "find",
        dependsOn: [],
        estimatedComplexity: "high",
      }],
      assumptions: ["LLM decomposition failed — falling back to single sub-goal"],
      confidence: "low",
      reasoning: "Failed to parse LLM decomposition response — created single sub-goal as fallback",
    };
  }
}

// ============================================================
// Sub-goal tagging (find vs build)
// ============================================================

/**
 * Tag each sub-goal as "find" or "build" based on whether the process
 * inventory has a likely match.
 *
 * Uses simple keyword matching — Brief 103 adds proper find-or-build routing.
 */
function tagSubGoals(
  subGoals: SubGoal[],
  processInventory: ProcessInventoryItem[],
): SubGoal[] {
  if (processInventory.length === 0) {
    return subGoals.map(sg => ({ ...sg, routing: "build" as const }));
  }

  return subGoals.map(sg => {
    const text = `${sg.title} ${sg.description}`.toLowerCase();
    const hasMatch = processInventory.some(proc => {
      const procText = `${proc.slug} ${proc.name} ${proc.description || ""}`.toLowerCase();
      const procTokens = procText.split(/\s+/).filter(t => t.length > 2);
      const matchCount = procTokens.filter(token => text.includes(token)).length;
      return matchCount >= 2; // at least 2 token overlap
    });

    return {
      ...sg,
      routing: hasMatch ? "find" as const : "build" as const,
    };
  });
}

// ============================================================
// Phase grouping
// ============================================================

/**
 * Group sub-goals into phases when count exceeds TARGET_SUBGOAL_MAX.
 * Groups by dependency layers: phase 1 = no deps, phase 2 = depends on phase 1, etc.
 */
function groupIntoPhases(subGoals: SubGoal[]): GoalPhase[] {
  const phases: GoalPhase[] = [];
  const assigned = new Set<string>();
  let phaseNumber = 1;

  while (assigned.size < subGoals.length) {
    // Find all sub-goals whose dependencies are already assigned
    const readyGoals = subGoals.filter(sg =>
      !assigned.has(sg.id) &&
      sg.dependsOn.every(depId => assigned.has(depId)),
    );

    if (readyGoals.length === 0) {
      // Circular dependency — assign remaining to final phase
      const remaining = subGoals.filter(sg => !assigned.has(sg.id));
      phases.push({
        id: randomUUID(),
        name: `Phase ${phaseNumber}: Remaining`,
        subGoalIds: remaining.map(sg => sg.id),
        dependsOn: phases.length > 0 ? [phases[phases.length - 1].id] : [],
      });
      break;
    }

    const phase: GoalPhase = {
      id: randomUUID(),
      name: `Phase ${phaseNumber}`,
      subGoalIds: readyGoals.map(sg => sg.id),
      dependsOn: phases.length > 0 ? [phases[phases.length - 1].id] : [],
    };

    phases.push(phase);
    readyGoals.forEach(sg => assigned.add(sg.id));
    phaseNumber++;
  }

  return phases;
}
