/**
 * Ditto Web — Feed Route Handler
 *
 * GET /api/feed — assembles feed items from the engine and returns JSON.
 * POST /api/feed/review — handles inline review actions (approve/edit/reject).
 *
 * All engine calls server-side. No internals leak to browser.
 *
 * Provenance: Brief 041 (Feed & Review).
 */

import { getEngine } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { assembleFeed } = await getEngine();
    const feed = await assembleFeed();
    return Response.json(feed);
  } catch (error) {
    console.error("[/api/feed] Error assembling feed:", error);
    return Response.json(
      { error: "Failed to load feed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, processRunId, processId, pattern, editedText, reason } = body as Record<string, unknown>;

    // Validate action
    const validActions = ["approve", "edit", "reject", "teach", "dismiss-insight"] as const;
    if (
      typeof action !== "string" ||
      !validActions.includes(action as typeof validActions[number])
    ) {
      return Response.json(
        { error: "Invalid action. Must be: approve, edit, reject, teach, or dismiss-insight" },
        { status: 400 },
      );
    }

    // Dismiss-insight action persists "No" so the pattern doesn't resurface
    if (action === "dismiss-insight") {
      if (typeof processId !== "string" || processId.length === 0) {
        return Response.json(
          { error: "Missing or invalid processId for dismiss-insight action" },
          { status: 400 },
        );
      }
      if (typeof pattern !== "string" || pattern.length === 0) {
        return Response.json(
          { error: "Missing or invalid pattern for dismiss-insight action" },
          { status: 400 },
        );
      }

      const { dismissInsightPattern } = await getEngine();
      await dismissInsightPattern(processId as string, pattern as string);

      return Response.json({ success: true, message: "Insight dismissed" });
    }

    // Teach action has different required fields
    if (action === "teach") {
      if (typeof processId !== "string" || processId.length === 0) {
        return Response.json(
          { error: "Missing or invalid processId for teach action" },
          { status: 400 },
        );
      }
      if (typeof pattern !== "string" || pattern.length === 0) {
        return Response.json(
          { error: "Missing or invalid pattern for teach action" },
          { status: 400 },
        );
      }

      const { acceptCorrectionPattern, promoteToQualityCriteria, logTeachAction } = await getEngine();
      const { promoted } = await acceptCorrectionPattern(processId as string, pattern as string);
      const { criterion, alreadyExists } = await promoteToQualityCriteria(processId as string, pattern as string);

      // Log the teach action to activities
      await logTeachAction(processId as string, pattern as string, criterion);

      return Response.json({
        success: true,
        message: alreadyExists
          ? `Already learned: ${criterion}`
          : `Learned: ${criterion}`,
        promoted,
        criterion,
      });
    }

    // Review actions require processRunId
    if (typeof processRunId !== "string" || processRunId.length === 0) {
      return Response.json(
        { error: "Missing or invalid processRunId" },
        { status: 400 },
      );
    }

    const { approveRun, editRun, rejectRun } = await getEngine();

    switch (action) {
      case "approve": {
        const result = await approveRun(processRunId);
        return Response.json({
          success: result.action.success,
          message: result.action.message,
          correctionPattern: result.action.correctionPattern,
        });
      }

      case "edit": {
        if (typeof editedText !== "string" || editedText.length === 0) {
          return Response.json(
            { error: "Missing editedText for edit action" },
            { status: 400 },
          );
        }
        const result = await editRun(processRunId, editedText);
        return Response.json({
          success: result.action.success,
          message: result.action.message,
          correctionPattern: result.action.correctionPattern,
        });
      }

      case "reject": {
        if (typeof reason !== "string" || reason.length === 0) {
          return Response.json(
            { error: "Missing reason for reject action" },
            { status: 400 },
          );
        }
        const result = await rejectRun(processRunId, reason);
        return Response.json({
          success: result.success,
          message: result.message,
        });
      }

      default:
        return Response.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[/api/feed] Review action error:", error);
    return Response.json(
      { error: "Failed to process review action" },
      { status: 500 },
    );
  }
}
