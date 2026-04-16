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
import { buildFrontDoorPrompt, ALEX_RESPONSE_TOOL, type ChatContext, type VisitorContext, type DetectedMode, type ConversationStage, type PromptMode } from "./network-chat-prompt";
import { startIntake, sendActionEmail, sendCosActionEmail } from "./self-tools/network-tools";
import { getPersonByEmail, findPersonByEmailGlobal, getPersonMemories } from "./people";
import { webSearch } from "./web-search";
import { fetchUrlContent, type FetchResult } from "./web-fetch";
import { geolocateIp } from "./geo";
import type { LlmMessage } from "./llm";
import type { ContentBlock } from "./content-blocks";
import { buildFrontDoorBlocks } from "./network-chat-blocks";
import type { PersonaId } from "../db/schema";
import type { ChatSessionStage } from "../db/schema/frontdoor";

// ============================================================
// Tool Call Extraction
// ============================================================

const VALID_MODES = new Set(["connector", "sales", "cos", "both"]);

export interface LearnedContext {
  name?: string | null;
  business?: string | null;
  role?: string | null;
  industry?: string | null;
  location?: string | null;
  target?: string | null;
  problem?: string | null;
  channel?: string | null;
  phone?: string | null;
}

interface AlexToolArgs {
  reply: string;
  question: string | null;
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
      question: null,
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
    question:
      typeof args.question === "string" && args.question.trim()
        ? args.question.trim()
        : null,
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
// Voice Fallback Guidance (exported for voice endpoints)
// ============================================================

/**
 * Rule-based guidance for voice when LLM evaluation is too slow or fails.
 * Mirrors the stage-gated logic of buildStateDirective but simplified for voice
 * (no UI-specific instructions like "set requestName to true").
 *
 * Single source of truth — imported by /voice/guidance and /voice/tool endpoints.
 */
export function buildVoiceFallbackGuidance(learned: Record<string, string | null> | null): string {
  const hasName = learned?.name != null && learned.name !== "";
  const hasBusiness = learned?.business != null && learned.business !== "";
  const hasTarget = (learned?.target != null && learned.target !== "") || (learned?.problem != null && learned.problem !== "");
  const hasLocation = learned?.location != null && learned.location !== "";

  if (!hasName) return "Ask the visitor's name — introduce yourself warmly first.";
  if (!hasBusiness) return `You know their name is ${learned!.name}. Ask about their business.`;
  if (!hasTarget) return `Ask ${learned!.name} who they're trying to reach or what problem they're solving.`;
  if (!hasLocation) return "Ask where they're based so you can target the right market.";
  return "Continue the conversation. React with substance, then ask one question.";
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
      has_no_question: {
        type: "boolean",
        description: "True if the reply does NOT ask any question at all. A reply that only makes statements or observations without inviting a response. Rhetorical questions count as questions. 'Isn't it?' or 'right?' tag questions count. But 'That's interesting.' with no question is has_no_question=true.",
      },
      has_multiple_questions: {
        type: "boolean",
        description: "True if the reply asks MORE THAN ONE distinct question. Test: 'What's the business, and who are you trying to get in front of?' = TWO questions ('what's the business' + 'who are you trying to get in front of') joined by 'and' — even though there's only one question mark. 'B2B or B2C?' = ONE question (either/or choice). If the question contains 'and' or comma joining two DIFFERENT asks, it's multiple.",
      },
      primary_question: {
        type: "string",
        description: "The FIRST question asked. For 'What's the business, and who are you trying to get in front of?' the primary question is 'What's the business?'. Empty string if has_no_question is true.",
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
    required: ["has_no_question", "has_multiple_questions", "primary_question", "extra_questions", "cleaned_reply", "has_filler"],
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
async function validateAndCleanResponse(reply: string, declaredQuestion?: string | null): Promise<{ cleanedReply: string; extraQuestions: string[] }> {
  // Skip validation for very short replies (e.g. "Check your inbox")
  if (reply.length < 40 || isTestMode()) {
    return { cleanedReply: reply, extraQuestions: [] };
  }

  try {
    const response = await createCompletion({
      system: "You are a quality checker for a conversational AI. Analyze the reply and detect ALL questions — including compound questions joined by 'and', comma, or 'who/what/where' within the same sentence. Example: 'What's the business, and who are you trying to reach?' is TWO questions even with one '?'. Split them. Be aggressive about detection — false positives are better than letting compound questions through. ALSO check if the reply asks NO question at all — a reply that only states facts or observations without inviting the user to respond is a critical failure.",
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

    // Zero-question enforcement: if the reply has no question, append the
    // declared question from the alex_response tool call. This is the safety
    // net — the LLM declared what it intended to ask but forgot to include it.
    if (args.has_no_question && declaredQuestion) {
      // Strip trailing punctuation from the reply so the appended question reads naturally
      cleanedReply = cleanedReply.replace(/[.\s]+$/, "") + "\n\n" + declaredQuestion;
      console.warn(`[network-chat] Zero-question detected — appended declared question: "${declaredQuestion}"`);
    } else if (args.has_no_question) {
      console.warn(`[network-chat] Zero-question detected but no declared question available — reply may stall conversation`);
    }

    console.log(
      `[network-chat] Validator result: noQ=${args.has_no_question}, multiQ=${args.has_multiple_questions}, filler=${args.has_filler}, extraQs=${extraQuestions.length}` +
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

export async function recordFunnelEvent(
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
  /** One-shot flag: true after offerCall has been emitted for this session (Brief 142) */
  callOffered?: boolean;
  /** Session-bound token for voice endpoint authentication (Brief 142) */
  voiceToken?: string | null;
  /** Persona selection flow (Brief 152). `personaId` locks in on commit;
   *  `stage` gates what the chat handlers will do and emit. */
  personaId?: PersonaId | null;
  stage?: ChatSessionStage;
  /** Per-persona message history collected during the interview stage.
   *  Preserved across persona switches so returning to a persona resumes. */
  interviewTranscripts?: Partial<Record<PersonaId, Array<{ role: string; content: string }>>> | null;
}

/** Options for controlling pipeline behavior per-channel (Brief 142) */
export interface ChatPipelineOptions {
  /** Skip Haiku validation pass — saves ~100-200ms for voice */
  skipValidation?: boolean;
  /** Skip web search/fetch enrichment — saves 2-5s for voice */
  skipEnrichment?: boolean;
  /** Callback fired when enrichment loop starts — voice uses this for filler phrases */
  onEnrichmentStart?: () => void;
  /** Channel type — affects prompt style and event recording */
  channel?: "text" | "voice";
  /** Skip IP rate limiting — voice calls come from external servers, not the visitor's IP */
  skipRateLimit?: boolean;
  /** Pre-hashed IP — skip hashIp() when the caller already provides the hash */
  ipPreHashed?: boolean;
  /** Override max tokens for LLM response */
  maxTokens?: number;
  /** Override LLM model — use a faster model for voice */
  model?: string;
  /** Persona driving this turn (Brief 152). When omitted, falls back to
   *  session.personaId or "alex". The intro-mode card-streaming path sets
   *  this explicitly (the session isn't committed to a persona yet). */
  personaId?: PersonaId;
  /** Prompt mode (Brief 152): `intro` for card greeting, `interview` for the
   *  pre-commit mini-chat, `main` for the committed front door. When omitted,
   *  derived from session.stage. */
  promptMode?: PromptMode;
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
        callOffered: existing.callOffered ?? false,
        voiceToken: existing.voiceToken ?? null,
        personaId: existing.personaId ?? null,
        stage: existing.stage ?? "picker",
        interviewTranscripts: existing.interviewTranscripts ?? null,
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
    personaId: null,
    stage: "picker",
    interviewTranscripts: null,
  };

  await db.insert(schema.chatSessions).values({
    id: session.id,
    sessionId: session.sessionId,
    messages: session.messages,
    context: session.context,
    ipHash: session.ipHash,
    requestEmailFlagged: false,
    messageCount: 0,
    stage: "picker",
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
      // Brief 142: persist voice channel state
      callOffered: session.callOffered ?? false,
      voiceToken: session.voiceToken ?? null,
      // Brief 152: persona selection flow state
      ...(session.personaId !== undefined ? { personaId: session.personaId } : {}),
      ...(session.stage ? { stage: session.stage } : {}),
      ...(session.interviewTranscripts !== undefined
        ? { interviewTranscripts: session.interviewTranscripts }
        : {}),
      // Rolling TTL: authenticated sessions extend to 30 days on each activity (Brief 123)
      ...(session.authenticatedEmail ? { expiresAt: new Date(Date.now() + AUTHENTICATED_SESSION_TTL_MS) } : {}),
    })
    .where(eq(schema.chatSessions.sessionId, session.sessionId));
}

/**
 * Voice conversation evaluator — runs the ACTUAL harness pipeline in shadow mode.
 *
 * Calls handleChatTurn (the same pipeline as text chat) with the voice transcript.
 * The harness runs the full LLM call, extracts learned context, runs stage gates.
 * We keep the structured outputs + the reply (as guidance). ElevenLabs generates
 * the actual voice response — this is just for process intelligence.
 */
export interface VoiceEvaluation {
  learned: LearnedContext;
  guidance: string;
  stage: string;
}

/**
 * Core voice evaluation logic — runs the same LLM pipeline as text chat.
 * Returns evaluation result + optionally persists learned context to DB.
 *
 * @param persistLearned - if true, writes learned context back to DB (webhook context).
 *                         if false, read-only evaluation (auth context). (Brief 150 AC 5-6)
 */
async function evaluateVoiceCore(
  sessionId: string,
  persistLearned: boolean,
): Promise<VoiceEvaluation | null> {
  const [existing] = await db
    .select()
    .from(schema.chatSessions)
    .where(eq(schema.chatSessions.sessionId, sessionId));
  if (!existing) return null;

  const session: ChatSession = {
    id: existing.id,
    sessionId: existing.sessionId,
    messages: existing.messages as Array<{ role: string; content: string }>,
    context: existing.context,
    ipHash: existing.ipHash,
    requestEmailFlagged: existing.requestEmailFlagged ?? false,
    messageCount: existing.messageCount ?? 0,
    authenticatedEmail: existing.authenticatedEmail ?? null,
    learned: (existing.learned as Record<string, string | null>) ?? null,
    callOffered: existing.callOffered ?? false,
    voiceToken: existing.voiceToken ?? null,
    personaId: existing.personaId ?? null,
    stage: existing.stage ?? "picker",
    interviewTranscripts: existing.interviewTranscripts ?? null,
  };

  if (session.messages.length === 0) return null;

  try {
    // Build the SAME prompt + tools as text chat
    const conversationStage = inferConversationStage(session);
    const evalPromptMode: PromptMode = session.stage === "interview" ? "interview" : "main";
    const systemPrompt = buildFrontDoorPrompt(
      session.context as ChatContext,
      undefined,
      conversationStage,
      "voice",
      { personaId: session.personaId ?? "alex", promptMode: evalPromptMode },
    ) + buildStateDirective(session);

    let llmMessages: LlmMessage[] = session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Claude does not support assistant message prefill — the conversation
    // must end with a user message. If the last message is from the assistant
    // (e.g. Alex's last response before the voice call), append a synthetic
    // user prompt so the evaluation can run.
    if (llmMessages.length > 0 && llmMessages[llmMessages.length - 1].role === "assistant") {
      llmMessages = [...llmMessages, { role: "user", content: "[Voice call active — evaluate the conversation so far and produce guidance for the next turn.]" }];
    }

    // Run the SAME LLM call as text chat — same model, same tool schema
    const response = await createCompletion({
      system: systemPrompt,
      messages: llmMessages,
      tools: [ALEX_RESPONSE_TOOL],
      maxTokens: 400,
    });

    // Extract using the SAME extraction as text chat
    const rawExtracted = extractAlexResponse(response.content);

    // Merge learned into session — SAME as text chat
    if (rawExtracted.learned) {
      session.learned = { ...(session.learned || {}), ...rawExtracted.learned };
    }

    // Run stage gates — SAME as text chat
    const gated = enforceStageGates(rawExtracted, session);

    // Only persist learned context when called from webhook context (Brief 150 AC 5-6)
    if (persistLearned) {
      await db
        .update(schema.chatSessions)
        .set({ learned: session.learned, updatedAt: new Date() })
        .where(eq(schema.chatSessions.sessionId, sessionId));
    }

    // The harness reply IS the guidance
    const guidance = gated.reply || "Continue the conversation.";

    let stage = "gathering";
    if (gated.done) stage = "complete";
    else if (gated.requestEmail) stage = "activating";
    else if (rawExtracted.detectedMode) stage = "proposing";

    console.log(`[evaluateVoice] Stage: ${stage}, mode: ${rawExtracted.detectedMode || "?"}, learned: ${JSON.stringify(session.learned)}, persist: ${persistLearned}`);

    return {
      learned: (session.learned as LearnedContext) || {},
      stage,
      guidance,
    };
  } catch (err) {
    console.warn("[evaluateVoice] Failed:", (err as Error).message);
    return null;
  }
}

/**
 * Evaluate voice conversation — writes learned context to DB.
 * Use from webhook/tool context where writes are expected.
 */
export async function evaluateVoiceConversation(
  sessionId: string,
): Promise<VoiceEvaluation | null> {
  return evaluateVoiceCore(sessionId, true);
}

/**
 * Read-only voice evaluation — does NOT write to DB.
 * Use from auth endpoint where only a read is expected. (Brief 150 AC 5)
 */
export async function evaluateVoiceConversationReadOnly(
  sessionId: string,
): Promise<VoiceEvaluation | null> {
  return evaluateVoiceCore(sessionId, false);
}

/**
 * Persist voice transcript turns to session messages. (Brief 150 AC 1-2)
 * Merges voice turns into the existing messages array, avoiding duplicates.
 * Each voice turn is prefixed with [voice] to distinguish from text chat.
 */
export async function saveVoiceTranscript(
  sessionId: string,
  voiceToken: string,
  turns: Array<{ role: "user" | "alex"; text: string }>,
): Promise<boolean> {
  const session = await loadSessionForVoice(sessionId, voiceToken);
  if (!session) return false;
  if (turns.length === 0) return true;

  // Append voice turns as messages with [voice] prefix for traceability
  const newMessages = turns.map((t) => ({
    role: t.role === "user" ? "user" : "assistant",
    content: `[voice] ${t.text}`,
  }));

  const merged = [...session.messages, ...newMessages];

  await db
    .update(schema.chatSessions)
    .set({
      messages: merged,
      messageCount: (session.messageCount || 0) + turns.length,
      updatedAt: new Date(),
    })
    .where(eq(schema.chatSessions.sessionId, sessionId));

  return true;
}

/**
 * Append a text message to a session during an active voice call.
 * Treated as regular user input — the voice agent picks it up on the next turn.
 *
 * If the text contains a URL, kicks off async enrichment (web fetch) so
 * the results appear in the chat UI and are available to the voice agent.
 */
export async function appendTextContext(session: ChatSession, text: string): Promise<void> {
  session.messages.push({
    role: "user",
    content: text,
  });
  session.messageCount += 1;
  await saveSession(session);

  // Async enrichment: if the text looks like a URL, fetch it in the background
  // and append the results to the session for the voice agent to use.
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    // Fire and forget — don't block the response
    enrichSessionWithUrl(session.sessionId, urlMatch[0]).catch((err) => {
      console.warn("[appendTextContext] Background enrichment failed:", (err as Error).message);
    });
  }
}

/**
 * Fetch a URL and append the content to the session as assistant context.
 * Runs async — the voice agent sees the results on its next turn.
 */
async function enrichSessionWithUrl(sessionId: string, url: string): Promise<void> {
  const { fetchUrlContent } = await import("./web-fetch");
  const result = await fetchUrlContent(url);
  if (!result.content) return;

  // Reload the session (may have changed since we started)
  const [existing] = await db
    .select()
    .from(schema.chatSessions)
    .where(eq(schema.chatSessions.sessionId, sessionId));
  if (!existing) return;

  const messages = existing.messages as Array<{ role: string; content: string }>;
  messages.push({
    role: "assistant",
    content: `I've looked at ${url} — here's what I found:\n\n${result.content.slice(0, 2000)}`,
  });

  await db
    .update(schema.chatSessions)
    .set({ messages, updatedAt: new Date() })
    .where(eq(schema.chatSessions.sessionId, sessionId));
}

/**
 * Load a session by sessionId, validating a voice token for security (Brief 142).
 * Returns null if session not found, expired, or token doesn't match.
 */
export async function loadSessionForVoice(
  sessionId: string,
  voiceToken: string,
): Promise<ChatSession | null> {
  const [existing] = await db
    .select()
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.sessionId, sessionId),
        sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
      ),
    );

  if (!existing) return null;
  if (existing.voiceToken !== voiceToken) return null;

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
    callOffered: existing.callOffered ?? false,
    voiceToken: existing.voiceToken ?? null,
    personaId: existing.personaId ?? null,
    stage: existing.stage ?? "picker",
    interviewTranscripts: existing.interviewTranscripts ?? null,
  };
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
  options?: Pick<ChatPipelineOptions, "personaId" | "promptMode">,
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

  // Brief 152: resolve prompt mode here so email capture is skipped in interview/intro.
  const nonStreamPromptMode: PromptMode = options?.promptMode
    ?? (session.stage === "interview" ? "interview" : "main");
  const nonStreamIsInterview = nonStreamPromptMode === "intro" || nonStreamPromptMode === "interview";

  // Determine the visitor's email from: returning cookie, email in message, or conversation history
  // In test mode, ignore returningEmail so every visit feels like a new user
  let knownEmail = (isTestMode() || nonStreamIsInterview ? null : returningEmail) || null;
  let emailCaptured = false;

  // Extract email from anywhere in the message (e.g. "Tim, tim@company.com") — skipped in interview.
  const emailMatch = !nonStreamIsInterview && trimmedMessage.match(EMAIL_EXTRACT_REGEX);
  if (emailMatch) {
    knownEmail = emailMatch[0];
    emailCaptured = true;

    // Trigger intake as side effect — creates person record + sends intro email
    // In test mode, emails are suppressed at the channel adapter level
    const name = visitorName || extractNameFromConversation(session.messages);
    const need = extractNeedFromConversation(session.messages);
    // Brief 126 AC4: pass sessionId so intro email metadata can trace replies
    try { await startIntake(knownEmail, name, need, undefined, session.personaId ?? "alex", undefined, session.sessionId); } catch { /* non-fatal */ }
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
  const nonStreamPersonaId: PersonaId = options?.personaId ?? session.personaId ?? "alex";
  const systemPrompt = buildFrontDoorPrompt(context, visitorContext, conversationStage, undefined, {
    personaId: nonStreamPersonaId,
    promptMode: nonStreamPromptMode,
  }) + buildStateDirective(session);

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
  let { reply, question: declaredQuestion, requestName, requestLocation, requestEmail, done, resendEmail, suggestions, detectedMode, searchQuery, fetchUrl, extraQuestions } = extracted;

  // Brief 152: strip all funnel flags in interview/intro mode.
  if (nonStreamIsInterview) {
    requestName = false;
    requestLocation = false;
    requestEmail = false;
    done = false;
    resendEmail = false;
    detectedMode = null;
    searchQuery = null;
    fetchUrl = null;
    extraQuestions = [];
  }

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
      await startIntake(knownEmail, undefined, undefined, undefined, session.personaId ?? "alex");
      console.log(`[network-chat] Resent welcome email to ${knownEmail}`);
    } catch { /* non-fatal */ }
  }

  // Deduplicate: skip fetchUrl if the URL was already fetched in this conversation
  if (fetchUrl) {
    const alreadyFetched = session.messages.some((m) =>
      m.content.includes(`[PAGE_CONTENT from ${fetchUrl}]`) || m.content.includes(`[PAGE_FETCH_FAILED for ${fetchUrl}]`)
    );
    if (alreadyFetched) {
      console.log(`[network-chat] Skipping duplicate fetchUrl: ${fetchUrl}`);
      fetchUrl = null;
    }
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
      declaredQuestion = followUpGated.question ?? declaredQuestion;
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
  // model missed. Also catches zero-question replies that would stall the
  // conversation — appends the declared question from the tool call if available.
  const validated = await validateAndCleanResponse(reply, declaredQuestion);
  reply = validated.cleanedReply;
  extraQuestions = validated.extraQuestions;

  // Brief 126: Safety net — if email was captured in THIS turn (emailCaptured flag)
  // and the LLM's response + enrichment loop didn't set done, force it.
  // This prevents the limbo state where ACTIVATE never fires after EMAIL_CAPTURED.
  // Only applies when emailCaptured was set THIS turn (from regex match) — not
  // for returning visitors where knownEmail comes from the cookie.
  // Brief 152: never force done during interview/intro stage.
  if (!done && emailCaptured && knownEmail && !nonStreamIsInterview) {
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
        await sendCosActionEmail(knownEmail, session.personaId ?? "alex", personName, conversationSummary, activatePersonId);
      } else {
        // "both" and single outreach modes both send the outreach action email
        await sendActionEmail(knownEmail, session.personaId ?? "alex", personName, conversationSummary, activatePersonId, outreachStyle);
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
  | { type: "content-block"; block: ContentBlock }
  | { type: "metadata"; requestName: boolean; requestLocation: boolean; requestEmail: boolean; done: boolean; suggestions: string[]; detectedMode: DetectedMode; emailCaptured: boolean; plan: string | null; learned: LearnedContext | null; extraQuestions: string[]; voiceReady?: boolean; voiceToken?: string }
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
  options?: ChatPipelineOptions,
): AsyncGenerator<ChatStreamEvent> {
  const ipHash = options?.ipPreHashed ? ip : hashIp(ip);

  // Rate limit: IP (skip for voice channel)
  if (!options?.skipRateLimit) {
    const ipAllowed = await checkIpRateLimit(ipHash);
    if (!ipAllowed) {
      yield { type: "session", sessionId: sessionId || randomUUID(), ...(isTestMode() ? { testMode: true } : {}) };
      yield { type: "text-delta", text: "We've been chatting a lot — drop me your email and I'll continue there. Better for both of us." };
      yield { type: "metadata", requestName: false, requestLocation: false, requestEmail: true, done: false, suggestions: [], detectedMode: null, emailCaptured: false, plan: null, learned: null, extraQuestions: [] };
      yield { type: "done" };
      return;
    }
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
  try { model = options?.model || getConfiguredModel(); } catch { /* mock mode */ }

  // Intercept bracket-tagged funnel events
  const funnelEventMatch = message.trim().match(/^\[(\w+)\]$/);
  if (funnelEventMatch) {
    const eventName = funnelEventMatch[1];
    await recordFunnelEvent(session.sessionId, eventName, context, { ipHash, ...funnelMetadata });
    yield { type: "done" };
    return;
  }

  // Record chat message events (fire-and-forget — don't block the response)
  recordFunnelEvent(session.sessionId, "chat_message", context, { ipHash }).catch(() => {});
  if (session.messageCount === 0) {
    recordFunnelEvent(session.sessionId, "conversation_started", context).catch(() => {});
  }

  const trimmedMessage = message.trim();

  // Brief 152: interview/intro turns MUST NOT trigger intake — even if the
  // visitor happens to paste an email in the interview. Resolve the prompt
  // mode here (early) so we can short-circuit email capture below.
  const earlyPromptMode: PromptMode = options?.promptMode
    ?? (session.stage === "interview" ? "interview" : "main");
  const isPreCommitTurn = earlyPromptMode === "intro" || earlyPromptMode === "interview";

  // Email detection (same as non-streaming)
  // In test mode, ignore returningEmail so every visit feels like a new user
  let knownEmail = (isTestMode() || isPreCommitTurn ? null : returningEmail) || null;
  let emailCaptured = false;

  const streamEmailMatch = !isPreCommitTurn && trimmedMessage.match(EMAIL_EXTRACT_REGEX);
  if (streamEmailMatch) {
    knownEmail = streamEmailMatch[0];
    emailCaptured = true;
    const name = visitorName || extractNameFromConversation(session.messages);
    const need = extractNeedFromConversation(session.messages);
    // Brief 126 AC4: pass sessionId so intro email metadata can trace replies
    try { await startIntake(knownEmail, name, need, undefined, session.personaId ?? "alex", undefined, session.sessionId); } catch { /* non-fatal */ }
    await recordFunnelEvent(session.sessionId, "email_captured", context, {
      hasName: !!name, hasNeed: !!need,
    });
    session.messages.push({ role: "user", content: `[EMAIL_CAPTURED]${name ? ` ${name}` : ""} ${trimmedMessage}` });
  } else {
    session.messages.push({ role: "user", content: trimmedMessage });
  }

  session.messageCount += 1;

  // Visitor context + geolocation — run in parallel, skip person lookup in test mode
  let visitorContext: VisitorContext | undefined;
  const geoPromise = geolocateIp(ip, ipHash);
  const visitorPromise = (knownEmail && !isTestMode())
    ? assembleVisitorContext(knownEmail).catch(() => ({ email: knownEmail, isReturning: !!returningEmail } as VisitorContext))
    : Promise.resolve(undefined);

  const [geo, resolvedVisitor] = await Promise.all([geoPromise, visitorPromise]);
  visitorContext = resolvedVisitor;
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
  // Brief 152: resolve persona + mode. Explicit options override session state,
  // which lets the picker stream intros for a persona before the session commits.
  const streamPersonaId: PersonaId = options?.personaId ?? session.personaId ?? "alex";
  const streamPromptMode: PromptMode = earlyPromptMode;
  const isInterviewTurn = isPreCommitTurn;
  const systemPrompt = buildFrontDoorPrompt(context, visitorContext, streamConversationStage, options?.channel, {
    personaId: streamPersonaId,
    promptMode: streamPromptMode,
  }) + buildStateDirective(session);

  const llmRequest = {
    system: systemPrompt,
    messages: llmMessages,
    tools: [ALEX_RESPONSE_TOOL],
    maxTokens: options?.maxTokens || 400,
    ...(model ? { model } : {}),
  };

  // Phase 1: Stream text directly from LLM to user for instant feedback.
  // Text blocks stream as text-deltas. Tool call (alex_response) is captured
  // at the end for metadata. If enrichment is needed (search/fetch), a
  // follow-up non-streaming call replaces the text.
  yield { type: "status", message: "Thinking…" };

  let streamedText = "";
  let thinkContent: import("./llm").LlmContentBlock[] = [];
  let thinkCost = 0;
  let needsEnrichment = false;

  for await (const event of createStreamingCompletion(llmRequest)) {
    if (event.type === "text-delta") {
      // Stream text directly to the user — instant feedback
      yield { type: "text-delta" as const, text: event.text };
      streamedText += event.text;
    } else if (event.type === "content-complete") {
      thinkContent = event.content;
      thinkCost = event.costCents;
    }
  }
  recordFrontDoorSpend(thinkCost);

  const streamRawExtracted = extractAlexResponse(thinkContent);
  // Update session.learned BEFORE gate enforcement so gates see this turn's context
  if (streamRawExtracted.learned) {
    session.learned = { ...(session.learned || {}), ...streamRawExtracted.learned };
  }
  const streamExtracted = enforceStageGates(streamRawExtracted, session);
  let { reply, question: streamDeclaredQuestion, requestName, requestLocation, requestEmail, done, resendEmail, suggestions, detectedMode, searchQuery, fetchUrl, plan, learned, extraQuestions } = streamExtracted;

  // Brief 152: interview/intro mode strips all funnel-advancement flags.
  // The user hasn't picked a persona yet — we must not ask for email, mark
  // the conversation done, or kick off intake. Defensive: even if the LLM
  // emits these flags, the server refuses to act on them.
  if (isInterviewTurn) {
    requestName = false;
    requestLocation = false;
    requestEmail = false;
    done = false;
    resendEmail = false;
    detectedMode = null;
    searchQuery = null;
    fetchUrl = null;
    plan = null;
    extraQuestions = [];
  }

  // Mode detection funnel event
  if (detectedMode) {
    recordFunnelEvent(session.sessionId, "mode_detected", context, {
      mode: detectedMode,
      messageCount: session.messageCount,
    }).catch(() => {});
  }

  if (requestEmail) {
    session.requestEmailFlagged = true;
  }

  // Resend email — respects the session's committed persona, not hardcoded Alex
  if (resendEmail && knownEmail) {
    try {
      await startIntake(knownEmail, undefined, undefined, undefined, session.personaId ?? "alex");
    } catch { /* non-fatal */ }
  }

  // Deduplicate: skip fetchUrl if the URL was already fetched in this conversation
  if (fetchUrl) {
    const alreadyFetched = session.messages.some((m) =>
      m.content.includes(`[PAGE_CONTENT from ${fetchUrl}]`) || m.content.includes(`[PAGE_FETCH_FAILED for ${fetchUrl}]`)
    );
    if (alreadyFetched) {
      console.log(`[network-chat] Skipping duplicate fetchUrl: ${fetchUrl}`);
      fetchUrl = null;
    }
  }

  // Check if enrichment is needed (search/fetch triggered by alex_response)
  needsEnrichment = !!(searchQuery || fetchUrl) && !options?.skipEnrichment;
  let lastEnrichmentText: string | null = null;

  // If enrichment is needed, the streamed text will be replaced.
  // Send a text-replace event so the frontend knows to swap it.
  if (needsEnrichment) {
    for (let enrichRound = 0; enrichRound < 2; enrichRound++) {
      let enrichContent: string | null = null;
      let enrichLabel = "";

      if (searchQuery) {
        if (enrichRound === 0) options?.onEnrichmentStart?.();
        yield { type: "status", message: "Searching…" };
        enrichContent = await webSearch(searchQuery);
        enrichLabel = `[SEARCH_RESULTS for "${searchQuery}"]`;
      } else if (fetchUrl) {
        if (enrichRound === 0) options?.onEnrichmentStart?.();
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
      lastEnrichmentText = enrichContent;

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
        yield { type: "status" as const, message: "Putting it together…" };
        const followUp = await createCompletion(followUpRequest);
        recordFrontDoorSpend(followUp.costCents);
        const followUpRaw = extractAlexResponse(followUp.content);
        if (followUpRaw.learned) {
          learned = followUpRaw.learned;
          session.learned = { ...(session.learned || {}), ...learned };
        }
        const followUpGated = enforceStageGates(followUpRaw, session);
        reply = followUpGated.reply;
        streamDeclaredQuestion = followUpGated.question ?? streamDeclaredQuestion;
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

    // Replace the streamed text with the enriched reply
    yield { type: "text-replace" as const, text: reply };
  }

  // ── Secondary LLM validation (Haiku) ──
  // Skip on first message — perceived latency matters most on the first turn.
  // Skip if text was already streamed without enrichment (can't un-stream it).
  // Brief 142: skip for voice channel — saves ~100-200ms latency
  if (!options?.skipValidation && session.messageCount > 1 && needsEnrichment) {
    yield { type: "status", message: "Checking…" };
    const streamValidated = await validateAndCleanResponse(reply, streamDeclaredQuestion);
    reply = streamValidated.cleanedReply;
    extraQuestions = streamValidated.extraQuestions;
    yield { type: "text-replace" as const, text: reply };
  }

  // Brief 137: Emit content blocks after text, before metadata (Insight-110 boundary)
  const frontDoorBlocks = buildFrontDoorBlocks({
    plan,
    detectedMode,
    learned,
    stage: streamConversationStage,
    enrichmentText: lastEnrichmentText,
  });
  for (const block of frontDoorBlocks) {
    yield { type: "content-block", block };
  }

  // Brief 126: Safety net — if email was captured but enrichment didn't set done.
  // Brief 152: never force done during interview/intro stage.
  if (!done && emailCaptured && knownEmail && !isInterviewTurn) {
    console.warn(`[network-chat] Forced done=true after EMAIL_CAPTURED — enrichment did not set done (session ${session.sessionId})`);
    done = true;
    await recordFunnelEvent(session.sessionId, "forced_done", context, {
      reason: "enrichment_did_not_set_done",
      messageCount: session.messageCount,
    });
  }

  // ACTIVATE (same as non-streaming) — guarded by done+knownEmail, both of which
  // are false in interview/intro mode.
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
    // Brief 152: action emails now come from the session's committed persona
    const streamActivatePersona: PersonaId = session.personaId ?? "alex";
    try {
      if (effectiveMode === "cos") {
        await sendCosActionEmail(knownEmail, streamActivatePersona, personName, conversationSummary, streamActivatePersonId);
      } else {
        await sendActionEmail(knownEmail, streamActivatePersona, personName, conversationSummary, streamActivatePersonId, streamOutreachStyle);
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

  // Brief 142b: Voice — persistent CTA.
  // voiceReady is emitted on EVERY turn (not one-shot) so the frontend
  // keeps the "Talk to Alex/Mira" button visible. Just needs a voiceToken
  // for session auth.
  // Brief 152: during the interview stage we surface voice immediately — the
  // whole point of the picker is to let the visitor try the voice. In main
  // stage we keep the pre-existing gate (wait until we've learned a name).
  let voiceReady: boolean | undefined;
  let voiceTokenOut: string | undefined;
  const voiceEligible = isInterviewTurn ? true : !!session.learned?.name;
  if (voiceEligible && options?.channel !== "voice") {
    voiceReady = true;
    // Reuse existing voiceToken or generate a new one
    if (!session.voiceToken) {
      session.voiceToken = randomUUID();
      await saveSession(session);
    }
    voiceTokenOut = session.voiceToken;
    // Record first offer for analytics (one-shot)
    if (!session.callOffered) {
      session.callOffered = true;
      await saveSession(session);
      await recordFunnelEvent(session.sessionId, "call_offered", context, {
        messageCount: session.messageCount,
        channel: options?.channel || "text",
      });
    }
  }

  // Send metadata and done
  yield { type: "metadata", requestName, requestLocation, requestEmail, done, suggestions, detectedMode, emailCaptured, plan, learned, extraQuestions, voiceReady, voiceToken: voiceTokenOut };
  yield { type: "done" };
}

// Brief 148: Re-export from dedicated module (avoids circular dep with magic-link.ts)
export { persistLearnedContext } from "./memory-bridge";
