/**
 * Ditto — Chat Thread (detail + patch + delete)
 *
 * GET    /api/chat/threads/:id?userId=…  — fetch full thread with turns
 * PATCH  /api/chat/threads/:id           — rename / change scope / status
 * DELETE /api/chat/threads/:id           — drop thread
 */

import { getEngine } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "default";
    const { getThread } = await getEngine();
    const thread = await getThread(id, userId);
    if (!thread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }
    return Response.json({ thread });
  } catch (error) {
    console.error("[/api/chat/threads/:id] GET error:", error);
    return Response.json(
      { error: "Failed to load thread" },
      { status: 500 },
    );
  }
}

const MAX_TITLE_LEN = 200;
const MAX_SCOPE_LEN = 100;
const VALID_STATUSES = new Set(["active", "suspended", "closed"]);

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      userId?: string;
      title?: string;
      scope?: string;
      status?: string;
    };
    const userId = body.userId ?? "default";
    const title =
      typeof body.title === "string"
        ? body.title.slice(0, MAX_TITLE_LEN)
        : undefined;
    const scope =
      typeof body.scope === "string"
        ? body.scope.slice(0, MAX_SCOPE_LEN)
        : undefined;
    let status: "active" | "suspended" | "closed" | undefined;
    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) {
        return Response.json(
          { error: `status must be one of ${[...VALID_STATUSES].join(", ")}` },
          { status: 400 },
        );
      }
      status = body.status as "active" | "suspended" | "closed";
    }
    const { updateThread } = await getEngine();
    const thread = await updateThread(id, userId, { title, scope, status });
    if (!thread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }
    return Response.json({ thread });
  } catch (error) {
    console.error("[/api/chat/threads/:id] PATCH error:", error);
    return Response.json(
      { error: "Failed to update thread" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "default";
    const { deleteThread } = await getEngine();
    const ok = await deleteThread(id, userId);
    if (!ok) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error("[/api/chat/threads/:id] DELETE error:", error);
    return Response.json(
      { error: "Failed to delete thread" },
      { status: 500 },
    );
  }
}
