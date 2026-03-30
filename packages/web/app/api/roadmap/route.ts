/**
 * Ditto Web — Roadmap API
 *
 * GET /api/roadmap — Returns phases, briefs, and stats for the roadmap composition.
 * Data comes from scanning docs/briefs/ and docs/roadmap.md via brief-index.ts.
 * Also syncs brief lifecycle to DB for meta-process consumption (Brief 056).
 *
 * Provenance: Brief 055 (Scope Selection + Roadmap Visualization), Brief 056.
 */

import { NextResponse } from "next/server";
import { applyConfigToEnv, loadConfig } from "@/lib/config";

async function getBriefIndex() {
  const config = loadConfig();
  if (config) applyConfigToEnv(config);

  const briefIndex = await import("../../../../../src/engine/brief-index");
  return briefIndex;
}

async function runBriefSync() {
  try {
    const { syncBriefs } = await import("../../../../../src/engine/brief-sync");
    await syncBriefs();
  } catch {
    // Non-critical — brief sync is supplementary to the file-based index
  }
}

export async function GET() {
  try {
    const engine = await getBriefIndex();
    const data = engine.buildRoadmapData();

    // Brief 056: Lazily sync brief lifecycle to DB for meta-process queries
    runBriefSync();

    // Strip filePath from briefs before sending to client
    const sanitized = {
      ...data,
      briefs: data.briefs.map(({ filePath: _, ...rest }) => rest),
    };

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Roadmap API error:", error);
    return NextResponse.json(
      { error: "Failed to load roadmap data" },
      { status: 500 },
    );
  }
}
