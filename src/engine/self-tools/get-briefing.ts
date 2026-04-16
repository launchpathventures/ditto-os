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
import { renderBlockToText } from "../content-blocks";
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

    // Freshness timestamp (Brief 158 MP-3.5)
    sections.push(`Briefing generated: ${briefing.generatedAt.toISOString()}`);

    // Stats header
    sections.push(`Since your last visit: ${briefing.stats.completedSinceLastVisit} completed, ${briefing.stats.activeRuns} running, ${briefing.stats.pendingReviews} reviews pending, ${briefing.stats.pendingHumanInput} waiting for your input, ${briefing.stats.totalExceptions} exceptions.`);

    // Familiarity hint
    sections.push(`User familiarity: ${briefing.userFamiliarity} (${briefing.userFamiliarity === "new" ? "be more detailed in briefing" : briefing.userFamiliarity === "developing" ? "moderate detail" : "be terse, they know the drill"}).`);

    // Autonomous digest (Brief 158 MP-3.1)
    if (briefing.autonomousDigest.length > 0) {
      sections.push("WHILE YOU WERE AWAY (auto-advanced):");
      for (const entry of briefing.autonomousDigest) {
        sections.push(`  ${entry.processName}: ${entry.summary}`);
      }
    }

    // Wait states (Brief 158 MP-3.2)
    if (briefing.waitStates.length > 0) {
      sections.push("WAITING FOR EXTERNAL EVENTS:");
      for (const ws of briefing.waitStates) {
        sections.push(`  ${ws.processName}: ${ws.description}`);
      }
    }

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

    // Trust milestones (Brief 160 MP-5.1/5.2) — celebrations and explanations
    if (briefing.trustMilestones.length > 0) {
      sections.push("TRUST MILESTONES (present as dedicated moments, not suggestions):");
      for (const milestone of briefing.trustMilestones) {
        sections.push(`  ${renderBlockToText(milestone)}`);
      }
    }

    // Spot-check transparency (Brief 160 MP-5.4)
    if (briefing.spotCheckTransparency.length > 0) {
      sections.push("SPOT-CHECK TRANSPARENCY (for context, not alarm):");
      for (const stats of briefing.spotCheckTransparency) {
        const pct = stats.autoAdvancedRuns > 0 ? Math.round((stats.autoPassedChecks / stats.autoAdvancedRuns) * 100) : 100;
        sections.push(`  ${stats.processName}: ${stats.sampledRuns} reviewed by me, ${stats.autoAdvancedRuns} handled automatically (${pct}% passed checks)`);
      }
    }

    // Suggestions
    if (briefing.suggestions.length > 0) {
      sections.push("SUGGESTIONS (max 1-2, offer naturally):");
      for (const sug of briefing.suggestions) {
        sections.push(`  ${sug.suggestion} — ${sug.reasoning}`);
      }
    }

    // Empty state (Brief 158 MP-3.3) — deterministic, no LLM hallucination
    const hasContent =
      briefing.focus.length > 0 ||
      briefing.attention.length > 0 ||
      briefing.upcoming.length > 0 ||
      briefing.risks.length > 0 ||
      briefing.autonomousDigest.length > 0 ||
      briefing.waitStates.length > 0 ||
      briefing.trustMilestones.length > 0 ||
      briefing.spotCheckTransparency.length > 0;

    if (!hasContent) {
      sections.push("Nothing needs your attention. Your processes are running smoothly.");
    }

    return {
      toolName: "get_briefing",
      success: true,
      output: sections.join("\n"),
      metadata: {
        stats: briefing.stats,
        focus: briefing.focus,
        generatedAt: briefing.generatedAt.toISOString(),
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
