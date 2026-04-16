# Brief 146: Inbound Email Intelligence

**Date:** 2026-04-14
**Status:** complete
**Depends on:** none
**Unlocks:** MP-6.5 (question fast-path — depends on expanded classification + thread context)

## Goal

- **Roadmap phase:** Meta-Process Robustness (sub-roadmap MP-6)
- **Capabilities:** MP-6.1 (reply classification expansion), MP-6.2 (thread context injection), MP-6.3 (OOO detection)

## Context

Inbound email classification is currently 3-category: `"opt_out" | "positive" | "general"` (see `classifyReply()` at `inbound-email.ts:137-171`). Everything that isn't opt-out or positive becomes `"general"` — recorded with `outcome: "neutral"`. This means:

- **"What's your pricing?"** → classified as `general`, recorded as `neutral`, no response sent. The contact asked a direct question and got silence.
- **"Maybe next month"** → classified as `general`, recorded as `neutral`. The follow-up sequence doesn't know to adjust timing — it either sends the next touch or times out.
- **An out-of-office auto-reply** → classified as `general`, recorded as `neutral`. Counts as engagement. May prevent the no-reply-timeout follow-up from firing, creating a dead end where the person never actually saw the email but the system thinks they responded.

The interaction outcome schema (`src/db/schema/network.ts:53`) is a typed enum: `["positive", "neutral", "negative", "no_response"]`. New outcome values require a schema update.

Downstream systems that consume outcomes:
- **`people.ts:216-225`**: Auto-upgrades trust from "cold" to "familiar" on `outcome === "positive"`. A "question" reply should NOT trigger this — the person asked a question, they didn't commit.
- **`status-composer.ts:169-172`**: Renders outcome as display text. Only handles `positive` and `negative` — new outcomes render as empty string.
- **`follow-up-sequences.yaml`**: Checks for "no reply received" but doesn't check the TYPE of reply. A negative reply should prevent follow-up; a deferred reply should adjust timing.

Thread context is also broken: when generating responses to positive replies, the system doesn't inject the original outreach content. `threadId` is stored in interaction metadata but never loaded back for response generation.

## Objective

Expand reply classification to 6 categories with category-appropriate routing, outcome recording, and downstream system awareness. Inject thread context into response generation so Alex maintains conversational continuity.

## Non-Goals

- LLM-based classification (keyword matching is sufficient for v1 and keeps latency near-zero)
- Question fast-path routing to Self (MP-6.5 — separate brief, depends on this)
- Changing the opt-out implementation (already works)
- Changing the positive-reply event chain (already works via Brief 126)
- Modifying follow-up sequence YAML templates (process template editing is MP-9 scope — this brief prepares the data, template changes are a follow-up)
- Modifying relationship-pulse.ts outcome queries (follow-up brief — this brief ensures the data is correctly recorded)

## Inputs

1. `src/engine/inbound-email.ts` — current classification `classifyReply()` (lines 137-171), contact reply handler (lines 808-910), positive-reply event firing (lines 873-890), thread resolution `resolveGoalFromThread()` (lines 294-346)
2. `src/db/schema/network.ts` — `interactionOutcomeValues` typed enum (line 53): `["positive", "neutral", "negative", "no_response"]`
3. `src/engine/channel.ts` — `isOptOutSignal()` (line 1491)
4. `src/engine/people.ts` — trust auto-upgrade on positive outcome (lines 216-225)
5. `src/engine/status-composer.ts` — outcome display text (lines 169-172)
6. `src/engine/inbound-email.test.ts` — existing test patterns (27 tests)
7. `src/engine/inbound-email-cancel.test.ts` — cancellation test patterns (10 tests)
8. `docs/meta-process-roadmap.md` — MP-6 section

## Constraints

- Classification must remain deterministic (keyword-based) — no LLM calls in the classification path
- Classification ordering is safety-critical: opt_out → auto_reply → positive → question → deferred → general. This ordering prevents false positives: positive is checked before question, so "Sounds great, when works?" matches positive (not question). Builder must NOT add heuristics for this — the ordering IS the solution.
- OOO detection must be conservative: false negatives (treating OOO as general) are acceptable, false positives (treating a real reply as OOO) are not
- Thread context must be scoped per user — no cross-user thread leakage
- No changes to `@ditto/core` — all changes are product layer (`src/engine/`)
- Existing test suites must continue to pass

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Multi-category email classification | Standard CRM triage patterns (HubSpot, Salesforce) | pattern | Industry standard — all CRM tools classify inbound by intent |
| OOO detection via header + keyword | RFC 3834 (Auto-Submitted header) + common OOO phrases | pattern | Industry standard for auto-reply detection |
| Thread context via interaction metadata | Existing `sendAndRecord()` metadata pattern (Brief 126) | adopt | Same codebase — outreach body already stored in `interactions.metadata` |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema/network.ts` | Modify: Extend `interactionOutcomeValues` from `["positive", "neutral", "negative", "no_response"]` to `["positive", "neutral", "negative", "no_response", "deferred", "question", "auto_reply"]` |
| `src/engine/inbound-email.ts` | Modify: Expand `classifyReply()` return type to `"opt_out" \| "positive" \| "question" \| "deferred" \| "auto_reply" \| "general"`. Add `isAutoReply(subject, body)` checking subject patterns ("Out of Office", "Automatic reply", "Auto:") and body patterns ("I am currently out", "I will be back", "limited access to email"). Add `isQuestion(text)` detecting `?` with interrogative starters. Add `isDeferral(text)` detecting temporal deferral signals |
| `src/engine/inbound-email.ts` | Modify: Contact reply handler routing — `auto_reply`: skip `recordInteraction()` entirely (do not count as engagement, do not fire events), `deferred`: record with `outcome: "deferred"`, `question`: record with `outcome: "question"` |
| `src/engine/inbound-email.ts` | Modify: Add `loadThreadContext(threadId, userId)` function — query interactions to find original outreach body from `metadata.emailBody`. Return `{ originalSubject, originalBody, priorReplies[] }` or null. Scope query to userId to prevent cross-user leakage |
| `src/engine/inbound-email.ts` | Modify: When processing positive or question replies, call `loadThreadContext()` and include result in response generation context |
| `src/engine/people.ts` | Modify: In trust auto-upgrade logic (lines 216-225), change condition from `outcome === "positive"` to explicitly handle: `positive` → upgrade to familiar, `question` → no change (engagement but not commitment), `deferred` → no change, `auto_reply` → no change |
| `src/engine/status-composer.ts` | Modify: Extend outcome display text (lines 169-172) to include: `deferred` → " — asked to revisit later", `question` → " — asked a question", `auto_reply` → " — auto-reply (OOO)" |
| `src/engine/inbound-email.test.ts` | Modify: Add tests for new classification categories |
| `src/engine/inbound-email-ooo.test.ts` | Create: Isolated OOO detection test suite with subject-line and body-pattern coverage |

## User Experience

- **Jobs affected:** Orient (briefing shows richer interaction data — "Sarah asked about pricing" vs generic "Sarah replied"), Review (question replies may surface for response)
- **Primitives involved:** None directly — changes are in email pipeline, not UI blocks. Outcomes are visible in status-composer output and briefing summaries.
- **Process-owner perspective:** Contact asks "What's your pricing?" → classified as question → interaction recorded with `outcome: "question"` → status composer shows "Sarah — asked a question" → briefing surfaces it. Contact sends OOO → silently excluded from all metrics → follow-up timing unaffected. Contact says "maybe next month" → classified as deferred → status shows "Mark — asked to revisit later" → follow-up timing can adjust (future brief).
- **Interaction states:** N/A — no UI changes. All effects are in data quality and downstream display.
- **Designer input:** Not invoked — pipeline-only changes with no visual impact.

## Acceptance Criteria

1. [ ] `interactionOutcomeValues` in `src/db/schema/network.ts` includes `"deferred"`, `"question"`, `"auto_reply"` as valid values
2. [ ] `classifyReply()` returns one of 6 categories: `opt_out`, `positive`, `question`, `deferred`, `auto_reply`, `general`
3. [ ] Classification ordering: opt_out first (safety), then auto_reply, then positive, then question, then deferred, then general (fallback). Rhetorical questions in positive replies (e.g., "Sounds great, when works?") are handled by this ordering — positive is checked before question, so no heuristic needed
4. [ ] `isAutoReply(subject, body)` detects: "Out of Office" in subject, "Automatic reply" / "Auto:" in subject, "I am currently out of the office" in body, "I will be back on" in body, "limited access to email" in body. Returns false for real replies that happen to mention being away conversationally
5. [ ] `isQuestion(text)` detects: messages containing `?` combined with interrogative words (what, how much, when, where, who, can you, do you, is there, are you, could you). Note: `isQuestion` only runs on messages that already failed the positive check (AC #3 ordering), so "Sounds interesting? Tell me more" matches positive first and never reaches `isQuestion`. Builder should test `isQuestion` within the full `classifyReply` pipeline, not in isolation
6. [ ] `isDeferral(text)` detects: "next month", "next quarter", "after [event]", "not right now", "maybe later", "circle back", "reach out again in", "not a good time"
7. [ ] Auto-reply classification: does NOT call `recordInteraction()`, does NOT fire `fireEvent("positive-reply")`, does NOT count as engagement — the reply is silently ignored
8. [ ] Deferred classification: records interaction with `outcome: "deferred"`
9. [ ] Question classification: records interaction with `outcome: "question"`
10. [ ] `people.ts` trust auto-upgrade: `positive` → cold-to-familiar upgrade (existing), `question` → no trust change, `deferred` → no trust change, `auto_reply` → no trust change
11. [ ] `status-composer.ts` renders new outcomes: `deferred` → "asked to revisit later", `question` → "asked a question", `auto_reply` → "auto-reply (OOO)"
12. [ ] `loadThreadContext(threadId, userId)` retrieves original outreach email body from interaction metadata. Returns null if no outreach found. Query scoped to userId (no cross-user leakage)
13. [ ] Thread context is included in response generation context for positive and question replies
14. [ ] All existing inbound-email tests pass (no regression in positive-reply or cancellation)
15. [ ] New tests: at least 3 auto-reply scenarios (subject-based, body-based, negative case), 3 question scenarios, 3 deferral scenarios
16. [ ] New isolated `inbound-email-ooo.test.ts` with subject-line and body-pattern coverage
17. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: classification ordering preserves opt-out safety, auto-reply path truly produces no side effects (no interaction record, no event, no trust change), positive-reply path is completely unchanged, thread context scoped to userId
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type-check (verifies InteractionOutcome union is consistent)
pnpm run type-check

# Run all inbound email tests
pnpm vitest run src/engine/inbound-email.test.ts
pnpm vitest run src/engine/inbound-email-cancel.test.ts
pnpm vitest run src/engine/inbound-email-ooo.test.ts

# Run status-composer tests
pnpm vitest run src/engine/status-composer.test.ts

# Verify outcome values
grep "interactionOutcomeValues" src/db/schema/network.ts

# Verify classification categories
grep -n "classifyReply" src/engine/inbound-email.ts | head -5
```

## After Completion

1. Update `docs/state.md` with MP-6.1, MP-6.2, MP-6.3 completion
2. Update `docs/meta-process-roadmap.md` — mark MP-6.1, MP-6.2, MP-6.3 as done
3. Note for follow-up: follow-up-sequences.yaml should gate on `outcome: "negative"` (prevent follow-up) and `outcome: "deferred"` (adjust timing). This is MP-9 process editing scope.
4. Note for follow-up: relationship-pulse.ts should distinguish outcomes when computing contact rhythm. Separate brief.
