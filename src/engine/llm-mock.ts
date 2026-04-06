/**
 * Ditto — Mock LLM Responses for E2E Testing
 *
 * Provides deterministic canned responses keyed by regex patterns
 * on user message content. Used when MOCK_LLM=true.
 *
 * Canned responses cover:
 * - "build brief" → start_pipeline tool_use
 * - "plan" / "I want to add" → plan_with_role tool_use
 * - General questions → inline text response
 * - Unmatched → generic text response (never throw)
 *
 * Provenance: Brief 054 (Testing Infrastructure).
 */

import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmContentBlock,
} from "./llm";
import type { StreamEvent } from "./llm-stream";

// ============================================================
// Canned response fixtures
// ============================================================

interface CannedResponse {
  pattern: RegExp;
  content: LlmContentBlock[];
  stopReason: string;
}

const CANNED_RESPONSES: CannedResponse[] = [
  {
    pattern: /build\s+brief/i,
    content: [
      { type: "text", text: "I'll start the dev pipeline for this brief." },
      {
        type: "tool_use",
        id: "mock-tool-001",
        name: "start_pipeline",
        input: {
          task: "Build Brief 054: Testing Infrastructure",
          processSlug: "dev-pipeline",
        },
      },
    ],
    stopReason: "tool_use",
  },
  {
    pattern: /(?:plan|I want to add|I'd like to|let's design)/i,
    content: [
      { type: "text", text: "Let me help you plan that out." },
      {
        type: "tool_use",
        id: "mock-tool-002",
        name: "plan_with_role",
        input: {
          role: "architect",
          objective: "Design the implementation approach",
        },
      },
    ],
    stopReason: "tool_use",
  },
  {
    pattern: /(?:^|\b)(?:hello|hey)\b|(?:^|\s)hi(?:\s|$|!|,)/i,
    content: [
      { type: "text", text: "Hello! I'm Ditto, your AI workspace assistant. How can I help you today?" },
    ],
    stopReason: "end_turn",
  },
  {
    pattern: /markdown\s+test/i,
    content: [
      {
        type: "text",
        text: "# Heading One\n\n## Heading Two\n\nHere is a paragraph with **bold** and *italic* text.\n\n- First item\n- Second item\n- Third item\n\n```typescript\nconst x = 42;\nconsole.log(x);\n```\n\nAnd a [link](https://example.com).",
      },
    ],
    stopReason: "end_turn",
  },
];

// Front-door conversation mock responses (Brief 093)
const FRONT_DOOR_RESPONSES: CannedResponse[] = [
  {
    pattern: /(?:network|grow|connect|meet|introduction|outreach)/i,
    content: [
      { type: "text", text: '{"reply": "Good space. Tell me more \u2014 who are you trying to reach and what do you do?", "requestEmail": false, "done": false}' },
    ],
    stopReason: "end_turn",
  },
  {
    pattern: /(?:sell|business|product|tool|service|company|startup)/i,
    content: [
      { type: "text", text: '{"reply": "Got it. I\u2019d want to understand your ideal customer before I start making moves. Drop me your email and I\u2019ll send you a proper intro with some thoughts.", "requestEmail": true, "done": false}' },
    ],
    stopReason: "end_turn",
  },
  {
    pattern: /(?:how|what|work|does|do you)/i,
    content: [
      { type: "text", text: '{"reply": "I\u2019m an AI advisor at Ditto. I research people, draft introductions, and only reach out when I genuinely think there\u2019s a fit. No spam, ever. What are you working on?", "requestEmail": false, "done": false}' },
    ],
    stopReason: "end_turn",
  },
  {
    pattern: /(?:curious|just|looking)/i,
    content: [
      { type: "text", text: '{"reply": "Fair enough. What kind of work are you in? Happy to chat about whether I can actually help.", "requestEmail": false, "done": false}' },
    ],
    stopReason: "end_turn",
  },
  {
    pattern: /EMAIL_CAPTURED/,
    content: [
      { type: "text", text: '{"reply": "Nice one. Before I put something together \u2014 are you targeting residential or commercial customers?", "requestEmail": false, "done": false}' },
    ],
    stopReason: "end_turn",
  },
  {
    pattern: /RETURNING_USER/,
    content: [
      { type: "text", text: '{"reply": "Hey again. I\u2019ve been working on your intro \u2014 check your inbox. If you need anything else, I\u2019m here.", "requestEmail": false, "done": false}' },
    ],
    stopReason: "end_turn",
  },
  {
    pattern: /(?:didn.t receive|no email|didn.t get|not received|haven.t got|where.s my|check.* spam|resend|send again)/i,
    content: [
      { type: "text", text: '{"reply": "On it \u2014 I\u2019ve just resent it. Check your spam folder too, sometimes I end up there the first time.", "requestEmail": false, "done": false, "resendEmail": true}' },
    ],
    stopReason: "end_turn",
  },
];

const FRONT_DOOR_GENERIC: Omit<CannedResponse, "pattern"> = {
  content: [
    { type: "text", text: '{"reply": "Interesting. Tell me a bit more about what you\u2019re working on \u2014 I want to understand before I suggest anything.", "requestEmail": false, "done": false}' },
  ],
  stopReason: "end_turn",
};

const GENERIC_RESPONSE: Omit<CannedResponse, "pattern"> = {
  content: [
    { type: "text", text: "I'll help with that. Let me look into it." },
  ],
  stopReason: "end_turn",
};

// ============================================================
// Extract user message text from request
// ============================================================

function extractUserText(request: LlmCompletionRequest): string {
  const lastUserMsg = [...request.messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return "";

  if (typeof lastUserMsg.content === "string") {
    return lastUserMsg.content;
  }

  // Content blocks — extract text
  return lastUserMsg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join(" ");
}

// ============================================================
// Match response
// ============================================================

function matchResponse(userText: string, isFrontDoor: boolean): Omit<CannedResponse, "pattern"> {
  for (const canned of CANNED_RESPONSES) {
    if (canned.pattern.test(userText)) {
      return { content: canned.content, stopReason: canned.stopReason };
    }
  }
  // Front-door conversation patterns (Brief 093) — only match for front-door callers
  if (isFrontDoor) {
    for (const canned of FRONT_DOOR_RESPONSES) {
      if (canned.pattern.test(userText)) {
        return { content: canned.content, stopReason: canned.stopReason };
      }
    }
    return FRONT_DOOR_GENERIC;
  }
  return GENERIC_RESPONSE;
}

// ============================================================
// Public API
// ============================================================

/**
 * Mock createCompletion() — returns deterministic canned responses.
 * Never throws. Keyed by regex patterns on user message content.
 */
export function mockCreateCompletion(
  request: LlmCompletionRequest,
): LlmCompletionResponse {
  const userText = extractUserText(request);
  const isFrontDoor = request.purpose === "conversation" || request.system?.includes("front-door");
  const matched = matchResponse(userText, isFrontDoor);

  return {
    content: matched.content,
    tokensUsed: 100,
    costCents: 0,
    stopReason: matched.stopReason,
    model: "mock-model",
  };
}

/**
 * Mock createStreamingCompletion() — yields text deltas then content-complete.
 * Never throws. Same pattern matching as mockCreateCompletion.
 */
export async function* mockCreateStreamingCompletion(
  request: LlmCompletionRequest,
): AsyncGenerator<StreamEvent> {
  const userText = extractUserText(request);
  const isFrontDoor = request.purpose === "conversation" || request.system?.includes("front-door");
  const matched = matchResponse(userText, isFrontDoor);

  // Yield text deltas for text blocks
  for (const block of matched.content) {
    if (block.type === "text") {
      // Split into word-sized chunks for realistic streaming
      const words = block.text.split(" ");
      for (let i = 0; i < words.length; i++) {
        const text = i === 0 ? words[i] : ` ${words[i]}`;
        yield { type: "text-delta", text };
      }
    }
  }

  // Yield complete response
  yield {
    type: "content-complete",
    content: matched.content,
    costCents: 0,
    tokensUsed: 100,
  };
}
