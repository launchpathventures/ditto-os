/**
 * Workspace Archive API — Brief 281.
 *
 * GET /api/v1/workspace/archive — read-only recall over durable workspace
 * artifacts (projects, processes, memories, work, reviews, recent
 * activity). Backs the chat-header Archive drawer.
 *
 * This route is a THIN auth adapter over the shared `recallWorkspace()`
 * helper — the same helper the `search_workspace` Self tool calls
 * in-process. The route never reimplements query logic and the tool never
 * self-HTTPs this route (Insight-211): one helper, two surfaces.
 *
 * Workspace-session cookie auth, mirroring `/api/v1/projects`. Production:
 * missing/invalid cookie → 401. Local dev (`WORKSPACE_OWNER_EMAIL` unset):
 * accessible without cookie.
 *
 * Read-only by contract — no POST/PUT/DELETE. The helper never mutates.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

async function checkWorkspaceAuth(): Promise<NextResponse | null> {
  if (!process.env.WORKSPACE_OWNER_EMAIL) return null;
  const cookieStore = await cookies();
  const session = cookieStore.get(WORKSPACE_SESSION_COOKIE);
  if (!session?.value) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sepIdx = session.value.lastIndexOf("|");
  const email = sepIdx === -1 ? session.value : session.value.substring(0, sepIdx);
  if (email.toLowerCase() !== process.env.WORKSPACE_OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;

  const url = new URL(req.url);
  const sp = url.searchParams;

  const query = sp.get("query")?.trim() || undefined;
  const projectSlug = sp.get("projectSlug")?.trim() || undefined;
  const status = sp.get("status")?.trim() || undefined;
  const includeArchived = sp.get("includeArchived") === "true";
  const limitRaw = sp.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  // `kinds` may repeat (?kinds=project&kinds=memory) or be comma-joined.
  const kindParams = sp.getAll("kinds");
  const kinds =
    kindParams.length > 0
      ? kindParams.flatMap((k) => k.split(",")).map((k) => k.trim()).filter(Boolean)
      : undefined;

  const { recallWorkspace, ALL_RECALL_KINDS } = await import(
    "../../../../../../../src/engine/workspace-recall"
  );

  const validKinds = kinds
    ? kinds.filter((k): k is (typeof ALL_RECALL_KINDS)[number] =>
        (ALL_RECALL_KINDS as readonly string[]).includes(k),
      )
    : undefined;

  const resp = await recallWorkspace({
    query,
    kinds: validKinds && validKinds.length > 0 ? validKinds : undefined,
    projectSlug,
    status,
    includeArchived,
    limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json(resp);
}
