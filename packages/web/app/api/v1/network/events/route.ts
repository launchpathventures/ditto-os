/**
 * GET /api/v1/network/events — SSE event stream for real-time updates (protected).
 * Supports Last-Event-ID header for reconnection.
 *
 * Provenance: Brief 089, ADR-025.
 */

import { authenticateRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  const { createSSEStream } = await import(
    "../../../../../../../src/engine/network-events"
  );

  // Parse Last-Event-ID for reconnection
  const lastEventIdHeader = request.headers.get("last-event-id");
  const lastEventId = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : undefined;

  const { stream } = createSSEStream(auth.userId, lastEventId);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
