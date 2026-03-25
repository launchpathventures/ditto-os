/**
 * Ditto Web — Credential Route Handler
 *
 * Receives masked credential input and stores to the vault.
 * This route bypasses the conversation log entirely — credentials
 * NEVER appear in session turns, activities, or stepRuns.
 *
 * AC12: API keys go directly to vault, never to conversation history.
 *
 * Provenance: Brief 040, credential-vault.ts (Brief 035).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const { service, processSlug, value } = body as {
    service: string;
    processSlug?: string;
    value: string;
  };

  if (!service || !value) {
    return new Response("service and value are required", { status: 400 });
  }

  try {
    // Lazy-load to avoid build-time DB conflicts
    const { storeCredential } = await import("../../../../../src/engine/credential-vault");

    // Store credential — scoped to process if provided, otherwise global scope
    const credProcessId = processSlug ?? "__global__";
    await storeCredential(credProcessId, service, value);

    return new Response(
      JSON.stringify({ success: true, message: `${service} credentials stored securely.` }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    // Log generic message only — never log the error object which could contain credential values
    console.error("[/api/credential] Credential storage failed for service:", service);
    return new Response("Failed to store credential.", { status: 500 });
  }
}
