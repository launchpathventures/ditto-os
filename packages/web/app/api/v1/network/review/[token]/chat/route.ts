/**
 * Review Page Chat API (Brief 106)
 *
 * POST /api/v1/network/review/[token]/chat
 *
 * Chat with Alex in the context of a review page. User identity
 * comes from the signed token (not from session/IP). The full
 * ContentBlock array is injected into Alex's system prompt so
 * Alex can reference specific items on the page.
 *
 * Uses a direct createCompletion call — NOT handleChatTurnStreaming.
 * The front-door chat infrastructure carries machinery (session mgmt,
 * email detection, funnel events, ACTIVATE flow) that doesn't apply
 * to review pages. The cognitive core IS loaded so Alex sounds like Alex.
 *
 * Rate limited: max 30 messages per token per hour (in-memory,
 * same pattern as IP-based rate limiting in network-chat).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// In-memory rate limiting (per-token, same pattern as network-chat)
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_MESSAGES_PER_TOKEN_PER_HOUR = 30;

function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(token);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(token, { count: 1, resetAt: now + 3600000 });
    return true;
  }

  if (entry.count >= MAX_MESSAGES_PER_TOKEN_PER_HOUR) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Rate limit check
  if (!checkRateLimit(token)) {
    return NextResponse.json(
      { error: "Too many messages. Please try again later." },
      { status: 429 },
    );
  }

  try {
    const { message } = (await request.json()) as { message?: string };
    if (!message || typeof message !== "string" || message.length > 2000) {
      return NextResponse.json(
        { error: "Message required (max 2000 chars)" },
        { status: 400 },
      );
    }

    const { getReviewPage, appendChatMessage } = await import(
      "@engine/review-pages"
    );

    // Validate token and get page
    const page = await getReviewPage(token);
    if (!page || page.status !== "active") {
      return NextResponse.json(
        { error: "This review page is no longer active" },
        { status: 404 },
      );
    }

    // Persist user message
    await appendChatMessage(token, "user", message);

    // Load Alex's cognitive core so Alex sounds like Alex
    const { getCognitiveCore } = await import("@engine/cognitive-core");
    const cognitiveCore = getCognitiveCore();

    // Build system prompt: cognitive core + review page context
    const systemPrompt = [
      cognitiveCore,
      "",
      "--- REVIEW PAGE CONTEXT ---",
      "",
      `You are chatting with ${page.userName || "a user"} who is viewing a review page you prepared.`,
      `Page title: "${page.title}"`,
      "",
      "The page contains:",
      JSON.stringify(page.contentBlocks, null, 2),
      "",
      "The user is viewing this content and may ask about specific items.",
      "Be concise. Reference specific content from the page when relevant.",
      "If they share context you didn't have (e.g., 'I know that person'), acknowledge it and note you'll incorporate it.",
      "Keep responses under 3 sentences — same as on the front door.",
    ].join("\n");

    // Use LLM for response
    const { createCompletion, extractText } = await import("@engine/llm");

    const chatHistory = ((page.chatMessages as Array<{ role: string; text: string }>) || []);

    const response = await createCompletion({
      system: systemPrompt,
      messages: [
        ...chatHistory.map((m) => ({
          role: m.role === "alex" ? ("assistant" as const) : ("user" as const),
          content: m.text,
        })),
        { role: "user" as const, content: message },
      ],
      maxTokens: 500,
      purpose: "conversation",
    });

    const reply = extractText(response.content);

    // Persist Alex's response
    await appendChatMessage(token, "alex", reply);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[review-chat] Error:", err);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 },
    );
  }
}
