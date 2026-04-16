/**
 * Coverage Agent — System Agent Module (MP-10.3)
 *
 * Periodic gap analysis: compares user's active processes against
 * industry patterns from the template library. Surfaces specific,
 * actionable suggestions — not generic "you should try X."
 *
 * The coverage-agent runs on a configurable schedule (default: weekly)
 * and produces CoverageSuggestion objects consumed by suggest_next.
 *
 * Provenance: ADR-008 system agent pattern, Brief 165, Insight-142.
 */

import type { StepExecutionResult } from "../step-executor";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import {
  matchIndustry,
  findCoverageGaps,
  type ProcessPattern,
} from "../industry-patterns";
import { getUserModel } from "../user-model";
import { isDuplicateOfExistingProcess } from "../self-tools/suggest-next";
import { findProcessModelSync } from "./process-model-lookup";

export interface CoverageSuggestion {
  /** Gap pattern ID */
  patternId: string;
  /** Human-friendly gap name */
  name: string;
  /** Why this gap matters for this user */
  rationale: string;
  /** Importance: core, common, optional */
  importance: "core" | "common" | "optional";
  /** Suggested template slug if a matching template exists */
  templateSlug: string | null;
}

/**
 * Execute coverage analysis as a system agent step.
 * Scans for gaps between active processes and industry patterns.
 * Returns structured CoverageSuggestion[] for suggest_next to consume.
 */
export async function executeCoverageAgent(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const userId = (inputs.userId as string) ?? "default";

  // 1. Load user model to determine industry
  const userModel = await getUserModel(userId);
  const signals = userModel.entries.map((e) => e.content);
  const industry = matchIndustry(signals);

  if (!industry) {
    return {
      outputs: {
        "coverage-suggestions": [],
        "analysis-summary": "No industry match — not enough user model data to identify business type.",
      },
      confidence: "medium",
      logs: ["No industry match found from user model signals"],
    };
  }

  // 2. Load active processes
  const activeProcesses = await db
    .select({
      slug: schema.processes.slug,
      name: schema.processes.name,
      description: schema.processes.description,
    })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  // 3. Find gaps
  const gaps = findCoverageGaps(industry, activeProcesses);

  // 4. Filter out gaps that are duplicates of existing processes (fuzzy dedup)
  const dedupedGaps = gaps.filter(
    (gap) => !isDuplicateOfExistingProcess(gap.name, gap.keywords, activeProcesses),
  );

  // 5. Build suggestions with rationale and template matching
  const suggestions: CoverageSuggestion[] = dedupedGaps.map((gap) => {
    const template = findProcessModelSync(gap.name);
    return {
      patternId: gap.id,
      name: gap.name,
      rationale: buildRationale(gap, industry.name, activeProcesses.length),
      importance: gap.importance,
      templateSlug: template?.slug ?? null,
    };
  });

  // Sort: core first, then common, then optional
  const sorted = suggestions.sort((a, b) => {
    const order = { core: 0, common: 1, optional: 2 };
    return order[a.importance] - order[b.importance];
  });

  // Cap at 5 suggestions per run
  const capped = sorted.slice(0, 5);

  const summary = capped.length > 0
    ? `Found ${capped.length} coverage gap(s) for ${industry.name}: ${capped.map((s) => s.name).join(", ")}.`
    : `No coverage gaps found — ${activeProcesses.length} active processes cover ${industry.name} patterns well.`;

  return {
    outputs: {
      "coverage-suggestions": capped,
      "analysis-summary": summary,
      "industry": industry.name,
      "active-process-count": activeProcesses.length,
      "gaps-found": capped.length,
    },
    confidence: "high", // Deterministic pattern matching
    logs: [
      `Industry: ${industry.name}`,
      `Active processes: ${activeProcesses.length}`,
      `Raw gaps: ${gaps.length}, after dedup: ${dedupedGaps.length}, returned: ${capped.length}`,
      ...capped.map((s) => `  Gap: ${s.name} (${s.importance})${s.templateSlug ? ` — template: ${s.templateSlug}` : ""}`),
    ],
  };
}

/** Build a human-readable rationale for why a gap matters. */
function buildRationale(
  gap: ProcessPattern,
  industryName: string,
  activeCount: number,
): string {
  const base = gap.description;
  if (gap.importance === "core") {
    return `${base}. Most ${industryName.toLowerCase()} businesses have this — it's a core capability.`;
  }
  if (gap.importance === "common" && activeCount >= 3) {
    return `${base}. With ${activeCount} processes already running, this is a natural next step.`;
  }
  return base;
}
