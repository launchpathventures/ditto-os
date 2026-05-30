# Brief 288: Intro Consent State Machine + Decision Emails

**Date:** 2026-05-19
**Status:** draft
**Depends on:** Brief 276 (parent design); Brief 261; Brief 259; Briefs 282/283; Brief 275
**Unlocks:** Brief 289 (reply ingestion, follow-up, outcome); contributes to Brief 278 D-Q7 trust gates

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Two-sided consent state machine for Mira-proposed introductions; `IntroProposalCardBlock` as the canonical proposal-review surface; three decision emails (requester approval, recipient approval, warm intro thread); chat refinement surface; approval HTTP routes with strict `stepRunId` hygiene.

## Context

Sub-brief 1 of 2 split from Brief 276. The split seam is **consent gate vs. learning loop** (Insight-004 sizing). This brief lands the **skeleton** — the consent state machine, the proposal block, the three decision emails, and the chat surface — without yet handling natural-reply ingestion, post-intro follow-up, outcome capture, or feedback fan-out. Those land in Brief 289.

A buildable assertion of "two-sided consent" requires the schema, the proposal block, three send paths (`sendRequesterApprovalEmail`, `sendRecipientApprovalEmail`, `createIntroThread`), two state transitions per side, the chat-surface render, and the approval route. That is this brief.

## Objective

A Mira-proposed introduction can move from `proposed` to `thread-sent` only when (1) the requester explicitly approves via email or chat, then (2) the recipient explicitly approves via a separate email. The warm intro email thread is sent only after both approvals. Every state transition writes an audit row. The recipient-facing email and warm intro thread pass `network-privacy-scrubber.ts` before send. The chat surface renders the full proposal with the recipient preview ("here's what they'll see") as a load-bearing trust affordance.

## Non-Goals

- No natural-reply ingestion (Brief 289).
- No follow-up email or outcome capture (Brief 289).
- No feedback fan-out to Member Signal / Active Request (Brief 289).
- No new outbound email senders — uses existing `notifyUser` + `AgentMailAdapter`.
- No automatic retry of declined/not-now intros within this brief (the retry-in-30d note in the parent brief is a future scheduling concern).
- No native LinkedIn / DM / WhatsApp surfaces.

## Inputs

1. `docs/briefs/276-email-chat-consent-introductions.md` — parent design reference; canonical state machine, email model, side-effect matrix.
2. `docs/research/276-email-chat-consent-introductions-ux.md` — Designer's UX spec (drives email body, chat surface, interaction states).
3. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` — `introductions` table base; refusal triggers.
4. `docs/briefs/278-trust-privacy-admin-observability.md` — D-Q7 trust gates (two-sided consent, private-leakage scrub).
5. `docs/briefs/282-network-audit-scrubber-stoprun-substrate.md` — `network_audit_events` write contract.
6. `docs/briefs/283-network-source-policy-suppression-email-compliance.md` — `network-email-compliance.ts`, `network-suppression.ts`, `network-privacy-scrubber.ts`.
7. `packages/core/src/content-blocks.ts` — `ContentBlock` discriminated union; `AuthorizationRequestBlock`, `NetworkProfileCardBlock`, `JobRequestCardBlock` precedent.
8. `packages/core/src/db/network/schema.ts` — `introductions` table (line 1611), `IntroductionState` / `IntroductionOriginContext` enums (lines 207–227).
9. `src/engine/notify-user.ts`, `src/engine/channel.ts` — channel adapters and throttles.
10. `src/engine/emit-intro-request.ts` — existing intro-request emit; consult for naming and shape consistency.
11. `docs/insights/180-step-run-invocation-guard.md`, `docs/insights/232-http-wrapper-mints-step-runs.md`, `docs/insights/239-validate-input-shape-before-step-run.md`.

## Constraints

- **Engine-first.** `IntroProposalCardBlock` lands in `packages/core/src/content-blocks.ts` (the `@ditto/core` discriminated union); the renderer fallback also lives in `@ditto/core`. The Ditto product layer (`src/engine/`) imports from `@ditto/core`.
- **Schema additive.** Extend `IntroductionState` enum additively; extend `IntroductionOriginContext` additively with `mira-proposed`; extend the `introductions` table with new columns. Do NOT mutate existing column types or remove states.
- **Side-effecting functions require `stepRunId`** (Insight-180). HTTP wrappers mint step runs server-side and reject caller-supplied `stepRunId` including falsy values (Insight-232).
- **Every state transition writes one `network_audit_events` row** via the Brief 282 substrate (state, by-party, source-step-run-id, timestamp, payload-hash).
- **Recipient-facing surfaces pass `network-privacy-scrubber.ts`** before send. The recipient approval email and warm intro thread are both gated.
- **Outbound compliance applies** (Brief 283). Every send passes `network-email-compliance.ts` — sender identity, suppression hit, RFC 8058 List-Unsubscribe + List-Unsubscribe-Post, CAN-SPAM footer, misleading-subject check.
- **Body cap: <200 words per email** (D5 from parent).
- **Edit-draft field labelled "Notes for Ditto to consider"** (D11 from parent); send-time scrub via `network-privacy-scrubber.ts` rejects drafts that inject private-claim data.
- **No new email sender.** Use `notifyUser` + `AgentMailAdapter`.
- **No parallel state store.** All consent state lives on the `introductions` row.
- **Magic-link approval routes** honor Brief 283 limits (24h expiry, 5/email/hour, base64url tokens).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `AuthorizationRequestBlock` as consent gate | `packages/core/src/content-blocks.ts:286-312` (Brief 248 + 261) | adopt | Existing approval primitive. |
| `IntroProposalCardBlock` shape | `NetworkProfileCardBlock`, `JobRequestCardBlock` (same file) | pattern | Same domain-specific block precedent in the union. |
| Schema extension on `introductions` | `packages/core/src/db/network/schema.ts:1611` | adopt | One row per intro; additive columns avoid a parallel table. |
| Channel adapters | `src/engine/notify-user.ts`, `src/engine/channel.ts` | adopt | Single sender path; throttles already applied. |
| Email compliance / privacy scrub | Brief 283 (`network-email-compliance.ts`, `network-privacy-scrubber.ts`) | adopt | Single source of truth. |
| Audit-event write contract | Brief 282 | adopt | The audit substrate already exists. |
| Magic-link approval pattern | Brief 261, Brief 283 (claim-invite redemption) | adopt | Already proven for cross-deployment claim invites. |
| Consent state machine | Original to Ditto (validated against Designer spec) | original | No public-pattern documents this. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/content-blocks.ts` | Modify: add `IntroProposalCardBlock` interface; add to `ContentBlock` discriminated union; add renderer-fallback case. |
| `packages/core/src/content-blocks.test.ts` | Modify: add round-trip + renderer tests for `IntroProposalCardBlock`. |
| `packages/core/src/db/network/schema.ts` | Modify: extend `IntroductionState` with `proposed`, `requester-approved`, `recipient-asked`, `recipient-approved`, `thread-sent`, `declined`, `not-now`; extend `IntroductionOriginContext` with `mira-proposed`; extend `NetworkWorkspaceDeliveryKind` with `intro-proposal-card`; add columns to `introductions` (`requesterApprovedAt`, `recipientApprovedAt`, `threadSentAt`, `recipientUserId`, `recipientEmail`, `threadMessageId`, `declineCategory`, `followUpCadenceDays`, `recipientDeliveryId` nullable FK to `network_workspace_deliveries`, `requesterDeliveryId` nullable FK to `network_workspace_deliveries`). |
| `drizzle/network/{NEXT}_intro_consent_state_machine.sql` | Create: migration. Resequence idx per Insight-190. |
| `src/engine/intro-proposal.ts` | Create: builds `IntroProposalCardBlock` from Possible Connection / Watch Proposal source row; emits `proposed` state; mints requester-approval delivery. |
| `src/engine/intro-approval.ts` | Create: state-transition functions `recordRequesterApproval`, `recordRecipientApproval` (both `stepRunId`-guarded); composes downstream sends. |
| `src/engine/intro-email-thread.ts` | Create: `createIntroThread(stepRunId, introId)` — sends warm intro email via AgentMail thread; gated on both approvals + privacy scrub + compliance. |
| `src/engine/intro-email-templates.ts` | Create: three template builders (`renderRequesterApprovalEmail`, `renderRecipientApprovalEmail`, `renderWarmIntroThreadEmail`). All <200 words. |
| `src/engine/tool-resolver.ts` | Modify: register guarded intro facilitation tools (no untyped surface). |
| `packages/web/app/api/v1/network/intros/[id]/approve/route.ts` | Create: POST endpoint; mints wrapper step run server-side; rejects caller-supplied `stepRunId` including falsy values; handles both requester and recipient approvals via signed magic-link token. |
| `packages/web/app/api/v1/network/intros/[id]/approve/route.test.ts` | Create: route tests including bypass-rejection for all falsy `stepRunId` values. |
| `packages/web/app/network/intros/[id]/chat/page.tsx` | Create: chat refinement surface rendering `IntroProposalCardBlock` + recipient preview + state log. |
| `packages/web/components/network/intro-proposal-card.tsx` | Create: in-app/chat proposal review surface (renders `IntroProposalCardBlock`). |
| `src/engine/intro-proposal.test.ts`, `src/engine/intro-approval.test.ts`, `src/engine/intro-email-thread.test.ts` | Create: unit/integration tests. |

## User Experience

- **Jobs affected:** Decide (approve/decline/edit), Delegate (Mira proposes), Define (refine via edit-draft or chat).
- **Primitives involved:** `AuthorizationRequestBlock`, new `IntroProposalCardBlock`, `RecordBlock` (state log), email channel, chat surface.
- **Process-owner perspective:**
  - **Rob:** Email subject "Mira: intro to Priya?" → opens → 5-second scan → Approve. Receives the warm intro thread email next; that's the first thing Priya also sees.
  - **Lisa:** Opens email, hits the chat link, reviews the recipient preview ("here's exactly what Priya will see"), adds a note in "Notes for Ditto to consider", approves from chat.
  - **Jordan:** Opens chat, inspects evidence rows (each citing a `network_signal_sources` id), confirms "what stays private" is correct, approves.
- **Interaction states:**
  - **Requester approval email:** sent / opened / approved / edited+approved / declined / not-now / expired-after-7d.
  - **Recipient approval email:** sent / opened / approved / declined / not-relevant / more-context (opens chat) / expired-after-7d.
  - **Warm intro thread:** sent (both parties on thread) / send-failed (compliance reject or scrub reject — surfaces in admin).
  - **Chat refinement surface:** loading / full / edited / approved-from-chat / declined-from-chat.
- **Designer input:** `docs/research/276-email-chat-consent-introductions-ux.md` sections 3 (Decision-Email Anatomy), 4 (Chat Refinement Surface), 7 (Interaction States Per Surface), 9 (Process-Architecture Recommendations).

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper creator | Bypass assertion |
|----------------|-------------|-------------------|-----------------|------------------|
| `proposeIntroduction(stepRunId, sourceRow)` | Writes `proposed` row | Required | Possible Connection / Watch Proposal handler step | Missing guard writes nothing |
| `sendRequesterApprovalEmail(stepRunId, introId)` | Email send | Required; compliance/suppression first | `intro-proposal.ts` step | Missing guard sends no email |
| `recordRequesterApproval(stepRunId, introId, action, edit?)` | State write + audit | Required (server-minted only) | `/api/v1/network/intros/[id]/approve` | Caller `stepRunId` (including `null`/`""`/`0`/`false`) → 400, no write |
| `sendRecipientApprovalEmail(stepRunId, introId)` | Email send (privacy-scrubbed) | Required; compliance/suppression/source-policy first | `intro-approval.ts` step | Missing guard sends no email |
| `recordRecipientApproval(stepRunId, introId, action)` | State write + audit | Required (server-minted only) | `/api/v1/network/intros/[id]/approve` | Caller `stepRunId` → 400, no write |
| `createIntroThread(stepRunId, introId)` | Warm intro email to both parties | Required; both approvals + scrub + compliance | Approval route on recipient-approved | Missing guard sends no email; row stays at `recipient-approved` |
| `/api/v1/network/intros/[id]/approve` POST | Wrapper for either approval | Wrapper minted server-side | Route handler | Rejects caller `stepRunId` (all falsy variants) |

## Acceptance Criteria

1. [ ] `IntroProposalCardBlock` is added to the `ContentBlock` discriminated union in `packages/core/src/content-blocks.ts` with fields: `type: "intro-proposal-card"`, `state` (8-value enum matching the canonical state machine), `introId`, `header`, `whyThisFits`, `whyNow`, `evidence` (array of `{label, sourceId, kind}`), `risks` (array of strings or null), `recipientPreview` (the `AuthorizationRequestBlock` showing exactly what the recipient will see), `whatStaysPrivate` (array of strings), `costLabel` (string or null), `confidence` (0–1 number), `affordances` (array of `"approve" | "decline" | "not-now" | "edit-draft" | "open-chat"`).
2. [ ] `IntroProposalCardBlock` has renderer-fallback support and a passing round-trip test in `packages/core/src/content-blocks.test.ts`.
3. [ ] `IntroductionState` enum is extended additively with `proposed`, `requester-approved`, `recipient-asked`, `recipient-approved`, `thread-sent`, `declined`, `not-now`. Existing Brief 261 inbound states (`queued`, `approved`, `rejected`, `fulfilled`, etc.) are unchanged.
4. [ ] `IntroductionOriginContext` is extended with `mira-proposed`. Existing `client`, `visitor`, `expert-crossover` are unchanged.
5. [ ] `introductions` table has new columns: `requesterApprovedAt`, `recipientApprovedAt`, `threadSentAt`, `recipientUserId` (nullable FK to `networkUsers`), `recipientEmail` (nullable text), `threadMessageId` (nullable text — AgentMail thread id), `declineCategory` (nullable text), `followUpCadenceDays` (integer, default 14), `recipientDeliveryId` (nullable FK to `network_workspace_deliveries`), `requesterDeliveryId` (nullable FK to `network_workspace_deliveries`). `NetworkWorkspaceDeliveryKind` enum extended with `intro-proposal-card`.
6. [ ] Drizzle migration generates successfully; the journal idx is unique and resequenced per Insight-190; the SQL file exists alongside the journal entry.
7. [ ] `proposeIntroduction(stepRunId, ...)` writes a row in state `proposed`, populates `IntroProposalCardBlock` in `transcript`, requires `stepRunId`, and refuses without one outside `DITTO_TEST_MODE`.
8. [ ] `recordRequesterApproval` transitions the row to `requester-approved` (or `declined` / `not-now`), writes one `network_audit_events` row tagged with `by-party=requester`, and triggers `sendRecipientApprovalEmail` only on approve.
9. [ ] `recordRecipientApproval` transitions the row to `recipient-approved` (or `declined` / `not-now`), writes one `network_audit_events` row tagged with `by-party=recipient`, and triggers `createIntroThread` only on approve.
10. [ ] `createIntroThread(stepRunId, introId)` refuses without `stepRunId` outside `DITTO_TEST_MODE`; refuses unless both `requesterApprovedAt` AND `recipientApprovedAt` are non-null; calls `network-privacy-scrubber.ts` and `network-email-compliance.ts` before send; on success writes `threadSentAt` and transitions state to `thread-sent`; the AgentMail thread is created with both parties on the To: line; the message has List-Unsubscribe headers with the purpose-specific opt-out (D4) instead of the generic Network unsubscribe.
11. [ ] The recipient approval email passes `network-privacy-scrubber.ts`: vitest covers a "leak attempt" payload (private claim, anti-persona, hidden field) and asserts the scrubber strips it before send. `NetworkProfileCardBlock.antiPersonaMd` is `null` on every non-owner render path used by the recipient email and warm intro thread.
12. [ ] Email body length (rendered) for all three templates is <200 words per email; vitest enforces this as a regression test.
13. [ ] `POST /api/v1/network/intros/[id]/approve` mints a wrapper step run server-side, rejects any caller-supplied `stepRunId` field (including `null`, `""`, `0`, `false`) with HTTP 400 and no state write; verifies the magic-link token before reading the intro row; honors the 24h expiry and 5-per-email-per-hour limit. **Validate-before-mint (Insight-239):** the route validates the `action` field against the allowed set (`approve` / `decline` / `not-now` / `edit-and-approve`) **before** calling `createNetworkLaneStepRun`; a malformed `action` returns HTTP 400 with no wrapper-run row written.
14. [ ] The chat refinement surface at `/network/intros/[id]/chat`: renders the `IntroProposalCardBlock`, the recipient preview, the state log (composed from `RecordBlock` rows, no new block type per D2), prior feedback if any, and an editable "Notes for Ditto to consider" field; the edit field's submit calls the same approval route with the draft attached.
15. [ ] `tool-resolver.ts` registers `proposeIntroduction`, `sendRequesterApprovalEmail`, `recordRequesterApproval`, `sendRecipientApprovalEmail`, `recordRecipientApproval`, `createIntroThread` — every name has a matching resolver entry (no YAML silent-failure per Insight-180).
16. [ ] **Cross-deployment delivery — sender-side persistence (Insight-234):** when the recipient is a Ditto member (`recipientUserId` is non-null), `proposeIntroduction` and `recordRequesterApproval` both write a `network_workspace_deliveries` row with `kind="intro-proposal-card"`, `userId=recipientUserId` (and a sibling row with `userId=requesterUserId` for the requester-side proposal card). The delivery row's `blocks` field contains the `IntroProposalCardBlock`; `dedupeKey` is `intro:{introId}:recipient` / `intro:{introId}:requester`; `sourceStepRunId` is the minting wrapper run. `introductions.recipientDeliveryId` and `introductions.requesterDeliveryId` are populated.
17. [ ] **Cross-deployment delivery — consumer-side local import (Insight-234):** the workspace's pull-and-ack loop imports the `intro-proposal-card` delivery into a local `activities` (or equivalent) row before rendering. The local row owns the rendering and approval action; workspace surfaces do not require a live Network DB read to render or approve. The pull-and-ack handler is idempotent: an already-imported `dedupeKey` still ACKs (sets `status=imported`, `importedAt`) instead of erroring or re-importing.
18. [ ] **Cross-deployment delivery — terminal-state persistence (Insight-234):** when a workspace user approves/declines from their in-workspace `intro-proposal-card`, the terminal state (`recipient-approved` / `declined` / `not-now`) is persisted in the imported local row **and** propagated back to `network.introductions` via the existing wrapper-run write path. Reloading the workspace surface after approval shows the terminal state from the local row (no Network round-trip required); a subsequent re-pull of the delivery does not regress the terminal state.
19. [ ] Tests cover: two-sided approval happy path, no-thread-before-recipient-approved invariant, private-scrub leak attempt, email compliance/suppression hit, caller-`stepRunId` rejection for all falsy values, malformed `action` rejected pre-mint (Insight-239), magic-link expiry, state-transition audit-row uniqueness, edit-draft injection refusal, **cross-deployment delivery durability** (sender writes delivery row, idempotent re-ACK, terminal-state persists across reload and re-pull).

## Review Process

1. Spawn review agent with: this brief, Brief 276 (parent), Brief 261, Brief 278, Brief 282, Brief 283, Designer spec, `docs/architecture.md`, `docs/review-checklist.md`.
2. Review agent verifies:
   - Engine-first compliance for `IntroProposalCardBlock`
   - Side-effect guard matrix is complete and tested (Insight-180/232)
   - Privacy-scrub coverage matches Brief 278 D-Q7 checklist item #21
   - Two-sided consent invariant matches checklist item #23
   - Outbound compliance matches checklist item #25
   - Audit-substrate write contract is honored (one row per transition, no silent failures)
   - Schema migration is idx-correct (Insight-190)
   - No backwards-incompatible enum mutation
3. Present findings to human alongside the brief.

## Smoke Test

```bash
pnpm vitest run packages/core/src/content-blocks.test.ts
pnpm vitest run src/engine/intro-proposal.test.ts src/engine/intro-approval.test.ts src/engine/intro-email-thread.test.ts
pnpm vitest run packages/web/app/api/v1/network/intros/[id]/approve/route.test.ts
pnpm run type-check

# Manual in test mode (DITTO_TEST_MODE=1):
# 1. Seed an Active Request + a Possible Connection (Brief 275 fixture).
# 2. proposeIntroduction → verify introductions row in state=proposed with IntroProposalCardBlock in transcript.
# 3. Verify requester approval email payload (subject, body <200 words, magic-link URL, compliance headers).
# 4. POST to /api/v1/network/intros/[id]/approve with caller stepRunId="" → expect HTTP 400, no state change.
# 5. POST to /api/v1/network/intros/[id]/approve with a valid magic-link token (no caller stepRunId) → row to requester-approved.
# 6. Verify recipient approval email payload (privacy-scrubbed, sender = mira@workspace, compliance headers).
# 7. POST recipient approval → row to recipient-approved.
# 8. createIntroThread fires → AgentMail thread created with both parties, threadMessageId persisted, state=thread-sent.
# 9. Inspect network_audit_events: exactly one row per state transition, tagged with the source step run id.
# 10. Attempt a recipient approval email with an injected private-claim payload → scrubber rejects, audit row written.
```

## After Completion

1. Update `docs/state.md`: brief 288 complete, IntroProposalCardBlock live in `@ditto/core`, consent state machine ready for reply ingestion (Brief 289).
2. Update `docs/roadmap.md` row 276 status to "skeleton (288) complete; flesh (289) next".
3. If `IntroProposalCardBlock` exposes any field that wasn't anticipated by Designer spec, flag it in `docs/research/276-email-chat-consent-introductions-ux.md` for Designer revisit.
4. Brief 289 becomes buildable.
5. Phase retrospective: did the recipient-preview affordance survive contact with real recipients in test mode? Did the audit substrate catch a missed transition?
