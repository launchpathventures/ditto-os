/**
 * Ditto — Chat Thread Messages (append)
 *
 * POST /api/chat/threads/:id/messages
 *
 * Body: { userId, turns: ThreadTurn[] }
 *
 * Appends one or more turns to the thread. Chat client calls this after
 * the streaming reply completes so the assistant's turn (text + tool
 * names) persists alongside the user's turn.
 */

import { getEngine, type ThreadTurn } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_TURNS_PER_REQUEST = 20;
const MAX_TURN_CONTENT_LEN = 100_000;

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      userId?: string;
      turns?: ThreadTurn[];
    };
    const userId = body.userId ?? "default";
    const raw = Array.isArray(body.turns) ? body.turns : [];
    if (raw.length === 0) {
      return Response.json({ error: "No turns to append" }, { status: 400 });
    }
    if (raw.length > MAX_TURNS_PER_REQUEST) {
      return Response.json(
        { error: `At most ${MAX_TURNS_PER_REQUEST} turns per request` },
        { status: 400 },
      );
    }
    // Cap content length per turn to avoid unbounded session rows.
    const turns: ThreadTurn[] = raw.map((t) => ({
      role: String(t.role ?? "user"),
      content: String(t.content ?? "").slice(0, MAX_TURN_CONTENT_LEN),
      timestamp: typeof t.timestamp === "number" ? t.timestamp : Date.now(),
      surface: typeof t.surface === "string" ? t.surface : "web",
      ...(Array.isArray(t.toolNames)
        ? { toolNames: t.toolNames.map(String).slice(0, 32) }
        : {}),
    }));
    const { appendTurns } = await getEngine();
    const thread = await appendTurns(id, userId, turns);
    if (!thread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }
    return Response.json({ thread });
  } catch (error) {
    console.error("[/api/chat/threads/:id/messages] POST error:", error);
    return Response.json(
      { error: "Failed to append turns" },
      { status: 500 },
    );
  }
}
