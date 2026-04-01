/**
 * Ditto — Self Tool: Suggest Next
 *
 * Generates suggestions drawing from all 9 user model dimensions,
 * industry patterns, and process maturity. Returns max 1-2 suggestions,
 * zero during exceptions.
 *
 * Dimensions consulted (Insight-093):
 * - problems + tasks (immediate)
 * - vision + goals (strategic)
 * - challenges + frustrations (what to avoid)
 * - concerns (trust calibration)
 * - work patterns (timing)
 * - Industry patterns (coverage gaps)
 * - Process maturity (trust upgrades)
 *
 * Provenance: APQC patterns, Insight-076, Insight-093, Brief 043.
 */

import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { getUserModel, getWorkingPatterns } from "../user-model";
import { matchIndustry, findCoverageGaps } from "../industry-patterns";
import { computeTrustState } from "../trust";
import type { DelegationResult } from "../self-delegation";

interface SuggestNextInput {
  userId?: string;
  /** If true, skip suggestions (exceptions active) */
  hasExceptions?: boolean;
}

export async function handleSuggestNext(
  input: SuggestNextInput,
): Promise<DelegationResult> {
  const userId = input.userId ?? "default";

  // AC10: zero suggestions during exceptions
  if (input.hasExceptions) {
    return {
      toolName: "suggest_next",
      success: true,
      output: "Exceptions are active — fix those first. No suggestions right now.",
    };
  }

  try {
    const userModel = await getUserModel(userId);
    const suggestions: string[] = [];
    const structuredSuggestions: Array<{ type: string; content: string }> = [];

    // 1. Industry coverage gaps (AC9: industry patterns)
    const signals = userModel.entries.map((e) => e.content);
    const industry = matchIndustry(signals);

    if (industry) {
      const existingProcesses = await db
        .select({
          name: schema.processes.name,
          description: schema.processes.description,
        })
        .from(schema.processes)
        .where(eq(schema.processes.status, "active"));

      const gaps = findCoverageGaps(industry, existingProcesses);
      const coreGaps = gaps.filter((g) => g.importance === "core");
      const topGap = coreGaps[0] ?? gaps[0];

      if (topGap) {
        const content = `Other ${industry.name.toLowerCase()} businesses find ${topGap.name.toLowerCase()} useful — ${topGap.description.toLowerCase()}.`;
        suggestions.push(`Coverage: ${content}`);
        structuredSuggestions.push({ type: "Coverage", content });
      }
    }

    // 2. Trust maturity upgrades (AC9: process maturity)
    const processes = await db
      .select({
        id: schema.processes.id,
        name: schema.processes.name,
        slug: schema.processes.slug,
        trustTier: schema.processes.trustTier,
      })
      .from(schema.processes)
      .where(eq(schema.processes.status, "active"));

    for (const proc of processes) {
      if (proc.trustTier === "autonomous" || proc.trustTier === "critical") continue;

      const trustState = await computeTrustState(proc.id);
      if (
        trustState.runsInWindow >= 10 &&
        trustState.approvalRate >= 0.9 &&
        trustState.consecutiveCleanRuns >= 5
      ) {
        const content = `${proc.name} has been running smoothly (${Math.round(trustState.approvalRate * 100)}% approval, ${trustState.consecutiveCleanRuns} clean in a row). You could let it handle more on its own.`;
        suggestions.push(`Trust: ${content}`);
        structuredSuggestions.push({ type: "Trust", content });
        break; // Only suggest one trust upgrade at a time
      }
    }

    // 3. User model deepening (AC9: concerns, frustrations, vision, goals)
    if (userModel.missingDimensions.length > 0 && suggestions.length < 2) {
      // Prioritize strategic dimensions for returning users
      const strategicMissing = userModel.missingDimensions.filter(
        (d) => ["vision", "goals", "challenges"].includes(d),
      );
      const immediateMissing = userModel.missingDimensions.filter(
        (d) => ["problems", "tasks"].includes(d),
      );

      const target = userModel.completeness > 0.3
        ? strategicMissing[0] ?? userModel.missingDimensions[0]
        : immediateMissing[0] ?? userModel.missingDimensions[0];

      if (target) {
        const content = `I'd like to learn more about your ${target}. It helps me work better for you.`;
        suggestions.push(`Understanding: ${content}`);
        structuredSuggestions.push({ type: "Understanding", content });
      }
    }

    // 4. Process improvement — if corrections show a pattern (AC9: challenges + frustrations)
    const challengeEntries = userModel.entries.filter(
      (e) => e.dimension === "challenges" || e.dimension === "frustrations",
    );
    if (challengeEntries.length > 0 && suggestions.length < 2) {
      // Check if any known challenge maps to a process that could improve
      for (const entry of challengeEntries) {
        const matchingProc = processes.find(
          (p) =>
            p.name.toLowerCase().includes(entry.content.toLowerCase().split(" ")[0]) ||
            entry.content.toLowerCase().includes(p.name.toLowerCase()),
        );
        if (matchingProc) {
          const trustState = await computeTrustState(matchingProc.id);
          if (trustState.correctionRate > 0.2 && trustState.runsInWindow >= 3) {
            const content = `${matchingProc.name} corrections suggest it could work better for you. Want me to look at the patterns?`;
            suggestions.push(`Improvement: ${content}`);
            structuredSuggestions.push({ type: "Improvement", content });
            break;
          }
        }
      }
    }

    // 5. Working patterns — timing-based suggestions (AC9: work patterns)
    if (suggestions.length < 2) {
      const patterns = await getWorkingPatterns(userId);
      if (patterns && patterns.sessionsObserved >= 5 && patterns.checkFrequency < 0.5) {
        const content = `You check in about ${patterns.checkFrequency} times a day. Some of your work could benefit from more frequent check-ins — want me to flag things that need quick attention?`;
        suggestions.push(`Timing: ${content}`);
        structuredSuggestions.push({ type: "Timing", content });
      }
    }

    // Cap at 2
    const capped = suggestions.slice(0, 2);

    if (capped.length === 0) {
      return {
        toolName: "suggest_next",
        success: true,
        output: "No suggestions right now — things are running well.",
      };
    }

    return {
      toolName: "suggest_next",
      success: true,
      output: `Suggestions (${capped.length}):\n${capped.join("\n")}`,
      metadata: { suggestions: structuredSuggestions.slice(0, 2) },
    };
  } catch (err) {
    return {
      toolName: "suggest_next",
      success: false,
      output: `Suggestion failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
