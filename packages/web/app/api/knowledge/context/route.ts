/**
 * Knowledge Context API — Neighboring chunks for citation verification (Layer 2).
 *
 * GET /api/knowledge/context?chunkId=X&window=2
 * Returns surrounding chunks from the same document.
 *
 * Provenance: Brief 079 (knowledge base), Layer 2 citation verification.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chunkId = searchParams.get("chunkId");
    const windowSize = parseInt(searchParams.get("window") ?? "2", 10);

    if (!chunkId) {
      return Response.json({ error: "chunkId is required" }, { status: 400 });
    }

    // Lazy-import engine to avoid build-time SQLite initialization
    const { getNeighboringContext } = await import(
      "../../../../src/engine/knowledge/search"
    );

    const result = await getNeighboringContext(chunkId, windowSize);

    return Response.json(result);
  } catch (error) {
    console.error("[/api/knowledge/context] Error:", error);
    return Response.json(
      { error: "Failed to load context" },
      { status: 500 },
    );
  }
}
