# Brief 150: Voice Harness Tightening

**Date:** 2026-04-14
**Status:** complete
**Depends on:** Brief 142 (ElevenLabs Voice Architecture — complete)
**Unlocks:** Voice briefings (Insight 148), interaction analytics, ghost-mode voice calibration from real transcripts

## Goal

- **Roadmap phase:** Phase 6: External Integrations (voice channel tightening, extends Brief 142 work)
- **Capabilities:** Voice transcript persistence, real-time harness evaluation during calls, interaction recording, side-effect cleanup

## Context

Brief 142 delivered the ElevenLabs voice integration: hybrid architecture where ElevenLabs owns the voice stack and our harness owns intelligence via server tools. The implementation is working but has gaps identified during architectural review:

1. **No transcript persistence** — voice conversation turns are displayed in the UI but never saved to `chatSessions.messages`. After a call ends, the harness has no record of what was said. Future `evaluateVoiceConversation()` calls see an incomplete conversation.
2. **Rule-based fallback during calls** — The `get_context` server tool returns hardcoded guidance ("Ask the visitor's name") instead of running the LLM-powered harness evaluation. This contradicts Insight 178 ("harness as brain").
3. **No interaction recording** — Voice calls don't appear in the person's interaction history. Only a funnel event is recorded on call-end. The learning layer has no voice data.
4. **Write side-effect in auth flow** — `evaluateVoiceConversation()` updates `learned` context in the DB, but is called from the auth endpoint where it reads like a query. Violates Insight-180 (side-effecting functions should require harness context).

These gaps weaken the harness-as-brain principle and leave the learning layer blind to voice interactions.

## Objective

Voice calls are fully harness-driven (not rule-based), persist their transcript, record interactions, and separate read from write operations cleanly.

## Non-Goals

- Outbound voice calls (v2 — phone/SMS integration)
- Voice transcript search in VoiceChannelAdapter (v2)
- Real-time voice-to-text streaming to the chat UI (already working via `onMessage`)
- Changing the ElevenLabs agent config or voice model
- Voice briefings (Insight 148 — separate brief)

## Inputs

1. `src/engine/elevenlabs-agent.ts` — Agent config and server tool definitions
2. `packages/web/app/api/v1/voice/tool/route.ts` — Server tool webhook handlers
3. `packages/web/app/api/v1/voice/auth/route.ts` — Auth + pre-call evaluation
4. `packages/web/app/api/v1/voice/call-end/route.ts` — Call-end handler
5. `packages/web/app/welcome/voice-call.tsx` — Frontend voice component
6. `src/engine/network-chat.ts` — `evaluateVoiceConversation()`, `loadSessionForVoice()`
7. `docs/insights/178-voice-as-transport-harness-as-brain.md` — Core architectural principle
8. `docs/insights/148-voice-briefings-are-relationship-anchor.md` — Future direction this unlocks

## Constraints

- Do NOT change the ElevenLabs agent creation/update flow — `ensureAgent()` is working
- Do NOT break the existing text chat pipeline — voice evaluation must remain a parallel path
- The `evaluateVoiceConversation` read path (auth endpoint) must NOT write to DB. Separate the read from write.
- Side-effecting functions that write to DB from webhook context must validate `voiceToken` + `sessionId` (already done) — this is the voice equivalent of `stepRunId` since voice calls don't traverse the step execution pipeline. This voiceToken-as-guard pattern should be formalized in an ADR if it becomes a precedent for other non-step-pipeline side effects.
- Keep voice tool webhook response times under 10s (ElevenLabs timeout). The `get_context` harness evaluation must be fast enough or fall back gracefully.
- Transcript persistence must handle the case where the frontend disconnects unexpectedly (partial transcript is better than none)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Transcript persistence pattern | ElevenLabs `onMessage` callback | depend | Already receiving messages; need to persist them |
| Harness evaluation in webhook | Existing `evaluateVoiceConversation()` | pattern | Same pipeline, different call site |
| Interaction recording | Existing `recordInteraction()` in network-chat.ts | pattern | Same pattern as email interaction recording |
| Read/write separation | Insight-180, CQRS principle | pattern | Auth reads, webhooks write |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/api/v1/voice/tool/route.ts` | Modify: `get_context` calls `evaluateVoiceConversation()` instead of `buildFallbackGuidance()`, with timeout fallback. Remove dead `search` handler. |
| `packages/web/app/api/v1/voice/tool/route.ts` | Modify: Add `save_transcript` tool handler that persists voice turns to session messages |
| `packages/web/app/api/v1/voice/auth/route.ts` | Modify: Replace `evaluateVoiceConversation()` with a read-only version that does NOT write learned context to DB |
| `src/engine/network-chat.ts` | Modify: Split `evaluateVoiceConversation()` into `evaluateVoiceConversationReadOnly()` (for auth) and keep the existing function (for webhook). Add `saveVoiceTranscript()` function. |
| `packages/web/app/welcome/voice-call.tsx` | Modify: `onMessage` callback also sends transcript turns to a new `/api/v1/voice/transcript` endpoint (debounced batch). Fix `recentMessages` missing from `useCallback` deps. |
| `packages/web/app/api/v1/voice/transcript/route.ts` | Create: Endpoint to persist batched voice transcript turns to session messages |
| `packages/web/app/api/v1/voice/call-end/route.ts` | Modify: Record interaction (not just funnel event) using session learned context + transcript |
| `src/engine/elevenlabs-agent.ts` | Modify: Remove `search` from system prompt tools list (it was never registered as a server tool). Fix `get_context` tool description to say "at the start of EACH TURN" consistently. |
| `src/engine/channel-voice.test.ts` | Modify: Add test for transcript persistence round-trip |
| `docs/landscape.md` | Modify: Add ElevenLabs Conversational AI SDK evaluation entry |

## User Experience

- **Jobs affected:** Orient (voice conversation now persists and informs future interactions)
- **Primitives involved:** None — no new UI primitives. Existing voice call component is modified.
- **Process-owner perspective:** No visible change during the call. After the call, the transcript appears in session history. Harness guidance during the call becomes smarter (LLM-driven instead of rule-based). Person interaction history now includes voice calls.
- **Interaction states:** N/A — no new UI states
- **Designer input:** Not invoked — lightweight UX section only. Changes are backend intelligence improvements.

## Acceptance Criteria

1. [ ] Voice transcript turns (both user and agent) are persisted to `chatSessions.messages` during an active call
2. [ ] After a voice call, `evaluateVoiceConversation()` can see the voice turns in session messages
3. [ ] `get_context` client tool returns LLM-powered harness guidance via `/voice/guidance` endpoint (not rule-based fallback). Evolved from server tool to client tool per Insight 178 update.
4. [ ] `get_context` falls back to rule-based guidance if LLM evaluation exceeds 6 seconds (tightened from 8s to stay within ElevenLabs 10s tool timeout)
5. [ ] Auth endpoint (`/api/v1/voice/auth`) does NOT write to `chatSessions.learned` — read-only
6. [ ] `evaluateVoiceConversation()` called from webhook context still writes learned context (write path preserved)
7. [ ] Call-end records an interaction in the interactions table (not just a funnel event)
8. [ ] Interaction record includes: channel="voice", provider="elevenlabs", transcript summary, learned context
9. [ ] Dead `search` case removed from `/api/v1/voice/tool/route.ts`
10. [ ] `get_context` tool description in `elevenlabs-agent.ts` says "each turn" (not "start of conversation")
11. [ ] `recentMessages` included in `handleStartCall` useCallback dependency array
12. [ ] `pnpm run type-check` passes
13. [ ] `pnpm vitest run src/engine/channel-voice.test.ts` passes
14. [ ] ElevenLabs SDK has an evaluation entry in `docs/landscape.md`

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Transcript persistence doesn't break text chat session format
   - Read/write separation is clean (auth reads, webhooks write)
   - Harness evaluation timeout fallback works correctly
   - Interaction recording matches the pattern used for email interactions
   - No new side-effecting functions without voiceToken validation
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type-check
pnpm run type-check

# 2. Run voice tests
pnpm vitest run src/engine/channel-voice.test.ts

# 3. Manual E2E test:
# a. Start a voice call from the welcome page
# b. Have a 3-4 turn conversation
# c. Check DB: chatSessions.messages should include voice turns
# d. End the call
# e. Check DB: interactions table should have a voice interaction record
# f. Start a new text chat in same session — Alex should reference voice context
```

## Reference Docs

- `docs/architecture.md` — checked: no voice transport section exists. Voice is covered implicitly via the channel abstraction. No update needed unless voice becomes a named architectural transport (defer to Phase 11 mobile voice).
- `docs/landscape.md` — needs ElevenLabs SDK entry (AC 14)
- `docs/insights/178-voice-as-transport-harness-as-brain.md` — still accurate, no update needed

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for voice harness items
3. Move `docs/briefs/142-elevenlabs-voice-architecture.md` to `docs/briefs/complete/`
4. Phase retrospective: what worked, what surprised, what to change
