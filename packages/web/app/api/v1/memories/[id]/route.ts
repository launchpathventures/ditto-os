/**
 * Memory GET API — Brief 227 memory detail surface.
 *
 *   GET /api/v1/memories/:id
 *     returns memory record + resolved project metadata for scope rendering
 *     + list of currently-active projects (for the restrict-picker).
 *
 * Workspace-session cookie auth.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, and, ne } from "drizzle-orm";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await checkWorkspaceAuth();
  if (authError) return authError;

  const { id } = await params;

  const { db } = await import("../../../../../../../src/db");
  const schema = await import("../../../../../../../src/db/schema");

  const [memory] = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.id, id))
    .limit(1);

  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  // For process-scope memories, resolve the project id + slug via processes FK
  let memoryProjectId: string | null = null;
  let memoryProjectSlug: string | null = null;
  if (memory.scopeType === "process") {
    const [proc] = await db
      .select({ projectId: schema.processes.projectId })
      .from(schema.processes)
      .where(eq(schema.processes.id, memory.scopeId))
      .limit(1);
    memoryProjectId = proc?.projectId ?? null;
    if (memoryProjectId) {
      const [proj] = await db
        .select({ slug: schema.projects.slug })
        .from(schema.projects)
        .where(eq(schema.projects.id, memoryProjectId))
        .limit(1);
      memoryProjectSlug = proj?.slug ?? null;
    }
  }

  // List currently-active projects (for the restrict-picker)
  const activeProjects = await db
    .select({
      id: schema.projects.id,
      slug: schema.projects.slug,
      name: schema.projects.name,
    })
    .from(schema.projects)
    .where(and(
      eq(schema.projects.status, "active"),
      ne(schema.projects.kind, "track" as any),
    ));

  return NextResponse.json({
    memory: {
      id: memory.id,
      type: memory.type,
      content: memory.content,
      scopeType: memory.scopeType,
      scopeId: memory.scopeId,
      reinforcementCount: memory.reinforcementCount,
      lastReinforcedAt: memory.lastReinforcedAt,
      confidence: memory.confidence,
      appliedProjectIds: memory.appliedProjectIds,
      memoryProjectId,
      memoryProjectSlug,
    },
    activeProjects,
  });
}
