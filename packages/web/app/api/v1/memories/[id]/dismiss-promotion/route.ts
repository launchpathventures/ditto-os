/**
 * Memory Promotion Dismissal API — Brief 227 AC #10 / Reviewer Crit-2.
 *
 *   POST /api/v1/memories/:id/dismiss-promotion
 *
 * Writes a `memory_promotion_dismissed` activity row, engaging the briefing
 * assembler's 30-day cross-project promotion cooldown. Called when the user
 * taps `[Keep per-project]` in the proactive SuggestionBlock.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleDismissPromotionProposal } from "../../../../../../../../src/engine/self-tools/dismiss-promotion-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

async function checkWorkspaceAuth(): Promise<{ email: string } | NextResponse> {
  if (!process.env.WORKSPACE_OWNER_EMAIL) {
    return { email: "local-dev@ditto" };
  }
  const cookieStore = await cookies();
  const session = cookieStore.get(WORKSPACE_SESSION_COOKIE);
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sepIdx = session.value.lastIndexOf("|");
  const email = sepIdx === -1 ? session.value : session.value.substring(0, sepIdx);
  if (email.toLowerCase() !== process.env.WORKSPACE_OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { email };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkWorkspaceAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: memoryId } = await params;
  const result = await handleDismissPromotionProposal({
    memoryId,
    stepRunId: `web-direct-action:${auth.email}`,
    actorId: auth.email,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
