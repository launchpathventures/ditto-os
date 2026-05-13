import { randomUUID } from "crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AuthorizationRequestBlock, ContentBlock } from "./content-blocks";
import {
  createCompletion,
  extractText,
  extractToolUse,
  type LlmMessage,
  type LlmToolDefinition,
} from "./llm";
import { requireNetworkStepRunId } from "./network-step-run";
import { queueWorkspaceInboxDelivery } from "./workspace-inbox-delivery";
import type * as networkSchema from "@ditto/core/db/network";

export interface VisitorChatFact {
  factMd: string;
  visibility: "public" | "on-request" | "off";
  sourceLabel?: string | null;
}

export interface VisitorChatTurn {
  role: "visitor" | "greeter";
  content: string;
}

export interface VisitorGreeterResponseInput {
  message: string;
  userFirst: string;
  userName: string;
  greeterName: string;
  facts?: VisitorChatFact[];
  antiPersonaRules?: string[];
  visitorName?: string | null;
  visitorOrg?: string | null;
  transcript?: VisitorChatTurn[];
}

export type VisitorGreeterResponse =
  | { kind: "answer"; reply: string }
  | { kind: "forward-note"; reply: string; factQuestionMd: string }
  | { kind: "forward-offer"; reply: string; factQuestionMd: string }
  | { kind: "intro-preview"; reply: string; draft: string }
  | { kind: "refusal"; reply: string };

export interface VisitorPromptDrivenResponseInput extends VisitorGreeterResponseInput {
  representativePrompt: string;
}

export const VISITOR_PROFILE_RESPONSE_TOOL: LlmToolDefinition = {
  name: "visitor_profile_response",
  description:
    "Return the public profile representative reply and any side-effect intent for this visitor turn.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["answer", "forward-note", "forward-offer", "intro-preview", "refusal"],
      },
      reply: {
        type: "string",
        description: "Visitor-facing reply. Keep the representative voice and do not claim to be the profile owner.",
      },
      factQuestionMd: {
        type: ["string", "null"],
        description: "Required for forward-note and forward-offer; the verbatim visitor question or note.",
      },
      draft: {
        type: ["string", "null"],
        description: "Required for intro-preview; the draft intro request to show the visitor before delivery.",
      },
    },
    required: ["kind", "reply"],
  },
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "could",
  "does",
  "for",
  "from",
  "have",
  "into",
  "like",
  "only",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "want",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function overlapCount(a: string[], b: string[]): number {
  const set = new Set(a);
  let count = 0;
  for (const token of b) {
    if (set.has(token)) count += 1;
  }
  return count;
}

function bestFactMatch(message: string, facts: VisitorChatFact[]): VisitorChatFact | null {
  const messageTokens = tokenize(message);
  let best: { fact: VisitorChatFact; score: number } | null = null;
  for (const fact of facts) {
    if (fact.visibility === "off") continue;
    const score = overlapCount(messageTokens, tokenize(fact.factMd));
    if (score > (best?.score ?? 0)) best = { fact, score };
  }
  return best && best.score >= 2 ? best.fact : null;
}

function matchesAntiPersona(message: string, antiPersonaRules: string[]): boolean {
  const messageTokens = tokenize(message);
  return antiPersonaRules.some((rule) => {
    const ruleTokens = tokenize(rule).filter((token) => token !== "never" && token !== "dont");
    if (ruleTokens.length === 0) return false;
    const score = overlapCount(messageTokens, ruleTokens);
    return score >= Math.min(3, Math.max(2, Math.ceil(ruleTokens.length * 0.3)));
  });
}

function isIdentityProbe(message: string, userFirst: string, userName: string): boolean {
  const normalized = message.toLowerCase();
  return (
    /\bare you\b/.test(normalized) &&
    (normalized.includes(userFirst.toLowerCase()) ||
      normalized.includes(userName.toLowerCase()) ||
      normalized.includes("him") ||
      normalized.includes("her") ||
      normalized.includes("them"))
  );
}

function isAiProbe(message: string): boolean {
  return /\b(ai|chatbot|bot|language model)\b/i.test(message);
}

function isIntroRequest(message: string): boolean {
  return /\b(intro|introduce|introduction|meet|connect)\b/i.test(message);
}

function extractTellNote(message: string, userFirst: string): string | null {
  const tellPattern = new RegExp(`\\btell\\s+${userFirst}\\s+(?:that\\s+)?(.+)`, "i");
  const match = message.match(tellPattern) ?? message.match(/\bpass (?:this|that) (?:to|along to)\b(.+)/i);
  const note = cleanText(match?.[1] ?? "");
  return note || null;
}

function visitorLabel(visitorName?: string | null, visitorOrg?: string | null): string {
  if (visitorName && visitorOrg) return `${visitorName} at ${visitorOrg}`;
  if (visitorName) return visitorName;
  if (visitorOrg) return `someone at ${visitorOrg}`;
  return "a visitor";
}

export function buildVisitorIntroDraft({
  userFirst,
  visitorName,
  visitorOrg,
  transcript = [],
}: {
  userFirst: string;
  visitorName?: string | null;
  visitorOrg?: string | null;
  transcript?: VisitorChatTurn[];
}): string {
  const lastVisitorTurn = [...transcript].reverse().find((turn) => turn.role === "visitor");
  const ask = lastVisitorTurn?.content ?? "They asked for an introduction.";
  return [
    `Hi ${userFirst} - ${visitorLabel(visitorName, visitorOrg)} asked for an introduction through your public page.`,
    "",
    `Their ask: ${ask}`,
    "",
    "The full visitor transcript is attached below so you can decide whether this is worth taking.",
  ].join("\n");
}

export function buildVisitorGreeterResponse({
  message,
  userFirst,
  userName,
  greeterName,
  facts = [],
  antiPersonaRules = [],
  visitorName,
  visitorOrg,
  transcript = [],
}: VisitorGreeterResponseInput): VisitorGreeterResponse {
  const cleanedMessage = cleanText(message);

  if (isIdentityProbe(cleanedMessage, userFirst, userName)) {
    return {
      kind: "answer",
      reply: `I'm ${greeterName} - ${userFirst}'s representative. I can answer from what ${userFirst} has shared and pass along anything better answered directly.`,
    };
  }

  if (isAiProbe(cleanedMessage)) {
    return {
      kind: "answer",
      reply: `I'm ${greeterName}, ${userFirst}'s representative. I answer from ${userFirst}'s card and notes, and I can pass along anything that needs ${userFirst} directly.`,
    };
  }

  const tellNote = extractTellNote(cleanedMessage, userFirst);
  if (tellNote) {
    return {
      kind: "forward-note",
      factQuestionMd: tellNote,
      reply: `I'll pass that to ${userFirst}.`,
    };
  }

  if (isIntroRequest(cleanedMessage)) {
    if (matchesAntiPersona(cleanedMessage, antiPersonaRules)) {
      return {
        kind: "refusal",
        reply: "I don't think this is a fit right now - but feel free to follow up directly if you want to.",
      };
    }
    return {
      kind: "intro-preview",
      reply: `I'll draft that for ${userFirst}. You'll see exactly what gets sent before it goes anywhere.`,
      draft: buildVisitorIntroDraft({
        userFirst,
        visitorName,
        visitorOrg,
        transcript: [...transcript, { role: "visitor", content: cleanedMessage }],
      }),
    };
  }

  if (matchesAntiPersona(cleanedMessage, antiPersonaRules)) {
    return {
      kind: "refusal",
      reply: "I don't think this is a fit right now - but feel free to follow up directly if you want to.",
    };
  }

  const matchedFact = bestFactMatch(cleanedMessage, facts);
  if (matchedFact?.visibility === "public") {
    const source = matchedFact.sourceLabel ? ` (${matchedFact.sourceLabel})` : "";
    return {
      kind: "answer",
      reply: `${userFirst}'s notes say: ${matchedFact.factMd}${source}`,
    };
  }
  if (matchedFact?.visibility === "on-request") {
    return {
      kind: "forward-offer",
      factQuestionMd: cleanedMessage,
      reply: `They can speak to that. Want me to ask ${userFirst}?`,
    };
  }

  return {
    kind: "forward-offer",
    factQuestionMd: cleanedMessage,
    reply: `I don't know that from what ${userFirst} has shared. They can speak to that. Want me to ask ${userFirst}?`,
  };
}

function parseVisitorResponsePayload(input: Record<string, unknown>): VisitorGreeterResponse | null {
  const kind = typeof input.kind === "string" ? input.kind : "";
  const reply = typeof input.reply === "string" ? cleanText(input.reply).slice(0, 2_000) : "";
  if (!reply) return null;

  if (kind === "answer" || kind === "refusal") {
    return { kind, reply };
  }

  if (kind === "forward-note" || kind === "forward-offer") {
    const factQuestionMd =
      typeof input.factQuestionMd === "string" ? cleanText(input.factQuestionMd).slice(0, 2_000) : "";
    if (!factQuestionMd) return null;
    return { kind, reply, factQuestionMd };
  }

  if (kind === "intro-preview") {
    const draft = typeof input.draft === "string" ? input.draft.trim().slice(0, 4_000) : "";
    if (!draft) return null;
    return { kind, reply, draft };
  }

  return null;
}

function parseVisitorResponseText(text: string): VisitorGreeterResponse | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return parseVisitorResponsePayload(parsed);
  } catch {
    return { kind: "answer", reply: cleanText(trimmed).slice(0, 2_000) };
  }
}

function violatesVisitorHardRules(
  response: VisitorGreeterResponse,
  input: VisitorGreeterResponseInput,
): boolean {
  const reply = response.reply.toLowerCase();
  if (/\b(ai|chatbot|language model)\b/i.test(response.reply)) return true;
  if (isIdentityProbe(input.message, input.userFirst, input.userName)) {
    const first = input.userFirst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const full = input.userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(i am|i'm)\\s+(${first}|${full})\\b`, "i").test(response.reply)) return true;
  }
  return input.antiPersonaRules?.some((rule) => {
    const normalizedRule = cleanText(rule).toLowerCase();
    return normalizedRule.length > 12 && reply.includes(normalizedRule);
  }) ?? false;
}

function visitorPromptUserPayload(input: VisitorGreeterResponseInput): string {
  return JSON.stringify({
    visitorMessage: input.message,
    visitorName: input.visitorName ?? null,
    visitorOrg: input.visitorOrg ?? null,
    facts: input.facts ?? [],
    antiPersonaRuleCount: input.antiPersonaRules?.length ?? 0,
  });
}

export async function generateVisitorGreeterResponseFromPrompt({
  representativePrompt,
  ...input
}: VisitorPromptDrivenResponseInput): Promise<VisitorGreeterResponse> {
  const fallback = buildVisitorGreeterResponse(input);
  const llmMessages: LlmMessage[] = [
    ...(input.transcript ?? []).map((turn): LlmMessage => ({
      role: turn.role === "visitor" ? "user" : "assistant",
      content: turn.content,
    })),
    {
      role: "user",
      content: visitorPromptUserPayload(input),
    },
  ];

  const response = await createCompletion({
    purpose: "conversation",
    system: [
      representativePrompt,
      "",
      "Return exactly one structured result by calling visitor_profile_response.",
      "Use kind=forward-note when the visitor says to tell/pass something to the profile owner.",
      "Use kind=forward-offer for on-request or unknown facts that should be escalated to the owner.",
      "Use kind=intro-preview only when the visitor asks for an introduction and the anti-persona rules do not block it.",
    ].join("\n"),
    messages: llmMessages,
    tools: [VISITOR_PROFILE_RESPONSE_TOOL],
    maxTokens: 700,
  });

  const toolCall = extractToolUse(response.content).find(
    (call) => call.name === VISITOR_PROFILE_RESPONSE_TOOL.name,
  );
  const parsed = toolCall
    ? parseVisitorResponsePayload(toolCall.input)
    : parseVisitorResponseText(extractText(response.content));

  if (!parsed || violatesVisitorHardRules(parsed, input)) return fallback;
  return parsed;
}

export function buildVisitorTranscriptPreview(transcript: VisitorChatTurn[]): ContentBlock[] {
  return [
    {
      type: "data",
      format: "list",
      title: "Visitor transcript",
      data: transcript.map((turn, index) => ({
        turn: index + 1,
        speaker: turn.role === "visitor" ? "Visitor" : "Greeter",
        message: turn.content,
      })),
    },
  ];
}

export function buildVisitorIntroAuthorizationBlock({
  userName,
  userFirst,
  requesterId,
  draft,
  transcript,
  visitorName,
  visitorOrg,
}: {
  userName: string;
  userFirst: string;
  requesterId: string;
  draft: string;
  transcript: VisitorChatTurn[];
  visitorName?: string | null;
  visitorOrg?: string | null;
}): AuthorizationRequestBlock {
  const request = `Visitor intro request for ${userFirst}`;
  const preview: ContentBlock[] = [
    {
      type: "text",
      variant: "body",
      text: `Draft intro request\n\n${draft}`,
    },
    {
      type: "data",
      format: "key_value",
      title: "Requester",
      data: {
        requesterId,
        name: visitorName || "anonymous visitor",
        organization: visitorOrg || "",
      },
    },
    ...buildVisitorTranscriptPreview(transcript),
  ];

  return {
    type: "authorization-request",
    state: "pending",
    header: `Intro request for ${userFirst}`,
    recipientLabel: userName,
    actionClass: "email-send",
    executionResult: null,
    expiresAt: null,
    authorizationId: `visitor-intro-${randomUUID()}`,
    request,
    draft,
    requesterId,
    preview,
    costLabel: null,
    toolName: "visitor_intro_request",
    toolInput: {
      request,
      draft,
      requesterId,
      visitorName: visitorName ?? null,
      visitorOrg: visitorOrg ?? null,
      transcript,
    },
  };
}

export async function deliverVisitorIntroRequestToWorkspace({
  db,
  userId,
  block,
  stepRunId,
}: {
  db?: PostgresJsDatabase<typeof networkSchema>;
  userId: string;
  block: AuthorizationRequestBlock;
  stepRunId?: string | null;
}): Promise<typeof networkSchema.networkWorkspaceDeliveries.$inferSelect> {
  requireNetworkStepRunId(stepRunId, "visitor_intro_request", { rejectWebDirect: true });
  const result = await queueWorkspaceInboxDelivery({
    db,
    userId,
    kind: "visitor_intro_request",
    blocks: [block],
    stepRunId,
    dedupeKey: block.authorizationId ? `visitor-intro:${block.authorizationId}` : undefined,
  });
  return result.delivery;
}
