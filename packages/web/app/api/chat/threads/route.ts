/**
 * Ditto — Chat Threads (list + create)
 *
 * GET  /api/chat/threads?userId=…&limit=…  — list recent threads
 * POST /api/chat/threads                   — create a thread
 *
 * Body/query shape mirrors the localStorage thread store the redesigned
 * workspace consumed before, so the client rewrite is a swap, not a new
 * contract.
 */

import { getEngine } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "default";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
    const { listThreads } = await getEngine();
    const threads = await listThreads(userId, limit);
    return Response.json({ threads });
  } catch (error) {
    console.error("[/api/chat/threads] GET error:", error);
    return Response.json(
      { error: "Failed to list threads" },
      { status: 500 },
    );
  }
}

const MAX_TITLE_LEN = 200;
const MAX_SCOPE_LEN = 100;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      title?: string;
      scope?: string;
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
    const { createThread } = await getEngine();
    const thread = await createThread(userId, { title, scope });
    return Response.json({ thread });
  } catch (error) {
    console.error("[/api/chat/threads] POST error:", error);
    return Response.json(
      { error: "Failed to create thread" },
      { status: 500 },
    );
  }
}
