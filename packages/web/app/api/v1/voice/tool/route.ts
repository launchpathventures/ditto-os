/**
 * POST /api/v1/voice/tool — ElevenLabs server tool webhook (Brief 142b)
 *
 * Single endpoint handling all server tools for the ElevenLabs voice agent.
 * Each tool call includes a `tool` field identifying which tool to execute.
 *
 * Tools:
 * - get_context: Returns session state + process guidance
 * - update_learned: Records what the agent learned about the visitor
 * - fetch_url: Fetches a URL and returns a summary
 * - search: Searches for prospects/companies
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Load env from root .env
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }

    const body = await request.json();
    const { tool, sessionId, voiceToken } = body as {
      tool: string;
      sessionId?: string;
      voiceToken?: string;
    };

    console.log(`[voice/tool] ${tool} called (session: ${sessionId?.slice(0, 8)}...)`);

    if (!sessionId || !voiceToken) {
      return NextResponse.json({ error: "Missing sessionId or voiceToken" }, { status: 400 });
    }

    const { loadSessionForVoice, appendTextContext } = await import(
      "../../../../../../../src/engine/network-chat"
    );

    const session = await loadSessionForVoice(sessionId, voiceToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    switch (tool) {
      case "get_context": {
        return handleGetContext(session);
      }

      case "update_learned": {
        // Tool sends flat fields (name, business, target, etc.) directly on body
        const { name, business, target, location, problem, role, industry, channel } = body as Record<string, string | undefined>;
        const learned: Record<string, string | null> = {};
        if (name) learned.name = name;
        if (business) learned.business = business;
        if (target) learned.target = target;
        if (location) learned.location = location;
        if (problem) learned.problem = problem;
        if (role) learned.role = role;
        if (industry) learned.industry = industry;
        if (channel) learned.channel = channel;
        return handleUpdateLearned(session, Object.keys(learned).length > 0 ? learned : null);
      }

      case "fetch_url": {
        const { url } = body as { url?: string };
        return handleFetchUrl(session, url);
      }

      case "search": {
        const { query } = body as { query?: string };
        return handleSearch(session, query);
      }

      default:
        return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[voice/tool] Error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ============================================================
// Tool Handlers
// ============================================================

interface SessionLike {
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  learned: Record<string, string | null> | null;
  messageCount: number;
  requestEmailFlagged: boolean;
}

// Guidance is now provided by AI evaluation (evaluateVoiceConversation)
// These are only used as fallbacks for get_context tool calls
function buildFallbackGuidance(session: SessionLike): string {
  const l = session.learned;
  if (!l?.name) return "Ask the visitor's name.";
  if (!l?.business) return "Ask about their business.";
  return "Continue the conversation. React with substance, ask one question.";
}

function handleGetContext(session: SessionLike) {
  // Check for recent text input (messages from text chat during voice call)
  const recentTextInput = session.messages
    .slice(-3)
    .filter((m) => m.role === "user" && !m.content.startsWith("["))
    .map((m) => m.content)
    .pop();

  return NextResponse.json({
    learned: session.learned || {},
    stage: "gathering",
    guidance: buildFallbackGuidance(session),
    messageCount: session.messageCount,
    recentTextInput: recentTextInput || null,
  });
}

async function handleUpdateLearned(
  session: SessionLike,
  learned?: Record<string, string | null> | null,
) {
  if (!learned || Object.keys(learned).length === 0) {
    return NextResponse.json({ success: true, stage: "gathering" });
  }

  // Import DB access
  const { db, schema } = await import("../../../../../../../src/db");
  const { eq } = await import("drizzle-orm");

  // Merge with existing learned context
  const merged = { ...(session.learned || {}), ...learned };

  await db
    .update(schema.chatSessions)
    .set({ learned: merged, updatedAt: new Date() })
    .where(eq(schema.chatSessions.sessionId, session.sessionId));

  console.log(`[voice/tool] update_learned: ${JSON.stringify(merged)}`);

  const updatedSession = { ...session, learned: merged };
  return NextResponse.json({
    success: true,
    stage: "gathering",
    next_instruction: buildFallbackGuidance(updatedSession),
  });
}

async function handleFetchUrl(session: SessionLike, url?: string) {
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  console.log(`[voice/tool] fetch_url: ${url}`);

  const { fetchUrlContent } = await import("../../../../../../../src/engine/web-fetch");

  const result = await fetchUrlContent(url);
  if (!result.content) {
    return NextResponse.json({
      summary: `I couldn't load ${url} — it might be down or blocking automated access.`,
    });
  }

  // Also write enrichment to session for the chat UI to display
  const { db, schema } = await import("../../../../../../../src/db");
  const { eq } = await import("drizzle-orm");

  const messages = [...session.messages, {
    role: "assistant",
    content: `I've looked at ${url} — here's what I found:\n\n${result.content.slice(0, 2000)}`,
  }];

  await db
    .update(schema.chatSessions)
    .set({ messages, updatedAt: new Date() })
    .where(eq(schema.chatSessions.sessionId, session.sessionId));

  // Return summary + process guidance for the voice agent
  const summary = result.content.slice(0, 1500);
  return NextResponse.json({
    content: summary,
    summary: `Here's the content from ${url}: ${summary.slice(0, 500)}`,
    next_instruction: buildFallbackGuidance(session),
  });
}

async function handleSearch(session: SessionLike, query?: string) {
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  console.log(`[voice/tool] search: ${query}`);

  const { webSearch } = await import("../../../../../../../src/engine/web-search");

  const results = await webSearch(query);
  if (!results) {
    return NextResponse.json({ summary: "The search didn't return useful results. Try a different angle." });
  }

  return NextResponse.json({
    results: results.slice(0, 1500),
    summary: results.slice(0, 800),
  });
}
