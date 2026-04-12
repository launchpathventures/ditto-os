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
import { createCompletion, extractText, extractToolUse, getConfiguredModel, type LlmToolDefinition } from "./llm";
import { createStreamingCompletion, type StreamEvent } from "./llm-stream";
import { isSpendCeilingReached, recordFrontDoorSpend } from "./spend-ceiling";
import { buildFrontDoorPrompt, ALEX_RESPONSE_TOOL, type ChatContext, type VisitorContext, type DetectedMode, type ConversationStage } from "./network-chat-prompt";
import { startIntake, sendActionEmail, sendCosActionEmail } from "./self-tools/network-tools";
import { getPersonByEmail, findPersonByEmailGlobal, getPersonMemories } from "./people";
import { webSearch } from "./web-search";
import { fetchUrlContent, type FetchResult } from "./web-fetch";
import { geolocateIp } from "./geo";
import type { LlmMessage } from "./llm";

// ============================================================
// Tool Call Extraction
// ============================================================

const VALID_MODES = new Set(["connector", "sales", "cos", "both"]);

interface LearnedContext {
  name?: string | null;
  business?: string | null;
  role?: string | null;
  industry?: string | null;
  location?: string | null;
  target?: string | null;
  problem?: string | null;
  channel?: string | null;
}

interface AlexToolArgs {
  reply: string;
  suggestions: string[];
  requestName: boolean;
  requestLocation: boolean;
  requestEmail: boolean;
  done: boolean;
  resendEmail: boolean;
  detectedMode: DetectedMode;
  searchQuery: string | null;
  fetchUrl: string | null;
  plan: string | null;
  learned: LearnedContext | null;
  extraQuestions: string[];
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
      requestName: false,
      requestLocation: false,
      requestEmail: false,
      done: false,
      resendEmail: false,
      detectedMode: null,
      searchQuery: null,
      fetchUrl: null,
      plan: null,
      learned: null,
      extraQuestions: [],
    };
  }

  const args = alexCall.input as Record<string, unknown>;
  const result: AlexToolArgs = {
    reply,
    suggestions: Array.isArray(args.suggestions)
      ? args.suggestions.filter((s): s is string => typeof s === "string")
      : [],
    requestName: Boolean(args.requestName),
    requestLocation: Boolean(args.requestLocation),
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
    fetchUrl:
      typeof args.fetchUrl === "string" && args.fetchUrl.trim()
        ? args.fetchUrl.trim()
        : null,
    plan:
      typeof args.plan === "string" && args.plan.trim()
        ? args.plan.trim()
        : null,
    learned:
      args.learned && typeof args.learned === "object"
        ? args.learned as LearnedContext
        : null,
    extraQuestions: [], // populated by validateAndCleanResponse() post-call
  };

  // fetchUrl takes priority — if both are set, clear searchQuery
  // (direct fetch is more reliable than searching for a known URL)
  if (result.fetchUrl && result.searchQuery) {
    result.searchQuery = null;
  }

  return result;
}

// ============================================================
// State Directive (injected into system prompt before LLM call)
// ============================================================

/**
 * Build a state directive from the session's learned context.
 * Appended to the system prompt so the LLM knows what information
 * we have and what it should focus on this turn.
 *
 * This is the pre-call guidance — no extra LLM call needed,
 * just deterministic state inspection.
 */
function buildStateDirective(session: ChatSession): string {
  const learned = session.learned;
  // Use != null to avoid false negatives from empty strings
  const hasName = learned?.name != null && learned.name !== "";
  const hasBusiness = learned?.business != null && learned.business !== "";
  const hasTarget = (learned?.target != null && learned.target !== "") || (learned?.problem != null && learned.problem !== "");
  const hasLocation = learned?.location != null && learned.location !== "";
  const hasEmail = session.requestEmailFlagged;

  const lines: string[] = ["\n\n## THIS TURN — what to do (from conversation state)"];

  if (!hasName) {
    lines.push("You do NOT know this visitor's name yet. Set requestName to true. Your text should react to what they said with substance, then naturally ask who you're talking to. The name input appears below your text. Ask ONLY for their name — nothing else this turn.");
  } else if (!hasBusiness) {
    lines.push(`You know their name is ${learned!.name}. Use it. This turn: ask about their business. Invite them to share a website or LinkedIn. Ask ONLY about the business — nothing else.`);
  } else if (!hasTarget) {
    lines.push(`You know ${learned!.name} and their business (${learned!.business}). This turn: ask who they're trying to reach or what problem they're solving. Ask ONLY about the target — nothing else.`);
  } else if (!hasLocation) {
    lines.push(`You know ${learned!.name}, their business, and target. Set requestLocation to true. Ask where they're based so you can target the right market — the location input appears below your text. Ask ONLY about location — nothing else.`);
  } else if (!hasEmail) {
    lines.push(`You have name, business, target, and location. This turn: set requestEmail to true and explain why you need their email — briefings, approvals, and communication happen there.`);
  } else {
    lines.push(`You have all context. Reflect back what you've heard using THEIR words — confirm you got it right. Propose your approach as an option they can accept or modify. Get explicit consent before activating. Remember: confirm, never assume.`);
  }

  return lines.join("\n");
}

// ============================================================
// Stage Gate Enforcement
// ============================================================

/**
 * Enforce conversation stage gates using the session's learned context.
 *
 * Implements the gate conditions defined in front-door-conversation.yaml.
 * The process template declares the rules; this function enforces them.
 *
 * Gate conditions (from process YAML):
 *   done_requires: learned.name, learned.business, email_verified
 *   request_email_requires: learned.name, learned.business
 *   force_request_name_until: learned.name
 */
function enforceStageGates(result: AlexToolArgs, session: ChatSession): AlexToolArgs {
  const learned = session.learned;
  const hasName = learned?.name != null && learned.name !== "";
  const hasBusiness = learned?.business != null && learned.business !== "";
  const hasTarget = (learned?.target != null && learned.target !== "") || (learned?.problem != null && learned.problem !== "");
  const hasLocation = learned?.location != null && learned.location !== "";
  const hasEmail = session.requestEmailFlagged;

  // done_requires: learned.name, learned.business, learned.location, email_verified
  if (result.done && (!hasName || !hasBusiness || !hasLocation || !hasEmail)) {
    const missing = [!hasName && "name", !hasBusiness && "business", !hasLocation && "location", !hasEmail && "email"].filter(Boolean);
    console.warn(`[harness] Blocked done — missing: ${missing.join(", ")}`);
    result.done = false;
    if (hasName && hasBusiness && hasTarget && hasLocation && !hasEmail) {
      result.requestEmail = true;
    }
  }

  // request_email_requires: learned.name, learned.business, learned.target|problem, learned.location
  if (result.requestEmail && (!hasName || !hasBusiness || !hasTarget || !hasLocation)) {
    const missing = [!hasName && "name", !hasBusiness && "business", !hasTarget && "target", !hasLocation && "location"].filter(Boolean);
    console.warn(`[harness] Blocked requestEmail — gate requires: ${missing.join(", ")}`);
    result.requestEmail = false;
  }

  // force_request_name_until: learned.name
  if (!hasName && !result.requestName && session.messageCount <= 2) {
    result.requestName = true;
  }

  return result;
}

// ============================================================
// Response Validator (post-call — Haiku)
// ============================================================

const VALIDATOR_TOOL: LlmToolDefinition = {
  name: "validation_result",
  description: "Return the validation result for Alex's reply.",
  input_schema: {
    type: "object",
    properties: {
      has_multiple_questions: {
        type: "boolean",
        description: "True if the reply asks MORE THAN ONE distinct question. Test: 'What's the business, and who are you trying to get in front of?' = TWO questions ('what's the business' + 'who are you trying to get in front of') joined by 'and' — even though there's only one question mark. 'B2B or B2C?' = ONE question (either/or choice). If the question contains 'and' or comma joining two DIFFERENT asks, it's multiple.",
      },
      primary_question: {
        type: "string",
        description: "The FIRST question asked. For 'What's the business, and who are you trying to get in front of?' the primary question is 'What's the business?'",
      },
      extra_questions: {
        type: "array",
        items: { type: "string" },
        description: "Questions beyond the primary one, rephrased as standalone questions. For 'What's the business, and who are you trying to get in front of?' the extra question is 'Who are you trying to get in front of?'. Empty array if only one question.",
      },
      cleaned_reply: {
        type: "string",
        description: "The cleaned reply with ALL fixes applied: extra questions removed AND filler removed. Keep only the reaction/substance + primary question. If no changes needed, return the original reply exactly.",
      },
      has_filler: {
        type: "boolean",
        description: "True if the reply starts with empty filler like 'Good starting point', 'Great question', 'Nice', 'Interesting', 'Absolutely', 'I'd love to help'. Substantive reactions about the user's situation are NOT filler.",
      },
    },
    required: ["has_multiple_questions", "primary_question", "extra_questions", "cleaned_reply", "has_filler"],
  },
};

/**
 * Validate Alex's reply using a fast secondary LLM call (Haiku/classification tier).
 *
 * Checks for:
 * 1. Multiple questions (including compound "X and Y?" with one question mark)
 * 2. Filler/sycophantic openings
 *
 * Returns cleaned reply + any extra questions for structured UI.
 * Runs in ~100-200ms on Haiku — acceptable for the think→stream pipeline.
 *
 * Falls back to the original reply if the validator fails.
 */
async function validateAndCleanResponse(reply: string): Promise<{ cleanedReply: string; extraQuestions: string[] }> {
  // Skip validation for very short replies (e.g. "Check your inbox")
  if (reply.length < 40 || isTestMode()) {
    return { cleanedReply: reply, extraQuestions: [] };
  }

  try {
    const response = await createCompletion({
      system: "You are a quality checker for a conversational AI. Analyze the reply and detect ALL questions — including compound questions joined by 'and', comma, or 'who/what/where' within the same sentence. Example: 'What's the business, and who are you trying to reach?' is TWO questions even with one '?'. Split them. Be aggressive about detection — false positives are better than letting compound questions through.",
      messages: [{ role: "user", content: `Validate this reply:\n\n${reply}` }],
      tools: [VALIDATOR_TOOL],
      maxTokens: 300,
      purpose: "classification",
    });

    const toolCalls = extractToolUse(response.content);
    const call = toolCalls.find((tc) => tc.name === "validation_result");
    if (!call) return { cleanedReply: reply, extraQuestions: [] };

    const args = call.input as Record<string, unknown>;
    const extraQuestions = Array.isArray(args.extra_questions)
      ? args.extra_questions.filter((q): q is string => typeof q === "string" && q.length > 10 && q.length < 200)
      : [];

    // cleaned_reply has ALL fixes applied (extra questions removed + filler removed)
    let cleanedReply = reply;
    if ((args.has_multiple_questions || args.has_filler) && typeof args.cleaned_reply === "string" && args.cleaned_reply.trim()) {
      cleanedReply = args.cleaned_reply.trim();
    }

    console.log(
      `[network-chat] Validator result: multiQ=${args.has_multiple_questions}, filler=${args.has_filler}, extraQs=${extraQuestions.length}` +
      (extraQuestions.length > 0 ? ` [${extraQuestions.map((q: string) => q.slice(0, 50)).join(" | ")}]` : "") +
      (cleanedReply !== reply ? ` | reply cleaned` : ""),
    );

    return { cleanedReply, extraQuestions };
  } catch (err) {
    // Validator failure is non-fatal — use the original reply
    console.warn("[network-chat] Validator failed, using original reply:", (err as Error).message);
    return { cleanedReply: reply, extraQuestions: [] };
  }
}

// ============================================================
// Text Similarity (for enrichment dedup)
// ============================================================

/**
 * Simple word-overlap similarity (Jaccard on word bigrams).
 * Returns 0–1. Used to detect when enrichment produced the same reply.
 */
function computeTextSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const words = s.toLowerCase().split(/\s+/).filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      set.add(`${words[i]} ${words[i + 1]}`);
    }
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
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

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (anonymous /welcome)
const AUTHENTICATED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (authenticated /chat)
const MAX_MESSAGES_PER_SESSION = 20;
const MAX_MESSAGES_PER_IP_PER_HOUR = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_EXTRACT_REGEX = /[^\s@,]+@[^\s@,]+\.[^\s@,]+/;

// ============================================================
// Conversation Stage Inference (Insight-170: token efficiency)
// ============================================================

/**
 * Infer the current conversation stage from session state.
 *
 * Uses the persisted `learned` context — NOT message count.
 * Stages map to the front-door-conversation.yaml process steps:
 *   gather-name / gather-context → "gather"
 *   request-email → "gather" (reflect loads as next stage)
 *   reflect-propose → "reflect"
 *   activate → "activate"
 */
function inferConversationStage(session: ChatSession): ConversationStage {
  const learned = session.learned;

  // Email captured → reflect stage (propose approach, get consent)
  if (session.requestEmailFlagged) {
    return "reflect";
  }

  // No learned context yet → still gathering
  if (!learned) return "gather";

  const hasName = !!learned.name;
  const hasBusiness = !!learned.business;
  const hasTarget = !!learned.target || !!learned.problem;

  // Need core context before advancing — stage-gated prompt loads
  // current + next, so "gather" also loads "reflect" instructions.
  if (!hasName || !hasBusiness || !hasTarget) return "gather";

  // Have enough context but no email yet → still gather (reflect loads as next)
  return "gather";
}

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
  authenticatedEmail: string | null;
  learned: Record<string, string | null> | null;
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
        authenticatedEmail: existing.authenticatedEmail ?? null,
        learned: (existing.learned as Record<string, string | null>) ?? null,
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
    authenticatedEmail: null,
    learned: null,
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
      learned: session.learned,
      updatedAt: new Date(),
      // Rolling TTL: authenticated sessions extend to 30 days on each activity (Brief 123)
      ...(session.authenticatedEmail ? { expiresAt: new Date(Date.now() + AUTHENTICATED_SESSION_TTL_MS) } : {}),
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
  requestName?: boolean;
  requestLocation?: boolean;
  requestEmail?: boolean;
  emailCaptured?: boolean;
  done?: boolean;
  rateLimited?: boolean;
  suggestions?: string[];
  detectedMode?: DetectedMode;
  extraQuestions?: string[];
  testMode?: boolean;
}

export async function handleChatTurn(
  sessionId: string | null,
  message: string,
  context: ChatContext,
  ip: string,
  returningEmail?: string | null,
  funnelMetadata?: Record<string, unknown>,
  visitorName?: string,
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

  // Extract email from anywhere in the message (e.g. "Tim, tim@company.com")
  const emailMatch = trimmedMessage.match(EMAIL_EXTRACT_REGEX);
  if (emailMatch) {
    knownEmail = emailMatch[0];
    emailCaptured = true;

    // Trigger intake as side effect — creates person record + sends intro email
    // In test mode, emails are suppressed at the channel adapter level
    const name = visitorName || extractNameFromConversation(session.messages);
    const need = extractNeedFromConversation(session.messages);
    // Brief 126 AC4: pass sessionId so intro email metadata can trace replies
    try { await startIntake(knownEmail, name, need, undefined, "alex", undefined, session.sessionId); } catch { /* non-fatal */ }
    await recordFunnelEvent(session.sessionId, "email_captured", context, {
      hasName: !!name, hasNeed: !!need,
    });

    session.messages.push({ role: "user", content: `[EMAIL_CAPTURED]${name ? ` ${name}` : ""} ${trimmedMessage}` });
  } else {
    session.messages.push({ role: "user", content: trimmedMessage });
  }

  session.messageCount += 1;

  // Look up what Ditto knows about this person + their location
  // In test mode, skip person lookup — Alex treats everyone as brand new
  let visitorContext: VisitorContext | undefined;
  const geoPromise = geolocateIp(ip, ipHash);

  if (knownEmail && !isTestMode()) {
    try {
      visitorContext = await assembleVisitorContext(knownEmail);
    } catch {
      // Data layer unavailable — Alex proceeds without context
      visitorContext = { email: knownEmail, isReturning: !!returningEmail };
    }
  }

  // Attach location — applies to both known and unknown visitors
  const geo = await geoPromise;
  if (geo) {
    if (!visitorContext) visitorContext = {};
    visitorContext.location = geo;
  }

  // ============================================================
  // Daily spend ceiling — circuit breaker for cost control
  // ============================================================

  if (isSpendCeilingReached()) {
    await saveSession(session);
    return {
      reply: "I'm getting a lot of traffic right now — drop me your email and I'll follow up personally.",
      sessionId: session.sessionId,
      requestEmail: true,
      rateLimited: true,
    };
  }

  // ============================================================
  // Build prompt + call LLM
  // ============================================================

  const llmMessages: LlmMessage[] = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Infer conversation stage for stage-gated prompting (Insight-170: token efficiency)
  const conversationStage = inferConversationStage(session);
  const systemPrompt = buildFrontDoorPrompt(context, visitorContext, conversationStage)
    + buildStateDirective(session);

  const llmRequest = {
    system: systemPrompt,
    messages: llmMessages,
    tools: [ALEX_RESPONSE_TOOL],
    maxTokens: 400,
    ...(model ? { model } : {}),
  };
  const response = await createCompletion(llmRequest);

  // Record spend for daily ceiling tracking
  recordFrontDoorSpend(response.costCents);

  const rawExtracted = extractAlexResponse(response.content);
  // Update session.learned BEFORE gate enforcement so gates see this turn's context
  if (rawExtracted.learned) {
    session.learned = { ...(session.learned || {}), ...rawExtracted.learned };
  }
  const extracted = enforceStageGates(rawExtracted, session);
  let { reply, requestName, requestLocation, requestEmail, done, resendEmail, suggestions, detectedMode, searchQuery, fetchUrl, extraQuestions } = extracted;

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

  // Enrichment loop — search or fetch, then re-prompt. Max 2 rounds to prevent runaway.
  for (let enrichRound = 0; enrichRound < 2; enrichRound++) {
    let enrichContent: string | null = null;
    let enrichLabel = "";

    if (searchQuery) {
      enrichContent = await webSearch(searchQuery);
      enrichLabel = `[SEARCH_RESULTS for "${searchQuery}"]`;
    } else if (fetchUrl) {
      const result: FetchResult = await fetchUrlContent(fetchUrl);
      if (result.content) {
        enrichContent = result.content;
        enrichLabel = `[PAGE_CONTENT from ${fetchUrl}]`;
      } else if (result.error) {
        // Feed the error to the LLM so Alex can inform the user
        enrichContent = result.error;
        enrichLabel = `[PAGE_FETCH_FAILED for ${fetchUrl}]`;
      }
    } else {
      break;
    }

    if (!enrichContent) break;

    session.messages.push({ role: "assistant", content: reply });
    session.messages.push({ role: "user", content: `${enrichLabel}\n${enrichContent}` });

    const followUpRequest = {
      system: systemPrompt,
      messages: session.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: [ALEX_RESPONSE_TOOL],
      maxTokens: 400,
      ...(model ? { model } : {}),
    };

    try {
      const followUp = await createCompletion(followUpRequest);
      recordFrontDoorSpend(followUp.costCents);
      const followUpRaw = extractAlexResponse(followUp.content);
      if (followUpRaw.learned) {
        session.learned = { ...(session.learned || {}), ...followUpRaw.learned };
      }
      const followUpGated = enforceStageGates(followUpRaw, session);
      reply = followUpGated.reply;
      requestName = followUpGated.requestName;
      requestLocation = followUpGated.requestLocation;
      requestEmail = followUpGated.requestEmail;
      done = followUpGated.done;
      suggestions = followUpGated.suggestions;
      extraQuestions = followUpGated.extraQuestions;
      if (followUpGated.detectedMode) detectedMode = followUpGated.detectedMode;
      session.messages.pop();
      session.messages.pop();
      searchQuery = followUpGated.searchQuery;
      fetchUrl = followUpGated.fetchUrl;
    } catch {
      session.messages.pop();
      session.messages.pop();
      break;
    }
  }

  // ── Secondary LLM validation (Haiku) ──
  // Catches compound questions, filler, and quality issues that the primary
  // model missed. Runs in ~100-200ms on Haiku — acceptable latency.
  const validated = await validateAndCleanResponse(reply);
  reply = validated.cleanedReply;
  extraQuestions = validated.extraQuestions;

  // Brief 126: Safety net — if email was captured in THIS turn (emailCaptured flag)
  // and the LLM's response + enrichment loop didn't set done, force it.
  // This prevents the limbo state where ACTIVATE never fires after EMAIL_CAPTURED.
  // Only applies when emailCaptured was set THIS turn (from regex match) — not
  // for returning visitors where knownEmail comes from the cookie.
  if (!done && emailCaptured && knownEmail) {
    console.warn(`[network-chat] Forced done=true after EMAIL_CAPTURED — enrichment did not set done (session ${session.sessionId})`);
    done = true;
    await recordFunnelEvent(session.sessionId, "forced_done", context, {
      reason: "enrichment_did_not_set_done",
      messageCount: session.messageCount,
    });
  }

  // ACTIVATE: Alex has gathered enough — send action email and start the engine process
  // Branch by detected mode: connector, cos, both, or null (general intake)
  if (done && knownEmail) {
    // Authenticate this session for magic link access (Brief 123)
    // This enables the "Continue in chat" magic link in future emails
    try {
      await db
        .update(schema.chatSessions)
        .set({
          authenticatedEmail: knownEmail.toLowerCase(),
          expiresAt: new Date(Date.now() + AUTHENTICATED_SESSION_TTL_MS),
        })
        .where(eq(schema.chatSessions.sessionId, session.sessionId));
    } catch {
      // Non-fatal — session auth upgrade is best-effort
    }
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
    // Brief 126: "both" mode sends ONE action email (outreach-focused), not two.
    // CoS intake chains from front-door-intake report-back, not in parallel.
    const outreachStyle: "connector" | "sales" = effectiveMode === "sales" ? "sales" : "connector";
    try {
      if (effectiveMode === "cos") {
        await sendCosActionEmail(knownEmail, "alex", personName, conversationSummary, activatePersonId);
      } else {
        // "both" and single outreach modes both send the outreach action email
        await sendActionEmail(knownEmail, "alex", personName, conversationSummary, activatePersonId, outreachStyle);
      }
    } catch { /* non-fatal */ }

    // Start the engine process — branch by mode
    // Brief 126: "both" mode starts ONLY front-door-intake. CoS chains from report-back.
    // This gives the user ONE email thread, not two parallel ones.
    try {
      const { startSystemAgentRun } = await import("./heartbeat");
      const person = activatePerson;
      const targetType = extractNeedFromConversation(session.messages) || "relevant contacts";
      const baseInputs = {
        personId: person?.id || "unknown",
        userId: person?.userId || "unknown",
        email: knownEmail,
        name: personName,
        need: targetType,
        conversationSummary,
      };

      const isOutreach = effectiveMode === "connector" || effectiveMode === "sales" || effectiveMode === "both";
      const isCosOnly = effectiveMode === "cos";
      const outreachMode = effectiveMode === "sales" ? "sales" : "connector";

      if (isOutreach) {
        await startSystemAgentRun("front-door-intake", {
          ...baseInputs,
          targetType,
          businessContext: conversationSummary,
          outreachMode,
          // Pass detectedMode so the chain can trigger cos-intake when mode is "both"
          detectedMode: effectiveMode,
        }, "front-door-chat");
        console.log(`[network-chat] Started front-door-intake (${outreachMode}${effectiveMode === "both" ? " + cos chained" : ""}) process for ${knownEmail}`);
      }

      if (isCosOnly) {
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

  // session.learned already updated before enforceStageGates (line 808) and in enrichment loops

  session.messages.push({ role: "assistant", content: reply });
  await saveSession(session);

  return {
    reply,
    sessionId: session.sessionId,
    requestName,
    requestLocation,
    requestEmail,
    emailCaptured,
    done,
    suggestions,
    detectedMode,
    extraQuestions,
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
  | { type: "text-replace"; text: string }
  | { type: "status"; message: string }
  | { type: "metadata"; requestName: boolean; requestLocation: boolean; requestEmail: boolean; done: boolean; suggestions: string[]; detectedMode: DetectedMode; emailCaptured: boolean; plan: string | null; learned: LearnedContext | null; extraQuestions: string[] }
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
  visitorName?: string,
): AsyncGenerator<ChatStreamEvent> {
  const ipHash = hashIp(ip);

  // Rate limit: IP
  const ipAllowed = await checkIpRateLimit(ipHash);
  if (!ipAllowed) {
    yield { type: "session", sessionId: sessionId || randomUUID(), ...(isTestMode() ? { testMode: true } : {}) };
    yield { type: "text-delta", text: "We've been chatting a lot — drop me your email and I'll continue there. Better for both of us." };
    yield { type: "metadata", requestName: false, requestLocation: false, requestEmail: true, done: false, suggestions: [], detectedMode: null, emailCaptured: false, plan: null, learned: null, extraQuestions: [] };
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
    yield { type: "metadata", requestName: false, requestLocation: false, requestEmail: true, done: false, suggestions: [], detectedMode: null, emailCaptured: false, plan: null, learned: null, extraQuestions: [] };
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

  const streamEmailMatch = trimmedMessage.match(EMAIL_EXTRACT_REGEX);
  if (streamEmailMatch) {
    knownEmail = streamEmailMatch[0];
    emailCaptured = true;
    const name = visitorName || extractNameFromConversation(session.messages);
    const need = extractNeedFromConversation(session.messages);
    // Brief 126 AC4: pass sessionId so intro email metadata can trace replies
    try { await startIntake(knownEmail, name, need, undefined, "alex", undefined, session.sessionId); } catch { /* non-fatal */ }
    await recordFunnelEvent(session.sessionId, "email_captured", context, {
      hasName: !!name, hasNeed: !!need,
    });
    session.messages.push({ role: "user", content: `[EMAIL_CAPTURED]${name ? ` ${name}` : ""} ${trimmedMessage}` });
  } else {
    session.messages.push({ role: "user", content: trimmedMessage });
  }

  session.messageCount += 1;

  // Visitor context + geolocation — skip person lookup in test mode
  let visitorContext: VisitorContext | undefined;
  const geoPromise = geolocateIp(ip, ipHash);

  if (knownEmail && !isTestMode()) {
    try {
      visitorContext = await assembleVisitorContext(knownEmail);
    } catch {
      visitorContext = { email: knownEmail, isReturning: !!returningEmail };
    }
  }

  const geo = await geoPromise;
  if (geo) {
    if (!visitorContext) visitorContext = {};
    visitorContext.location = geo;
  }

  // Daily spend ceiling — circuit breaker for cost control
  if (isSpendCeilingReached()) {
    await saveSession(session);
    yield { type: "text-delta", text: "I'm getting a lot of traffic right now — drop me your email and I'll follow up personally." };
    yield { type: "metadata", requestName: false, requestLocation: false, requestEmail: true, done: false, suggestions: [], detectedMode: null, emailCaptured: false, plan: null, learned: null, extraQuestions: [] };
    yield { type: "done" };
    return;
  }

  // Build prompt + stream LLM
  const llmMessages: LlmMessage[] = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Stage-gated prompting (Insight-170: token efficiency)
  const streamConversationStage = inferConversationStage(session);
  const systemPrompt = buildFrontDoorPrompt(context, visitorContext, streamConversationStage)
    + buildStateDirective(session);

  const llmRequest = {
    system: systemPrompt,
    messages: llmMessages,
    tools: [ALEX_RESPONSE_TOOL],
    maxTokens: 400,
    ...(model ? { model } : {}),
  };

  // Phase 1: Think — get the full response including enrichment signals.
  // No text is streamed yet. The user sees "Considering…" from the flow checker above.
  const thinkResponse = await createCompletion(llmRequest);
  recordFrontDoorSpend(thinkResponse.costCents);

  // Phase 1: Think
  yield { type: "status", message: "Considering…" };
  const streamRawExtracted = extractAlexResponse(thinkResponse.content);
  // Update session.learned BEFORE gate enforcement so gates see this turn's context
  if (streamRawExtracted.learned) {
    session.learned = { ...(session.learned || {}), ...streamRawExtracted.learned };
  }
  const streamExtracted = enforceStageGates(streamRawExtracted, session);
  let { reply, requestName, requestLocation, requestEmail, done, resendEmail, suggestions, detectedMode, searchQuery, fetchUrl, plan, learned, extraQuestions } = streamExtracted;

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

  // Phase 2: Enrichment loop — fetch/search in background, re-prompt.
  // The user sees status messages ("Reading that page…") while this runs.
  // No text has been streamed yet, so there's nothing to contradict.
  for (let enrichRound = 0; enrichRound < 2; enrichRound++) {
    let enrichContent: string | null = null;
    let enrichLabel = "";

    if (searchQuery) {
      yield { type: "status", message: "Searching…" };
      enrichContent = await webSearch(searchQuery);
      enrichLabel = `[SEARCH_RESULTS for "${searchQuery}"]`;
    } else if (fetchUrl) {
      yield { type: "status", message: "Reading that page…" };
      const result: FetchResult = await fetchUrlContent(fetchUrl);
      if (result.content) {
        enrichContent = result.content;
        enrichLabel = `[PAGE_CONTENT from ${fetchUrl}]`;
      } else if (result.error) {
        enrichContent = result.error;
        enrichLabel = `[PAGE_FETCH_FAILED for ${fetchUrl}]`;
      }
    } else {
      break;
    }

    if (!enrichContent) break;

    session.messages.push({ role: "assistant", content: reply });
    session.messages.push({ role: "user", content: `${enrichLabel}\n${enrichContent}` });

    const followUpRequest = {
      system: systemPrompt,
      messages: session.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: [ALEX_RESPONSE_TOOL],
      maxTokens: 400,
      ...(model ? { model } : {}),
    };

    try {
      yield { type: "status", message: "Putting it together…" };
      const followUp = await createCompletion(followUpRequest);
      recordFrontDoorSpend(followUp.costCents);
      const followUpRaw = extractAlexResponse(followUp.content);
      if (followUpRaw.learned) {
        learned = followUpRaw.learned;
        session.learned = { ...(session.learned || {}), ...learned };
      }
      const followUpGated = enforceStageGates(followUpRaw, session);
      reply = followUpGated.reply;
      requestName = followUpGated.requestName;
      requestLocation = followUpGated.requestLocation;
      requestEmail = followUpGated.requestEmail;
      done = followUpGated.done;
      suggestions = followUpGated.suggestions;
      extraQuestions = followUpGated.extraQuestions;
      if (followUpGated.detectedMode) detectedMode = followUpGated.detectedMode;
      if (followUpGated.plan) plan = followUpGated.plan;
      session.messages.pop();
      session.messages.pop();
      searchQuery = followUpGated.searchQuery;
      fetchUrl = followUpGated.fetchUrl;
    } catch {
      session.messages.pop();
      session.messages.pop();
      break;
    }
  }

  // ── Secondary LLM validation (Haiku) ──
  // Runs BEFORE text emission so the user only sees the cleaned version.
  yield { type: "status", message: "Checking…" };
  const streamValidated = await validateAndCleanResponse(reply);
  reply = streamValidated.cleanedReply;
  extraQuestions = streamValidated.extraQuestions;

  // Phase 3: Emit the final reply. All thinking and enrichment is done —
  // this is the one and only response the user sees.
  // Drip-feed in small chunks for a natural typing feel.
  // Drip-feed text in small chunks with a delay for natural typing feel.
  // Without the delay, the generator yields all chunks synchronously and
  // the browser receives them in a single flush — appearing as a block.
  const CHUNK_SIZE = 12; // ~2-3 words per chunk
  const CHUNK_DELAY_MS = 20; // typing speed
  for (let i = 0; i < reply.length; i += CHUNK_SIZE) {
    yield { type: "text-delta", text: reply.slice(i, i + CHUNK_SIZE) };
    if (i + CHUNK_SIZE < reply.length) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }
  }

  // Brief 126: Safety net — if email was captured but enrichment didn't set done
  if (!done && emailCaptured && knownEmail) {
    console.warn(`[network-chat] Forced done=true after EMAIL_CAPTURED — enrichment did not set done (session ${session.sessionId})`);
    done = true;
    await recordFunnelEvent(session.sessionId, "forced_done", context, {
      reason: "enrichment_did_not_set_done",
      messageCount: session.messageCount,
    });
  }

  // ACTIVATE (same as non-streaming)
  if (done && knownEmail) {
    // Authenticate this session for magic link access (Brief 123)
    try {
      await db
        .update(schema.chatSessions)
        .set({
          authenticatedEmail: knownEmail.toLowerCase(),
          expiresAt: new Date(Date.now() + AUTHENTICATED_SESSION_TTL_MS),
        })
        .where(eq(schema.chatSessions.sessionId, session.sessionId));
    } catch {
      // Non-fatal
    }
    const conversationSummary = session.messages
      .filter((m) => m.role === "user" && !m.content.startsWith("["))
      .map((m) => `- ${m.content}`)
      .join("\n");
    const personName = extractNameFromConversation(session.messages);
    const effectiveMode = detectedMode || "connector";

    // Look up person for interaction recording
    const streamActivatePerson = await findPersonByEmailGlobal(knownEmail);
    const streamActivatePersonId = streamActivatePerson?.id;

    // Brief 126: "both" sends ONE action email, CoS chains from report-back
    const streamOutreachStyle: "connector" | "sales" = effectiveMode === "sales" ? "sales" : "connector";
    try {
      if (effectiveMode === "cos") {
        await sendCosActionEmail(knownEmail, "alex", personName, conversationSummary, streamActivatePersonId);
      } else {
        await sendActionEmail(knownEmail, "alex", personName, conversationSummary, streamActivatePersonId, streamOutreachStyle);
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

      const isOutreach = effectiveMode === "connector" || effectiveMode === "sales" || effectiveMode === "both";
      const isCosOnly = effectiveMode === "cos";
      const outreachMode = effectiveMode === "sales" ? "sales" : "connector";

      if (isOutreach) {
        await startSystemAgentRun("front-door-intake", {
          ...baseInputs,
          targetType,
          businessContext: conversationSummary,
          outreachMode,
          detectedMode: effectiveMode,
        }, "front-door-chat");
      }
      if (isCosOnly) {
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

  // session.learned already updated before enforceStageGates (line 1185) and in enrichment loops

  session.messages.push({ role: "assistant", content: reply });
  await saveSession(session);

  // Send metadata and done
  yield { type: "metadata", requestName, requestLocation, requestEmail, done, suggestions, detectedMode, emailCaptured, plan, learned, extraQuestions };
  yield { type: "done" };
}
