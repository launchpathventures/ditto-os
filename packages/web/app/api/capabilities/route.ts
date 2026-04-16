/**
 * Ditto Web — Process Capabilities API
 *
 * GET /api/capabilities — Returns ProcessCapability[] from templates, cycles,
 * and active process runs. Powers the Library composition intent.
 * When userId query param is provided, capabilities are annotated with
 * relevance scoring from the capability matcher (Brief 168).
 *
 * Provenance: Growth API pattern (Brief 140), process-model-lookup.ts (template loading).
 */

import { NextResponse } from "next/server";
import { applyConfigToEnv, loadConfig } from "@/lib/config";

async function getProcessEngine() {
  const config = loadConfig();
  if (config) applyConfigToEnv(config);

  const processData = await import("../../../../../src/engine/process-data");
  return processData;
}

export async function GET(req: Request) {
  try {
    const engine = await getProcessEngine();
    // Brief 168 AC2: Pass userId for relevance scoring
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || undefined;
    const capabilities = await engine.getProcessCapabilities(userId);
    return NextResponse.json(capabilities);
  } catch (error) {
    console.error("Capabilities API error:", error);
    return NextResponse.json(
      { error: "Failed to load capabilities" },
      { status: 500 },
    );
  }
}
