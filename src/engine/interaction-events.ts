/**
 * Ditto — Interaction Event Types and Recording (Brief 056)
 *
 * Semantic UI interaction signals for the learning layer.
 * These are implicit signals — weaker than explicit feedback but
 * high-volume and pattern-rich. They feed meta-processes (self-improvement,
 * project-orchestration), NOT trust computation.
 *
 * Privacy by design: events contain entity IDs and timestamps, not content.
 *
 * Provenance: PostHog/Segment event model (pattern), Brief 056.
 */

import { db, schema } from "../db";
import { and, eq, gte, desc } from "drizzle-orm";

// ============================================================
// Event types
// ============================================================

export type InteractionEventType =
  | "artifact_viewed"
  | "composition_navigated"
  | "brief_selected"
  | "block_action_taken"
  | "review_prompt_seen"
  | "pipeline_progress_viewed";

export interface ArtifactViewedProperties {
  artifactId: string;
  processRunId?: string;
  durationMs: number;
}

export interface CompositionNavigatedProperties {
  intent: string;
  fromIntent?: string;
}

export interface BriefSelectedProperties {
  briefNumber: number;
  action: "build" | "plan";
}

export interface BlockActionTakenProperties {
  blockType: string;
  actionId: string;
}

export interface ReviewPromptSeenProperties {
  runId: string;
  stepId: string;
  durationBeforeAction: number;
}

export interface PipelineProgressViewedProperties {
  runId: string;
  viewCount: number;
}

export type InteractionEventProperties =
  | ArtifactViewedProperties
  | CompositionNavigatedProperties
  | BriefSelectedProperties
  | BlockActionTakenProperties
  | ReviewPromptSeenProperties
  | PipelineProgressViewedProperties;

export interface InteractionEvent {
  eventType: InteractionEventType;
  entityId?: string;
  properties: Record<string, unknown>;
}

// ============================================================
// Recording
// ============================================================

/**
 * Record an interaction event to the database.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export async function recordInteractionEvent(
  userId: string,
  event: InteractionEvent,
): Promise<void> {
  try {
    await db.insert(schema.interactionEvents).values({
      userId,
      eventType: event.eventType,
      entityId: event.entityId ?? null,
      properties: event.properties,
    });
  } catch (error) {
    console.error("Failed to record interaction event:", error);
  }
}

// ============================================================
// Query helpers (for meta-processes and Self context)
// ============================================================

/**
 * Get recent interaction events for a user within the last N hours.
 */
export async function getRecentInteractionEvents(
  userId: string,
  hoursBack: number = 24,
): Promise<Array<{ eventType: string; entityId: string | null; properties: Record<string, unknown>; timestamp: Date }>> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const rows = await db
    .select({
      eventType: schema.interactionEvents.eventType,
      entityId: schema.interactionEvents.entityId,
      properties: schema.interactionEvents.properties,
      timestamp: schema.interactionEvents.timestamp,
    })
    .from(schema.interactionEvents)
    .where(
      and(
        eq(schema.interactionEvents.userId, userId),
        gte(schema.interactionEvents.timestamp, since),
      ),
    )
    .orderBy(desc(schema.interactionEvents.timestamp));

  return rows as Array<{ eventType: string; entityId: string | null; properties: Record<string, unknown>; timestamp: Date }>;
}

/**
 * Build an interaction signal summary for the Self's context.
 * Returns a concise string describing recent navigation patterns and unreviewed artifacts.
 */
export async function buildInteractionSummary(userId: string): Promise<string> {
  const events = await getRecentInteractionEvents(userId, 24);
  if (events.length === 0) return "";

  const lines: string[] = [];

  // Navigation patterns: count composition visits
  const navEvents = events.filter((e) => e.eventType === "composition_navigated");
  if (navEvents.length > 0) {
    const intentCounts = new Map<string, number>();
    for (const e of navEvents) {
      const intent = (e.properties as { intent?: string }).intent ?? "unknown";
      intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
    }
    const sorted = [...intentCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3).map(([intent, count]) => `${intent}(${count})`).join(", ");
    lines.push(`Navigation (24h): ${top}`);
  }

  // Artifact views: count and identify unreviewed
  const artifactViews = events.filter((e) => e.eventType === "artifact_viewed");
  if (artifactViews.length > 0) {
    const viewedIds = new Set(artifactViews.map((e) => e.entityId).filter(Boolean));
    lines.push(`Artifacts viewed (24h): ${viewedIds.size}`);
  }

  // Brief selections
  const briefSelections = events.filter((e) => e.eventType === "brief_selected");
  if (briefSelections.length > 0) {
    lines.push(`Briefs selected (24h): ${briefSelections.length}`);
  }

  // Review response times
  const reviewEvents = events.filter((e) => e.eventType === "review_prompt_seen");
  if (reviewEvents.length > 0) {
    const durations = reviewEvents
      .map((e) => (e.properties as { durationBeforeAction?: number }).durationBeforeAction)
      .filter((d): d is number => d !== undefined);
    if (durations.length > 0) {
      const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
      const avgSec = Math.round(avgMs / 1000);
      lines.push(`Avg review response: ${avgSec}s`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}
