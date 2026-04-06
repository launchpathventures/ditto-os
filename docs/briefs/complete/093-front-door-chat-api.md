# Brief 093: Front Door Chat API + Session Management

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 079 (Network Agent MVP — persona.ts, network-tools.ts exist)
**Unlocks:** Brief 094 (Conversational Home Page), Brief 095 (Verify + Referred Pages)

## Goal

- **Roadmap phase:** Phase 14: Network Agent
- **Capabilities:** Conversational chat endpoint for anonymous front-door visitors, server-side session storage, Alex system prompt for front-door context, rate limiting, funnel event instrumentation

## Context

The UX interaction spec (`docs/research/web-acquisition-funnel-ux.md`) defines a Formless.ai-style conversational front door where visitors talk to Alex before giving their email. All four web surfaces (home, verify, referred, post-submission) need Alex to respond conversationally. This brief builds the backend that powers them all.

The existing `/api/network/intake` endpoint is a one-shot form submission. The new chat endpoint enables multi-turn conversation where Alex demonstrates value before requesting identity.

## Non-Goals

- **Frontend components.** That's Brief 094.
- **Verify page logic or verification emails.** That's Brief 095.
- **Streaming responses.** Complete responses for MVP. Streaming is a follow-up optimisation.
- **Persistent conversation history beyond session TTL.** Sessions are ephemeral — intake records are permanent.
- **LLM model selection or routing.** Uses the existing LLM provider abstraction.

## Inputs

1. `docs/research/web-acquisition-funnel-ux.md` ��� The interaction spec this brief implements (backend portion)
2. `docs/ditto-character.md` — Alex's voice, personality traits, house values. The system prompt source.
3. `src/engine/persona.ts` — Existing persona config (Alex/Mira voice traits, signature patterns)
4. `src/engine/self-tools/network-tools.ts` — Existing `startIntake()` function to call after email capture
5. `docs/adrs/025-centralized-network-service.md` — API versioning (`/api/v1/network/`)
6. `DESIGN.md` — Front door is Alex's surface, not Ditto's workspace

## Constraints

- **Alex's responses MUST be 3 sentences max.** Hard limit enforced in the system prompt. Front-door conversation is not a workspace chat session.
- **Anonymous endpoint — no auth required.** This serves visitors who don't have accounts.
- **Rate limit: 20 messages per session, 60 messages per IP per hour.** Prevents abuse without blocking genuine visitors.
- **Session TTL: 7 days.** Returning visitors within a week get continuity. After that, fresh start.
- **The `requestEmail` flag is Alex's decision, not a turn counter.** The system prompt instructs Alex when to ask for email based on conversation context, not a rigid "ask after turn 3" rule. The nudge pattern (turns 3, 5, stop at 7) is guidance in the prompt, not code.
- **No sensitive data in session storage.** Conversation messages only — no email, no PII until intake is triggered.
- **Must use existing LLM provider abstraction** (`src/engine/` patterns). No direct API calls to Anthropic/OpenAI.
- **Email detection is server-side regex on the message text.** When the user's message matches an email pattern (RFC 5322 simplified: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), the backend treats it as an email submission and calls `startIntake()`. This is the simplest reliable approach. The LLM does not need to detect the email — the code does. If the regex matches and `requestEmail` was previously flagged in the session, trigger intake. If `requestEmail` was not flagged (user volunteered email unprompted), still accept it.
- **IP hashing uses SHA-256 with a server-side salt** (from `process.env.IP_HASH_SALT` or a random value generated at startup). Prevents rainbow table attacks if the database is compromised.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Conversational form pattern | Formless.ai (Typeform Labs) | pattern | AI responds conversationally, structured data extracted from unstructured input |
| Session-based conversation state | Drift conversational landing pages | pattern | Multi-turn state persisted server-side per visitor |
| Rate limiting per IP | Industry standard (express-rate-limit) | pattern | Abuse prevention for anonymous endpoints |
| System prompt for persona voice | Ditto existing `persona.ts` + character bible | existing | Alex's voice traits already defined, extending to front-door context |
| requestEmail as model decision | Formless.ai ("data capture happens within the conversation") | pattern | The model decides when to ask, not a hardcoded turn number |
| Funnel event tracking | Drift chat goals + Typeform analytics | pattern | Events fired on conversation milestones for conversion analysis |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/api/v1/network/chat/route.ts` | Create: `POST /api/v1/network/chat` — conversational endpoint (versioned per ADR-025). Accepts `{ message, sessionId, context }`. Returns `{ reply, sessionId, requestEmail?, done? }`. Note: this is a **web front door endpoint** (anonymous, public) distinct from the authenticated Network API endpoints in ADR-025. Shares the `/v1/network/` prefix for consistency but requires no auth. |
| `src/engine/network-chat.ts` | Create: `handleChatTurn(sessionId, message, context)` — orchestrates: load session → build prompt → call LLM → extract flags → save session → return response. |
| `src/engine/network-chat.test.ts` | Create: Tests for session creation, multi-turn continuity, requestEmail flag, rate limiting, 3-sentence enforcement, funnel events. |
| `src/engine/network-chat-prompt.ts` | Create: System prompt builder for Alex front-door conversations. Loads persona config + character bible excerpt + context-specific instructions (front-door vs referred). Includes the nudge guidance. |
| `src/db/schema.ts` | Modify: Add `chatSessions` table (id, sessionId, messages JSON, context, ipHash, createdAt, updatedAt, expiresAt). Add `funnelEvents` table (id, sessionId, event, surface, metadata JSON, createdAt). |
| `src/test-utils.ts` | Modify: Add `chat_sessions` and `funnel_events` tables to `createTables`. |

## User Experience

- **Jobs affected:** None directly — this is API infrastructure. The frontend (Brief 094) consumes this.
- **Designer input:** `docs/research/web-acquisition-funnel-ux.md` — Cross-Surface Design Decisions section defines the API contract and session model. This brief implements that contract.

## Acceptance Criteria

1. [ ] `POST /api/v1/network/chat` with `{ message: "Hello", sessionId: null, context: "front-door" }` returns `{ reply: "...", sessionId: "<uuid>", requestEmail: false }`.
2. [ ] Subsequent messages with the same `sessionId` reference prior conversation (Alex remembers what was discussed).
3. [ ] Alex's responses never exceed 3 sentences (verified by test with 5 different prompts).
4. [ ] Alex's voice matches the character bible: warm, direct, Australian-inflected. No corporate jargon. No sycophantic openers ("Great question!").
5. [ ] After 2-3 turns of relevant conversation, Alex's response includes `requestEmail: true` (verified by test with a realistic conversation flow).
6. [ ] The `context` field changes Alex's opening posture: `"front-door"` = curious/warm, `"referred"` = acknowledging/confident (verified by comparing responses for same user message with different contexts).
7. [ ] Rate limit: 21st message in a session returns 429. 61st message from same IP in an hour returns 429.
8. [ ] Sessions expire after 7 days. Expired `sessionId` creates a new session (no error).
9. [ ] `chatSessions` table stores conversation messages as JSON array. No PII stored until email is captured via intake.
10. [ ] `funnelEvents` table records: `conversation_started`, `quick_reply_used`, `nudge_shown`, `email_captured`, `post_submission_answered`, `post_submission_skipped`.
11. [ ] When a chat message matches the email regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), the endpoint calls `startIntake(email, name, need)` from existing `network-tools.ts` and returns `{ reply: "Nice one. I'll email you shortly.", done: true }`. Name is extracted from session context if the user mentioned it during conversation. Need is extracted from conversation summary.
12. [ ] The system prompt loads Alex's persona config from `persona.ts` and a condensed character bible excerpt (not the full 400-line document — a ~50 line front-door-specific extract).
13. [ ] IP addresses are hashed with SHA-256 + server-side salt before storage. Raw IPs are never persisted.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Does the chat endpoint follow ADR-025 API patterns? Is the session model consistent with existing DB patterns? Is the system prompt faithful to the character bible? Are security constraints (rate limiting, no PII in session, IP hashing) adequate?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Start the dev server
pnpm dev

# First message — creates session
curl -X POST http://localhost:3000/api/v1/network/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I need help growing my network in logistics", "sessionId": null, "context": "front-door"}'
# Expect: { reply: "...", sessionId: "abc-123", requestEmail: false }
# Alex should respond about logistics, ask a clarifying question

# Second message — continues session
curl -X POST http://localhost:3000/api/v1/network/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Selling fleet management tools", "sessionId": "abc-123", "context": "front-door"}'
# Expect: { reply: "...", sessionId: "abc-123", requestEmail: true }
# Alex should reference logistics from turn 1 and ask for email

# Email capture — triggers intake
curl -X POST http://localhost:3000/api/v1/network/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "tim@example.com", "sessionId": "abc-123", "context": "front-door"}'
# Expect: { reply: "Nice one. I'll email you shortly.", sessionId: "abc-123", done: true }

# Verify funnel events
# Check funnelEvents table has: conversation_started, email_captured
```

## After Completion

1. Update `docs/state.md` with what changed
2. Proceed to Brief 094 (Conversational Home Page)
