/**
 * Knowledge Extractor — System Agent Modules (Brief 060)
 *
 * Four system agent handlers for the knowledge-extraction process:
 * 1. context-analyzer: LLM-based classification (category, tags, severity)
 * 2. solution-extractor: LLM-based extraction (root cause, prevention, failed approaches)
 * 3. related-finder: SQL-based deduplication (metadata matching, not LLM)
 * 4. knowledge-assembler: Merges results, creates/updates solution memories
 *
 * Provenance: CE compound (3 parallel extractors), Reflexion (evidence-grounded),
 * Devin (structured extraction > self-summarization), Brief 060
 */

import type { StepExecutionResult } from "../step-executor";
import { createCompletion, extractText, getConfiguredModel } from "../llm";
import { db, schema } from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { writeMemory, updateMemory, deactivateMemory } from "../legibility/write-memory";

// ============================================================
// Types
// ============================================================

/** Solution memory metadata — stored as JSON in memories.metadata */
export interface SolutionMetadata {
  category: string;
  tags: string[];
  rootCause?: string;
  prevention?: string;
  failedApproaches?: string;
  severity?: "low" | "moderate" | "high" | "critical";
  sourceRunId: string;
  relatedMemoryIds?: string[];
}

/** Constrained category values (Brief 060 §1) */
export const SOLUTION_CATEGORIES = [
  "quality_correction",
  "data_accuracy",
  "format_structure",
  "calculation_logic",
  "process_gap",
] as const;

export type SolutionCategory = (typeof SOLUTION_CATEGORIES)[number];

// ============================================================
// 1. Context Analyzer — LLM-based classification
// ============================================================

export async function executeContextAnalyzer(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const diff = inputs.diff as string;
  const originalOutput = inputs.originalOutput as string;
  const comment = inputs.comment as string | undefined;
  const feedbackType = inputs.feedbackType as string;

  if (!diff) {
    throw new Error("Context analyzer requires diff input");
  }

  const systemPrompt = `You are a correction classifier for Ditto, an AI harness system. Analyze a human correction and classify it.

You MUST respond with ONLY a JSON object (no markdown, no explanation outside the JSON):
{
  "category": "<one of: quality_correction, data_accuracy, format_structure, calculation_logic, process_gap>",
  "tags": ["<lowercase>", "<hyphen-separated>"],
  "severity": "low" | "moderate" | "high" | "critical"
}

Category definitions:
- quality_correction: Output didn't meet quality criteria — corrected
- data_accuracy: Wrong data, missing data, stale data
- format_structure: Layout, template, formatting issues
- calculation_logic: Pricing errors, wrong formulas, logic bugs
- process_gap: The process itself is missing a step or has a wrong assumption

Rules:
- Tags must be lowercase, hyphen-separated, max 8 tags
- Tags should capture the specific domain concepts involved (e.g., "labour-estimate", "bathroom", "tight-access")
- severity: low = cosmetic, moderate = meaningful but not dangerous, high = significant error, critical = would cause harm if uncorrected
- Base your classification on the CONCRETE DIFF, not speculation`;

  const userMessage = `## Correction Details
Feedback type: ${feedbackType}
${comment ? `Human comment: ${comment}` : "No comment provided"}

## Original Output (excerpt)
${(originalOutput || "").slice(0, 2000)}

## Diff
${(typeof diff === "string" ? diff : JSON.stringify(diff)).slice(0, 3000)}`;

  try {
    const response = await createCompletion({
      model: getConfiguredModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 512,
    });

    const text = extractText(response.content);
    const result = parseContextAnalysis(text);

    return {
      outputs: { "context-analysis": result },
      tokensUsed: response.tokensUsed,
      costCents: response.costCents,
      confidence: "high",
      logs: [
        `Category: ${result.category}`,
        `Tags: ${result.tags.join(", ")}`,
        `Severity: ${result.severity}`,
      ],
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      outputs: {
        "context-analysis": {
          category: "quality_correction",
          tags: [],
          severity: "moderate",
        },
      },
      confidence: "low",
      logs: [`Context analysis failed, using defaults: ${errMsg}`],
    };
  }
}

function parseContextAnalysis(text: string): {
  category: SolutionCategory;
  tags: string[];
  severity: "low" | "moderate" | "high" | "critical";
} {
  try {
    const cleaned = text.replace(/```json?\s*\n?/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const category = SOLUTION_CATEGORIES.includes(parsed.category)
      ? (parsed.category as SolutionCategory)
      : "quality_correction";

    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .slice(0, 8)
          .map((t: unknown) => String(t).toLowerCase().replace(/[^a-z0-9-]/g, ""))
          .filter((t: string) => t.length > 0)
      : [];

    const severity = ["low", "moderate", "high", "critical"].includes(parsed.severity)
      ? (parsed.severity as "low" | "moderate" | "high" | "critical")
      : "moderate";

    return { category, tags, severity };
  } catch {
    return { category: "quality_correction", tags: [], severity: "moderate" };
  }
}

// ============================================================
// 2. Solution Extractor — LLM-based knowledge extraction
// ============================================================

export async function executeSolutionExtractor(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const diff = inputs.diff as string;
  const originalOutput = inputs.originalOutput as string;
  const editedOutput = inputs.editedOutput as string | undefined;
  const comment = inputs.comment as string | undefined;
  const feedbackType = inputs.feedbackType as string;

  if (!diff) {
    throw new Error("Solution extractor requires diff input");
  }

  const systemPrompt = `You are a solution knowledge extractor for Ditto. Analyze a human correction to extract reusable knowledge.

You MUST respond with ONLY a JSON object (no markdown, no explanation outside the JSON):
{
  "rootCause": "<what caused the problem — be specific, reference the evidence>",
  "failedApproaches": "<what the agent tried that didn't work — null if not applicable>",
  "solution": "<concise description of the correct approach>",
  "prevention": "<actionable check or rule to prevent recurrence>"
}

Rules:
- All fields are optional — populate only what's relevant
- rootCause must reference SPECIFIC evidence from the diff, not "the output was wrong"
- prevention must be an actionable check (e.g., "always check X before Y"), not a platitude
- solution should be concise (1-2 sentences max)
- For rejections without an edited version, focus on rootCause and prevention`;

  const userMessage = `## Correction Details
Feedback type: ${feedbackType}
${comment ? `Human comment: ${comment}` : "No comment provided"}

## Original Output (excerpt)
${(originalOutput || "").slice(0, 2000)}

${editedOutput ? `## Edited Output (excerpt)\n${editedOutput.slice(0, 2000)}` : "## No edited output (rejection)"}

## Diff
${(typeof diff === "string" ? diff : JSON.stringify(diff)).slice(0, 3000)}`;

  try {
    const response = await createCompletion({
      model: getConfiguredModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 512,
    });

    const text = extractText(response.content);
    const result = parseSolutionExtraction(text);

    return {
      outputs: { "solution-extraction": result },
      tokensUsed: response.tokensUsed,
      costCents: response.costCents,
      confidence: "high",
      logs: [
        `Root cause: ${result.rootCause || "N/A"}`,
        `Prevention: ${result.prevention || "N/A"}`,
      ],
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      outputs: {
        "solution-extraction": {
          rootCause: null,
          failedApproaches: null,
          solution: null,
          prevention: null,
        },
      },
      confidence: "low",
      logs: [`Solution extraction failed: ${errMsg}`],
    };
  }
}

function parseSolutionExtraction(text: string): {
  rootCause: string | null;
  failedApproaches: string | null;
  solution: string | null;
  prevention: string | null;
} {
  try {
    const cleaned = text.replace(/```json?\s*\n?/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      rootCause: parsed.rootCause || null,
      failedApproaches: parsed.failedApproaches || null,
      solution: parsed.solution || null,
      prevention: parsed.prevention || null,
    };
  } catch {
    return { rootCause: null, failedApproaches: null, solution: null, prevention: null };
  }
}

// ============================================================
// 3. Related Finder — SQL-based deduplication (NOT LLM)
// ============================================================

export interface RelatedSolution {
  memoryId: string;
  category: string;
  tags: string[];
  content: string;
  confidence: number;
  reinforcementCount: number;
  overlapLevel: "high" | "moderate" | "low" | "none";
  tagOverlapCount: number;
}

export async function executeRelatedFinder(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const processId = inputs.processId as string;

  if (!processId) {
    throw new Error("Related finder requires processId input");
  }

  // Query existing solution memories for this process
  const existingSolutions = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.type, "solution"),
        eq(schema.memories.active, true),
      ),
    );

  const relatedSolutions: RelatedSolution[] = existingSolutions.map((mem) => {
    const metadata = (mem.metadata ?? {}) as Record<string, unknown>;
    return {
      memoryId: mem.id,
      category: (metadata.category as string) || "unknown",
      tags: (metadata.tags as string[]) || [],
      content: mem.content,
      confidence: mem.confidence,
      reinforcementCount: mem.reinforcementCount,
      overlapLevel: "none" as const,
      tagOverlapCount: 0,
    };
  });

  return {
    outputs: { "related-solutions": relatedSolutions },
    confidence: "high",
    logs: [`Found ${relatedSolutions.length} existing solution memories for process ${processId}`],
  };
}

/**
 * Assess overlap between a new extraction and existing solutions.
 * Used by the assembler to decide create vs update vs supersede.
 *
 * AC7: SQL deduplication — metadata.category + metadata.tags matching, not LLM.
 */
export function assessOverlap(
  newCategory: string,
  newTags: string[],
  existingSolutions: RelatedSolution[],
): RelatedSolution[] {
  return existingSolutions.map((sol) => {
    const categoryMatch = sol.category === newCategory;
    const newTagSet = new Set(newTags);
    const tagOverlapCount = sol.tags.filter((t) => newTagSet.has(t)).length;
    const maxTags = Math.max(newTags.length, sol.tags.length, 1);
    const tagOverlapRatio = tagOverlapCount / maxTags;

    let overlapLevel: "high" | "moderate" | "low" | "none";
    if (categoryMatch && tagOverlapRatio >= 0.6) {
      overlapLevel = "high";
    } else if (categoryMatch && tagOverlapRatio >= 0.3) {
      overlapLevel = "moderate";
    } else if (categoryMatch || tagOverlapRatio > 0) {
      overlapLevel = "low";
    } else {
      overlapLevel = "none";
    }

    return { ...sol, overlapLevel, tagOverlapCount };
  });
}

// ============================================================
// 4. Knowledge Assembler — merges results, creates/updates memories
// ============================================================

export async function executeKnowledgeAssembler(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const processId = inputs.processId as string;
  const processRunId = inputs.processRunId as string;
  const feedbackId = inputs.feedbackId as string;

  if (!processId || !processRunId) {
    throw new Error("Knowledge assembler requires processId and processRunId inputs");
  }

  // Retrieve parallel step outputs from the run context
  // These are passed through the harness via step outputs
  const contextAnalysis = inputs["context-analysis"] as {
    category: SolutionCategory;
    tags: string[];
    severity: "low" | "moderate" | "high" | "critical";
  } | undefined;

  const solutionExtraction = inputs["solution-extraction"] as {
    rootCause: string | null;
    failedApproaches: string | null;
    solution: string | null;
    prevention: string | null;
  } | undefined;

  const relatedSolutions = inputs["related-solutions"] as RelatedSolution[] | undefined;

  // Use defaults if parallel outputs didn't arrive
  const category = contextAnalysis?.category ?? "quality_correction";
  const tags = contextAnalysis?.tags ?? [];
  const severity = contextAnalysis?.severity ?? "moderate";

  // Assess overlap with existing solutions
  const assessed = assessOverlap(category, tags, relatedSolutions ?? []);
  const highOverlap = assessed.find((s) => s.overlapLevel === "high");
  const moderateOverlap = assessed.find((s) => s.overlapLevel === "moderate");

  // Build solution content
  const contentParts: string[] = [];
  if (solutionExtraction?.solution) contentParts.push(solutionExtraction.solution);
  if (solutionExtraction?.rootCause) contentParts.push(`Root cause: ${solutionExtraction.rootCause}`);
  if (solutionExtraction?.prevention) contentParts.push(`Prevention: ${solutionExtraction.prevention}`);
  if (solutionExtraction?.failedApproaches) contentParts.push(`Failed approaches: ${solutionExtraction.failedApproaches}`);
  const content = contentParts.length > 0
    ? contentParts.join(". ")
    : `Correction in category ${category} (tags: ${tags.join(", ")})`;

  const metadata: SolutionMetadata = {
    category,
    tags,
    rootCause: solutionExtraction?.rootCause ?? undefined,
    prevention: solutionExtraction?.prevention ?? undefined,
    failedApproaches: solutionExtraction?.failedApproaches ?? undefined,
    severity,
    sourceRunId: processRunId,
    relatedMemoryIds: [],
  };

  let action: "created" | "reinforced" | "superseded";
  let memoryId: string;

  if (highOverlap) {
    // AC8: High overlap → update existing memory (reinforce)
    action = "reinforced";
    memoryId = highOverlap.memoryId;
    await updateMemory(db, highOverlap.memoryId, {
      reinforcementCount: highOverlap.reinforcementCount + 1,
      lastReinforcedAt: new Date(),
      confidence: Math.min(0.9, highOverlap.confidence + 0.1),
      content: content.length > highOverlap.content.length ? content : highOverlap.content,
      metadata: metadata as unknown as Record<string, unknown>,
    });
  } else {
    // AC8: Moderate or low/none → create new memory
    action = "created";
    memoryId = randomUUID();

    if (moderateOverlap) {
      // Add cross-reference
      metadata.relatedMemoryIds = [moderateOverlap.memoryId];
    }

    await writeMemory(db, {
      id: memoryId,
      scopeType: "process",
      scopeId: processId,
      type: "solution",
      content,
      metadata: metadata as unknown as Record<string, unknown>,
      source: "system",
      sourceId: feedbackId,
      confidence: 0.5, // AC11: Solution memories start at 0.5
      reinforcementCount: 1,
    });

    // AC13: Supersession — if new memory covers same category, check for older low-confidence ones
    await supersedeStaleSolutions(processId, category, tags, memoryId);
  }

  // Log activity
  await db.insert(schema.activities).values({
    action: `knowledge.${action}`,
    actorType: "system",
    entityType: "memory",
    entityId: memoryId,
    metadata: {
      processId,
      processRunId,
      feedbackId,
      category,
      tags,
      severity,
      action,
    },
  });

  return {
    outputs: {
      "knowledge-result": {
        memoryId,
        action,
        category,
        tags,
        severity,
      },
    },
    confidence: "high",
    logs: [
      `Knowledge ${action}: ${memoryId}`,
      `Category: ${category}, Tags: ${tags.join(", ")}`,
      `Severity: ${severity}`,
    ],
  };
}

/**
 * AC13: Supersession — newer solution for same category + similar tags
 * deactivates older lower-confidence solutions.
 */
async function supersedeStaleSolutions(
  processId: string,
  category: string,
  tags: string[],
  newMemoryId: string,
): Promise<void> {
  const existingSolutions = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.type, "solution"),
        eq(schema.memories.active, true),
      ),
    );

  for (const sol of existingSolutions) {
    if (sol.id === newMemoryId) continue;

    const meta = (sol.metadata ?? {}) as Record<string, unknown>;
    const solCategory = meta.category as string;
    const solTags = (meta.tags as string[]) || [];

    if (solCategory !== category) continue;

    // Check tag overlap
    const newTagSet = new Set(tags);
    const overlapCount = solTags.filter((t) => newTagSet.has(t)).length;
    const maxTags = Math.max(tags.length, solTags.length, 1);
    const overlapRatio = overlapCount / maxTags;

    // Supersede if same category + high tag overlap + lower confidence
    if (overlapRatio >= 0.6 && sol.confidence < 0.5) {
      await deactivateMemory(db, sol.id);

      await db.insert(schema.activities).values({
        action: "knowledge.superseded",
        actorType: "system",
        entityType: "memory",
        entityId: sol.id,
        metadata: { supersededBy: newMemoryId, reason: "newer_solution_same_category" },
      });
    }
  }
}

// ============================================================
// Significance Threshold (Brief 060 §3)
// ============================================================

/**
 * Check if a feedback event meets the significance threshold for knowledge extraction.
 *
 * AC5: Fires only when:
 * - editSeverity >= "moderate" (correction, revision, rewrite)
 * - OR feedback type is "reject"
 * - OR step had retry_on_failure triggered
 * - OR process is in first 10 completed runs
 * - OR correction pattern count >= 3
 *
 * AC6: Trust-tier-aware scaling:
 * - supervised: every significant correction
 * - spot_checked: sampled (~50%)
 * - autonomous: only on degradation events
 * - critical: every correction
 */
export async function checkSignificanceThreshold(params: {
  processId: string;
  feedbackType: "edit" | "reject";
  editSeverity?: string;
  trustTier: string;
  retryTriggered?: boolean;
}): Promise<boolean> {
  const { processId, feedbackType, editSeverity, trustTier } = params;

  // Check basic significance conditions
  const isSignificant = await isSignificantCorrection({
    processId,
    feedbackType,
    editSeverity,
    retryTriggered: params.retryTriggered,
  });

  if (!isSignificant) return false;

  // Apply trust-tier scaling
  switch (trustTier) {
    case "supervised":
      // Extract after every significant correction
      return true;
    case "spot_checked":
      // Sample ~50% of significant corrections
      return Math.random() < 0.5;
    case "autonomous":
      // Only on degradation events — rejection counts, moderate+ edits don't
      return feedbackType === "reject";
    case "critical":
      // Extract after every correction (not just significant)
      return true;
    default:
      return true;
  }
}

async function isSignificantCorrection(params: {
  processId: string;
  feedbackType: "edit" | "reject";
  editSeverity?: string;
  retryTriggered?: boolean;
}): Promise<boolean> {
  const { processId, feedbackType, editSeverity } = params;

  // Rejection is always significant
  if (feedbackType === "reject") return true;

  // Edit severity >= moderate (correction, revision, rewrite)
  // Note: brief says "editSeverity >= moderate" — the edit severity values are
  // formatting < correction < revision < rewrite (from trust-diff.ts classifyEdit)
  const significantSeverities = ["correction", "revision", "rewrite"];
  if (editSeverity && significantSeverities.includes(editSeverity)) return true;

  // AC5 condition: "step had retry_on_failure triggered"
  if (params.retryTriggered) return true;

  // Check if process is in first 10 completed runs
  const [{ count: completedRunCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.processRuns)
    .where(
      and(
        eq(schema.processRuns.processId, processId),
        eq(schema.processRuns.status, "approved"),
      ),
    );

  if (completedRunCount <= 10) return true;

  // Check correction pattern count >= 3
  const feedbackRecords = await db
    .select()
    .from(schema.feedback)
    .where(
      and(
        eq(schema.feedback.processId, processId),
        eq(schema.feedback.type, "edit"),
      ),
    );

  const patternCounts = new Map<string, number>();
  for (const fb of feedbackRecords) {
    if (fb.correctionPattern) {
      patternCounts.set(fb.correctionPattern, (patternCounts.get(fb.correctionPattern) || 0) + 1);
    }
  }

  for (const count of patternCounts.values()) {
    if (count >= 3) return true;
  }

  return false;
}

// ============================================================
// Confidence Decay (Brief 060 §5, AC12)
// ============================================================

/**
 * Decay solution memory confidence after N runs without retrieval.
 * Called during trust-evaluator runs (periodic). No new scheduled process needed.
 *
 * AC12: Decays by 0.1 after 50 runs without retrieval.
 * Pruned (active=false) when confidence drops below 0.2.
 */
export async function decaySolutionConfidence(processId: string): Promise<{
  decayed: number;
  pruned: number;
}> {
  // Count completed runs for this process
  const [{ count: totalRuns }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.processRuns)
    .where(
      and(
        eq(schema.processRuns.processId, processId),
        eq(schema.processRuns.status, "approved"),
      ),
    );

  // Get active solution memories for this process
  const solutions = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.type, "solution"),
        eq(schema.memories.active, true),
      ),
    );

  let decayed = 0;
  let pruned = 0;

  for (const sol of solutions) {
    const meta = (sol.metadata ?? {}) as Record<string, unknown>;
    const lastRetrievedAtRun = (meta.lastRetrievedAtRun as number) ?? 0;
    const runsSinceRetrieval = totalRuns - lastRetrievedAtRun;

    if (runsSinceRetrieval >= 50) {
      const newConfidence = Math.max(0, sol.confidence - 0.1);

      if (newConfidence < 0.2) {
        // Prune
        await deactivateMemory(db, sol.id);
        pruned++;
      } else {
        // Decay
        await updateMemory(db, sol.id, {
          confidence: newConfidence,
          metadata: meta as unknown as Record<string, unknown>,
        });
        decayed++;
      }
    }
  }

  return { decayed, pruned };
}
