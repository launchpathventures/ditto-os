# Brief 099: Alex's Communication Intelligence — Intent Classification, Adaptive Onboarding, Workspace Graduation

**Date:** 2026-04-07
**Status:** reviewed
**Depends on:** Brief 098b (inbound processing, status composition, pulse, `notifyUser()` routing layer). Sub-brief 099c additionally depends on Brief 089 (Network Events SSE).
**Unlocks:** Full user relationship via any channel, organic workspace migration, Alex as autonomous advisor
**Sub-brief dependencies:** 099a → 099b → 099c (strictly sequential)

## Goal

- **Roadmap phase:** Phase 12: Network Agent Execution
- **Capabilities:** Inbound message intent classification, adaptive relationship building, proactive onboarding, workspace graduation signals, channel-aware notification routing

## Context

Brief 098b gives Alex ears (inbound message processing) and a voice (status composition, completion notifications, immediate event notifications). The `notifyUser()` layer (`notify-user.ts`) routes all Alex → User communication through the right channel — today email, tomorrow voice/phone/workspace. But Alex's communication intelligence is currently rudimentary:

- User messages get a generic "Got it, I'm on it" acknowledgment
- Alex doesn't understand *what* the user is asking for
- After the action message, Alex goes quiet until work finishes
- There's no thoughtful onboarding — no sense of "this is a new relationship, I should invest in understanding this person"
- There's no signal for when the current channel stops being enough and a workspace would help
- When a workspace IS installed, notifications still route through email instead of the workspace

This brief gives Alex the intelligence to have a real relationship with users, regardless of channel.

### The Architectural Insight (Insight-162)

The conversation IS the relationship for workspace-less users. Every touchpoint matters. Alex's cognitive core (`cognitive/core.md`) gives him the judgment framework — this brief gives him the ability to apply it across any channel.

### Not a Playbook (User Direction)

The onboarding is NOT a hardcoded schedule. It's Alex thoughtfully thinking about each user: what they need next, when to reach out, what would build trust. Alex has the user model (9 dimensions), the conversation history, the process state. He reasons about the right next touchpoint, not follows a calendar.

### Channel-Agnostic Architecture (098b Foundation)

All intelligence lives ABOVE the channel layer:

```
Intelligence (channel-agnostic):          Channel adapters (delivery):
  selfConverse("inbound") ────┐           ┌── AgentMailAdapter (email)
  composeProactiveMessage() ──┤           │
  relationship-pulse.ts ──────┼→ notifyUser() ──┤── WorkspaceSSE (workspace — 099c)
  status-composer.ts ─────────┤           │
  completion-notifier.ts ─────┘           └── VoiceAdapter (phone — future)
```

When voice arrives, only a new channel adapter is needed. Zero intelligence changes.

### Two Composition Patterns (Reviewer Flag B2 — resolved)

**Conversational** (`selfConverse()`): Used when a human sent a message and Alex needs to respond. Loads session history, uses 19 Self tools, appends to conversation thread. Used for inbound messages (099a).

**Proactive** (`composeProactiveMessage()`): Used when Alex initiates communication with no human prompt. Uses `createCompletion()` directly with `getCognitiveCore()` + user model context. Does NOT create session turns — avoids polluting conversation history with synthetic "messages." Used for relationship pulse (099b).

Both use the same cognitive framework (Alex's brain). The difference is session machinery.

### Trust Context (Insight-160)

- Alex → User communications: `autonomous` (don't approve messages to yourself)
- Alex as network professional: `autonomous` (quality-gate is the safety net, Ditto admin reviews on downgrade)
- Alex on behalf of user's business: `supervised` (user's reputation at stake)
- System safety gates: `critical` (non-negotiable)

## Objective

After this brief ships, Alex understands user messages (classifying intent and routing to action), builds relationships thoughtfully with new users (adaptive check-ins, proactive suggestions, progressive depth), and recognises when a user would benefit from a workspace (suggesting it naturally). When a workspace is installed, notifications route there instead of email.

## Non-Goals

- Full conversational threads (Alex as chatbot) — responses are focused and actionable, not open-ended chat
- Multi-user workspace management — single user per workspace for now
- Automated workspace provisioning from message — suggestion only, provisioning is a separate brief
- Complex NLP/ML for intent classification — LLM-based classification is sufficient
- Voice/phone channel adapter — this brief builds the intelligence; voice adapter is a separate brief

## Inputs

1. `docs/insights/160-trust-context-not-universal.md` — Trust context determines initial tier and reviewer
2. `docs/insights/161-email-workspace-boundary.md` — Email vs workspace boundary, channel transition routing
3. `docs/insights/162-alex-email-relationship-lifecycle.md` — Relationship lifecycle design, user intent taxonomy
4. `src/engine/inbound-email.ts` — Current inbound processing with user detection (098b)
5. `src/engine/notify-user.ts` — Channel-agnostic notification routing with `resolveChannel()` branch point
6. `src/engine/self.ts` — Current Self: `selfConverse()` signature, surface types, session handling
7. `src/engine/self-context.ts` — Context assembly: `assembleSelfContext()`, `<delegation_guidance>` block
8. `src/engine/self-delegation.ts` — Self tools: `selfTools` array (19 tools)
9. `src/engine/status-composer.ts` — Status composition with silence logic
10. `src/engine/completion-notifier.ts` — Process completion notifications
11. `cognitive/core.md` — Alex's cognitive framework (judgment, house values)
12. `cognitive/self.md` — Self's consultative protocol and communication principles
13. `processes/templates/front-door-cos-intake.yaml` — Briefing-as-intake pattern (precedent)
14. `src/engine/network-events.ts` — Network SSE event emitter (Brief 089 — required for 099c only)

## Constraints

- **All intelligence must be channel-agnostic** — intent classification, relationship reasoning, and response composition must NOT reference email/voice/SMS. Channel is a delivery detail handled by `notifyUser()`. When voice arrives, only the channel adapter changes.
- **All Alex → User communication goes through `notifyUser()`** — never `sendAndRecord()` directly from intelligence modules. This is the single path that enables channel routing.
- **Conversational composition uses `selfConverse()`; proactive composition uses `createCompletion()` directly** — proactive outreach must NOT route through `selfConverse()` to avoid session pollution (Reviewer Flag B2).
- Classification must use the existing LLM infrastructure (`createCompletion` from `llm.ts`)
- Onboarding reasoning must use the user model (9 dimensions in memories) — not hardcoded rules
- Workspace suggestion must feel natural, not like an upsell gate
- All responses must respect house values (`cognitive/core.md`) and quality-gate constraints
- The onboarding is NOT a fixed-step template — it's Alex reasoning about what this user needs next

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Inbound → Self routing | Ditto Self `selfConverse()` | existing | The Self already IS the intent classifier — 19 tools handle all user intents. Route inbound messages through the same Self, don't duplicate. |
| Proactive composition | status-composer.ts `composeStatusEmail()` | existing | Direct `createCompletion()` with cognitive core — no session machinery. Proven pattern. |
| Adaptive onboarding | front-door-cos-intake briefing-as-intake | pattern | Progressive intake through deliverables, not questionnaires |
| Cognitive reasoning for touchpoints | cognitive/core.md + self.md | existing | Alex's brain already has the judgment framework |
| Channel routing | notify-user.ts `resolveChannel()` | existing | Branch point already exists, just needs workspace case |
| Workspace graduation | Insight-161 | original | Natural complexity graduation |

## What Changes (Work Products)

### Sub-brief 099a: Route Inbound Messages Through the Self

The Self (`selfConverse()`) already IS the intent classifier — 19 tools handle every user intent via LLM `tool_use`. Building a separate classifier would duplicate what the Self already does.

The insight: when the user is in the workspace, they talk to Alex via the conversation UI → `selfConverse()`. When they email Alex, the message should go through the same Self. Same brain, same tools, different surface. The Self's response becomes the reply sent via `notifyUser()`.

**Surface type cascade (Reviewer Flag A1):** Adding `"inbound"` requires changes in 6 locations:

1. `src/db/schema.ts` — add `"inbound"` to `sessionSurfaceValues` array
2. `src/db/index.ts` — add `surface` column value to `ensureSchema()` (ALTER TABLE or recreate)
3. `src/test-utils.ts` — sync test table schema
4. `src/engine/self.ts` — `selfConverse()` signature accepts `"inbound"`
5. `src/engine/self-context.ts` — `assembleSelfContext()` signature accepts `"inbound"`; `getOrCreateSession()` accepts `"inbound"`
6. `src/engine/self-context.ts` — `createNewSession()` accepts `"inbound"`

**Session handling for inbound (Reviewer Flag A4):** Inbound messages get their OWN session, separate from workspace sessions. `getOrCreateSession()` must scope by surface — an inbound message should NOT resume a `"web"` session. This prevents email content leaking into workspace conversation history and vice versa.

| File | Action |
|------|--------|
| `src/db/schema.ts` | **Modify:** Add `"inbound"` to `sessionSurfaceValues`. |
| `src/db/index.ts` + `src/test-utils.ts` | **Modify:** Sync session table schema to accept new surface value. |
| `src/engine/self.ts` | **Modify:** Accept `"inbound"` in `selfConverse()` surface union. |
| `src/engine/self-context.ts` | **Modify:** (1) Accept `"inbound"` in context assembly. (2) Scope `getOrCreateSession()` to match on surface — inbound sessions are separate from web sessions. (3) When surface is `"inbound"`, **suppress the `<delegation_guidance>` block** (workspace-mode prompt about panels, artifact mode, process builder). Replace with inbound-appropriate guidance: "This is an asynchronous message. Respond concisely and actionably. Don't reference workspace UI. Bias toward action over clarifying questions." (Reviewer Flag A2) |
| `src/engine/inbound-email.ts` | **Modify:** Replace generic "Got it" acknowledgment in `handleUserEmail()` with `selfConverse(userId, messageText, "inbound")`. Self's text response sent via `notifyUser()`. Handle `personId`-missing edge case: if `networkUser.personId` is null, create the person record first (Reviewer Flag A3). |

### Sub-brief 099b: Adaptive Onboarding + Relationship Building

**Proactive composition pattern (Reviewer Flag B2 — resolved):** The relationship pulse does NOT use `selfConverse()`. Instead, it uses `createCompletion()` directly with `getCognitiveCore()` and user model context — the same proven pattern as `composeStatusEmail()` in `status-composer.ts`. This avoids session pollution (synthetic "messages" appearing in conversation history).

| File | Action |
|------|--------|
| `src/engine/relationship-pulse.ts` | **Create:** Runs as step 4 in `pulseTick()`. For each active user, composes a context snapshot (days since signup, last contact, user model state, active processes, pending deliverables, correction history). Calls `createCompletion()` with `getCognitiveCore()` + snapshot. LLM decides: reach out (with composed message) or stay silent. If reaching out, sends via `notifyUser()`. Coordinates with status-composer: if status was sent this tick, pulse skips that user (Reviewer Flag B4). |
| `src/engine/pulse.ts` | **Modify:** Add relationship pulse as step 4 in `pulseTick()`. Pass `statusResult` to relationship pulse so it knows which users already received status updates. Extend return type: `{ delayedRunsStarted, chainsProcessed, statusSent, relationshipOutreach }`. |
| `cognitive/self.md` | **Modify:** Add onboarding relationship principles: demonstrate competence early, invite correction warmly, suggest new value naturally, deepen understanding progressively, respect silence when there's nothing substantive to offer. |

**User model completeness (Reviewer Flag B3):** The pulse checks for user model sparsity pragmatically — query self-scoped memories for the user and count distinct `type` values. 0-2 types = sparse (early relationship, bias toward outreach), 3-5 = partial (room for deeper intake), 6+ = rich (natural rhythm). Not a precise "% of 9 dimensions" — a practical density signal.

### Sub-brief 099c: Workspace Graduation + Channel Transition

**Depends on:** 099b (extends `relationship-pulse.ts`) AND Brief 089 (Network Events SSE — provides the workspace channel to emit to). If Brief 089 is not built when 099c starts, the workspace channel case in `resolveChannel()` is stubbed (returns `"email"` with a log noting workspace channel not available — same as today).

| File | Action |
|------|--------|
| `src/engine/relationship-pulse.ts` | **Extend (from 099b):** Track complexity signals from DB: concurrent active processes (query `processRuns` with status `running`/`waiting_human`), batch review count (query `processRuns` with status `waiting_review`), correction frequency (count recent `correction` type memories). "Visibility requests" detected via a `wantsVisibility` flag on `networkUsers`, set by the Self when it detects the intent (e.g., user asks "show me everything") (Reviewer Flag C4). When 2+ signals present and `workspaceSuggestedAt` is null, weave suggestion into next proactive outreach. |
| `src/engine/notify-user.ts` | **Modify:** (1) `resolveChannel()` return type → `Promise<"email" \| "workspace">`. (2) When `networkUsers.status === "workspace"`, return `"workspace"`. For now, assume workspace is always online when provisioned — online detection deferred to a future brief (Reviewer Flag C3). (3) Add `case "workspace":` to switch — emit via Network Events SSE (`emitNetworkEvent()` from `network-events.ts`). Both `resolveChannel()` return type AND switch case must land in same changeset (Reviewer Flag C2). (4) Add `urgent?: boolean` to `UserNotification` type. When `urgent: true`, ALWAYS send email regardless of channel resolution — workspace users get both (Reviewer Flag C6). |
| `src/engine/status-composer.ts` | **Modify:** (1) Query both `status === "active"` AND `status === "workspace"` users (Reviewer Flag C7). (2) For pre-workspace users with complexity signals, include workspace suggestion. (3) For workspace users, compose richer briefings (more detail, since workspace can display structured content). |
| `src/db/schema.ts` | **Modify:** (1) Add `workspaceSuggestedAt` timestamp to `networkUsers`. Once set, never cleared — suggestion is offered at most once per user lifecycle (Reviewer Flag C5). (2) Add `wantsVisibility` boolean to `networkUsers` (defaults false, set by Self on intent detection). |

## User Experience

### Self-routed inbound messages (099a)

The same Alex brain handles all surfaces. Whether the user types in the workspace conversation UI or sends an email/voice message, the Self processes it through the same 19 tools:

**User sends (email, workspace, or voice):** "Can you find me property managers in Christchurch?"

**Today (email):** "Got it. I'm on it — I'll follow up shortly."

**After 099a:** Self receives message → uses `create_work_item` + `start_pipeline` → responds: "On it — I'll research property managers in Christchurch and have a shortlist for you within 24 hours. Any specific criteria I should focus on?"

**User sends:** "What's happening with my outreach?"

**After 099a:** Self uses `get_briefing` → "Three intros went out Monday. Jane replied positively (I'm following up). Two haven't responded yet — I'll send follow-ups on Thursday."

**User sends:** "That briefing was wrong — hiring is more urgent."

**After 099a:** Self uses `update_user_model` → "Got it — hiring is the priority. Next briefing will lead with hiring progress."

**Key:** Workspace user gets this in real-time conversation. Email user gets the same response via `notifyUser()`. Voice user gets it spoken back. Same brain, same tools, different delivery. Inbound sessions are separate from workspace sessions — no cross-contamination.

### Adaptive onboarding (099b)

No fixed schedule. Alex reasons on each pulse tick (examples, not a hardcoded plan):

- Day 0: User just signed up, action message sent → no action needed
- Day 1: Research process completed, user hasn't been contacted since action message → send completion results + "Here's what I found. Anything look off?"
- Day 2: User replied with corrections → update user model, acknowledge, no proactive outreach needed (they're engaged)
- Day 4: User went quiet, user model is sparse (2 memory types) → send a deliverable that weaves in intake questions (cos-intake briefing-as-intake pattern)
- Day 7: Enough history for a meaningful briefing → send first weekly briefing
- Day 10+: User model getting richer, weekly rhythm established → natural cadence, proactive only when there's something substantive

The key: Alex DECIDES when to reach out based on user state, not a calendar. Every communication is substantive. Never "just checking in." The composition uses `createCompletion()` directly — no session pollution.

### Workspace graduation (099c)

Alex notices complexity signals accumulating:
- User has 3 active processes
- User asked "can you show me what's happening with everything?" (Self sets `wantsVisibility` flag)
- 2 batch reviews pending

Alex weaves into the next proactive outreach: "You've got quite a bit going on — 3 processes running, a couple of things waiting for your review. A workspace would let you see it all in one place and review things more easily. Want me to set one up?"

After workspace is installed, `notifyUser()` routes to the workspace UI via SSE instead of email. The user sees notifications in real-time. Urgent items (positive replies, opt-outs) go to both workspace AND email as fallback.

## Acceptance Criteria

### 099a: Route Inbound Messages Through the Self (10 AC)

1. [ ] `"inbound"` added to `sessionSurfaceValues` in schema.ts, `ensureSchema()` in db/index.ts, `createTables()` in test-utils.ts — DB migration documented
2. [ ] `selfConverse()` and `assembleSelfContext()` accept `"inbound"` surface type
3. [ ] `getOrCreateSession()` scopes session lookup by surface — inbound sessions are separate from web/cli/telegram sessions (no cross-contamination)
4. [ ] When surface is `"inbound"`, the `<delegation_guidance>` block is suppressed. Replaced with inbound-appropriate guidance: concise, actionable, no workspace UI references, bias toward action
5. [ ] `handleUserEmail()` in `inbound-email.ts` calls `selfConverse(userId, messageText, "inbound")`. Self's response sent via `notifyUser()`
6. [ ] If `networkUser.personId` is null, create the person record before calling `selfConverse()` (no crash on edge case)
7. [ ] Self's existing tools handle user intents naturally — verify `create_work_item`, `get_briefing`, `update_user_model`, `quick_capture` exist in `selfTools` array
8. [ ] Self's system prompt for inbound surface instructs: when a process is started, mention what was started and expected timeline
9. [ ] Inbound messages from unknown senders still get contact-reply handling — Self routing only for recognised network users
10. [ ] `pnpm run type-check` passes, `pnpm test` passes. Tests cover: Self routing for inbound, session surface scoping, delegation guidance suppression for inbound

### 099b: Adaptive Onboarding (10 AC)

1. [ ] `relationship-pulse.ts` created. Runs on each pulse tick as step 4 (after status composition)
2. [ ] Reasoning considers: days since signup, last contact, user model density (count of distinct memory types — sparse/partial/rich), active process count, pending deliverables, correction history
3. [ ] Proactive composition uses `createCompletion()` directly with `getCognitiveCore()` + user model — does NOT use `selfConverse()` (no session pollution)
4. [ ] Alex's proactive outreach system prompt explicitly prohibits empty check-ins — every message must have substantive content (research results, suggestions, intake questions)
5. [ ] First 7 days: higher propensity to reach out (relationship building). After 7 days: settles to natural rhythm (parameter or heuristic, not hardcoded daily schedule)
6. [ ] Proactive suggestions woven into outreach content (not separate messages)
7. [ ] User model gaps (sparse memories) drive intake questions woven into deliverables (cos-intake briefing-as-intake pattern)
8. [ ] `cognitive/self.md` updated with onboarding relationship principles
9. [ ] Coordinates with status-composer: if status was sent this pulse tick, relationship pulse skips that user (no double-notify)
10. [ ] `pulse.ts` return type extended: `{ delayedRunsStarted, chainsProcessed, statusSent, relationshipOutreach }`. `pnpm run type-check` + `pnpm test` pass

### 099c: Workspace Graduation + Channel Transition (8 AC)

1. [ ] Complexity signals computed from DB: concurrent active processes, batch review count, correction frequency. `wantsVisibility` boolean on `networkUsers` set by Self on intent detection
2. [ ] Workspace suggestion triggered when 2+ signals present AND `workspaceSuggestedAt` is null
3. [ ] Suggestion woven naturally into next proactive outreach — not a separate message
4. [ ] `workspaceSuggestedAt` set on suggestion, never cleared. One-time per user lifecycle
5. [ ] `resolveChannel()` return type → `"email" | "workspace"`. Returns `"workspace"` when `networkUsers.status === "workspace"`. Both return type change AND `case "workspace":` switch branch land in same changeset
6. [ ] `case "workspace":` emits via `emitNetworkEvent()` from Brief 089. If Brief 089 not built, stub returns email with log warning
7. [ ] `urgent?: boolean` added to `UserNotification`. When `urgent: true`, always send email regardless of resolved channel (workspace users get both)
8. [ ] `status-composer.ts` queries both `"active"` and `"workspace"` users. `pnpm run type-check` + `pnpm test` pass

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - All intelligence is channel-agnostic (no email/voice references in intent/responder/pulse)
   - All notifications go through `notifyUser()` (not `sendAndRecord()` directly)
   - Inbound → `selfConverse()` with workspace-mode prompt suppressed for inbound surface
   - Proactive → `createCompletion()` directly, NOT `selfConverse()` (no session pollution)
   - Session scoping: inbound sessions separate from web sessions
   - Relationship pulse integrates with existing pulse cycle (not a separate scheduler)
   - Onboarding reasoning uses user model memories (not hardcoded rules)
   - Workspace suggestion feels natural (not an upsell gate)
   - cognitive/self.md changes are additive (not breaking existing Self behavior)
   - Workspace channel routing gracefully stubs if Brief 089 not built
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 099a: Self-routed inbound message
curl -X POST http://localhost:3000/api/v1/network/inbound \
  -H "Content-Type: application/json" \
  -H "x-agentmail-signature: <valid-sig>" \
  -d '{"event_type":"message.received","message":{"from":"user@company.com","text":"Can you find me accountants in Wellington?","subject":"New request"}}'
# Expected: Self processes via selfConverse("inbound")
# Expected: Response composed via Self tools, sent via notifyUser()
# Expected: Inbound session created (separate from any web session)

# 099b: Adaptive relationship pulse
pnpm cli pulse trigger
# Expected: "[relationship] User X: sparse model (day 3), composing proactive outreach"
# Expected: Notification with substantive content + woven intake question
# Expected: No session turns created (uses createCompletion directly)

# 099c: Workspace graduation
pnpm cli pulse trigger
# Expected: "[relationship] User X: complexity threshold met (3 processes, 2 reviews, wants visibility)"
# Expected: Proactive outreach includes workspace suggestion

# 099c: Channel transition (after workspace provisioned)
pnpm cli pulse trigger
# Expected: "[notify] User X: channel=workspace (SSE)"
# Expected: Notification emitted via Network Events SSE
# Expected: Urgent notifications also sent via email fallback
```

## Reviewer Flags — Resolution Status

| Flag | Severity | Resolution |
|------|----------|------------|
| A1 — Surface type cascade (6 locations + DB) | CRITICAL | Documented all 6 touch-points + migration in 099a work products and AC1 |
| A2 — Workspace prompt leaks into email | CRITICAL | AC4: `<delegation_guidance>` suppressed for inbound, replaced with async guidance |
| A3 — `personId` null crash | CRITICAL | AC6: create person record if missing before `selfConverse()` |
| A4 — Session cross-surface contamination | MEDIUM | AC3: `getOrCreateSession()` scopes by surface, inbound sessions separate |
| A5 — "proactive" surface not added in 099a | MEDIUM | Resolved: 099b no longer uses `selfConverse("proactive")` — uses `createCompletion()` directly |
| B2 — Session pollution from proactive | CRITICAL | Resolved: proactive uses `createCompletion()` directly, NOT `selfConverse()` |
| B3 — User model completeness unmeasurable | MEDIUM | AC2: pragmatic density signal (count distinct memory types), not precise % |
| B4 — Double-notify on same pulse tick | MEDIUM | AC9: relationship pulse skips users who received status this tick |
| C1 — Brief 089 dependency undeclared | CRITICAL | Declared in depends-on field. AC6: graceful stub if not built |
| C2 — TypeScript exhaustive switch | MEDIUM | AC5: both return type AND switch case in same changeset |
| C3 — Workspace online detection | MEDIUM | Deferred: assumes always online when provisioned. Noted in work products |
| C4 — Visibility request detection | MEDIUM | AC1: `wantsVisibility` flag on `networkUsers`, set by Self on intent |
| C5 — `workspaceSuggestedAt` semantics | MEDIUM | AC4: set once, never cleared. One-time per lifecycle |
| C6 — No urgent flag for email fallback | MEDIUM | AC7: `urgent?: boolean` on `UserNotification` |
| C7 — Status composer excludes workspace users | MEDIUM | AC8: queries both active and workspace users |

## After Completion

1. Update `docs/state.md` — communication intelligence operational, adaptive onboarding live
2. Update `docs/insights/162-alex-email-relationship-lifecycle.md` — mark all three phases as implemented
3. Update `cognitive/self.md` — document onboarding principles added
4. Update `docs/architecture.md` — document `notifyUser()` as channel routing layer in L2, `selfConverse("inbound")` as surface-aware Self pattern
5. Retrospective: how well does the adaptive onboarding feel? Too frequent? Too sparse? Does Alex's reasoning produce the right touchpoints?
