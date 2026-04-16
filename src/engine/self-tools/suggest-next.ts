/**
 * Ditto — Self Tool: Suggest Next
 *
 * The unified suggestion surface for the Self's proactive guidance.
 * Generates suggestions drawing from all 9 user model dimensions,
 * industry patterns, process maturity, and coverage-agent findings.
 * Returns max 1-2 suggestions, zero during exceptions.
 *
 * Coverage gap detection now uses the capability matcher (Brief 167)
 * for deterministic, dimension-weighted matching against all templates.
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
 * This tool is the primary channel for Proactive Guidance (ADR-015,
 * Insight-142). The coverage-agent system agent produces structured
 * CoverageSuggestion objects that flow through this tool. The Self
 * weaves them into conversation or briefing — never as raw lists,
 * always as natural observations with timing and tone control.
 *
 * Three hunting sources feed coverage suggestions (Insight-142):
 * 1. Inward: process-discoverer finds patterns in user's connected data
 * 2. Outward: standards library + world knowledge for current best practices
 * 3. Cross-instance: community corrections refine the Process Model Library
 *
 * Provenance: APQC patterns, Insight-076, Insight-093, Insight-142, Brief 043, Brief 167.
 */

import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { getUserModel, getWorkingPatterns } from "../user-model";
import { computeTrustState } from "../trust";
import { getActiveDismissalHashes, hashContent } from "../suggestion-dismissals";
import { matchCapabilitiesWithSuppression, tokenize, stem } from "../capability-matcher";
import { detectWorkItemClusters } from "./work-item-clustering";
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
    const structuredSuggestions: Array<{ type: string; content: string; templateSlug?: string; suggestedProcessName?: string }> = [];

    // Load active processes once — used for dedup and coverage gap analysis
    const activeProcesses = await db
      .select({
        id: schema.processes.id,
        name: schema.processes.name,
        slug: schema.processes.slug,
        description: schema.processes.description,
        trustTier: schema.processes.trustTier,
      })
      .from(schema.processes)
      .where(eq(schema.processes.status, "active"));

    // 1. Coverage gaps — from capability matcher (Brief 167, AC13)
    // Replaces inline industry-pattern matching with dimension-weighted matcher.
    const { matches: capMatches } = await matchCapabilitiesWithSuppression(userId, userModel.entries);
    if (capMatches.length > 0) {
      const topMatch = capMatches[0];
      const content = `${topMatch.matchReason}. I can handle ${topMatch.templateName.toLowerCase()} for you.`;
      suggestions.push(`Coverage: ${content}`);
      structuredSuggestions.push({
        type: "Coverage",
        content,
        templateSlug: topMatch.templateSlug,
      });
    }

    // 1b. MP-10.2: Reactive-to-repetitive — detect work item clustering
    if (suggestions.length < 2) {
      const clusters = await detectWorkItemClusters(activeProcesses);
      for (const cluster of clusters) {
        if (suggestions.length >= 2) break;
        const templateHint = cluster.templateSlug
          ? ` (template: ${cluster.templateSlug})`
          : "";
        const content = `You've created ${cluster.count} similar ${cluster.label} items. Want me to set up a ${cluster.suggestedProcessName} process?${templateHint}`;
        suggestions.push(`Pattern: ${content}`);
        structuredSuggestions.push({
          type: "Pattern",
          content,
          // AC6: generate_process metadata for Self to use when user accepts
          templateSlug: cluster.templateSlug ?? undefined,
          suggestedProcessName: cluster.suggestedProcessName,
        });
      }
    }

    // 2. Trust maturity upgrades (AC9: process maturity)
    for (const proc of activeProcesses) {
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
        const matchingProc = activeProcesses.find(
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

    // Filter out recently dismissed suggestions (30-day cooldown)
    const dismissedHashes = await getActiveDismissalHashes(userId);
    const filtered = structuredSuggestions.filter(
      (s) => !dismissedHashes.has(hashContent(s.content)),
    );
    const filteredText = suggestions.filter((_s, i) =>
      structuredSuggestions[i] ? !dismissedHashes.has(hashContent(structuredSuggestions[i].content)) : true,
    );

    // Cap at 2
    const capped = filteredText.slice(0, 2);
    const cappedStructured = filtered.slice(0, 2);

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
      metadata: { suggestions: cappedStructured },
    };
  } catch (err) {
    return {
      toolName: "suggest_next",
      success: false,
      output: `Suggestion failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================
// MP-10.1: Dedup — fuzzy match suggestions against active processes
// ============================================================

interface ProcessInfo {
  slug: string;
  name: string;
  description: string | null;
}

/**
 * Check if a suggestion duplicates an existing process.
 * Uses slug match, name similarity, and keyword overlap.
 * Handles variants like "invoicing" ≈ "invoice-generation".
 */
export function isDuplicateOfExistingProcess(
  suggestionName: string,
  suggestionKeywords: string[],
  activeProcesses: ProcessInfo[],
): boolean {
  const nameLower = suggestionName.toLowerCase();
  const nameTokens = tokenize(nameLower);

  for (const proc of activeProcesses) {
    const slugLower = proc.slug.toLowerCase();
    const procNameLower = proc.name.toLowerCase();
    const descLower = (proc.description ?? "").toLowerCase();
    const procText = `${slugLower} ${procNameLower} ${descLower}`;
    const procTokens = tokenize(procText);

    // Exact slug or name match
    if (slugLower.includes(nameLower) || procNameLower.includes(nameLower)) {
      return true;
    }

    // Stem-level match: check if name stems overlap significantly
    const nameStems = nameTokens.map(stem);
    const procStems = procTokens.map(stem);
    const stemOverlap = nameStems.filter((s) => procStems.includes(s)).length;
    if (nameStems.length > 0 && stemOverlap / nameStems.length >= 0.5) {
      return true;
    }

    // Keyword match: if 2+ suggestion keywords appear in process text
    const keywordHits = suggestionKeywords.filter((kw) =>
      procText.includes(kw.toLowerCase()),
    );
    if (keywordHits.length >= 2) {
      return true;
    }
  }

  return false;
}
