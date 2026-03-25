/**
 * Ditto Web — Process Data API
 *
 * GET /api/processes — list all active processes + work items for sidebar
 * GET /api/processes?id=<id> — get process detail
 * GET /api/processes?id=<id>&activities=true — get process activities
 * GET /api/processes?runId=<id> — get process run detail
 * POST /api/processes — update trust tier
 *
 * Provenance: Brief 042 (Navigation & Detail).
 */

import { NextRequest, NextResponse } from "next/server";
import { applyConfigToEnv, loadConfig } from "@/lib/config";

async function getProcessEngine() {
  const config = loadConfig();
  if (config) applyConfigToEnv(config);

  const processData = await import("../../../../../src/engine/process-data");
  return processData;
}

export async function GET(request: NextRequest) {
  try {
    const engine = await getProcessEngine();
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");
    const activities = searchParams.get("activities");
    const runId = searchParams.get("runId");

    // Process run detail
    if (runId) {
      const detail = await engine.getProcessRunDetail(runId);
      if (!detail) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
      return NextResponse.json(detail);
    }

    // Process detail
    if (id && activities) {
      const entries = await engine.getProcessActivities(id);
      return NextResponse.json({ activities: entries });
    }

    if (id) {
      const detail = await engine.getProcessDetail(id);
      if (!detail) {
        return NextResponse.json(
          { error: "Process not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(detail);
    }

    // List all processes + work items for sidebar
    const [processes, workItems] = await Promise.all([
      engine.listProcesses(),
      engine.listActiveWorkItems(),
    ]);

    return NextResponse.json({ processes, workItems });
  } catch (error) {
    console.error("Process API error:", error);
    return NextResponse.json(
      { error: "Failed to load process data" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const engine = await getProcessEngine();
    const body = await request.json();
    const { action } = body;

    if (action === "updateTrust") {
      const { processId, newTier, reason } = body;
      if (!processId || !newTier || !reason) {
        return NextResponse.json(
          { error: "Missing processId, newTier, or reason" },
          { status: 400 },
        );
      }

      const validTiers = ["supervised", "spot_checked", "autonomous", "critical"];
      if (!validTiers.includes(newTier)) {
        return NextResponse.json(
          { error: "Invalid trust tier" },
          { status: 400 },
        );
      }

      await engine.updateProcessTrust(processId, newTier, reason);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Process API error:", error);
    return NextResponse.json(
      { error: "Failed to update process" },
      { status: 500 },
    );
  }
}
