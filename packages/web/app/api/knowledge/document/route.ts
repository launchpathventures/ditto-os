/**
 * Knowledge Document API — Full parsed markdown for document viewer (Layer 3).
 *
 * GET /api/knowledge/document?hash=X
 * Returns full parsed markdown, filename, format, and page count.
 *
 * Provenance: Brief 079 (knowledge base), Layer 3 document viewer.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get("hash");

    if (!hash) {
      return Response.json({ error: "hash is required" }, { status: 400 });
    }

    // Lazy-import to avoid build-time SQLite initialization
    const { db, schema } = await import("../../../../src/db");
    const { eq } = await import("drizzle-orm");

    // Get parsed markdown
    const content = await db
      .select()
      .from(schema.documentContent)
      .where(eq(schema.documentContent.documentHash, hash));

    if (content.length === 0) {
      return Response.json(
        { error: "Document not found. It may need to be re-ingested." },
        { status: 404 },
      );
    }

    // Get document metadata
    const docs = await db
      .select({ fileName: schema.documents.fileName, format: schema.documents.format })
      .from(schema.documents)
      .where(eq(schema.documents.contentHash, hash));

    const doc = docs[0];

    return Response.json({
      markdown: content[0].parsedMarkdown,
      fileName: doc?.fileName ?? "Unknown",
      format: doc?.format ?? "unknown",
      pageCount: content[0].pageCount,
    });
  } catch (error) {
    console.error("[/api/knowledge/document] Error:", error);
    return Response.json(
      { error: "Failed to load document" },
      { status: 500 },
    );
  }
}
