/**
 * Ditto — Front Door Chat Handler (Brief 093)
 *
 * Orchestrates multi-turn conversation with Alex on the front door.
 * The LLM drives the conversation process — the handler provides
 * infrastructure (sessions, rate limiting, email detection) and
 * assembles visitor context from Ditto's data layer so Alex
 * actually knows who it's talking to.
 *
 * Provenance: Formless.ai (conversational form), Drift (session-based chat), Brief 093.
 */

import { db, schema } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { createCompletion, extractText, getConfiguredModel } from "./llm";
import { mockCreateCompletion } from "./llm-mock";
import { buildFrontDoorPrompt, parseAlexResponse, type ChatContext, type VisitorContext } from "./network-chat-prompt";
import { startIntake, sendActionEmail } from "./self-tools/network-tools";
import { getPersonByEmail, getPersonMemories } from "./people";
import { webSearch } from "./web-search";
import type { LlmMessage } from "./llm";

// ============================================================
// Search Query Extraction
// ============================================================

/** Extract searchQuery from LLM JSON response (not part of ParsedAlexResponse — internal to handler) */
function parseSearchQuery(rawText: string): string | null {
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed.searchQuery === "string" && parsed.searchQuery.trim()) {
      return parsed.searchQuery.trim();
    }
  } catch {
    // Try code block extraction
    const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (typeof parsed.searchQuery === "string" && parsed.searchQuery.trim()) {
          return parsed.searchQuery.trim();
        }
      } catch { /* fall through */ }
    }
  }
  return null;
}

// ============================================================
// Constants
// ============================================================

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_MESSAGES_PER_SESSION = 20;
const MAX_MESSAGES_PER_IP_PER_HOUR = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================
// IP Hashing
// ============================================================

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "ditto-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// ============================================================
// Rate Limiting
// ============================================================

async function checkIpRateLimit(ipHash: string): Promise<boolean> {
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.funnelEvents)
    .where(
      and(
        sql`json_extract(${schema.funnelEvents.metadata}, '$.ipHash') = ${ipHash}`,
        sql`${schema.funnelEvents.createdAt} > ${oneHourAgoMs}`,
        sql`${schema.funnelEvents.event} = 'chat_message'`,
      ),
    );
  return (result[0]?.count ?? 0) < MAX_MESSAGES_PER_IP_PER_HOUR;
}

// ============================================================
// Funnel Events
// ============================================================

async function recordFunnelEvent(
  sessionId: string,
  event: string,
  surface: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.funnelEvents).values({
    sessionId,
    event,
    surface,
    metadata: metadata ?? null,
  });
}

/**
 * Record a funnel event from the frontend.
 */
export async function recordFrontendFunnelEvent(
  sessionId: string,
  event: string,
  surface: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await recordFunnelEvent(sessionId, event, surface, metadata);
}

// ============================================================
// Session Management
// ============================================================

interface ChatSession {
  id: string;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  context: string;
  ipHash: string;
  requestEmailFlagged: boolean;
  messageCount: number;
}

async function loadOrCreateSession(
  sessionId: string | null,
  context: ChatContext,
  ipHash: string,
): Promise<ChatSession> {
  if (sessionId) {
    const [existing] = await db
      .select()
      .from(schema.chatSessions)
      .where(
        and(
          eq(schema.chatSessions.sessionId, sessionId),
          sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
        ),
      );

    if (existing) {
      return {
        id: existing.id,
        sessionId: existing.sessionId,
        messages: existing.messages as Array<{ role: string; content: string }>,
        context: existing.context,
        ipHash: existing.ipHash,
        requestEmailFlagged: existing.requestEmailFlagged ?? false,
        messageCount: existing.messageCount ?? 0,
      };
    }
  }

  const newSessionId = randomUUID();
  const session: ChatSession = {
    id: randomUUID(),
    sessionId: newSessionId,
    messages: [],
    context,
    ipHash,
    requestEmailFlagged: false,
    messageCount: 0,
  };

  await db.insert(schema.chatSessions).values({
    id: session.id,
    sessionId: session.sessionId,
    messages: session.messages,
    context: session.context,
    ipHash: session.ipHash,
    requestEmailFlagged: false,
    messageCount: 0,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return session;
}

async function saveSession(session: ChatSession): Promise<void> {
  await db
    .update(schema.chatSessions)
    .set({
      messages: session.messages,
      requestEmailFlagged: session.requestEmailFlagged,
      messageCount: session.messageCount,
      updatedAt: new Date(),
    })
    .where(eq(schema.chatSessions.sessionId, session.sessionId));
}

// ============================================================
// Visitor Context Assembly (Ditto's data layer)
// ============================================================

/**
 * Look up what Ditto knows about a visitor by email.
 * Queries the people table, interactions, and person memories.
 * Returns structured context that gets injected into the system prompt.
 */
async function assembleVisitorContext(email: string): Promise<VisitorContext> {
  const person = await getPersonByEmail(email, "founder");
  if (!person) {
    return { email, isReturning: true };
  }

  // Load recent interactions
  const interactions = await db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.personId, person.id))
    .orderBy(desc(schema.interactions.createdAt))
    .limit(5);

  // Load person memories
  let memories: string[] = [];
  try {
    const personMemories = await getPersonMemories(person.id);
    memories = personMemories
      .filter((m) => m.active)
      .slice(0, 5)
      .map((m) => m.content);
  } catch {
    // memories table may not have data yet
  }

  return {
    email: person.email ?? email,
    name: person.name,
    organization: person.organization ?? undefined,
    role: person.role ?? undefined,
    journeyLayer: person.journeyLayer,
    trustLevel: person.trustLevel,
    personaAssignment: person.personaAssignment ?? undefined,
    lastInteractionAt: person.lastInteractionAt ? new Date(person.lastInteractionAt) : undefined,
    recentInteractions: interactions.map((i) => ({
      type: i.type,
      subject: i.subject ?? undefined,
      summary: i.summary ?? undefined,
      createdAt: new Date(i.createdAt),
    })),
    memories,
    isReturning: true,
  };
}

// ============================================================
// Name/Need Extraction from Conversation
// ============================================================

function extractNameFromConversation(messages: Array<{ role: string; content: string }>): string | undefined {
  for (const msg of messages) {
    if (msg.role === "user") {
      const nameMatch = msg.content.match(/(?:I'm|I am|my name is|this is)\s+([A-Z][a-z]+)/);
      if (nameMatch) return nameMatch[1];
    }
  }
  return undefined;
}

// Common pill/navigation messages that aren't real needs
const PILL_MESSAGES = new Set([
  "who do you work with?",
  "how does this actually work?",
  "i need to grow my network",
  "i need more clients",
  "i'm stuck on a problem",
  "i need to meet the right people",
  "help me find partners",
  "what can you do for me?",
]);

function extractNeedFromConversation(messages: Array<{ role: string; content: string }>): string | undefined {
  // Find the most substantive user message (skip pills, emails, short answers)
  const userMessages = messages
    .filter((m) => m.role === "user")
    .filter((m) => !EMAIL_REGEX.test(m.content.trim()))
    .filter((m) => !PILL_MESSAGES.has(m.content.trim().toLowerCase()))
    .filter((m) => m.content.trim().length > 15);

  // Use the longest user message as the need — it's usually the most descriptive
  if (userMessages.length === 0) return undefined;
  const best = userMessages.reduce((a, b) => a.content.length > b.content.length ? a : b);
  return best.content.trim().slice(0, 500);
}

// ============================================================
// Main Handler
// ============================================================

export interface ChatTurnResult {
  reply: string;
  sessionId: string;
  requestEmail?: boolean;
  emailCaptured?: boolean;
  done?: boolean;
  rateLimited?: boolean;
  suggestions?: string[];
}

export async function handleChatTurn(
  sessionId: string | null,
  message: string,
  context: ChatContext,
  ip: string,
  returningEmail?: string | null,
): Promise<ChatTurnResult> {
  const ipHash = hashIp(ip);

  // Rate limit: IP
  const ipAllowed = await checkIpRateLimit(ipHash);
  if (!ipAllowed) {
    return {
      reply: "We've been chatting a lot — drop me your email and I'll continue there. Better for both of us.",
      sessionId: sessionId || randomUUID(),
      requestEmail: true,
      rateLimited: true,
    };
  }

  // Load or create session
  const session = await loadOrCreateSession(sessionId, context, ipHash);

  // Rate limit: per-session
  if (session.messageCount >= MAX_MESSAGES_PER_SESSION) {
    return {
      reply: "We've been chatting a lot — drop me your email and I'll continue there. Better for both of us.",
      sessionId: session.sessionId,
      requestEmail: true,
      rateLimited: true,
    };
  }

  // Resolve model once — pass explicit model to bypass purpose routing
  let model: string | undefined;
  try { model = getConfiguredModel(); } catch { /* mock mode */ }

  // Intercept bracket-tagged funnel events from the frontend
  const funnelEventMatch = message.trim().match(/^\[(\w+)\]$/);
  if (funnelEventMatch) {
    const eventName = funnelEventMatch[1];
    await recordFunnelEvent(session.sessionId, eventName, context, { ipHash });
    return { reply: "", sessionId: session.sessionId };
  }

  // Record chat message event
  await recordFunnelEvent(session.sessionId, "chat_message", context, { ipHash });
  if (session.messageCount === 0) {
    await recordFunnelEvent(session.sessionId, "conversation_started", context);
  }

  const trimmedMessage = message.trim();

  // ============================================================
  // Assemble visitor context from Ditto's data layer
  // ============================================================

  // Determine the visitor's email from: returning cookie, email in message, or conversation history
  let knownEmail = returningEmail || null;
  let emailCaptured = false;

  if (EMAIL_REGEX.test(trimmedMessage)) {
    knownEmail = trimmedMessage;
    emailCaptured = true;

    // Trigger intake as side effect
    const name = extractNameFromConversation(session.messages);
    const need = extractNeedFromConversation(session.messages);
    // Create person record and send quick intro email (so they have Alex's email)
    // The detailed action email is sent later when Alex has gathered enough info (ACTIVATE)
    try { await startIntake(trimmedMessage, name, need, undefined, "alex"); } catch { /* non-fatal */ }
    await recordFunnelEvent(session.sessionId, "email_captured", context, {
      hasName: !!name, hasNeed: !!need,
    });

    session.messages.push({ role: "user", content: `[EMAIL_CAPTURED] ${trimmedMessage}` });
  } else {
    session.messages.push({ role: "user", content: trimmedMessage });
  }

  session.messageCount += 1;

  // Look up what Ditto knows about this person
  let visitorContext: VisitorContext | undefined;
  if (knownEmail) {
    try {
      visitorContext = await assembleVisitorContext(knownEmail);
    } catch {
      // Data layer unavailable — Alex proceeds without context
      visitorContext = { email: knownEmail, isReturning: !!returningEmail };
    }
  }

  // ============================================================
  // Build prompt + call LLM
  // ============================================================

  const llmMessages: LlmMessage[] = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const systemPrompt = buildFrontDoorPrompt(context, visitorContext);

  const llmRequest = { system: systemPrompt, messages: llmMessages, maxTokens: 256, ...(model ? { model } : {}) };
  let response;
  try {
    response = await createCompletion(llmRequest);
  } catch (err) {
    console.warn("[network-chat] LLM call failed, falling back to mock:", (err as Error).message);
    response = mockCreateCompletion(llmRequest);
  }

  const rawText = extractText(response.content);
  let { reply, requestEmail, done, resendEmail, suggestions } = parseAlexResponse(rawText);
  const searchQuery = parseSearchQuery(rawText);

  if (requestEmail) {
    session.requestEmailFlagged = true;
  }

  // Resend email if LLM requested it (returning user didn't get the first one)
  if (resendEmail && knownEmail) {
    try {
      await startIntake(knownEmail, undefined, undefined, undefined, "alex");
      console.log(`[network-chat] Resent welcome email to ${knownEmail}`);
    } catch { /* non-fatal */ }
  }

  // Web search: if Alex wants to look something up, do it and append results
  if (searchQuery) {
    const searchResults = await webSearch(searchQuery);
    if (searchResults) {
      // Feed results back to the LLM for a refined response
      session.messages.push({ role: "assistant", content: reply });
      session.messages.push({ role: "user", content: `[SEARCH_RESULTS for "${searchQuery}"]\n${searchResults}` });

      const followUpRequest = {
        system: systemPrompt,
        messages: session.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        maxTokens: 256,
        ...(model ? { model } : {}),
      };

      try {
        const followUp = await createCompletion(followUpRequest);
        const followUpParsed = parseAlexResponse(extractText(followUp.content));
        reply = followUpParsed.reply;
        done = followUpParsed.done;
        suggestions = followUpParsed.suggestions;
        // Remove the intermediate messages — the user sees one clean response
        session.messages.pop(); // search results
        session.messages.pop(); // first reply
      } catch {
        // Search enrichment failed — use original reply
        session.messages.pop();
        session.messages.pop();
      }
    }
  }

  // ACTIVATE: Alex has gathered enough — send action email and start the engine process
  if (done && knownEmail) {
    const conversationSummary = session.messages
      .filter((m) => m.role === "user" && !m.content.startsWith("["))
      .map((m) => `- ${m.content}`)
      .join("\n");
    const personName = extractNameFromConversation(session.messages);

    // Send the action email with what happens next
    try {
      await sendActionEmail(knownEmail, "alex", personName, conversationSummary);
    } catch { /* non-fatal */ }

    // Start the engine process — research targets, draft intros, get approval, send outreach
    try {
      const { startSystemAgentRun } = await import("./heartbeat");
      const person = await getPersonByEmail(knownEmail, "founder");

      // Extract target type from conversation (what kind of people they want to reach)
      const targetType = extractNeedFromConversation(session.messages) || "relevant contacts";

      await startSystemAgentRun("front-door-intake", {
        personId: person?.id || "unknown",
        email: knownEmail,
        name: personName,
        need: targetType,
        targetType,
        businessContext: conversationSummary,
        conversationSummary,
      }, "front-door-chat");

      console.log(`[network-chat] Started front-door-intake process for ${knownEmail}`);
    } catch (err) {
      // Process may not be synced yet — non-fatal, the email still went out
      console.warn("[network-chat] Could not start intake process:", (err as Error).message);
    }
  }

  session.messages.push({ role: "assistant", content: reply });
  await saveSession(session);

  return {
    reply,
    sessionId: session.sessionId,
    requestEmail,
    emailCaptured,
    done,
    suggestions,
  };
}
