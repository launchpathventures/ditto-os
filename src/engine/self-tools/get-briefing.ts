/**
 * Ditto — Self Tool: Get Briefing
 *
 * Assembles a contextual briefing with 5 dimensions + risk.
 * Returns structured data for the Self to weave into narrative.
 * The Self never says "risk" — it weaves signals naturally.
 *
 * Provenance: Linear Pulse (narrative briefing), Insight-076, Brief 043.
 */

import { assembleBriefing } from "../briefing-assembler";
import type { DelegationResult } from "../self-delegation";

interface GetBriefingInput {
  userId?: string;
}

export async function handleGetBriefing(
  input: GetBriefingInput,
): Promise<DelegationResult> {
  const userId = input.userId ?? "default";

  try {
    const briefing = await assembleBriefing(userId);

    // Build a structured summary the Self can reason with
    const sections: string[] = [];

    // Stats header
    sections.push(`Since your last visit: ${briefing.stats.completedSinceLastVisit} completed, ${briefing.stats.activeRuns} running, ${briefing.stats.pendingReviews} reviews pending, ${briefing.stats.pendingHumanInput} waiting for your input, ${briefing.stats.totalExceptions} exceptions.`);

    // Familiarity hint
    sections.push(`User familiarity: ${briefing.userFamiliarity} (${briefing.userFamiliarity === "new" ? "be more detailed in briefing" : briefing.userFamiliarity === "developing" ? "moderate detail" : "be terse, they know the drill"}).`);

    // Focus
    if (briefing.focus.length > 0) {
      sections.push("FOCUS (what needs attention first):");
      for (const item of briefing.focus) {
        sections.push(`  [${item.priority}] ${item.label}: ${item.reason}`);
      }
    }

    // Attention
    if (briefing.attention.length > 0) {
      sections.push("ATTENTION (aging items):");
      for (const item of briefing.attention) {
        sections.push(`  ${item.label}: ${item.daysSinceActivity} days without activity (${item.status})`);
      }
    }

    // Upcoming
    if (briefing.upcoming.length > 0) {
      sections.push("UPCOMING (predicted work):");
      for (const item of briefing.upcoming) {
        sections.push(`  ${item.label}: ${item.prediction}`);
      }
    }

    // Risk signals (labeled for the Self to weave in naturally — never show as "risk")
    if (briefing.risks.length > 0) {
      sections.push("SIGNALS TO WEAVE IN (do NOT use the word 'risk' — present naturally):");
      for (const risk of briefing.risks) {
        sections.push(`  [${risk.severity}] ${risk.entityLabel}: ${risk.detail}`);
      }
    }

    // Suggestions
    if (briefing.suggestions.length > 0) {
      sections.push("SUGGESTIONS (max 1-2, offer naturally):");
      for (const sug of briefing.suggestions) {
        sections.push(`  ${sug.suggestion} — ${sug.reasoning}`);
      }
    }

    // Nothing to brief
    if (
      briefing.focus.length === 0 &&
      briefing.attention.length === 0 &&
      briefing.upcoming.length === 0 &&
      briefing.risks.length === 0
    ) {
      sections.push("ALL QUIET — nothing needs the user. Say so briefly.");
    }

    return {
      toolName: "get_briefing",
      success: true,
      output: sections.join("\n"),
      metadata: {
        stats: briefing.stats,
        focus: briefing.focus,
      },
    };
  } catch (err) {
    return {
      toolName: "get_briefing",
      success: false,
      output: `Failed to assemble briefing: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
