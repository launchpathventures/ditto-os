# Brief 180: Voice Context-Push Hardening

**Date:** 2026-04-17
**Status:** draft
**Depends on:** Brief 150 (Voice Harness Tightening — complete)
**Unlocks:** Voice-as-smart-as-text parity, reliable async guidance injection, foundation for Brief 148 (voice briefings)

## Goal

- **Roadmap phase:** Phase 6: External Integrations (voice channel quality)
- **Capabilities:** Reliable context delivery to live voice agent, elimination of silent guidance drops, push-pull hybrid with observability

## Context

Brief 150 delivered harness-driven voice evaluation with `get_context` as a blocking client tool. In practice the agent feels materially "dumber" than text chat. Investigation identified the root cause as **context deprivation**, not model capability — the ElevenLabs fast LLM paraphrases whatever guidance arrives; if no guidance arrives in time (or at all), we fall back to hardcoded rules.

Specific verified gaps (as of 2026-04-17):

1. **Client-side 4s throttle on eager push** (`packages/web/app/welcome/voice-call.tsx:180`) silently drops guidance computes when the user speaks twice inside the window.
2. **Push only fires on user-speech-final** — nothing recomputes after an agent turn, so the next user utterance starts with stale context.
3. **Safety-net poll runs every 10s** (`packages/web/app/welcome/ditto-conversation.tsx:343`) — too slow for a 3-4 turn/min conversation.
4. **Evaluation does not call `assembleVisitorContext`** (compare `network-chat.ts:704-710` to text-chat path at `network-chat.ts:1135`). Returning visitors are treated as strangers during voice.
5. **Voice guidance is not validated** — text chat runs `validateAndCleanResponse` (`network-chat.ts:1314`) to strip filler, enforce one-question, remove sycophancy. Voice ships `gated.reply` raw.
6. **No cross-session-state push channel** — backend events (memory updates, harness re-evaluation on schedule, another device updating the session) have no way to reach the live voice agent.
7. **No observability for push-vs-pull** — we cannot tell whether the agent actually consumed a pushed contextual update or fell back to `get_context`.

Stress-testing the naive "push everything on VAD + remove `get_context` + SSE" fix surfaced material failure modes: VAD-noise cost explosion, context-window bloat from unbounded state snapshots, race conditions between speculative and final guidance, SSE fragility on Vercel/Cloudflare, and loss of the synchronous barrier that guarantees the agent waits for guidance. The approach below is the hardened version that survives those attacks.

## Objective

Voice context delivery becomes **reliable, bounded, and observable**: every user utterance causes a fresh guidance compute that pushes to the agent before it generates, with a preserved synchronous fallback when push loses the race. Returning visitors are recognized. Guidance is validated before it reaches the fast LLM. Backend state changes reach the live call within 2 seconds.

## Non-Goals

- **Removing `get_context`** — it stays as the sync fallback and observability probe. Push is the fast path; pull is the safety net.
- **SSE / WebSocket push from server** — polling with ETag is the mechanism. Long-lived streams are deferred until we have infrastructure to support them reliably behind Vercel/Cloudflare.
- **Switching to ElevenLabs `custom_llm` mode** — that is the architectural answer for voice-brain parity but is a separate spike (Brief 170 if pursued). This brief is the maximal improvement within the current hybrid architecture.
- **Raw `onVadScore` speech-start compute** — rejected during stress test as too speculative. We fire on `onModeChange: listening→processing` (ElevenLabs' own commit point) instead.
- **Changing the ElevenLabs voice, model, or agent-creation flow** — `ensureAgent()` is preserved.
- **New persona personalities, prompts beyond the rules change** — voice persona copy is unchanged.

## Inputs

1. `packages/web/app/welcome/voice-call.tsx` — SDK wiring, current push/throttle logic
2. `packages/web/app/welcome/ditto-conversation.tsx` — safety-net polling (lines 343-368)
3. `packages/web/app/api/v1/voice/guidance/route.ts` — guidance endpoint with 6s timeout
4. `packages/web/app/api/v1/voice/transcript/route.ts` — transcript persistence
5. `src/engine/network-chat.ts` — `evaluateVoiceCore` (line 671), `validateAndCleanResponse` (line 307), `assembleVisitorContext` (line 929)
6. `src/engine/elevenlabs-agent.ts` — Alex/Mira system prompts (lines 60-122), tool definitions
7. `packages/web/node_modules/@elevenlabs/react/dist/conversation/ConversationControls.d.ts` — SDK surface for `sendContextualUpdate`, `sendUserMessage`, `sendUserActivity`
8. `packages/web/node_modules/@elevenlabs/react/dist/conversation/types.d.ts` — available event callbacks (`onVadScore`, `onModeChange`, `onAgentChatResponsePart`, etc.)
9. `docs/insights/178-voice-as-transport-harness-as-brain.md` — architectural principle
10. `docs/briefs/complete/150-voice-harness-tightening.md` — prior context

## Constraints

- **Do not remove `get_context`.** Keeping the synchronous fallback is load-bearing. Removing it removes our only way to guarantee the agent ever sees guidance on a pushed-update-miss.
- **Total cost per minute of voice call MUST NOT exceed 1.5× current.** Measured against a 4-turn/min baseline (see Smoke Test). Enforced via server-side dedup, not client throttling.
- **ElevenLabs tool timeout stays 10s** — the `get_context` path must still finish in <8s to leave headroom; guidance endpoint timeout stays at 6s.
- **Context-push history must stay bounded** — the agent must not accumulate more than ~8 `SYSTEM INSTRUCTION` / `STATE SNAPSHOT` blocks in live conversation history. Later pushes supersede earlier ones via a prompted "latest wins" rule AND by reusing a single conversation slot where possible (see Non-Goals — we are not yet solving permanent history hygiene; we are bounding it).
- **Voice evaluation must preserve read/write separation from Brief 150** — `evaluateVoiceCore(..., persistLearned=true)` only from the webhook/guidance fetch path; the polling SSE-alternative must not write.
- **`assembleVisitorContext` already exists and is expensive** — reuse cache or debounce; do not call it on every 2s poll tick.
- **Backwards compatibility with existing agent config** — the prompt change to "follow latest SYSTEM INSTRUCTION" must not break calls placed against the already-deployed ElevenLabs agent config. Use `ensureAgent()` sync.
- **No reliance on unverified `sendUserActivity` semantics** — before using it to hold the agent's turn, we must empirically verify what it does. If behaviour is ambiguous, do not ship the patience-pinger; ship the other improvements.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `sendContextualUpdate` as primary push channel | `@elevenlabs/react` SDK | depend | Documented SDK API already wired at voice-call.tsx:197 |
| Event hooks `onModeChange` / `onVadScore` | `@elevenlabs/react` SDK `types.d.ts:5` | depend | First-class SDK events |
| Server-side request dedup by transcript hash | Stripe idempotency-key pattern | pattern | Proven pattern for at-most-once request processing |
| ETag-based polling | HTTP ETag RFC 7232 | depend | Standard HTTP semantics, natively supported by `fetch` |
| Response validation for voice | Existing `validateAndCleanResponse` at `network-chat.ts:307` | pattern | Text-chat quality pass, already written — apply to voice path |
| Visitor context in voice eval | Existing `assembleVisitorContext` at `network-chat.ts:929` | pattern | Text-chat context assembly, applied to voice path |
| "Latest-wins" instruction supersession | Anthropic prompt-ordering guidance | pattern | Documented LLM behaviour; we reinforce with explicit rule in agent prompt |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/welcome/voice-call.tsx` | Modify: remove 4s client throttle (rely on `AbortController` + server dedup); add `onModeChange` handler to push after agent turn ends; conditionally add `sendUserActivity` heartbeat during in-flight guidance (feature-flagged); add push-event telemetry logging. |
| `packages/web/app/welcome/ditto-conversation.tsx` | Modify: shorten safety-net poll interval from 10s to 2s; add ETag/version check so unchanged guidance does not re-push; guard against pushing before call is `connected`. |
| `packages/web/app/api/v1/voice/guidance/route.ts` | Rewrite: add server-side transcript-hash dedup cache (in-memory, 5s TTL); call `validateAndCleanResponse` on evaluation output; attach `etag` header derived from `(sessionId, learned, last-turn-index)`; return `304 Not Modified` when ETag matches. |
| `packages/web/app/api/v1/voice/transcript/route.ts` | Modify: on successful transcript save, invalidate the guidance dedup cache for that session (so next guidance call recomputes). |
| `src/engine/network-chat.ts` | Modify: thread `visitorContext` (from `assembleVisitorContext`) into `evaluateVoiceCore` so returning visitors are recognized. Cache visitor context per session for 60s to avoid re-loading on every 2s poll. |
| `src/engine/elevenlabs-agent.ts` | Modify: update Alex and Mira prompts to state "SYSTEM INSTRUCTION messages arrive via contextual updates during the call; always follow the most recent one, superseding earlier ones. If a new user message arrives and no SYSTEM INSTRUCTION has landed yet, call get_context." Bump `ensureAgent()` config version so updates propagate. |
| `packages/web/app/api/v1/voice/telemetry/route.ts` | Create: endpoint accepting `{sessionId, event, metadata}` for push/pull observability (push_fired, push_deduped, push_304, get_context_called, get_context_cache_hit, validate_rewrote, assemble_visitor_cached). Writes to `voice_events` table. |
| `packages/core/src/db/schema/voice-events.ts` | Create: schema for voice telemetry events. Columns: `id`, `sessionId`, `event`, `metadata` (JSONB), `createdAt`. Index on `(sessionId, createdAt)`. |
| `drizzle/meta/_journal.json` + `drizzle/0NNN_*.sql` | Create: migration for `voice_events` table (follow Insight-190 resequencing rules on merge conflict). |
| `src/engine/voice-dedup.ts` | Create: in-memory LRU cache keyed by `(sessionId, transcriptHash)` with TTL and stat counters. |
| `src/engine/voice-context.test.ts` | Create: unit tests for guidance dedup, ETag generation, visitor-context caching, validate-cleaning on voice path, dedup invalidation on transcript flush. |
| `src/engine/voice-push.e2e.test.ts` | Create: integration test that simulates an ElevenLabs-style conversation (fake `sendContextualUpdate` sink + event emitter) and verifies push timing, dedup, and supersession. |
| `packages/web/app/welcome/voice-call.test.tsx` | Create: React Testing Library tests for `voice-call` event wiring — verifies that `onModeChange` triggers push, that cancelled guidance requests do not land, that telemetry is emitted. |
| `scripts/voice-load-test.ts` | Create: load-test harness that simulates N concurrent voice sessions firing guidance requests at realistic cadences; measures p50/p95 latency, cost per minute, cache hit rate, 304 rate. |
| `docs/landscape.md` | Modify: add note on `sendContextualUpdate` / `sendUserActivity` semantics (confirmed vs unverified) with findings from the SDK behaviour probe. |

## User Experience

- **Jobs affected:** Orient (voice agent recognizes returning visitors, responds to backend state in near-real-time), Delegate (voice guidance is higher quality — no duplicate questions, no filler, one-question rule enforced)
- **Primitives involved:** None — no new UI primitives. Visible in-call behaviour change only.
- **Process-owner perspective:** Voice calls feel noticeably smarter — Alex/Mira remember you, don't ask questions they already know answers to, don't open with filler, and respond to context updates the user makes via chat-during-call within ~2 seconds instead of ~10.
- **Interaction states:** N/A — no new UI states. During in-flight guidance a caller may notice a brief additional pause if `sendUserActivity` heartbeat is enabled (capped at 3s).
- **Designer input:** Not invoked — backend quality improvement. If heartbeat pause is user-visible, Designer review required before enabling that specific feature flag.

## Acceptance Criteria

**Push reliability**
1. [ ] Client 4s throttle at `voice-call.tsx:180` is removed; `AbortController`-based latest-wins still in place.
2. [ ] Push fires on `onModeChange` transition `speaking → listening` (agent turn ended) — verified by telemetry event `push_fired` with metadata `{trigger: "agent_turn_end"}`.
3. [ ] Push still fires on user-final transcript — telemetry event `push_fired` with metadata `{trigger: "user_final"}`.
4. [ ] Safety-net poll interval is 2000ms (from 10000ms); poll does not push when ETag is unchanged — verified by telemetry `push_304` count >> `push_fired` count from poll source.
5. [ ] `get_context` still returns cached guidance from `pendingGuidanceRef` on fast path (<50ms measured).
6. [ ] `get_context` returns fresh guidance on slow path within 6s; falls back to rule-based after 6s (behaviour preserved from Brief 150).

**Quality parity with text chat**
7. [ ] `evaluateVoiceCore` receives a `visitorContext` from `assembleVisitorContext` when a known email is present on the session.
8. [ ] Visitor context is cached per session for 60s (verified by telemetry `assemble_visitor_cached` hit count ≥1 per 30s of call).
9. [ ] Voice guidance passes through `validateAndCleanResponse` before being returned to the client; telemetry records `validate_rewrote` when the validator modified the reply.
10. [ ] Guidance returned to voice never contains a sycophantic opener (test case: "That's a great question!" → must be stripped).
11. [ ] Guidance returned to voice ends in exactly one question (test case: 2+ questions in raw LLM output → validator keeps only the primary).

**Dedup & cost control**
12. [ ] Server-side dedup cache in `voice-dedup.ts` returns the cached guidance when `(sessionId, transcriptHash)` matches within 5s.
13. [ ] Dedup cache is invalidated when `/voice/transcript` receives new turns for that session.
14. [ ] Under the load-test scenario (10 concurrent sessions, 4 turns/min each, 3 min duration), total Claude API calls to the guidance endpoint are within 1.5× the current baseline measured pre-change.
15. [ ] `304 Not Modified` is returned for polling requests when ETag matches; polling client honours 304 and does NOT emit `sendContextualUpdate`.

**Agent prompt hardening**
16. [ ] Alex and Mira system prompts include the "follow most-recent SYSTEM INSTRUCTION" rule.
17. [ ] Alex and Mira system prompts retain the "if no SYSTEM INSTRUCTION has arrived, call `get_context`" fallback (not removed).
18. [ ] `ensureAgent()` config version is bumped so a running deployment picks up the prompt change on next boot.

**Observability**
19. [ ] `voice_events` table is created and receives events from both client (`/voice/telemetry`) and server (direct insert from guidance route).
20. [ ] For a completed call, the event stream contains (at minimum): 1× `session_start`, N× `push_fired`, optional `push_deduped`, `validate_rewrote`, `get_context_called` with `cache_hit` or `cache_miss`.
21. [ ] Observability dashboard query (documented in `scripts/voice-analytics.sql`) reports push-vs-pull ratio, dedup rate, 304 rate, validator rewrite rate per session.

**`sendUserActivity` handling**
22. [ ] Behaviour probe (`scripts/voice-sdk-probe.ts`) is run and result is documented in `docs/landscape.md` under ElevenLabs SDK entry.
23. [ ] If probe confirms `sendUserActivity` defers agent turn: heartbeat feature is enabled behind `VOICE_PATIENCE_HEARTBEAT_ENABLED` env flag, default off; ticks every 250ms; auto-stops after 3s; never stacks with another heartbeat.
24. [ ] If probe does not confirm turn-deferral: heartbeat code is not shipped. This AC passes either way — what matters is that we don't ship unverified behaviour.

**Regression protection**
25. [ ] `pnpm run type-check` passes at repo root.
26. [ ] `pnpm vitest run src/engine/voice-context.test.ts` passes.
27. [ ] `pnpm vitest run src/engine/voice-push.e2e.test.ts` passes.
28. [ ] `pnpm vitest run src/engine/channel-voice.test.ts` (existing) still passes unmodified.
29. [ ] `pnpm vitest run packages/web/app/welcome/voice-call.test.tsx` passes.
30. [ ] Drizzle migration applies cleanly on a fresh DB: `pnpm db:migrate` produces no errors.

## Testing Strategy

Testing is scoped across five layers — each answers a different question. A criterion is not "done" until the test exists and passes in CI.

### Layer 1 — Unit tests (`src/engine/voice-context.test.ts`)

Isolated, fast, no network. Covers:

- `hashTranscript({sessionId, lastN})` produces stable output for identical input and differs when any turn changes.
- `voiceDedup.get(key)` returns undefined for cache miss, cached value within TTL, and undefined after TTL expiry.
- `voiceDedup.invalidate(sessionId)` removes all keys for a given session.
- `buildGuidanceETag({sessionId, learned, lastTurnIndex})` produces deterministic output; differs when any component changes.
- `validateAndCleanResponse` applied to synthetic voice-flavoured responses: sycophantic openers stripped, multi-question responses reduced to primary, filler pruned. (Reuses existing `network-chat` validator — we are asserting it handles voice inputs correctly.)
- `assembleVisitorContextCached(email)` hits the underlying loader once within the 60s window and again after expiry.

Target: 12+ assertions, <1s total runtime. Uses `vi.useFakeTimers()` for TTL cases.

### Layer 2 — Integration tests (`src/engine/voice-push.e2e.test.ts`)

Runs the full guidance pipeline against an in-process fake ElevenLabs session. Uses a real SQLite database (per `drizzle.config.ts`) seeded with a session. Mocks the LLM via `llm.isMockLlmMode()`.

Scenarios covered:
1. **Push on user-final lands before agent generates.** Simulate: user speaks → transcript flushed → guidance requested → `sendContextualUpdate` spy fires with `SYSTEM INSTRUCTION: ...`.
2. **Push on agent-turn-end triggers fresh compute.** Simulate `onModeChange: speaking→listening` → verify guidance endpoint hit and push emitted.
3. **Dedup prevents duplicate compute.** Two user-finals with identical transcript hash within 5s → only one LLM call.
4. **Dedup is invalidated on transcript change.** Transcript flush with new turn → next guidance request recomputes.
5. **304 on unchanged ETag from polling path.** Poll fires twice without any state change → second response is 304 → no `sendContextualUpdate` emitted.
6. **Validator rewrites multi-question guidance.** LLM mock returns "What's your business? And who are you trying to reach?" → guidance endpoint returns only one question.
7. **Visitor context is attached when email is known.** Session has `authenticatedEmail` → `evaluateVoiceCore` receives populated `visitorContext`.
8. **Visitor context cache hit within 60s window.** Two guidance calls within 30s → `assembleVisitorContext` invoked once.
9. **Fallback still works on timeout.** LLM mock sleeps >6s → rule-based fallback returned.
10. **`get_context` sync path still works when push has not landed.** `pendingGuidanceRef` empty → `get_context` hits endpoint and returns.

Target: 10 scenarios, <30s total runtime. Each uses isolated DB state via transaction rollback.

### Layer 3 — Client behaviour tests (`packages/web/app/welcome/voice-call.test.tsx`)

React Testing Library + `@testing-library/user-event`. Mocks `@elevenlabs/react` `useConversation`.

Scenarios covered:
1. `onModeChange: speaking→listening` handler invokes the guidance fetcher.
2. `onMessage` with `source: "user"` triggers push within 100ms (no throttle delay).
3. Back-to-back user messages result in one in-flight compute (AbortController cancels prior).
4. Telemetry endpoint is called with each `push_fired`, `push_deduped`, `get_context_called` event.
5. `sendContextualUpdate` is NOT called when guidance fetch returns 304.
6. Polling stops when `callState === "ended"`.
7. Heartbeat (when flag enabled) starts on guidance in-flight, stops within 3s, does not stack.

Target: 7 scenarios, <5s runtime. No real ElevenLabs session is started.

### Layer 4 — SDK behaviour probe (`scripts/voice-sdk-probe.ts`)

**Empirical verification of unverified SDK semantics.** Must be run by the builder before shipping the `sendUserActivity` heartbeat.

Probe script:
1. Starts a real ElevenLabs call against a dev agent.
2. Sends a user message via mic simulation.
3. Before the agent would normally respond, calls `sendUserActivity()` repeatedly at 250ms intervals for 2s.
4. Measures: did the agent's first response arrive earlier, later, or unchanged vs a baseline call where no activity was sent?

Result recorded in `docs/landscape.md` ElevenLabs entry. Probe output must explicitly state one of: `CONFIRMED_DEFERS_TURN`, `DOES_NOT_DEFER_TURN`, `AMBIGUOUS`. Only `CONFIRMED_DEFERS_TURN` unlocks the heartbeat feature code path.

This is instead of guessing at SDK behaviour from the method name — a failure mode flagged in the stress test.

### Layer 5 — Load + cost test (`scripts/voice-load-test.ts`)

**Proves we did not explode cost when removing the client throttle.**

Configuration:
- 10 concurrent simulated sessions (no real ElevenLabs — hits our endpoints directly).
- Each session emits: 1× session_start, 4 user-turns/min × 3 min = 12 turns.
- Each user-turn produces: 1× transcript flush, 1× guidance request, 1× poll tick at 2s intervals.
- Measures: total Claude calls, p50/p95 guidance latency, cache hit rate, 304 rate.

Pass criteria:
- Total Claude calls ≤ 1.5× the pre-change baseline measurement (captured before this brief ships by running the same load test against current code).
- Dedup cache hit rate ≥ 30% (indicates server-side dedup is doing work).
- 304 rate ≥ 50% of polling requests (indicates ETag pathway is working).
- p95 guidance latency < 4s (under load).

Baseline measurement procedure is documented in the script header.

### Layer 6 — Manual E2E smoke (see Smoke Test section)

A human places a real call and verifies the feel of it — the ultimate test of "does it feel smarter." Automated tests cannot measure this.

## Review Process

1. Spawn review agent with `docs/architecture.md`, `docs/review-checklist.md`, and `docs/insights/178-voice-as-transport-harness-as-brain.md` as context.
2. Review agent checks:
   - Push-pull hybrid preserves sync barrier (`get_context` still functional, not accidentally removed)
   - Dedup is server-side; client throttle is removed — no silent drops remain
   - Visitor context loading is cached (no N+1-style repeated loads under polling)
   - `validateAndCleanResponse` is invoked before guidance reaches client (matches text-chat quality gate)
   - Agent prompt change does not break the `get_context` fallback contract
   - `sendUserActivity` heartbeat is gated on empirical SDK probe result
   - Migration follows Insight-190 journal-resequencing hygiene
   - `voice_events` telemetry schema does not log PII in the metadata column
3. Present work + review findings + load-test report to human for approval.

## Smoke Test

```bash
# 1. Pre-flight
pnpm run type-check
pnpm db:migrate

# 2. Unit + integration
pnpm vitest run src/engine/voice-context.test.ts
pnpm vitest run src/engine/voice-push.e2e.test.ts
pnpm vitest run src/engine/channel-voice.test.ts
pnpm vitest run packages/web/app/welcome/voice-call.test.tsx

# 3. SDK probe (only required if shipping heartbeat feature)
pnpm tsx scripts/voice-sdk-probe.ts
# Expected output: one of CONFIRMED_DEFERS_TURN / DOES_NOT_DEFER_TURN / AMBIGUOUS
# Result must be copied into docs/landscape.md

# 4. Load test — BEFORE the change (baseline), then AFTER the change
# Run once on main to capture baseline:
pnpm tsx scripts/voice-load-test.ts --output=.context/baseline-voice.json
# Run on this branch:
pnpm tsx scripts/voice-load-test.ts --output=.context/branch-voice.json
pnpm tsx scripts/voice-load-test.ts --compare .context/baseline-voice.json .context/branch-voice.json
# Must report: claude_calls_ratio <= 1.5, dedup_hit_rate >= 0.30, p95_latency_ms < 4000

# 5. Manual E2E
# a. pnpm dev
# b. Open welcome page as a KNOWN (returning) visitor — the session must have authenticatedEmail
# c. Start a voice call — verify Alex greets by name and references prior context (visitor-context wiring)
# d. Speak 4-5 turns; mid-call, type a message in the chat ("I'm actually targeting B2B, not consumer")
#    → within 2-3 seconds, the voice agent should acknowledge the clarification (polling + push working)
# e. Ask a compound question ("What do you do, and who are you for?")
#    → check that the agent asks ONE question back, not two (validator working)
# f. End the call
# g. Open DB — voice_events table should contain push_fired, push_deduped, validate_rewrote, get_context_called rows for this session
# h. Query: SELECT event, count(*) FROM voice_events WHERE sessionId = ? GROUP BY event
#    → push_fired > get_context_called (push is the fast path, pull is the fallback)

# 6. Negative smoke — verify fallbacks still work
# i. Start another call with LLM_EVAL_ARTIFICIAL_DELAY_MS=8000 set → guidance endpoint should time out and return rule-based fallback; call must still function
# j. Start another call with NO network between transcript flush and guidance fetch (simulate via DevTools offline toggle on the specific request) → get_context fallback must engage
```

## Rollout

- Ship behind a per-environment flag `VOICE_PUSH_HARDENING_ENABLED`. Default: off in production, on in staging for 48h.
- Observability dashboard must show push_fired volume, dedup rate, 304 rate, validator rewrite rate for 48h before flag flips to production-on.
- `VOICE_PATIENCE_HEARTBEAT_ENABLED` stays off until SDK probe returns `CONFIRMED_DEFERS_TURN`. Separate flag flip.
- Rollback: flag off returns to current behaviour — guidance endpoint still works, agent prompt falls back to `get_context` (which still exists).

## Reference Docs

- `docs/insights/178-voice-as-transport-harness-as-brain.md` — unchanged; this brief deepens it.
- `docs/briefs/complete/150-voice-harness-tightening.md` — prior baseline, do not modify.
- `docs/landscape.md` — updated with SDK probe findings and `sendContextualUpdate`/`sendUserActivity` behaviour notes.
- Potential ADR: if this brief produces new precedent around "push-pull hybrid for real-time agents with unreliable clients," capture in `docs/adrs/` after completion.

## After Completion

1. Update `docs/state.md` with what changed, quoting load-test results.
2. Update `docs/roadmap.md` — mark voice quality parity item as complete if applicable.
3. Move this brief to `docs/briefs/complete/180-voice-context-push-hardening.md`.
4. If `custom_llm` mode was surfaced as the better architecture, open Brief 170 for that spike.
5. Phase retrospective: was push-pull hybrid the right call, or is `custom_llm` + full harness brain the cleaner path?
