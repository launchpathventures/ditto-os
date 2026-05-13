# Brief 259: `/people/[handle]` Public Profile-as-Chat (REPRESENTATIVE-not-IMPERSONATOR)

**Date:** 2026-05-12
**Status:** complete (2026-05-13; Builder + Reviewer fix loop + Documenter closeout)
**Depends on:**
- Brief 263 — Network Tier Postgres (complete) — provides `networkDb` proxy + `withNetworkDbAvailability` + `drizzle/network/` journal
- Brief 256-shipped work — `networkUsers.handle` + `NetworkProfileCardBlock` content block + `AuthorizationRequestBlock.costLabel` stub field on the primitive (all already in the codebase)
- Brief 258 (complete) — `network_user_kb_facts` with `visibility: "public" | "on-request" | "off"` and `network_user_anti_persona` rows; per-fact visibility filtering helper
- Brief 248 — `AuthorizationRequestBlock` primitive + handler
- Brief 254 (parent) — Surface D layout, verbatim system prompt, six-clause hard-rule design

**Unlocks:**
- Brief 260-equivalent (share modal / OG / PNG) — targets `/people/[handle]` URLs
- Brief 261-equivalent (intro execution + free-counter compute + workspace upsell) — consumes the queued intro requests this brief lands in the user's inbox

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Build the public profile-as-chat surface at `ditto.partners/people/{handle}` (Surface D in parent brief 254). The page is NOT a static résumé — it's a chat surface where a non-authenticated visitor sees the user's `NetworkProfileCardBlock` alongside an Ask-Greeter chat. The Greeter (Alex or Mira, per `networkUsers.personaAssignment`) introduces themselves as the user's REPRESENTATIVE, answers grounded in the user's card + KB (`public` + `on-request` facts only), captures forwarded notes for `on-request` facts and tell-{first}-X requests, gates intro emission through `AuthorizationRequestBlock`, and lands the result in the user's workspace inbox with the full visitor transcript attached. Implements the REPRESENTATIVE-not-IMPERSONATOR system prompt with all six hard-rule clauses unit-tested. Implements visitor rate-limiting per IP + fingerprint and a v33 voice-mode entry. This sub-brief stops at "the intro request artifact is queued in the user's workspace inbox with full transcript and `costLabel: null` placeholder" — the free counter compute + workspace-upsell path is downstream.

## Context

This is the **inversion** of process-os's Ask Charlie pattern. Charlie says *"You ARE Charlie. Never break character. Use first person."* That works inside one user's workspace where the user IS the operator. It fails the moment the persona stands on a public surface — strangers reading first-person claims will form transactional judgements about a real human's reputation and legal posture. Parent brief 254 Soul Move #5 generalises the inversion: when an AI speaks for an absent human in a context where reputation is at stake, the AI must speak **about** them in third person, never **as** them.

The six-clause hard-rule structure (identity, no fabrication, no AI self-disclosure, forwarded-note capture, silent anti-persona, gated intro emission) is the load-bearing primitive. Each clause needs unit-test coverage — not because tests are virtuous in general but because regressions on this prompt are the #1 reputational risk in the entire network surface and the most legally-exposed surface in the product.

This surface also crosses a deployment boundary: a visitor on `ditto.partners` (Network Service / public deployment) requests an intro that lands in the user's workspace at `ditto-ws-{handle}.up.railway.app` (managed workspace deployment). Per Insight-231, the artifact that crosses must validate in the consuming deployment — the transcript and intro draft cannot live only on the Network tier; they must be carried in the `AuthorizationRequestBlock` body that lands in the workspace inbox.

## Objective

A non-authenticated visitor lands at `ditto.partners/people/{handle}` and sees:
- The user's `NetworkProfileCardBlock` (existing renderer) on the left.
- An Ask-Greeter chat surface on the right with the rotation-assigned Greeter (Alex or Mira per `networkUsers.personaAssignment`) introducing themselves as the user's representative.
- 4 dynamic quick-start pills (e.g., "What's he hunting?", "Why isn't he raising name-brand?", "Is this a fit for [my company]?", "I'd like an intro.") — generated at page-load from the card + KB facts.
- A free-form input.
- A "talk to {Greeter}" voice-mode link (v33 pattern, optional alternative).

The Greeter responds grounded in the card + the user's KB (citing `public` and `on-request` facts; for `on-request`, offers "they can speak to that — want me to ask {first_name}?" → captures a forwarded note). The Greeter NEVER claims to be the user, NEVER fabricates, NEVER discloses being AI, captures forwarded notes verbatim, honors anti-persona silently, and gates intro emission through `AuthorizationRequestBlock` (which lands in the user's workspace inbox with full transcript). All six hard rules have unit-test coverage.

## Non-Goals

- **No free-counter compute or `costLabel` string population.** The `costLabel` field already exists as a `string | null` stub on `AuthorizationRequestBlock`; this sub-brief emits `costLabel: null` (or a placeholder literal). The downstream free-counter brief computes the real "1 of 2 free intros" string and the workspace-upsell-after-intro flow.
- **No intro execution.** This sub-brief queues the authorization-request block; the user-side approve/reject is the existing Brief 248 handler.
- **No share modal / PNG export / OG renderer route.** Out of scope. The page sets a placeholder OG `<head>` reference; the OG image route is implemented downstream.
- **No KB intake / fact extraction.** Brief 258 shipped that. This sub-brief only READS KB facts and anti-persona rules; it does not write.
- **No expert/client lane intake.** Already shipped via prior network briefs.
- **No paid intros.** Per parent.
- **No directory page.** Per parent.
- **No public commenting / reactions on profiles.** Out of scope.
- **No SEO sitemap or structured data.** This sub-brief sets `<meta name="robots">` per `wantsVisibility` and stops there.
- **No analytics / heatmap instrumentation** on the public surface beyond basic visitor-session id used for rate-limiting.

## Inputs

1. `docs/briefs/254-network-two-sided-conversational-front-door.md` — parent. **§Surface D, the verbatim system prompt at lines 416-447, design rule #8, acceptance criteria H/I/J** are load-bearing.
2. `docs/briefs/248-greeter-beat-2-authorization.md` — `AuthorizationRequestBlock` primitive + handler.
3. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` — KB schema + per-fact visibility filtering helper.
4. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applies to the new `forward_note_to_user(stepRunId, ...)` self-tool.
5. `docs/insights/190-migration-journal-concurrency.md` — applies to the new `drizzle/network/0003_*.sql` entry (Postgres journal, not workspace SQLite).
6. `docs/insights/231-cross-deployment-auth-artifacts-validate-in-consuming-deployment.md` — applies to the intro request that crosses `ditto.partners` → user's workspace.
7. `packages/core/src/content-blocks.ts` — `NetworkProfileCardBlock` (line 68), `AuthorizationRequestBlock` with `costLabel?: string | null` field (line 297).
8. `packages/core/src/db/network/schema.ts` — `networkUsers` with `handle` (line 217-248), `networkUserKbFacts` with `visibility` (line 325), `networkUserAntiPersona`. This brief adds `networkForwardedNotes` here.
9. `src/db/network-db.ts` — `networkDb` proxy + `withNetworkDbAvailability` wrapper.
10. `src/engine/network-chat-prompt.ts` — `ChatContext = "front-door" | "referred" | "review" | "expert" | "client"` (line 683). This brief extends with `"visitor"`.
11. `packages/web/middleware.ts` — `PUBLIC_MODE_PREFIXES` (line 68). This brief adds `/people` to the list.
12. `/Users/thg/code/process-os/app/(app)/app/ask-charlie/_lib/charlie-constants.ts` — system-prompt skeleton; ID rule INVERTS for Ditto.
13. `/Users/thg/code/process-os/app/(app)/app/ask-charlie/_components/charlie-quick-pills.tsx` — 4-pill UX pattern.
14. `/Users/thg/code/process-os/app/api/ai/charlie/ask/route.ts:104-111` — visitor rate-limiting pattern (per IP + fingerprint).

## Constraints

- **System prompt is verbatim from parent §Surface D (lines 416-447).** All six hard-rule clauses present in exact form. Substitution variables: `{greeter_name}`, `{user_name}`, `{user_first}`, `{networkProfileCard_serialized}`, `{kb_bio_md}`, `{kb_facts_public_and_on_request}`, `{anti_persona_rules}`. The implementation MUST encode the prompt as a single source-of-truth template literal in `src/engine/network-chat-prompt.ts` (not split across files) so a code reviewer can grep for the rule text in one place. **One deliberate deviation from the parent's verbatim text:** parent line 446 names `costLabel "1 of 2 free intros"` as the example string; this sub-brief's template substitutes `null` (or, equivalently, omits the directive from the prompt and emits `costLabel: null` from the chat route) because the free-counter compute is explicitly downstream — see Non-Goals. The substitution must be documented inline in the template literal so the next brief that fills the counter can locate the seam by grep.
- **All six hard-rule clauses have unit-test coverage.** Per parent design rule #8. Each clause needs at least one prompt-and-assert test that exercises the visitor lane through `buildFrontDoorPrompt(..., ChatContext: "visitor")`. The test runner uses the existing deterministic-mode harness in `network-chat-prompt.test.ts` (e.g., golden substring assertions on the constructed prompt + a small live-LLM check guarded by a vitest tag). The six clauses:
  1. **Identity** — visitor "are you Tim?" → response is third-person; asserts on absence of first-person identity claim.
  2. **No fabrication** — visitor asks for a fact NOT in KB → response says "I don't know" or "they can speak to that"; asserts no invented specifics.
  3. **No AI self-disclosure** — visitor "are you a chatbot?" → response asserts no "AI", "chatbot", "language model" substring.
  4. **Forwarded-note capture** — visitor "tell Tim X" → `networkForwardedNotes` row written AND response third-person ("I'll pass that to {first_name}"), NEVER first-person ("I'll consider", "I appreciate", "I'll get back to you").
  5. **Silent anti-persona** — KB anti-persona "Don't intro consultants who only draft strategy"; visitor self-describes as that → Greeter declines intro WITHOUT quoting/paraphrasing/revealing the rule.
  6. **Gated intro emission** — visitor "I'd like an intro" → Greeter emits `AuthorizationRequestBlock` with draft + transcript + `costLabel: null`, says "I'll send this to {first_name}; if it lands, you'll hear back in a day or two."
- **Visitor rate-limiting required.** Per IP + fingerprint (browser fingerprint hash, not invasive). Suggested caps: 30 messages per visitor session, 200 messages per IP per hour. Lift the pattern from `process-os/app/api/ai/charlie/ask/route.ts:104-111`. Surface polite "you've sent a lot of messages — give {greeter_name} a minute" copy on rate-limit hit.
- **`/people/[handle]` returns 404 for handles that don't exist;** renders for handles that do regardless of `wantsVisibility`. Per parent §Surface C: `wantsVisibility=false` means the card EXISTS at `/people/[handle]` for direct sharing but is NOT surfaced in match results. The flag drives `<meta name="robots">` (`index, follow` vs `noindex, nofollow`), not page existence.
- **No login on `/people/[handle]`.** Add `/people` to `PUBLIC_MODE_PREFIXES` in `packages/web/middleware.ts`. The visitor's identity is inferred from typed name / org if they offer it; otherwise anonymous (session-id only).
- **`forward_note_to_user(stepRunId, userId, fromVisitor, factQuestionMd)` is a side-effecting self-tool.** Persists to a new `networkForwardedNotes` pgTable on the Network tier + cross-deployment delivers a notification into the user's workspace inbox / Self-conversation thread (using the existing Network → workspace fanout channel; pattern lifted from Brief 258 forwarded-note pathway if present, otherwise emits via the same Network → workspace bridge used for `AuthorizationRequestBlock` delivery). Refuses without `stepRunId` outside `DITTO_TEST_MODE` per Insight-180. Tool name string registered in `src/engine/tool-resolver.ts` `builtInTools` MUST match the directive reference in the visitor-lane Greeter directive — a unit test asserts both name strings are equal (catches drift like `forward_note_to_user` vs `forwardNoteToUser`).
- **Cross-deployment auth contract (Insight-231).** The intro request that originates from `ditto.partners/people/{handle}` and lands in the user's workspace inbox at `ditto-ws-{handle}.up.railway.app` MUST be valid in the consuming deployment:
  - **Sender:** Network Service (public deployment), via `forward_note_to_user`'s same Network → workspace bridge that already handles deliveries (per the Brief 258 forwarded-note path / `AuthorizationRequestBlock` delivery channel).
  - **Target deployment:** the user's workspace (looked up from `networkUsers.workspaceUrl` or equivalent provisioned address).
  - **Artifact:** the `AuthorizationRequestBlock` body is fully self-contained — `request`, `draft`, `preview: ContentBlock[]` (carrying the visitor transcript), `requesterId` (visitor session id or anonymous marker), and `costLabel: null`. NO Network-tier-only row reference whose validation depends on Network DB lookup from inside the workspace.
  - **Audience:** the consuming workspace's inbox endpoint binds the block to its workspace user id; replay protection is the workspace's existing inbox idempotency on `authorizationId`.
  - The brief's review checklist asserts the visitor transcript is carried as `preview` (not as a Network-tier-only forwarded-note reference) so the user can open the inbox row and read the full transcript without a cross-deployment DB call.
- **Visitor transcript attached to every intro request.** When the Greeter emits `AuthorizationRequestBlock`, the entire visitor chat transcript is included as `preview: ContentBlock[]` — existing primitive supports this.
- **Anti-persona rules loaded into prompt context separately.** They never appear in the response; the Greeter uses them as filters at intro-decision time and at silent-deflect time. `kb_facts_public_and_on_request` and `anti_persona_rules` are distinct prompt-context chunks.
- **No self-introduction the way Charlie does it.** When asked "are you Tim?", the Greeter says "I'm Alex — Tim's representative." Strict identity inversion. No "I'm Alex on Tim's team" (suggests employment), no "I'm Alex helping Tim" is acceptable; the canonical form is "I'm {greeter} — {first}'s representative."
- **Migration journal:** Add `networkForwardedNotes` to `packages/core/src/db/network/schema.ts`; run `drizzle-kit generate` against the network config so a new `drizzle/network/0003_*.sql` lands AND a journal entry is added to `drizzle/network/meta/_journal.json` (Postgres journal — NOT the workspace SQLite journal at `drizzle/meta/_journal.json`). Per Insight-190, verify SQL file exists for every journal entry and idx values are sequential.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| AI-mediated profile pages | process-os `app/(app)/app/ask-charlie/` | pattern | System-prompt skeleton, 4-pill UX, no-auth chat — adapted with the critical inversion |
| REPRESENTATIVE-not-IMPERSONATOR system prompt | Original to Ditto (parent brief 254 Soul Move #5) | original | Inverts process-os's "you ARE Charlie" rule for a reputation-bearing public surface |
| Six-clause hard-rule structure | Original to Ditto (parent §Surface D + design rule #8) | original | Parallel-clause testable structure for the highest reputational-risk surface |
| Visitor rate-limiting per IP + fingerprint | process-os `app/api/ai/charlie/ask/route.ts:104-111` | pattern | Lifted directly |
| 4 dynamic quick-start pills | process-os `_components/charlie-quick-pills.tsx` | pattern | Adapted; pill text is dynamically generated from card + KB instead of hard-coded |
| `AuthorizationRequestBlock` for gated intro emission | Brief 248 | adopt | Existing primitive; `costLabel` field already present as stub |
| `NetworkProfileCardBlock` | Brief 256-shipped work | adopt | Existing primitive |
| Per-fact visibility filtering | Brief 258 (complete) | adopt | Existing helper reads `public | on-request | off` for prompt context assembly |
| Forwarded-note capture | Original to Ditto (parent brief 254 §Surface D + design rule #8) | original | Failure-mode-as-feature: when Greeter doesn't know, escalate to host |
| `<meta robots>` per `wantsVisibility` | Standard SEO pattern | pattern | Single-flag honored at SEO surface |
| Cross-deployment auth ownership contract | Insight-231 | adopt | Active insight — applies to every artifact crossing Network ↔ workspace |
| `stepRunId` guard | Insight-180 | adopt | Applies to `forward_note_to_user` (side-effecting tool) |
| Dual migration journal | Insight-190 | adopt | Postgres journal at `drizzle/network/meta/_journal.json` |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/people/[handle]/page.tsx` | Create: server component that fetches user by handle via `networkDb`, returns 404 if absent; renders the page if present, setting `<meta robots noindex, nofollow>` for `wantsVisibility=false`. |
| `packages/web/app/people/[handle]/profile-chat-client.tsx` | Create: client component with the Surface D layout (card on left, chat on right). Manages chat state, voice-mode toggle, rate-limit indicator, transcript-attached intro confirmation. |
| `packages/web/app/people/[handle]/quick-start-pills.tsx` | Create: 4 dynamic pills generated at server-side render from card + KB. Renders as inline pill buttons that prefill the chat input on click. |
| `packages/web/app/people/[handle]/voice-mode.tsx` | Create: v33 dark waveform card; reuses primitives from Brief 258's voice intake (different context: visitor → Greeter, not user → workspace). |
| `packages/web/app/api/v1/network/people/[handle]/chat/route.ts` | Create: POST endpoint for visitor chat messages. Resolves user by handle via `withNetworkDbAvailability`, applies rate-limit, loads KB facts + anti-persona, composes Greeter system prompt with the six-clause hard rules (visitor lane), streams response. Triggers tool calls for forwarded-note capture and gated intro emission. |
| `packages/web/app/api/v1/network/people/[handle]/intro-request/route.ts` | Create: POST endpoint that finalizes an intro request — emits the `AuthorizationRequestBlock` (with `preview` carrying the full visitor transcript and `costLabel: null`) to the user's workspace inbox via the existing Network → workspace bridge, returns the visitor-facing confirmation message. |
| `packages/web/middleware.ts` | Modify: add `/people` to `PUBLIC_MODE_PREFIXES` (line 68). |
| `src/engine/network-chat-prompt.ts` | Modify: extend `ChatContext` with `"visitor"` (line 683). Add the verbatim system prompt from parent §Surface D (lines 416-447) as a single template literal with the six hard-rule clauses. Add Greeter behavior for forwarded-note capture and gated intro emission. |
| `src/engine/network-chat-prompt.test.ts` | Modify: add six hard-rule tests (one prompt-and-assert per clause). Each test exercises `buildFrontDoorPrompt(..., context: "visitor")` and asserts on the rendered prompt structure + (where the assertion is behavioral not structural) a deterministic golden response from the test-mode LLM harness. |
| `src/engine/forward-note-to-user.ts` | Create: `forwardNoteToUser({ stepRunId, userId, fromVisitor, factQuestionMd })`. Persists to `networkForwardedNotes`; emits a cross-deployment notification into the user's workspace inbox via the same Network → workspace bridge used for `AuthorizationRequestBlock`. Refuses without `stepRunId` outside `DITTO_TEST_MODE` (Insight-180). |
| `src/engine/forward-note-to-user.test.ts` | Create: tests for `stepRunId` enforcement, persistence shape, cross-deployment inbox-drop. |
| `src/engine/visitor-rate-limit.ts` | Create: `checkVisitorRateLimit({ ip, fingerprint, sessionId }): Promise<{ ok: true } | { blocked: true; reason: string; retryAfterSec: number }>`. Grep first for existing rate-limit infra; otherwise a simple keyed counter (in-memory for v1, with a comment marking it for Redis upgrade if Network sees real traffic). |
| `src/engine/visitor-rate-limit.test.ts` | Create: tests for under-limit, over-limit, retry-after. |
| `src/engine/tool-resolver.ts` | Modify: register `forward_note_to_user` in `builtInTools`. The intro emission tool is a separate concern handled in the chat route directly. |
| `packages/core/src/db/network/schema.ts` | Modify: add `networkForwardedNotes` pgTable: `{ id (uuid), userId → networkUsers, fromVisitorName?, fromVisitorOrg?, factQuestionMd, visitorIp, visitorSessionId, createdAt, status: "pending" | "answered" | "dismissed" }`. Index on `userId`. |
| `drizzle/network/0003_create_network_forwarded_notes.sql` | Create via `drizzle-kit generate` against the network config. |
| `drizzle/network/meta/_journal.json` | Append the new entry (Insight-190: verify SQL file exists for every journal entry, idx values sequential). |

## User Experience

- **Jobs affected:** Orient (visitor sees who the user is), Decide (visitor decides whether to request an intro), Capture (forwarded notes — visitor asks something, Greeter captures for user), Represent (the Greeter speaks ABOUT the user, never AS).
- **Primitives involved:** `NetworkProfileCardBlock` (existing), `AuthorizationRequestBlock` (existing — `costLabel` stub present), conversation primitive (existing). `networkForwardedNotes` is a new minor primitive expressed as schema + tool, not as a content-block type.
- **Process-owner perspective:** Tim shares `ditto.partners/people/timhgreen` on LinkedIn. A visitor clicks. They see Tim's iconic card and Alex sitting alongside. They ask "what kind of work is Tim looking for?" — Alex answers grounded in Tim's KB. They ask "could Tim help with our Series B SDR org?" — Alex consults anti-persona, says (or doesn't say, depending) "Tim mentioned he's not chasing name-brand right now — but I can ask him directly if you want to follow up." They click "I'd like an intro." → Alex drafts, the visitor confirms, the visitor sees "I'll send this to Tim; if it lands, you'll hear back in a day or two." Tim opens his workspace inbox an hour later, sees a clean intro card with the visitor's name, org, the full transcript, and the existing Brief 248 [Approve] / [Edit] / [Decline] affordances.
- **Interaction states:** loading (Greeter thinking + KB context being assembled), success (response streaming), partial (per-fact citation visible — the Greeter mentions "Tim's open to operator-founder work" with provenance hover), error (rate-limited — polite copy + retryAfter), refused (Greeter declines an intro per anti-persona — short reason, never quoting the rule), forwarded-note (visitor asks something not in KB — Greeter says "they can speak to that — want me to ask {first_name}?" → on confirm, captures the note via `forward_note_to_user`).
- **Designer input:** Designer should be invoked for: the visitor-side Surface D layout (mobile chat full-screen + card chip), quick-start pills micro-typography, rate-limit copy, forwarded-note confirm UI, transcript-attached-to-intro-request preview composition. **Lightweight Architect-filled check if Designer not invoked:** the layout follows parent brief 254 §Surface D ASCII verbatim — card left, chat right, mobile collapses card to a top-right chip and chat becomes full-screen.

## Acceptance Criteria

1. [ ] `/people/[handle]` returns 404 for handles that don't exist; renders for handles that do (regardless of `wantsVisibility`). `<meta robots>` is `index, follow` for `wantsVisibility=true`, `noindex, nofollow` for `wantsVisibility=false`.
2. [ ] Page renders the `NetworkProfileCardBlock` (left on desktop, top on mobile) + Ask-Greeter chat (right on desktop, below on mobile) per parent §Surface D ASCII. Mobile rendering at 375px: chat full-screen, card collapsed to a top-right chip.
3. [ ] 4 quick-start pills are dynamically generated from the user's card + KB at server-render. Pills are clickable; clicking prefills the chat input. (Not the 4 hard-coded fixtures from process-os Charlie.)
4. [ ] System prompt encoded as a single source-of-truth template literal in `src/engine/network-chat-prompt.ts`, verbatim from parent §Surface D lines 416-447, with all six hard-rule clauses present and substitution variables documented inline.
5. [ ] **Hard-rule unit tests pass for all six clauses** in `src/engine/network-chat-prompt.test.ts`:
   - 5a. **Identity** — visitor "are you Tim?" → response third-person; asserts absence of first-person identity claim.
   - 5b. **No fabrication** — visitor asks for a fact NOT in KB → response "I don't know" or "they can speak to that"; asserts no invented specifics.
   - 5c. **No AI self-disclosure** — visitor "are you a chatbot?" → asserts no "AI", "chatbot", "language model" substring.
   - 5d. **Forwarded-note capture** — visitor "tell Tim X" → `networkForwardedNotes` row written AND response is third-person ("I'll pass that to {first_name}"); asserts NO first-person verbs ("I'll consider", "I appreciate", "I'll get back to you").
   - 5e. **Silent anti-persona** — KB anti-persona present; visitor matches it → response declines intro without quoting/paraphrasing/revealing the rule.
   - 5f. **Gated intro emission** — visitor "I'd like an intro" → `AuthorizationRequestBlock` emitted with `preview: ContentBlock[]` (transcript) + `costLabel: null`, NOT the intro itself.
6. [ ] Visitor rate-limiting enforced per IP + fingerprint. Suggested cap: 30 messages per session; 200 per IP per hour. Polite copy on hit ("you've sent a lot of messages — give {greeter_name} a minute"). Tested via `visitor-rate-limit.test.ts` for under-limit, over-limit, retry-after.
7. [ ] `forward_note_to_user(stepRunId, ...)` self-tool: refuses without `stepRunId` outside `DITTO_TEST_MODE` (Insight-180); persists `networkForwardedNotes` row; cross-deployment delivers notification to user's workspace inbox via the existing Network → workspace bridge. **Insight-180 silent-failure guard:** the tool name string registered in `src/engine/tool-resolver.ts` `builtInTools` MUST match the directive reference in the visitor-lane Greeter directive in `network-chat-prompt.ts`. Unit test asserts both name strings are equal.
8. [ ] Per-fact visibility honored: Greeter cites only `public | on-request` facts; `off` facts never appear in prompt context (filtered at assembly). For `on-request` facts, Greeter offers "they can speak to that — want me to ask {first_name}?" → on confirm, calls `forward_note_to_user`.
9. [ ] Intro request emits `AuthorizationRequestBlock` with:
   - `preview: ContentBlock[]` containing the full visitor transcript as a self-contained payload (NOT a Network-tier-only reference id).
   - `recipientLabel`: the user's display name.
   - `costLabel: null` (free-counter compute is downstream; the field already exists as `string | null`).
   - The block routes via the existing Network → workspace bridge to the user's workspace inbox; the workspace's Brief 248 handler renders it under the user's existing approve/reject/edit affordances.
10. [ ] **Cross-deployment auth contract honored (Insight-231):** the workspace-side inbox can render and act on the intro request using only the data carried in the `AuthorizationRequestBlock` body. No cross-deployment DB call from the workspace to the Network tier is required to display the transcript or the visitor's name/org. Verified by a workspace-side test that loads the block payload only and renders/approves successfully without any `networkDb` import.
11. [ ] Voice mode link present (v33 dark waveform card pattern, reusing primitives from Brief 258's voice intake). Voice mode is wired with the same provider used by Brief 258 (verify `landscape.md` evaluation is current; if not, flag for the Researcher before Build).
12. [ ] `ChatContext` extended with `"visitor"` in `src/engine/network-chat-prompt.ts` (sixth lane). Existing `"front-door" | "referred" | "review" | "expert" | "client"` paths unchanged; their tests still pass.
13. [ ] `/people` added to `PUBLIC_MODE_PREFIXES` in `packages/web/middleware.ts`. **No entry is needed in `WORKSPACE_MODE_BLOCKED_PREFIXES`** — workspace mode never includes `/people` in its allow-list, so the route is unreachable and returns 404 naturally via the authenticated-route catch path (which redirects unauthenticated visitors to `/login` and authenticated users hit the standard Next.js 404 since no page exists in workspace-mode routing). Verify with a test against `DITTO_DEPLOYMENT=workspace` that `/people/anything` returns a non-200 response.
14. [ ] `networkForwardedNotes` pgTable added to `packages/core/src/db/network/schema.ts`; `drizzle/network/0003_create_network_forwarded_notes.sql` exists; `drizzle/network/meta/_journal.json` has the new entry with sequential idx (Insight-190 dual-journal verification).
15. [ ] No premature work from downstream briefs: no `costLabel` computation (still `null`), no free-counter logic, no workspace-upsell-after-intro flow, no share modal, no OG renderer route, no PNG export. The intro request lands in user inbox; how it's processed for upsell is downstream.
16. [ ] `pnpm run type-check` passes; all six hard-rule tests pass; `forward-note-to-user.test.ts` passes; `visitor-rate-limit.test.ts` passes; existing `network-chat-prompt.test.ts` tests still pass.
17. [ ] Smoke test (below) executes end-to-end against a local public-mode deployment with a seeded test user.

## Review Process

1. Spawn review agent (fresh context) with `docs/architecture.md` + `docs/review-checklist.md` + this brief + parent brief 254 + Brief 248 + Brief 258 + Insights 180 / 190 / 231 / 043 (knowledge maintenance at point of contact) / 004 (brief sizing).
2. Review agent checks:
   - System prompt is verbatim with all six clauses (substring match on each clause text).
   - All six hard-rule unit tests are present, each asserts on the right thing, and the test file imports the visitor lane only — not regressing other lanes.
   - REPRESENTATIVE-not-IMPERSONATOR honored end-to-end — no first-person claim path exists in the rendered prompt or in any code path that constructs a Greeter response.
   - Visitor rate-limit tested end-to-end.
   - Per-fact visibility honored — `off` facts never appear in the prompt context; `on-request` facts trigger forwarded-note offer.
   - Anti-persona never quoted/paraphrased in response paths.
   - `forward_note_to_user` enforces `stepRunId` per Insight-180; tool name string match enforced by test.
   - `AuthorizationRequestBlock.preview` carries the visitor transcript as a self-contained payload (Insight-231 contract honored).
   - Workspace-side render of the inbox row does NOT require a Network-tier DB call.
   - Dual migration journal followed per Insight-190 (`drizzle/network/`, not `drizzle/`).
   - `/people` added to `PUBLIC_MODE_PREFIXES`.
   - No premature work from downstream free-counter / share / OG briefs.
   - Brief sizing within 17 ACs (Insight-004 cap respected).
3. Present sub-brief + review findings to human.

## Smoke Test

```bash
# Public-mode deployment with seeded test user
DITTO_DEPLOYMENT=public pnpm dev

# Confirm the new migration applies
pnpm drizzle-kit generate --config=drizzle.network.config.ts
pnpm drizzle-kit migrate --config=drizzle.network.config.ts

# Pre-seed: complete prior brief 256+258 smoke for a test user (handle: timhgreen).
# Set wantsVisibility=true. Seed at least 3 KB facts (one public, one on-request, one off).
# Seed one anti-persona rule (e.g., "Don't intro me to ICs at Series A startups").

# Visit /people/timhgreen as anonymous (incognito):
# 1. VERIFY: card renders on left/top, chat on right/below; persona-assigned Greeter introduces themselves: "Hi — I'm Alex. I help Tim think out loud about who he's hunting. Ask me about him — or tell me what you're up to."
# 2. VERIFY: 4 quick-start pills are present and dynamically populated.
# 3. Send "are you Tim?" — VERIFY: response is third-person ("I'm Alex — Tim's representative").
# 4. Send "are you a chatbot?" — VERIFY: response does NOT contain "AI", "chatbot", "language model".
# 5. Ask for the "off" fact — VERIFY: response does NOT cite it.
# 6. Ask for the "on-request" fact — VERIFY: response says "they can speak to that — want me to ask Tim?" with a confirm affordance.
# 7. Click confirm — VERIFY: networkForwardedNotes row exists; user's workspace inbox shows the forwarded note within {bridge latency}.
# 8. Send "tell Tim that Acme is hiring 10 SDRs" — VERIFY: forwarded note captured verbatim, response third-person ("I'll pass that to Tim").
# 9. Send "I'm an IC at a Series A startup, can I get an intro?" — VERIFY: Greeter declines, no anti-persona text appears in response.
# 10. Send "I'd like an intro to Tim" — VERIFY: AuthorizationRequestBlock emitted, draft visible, transcript attached as preview, costLabel is null, message says "I'll send this to Tim; if it lands, you'll hear back in a day or two."
# 11. Open Tim's workspace inbox — VERIFY: the AuthorizationRequestBlock row renders with the transcript preview WITHOUT any cross-deployment Network DB call (assert in test that workspace render path imports no networkDb).
# 12. Switch viewport to mobile (375px) — VERIFY: chat full-screen, card chip top-right.
# 13. Click "talk to {Greeter} (voice)" — VERIFY: v33 dark waveform card renders, voice mode connects.
# 14. Hammer the chat with 35 rapid messages — VERIFY: rate-limit hit at 30, polite copy shows.

# 404 case:
curl -i https://ditto.partners/people/nonexistent-handle
# VERIFY: 404 response.

# Indexing case:
# Set test user's wantsVisibility=false. Reload /people/timhgreen.
# VERIFY: page still renders, <meta name="robots" content="noindex, nofollow"> in <head>.

# Workspace-mode hard-404:
DITTO_DEPLOYMENT=workspace pnpm dev
curl -i http://localhost:3000/people/timhgreen
# VERIFY: 404 (or 200 only if explicitly desired — confirm middleware behavior).

# Tests:
pnpm run type-check
pnpm vitest run src/engine/network-chat-prompt.test.ts
pnpm vitest run src/engine/forward-note-to-user.test.ts
pnpm vitest run src/engine/visitor-rate-limit.test.ts
```

## After Completion

1. Update `docs/state.md` — sub-brief 259 complete; visitor profile-as-chat live, REPRESENTATIVE-not-IMPERSONATOR rule shipped + tested.
2. Update `docs/roadmap.md` — Phase 14 row for sub-brief 259 → complete.
3. Update `docs/architecture.md` — Layer 6 mention of `/people/[handle]` as a public surface; Layer 2 mention of Greeter-class persona contract (REPRESENTATIVE-not-IMPERSONATOR per parent 254 Soul Move #5).
4. **ADR draft owed:** "AI-on-profile is REPRESENTATIVE-not-IMPERSONATOR" — promote parent 254 Soul Move #5 + the six-clause structure to a proper ADR after this sub-brief ships. Likely slot: next free number in the low-50s. Grep state.md + adrs/ for reserved numbers before claiming.
5. **Insight authorship owed:** the REPRESENTATIVE-not-IMPERSONATOR principle ("mediated personas in reputation-bearing contexts must speak about, not as") deserves a standalone insight doc — promote from parent brief Soul Move #5 + this sub-brief's implementation experience.
6. Capture insight if the rate-limit + fingerprint pattern proves general — likely an insight worth promoting from the existing process-os adoption.
7. Move this brief to `docs/briefs/complete/`.

## Reference Docs Updated (during design)

- `docs/state.md` — to add Brief 259 design state + sub-brief 254 table reflects 259 design-ready.
- `docs/briefs/254-network-two-sided-conversational-front-door.md` — sub-brief table row for 259 updated from "design-pending" to "design-complete (brief 259)" with dependency arrow to 263 + 256 + 258 all complete.

## Reference Docs Checked (no drift found)

- `packages/core/src/db/network/schema.ts` — confirmed `networkUsers.handle`, `networkUserKbFacts.visibility`, `networkUserAntiPersona` are present.
- `packages/core/src/content-blocks.ts` — confirmed `NetworkProfileCardBlock` + `AuthorizationRequestBlock.costLabel?: string | null` already shipped.
- `src/db/network-db.ts` — confirmed `networkDb` proxy + `withNetworkDbAvailability` wrapper exist for use in the new API routes.
- `packages/web/middleware.ts` — confirmed `PUBLIC_MODE_PREFIXES` is the canonical extension point.
- `src/engine/network-chat-prompt.ts` — confirmed `ChatContext` is at line 683 and ready to extend.
- `drizzle/network/` — confirmed migrations 0000/0001/0002 present; next idx is 0003.
- `docs/insights/180`, `docs/insights/190`, `docs/insights/231` — all active and apply.
