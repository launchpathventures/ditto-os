/**
 * Memory Scope API — Brief 227.
 *
 *   POST /api/v1/memories/:id/scope
 *     body: { action: 'promote', scope: 'all' | { projectIds: string[] } }
 *           { action: 'demote',  targetProjectId: string }
 *
 * Direct-user action endpoint for the memory detail surface + KnowledgeCitation
 * peek's [Promote] ghost-button. Workspace-session cookie auth (same pattern
 * as `/api/v1/projects`).
 *
 * Insight-180 stepRunId guard: the underlying handlers require a stepRunId.
 * For direct-user actions the route synthesises a sentinel
 * (`web-direct-action:<userEmail>`) so the audit trail in the activities row
 * carries the actor identity without needing a real harness step run.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { handlePromoteMemoryScope } from "../../../../../../../../src/engine/self-tools/promote-memory-scope";
import { handleDemoteMemoryScope } from "../../../../../../../../src/engine/self-tools/demote-memory-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

async function checkWorkspaceAuth(): Promise<{ email: string } | NextResponse> {
  if (!process.env.WORKSPACE_OWNER_EMAIL) {
    // Local dev — no auth required, sentinel email
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

const promoteBody = z.object({
  action: z.literal("promote"),
  scope: z.union([
    z.literal("all"),
    z.object({ projectIds: z.array(z.string().min(1)).min(1) }),
  ]),
});

const demoteBody = z.object({
  action: z.literal("demote"),
  targetProjectId: z.string().min(1),
});

const scopeRequestBody = z.discriminatedUnion("action", [promoteBody, demoteBody]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await checkWorkspaceAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: memoryId } = await params;
  const stepRunId = `web-direct-action:${auth.email}`;

  let body: z.infer<typeof scopeRequestBody>;
  try {
    body = scopeRequestBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  if (body.action === "promote") {
    const result = await handlePromoteMemoryScope({
      memoryId,
      scope: body.scope,
      stepRunId,
      actorId: auth.email,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  // demote
  const result = await handleDemoteMemoryScope({
    memoryId,
    targetProjectId: body.targetProjectId,
    stepRunId,
    actorId: auth.email,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
