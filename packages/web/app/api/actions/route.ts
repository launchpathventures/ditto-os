/**
 * Ditto Web — Surface Action Route Handler
 *
 * Receives action callbacks from content blocks (approve, edit, reject, etc.)
 * and routes them through handleSurfaceAction with session-scoped validation.
 *
 * AC14: Session-scoped validation per ADR-021 Section 8.
 *
 * Provenance: Brief 045, ADR-021.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const { actionId, userId, payload } = body as {
    actionId: string;
    userId?: string;
    payload?: Record<string, unknown>;
  };

  if (!actionId) {
    return Response.json({ success: false, message: "Missing actionId" }, { status: 400 });
  }

  // Lazy-load to avoid build-time DB conflicts
  const { handleSurfaceAction } = await import("../../../../../src/engine/surface-actions");

  const result = await handleSurfaceAction(
    userId ?? "default",
    actionId,
    payload,
  );

  return Response.json(result);
}
