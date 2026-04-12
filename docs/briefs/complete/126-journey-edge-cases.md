# Brief: Journey Edge Cases — Dead Ends, Missing Events, and Robustness

**Date:** 2026-04-11
**Status:** draft
**Depends on:** Brief 121 (process primitives), Brief 125 (cancellation)
**Unlocks:** None — hardening, not new capabilities

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Robustness of the front-door → ongoing relationship lifecycle

## Context

A full user journey stress test against the built architecture (Briefs 120-125) identified 27 edge cases. Four are P0 (will break or lose users), seven are P1 (bad UX). This brief closes all P0s and the highest-impact P1s. Every fix extracts a reusable pattern.

### P0 Issues (will break)

1. **ACTIVATE fails when search fails** — ACTIVATE instructs Alex to search immediately after email capture. If the search returns nothing (Perplexity down, niche too narrow), the LLM says "let me search" but the enrichment loop returns no results. Alex never sets `done`. The user sees a frozen "searching" message. No action email, no process starts. User in limbo.

2. **Reply to intro email doesn't resume process** — The intro email (`sendIntroEmail`) is sent at EMAIL_CAPTURED (before ACTIVATE). The action email (`sendActionEmail`) starts the `user-onboarding` email thread and has `wait_for: reply`. If the user replies to the intro email (separate thread), `findWaitingRunForPerson` finds the waiting step — but the reply content isn't associated with the right thread. More critically: the intro email is sent by `startIntake()` and has no `processRunId` in its interaction metadata. Thread resolution fails.

3. **`user-reengagement` process doesn't exist** — `user-nurture-first-week.yaml` chains to `user-reengagement` when the user is silent after week 1. No template file exists. The chain executor logs an error and the silent user gets nothing. Dead end.

4. **Chain trigger events not consistently fired** — `front-door-intake.yaml` declares `trigger: positive-reply` to chain to `connecting-introduction`. But `inbound-email.ts` line 816-820 explicitly says: "Event-type chain triggers are logged but not yet active (098a AC11)." The `fireEvent("positive-reply")` call is commented out / not present. Positive prospect replies are logged and the user is notified, but the introduction process never starts.

### P1 Issues (bad UX)

5. **Action email asks for website user already shared** — If the user shared their URL in the chat and it was fetched, the `conversationSummary` contains bullet points of user messages but no structured extraction. The action email still asks "what's your website?" even though Alex already fetched it. Wastes the user's first interaction over email.

6. **Dual mode (both) = two parallel email threads** — When `detectedMode === "both"`, both `front-door-intake` AND `front-door-cos-intake` start. Each has its own `gather-details` step, each starts its own email thread, each asks for details. The user gets two separate "here's what happens next" emails on day 1.

7. **No out-of-scope handling** — If a user asks for something Alex can't do ("help me sue someone", "I need a therapist"), the prompt has no guidance. Alex tries to reframe into connector/sales/cos modes instead of gracefully declining.

## Objective

Close all P0 dead ends and the three highest-impact P1 gaps. Every fix extracts a reusable pattern.

## Non-Goals

- Email ownership validation (P1 #8 — requires email verification flow, separate brief)
- Cross-process communication (P2 #B — requires awareness layer design)
- Partial process updates ("stop targeting accountants but keep lawyers" — P2 #C)
- Multilingual support (P3 #2)
- Structured conversation data extraction (P2 #A — desirable but large scope)

## Inputs

1. `src/engine/network-chat.ts` — ACTIVATE section (lines 565-640)
2. `src/engine/network-chat-prompt.ts` — ACTIVATE stage instructions (lines 169-187)
3. `src/engine/inbound-email.ts` — Reply handling, chain event firing (full file)
4. `src/engine/scheduler.ts` — `fireEvent()` (lines 160-180)
5. `src/engine/self-tools/network-tools.ts` — `sendIntroEmail`, `sendActionEmail`
6. `processes/templates/user-nurture-first-week.yaml` — chain section referencing user-reengagement
7. `processes/templates/front-door-intake.yaml` — chain section with positive-reply trigger
8. `processes/templates/front-door-cos-intake.yaml` — parallel process for CoS mode

## Constraints

- P0 fixes must not change the happy-path user experience
- Chain event firing must use the existing `fireEvent()` in scheduler.ts — don't build a new event system
- The user-reengagement process must be minimal (one email, one chain decision) — not a drip campaign
- Dual-mode fix must not break single-mode flows
- All prompt changes must stay within existing token budgets
- Chain-spawned processes must inherit the more restrictive trust tier (per 098a AC9) — verify, don't assume
- In `handleUserEmail()`, cancellation detection must run BEFORE waiting-step resume detection. A "cancel" reply should cancel, not resume.
- The dual-mode action email (when mode is "both") must acknowledge both capabilities: "I'll start with outreach and follow up with your first priorities briefing once that's underway."

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Fallback when search fails | Graceful degradation pattern | pattern | Standard UX: if enrichment fails, proceed without it |
| Event firing for chains | `scheduler.ts` `fireEvent()` | adopt | Already built, just needs to be called |
| Reengagement cadence | HubSpot re-engagement workflow | pattern | Single touch + decision, not a drip |
| Dual-mode coordination | Original | pattern | No precedent — coordinated intake is Ditto-specific |
| Out-of-scope deflection | ChatGPT system prompt boundary | pattern | Standard LLM boundary-setting |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/network-chat-prompt.ts` | Modify: (1) ACTIVATE step 1 fallback — if search returns nothing, skip to step 3 (close with forward motion, set done). "I'll dig into this over email and get back to you with targets." (2) Add out-of-scope handling to Rules: "If the request is outside what you do (legal advice, therapy, technical support), say so warmly and explain what you ARE good at." (3) ACTIVATE instructions for CoS mode already skip search — verify connector/sales has a no-results fallback |
| `src/engine/network-chat.ts` | Modify: in ACTIVATE section, if enrichment loop completes with no search results AND `done` is still false, force `done = true`. This prevents the limbo state. Log a warning. The action email and process still start — Alex just doesn't show targets in the chat. |
| `src/engine/inbound-email.ts` | Modify: (1) In the contact reply section (line ~816), add `fireEvent("positive-reply", { personId, userId, ... })` call when classification is "positive". This activates the chain trigger for `connecting-introduction`. (2) In `handleUserEmail`, when a user reply resumes a waiting step, inject the thread context so the process knows which thread the reply came from. |
| `src/engine/self-tools/network-tools.ts` | Modify: `sendIntroEmail()` — include thread hint in metadata so replies to the intro email can be associated with the user's session. Add `metadata: { sessionId, chatContext: true }` to the interaction recorded by `sendAndRecord()`. |
| `processes/templates/user-reengagement.yaml` | Create: Minimal re-engagement process. One email: "Hey — I put together some research for you last week but haven't heard back. Still interested? If so, just reply and I'll pick up where I left off. If not, no worries at all." Wait 5 days. If reply → resume. If silent → end gracefully, move user to passive status. |
| `src/engine/network-chat.ts` | Modify: ACTIVATE section for `detectedMode === "both"` — instead of starting two separate processes with two separate action emails, start `front-door-intake` as primary (it handles outreach). Chain `front-door-cos-intake` from front-door-intake's report-back step (not in parallel). The CoS intake starts AFTER outreach is underway, using the same email thread. One thread, not two. |
| `processes/templates/front-door-intake.yaml` | Modify: add chain entry for `detectedMode === "both"`: after report-back, if original detectedMode was "both", chain to `front-door-cos-intake` with the same email thread. |
| `src/engine/network-chat-prompt.ts` | Modify: in ACTIVATE, add handling for when user already shared their website URL — if the conversation summary mentions a URL that was fetched, tell Alex: "The user already shared their website — don't ask for it again in the action email. Reference what you learned from it." |

## User Experience

- **Jobs affected:** Orient (no more limbo states), Capture (intro email replies work), Decide (out-of-scope gives clear alternatives)
- **Primitives involved:** Conversation (front door edge cases), Email (thread coordination)
- **Process-owner perspective:** The front door never dead-ends. If search fails, Alex still moves forward. If the user replies to the wrong email, it still works. If they signed up for both modes, they get one coordinated thread, not two. If they go silent, Alex tries once more then gives space.
- **Designer input:** Not invoked — backend/prompt robustness

## Acceptance Criteria

### P0: ACTIVATE failure (search returns nothing)
1. [ ] When ACTIVATE search returns no results, Alex sets `done = true` and closes with "I'll dig into this over email" instead of freezing
2. [ ] When ACTIVATE search returns no results, the action email and process still start normally
3. [ ] When enrichment loop completes with zero results and `done` is still false, the backend forces `done = true` and logs a warning

### P0: Intro email reply doesn't resume process
4. [ ] `sendIntroEmail()` records `sessionId` in interaction metadata so replies can be traced
5. [ ] A user replying to the intro email (when a `wait_for: reply` step exists) resumes the waiting step

### P0: user-reengagement doesn't exist
6. [ ] `processes/templates/user-reengagement.yaml` exists with: one email, 5-day wait, resume on reply, end on silence
7. [ ] Silent users after week 1 receive one re-engagement email (not a drip)
8. [ ] Users who don't reply to re-engagement are marked with `networkUsers.status = "passive"` (existing field) — no further automated outreach, but person record preserved for if they return

### P0: Chain events not fired
9. [ ] When a prospect reply is classified as "positive", `fireEvent("positive-reply", ...)` is called
10. [ ] The `connecting-introduction` process triggers when a positive-reply event fires (via chain in front-door-intake)

### P1: Action email asks for already-shared website
11. [ ] ACTIVATE prompt instructs Alex: if user already shared a URL that was fetched, don't ask for it again in the action email

### P1: Dual mode = two threads
12. [ ] When `detectedMode === "both"`, only `front-door-intake` starts at ACTIVATE (not both processes)
13. [ ] `front-door-cos-intake` chains from `front-door-intake` report-back step when mode is "both"
14. [ ] The user receives ONE email thread for both modes, not two

### P1: No out-of-scope handling
15. [ ] Alex's rules include guidance for out-of-scope requests: decline warmly, explain what Alex IS good at

### Reviewer-requested robustness ACs
16. [ ] Forced-done events are recorded as activities (not just console.log) for L5 learning layer tracking
17. [ ] CoS mode ACTIVATE path has a no-results fallback (not just connector/sales) — verified no search is attempted for CoS
18. [ ] `sessionId` in interaction metadata is stored only in the DB record — never exposed in email headers or body
19. [ ] If primary process (`front-door-intake`) is cancelled when mode is "both", user is notified that CoS intake did not start and can be restarted separately
20. [ ] Chain-spawned `connecting-introduction` from positive-reply event inherits the more restrictive trust tier per 098a AC9
21. [ ] Cancellation classification runs BEFORE waiting-step resume in `handleUserEmail()` — a "cancel" reply to the intro email triggers cancellation, not step resumption
22. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Layer alignment, trust model (chain events don't bypass trust), feedback capture (forced-done logged), security (thread metadata doesn't leak sensitive data)
3. Present work + review to human

## Smoke Test

```bash
# Type check
pnpm run type-check

# Existing tests pass
pnpm vitest run src/engine/network-chat.test.ts
pnpm vitest run src/engine/process-loader.test.ts

# Manual: simulate ACTIVATE with search returning empty results
# Verify: done is forced true, action email still sent, no limbo

# Manual: simulate positive prospect reply
# Verify: fireEvent called, connecting-introduction process created

# Manual: verify user-reengagement.yaml loads without errors
# pnpm ditto sync — no validation errors
```

## After Completion

1. Update `docs/state.md`: "Journey edge cases: P0 dead ends closed (ACTIVATE fallback, intro email threading, user-reengagement, chain event firing), P1 improvements (dual-mode coordination, out-of-scope handling, website dedup)"
2. Update Insight 171 with chain event firing learnings
3. Retrospective: which edge case was most common in testing? Any new ones discovered?
