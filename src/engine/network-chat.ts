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
import { createCompletion, extractText, extractToolUse, getConfiguredModel } from "./llm";
import { createStreamingCompletion, type StreamEvent } from "./llm-stream";
import { buildFrontDoorPrompt, ALEX_RESPONSE_TOOL, type ChatContext, type VisitorContext, type DetectedMode } from "./network-chat-prompt";
import { startIntake, sendActionEmail, sendCosActionEmail } from "./self-tools/network-tools";
import { getPersonByEmail, findPersonByEmailGlobal, getPersonMemories } from "./people";
import { webSearch } from "./web-search";
import type { LlmMessage } from "./llm";

// ============================================================
// Tool Call Extraction
// ============================================================

const VALID_MODES = new Set(["connector", "cos", "both"]);

interface AlexToolArgs {
  reply: string;
  suggestions: string[];
  requestEmail: boolean;
  done: boolean;
  resendEmail: boolean;
  detectedMode: DetectedMode;
  searchQuery: string | null;
}

/**
 * Extract structured response data from LLM content blocks.
 * Text blocks provide the reply; the alex_response tool call provides metadata.
 */
function extractAlexResponse(content: import("./llm").LlmContentBlock[]): AlexToolArgs {
  const reply = extractText(content).trim();
  const toolCalls = extractToolUse(content);

  const alexCall = toolCalls.find((tc) => tc.name === "alex_response");
  if (!alexCall) {
    // Fallback: no tool call — treat text as reply with defaults
    return {
      reply,
      suggestions: [],
      requestEmail: false,
      done: false,
      resendEmail: false,
      detectedMode: null,
      searchQuery: null,
    };
  }

  const args = alexCall.input as Record<string, unknown>;
  return {
    reply,
    suggestions: Array.isArray(args.suggestions)
      ? args.suggestions.filter((s): s is string => typeof s === "string")
      : [],
    requestEmail: Boolean(args.requestEmail),
    done: Boolean(args.done),
    resendEmail: Boolean(args.resendEmail),
    detectedMode:
      typeof args.detectedMode === "string" && VALID_MODES.has(args.detectedMode)
        ? (args.detectedMode as DetectedMode)
        : null,
    searchQuery:
      typeof args.searchQuery === "string" && args.searchQuery.trim()
        ? args.searchQuery.trim()
        : null,
  };
}

// ============================================================
// Test Mode
// ============================================================

function isTestMode(): boolean {
  return process.env.DITTO_TEST_MODE === "true";
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

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "ditto-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// ============================================================
// Rate Limiting
// ============================================================

export async function checkIpRateLimit(ipHash: string): Promise<boolean> {
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
  "i need help organizing my work",
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
  detectedMode?: DetectedMode;
  testMode?: boolean;
}

export async function handleChatTurn(
  sessionId: string | null,
  message: string,
  context: ChatContext,
  ip: string,
  returningEmail?: string | null,
  funnelMetadata?: Record<string, unknown>,
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
    await recordFunnelEvent(session.sessionId, eventName, context, { ipHash, ...funnelMetadata });
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
  // In test mode, ignore returningEmail so every visit feels like a new user
  let knownEmail = (isTestMode() ? null : returningEmail) || null;
  let emailCaptured = false;

  if (EMAIL_REGEX.test(trimmedMessage)) {
    knownEmail = trimmedMessage;
    emailCaptured = true;

    // Trigger intake as side effect — creates person record + sends intro email
    // In test mode, emails are suppressed at the channel adapter level
    const name = extractNameFromConversation(session.messages);
    const need = extractNeedFromConversation(session.messages);
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
  // In test mode, skip — Alex treats everyone as brand new
  let visitorContext: VisitorContext | undefined;
  if (knownEmail && !isTestMode()) {
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

  const llmRequest = {
    system: systemPrompt,
    messages: llmMessages,
    tools: [ALEX_RESPONSE_TOOL],
    maxTokens: 256,
    ...(model ? { model } : {}),
  };
  const response = await createCompletion(llmRequest);

  let { reply, requestEmail, done, resendEmail, suggestions, detectedMode, searchQuery } =
    extractAlexResponse(response.content);

  // Record mode detection funnel event
  if (detectedMode) {
    await recordFunnelEvent(session.sessionId, "mode_detected", context, {
      mode: detectedMode,
      messageCount: session.messageCount,
    });
  }

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
        tools: [ALEX_RESPONSE_TOOL],
        maxTokens: 256,
        ...(model ? { model } : {}),
      };

      try {
        const followUp = await createCompletion(followUpRequest);
        const followUpParsed = extractAlexResponse(followUp.content);
        reply = followUpParsed.reply;
        done = followUpParsed.done;
        suggestions = followUpParsed.suggestions;
        if (followUpParsed.detectedMode) detectedMode = followUpParsed.detectedMode;
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
  // Branch by detected mode: connector, cos, both, or null (general intake)
  if (done && knownEmail) {
    const conversationSummary = session.messages
      .filter((m) => m.role === "user" && !m.content.startsWith("["))
      .map((m) => `- ${m.content}`)
      .join("\n");
    const personName = extractNameFromConversation(session.messages);
    const effectiveMode = detectedMode || "connector"; // default to connector for backward compat

    // Look up person for interaction recording — search globally since
    // networkUsers.id (the owner) is a UUID created during intake, not a fixed value
    const activatePerson = await findPersonByEmailGlobal(knownEmail);
    const activatePersonId = activatePerson?.id;

    // Send the action email with what happens next (mode-specific)
    try {
      if (effectiveMode === "cos") {
        await sendCosActionEmail(knownEmail, "alex", personName, conversationSummary, activatePersonId);
      } else if (effectiveMode === "both") {
        // Send connector email (includes transparency), CoS details in follow-up
        await sendActionEmail(knownEmail, "alex", personName, conversationSummary, activatePersonId);
        await sendCosActionEmail(knownEmail, "alex", personName, conversationSummary, activatePersonId);
      } else {
        await sendActionEmail(knownEmail, "alex", personName, conversationSummary, activatePersonId);
      }
    } catch { /* non-fatal */ }

    // Start the engine process — branch by mode
    // In test mode, processes run normally but emails are suppressed at the channel adapter
    try {
      const { startSystemAgentRun } = await import("./heartbeat");
      const person = activatePerson;
      const targetType = extractNeedFromConversation(session.messages) || "relevant contacts";
      const baseInputs = {
        personId: person?.id || "unknown",
        // userId = networkUsers.id (canonical user identity for processes)
        // people.userId is set to networkUsers.id during intake
        userId: person?.userId || "unknown",
        email: knownEmail,
        name: personName,
        need: targetType,
        conversationSummary,
      };

      if (effectiveMode === "connector" || effectiveMode === "both") {
        await startSystemAgentRun("front-door-intake", {
          ...baseInputs,
          targetType,
          businessContext: conversationSummary,
        }, "front-door-chat");
        console.log(`[network-chat] Started front-door-intake process for ${knownEmail}`);
      }

      if (effectiveMode === "cos" || effectiveMode === "both") {
        await startSystemAgentRun("front-door-cos-intake", {
          ...baseInputs,
          statedPriorities: targetType,
          knownContext: conversationSummary,
        }, "front-door-chat");
        console.log(`[network-chat] Started front-door-cos-intake process for ${knownEmail}`);
      }
    } catch (err) {
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
    detectedMode,
    ...(isTestMode() ? { testMode: true } : {}),
  };
}

// ============================================================
// Streaming Chat Handler
// ============================================================

/**
 * SSE event types for the streaming chat response.
 * - text-delta: partial text chunk
 * - metadata: tool call args (suggestions, flags) — sent once at end
 * - done: stream complete
 * - error: something went wrong
 */
export type ChatStreamEvent =
  | { type: "session"; sessionId: string; testMode?: boolean }
  | { type: "text-delta"; text: string }
  | { type: "metadata"; requestEmail: boolean; done: boolean; suggestions: string[]; detectedMode: DetectedMode; emailCaptured: boolean }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Streaming version of handleChatTurn.
 * Yields SSE events: session ID, text deltas, then metadata + done.
 * All pre/post-LLM logic (session, rate limiting, email detection, ACTIVATE) is identical.
 */
export async function* handleChatTurnStreaming(
  sessionId: string | null,
  message: string,
  context: ChatContext,
  ip: string,
  returningEmail?: string | null,
  funnelMetadata?: Record<string, unknown>,
): AsyncGenerator<ChatStreamEvent> {
  const ipHash = hashIp(ip);

  // Rate limit: IP
  const ipAllowed = await checkIpRateLimit(ipHash);
  if (!ipAllowed) {
    yield { type: "session", sessionId: sessionId || randomUUID(), ...(isTestMode() ? { testMode: true } : {}) };
    yield { type: "text-delta", text: "We've been chatting a lot — drop me your email and I'll continue there. Better for both of us." };
    yield { type: "metadata", requestEmail: true, done: false, suggestions: [], detectedMode: null, emailCaptured: false };
    yield { type: "done" };
    return;
  }

  // Load or create session
  const session = await loadOrCreateSession(sessionId, context, ipHash);

  // Emit session ID immediately so the frontend can store it
  yield { type: "session", sessionId: session.sessionId, ...(isTestMode() ? { testMode: true } : {}) };

  // Rate limit: per-session
  if (session.messageCount >= MAX_MESSAGES_PER_SESSION) {
    yield { type: "text-delta", text: "We've been chatting a lot — drop me your email and I'll continue there. Better for both of us." };
    yield { type: "metadata", requestEmail: true, done: false, suggestions: [], detectedMode: null, emailCaptured: false };
    yield { type: "done" };
    return;
  }

  // Resolve model
  let model: string | undefined;
  try { model = getConfiguredModel(); } catch { /* mock mode */ }

  // Intercept bracket-tagged funnel events
  const funnelEventMatch = message.trim().match(/^\[(\w+)\]$/);
  if (funnelEventMatch) {
    const eventName = funnelEventMatch[1];
    await recordFunnelEvent(session.sessionId, eventName, context, { ipHash, ...funnelMetadata });
    yield { type: "done" };
    return;
  }

  // Record chat message event
  await recordFunnelEvent(session.sessionId, "chat_message", context, { ipHash });
  if (session.messageCount === 0) {
    await recordFunnelEvent(session.sessionId, "conversation_started", context);
  }

  const trimmedMessage = message.trim();

  // Email detection (same as non-streaming)
  // In test mode, ignore returningEmail so every visit feels like a new user
  let knownEmail = (isTestMode() ? null : returningEmail) || null;
  let emailCaptured = false;

  if (EMAIL_REGEX.test(trimmedMessage)) {
    knownEmail = trimmedMessage;
    emailCaptured = true;
    const name = extractNameFromConversation(session.messages);
    const need = extractNeedFromConversation(session.messages);
    try { await startIntake(trimmedMessage, name, need, undefined, "alex"); } catch { /* non-fatal */ }
    await recordFunnelEvent(session.sessionId, "email_captured", context, {
      hasName: !!name, hasNeed: !!need,
    });
    session.messages.push({ role: "user", content: `[EMAIL_CAPTURED] ${trimmedMessage}` });
  } else {
    session.messages.push({ role: "user", content: trimmedMessage });
  }

  session.messageCount += 1;

  // Visitor context — skip in test mode so Alex treats everyone as brand new
  let visitorContext: VisitorContext | undefined;
  if (knownEmail && !isTestMode()) {
    try {
      visitorContext = await assembleVisitorContext(knownEmail);
    } catch {
      visitorContext = { email: knownEmail, isReturning: !!returningEmail };
    }
  }

  // Build prompt + stream LLM
  const llmMessages: LlmMessage[] = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const systemPrompt = buildFrontDoorPrompt(context, visitorContext);

  const llmRequest = {
    system: systemPrompt,
    messages: llmMessages,
    tools: [ALEX_RESPONSE_TOOL],
    maxTokens: 256,
    ...(model ? { model } : {}),
  };

  // Stream the LLM response — no fallback, let errors propagate to the frontend
  // which shows an email capture form
  let fullContent: import("./llm").LlmContentBlock[] = [];
  for await (const event of createStreamingCompletion(llmRequest)) {
    if (event.type === "text-delta") {
      yield { type: "text-delta", text: event.text };
    }
    if (event.type === "content-complete") {
      fullContent = event.content;
    }
  }

  // Extract structured data from tool call
  let { reply, requestEmail, done, resendEmail, suggestions, detectedMode, searchQuery } =
    extractAlexResponse(fullContent);

  // Mode detection funnel event
  if (detectedMode) {
    await recordFunnelEvent(session.sessionId, "mode_detected", context, {
      mode: detectedMode,
      messageCount: session.messageCount,
    });
  }

  if (requestEmail) {
    session.requestEmailFlagged = true;
  }

  // Resend email
  if (resendEmail && knownEmail) {
    try {
      await startIntake(knownEmail, undefined, undefined, undefined, "alex");
    } catch { /* non-fatal */ }
  }

  // Web search — if needed, do a non-streaming follow-up (search is rare)
  if (searchQuery) {
    const searchResults = await webSearch(searchQuery);
    if (searchResults) {
      session.messages.push({ role: "assistant", content: reply });
      session.messages.push({ role: "user", content: `[SEARCH_RESULTS for "${searchQuery}"]\n${searchResults}` });

      const followUpRequest = {
        system: systemPrompt,
        messages: session.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        tools: [ALEX_RESPONSE_TOOL],
        maxTokens: 256,
        ...(model ? { model } : {}),
      };

      try {
        const followUp = await createCompletion(followUpRequest);
        const followUpParsed = extractAlexResponse(followUp.content);
        // Stream the replacement text
        yield { type: "text-delta", text: `\n${followUpParsed.reply}` };
        reply = followUpParsed.reply;
        done = followUpParsed.done;
        suggestions = followUpParsed.suggestions;
        if (followUpParsed.detectedMode) detectedMode = followUpParsed.detectedMode;
        session.messages.pop();
        session.messages.pop();
      } catch {
        session.messages.pop();
        session.messages.pop();
      }
    }
  }

  // ACTIVATE (same as non-streaming)
  if (done && knownEmail) {
    const conversationSummary = session.messages
      .filter((m) => m.role === "user" && !m.content.startsWith("["))
      .map((m) => `- ${m.content}`)
      .join("\n");
    const personName = extractNameFromConversation(session.messages);
    const effectiveMode = detectedMode || "connector";

    // Look up person for interaction recording
    const streamActivatePerson = await findPersonByEmailGlobal(knownEmail);
    const streamActivatePersonId = streamActivatePerson?.id;

    try {
      if (effectiveMode === "cos") {
        await sendCosActionEmail(knownEmail, "alex", personName, conversationSummary, streamActivatePersonId);
      } else if (effectiveMode === "both") {
        await sendActionEmail(knownEmail, "alex", personName, conversationSummary, streamActivatePersonId);
        await sendCosActionEmail(knownEmail, "alex", personName, conversationSummary, streamActivatePersonId);
      } else {
        await sendActionEmail(knownEmail, "alex", personName, conversationSummary, streamActivatePersonId);
      }
    } catch { /* non-fatal */ }

    try {
      const { startSystemAgentRun } = await import("./heartbeat");
      const person = streamActivatePerson;
      const targetType = extractNeedFromConversation(session.messages) || "relevant contacts";
      const baseInputs = {
        personId: person?.id || "unknown",
        userId: person?.userId || "unknown",
        email: knownEmail,
        name: personName,
        need: targetType,
        conversationSummary,
      };

      if (effectiveMode === "connector" || effectiveMode === "both") {
        await startSystemAgentRun("front-door-intake", {
          ...baseInputs,
          targetType,
          businessContext: conversationSummary,
        }, "front-door-chat");
      }
      if (effectiveMode === "cos" || effectiveMode === "both") {
        await startSystemAgentRun("front-door-cos-intake", {
          ...baseInputs,
          statedPriorities: targetType,
          knownContext: conversationSummary,
        }, "front-door-chat");
      }
    } catch (err) {
      console.warn("[network-chat] Could not start intake process:", (err as Error).message);
    }
  }

  session.messages.push({ role: "assistant", content: reply });
  await saveSession(session);

  // Send metadata and done
  yield { type: "metadata", requestEmail, done, suggestions, detectedMode, emailCaptured };
  yield { type: "done" };
}
