# Brief: Voice Channel — Chat-to-Call Upgrade via Vapi Web Embed

**Date:** 2026-04-13
**Status:** draft
**Depends on:** Brief 081 (channel abstraction), Brief 094 (front door conversation)
**Unlocks:** Voice-first front door experience, phone number capture for future outbound calls (v2)
**Reference docs:** `docs/architecture.md` (L2 adapter pattern, L6 human layer), `docs/human-layer.md` (six human jobs, conversation-first), `docs/insights/148-voice-briefings-are-relationship-anchor.md`, `docs/insights/174-unified-channel-apis-over-per-platform-automation.md`, `packages/core/src/harness/handlers/voice-calibration.ts`

## Goal

- **Roadmap phase:** Phase 14: Network Agent Continuous Operation
- **Capabilities:** Chat-to-voice upgrade in front door flow, Vapi Web SDK integration, voice-aware network-chat pipeline

## Context

The front door today is text-only: user chats with Alex through a staged conversation (gather → reflect → activate). Text is low-friction for opening the conversation, but once Alex has enough context (name, business, target), the richest next step is a live voice conversation — Alex can walk through ideas, riff on the user's problem, and capture email naturally in dialogue rather than a form field.

The channel abstraction (`src/engine/channel.ts`) already declares `"voice"` in its `ChannelAdapter.channel` union and the `interactions` table supports `"voice"` as a channel type. The infrastructure is ready.

**The core insight: voice is not a separate channel — it's a stage transition within the front door flow.** The user starts in chat (low friction, no permissions), Alex qualifies them, then offers a voice upgrade. Each channel transition is a trust escalation:

```
Text chat (gather) → Web call (reflect) → Phone call (future interactions)
```

**v1 is web embed only.** Vapi Web SDK runs in the browser — no phone numbers to provision, no telephony costs. The user clicks one button and they're in a voice call with Alex, who already has their context. Phone-based outbound calling is v2, gated on whether the web call converts.

**Relationship to Insight-148 (Voice Briefings Are the Relationship Anchor):** This brief implements voice for the front door conversation, not voice briefings. Insight-148's vision — Alex delivering a 90-second daily briefing by voice — is a separate, higher-value interaction that builds on the voice infrastructure established here. This brief validates the Vapi transport layer; voice briefings are a future brief that consumes it.

**Relationship to existing roadmap voice entries:** Roadmap lines 809/813 reference "Voice interaction (voice-in + voice-out)" as a mobile-remote-experience item gated on PWA-vs-native. This brief is a different scope — web-based front door voice, not mobile workspace voice. The mobile voice entries remain future work.

Vapi is used as a **transport layer only** (Option B): it handles STT, VAD, TTS, and interruption detection. Our harness owns the conversation — Vapi's "custom LLM" integration points at a new endpoint on our server. This preserves the full network-chat pipeline without orchestration duplication.

**Latency budget:**
- Best case (no enrichment): ~1.5s (VAD 300ms + STT 200ms + LLM 800ms + TTS 300ms) — acceptable
- With enrichment: ~3.5-6s dead air — unacceptable without mitigation
- Mitigation: emit filler phrase immediately when enrichment is signalled, skip Haiku validation for voice

## Objective

When Alex has gathered enough context in the text chat (name + business + target), the frontend offers a voice upgrade. The user clicks "Talk to Alex" and enters a browser-based voice call. The call runs through the same `networkChat` pipeline. After the call, Alex sends a transcript + summary email and triggers intake — the same activate flow as today, but with richer context from a real conversation.

## Non-Goals

- **Phone number provisioning or telephony** (v2 — only after web call is validated)
- **Outbound phone calls** (v2 — Alex calls user's number after they've given it in a web call)
- Custom VAD tuning or STT provider swaps (Vapi manages these)
- Voice for system agents or internal harness communication
- Voicemail handling
- Multi-party calls or conferencing
- Voice cloning of the user for ghost-mode calls
- SMS channel (separate brief, different adapter)
- Mobile app voice integration (separate concern)

## Inputs

1. `src/engine/channel.ts` — existing `ChannelAdapter` interface, `OutboundMessage`, `sendAndRecord()` pattern
2. `src/engine/network-chat.ts` — front-door pipeline: `networkChatStream()` generator, `inferConversationStage()` (line 375), enrichment loop (lines 836-899), Haiku validation (lines 901-906), stage gating, learned context, `startIntake` trigger
3. `src/engine/network-chat-prompt.ts` — system prompt construction
4. `packages/web/app/welcome/ditto-conversation.tsx` — frontend conversation component, SSE parsing, state machine (requestName, requestEmail, emailCaptured, done, learned, suggestions)
5. `src/db/schema.ts` — `InteractionChannel` already includes `"voice"`
6. Vapi Web SDK docs: `@vapi-ai/web` — browser-based voice calls, assistant configuration
7. Vapi server docs: custom LLM integration (OpenAI-compatible streaming)
8. `packages/core/src/harness/handlers/voice-calibration.ts` — existing voice model loading for persona consistency. Voice ID selection for TTS should align with the voice model already configured here.

## Constraints

- **Vapi as transport only.** Vapi must NOT own the LLM call or conversation state. Use Vapi's "custom LLM" / "server URL" mode exclusively. Our `networkChat` pipeline runs the conversation.
- **Web embed only for v1.** No phone numbers, no Twilio, no telephony. Vapi Web SDK in the browser. This keeps scope tight and costs low while validating the pattern.
- **Chat session continuity.** The voice call must inherit the existing `ChatSession` — same `sessionId`, same `learned` context, same message history. Alex doesn't re-ask what they already know.
- **No Haiku validation for voice.** The 100-200ms validation pass adds perceptible latency. Skip it when the caller is the voice endpoint.
- **Filler phrases for enrichment.** When the pipeline signals `searchQuery` or `fetchUrl`, the voice endpoint must immediately emit a filler phrase before running the enrichment loop. Zero dead air.
- **Streaming text at sentence boundaries.** Not word-level (choppy TTS), not full-response (latency). Sentence boundaries give TTS enough context for natural prosody.
- **Persona voice mapping.** Alex gets a specific voice ID. Configured in environment variables, not hardcoded.
- **Content blocks are visual-only during call.** `ProcessProposalBlock`, `RecordBlock`, etc. cannot be spoken. During the call they are stored and surface in the post-call email and in the chat transcript rendered after the call ends.
- **Call duration limit.** v1 caps calls at 10 minutes to control cost. Configurable via env var. Alex signs off gracefully: "Let me send you a summary of everything we discussed."
- **`DITTO_TEST_MODE` gating.** Voice calls must be suppressible in test mode.
- **Voice endpoint session security.** The voice endpoint must validate that the session ID passed in Vapi metadata belongs to the caller. Use IP correlation (the voice endpoint request should originate from the same IP that created the chat session) or a session-bound token (generated when `offerCall` is emitted, passed to Vapi metadata, validated by voice endpoint). Without this, an attacker who guesses a session ID could resume someone else's conversation.
- **Email capture happens conversationally.** During the voice call, Alex naturally asks for email ("I'll send you a summary — what's your best email?"). The pipeline regex-matches it from the transcript, same as today.
- **Phone number is earned, not asked.** At the end of a good web call, Alex offers: "Want me to be able to call you directly next time?" This captures the phone number for v2 outbound. Not required for v1, but the learned context field (`learned.phone`) should be ready. v2 must add an explicit consent gate before using a captured phone number for outbound calls — storing it is not permission to call.
- **Trust tier: pre-workspace, no trust gate.** Front door voice calls are network-participant interactions (Layer 1 per ADR-025). They occur before any workspace exists and are not governed by trust tiers. The voice call is an extension of the existing front-door chat, which also has no trust gate. Interactions are recorded for audit, but no trust-tier enforcement applies. Once a user has a workspace and Alex makes outbound calls on their behalf (v2), those calls will be governed by trust tiers — at minimum `supervised` for first calls to new contacts.
- **Audio data processed by third party.** User voice data flows through Vapi's servers for STT and TTS. This is inherent to the transport-layer architecture. The front door should include a brief disclosure before the call starts (e.g., "This call is processed by our voice partner"). For regulated-industry users (v2+), evaluate on-premise STT/TTS alternatives.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Voice transport (browser) | Vapi Web SDK (`@vapi-ai/web`) | depend | Browser-based voice calls, no telephony setup. Handles STT, TTS, VAD, interruption. |
| Voice transport (server) | Vapi Server SDK (`@vapi-ai/server-sdk`) | depend | Assistant configuration, call management API |
| Channel adapter pattern | `src/engine/channel.ts` UnipileAdapter | adopt | Proven pattern — voice adapter follows the same shape |
| Streaming response format | OpenAI chat completions streaming spec | pattern | Vapi's custom LLM expects OpenAI-compatible SSE |
| Filler phrase pattern | Vapi docs (function call speech) | pattern | Vapi supports `say` during tool execution — same concept for enrichment delays |
| Sentence-boundary chunking | ElevenLabs streaming best practices | pattern | Chunking at sentence boundaries produces natural TTS prosody |
| Chat-to-call UX | Drift/Intercom voice upgrade pattern | pattern | Conversational qualification → voice handoff is a proven B2B pattern |

## What Changes (Work Products)

### Backend — Voice Endpoint + Pipeline Options

| File | Action |
|------|--------|
| `src/engine/voice-endpoint.ts` | Create: Voice conversation endpoint for Vapi's custom LLM integration. Receives Vapi's OpenAI-format messages, maps to existing `ChatSession`, runs `networkChat` pipeline (no Haiku validation), streams response as OpenAI-compatible SSE. Handles filler phrases on enrichment signal. Sentence-boundary text chunking. |
| `src/engine/voice-endpoint.test.ts` | Create: Tests — filler on enrichment, sentence chunking, no Haiku pass, OpenAI SSE format, session continuity from chat, call duration limits. |
| `src/engine/network-chat.ts` | Modify: Add `options` parameter to `networkChat()` / `networkChatStream()`: `{ skipValidation?: boolean; onEnrichmentStart?: () => void; channel?: "text" \| "voice" }`. Voice endpoint passes `skipValidation: true` and an `onEnrichmentStart` callback that emits filler. |
| `src/engine/network-chat.ts` | Modify: Add `offerCall` signal to metadata event. Triggered by learned context fields directly: when `learned.name` AND `learned.business` AND (`learned.target` OR `learned.problem`) are all present, AND `offerCall` has not already been emitted for this session. This is independent of `inferConversationStage()` — the stage logic does not change. `offerCall` is a one-shot signal derived from learned context, not a stage transition. Add `callOffered: boolean` flag to `ChatSession` to prevent re-emitting. |
| `src/engine/network-chat.ts` | Modify: Add `learned.phone` to `LearnedContext` type for phone number capture during voice calls. |
| `src/engine/channel.ts` | Modify: Add `VoiceChannelAdapter implements ChannelAdapter` with `channel: "voice"` (v1: web call only via Vapi API). Add `createVoiceAdapter()` factory. |
| `src/engine/channel-voice.test.ts` | Create: Tests for VoiceChannelAdapter — web call initiation, transcript recording, test mode suppression. |
| `src/engine/vapi-assistant.ts` | Create: Programmatic Vapi assistant setup via Server SDK (`@vapi-ai/server-sdk`). `ensureAssistant()` creates or updates the Vapi assistant on startup: sets custom LLM server URL, voice ID (from `VAPI_ALEX_VOICE_ID`), VAD sensitivity, max call duration, and transcription config. Stores the resulting assistant ID in env/memory so the Web SDK can reference it. Idempotent — checks for existing assistant by name before creating. This eliminates manual Vapi dashboard configuration. |
| `src/engine/vapi-assistant.test.ts` | Create: Tests — assistant creation, idempotent update, config mapping from env vars. |

### Frontend — Call Mode UI

| File | Action |
|------|--------|
| `packages/web/app/welcome/ditto-conversation.tsx` | Modify: Handle `offerCall` metadata signal. When received, render call CTA alongside chat input. Handle `callActive` state — hide text input, show call UI. On call end, render transcript as messages, resume text mode. |
| `packages/web/app/welcome/voice-call.tsx` | Create: Voice call component. Wraps Vapi Web SDK. Props: `sessionId`, `onCallEnd(transcript)`, `onCallStart()`. Renders: call-active indicator (waveform/timer), mute button, end call button. Passes `sessionId` to Vapi assistant metadata so the voice endpoint can load the existing ChatSession. |
| `packages/web/app/welcome/voice-call.test.tsx` | Create: Tests — call initiation, session ID passthrough, call end with transcript, UI states. |
| `packages/web/lib/vapi.ts` | Create: Vapi Web SDK initialization. Creates Vapi instance with public key from env. Exports `startCall(assistantId, metadata)`, `endCall()`, event listeners. |

### Post-Call Flow

| File | Action |
|------|--------|
| `src/engine/voice-endpoint.ts` | Modify: On call end (Vapi webhook or SDK event), compile full transcript, send summary email via `sendAndRecord()`, trigger `startIntake` if email was captured during call. Same activate flow as text chat. |
| `src/engine/network-chat-prompt.ts` | Modify: When channel is voice, adjust system prompt — Alex should speak conversationally (shorter sentences, no markdown formatting, no bullet lists). Add voice-specific prompt section. |
| `src/engine/network-chat.ts` | Modify: Record voice funnel events via `recordFunnelEvent()`: `call_offered` (when `offerCall` emitted), `call_started` (voice endpoint receives first message), `call_completed` (call ends normally), `call_dropped` (call ends abnormally / error), `call_declined` (user denied mic or chose not to call — frontend reports via API). Same pattern as existing text chat funnel events. |

### Configuration

| File | Action |
|------|--------|
| `.env.example` | Modify: Add `VAPI_PRIVATE_KEY` (server-side only — never exposed to browser), `NEXT_PUBLIC_VAPI_PUBLIC_KEY` (browser-safe, `NEXT_PUBLIC_` prefix required for Next.js client exposure — this is a public key, not a secret), `VAPI_ASSISTANT_ID` (optional — if not set, `ensureAssistant()` creates one programmatically via Server SDK and caches the ID), `VAPI_ALEX_VOICE_ID`, `VAPI_MAX_CALL_MINUTES`, `VAPI_SERVER_URL` (the public URL for Vapi's custom LLM to call back to, e.g. `https://yourapp.com/api/v1/voice/respond`) |

## User Experience

- **Jobs affected:** Orient (voice conversation is richer than text for understanding user's situation), Delegate (user can verbally describe what they need), Capture (email + phone captured conversationally)
- **Primitives involved:** Activity Feed (call events: started, transcript, duration), TrustControl (call interactions recorded)
- **Process-owner perspective:** User lands on the front door, chats with Alex for 2-3 messages. Alex learns their name, business, and what they're looking for. A "Talk to Alex" button appears. User clicks it, browser mic activates, and they're in a live conversation with Alex who already knows their context. Alex walks through ideas, asks for their email naturally in conversation, and at the end says "I'll send you everything we discussed." User gets a summary email with a magic link. If the call went well, Alex asks for their phone number so they can call directly next time.

- **Interaction states:**
  - **Chat (gather stage):** Normal text conversation, no call option visible
  - **Call offered:** Alex has name + business + target. "Talk to Alex" button appears next to text input. Alex's last message references the option: "Want to jump on a quick call? I can walk you through what I'm thinking."
  - **Mic permission:** Browser permission prompt. If denied, fall back to text with message: "No worries — let's keep chatting here."
  - **Call active:** Text input hidden. Call UI shows: waveform/pulse animation, call duration timer, mute button, end call button. Status: "Talking with Alex..."
  - **Enrichment during call:** User hears "Good question — let me look into that" while Alex searches. No dead air.
  - **Call ending:** Alex wraps up: "I'll send you a summary. Great talking with you." Call UI fades, transcript renders as messages in the chat history.
  - **Post-call:** Chat shows full transcript. Email sent with summary + magic link. If email was captured during call, `startIntake` fires. User sees the same post-submission state as today.
  - **Call failed/dropped:** "Looks like we lost the connection. No worries — I've got everything we discussed. Want to pick up where we left off?" Falls back to text.
  - **Duration limit reached:** "I want to be respectful of your time — let me send you a summary of everything we covered." Graceful sign-off.

- **Designer input:** Not invoked — lightweight UX section. Call UI is minimal (one button to start, waveform + timer during, transcript after). No new pages or complex layouts.

## Acceptance Criteria

### Backend
1. [ ] `networkChatStream()` accepts `options` parameter with `skipValidation`, `onEnrichmentStart`, and `channel`
2. [ ] Voice endpoint accepts Vapi's OpenAI-format POST, loads existing `ChatSession` by `sessionId`, streams back OpenAI-compatible SSE
3. [ ] Voice call runs the full `networkChat` pipeline (stage gating, learned context, enrichment, persona) — same pipeline as text, not a fork
4. [ ] Haiku validation is skipped when `options.channel === "voice"`
5. [ ] When enrichment is triggered, `onEnrichmentStart` callback fires — voice endpoint uses this to emit filler phrase
6. [ ] Text is streamed at sentence boundaries
7. [ ] `offerCall` signal emitted in metadata when `learned.name` + `learned.business` + (`learned.target` or `learned.problem`) are present, one-shot per session via `callOffered` flag
8. [ ] `learned.phone` field supported in `LearnedContext`
9. [ ] Post-call: transcript compiled, summary email sent via `sendAndRecord()`, `startIntake` triggered if email captured
10. [ ] Voice system prompt produces conversational output (short sentences, no markdown, no bullet lists)
11. [ ] All voice interactions recorded in `interactions` table with `channel: "voice"`, transcript in metadata
12. [ ] Call duration capped at configurable limit (default 10 min) with graceful sign-off
13. [ ] `DITTO_TEST_MODE` suppresses real voice calls
14. [ ] Voice funnel events recorded: `call_offered`, `call_started`, `call_completed`, `call_dropped`, `call_declined`
15. [ ] Voice endpoint validates session ownership via session-bound token (generated at `offerCall`, passed through Vapi metadata, verified at voice endpoint)
16. [ ] `ensureAssistant()` programmatically creates/updates Vapi assistant via Server SDK — sets custom LLM URL, voice ID, max duration. Idempotent (checks by name before creating). No manual Vapi dashboard config required.

### Frontend
17. [ ] "Talk to Alex" CTA appears when `offerCall` metadata signal is received
18. [ ] Clicking CTA requests mic permission and initiates Vapi Web call with session-bound token in metadata
19. [ ] Chat UI switches to call mode: text input hidden, call UI visible (waveform/timer, mute, end call)
20. [ ] Mic permission denied: graceful fallback to text with message, `call_declined` funnel event recorded
21. [ ] On call end: transcript renders as messages in chat history, normal post-submission flow resumes
22. [ ] Call drop/error: fallback to text with recovery message

### Integration
23. [ ] `pnpm run type-check` passes
24. [ ] Unit tests pass for voice endpoint, channel adapter, vapi-assistant, and frontend components

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Pipeline preservation (voice uses same `networkChat`, not a fork), session continuity (chat session carries into voice), channel abstraction integrity, trust escalation pattern (text → web voice → phone), latency mitigations, frontend state machine consistency, post-call flow completeness
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type check
pnpm run type-check

# Unit tests
pnpm vitest run src/engine/voice-endpoint.test.ts
pnpm vitest run src/engine/channel-voice.test.ts

# Frontend build
cd packages/web && pnpm build

# Integration test (requires Vapi account):
# 1. Start dev server with VAPI_PRIVATE_KEY and VAPI_PUBLIC_KEY set
# 2. Open front door in browser
# 3. Chat with Alex: give name, business, target
# 4. Verify: "Talk to Alex" button appears
# 5. Click button, allow mic
# 6. Verify: call connects, Alex greets warmly with context from chat
# 7. Ask something that triggers web search
# 8. Verify: filler phrase plays, then answer follows
# 9. Give email verbally
# 10. End call
# 11. Verify: transcript appears in chat, summary email received, intake triggered
# 12. Check interactions table: voice interaction with transcript
```

## After Completion

1. Update `docs/state.md`: "Voice channel v1: Vapi web embed, chat-to-call upgrade, filler-on-enrichment"
2. Update `docs/roadmap.md`: add voice channel row to Phase 14
3. Update `docs/landscape.md`: add Vapi evaluation (web embed, transport-only Option B)
4. Capture insight: "Channel transitions as trust escalation — text → web voice → phone" → `docs/insights/`
5. Retrospective: Vapi Web SDK ergonomics, actual measured latency, call conversion rate, filler phrase UX quality
6. Scope v2 brief: phone number provisioning, outbound calls to earned phone numbers
