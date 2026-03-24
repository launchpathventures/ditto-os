/**
 * Ditto Web — SSE Event Stream Route Handler
 *
 * Server-Sent Events endpoint for real-time harness events.
 * The browser subscribes to this stream to get live updates about
 * step completions, gate pauses, routing decisions, and run completions.
 *
 * AC8: SSE Route Handler at /api/events emits harness events.
 * AC11: Engine credentials and internals never reach the browser.
 */

import { getEngine } from "@/lib/engine";
import type { HarnessEvent } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sanitize harness events for the browser.
 * Strip any internal details that shouldn't be exposed.
 */
function sanitizeEvent(event: HarnessEvent): Record<string, unknown> {
  switch (event.type) {
    case "step-start":
      return {
        type: event.type,
        processRunId: event.processRunId,
        stepId: event.stepId,
        roleName: event.roleName,
        processName: event.processName,
      };
    case "step-complete":
      return {
        type: event.type,
        processRunId: event.processRunId,
        stepId: event.stepId,
        summary: event.summary.slice(0, 200),
        confidence: event.confidence,
        duration: event.duration,
      };
    case "gate-pause":
      return {
        type: event.type,
        processRunId: event.processRunId,
        stepId: event.stepId,
        reason: event.reason,
      };
    case "gate-advance":
      return {
        type: event.type,
        processRunId: event.processRunId,
        stepId: event.stepId,
        confidence: event.confidence,
      };
    case "run-complete":
      return {
        type: event.type,
        processRunId: event.processRunId,
        processName: event.processName,
        stepsExecuted: event.stepsExecuted,
      };
    case "run-failed":
      return {
        type: event.type,
        processRunId: event.processRunId,
        processName: event.processName,
        error: "Process run failed",
      };
    default:
      return { type: (event as HarnessEvent).type };
  }
}

export async function GET() {
  // Lazy-load engine to avoid build-time DB conflicts
  const { harnessEvents } = await getEngine();

  // Hoist cleanup refs so cancel() can access them via closure
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`),
      );

      unsubscribe = harnessEvents.on((event: HarnessEvent) => {
        try {
          const sanitized = sanitizeEvent(event);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(sanitized)}\n\n`),
          );
        } catch {
          // Don't let serialization errors kill the stream
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 30000);
    },
    cancel() {
      // Clean up on client disconnect
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
