/**
 * Ditto — Interaction Event API (Brief 056)
 *
 * POST /api/events/interaction
 *
 * Fire-and-forget endpoint for UI interaction signals.
 * Returns 202 Accepted immediately. Lost events are acceptable —
 * these are statistical signals, not transactional data.
 *
 * userId extracted server-side (hardcoded "default" for single-user MVP,
 * same pattern as /api/chat).
 */

import { NextResponse } from "next/server";

const VALID_EVENT_TYPES = new Set([
  "artifact_viewed",
  "composition_navigated",
  "brief_selected",
  "block_action_taken",
  "review_prompt_seen",
  "pipeline_progress_viewed",
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { eventType, entityId, properties } = body as {
      eventType?: string;
      entityId?: string;
      properties?: Record<string, unknown>;
    };

    if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
    }

    // TODO: Extract userId from authenticated session when multi-user support is added.
    // Single-user MVP: hardcoded "default" (same pattern as /api/chat).
    // The brief specifies session-based extraction — this is deferred debt.
    const userId = "default";

    // Fire-and-forget: record asynchronously, don't await
    import("../../../../../../src/engine/interaction-events").then(
      ({ recordInteractionEvent }) => {
        recordInteractionEvent(userId, {
          eventType: eventType as import("../../../../../../src/engine/interaction-events").InteractionEventType,
          entityId,
          properties: properties ?? {},
        }).catch(() => {
          // Silently ignore — statistical signals, not critical
        });
      },
    ).catch(() => {
      // Module import failure — non-critical
    });

    return new NextResponse(null, { status: 202 });
  } catch {
    return new NextResponse(null, { status: 202 });
  }
}
