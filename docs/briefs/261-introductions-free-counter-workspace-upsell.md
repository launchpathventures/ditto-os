# Brief 261: Introductions Primitive + Free Counter + Workspace Upsell

**Date:** 2026-05-13
**Status:** draft
**Depends on:**
- Brief 263 (complete) — `networkDb` proxy + Postgres tier; required because the introductions table lives in the network tier and crosses deployment boundaries.
- Brief 256 (complete) — `NetworkProfileCardBlock` content block + `AuthorizationRequestBlock.costLabel?: string | null` field already added to `packages/core/src/content-blocks.ts:297`. **This brief POPULATES the `costLabel` field — it does NOT add it.** Verified via grep against `packages/core/src/content-blocks.ts`.
- Brief 257 (complete) — `JobRequestCardBlock` + on-network candidate match; the client lane "Get an introduction" CTA emits an intro request that this brief now persists and counts.
- Brief 259 (designed; build pending) — `/people/[handle]` visitor lane emits AuthorizationRequestBlock with `costLabel: null`. This brief replaces that placeholder with the populated counter string AND adds the `introductions` row write at the same seam. **Brief 261 build MUST follow Brief 259 build** because 259's `forward_note_to_user` self-tool establishes the cross-deployment Network → workspace bridge that this brief reuses for intro delivery.
- Brief 248 (complete) — AuthorizationRequestBlock primitive + handler + 9-state machine + feedback recording on terminal transitions.
- Parent Brief 254 — workspace upsell verbatim copy (§"Workspace upsell — the dead-clear moment"), AC-J refusal triggers, crossover trust-gate invariant, free-then-paid intro counter design.

**Unlocks:**
- Future payments brief (post-30-day-validation per parent Deferred Items table). v1 free-only enforcement; payment Stripe brief is downstream.
- Greeter-neutral refusal scoreboard (post-100-production-intros per parent Deferred Items).

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Land the introductions primitive — the table that records every intro request the Greeter emits across all three originating contexts (workspace client lane, visitor on `/people/[handle]`, expert→client crossover). Implement the free-counter compute that populates `AuthorizationRequestBlock.costLabel` with "1st of 2 free intros" / "2nd of 2 free intros" / "Request will be reviewed" copy and gates the third intro with workflow-state-not-paywall semantics. Encode the AC-J refusal triggers (anti-persona match, low-fit signal, explicit user block, abuse-rate-limit hit) in the `emit_intro_request` self-tool with one-sentence reasons surfaced to requesters and silent honoring of anti-persona rules. Encode the parent's verbatim workspace upsell copy as a chat-emitted moment fired exactly once per user per session-lane after the first intro is queued OR the first scout completes. Honor the cross-deployment delivery contract from Insight-231: the `AuthorizationRequestBlock` body is fully self-contained when it lands in the user's workspace inbox.

## Context

This brief closes the loop. Three converging signals make it the next work after 260:

1. **The counter is the gate, not a paywall.** Parent §"Workspace upsell" + Deferred Items locks v1 as "free intros up to 2; further intros gated behind 'request will be reviewed' with no Stripe integration." The counter is a workflow-state primitive — the third intro still produces an `introductions` row in state `queued-for-review` (NOT a payment failure or rejection); the user still sees it in their inbox; only the requester's surface copy changes from "1st of 2 free intros" to "Request will be reviewed." This separation is critical: any UI that treats the third intro as "blocked" violates the parent design. Parent acceptance criterion K names the exact behavior.

2. **AC-J's four refusal triggers are load-bearing trust infrastructure.** The Greeter must be willing to refuse intros that would not be welcomed (parent §Constraint, Brief 248). Without enforced refusal, every visitor-side intro is a low-friction reputational liability for the user. The four triggers (anti-persona match / low-fit signal / explicit user block / abuse-rate-limit hit) are the user's safety surface. Each must produce a one-sentence reason routed to the requester (per parent line 638) — never quoting the anti-persona rule itself (Hard Rule #5 from Brief 259's system prompt). All four triggers must fire in BOTH `/network` client lane and `/people/[handle]` visitor lane.

3. **Cross-deployment delivery is non-trivially wrong if invented from scratch.** Parent design + Brief 259 + Insight-231 establish that the AuthorizationRequestBlock body must validate in the consuming deployment without a cross-deployment DB call. The visitor's intro originates from `ditto.partners` (Network Service deployment) and lands in `ditto-ws-{handle}.up.railway.app` (managed workspace deployment). Brief 259 is the first brief to ship the cross-deployment delivery seam (via `forward_note_to_user` and the existing Network → workspace bridge). Brief 261 reuses that same seam for intro delivery — it does NOT invent a parallel delivery path. If Brief 259's chosen seam turns out to need durability hardening (e.g. the existing bridge is in-memory and lossy under deploy), that hardening belongs to a separate insight + brief, NOT folded into 261.

The workspace upsell verbatim copy is locked in parent §"Workspace upsell — the dead-clear moment" (lines 572-583). This brief encodes the copy as a constant in `src/engine/network-chat-prompt.ts` (or a sibling `src/engine/network-upsell-copy.ts`) and emits it from the chat after the first intro queues. The "Worth it if you do this kind of hunting more than twice a year" line is the dead-clear value articulation; it is not editable by the Greeter.

## Objective

Every intro request in Ditto — from any of the three originating contexts (workspace client lane, visitor profile-as-chat, expert→client crossover) — produces a row in the `introductions` table, an `AuthorizationRequestBlock` with populated `costLabel`, lands in the target user's workspace inbox via the Network → workspace bridge with full transcript carried in the block body (no cross-deployment DB lookup needed at render time), respects the four AC-J refusal triggers in BOTH lanes, and triggers the workspace upsell exactly once per user per session-lane with the parent's verbatim copy. The counter mechanic enforces v1 free-only — first 2 free, third+ surfaces "Request will be reviewed" — with NO payment UI.

## Non-Goals

- **No payment integration.** No Stripe, no checkout, no priced upgrade path. The third intro is a workflow state ("queued-for-review"), not a paywall. Per parent Deferred Items, payment Stripe brief is downstream after 30 days of production data.
- **No `AuthorizationRequestBlock` schema changes.** The `costLabel?: string | null` field is already present on the primitive (Brief 256 added it). This brief populates it; it does not extend the type.
- **No workspace upsell elsewhere.** The verbatim copy fires exactly at the post-first-intro / post-first-scout moment. No upsell on landing page, no upsell on every chat. Parent locks the trigger.
- **No new intro-emission UI.** The existing `AuthorizationRequestBlock` renderer (Brief 248) is unchanged. Visual presentation of `costLabel` is a small renderer addition (one line of text under the draft) but the block primitive is not extended.
- **No greeter-neutral refusal scoreboard.** Parent Deferred Items — re-entry condition is post-100-production-intros.
- **No vector search / candidate ranking changes.** Brief 257 owns candidate match. This brief just persists what was offered + chosen.
- **No native LinkedIn / X autopost.** Brief 260 owns share affordance; this brief does not touch share surfaces.
- **No new content-block type.** No `IntroductionBlock` or similar — intros are `AuthorizationRequestBlock` instances; the intro table is server-side persistence + counter compute.
- **No editing of the intro draft on the requester's side after submission.** Once the requester clicks "Send it" in the AuthorizationRequestBlock, the draft is frozen. The user (target) sees the frozen draft; user can edit on their side per Brief 248's "Edit draft" affordance; that edit becomes the `executionResult.draft` per the existing handler.
- **No durable-outbox infrastructure invention.** This brief reuses Brief 259's chosen Network → workspace delivery seam. If that seam proves lossy in production (cross-deployment lossy delivery is a known risk per Insight-231), the hardening is a separate insight + brief.
- **No expansion of `wantsVisibility` semantics.** Parent line 132 locks: `wantsVisibility=false` means card exists at `/people/[handle]` for direct sharing but NOT in match results. This brief does NOT add a "block intros entirely" flag — the explicit user block list (AC-J trigger c) is a separate per-user-per-blocked-handle relation that lives outside `wantsVisibility`.

## Inputs

1. `docs/briefs/254-network-two-sided-conversational-front-door.md` — parent. **§"Workspace upsell — the dead-clear moment" (lines 572-583)**, **§"Trust-gate invariant for crossovers" (lines 159-163)**, **AC-J (line 638)**, **AC-K (line 639)**, **§"Free-then-paid intro counter" (provenance line 89)** are load-bearing.
2. `docs/briefs/248-greeter-beat-2-authorization.md` — `AuthorizationRequestBlock` primitive + 9-state machine + handler + feedback-recorder on terminal transitions.
3. `docs/briefs/259-public-profile-as-chat-and-representative-rule.md` — visitor-lane chat that emits AuthorizationRequestBlock with `costLabel: null` placeholder; cross-deployment Network → workspace bridge seam established by `forward_note_to_user`. **Critical:** this brief reuses the same delivery seam.
4. `docs/briefs/complete/256-network-expert-intake-card.md` (or current location) — `NetworkProfileCardBlock` shape + `costLabel` field already added to `AuthorizationRequestBlock`.
5. `docs/briefs/complete/257-network-client-intake-job-request.md` (or current location) — `JobRequestCardBlock` + on-network candidate panel + "Get an introduction" CTA seam.
6. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` — anti-persona table (`networkUserAntiPersona`) used by AC-J trigger (a); off-network scout completion event used by alternate workspace upsell trigger.
7. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applies to `emit_intro_request` (calls LLM for refusal-reason composition + writes DB row + emits cross-deployment block).
8. `docs/insights/190-migration-journal-concurrency.md` — applies to the new network migration entry. **Verify journal idx at build time** — Brief 259 plans idx 3 (`0003_create_network_forwarded_notes.sql`); this brief takes the next available idx (likely 4, but verify against the journal at build time per resequence-on-conflict rule).
9. `docs/insights/231-cross-deployment-auth-artifacts-validate-in-consuming-deployment.md` — the `AuthorizationRequestBlock` body must be self-contained on the workspace render path.
10. `docs/insights/232-audited-http-route-wrapper-step-run-for-guarded-tools.md` — applies to the HTTP routes that invoke `emit_intro_request`.
11. `packages/core/src/content-blocks.ts` (lines 287-306) — `AuthorizationRequestBlock` shape; `costLabel` field at line 297. **NOT TOUCHED** by this brief.
12. `packages/core/src/db/network/schema.ts` — add new `introductions` pgTable here.
13. `src/engine/network-chat-prompt.ts` — Greeter directive; both expert and client lane variants reference the new `emit_intro_request` tool.
14. `src/engine/tool-resolver.ts` — register `emit_intro_request` in `builtInTools`.
15. `src/engine/forward-note-to-user.ts` (created by Brief 259) — reference implementation for cross-deployment delivery; this brief mirrors its delivery seam exactly.
16. `packages/web/middleware.ts` — `/people` already added to `PUBLIC_MODE_PREFIXES` by Brief 259.
17. `drizzle/network/meta/_journal.json` — current state at build time (Insight-190).

## Constraints

- **`emit_intro_request(stepRunId, ...)` requires `stepRunId`** (Insight-180). The tool calls an LLM (refusal-reason composition), writes a DB row, and emits an `AuthorizationRequestBlock` that crosses a deployment boundary. Refuses without `stepRunId` outside `DITTO_TEST_MODE`. The harness pipeline supplies the parameter. Direct HTTP invocation MUST traverse the audited-route wrapper (Insight-232).
- **Tool name parity (Insight-180 silent-failure guard).** The string registered in `src/engine/tool-resolver.ts` `builtInTools` MUST match the string the Greeter directive references in `src/engine/network-chat-prompt.ts`. Acceptance includes a test asserting equality.
- **`AuthorizationRequestBlock.costLabel` is populated for every intro emission** — never `null` after this brief lands. The free-counter compute selects from three locked strings (see "Counter compute" below). Brief 259's `costLabel: null` placeholder is replaced when this brief's `emit_intro_request` is the one constructing the block.
- **Counter compute (locked).** For a given requester (identified by `requesterUserId` if authenticated workspace user, or `visitorSessionId` if anonymous visitor), count `introductions` rows in states `queued | approved | fulfilled | queued-for-review` (i.e. all non-refused, non-rejected, non-expired states). Then:
  - Count = 0 → `costLabel = "1st of 2 free intros (1 left after this)"`
  - Count = 1 → `costLabel = "2nd of 2 free intros (last free one)"`
  - Count ≥ 2 → `costLabel = "Request will be reviewed (free tier ends here in v1)"` AND row state on emission is `queued-for-review` instead of `queued`.
  The exact strings are encoded as constants. The renderer presents `costLabel` literally; no client-side string composition.
- **AC-J refusal triggers (four, locked).** `emit_intro_request` evaluates these IN ORDER before persisting and emitting:
  1. **Anti-persona match.** Compare requester's stated intent (visitor message OR client-lane JobRequestCardBlock content) against the target user's `networkUserAntiPersona` rules. If match: refuse. Surface a one-sentence reason — but NEVER quote, paraphrase, or reveal the anti-persona rule (Brief 259 Hard Rule #5). The reason is generic ("This isn't a fit on Tim's side — he's pickier on this dimension than the listing suggests.").
  2. **Low-fit signal.** Greeter's match-confidence below the threshold defined in Brief 248 (or, if Brief 248 didn't define a numeric threshold, this brief sets `< 0.5` on the LLM-emitted confidence; document the choice in the brief and revisit if the threshold turns out to be wrong). Refuse with one-sentence reason ("From what I can see, the fit is too thin — I don't want to send this and have it land cold.").
  3. **Explicit user block list.** A separate `networkUserBlockList` table (added by this brief — minor primitive) keyed by `(targetUserId, blockedRequesterIdentifier)` where `blockedRequesterIdentifier` is either a workspace user id, a visitor session id (rare), or a free-form pattern (e.g. email domain). Refuse silently with the same generic reason ("I'm not the right person to introduce on this one.").
  4. **Abuse-rate-limit hit.** Per requester (visitor session id OR workspace user id): more than `N` intro requests within `M` minutes. Suggested initial values: N=5, M=60 (5 intro requests per hour per requester). Configurable as constants. Refuse with rate-limit-specific reason ("You've sent a lot of intro requests recently — give it a beat and come back.").
  All four refusal paths produce an `introductions` row in state `refused-by-greeter` with `refusalReason` set to the matched trigger ("anti-persona" | "low-fit" | "user-block" | "rate-limit"). The row is persisted BEFORE the AuthorizationRequestBlock is returned, so the row exists even if the cross-deployment delivery later fails.
- **Refusal honored at BOTH lanes.** AC-J applies at `/network` client lane AND `/people/[handle]` visitor lane. Two separate test cases per refusal trigger (8 tests total).
- **Crossover trust-gate invariant honored** (parent §"Trust-gate invariant for crossovers" lines 159-163). Three crossover paths exercise `emit_intro_request`:
  1. **Expert → Client:** "Find me clients" auto-flips Lane B; intros emitted from the auto-flipped flow consume the user's free counter and require user approval. Same `emit_intro_request` invocation; counter row keyed to the user-as-requester.
  2. **Client → Expert:** flipping `wantsVisibility=true` post-intro is NOT itself an intro emission — but any subsequent candidate-match intro routes through `emit_intro_request` as usual. No special-case path.
  3. **Visitor → Expert:** "want a card of your own?" CTA does NOT bypass a pending visitor-side intro request — the existing `introductions` row remains keyed to the visitor session id. The new expert account starts with a fresh free counter (count=0) under the new `requesterUserId`.
  Verified by three crossover test cases.
- **Cross-deployment delivery uses Brief 259's chosen seam.** This brief does NOT introduce a parallel delivery mechanism. The Network → workspace bridge that delivers `forward_note_to_user` artifacts is the same one used here for intro delivery. If Brief 259 ships an in-memory bridge and 261 needs durability, that's a separate insight + brief.
- **Insight-231: AuthorizationRequestBlock body is self-contained on workspace render path.** Test verifies the workspace-side render path of the intro block does NOT import `networkDb`. The block body carries: `request` (intro request summary), `draft` (the Greeter's draft email/message), `preview: ContentBlock[]` (full visitor or client-lane transcript), `recipientLabel` (the visitor's stated name/org or the client-lane requester's display name), `requesterId` (visitor session id or workspace user id), `costLabel` (populated string). NO Network-tier-only references.
- **Workspace upsell trigger (locked — parent line 574).** Fires exactly ONCE per user per session-lane **after Q6 of either lane** (parent §"Workspace upsell" verbatim). Q6 completion is operationally:
  - **Expert lane:** the user has answered Q6 (`wantsVisibility` question per parent line 562) and the `NetworkProfileCardBlock` has been emitted to chat. Trigger key: `"expert-q6"`.
  - **Client lane:** the user has answered Q6 (off-network scout opt-in per parent line 570) and the `JobRequestCardBlock` has been emitted to chat. Trigger key: `"client-q6"`.
  Per parent line 582 ("Sub-briefs 256 + 257 must encode this verbatim"), Briefs 256 and 257 (both complete) own the Q6-completion seams. **Brief 261's build wires the `maybeFireWorkspaceUpsell` call into those seams** — verify at build time whether 256/257 already invoke a placeholder function or need the wiring inserted. The trigger does NOT fire on "first intro queued" or "first scout completes" — those are post-Q6 events outside the parent's locked design.
  Idempotency keyed by `(userId, sessionLaneId, trigger)` — recorded as a row in the `network_session_upsell_log` table (this brief adds it as a minor primitive). Re-firing on the same `(userId, sessionLaneId, trigger)` tuple is suppressed.
  The upsell text is the parent's verbatim copy:
  > *"Card's ready. I'll save this and you can chat with me at `ditto.partners/people/{handle}` — share that link with anyone curious about you.*
  >
  > *One more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**"*
  Encoded as a constant in `src/engine/network-upsell-copy.ts` and rendered via the chat. Test asserts substring presence ("Worth it if you do this kind of hunting more than twice a year") in the emitted message.
- **Schema migration follows Insight-190 (dual-journal hygiene).** New `introductions` + `networkUserBlockList` + `network_session_upsell_log` tables added to `packages/core/src/db/network/schema.ts`. `drizzle-kit generate --config drizzle.network.config.ts` (or equivalent) creates the SQL file at the next available idx. **Verify journal at build time:** Brief 259 plans idx 3 (`0003_create_network_forwarded_notes.sql`); if 259 has shipped, 261's migration is idx 4. If 259 has not shipped, 261's migration is idx 3 and 259 must resequence on its build. Build-time check: read `drizzle/network/meta/_journal.json` and use `(max(idx) + 1)`. SQL file MUST exist for every journal entry; idx values MUST be sequential.
- **No engine boundary violation.** The introductions table lives in `packages/core/src/db/network/schema.ts` (engine — schema is core). `emit_intro_request` lives in `src/engine/` (Ditto product layer — uses Network-specific delivery seam). Per CLAUDE.md "Engine Core" rules: schema is reusable across consumers; the intro-emission orchestration is Ditto-specific (network agent, three-context emission, free counter). ProcessOS could reuse the introductions table primitive but would not reuse the network-specific tool.
- **State transitions follow Brief 248's 9-state pattern.** Plus this brief adds three workflow states unique to introductions: `queued-for-review` (3rd+ intro under v1 free-only enforcement), `refused-by-greeter` (one of the 4 AC-J triggers fired), `fulfilled` (the user-side recipient confirmed the intro happened — out of scope for this brief; the field exists on the table and stays NULL until a downstream brief surfaces fulfillment).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `AuthorizationRequestBlock.costLabel` field (already present) | Brief 256 | adopt | Field added by 256 as a stub; this brief populates it. No primitive change. |
| AuthorizationRequestBlock 9-state machine + handler + feedback recording | Brief 248 | adopt | Existing primitive; intros are AuthorizationRequestBlock instances. |
| Cross-deployment Network → workspace delivery seam | Brief 259 (`forward_note_to_user`) | adopt | First brief to ship the cross-deployment delivery; this brief reuses the same seam unchanged. |
| Drizzle migration journal hygiene | Insight-190 | adopt | Dual-journal (workspace SQLite + network Postgres); resequence-on-conflict. |
| Insight-231 cross-deployment auth artifact contract | Insight-231 | adopt | Block body must validate in consuming deployment without cross-deployment DB call. |
| Audited HTTP route wrapper for guarded tools | Insight-232 | adopt | HTTP routes that invoke `emit_intro_request` traverse the wrapper. |
| Free-then-paid counter (free intros up to 2; gated 3rd+) | Standard freemium gating | pattern | Counter scaffolding now, payment hooks deferred per parent Deferred Items. |
| AC-J four refusal triggers (anti-persona / low-fit / user-block / rate-limit) | Original to Ditto, derived from Brief 248 + parent §Constraint | original | The 4-trigger taxonomy is unique to Ditto's representative-not-impersonator stance. No external precedent — LinkedIn, Contra, Upwork all rely on user-side rejection or paid gating, not Greeter-side refusal with one-sentence reasons. |
| Workspace upsell verbatim copy fired once per session-lane | Parent §"Workspace upsell" (locked verbatim) | adopt | Copy is locked by the parent; idempotency mechanism is original. |
| Idempotency log (`network_session_upsell_log`) | Original to Ditto | original | Minor primitive — stores `(userId, sessionLaneId, firedAt)` so re-firing is suppressed. No external precedent needed for a one-table flag. |
| Greeter rate-limiting per requester | Brief 259 visitor-rate-limit lifted from process-os | pattern | Same pattern, applied to intro-request rate not chat-message rate. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `introductions` pgTable: `{ id (uuid, pk), requesterUserId? (text — workspace user id), visitorSessionId? (text — visitor session if not authenticated), requesterDisplayName (text), requesterOrgLabel? (text), targetUserId (text — FK networkUsers.userId), state (text — one of "queued" \| "approved" \| "rejected" \| "expired" \| "fulfilled" \| "queued-for-review" \| "refused-by-greeter"), costLabel (text), freeCounterIndex (integer — 1, 2, or ≥3), refusalReason? (text — "anti-persona" \| "low-fit" \| "user-block" \| "rate-limit"), draftMd (text), transcriptJson (jsonb), originContext (text — "client-lane" \| "visitor" \| "expert-crossover"), createdAt (timestamp), decidedAt? (timestamp), fulfilledAt? (timestamp) }`. Index on `(targetUserId, state)` and `(requesterUserId, state)` and `(visitorSessionId, state)`. Constraint: exactly one of `requesterUserId` and `visitorSessionId` is non-null. |
| `packages/core/src/db/network/schema.ts` | Modify (same file): add `networkUserBlockList` pgTable: `{ id (uuid, pk), targetUserId (text — FK networkUsers.userId), blockedRequesterIdentifier (text — workspace user id, visitor session id, or simple wildcard pattern e.g. `*@acme.com`), kind (text — "user" \| "visitor-session" \| "pattern"), reasonMd? (text — user's private note), createdAt (timestamp) }`. Index on `targetUserId`. **`pattern`-kind entries are bounded:** simple string wildcards only (one or more literal `*` characters in a string), no regex syntax, max length 254 chars. Enforced at write time by a validator that rejects values containing regex metacharacters other than `*` (i.e. rejects `?`, `(`, `)`, `[`, `]`, `\`, `^`, `$`, `+`, `{`, `}`). Prevents ReDoS and accidental over-blocking from operator-supplied patterns. |
| `packages/core/src/db/network/schema.ts` | Modify (same file): add `network_session_upsell_log` pgTable: `{ id (uuid, pk), userId (text), sessionLaneId (text), trigger (text — "expert-q6" \| "client-q6"), firedAt (timestamp) }`. Unique constraint on `(userId, sessionLaneId, trigger)` for idempotency. |
| `drizzle/network/{NEXT}_create_introductions_blocklist_upselllog.sql` | Create: generated by `drizzle-kit generate` with the next available idx (verify against `drizzle/network/meta/_journal.json` at build time per Insight-190). All three tables in one migration is acceptable since they're related to the same brief's scope. |
| `drizzle/network/meta/_journal.json` | Modify: new entry with sequential idx. |
| `src/engine/emit-intro-request.ts` | Create: `emitIntroRequest({ stepRunId, originContext, requesterUserId?, visitorSessionId?, requesterDisplayName, requesterOrgLabel?, targetUserId, intentSummary, transcript }) → AuthorizationRequestBlock`. Evaluates 4 AC-J triggers in order; on refusal, persists `introductions` row in `refused-by-greeter` state with `refusalReason` set, returns AuthorizationRequestBlock with state `rejected` (per Brief 248 9-state machine) and refusal reason in `executionResult`. On non-refusal, computes counter (counts non-refused/rejected/expired rows for this requester), populates `costLabel`, persists `introductions` row in `queued` (or `queued-for-review` if count ≥ 2), composes the draft via LLM (cite only public + on-request KB facts per Brief 259), emits AuthorizationRequestBlock with `preview: ContentBlock[]` carrying transcript, delivers via the same Network → workspace bridge used by `forward_note_to_user`. Refuses without `stepRunId` outside `DITTO_TEST_MODE`. |
| `src/engine/emit-intro-request.test.ts` | Create: tests for stepRunId enforcement, all 4 AC-J refusal triggers (each tested at BOTH client lane and visitor lane = 8 tests), counter compute (3 cases: count=0, count=1, count=2), state transitions (queued → approved, queued → rejected, queued → expired, queued-for-review → approved, refused-by-greeter terminal), crossover invariant (expert→client, client→expert, visitor→expert = 3 tests), Insight-231 self-contained block body assertion (block body deserializable + renderable without networkDb import), tool-name parity assertion. |
| `src/engine/tool-resolver.ts` | Modify: register `emit_intro_request` in `builtInTools` keyed by the same string the Greeter directive references. |
| `src/engine/network-chat-prompt.ts` | Modify: extend Greeter directive (BOTH expert lane and client lane variants, AND the visitor lane variant from Brief 259) to reference the `emit_intro_request` tool. The visitor-lane directive — currently planned to call a placeholder intro-emission stub in Brief 259 — is updated to call this brief's tool instead. (Coordination: this means Brief 261 build replaces the stub Brief 259 build introduces. Document this seam clearly in code comments.) |
| `src/engine/network-upsell-copy.ts` | Create: encodes the parent's verbatim workspace upsell copy as a constant. Exports `WORKSPACE_UPSELL_COPY` and a function `composeWorkspaceUpsell({ greeterName, userFirstName, handle })` that interpolates the variables. |
| `src/engine/workspace-upsell-trigger.ts` | Create: `maybeFireWorkspaceUpsell({ stepRunId, userId, sessionLaneId, trigger })` — checks `network_session_upsell_log` for an existing entry; if none, writes the row and emits the upsell message into the chat; if present, no-ops. Refuses without `stepRunId` outside `DITTO_TEST_MODE`. **Wired to fire from the Q6-completion seams (parent line 574 + 582):** (a) Brief 256's expert-card-emission seam (`trigger="expert-q6"`), and (b) Brief 257's JobRequest-emission seam (`trigger="client-q6"`). The build inspects 256/257 at implementation time; if those briefs already shipped a placeholder upsell-fire call site, Brief 261's build replaces it; if not, the build inserts the call at the right line. |
| `src/engine/workspace-upsell-trigger.test.ts` | Create: tests for stepRunId enforcement, idempotency (calling twice in same session-lane no-ops the second), substring assertion that the emitted message contains the locked verbatim line "Worth it if you do this kind of hunting more than twice a year". |
| `packages/web/app/api/v1/network/people/[id]/intro-request/route.ts` | Modify (created by Brief 259 with placeholder; this brief replaces the placeholder): POST endpoint that takes the visitor-side intro intent + transcript, traverses the audited-route wrapper (Insight-232), calls `emit_intro_request`. Returns the AuthorizationRequestBlock JSON to the visitor's chat. |
| `packages/web/app/api/v1/network/intros/route.ts` (or the existing client-lane intro path — verify at build time) | Modify: client-lane intro emission goes through `emit_intro_request` instead of any placeholder. |
| `packages/web/components/blocks/authorization-request.tsx` (or wherever Brief 248's renderer lives) | Modify: surface `costLabel` as a one-line text under the draft, styled per parent §Surface G ASCII line 543 ("This uses your 1st free intro. (1 left after this.)"). Hide the line when `costLabel` is null (preserves Brief 259 placeholder behavior during the build window). |
| `packages/web/components/network/workspace-upsell-cta.tsx` | Create: chat-rendered CTA component with the verbatim copy + two buttons `[Yes, set up workspace] [Not now, just my card]`. Wires Yes button to existing workspace-provisioning flow (`/api/v1/network/admin/provision`). |

## User Experience

- **Jobs affected:** Capture (intro request captured as authorization-request artifact), Decide (user approves/rejects intro; user accepts/declines workspace upsell), Delegate (user delegates intro emission to Greeter via the gate), Orient (user sees free-counter state in their inbox via `costLabel`).
- **Primitives involved:** `AuthorizationRequestBlock` (existing — populated `costLabel`), `introductions` row (new server-side primitive, not a content block), `networkUserBlockList` (new minor primitive), `network_session_upsell_log` (new minor primitive), workspace upsell CTA (new chat-rendered affordance).
- **Process-owner perspective:** A workspace user receives an intro request in their inbox. The block shows the requester's display name, the draft, the visitor or client-lane transcript, and a one-line `costLabel` ("1st of 2 free intros (1 left after this)" or "Request will be reviewed (free tier ends here in v1)"). Below: `[Send it] [Edit draft] [Not now]` per Brief 248. After clicking "Send it", the user sees the workspace upsell CTA in chat with the verbatim copy and `[Yes, set up workspace]` / `[Not now, just my card]` buttons. If they decline, no further upsell fires in that session-lane.
- **Interaction states:**
  - **Loading (Greeter composing intro draft):** ~3-5s. Show "Alex is drafting the intro…" indicator.
  - **Empty:** Not applicable — every intro emission has a draft.
  - **Error (LLM fails or DB write fails):** "Something went sideways while drafting. Try again?" — retry button.
  - **Success (intro queued):** AuthorizationRequestBlock appears with populated `costLabel`; visitor sees confirmation "I'll send this to {first}; if it lands, you'll hear back in a day or two." (per Brief 259 Hard Rule #6).
  - **Refused (one of 4 triggers):** AuthorizationRequestBlock appears with state `rejected` and the one-sentence reason in `executionResult`. NEVER quotes anti-persona rule. Renderer styles the state visually distinct (per Brief 248).
  - **Workspace upsell shown:** CTA rendered in chat AFTER the intro is queued. User can dismiss without consequences.
- **Designer input:** Designer should be invoked for: the `costLabel` line styling under the draft (parent §Surface G ASCII line 543 suggests a small ink line — Builder follows this), the refusal-state visual treatment for AuthorizationRequestBlock (Brief 248's renderer may need a minor color update to make refusal visually distinct from rejection-by-user), the workspace upsell CTA styling (parent §"Workspace upsell" lines 580-581 lock the button labels but not the visual treatment). **Lightweight Architect-filled check if Designer not invoked:** the layouts follow parent §Surface G ASCII verbatim and the upsell copy renders as a chat message with two buttons inline; refusal blocks use Brief 248's existing rejected-state styling.

## Acceptance Criteria

How do we verify this work is complete? Each criterion is boolean: pass or fail.

1. [ ] `introductions`, `networkUserBlockList`, `network_session_upsell_log` pgTables added to `packages/core/src/db/network/schema.ts` with the columns and constraints specified above.
2. [ ] `drizzle/network/{NEXT}_*.sql` migration file generated; `drizzle/network/meta/_journal.json` has the new entry with sequential idx; SQL file exists for every journal entry (Insight-190 dual-journal verification at build time).
3. [ ] `emit_intro_request(stepRunId, ...)` exists in `src/engine/emit-intro-request.ts`; refuses without `stepRunId` outside `DITTO_TEST_MODE`. Verified by test.
4. [ ] Tool name registered in `src/engine/tool-resolver.ts` `builtInTools` is the exact string referenced in `src/engine/network-chat-prompt.ts` directive (Insight-180 silent-failure guard). Verified by equality assertion.
5. [ ] `AuthorizationRequestBlock.costLabel` is populated on every emission — never `null` from this brief's tool. Three counter cases verified by test:
   - 5a. Count=0 → `costLabel = "1st of 2 free intros (1 left after this)"`, row state `queued`.
   - 5b. Count=1 → `costLabel = "2nd of 2 free intros (last free one)"`, row state `queued`.
   - 5c. Count=2 → `costLabel = "Request will be reviewed (free tier ends here in v1)"`, row state `queued-for-review`.
6. [ ] AC-J four refusal triggers tested in BOTH lanes (8 tests):
   - 6a. Anti-persona match (client lane + visitor lane) → row state `refused-by-greeter`, `refusalReason = "anti-persona"`, AuthorizationRequestBlock state `rejected`, reason text NEVER quotes/paraphrases the anti-persona rule (asserted via substring absence test).
   - 6b. Low-fit signal (client lane + visitor lane) → state `refused-by-greeter`, `refusalReason = "low-fit"`, reason is the locked one-sentence string.
   - 6c. Explicit user block list (client lane + visitor lane) → state `refused-by-greeter`, `refusalReason = "user-block"`, reason is the locked generic string.
   - 6d. Abuse-rate-limit hit (client lane + visitor lane) → state `refused-by-greeter`, `refusalReason = "rate-limit"`, reason is the rate-limit-specific string.
7. [ ] Crossover trust-gate invariant tested (3 tests):
   - 7a. Expert → Client crossover ("Find me clients" auto-flip) → intro emission goes through `emit_intro_request`; counter row keyed to user-as-requester.
   - 7b. Client → Expert crossover (`wantsVisibility=true` post-intro then candidate-match intro) → routes through `emit_intro_request` on subsequent intro.
   - 7c. Visitor → Expert crossover ("want a card of your own?" CTA mid-visitor-session) → existing `introductions` row remains under `visitorSessionId`; new expert account starts with count=0 under new `requesterUserId`.
8. [ ] Workspace upsell trigger fires exactly once per `(userId, sessionLaneId, trigger)` tuple. Verified by test:
   - 8a. First call writes `network_session_upsell_log` row + emits chat message containing verbatim "Worth it if you do this kind of hunting more than twice a year".
   - 8b. Second call with same tuple no-ops (no row written, no message emitted).
9. [ ] Workspace upsell fires after BOTH Q6-completion seams (parent line 574 literal): (a) first expert-lane card emission (`trigger="expert-q6"`), (b) first client-lane JobRequest emission (`trigger="client-q6"`). Two tests, one per seam. **Does NOT fire on "first intro queued" or "first scout completes"** — those are explicitly outside the parent's locked trigger.
10. [ ] Cross-deployment delivery: a visitor-originated intro lands in the target user's workspace inbox via the same Network → workspace bridge used by `forward_note_to_user` (Brief 259's chosen seam). Verified by integration test or manual smoke (smoke section).
11. [ ] Insight-231 self-contained block body: workspace-side render path of the AuthorizationRequestBlock does NOT import `networkDb`. Verified by an import-graph test that loads the workspace inbox renderer and asserts no `networkDb` symbol is reachable from its module graph.
12. [ ] v1 free-only enforcement: no Stripe imports, no `pricing` payload in any new code, no payment route. Verified by grep test (`pnpm grep "stripe\|stripeCheckout\|paymentIntent" src/engine packages/web/app | head -1` returns nothing for the new files).
13. [ ] Renderer surfaces `costLabel` as a one-line text under the draft when non-null; hidden when null (preserving Brief 259 placeholder behavior). Verified by component test.
14. [ ] Workspace upsell CTA renders with the parent's verbatim copy and `[Yes, set up workspace] [Not now, just my card]` buttons. The Yes button posts to existing `/api/v1/network/admin/provision`.
15. [ ] **HTTP route bypass-rejection (Insight-232 Implication 2).** The `packages/web/app/api/v1/network/people/[id]/intro-request/route.ts` POST endpoint rejects any request that supplies a `stepRunId` in the request body with a 4xx response — the wrapper is the only authority that injects `stepRunId`, never the client. Verified by a route test that sends `{ stepRunId: "fake" }` in the body and asserts 4xx + no `introductions` row written.
16. [ ] **BlockList pattern validator.** `networkUserBlockList.blockedRequesterIdentifier` with `kind="pattern"` is bounded: simple wildcards only (`*` allowed; regex metacharacters `?()[]\^$+{}` rejected) and max length 254 chars. Verified by schema/insert test that rejects regex-style patterns and over-length values.

**Smoke-test-relevant** (these are NOT acceptance criteria but the smoke proves the loop):

- [ ] End-to-end: visitor on `/people/{handle}` requests intro → row in `introductions` (state=queued, costLabel populated) → AuthorizationRequestBlock lands in user's workspace inbox with full transcript → user clicks "Send it" → row state=approved → workspace upsell CTA appears in user's chat with verbatim copy.

## Review Process

How to validate the work after completion:

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + parent brief 254 (§"Workspace upsell", §"Trust-gate invariant for crossovers", AC-J, AC-K) + Brief 248 + Brief 259 (specifically §Cross-deployment auth contract) + `docs/insights/180-steprun-guard-for-side-effecting-functions.md` + `docs/insights/190-migration-journal-concurrency.md` + `docs/insights/231-cross-deployment-auth-artifacts-validate-in-consuming-deployment.md`.
2. Review agent checks:
   - All 16 acceptance criteria.
   - Layer alignment: Layer 2 (agent — `emit_intro_request` self-tool with stepRunId guard) + Layer 3 (harness — trust-gate refusal + cross-deployment delivery) + Layer 6 (human surface — costLabel rendering, upsell CTA).
   - Provenance: each pattern traces to a source brief or insight; the 4-trigger taxonomy is marked `original`; the upsell idempotency log is marked `original`.
   - Composition: AuthorizationRequestBlock primitive is reused unchanged; cross-deployment delivery seam is reused from Brief 259 unchanged.
   - Trust model: every emission gated; refusal honored at both lanes; counter is workflow state not paywall.
   - Side-effect guard (review-checklist item 13): `emit_intro_request` and `workspace-upsell-trigger` enumerated; tested.
   - Reference doc accuracy (review-checklist item 12): no stale ADRs; this brief's scope does not require an architecture.md update beyond the row-261 status flip in parent brief 254.
   - Engine boundary: schema in `packages/core/`; orchestration tool in `src/engine/`. ProcessOS could reuse the introductions table; not the tool.
   - Cross-deployment delivery durability (review-checklist item 16, if present in the live checklist; per Insight-234 if it lands as an insight): this brief delegates to Brief 259's chosen seam, does not invent a parallel seam, and FLAGS if Brief 259's seam turns out to be lossy in production as a downstream insight + brief — NOT folded into this scope.
   - Schema migration hygiene (Insight-190 dual-journal): SQL file exists for every journal entry; idx values sequential; verified at build time.
3. Present brief + review findings to human for approval before Builder starts.

## Smoke Test

Manual end-to-end test that proves the brief is working.

```bash
# 0. Pre-requisites: dev DB seeded with at least two users — Tim (target) and a
#    workspace user "Casey" (client lane requester). Tim's workspace deployed.

# 1. Verify tool & tests pass.
pnpm vitest run src/engine/emit-intro-request.test.ts
pnpm vitest run src/engine/workspace-upsell-trigger.test.ts
# EXPECT: all tests pass — stepRunId-rejection, 8 AC-J triggers (4 × 2 lanes),
# 3 counter cases, 3 crossover cases, idempotency, substring-verbatim assertion,
# self-contained-block-body assertion, tool-name-parity.

# 2. Type-check.
pnpm run type-check
# EXPECT: zero errors.

# 3. Migrate.
pnpm drizzle-kit push --config drizzle.network.config.ts
# EXPECT: introductions, networkUserBlockList, network_session_upsell_log
# tables present in network DB.

# 4. Start dev (Network deployment + Tim's workspace).
DITTO_DEPLOYMENT=public pnpm --filter @ditto/web dev
# (Tim's workspace at ditto-ws-{handle}.up.railway.app — production, or local
#  via DITTO_DEPLOYMENT=workspace)

# 4b. Workspace upsell at Q6 (expert lane) — parent line 574 trigger.
# Spawn a FRESH expert user (e.g. "smoke-expert-{date}") and walk them through
# the expert intake Q1-Q6.
# After answering Q6 (the wantsVisibility question):
# VERIFY:
#   - NetworkProfileCardBlock emits.
#   - Workspace upsell CTA appears in chat with verbatim line
#     "Worth it if you do this kind of hunting more than twice a year".
#   - Two buttons present: [Yes, set up workspace] [Not now, just my card].
#   - network_session_upsell_log row written: (userId, sessionLaneId, trigger="expert-q6").
# Click [Not now, just my card]. VERIFY: CTA disappears; no row written to
#   workspace-creation table.
# Submit another small edit to the card (re-trigger Q6 effectively).
# VERIFY: upsell does NOT re-fire (idempotency on (userId, sessionLaneId, trigger)).

# 4c. Workspace upsell at Q6 (client lane).
# Spawn a fresh client user "Casey" and walk them through client intake Q1-Q6.
# After answering Q6 (the off-network scout opt-in):
# VERIFY:
#   - JobRequestCardBlock emits.
#   - Workspace upsell CTA appears in Casey's chat with verbatim line.
#   - network_session_upsell_log row: (Casey.userId, sessionLaneId, trigger="client-q6").

# 5. Visitor lane intro flow (cross-deployment).
open http://localhost:3000/people/timhgreen
# As a visitor (no login):
#   - Send a few messages.
#   - Type "I'd like an intro to Tim — I'm Casey from Acme, building B2B SMB
#     workflow tooling."
#   VERIFY: AuthorizationRequestBlock appears with populated costLabel
#     "1st of 2 free intros (1 left after this)".
#   - Click "Send it" on the visitor side (this finalizes the request).

# 6. Open Tim's workspace inbox (separate browser session — Tim authenticated).
open https://ditto-ws-timhgreen.up.railway.app/inbox
# VERIFY:
#   - AuthorizationRequestBlock row present.
#   - Transcript visible as preview.
#   - costLabel line "1st of 2 free intros (1 left after this)" rendered.
#   - The render path did NOT make a cross-deployment Network DB call (verify
#     in dev tools network tab — no requests to ditto.partners/api/v1/network/db
#     or similar).

# 7. Approve.
# Click [Send it] in Tim's workspace inbox.
# VERIFY:
#   - introductions.state transitions queued → approved.
#   - decidedAt populated.
#   - **No upsell CTA appears** — Tim's upsell already fired at his expert Q6
#     (covered in step 4b). Upsell-on-approve is NOT the parent's trigger.

# 8. (Reserved — no upsell-dismiss step here; upsell is gated to Q6 completion,
#     tested in steps 4b/4c. AC 9 unit-test covers idempotency at unit level.)

# 9. Second intro (still free).
# Repeat steps 5-7 from a different visitor session id.
# VERIFY: costLabel = "2nd of 2 free intros (last free one)".

# 10. Third intro (review state).
# Repeat from a third visitor session id.
# VERIFY:
#   - AuthorizationRequestBlock costLabel = "Request will be reviewed
#     (free tier ends here in v1)".
#   - introductions.state = "queued-for-review" (not "queued").
#   - NO Stripe checkout, no payment UI, no friction beyond the copy change.
#   - Tim's inbox still receives the row; Tim can still approve/reject.

# 11. AC-J trigger: anti-persona refusal.
# Pre-seed Tim's networkUserAntiPersona with "Don't intro consultants who only
# draft strategy". Visitor self-describes: "I'm a strategy consultant — I help
# operators draft long-range plans — would love to chat."
# Type "I'd like an intro to Tim."
# VERIFY:
#   - AuthorizationRequestBlock has state="rejected" with one-sentence reason
#     in executionResult.
#   - Reason text does NOT contain substrings "consultant", "strategy", or any
#     paraphrase of the anti-persona rule.
#   - introductions row state="refused-by-greeter", refusalReason="anti-persona".

# 12. AC-J trigger: rate-limit refusal.
# From a single visitor session id: send 6 intro requests in <60 minutes.
# VERIFY: 6th request returns AuthorizationRequestBlock state="rejected" with
#   rate-limit reason; introductions row state="refused-by-greeter",
#   refusalReason="rate-limit".

# 13. Crossover invariant.
# As Tim (logged in workspace), use the expert→client crossover ("Find me
# clients") and emit an intro request from the auto-flipped Lane B.
# VERIFY:
#   - introductions row created with originContext="expert-crossover",
#     requesterUserId=Tim's user id.
#   - costLabel populated from Tim's counter (which is 0 if this is his first
#     emitted intro from any lane).
```

## After Completion

1. Update `docs/state.md` with what changed: Brief 261 complete; introductions primitive live; AC-J + AC-K satisfied end-to-end; workspace upsell verbatim copy fired idempotently.
2. Update `docs/roadmap.md` row 804 (Brief 261) status to `complete` with deliverable path.
3. Update `docs/briefs/254-network-two-sided-conversational-front-door.md` table row 261 to `complete`. **Mark all parent acceptance criteria 1-12 + journey acceptance A-P satisfied** (this is the closing brief of the parent — the journey acceptance criteria become end-to-end-testable now).
4. Move this brief to `docs/briefs/complete/` per the established convention.
5. Phase retrospective: did the four refusal triggers fire correctly in production? Was the counter compute accurate? Did the workspace upsell convert? Capture as insights.
6. ADR consideration: write the planned "AI-on-profile is REPRESENTATIVE-not-IMPERSONATOR" ADR (deferred from parent §"After Completion") now that Briefs 259 + 261 have together landed the production representative pattern. Possibly also "Network as Two-Sided Front Door" strategic ADR per parent.
7. Trigger PM review: with the parent brief fully closed, evaluate whether the next phase work (Deferred Items: payments, vector search, scoreboard) is unblocked.

## Reference Docs

This brief was authored against the following sources, each verified current at 2026-05-13. If a Builder finds any of these stale at implementation time, FLAG and resolve before coding (Insight-043).

| Doc | Status at 2026-05-13 | Why it matters |
|-----|----------------------|----------------|
| `docs/briefs/254-network-two-sided-conversational-front-door.md` | parent, current | §"Workspace upsell" verbatim copy; AC-J 4 refusal triggers; §"Trust-gate invariant for crossovers"; AC-K free-only enforcement |
| `docs/briefs/248-greeter-beat-2-authorization.md` | accepted, current | AuthorizationRequestBlock 9-state machine + handler; this brief reuses the primitive |
| `docs/briefs/259-public-profile-as-chat-and-representative-rule.md` | designed, build pending | Cross-deployment Network → workspace bridge seam; this brief reuses unchanged |
| `packages/core/src/content-blocks.ts` (line 297) | current | `AuthorizationRequestBlock.costLabel?: string \| null` already present from Brief 256 — NOT extended by this brief |
| `packages/core/src/db/network/schema.ts` | current | new `introductions`, `networkUserBlockList`, `network_session_upsell_log` tables added here |
| `src/engine/tool-resolver.ts` | current | `emit_intro_request` registered in `builtInTools` |
| `src/engine/network-chat-prompt.ts` | current | Greeter directive extended with `emit_intro_request` reference (replaces Brief 259's placeholder for visitor lane) |
| `docs/insights/180-steprun-guard-for-side-effecting-functions.md` | active | applies to `emit_intro_request` and `maybeFireWorkspaceUpsell` |
| `docs/insights/190-migration-journal-concurrency.md` | active | new migration entry on the network journal — verify idx at build time |
| `docs/insights/231-cross-deployment-auth-artifacts-validate-in-consuming-deployment.md` | active | block body must validate without cross-deployment DB call |
| `docs/insights/232-audited-http-route-wrapper-step-run-for-guarded-tools.md` | active | HTTP routes that invoke `emit_intro_request` traverse the wrapper |
| `drizzle/network/meta/_journal.json` | current — verify at build time | dual-journal hygiene per Insight-190 |

**Reference docs updated** (during design):
- `docs/briefs/254-network-two-sided-conversational-front-door.md` — row 261 marked `design-ready` after this brief lands.

**Reference docs checked** (no drift found):
- `docs/adrs/041-agency-model-three-layer-ontology.md` — Brand/Greeter/Self separation preserved. The Greeter is the actor refusing intros (not the Self); the Self approves on the user's workspace side. No layer-line crossing.
- `docs/adrs/048-network-tier-postgres-migration.md` — introductions, blocklist, upsell-log tables live in network tier (Postgres). Tier boundary respected.
- `packages/core/src/content-blocks.ts` (line 297) — `costLabel` field present; this brief does NOT extend the type.
- `docs/dictionary.md` — terms used in this brief (intro, costLabel, refusal, anti-persona, workspace upsell, free counter) — verified consistent with existing usage. **Architect note**: if "queued-for-review" or "refused-by-greeter" are not yet in `docs/dictionary.md`, the Builder should add them as part of After Completion.
