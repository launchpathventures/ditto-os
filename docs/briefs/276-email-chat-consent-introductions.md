# Brief 276: Email, Chat, Consent, and Introduction Facilitation — Parent Design

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Brief 275; Brief 261; Brief 259; Briefs 098b/099a-c; Briefs 282/283
**Unlocks:** Brief 278 (D-Q7 consent gates) — directly via sub-briefs 288 + 289
**Split into:** [Brief 288](./288-intro-consent-state-machine-and-decision-emails.md), [Brief 289](./289-intro-reply-ingestion-followup-outcome.md)

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Define how Ditto communicates with users through email and chat, obtains consent from both sides, facilitates off-platform introductions, and captures post-intro outcome feedback.

## Context

The product should not rely on users sitting inside the app. Ditto's superconnector behavior works best when the user receives a concise email decision, can reply naturally, and can open chat only when they want context or refinement. Once an introduction is approved by both sides, v1 facilitates off-platform via an email thread; Ditto stewards the intro and learns from the outcome rather than disappearing after sending.

This is the **parent design reference**. After Designer review (`docs/research/276-email-chat-consent-introductions-ux.md`), the work split into two sub-briefs because the combined surface exceeded one focused build cycle (Insight-004: >17 ACs, >3 subsystems). The split seam is **consent gate vs. learning loop**:

- **Brief 288** — the consent state machine, `IntroProposalCardBlock`, the three decision emails (requester approval, recipient approval, warm intro thread), the chat refinement surface. **Skeleton.**
- **Brief 289** — natural-reply ingestion, the follow-up email and outcome capture, feedback fan-out to Member Signal / Active Request. **Flesh.**

288 must land before 289; 289 strictly extends what 288 produced (no rework of 288 artifacts).

## Objective

Every proposed introduction flows through a two-sided consent path. Ditto emails concise decisions, links to chat for context, accepts natural email replies as feedback, creates an off-platform warm intro email only after consent, and follows up separately with both parties to learn whether the connection was useful — feeding outcome data into the Member Signal / Active Request loop and the future paid-successful-outcome pricing surface.

## Non-Goals

- No native LinkedIn / X / Instagram / WhatsApp DM sending.
- No calendar scheduling automation beyond optional calendar links if already attached to a proposal.
- No payment changes (paid-successful-outcome consumes the outcome data, but is not implemented here).
- No auto-intro without both sides approving.
- No CRM integration beyond what network primitives already record.
- No AI impersonation of either party.
- No outbound LinkedIn scraping or session automation (Brief 278 source-policy gate applies).

## Inputs

1. `docs/research/276-email-chat-consent-introductions-ux.md` — Designer's interaction spec (16 sections). Drives the User Experience section.
2. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` — introductions primitive and refusal triggers; the table being extended.
3. `docs/briefs/275-background-watch-network-health.md` — watch proposals and Possible Connection surfaces feeding the proposal queue.
4. `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` — representative posture and cross-deployment delivery.
5. `docs/briefs/278-trust-privacy-admin-observability.md` — D-Q7 trust gates: two-sided consent, private-leakage scrub, outbound compliance.
6. `docs/briefs/282-network-audit-scrubber-stoprun-substrate.md` — audit substrate that records every state transition.
7. `docs/briefs/283-network-source-policy-suppression-email-compliance.md` — `network-email-compliance.ts`, `network-suppression.ts`, `network-privacy-scrubber.ts` — the compliance gates every send must pass.
8. `docs/architecture.md` §Network channel routing, §Alex/Mira posture, §Network front door.
9. `src/engine/notify-user.ts` — channel-aware outbound delivery; `MAX_EMAILS_PER_USER_PER_DAY=5`, `MIN_MS_BETWEEN_NOTIFICATIONS=1h`.
10. `src/engine/inbound-email.ts` — reply ingestion, `classifyReply` 6-category keyword classifier.
11. `src/engine/channel.ts` — `AgentMailAdapter`, `headers` pass-through for RFC 8058.
12. `packages/core/src/content-blocks.ts` — `AuthorizationRequestBlock` (lines 286-312), domain-specific block precedents (`NetworkProfileCardBlock`, `JobRequestCardBlock`).
13. `packages/core/src/db/network/schema.ts` — `introductions` table (line 1611), `IntroductionState` / `IntroductionOriginContext` enums (lines 207-227).
14. `docs/insights/180-step-run-invocation-guard.md`, `docs/insights/232-http-wrapper-mints-step-runs.md`, `docs/insights/234-cross-deployment-inbox-delivery-needs-durable-pull-ack.md`, `docs/insights/238-curate-is-the-seventh-human-job.md`, `docs/insights/239-validate-input-shape-before-step-run.md`.

## Constraints

- **Email is for durable decisions.** Each email has one clear reason and one primary action.
- **Chat is for context and refinement.** Every decision email links to a chat surface with full proposal context.
- **Natural replies count.** Email replies like "too junior, more commercial" must be parsed as structured feedback.
- **Both sides approve before intro.** Requester approves asking; recipient approves being introduced.
- **No cold off-platform thread.** Email thread with both parties is created only after `recipient-approved`.
- **Intro copy must be representative, not impersonating.** Edit-field labels and send-time scrubs preserve this posture.
- **Every intro has a record.** All proposal, approval, send, reply, and feedback states persist on the `introductions` row or in `network_intro_feedback`.
- **No private leakage.** Intro email contains only approved/shareable context; `network-privacy-scrubber.ts` runs before every external send.
- **Use existing channel adapters and `notifyUser`; no parallel email sender.**
- **Side-effecting send tools require `stepRunId`** (Insight-180).
- **HTTP wrappers mint step runs** (Insight-232). Approval/feedback/send routes reject caller-supplied `stepRunId`, **including falsy values** (`null`, `""`, `0`, `false`), and create wrapper step runs server-side.
- **Outbound email compliance applies** (Brief 283). Every send — requester approval, recipient approval, warm intro thread, follow-up — passes sender identity, suppression, opt-out, and misleading-copy checks.
- **Outcome feedback matters.** Follow-up records whether the connection created professional/economic value, not just whether the email was sent. The outcome enum is shared with the future paid-successful-outcome surface (Brief 270).
- **Engine-first.** New `ContentBlock` types (`IntroProposalCardBlock`) land in `packages/core/src/content-blocks.ts` first; the discriminated union and renderer fallback live in `@ditto/core`.
- **State transition audit.** Every state transition writes to `network_audit_events` via the Brief 282 substrate.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `AuthorizationRequestBlock` as consent gate | Brief 248 + 261, `packages/core/src/content-blocks.ts:286-312` | adopt | Existing approval primitive is the consent gate. |
| Domain-specific block precedent (`IntroProposalCardBlock`) | `NetworkProfileCardBlock`, `JobRequestCardBlock` in `packages/core/src/content-blocks.ts` | adopt | Network already adds domain blocks to the union; intro proposals deserve the same first-class treatment. |
| Network-to-workspace delivery | Brief 259 + Insight-234 | adopt | Durable delivery pattern already exists. |
| Channel routing and throttles | Briefs 098b/099a-c, `src/engine/notify-user.ts` | adopt | Existing email/workspace resolution and per-user throttles. |
| Reply classifier seed | `src/engine/inbound-email.ts:classifyReply` | adopt | 6-category keyword classifier exists; we extend it. |
| Email compliance | Brief 283, `network-email-compliance.ts`, `network-suppression.ts` | adopt | Single source of truth for compliance — never duplicated. |
| Off-platform warm intro email | Original to Ditto | original | The simplest high-trust v1 fulfillment path. |
| Natural reply as feedback | Ditto feedback principle ("edits are feedback") | adopt | Replies are feedback too. |
| Outcome feedback for future pricing | Brief 119 + Brief 270 | adopt/original | Successful connection data is required before later paid-successful-outcome pricing. |
| Two-sided consent state machine | Original to Ditto, validated against Designer's UX spec | original | No public-pattern product documents this in detail; the design is original. |

## Architectural Decisions (this brief)

| # | Decision | Rationale | Lands in |
|---|----------|-----------|----------|
| D1 | Add `IntroProposalCardBlock` to the `ContentBlock` union in `@ditto/core` with explicit fields (state, introId, header, whyThisFits, whyNow, evidence[], risks, recipientPreview, whatStaysPrivate, costLabel, confidence, affordances) | Domain-specific block matches `NetworkProfileCardBlock` / `JobRequestCardBlock` precedent; gives renderers, audit substrate, and scrubbers a stable type to dispatch on; addresses Reviewer Flag 1 | 288 |
| D2 | `IntroStateLog` composes from `RecordBlock` rows; no new block type | A new block type would be premature abstraction (Insight-004); `RecordBlock` already handles state-transition logs elsewhere; addresses Reviewer Flag 2 | 288 |
| D3 | Recipient follow-up sender = same workspace sender as warm intro thread (`mira@{workspaceHandle}.ditto.partners`) | Continuity: recipient already saw this sender on the warm intro; reusing preserves trust and reduces suppression-list ambiguity | 289 |
| D4 | Warm intro thread classified as `1:1-intro` in `network-email-compliance.ts`, receiving a purpose-specific opt-out ("don't introduce me to this kind of person again") instead of generic List-Unsubscribe | A unified unsubscribe would suppress all future warm intros; the opt-out must be category-scoped | 288 |
| D5 | Email body cap: **<200 words per email**; single primary action; chat link for everything secondary | Email is durable-decision surface, not narrative; mobile-first; Rob's 5-second decision window | 288, 289 |
| D6 | Every state transition writes to `network_audit_events` (Brief 282 substrate) — state, by, at, source step run | Auditability for Brief 278 D-Q7 trust gates and admin reveal flows | 288, 289 |
| D7 | Reply classifier v1: keyword-first (extends existing `classifyReply`); ambiguous replies fall back to chat with a chat-rendered "Did you mean X or Y?" disambiguator; no LLM call in the inbound hot path | LLMs cost tokens and add latency; keyword coverage is sufficient for the 9 categories in the Designer spec; cheaper-tool-first principle | 289 |
| D8 | Recipient-approval send uses workspace sender (`mira@{workspaceHandle}.ditto.partners`) — not Network sender — when the requester is a Ditto workspace user; Brief 283 `network-email-compliance.ts` must accept this sender identity | The recipient's first signal of the workspace's existence is the email From: line; misattributing to Network breaks the warm-intro continuity in D3 | 288 |
| D9 | Follow-up default cadence = **14 days** after `thread-sent`; user-configurable per intro at approval time | Most outcomes resolve in 2 weeks; configurable handles long-cycle intros (advisory, funding) | 289 |
| D10 | Reply taxonomy: 6 categories on approval emails + 3 outcome categories on follow-ups + 1 ambiguous class | Matches Designer's spec; 9 explicit + 1 fallback is the smallest set that supports the feedback fan-out | 289 |
| D11 | Edit-draft field on requester-approval surface labelled "Notes for Ditto to consider" (not "your message to recipient"); send-time scrub via `network-privacy-scrubber.ts` rejects any draft that injects private claim data | Preserves representative posture (not impersonation); the user is briefing Ditto, not authoring the recipient email | 288 |

**Schema impact:** Extend the existing `introductions` table (Brief 261) rather than create siblings. Add columns: `requesterApprovedAt`, `recipientApprovedAt`, `threadSentAt`, `feedbackRequestedAt`, `feedbackCollectedAt`, `declineCategory`, `recipientUserId` (nullable; null for non-Ditto recipients), `recipientEmail` (nullable; populated for non-Ditto recipients), `threadMessageId` (AgentMail thread id), `followUpCadenceDays` (default 14), `lastClassifiedReplyAt`. Extend `IntroductionState` enum additively with new values: `proposed`, `requester-approved`, `recipient-asked`, `recipient-approved`, `thread-sent`, `declined`, `not-now`, `feedback-collected`. Existing values (`queued`, `approved`, `rejected`, `fulfilled`, etc.) remain for backward compat with Brief 261's inbound flow. Add a new `originContext` value `mira-proposed` for Possible Connection / Watch Proposal-driven outbound intros. **One new table**: `network_intro_feedback` (append-only feedback events; lives in 289).

## What Changes (Work Products)

Detailed work products live in the sub-briefs:

- **[Brief 288](./288-intro-consent-state-machine-and-decision-emails.md)** — schema extension, `IntroProposalCardBlock` in `@ditto/core`, `intro-proposal.ts`, `intro-approval.ts`, `intro-email-thread.ts`, three email templates (requester approval, recipient approval, warm intro thread), `/api/v1/network/intros/[id]/approve`, chat refinement surface, recipient-side magic-link approval route.
- **[Brief 289](./289-intro-reply-ingestion-followup-outcome.md)** — `network_intro_feedback` table, `intro-feedback.ts`, follow-up email template (Email Type 4), `/api/v1/network/intros/[id]/feedback`, extended `classifyReply` reply taxonomy (intro-context categories), outcome capture and feedback fan-out to Member Signal / Active Request / search preferences, outcome aggregate metric writes for future paid-successful-outcome surface.

## User Experience

- **Jobs affected:** Decide (approve/decline/edit), Delegate (Mira proposes and asks before contacting), Define (refine the search via reply or chat), Review (post-intro outcome), Capture (natural-reply replies as feedback), Curate (recipient's "don't introduce me to this kind of person" opt-out — Insight-238 7th human job).
- **Primitives involved:** `AuthorizationRequestBlock` (consent gate), new `IntroProposalCardBlock` (proposal review surface in chat and inbox blocks), `RecordBlock` (state log), existing channel adapters (email), existing chat surface.
- **Process-owner perspective (from Designer spec):**
  - **Rob (mobile, on jobsite, 5-second decision):** Sees one email subject ("Mira: intro to Priya?"), opens, hits Approve. Reads the warm-intro thread later when he's near a computer. Follow-up 14 days later asks "did this work?" — one tap.
  - **Lisa (asks questions):** Replies "too junior — looking for someone who's run a Series A" instead of clicking. Reply is classified as `decline:too-junior` + a refine signal that updates her Active Request.
  - **Jordan (wants to inspect state machine):** Opens the chat link, sees the full proposal: why this person, evidence, what stays private, the recipient preview (exactly what Priya will see). Edits the "Notes for Ditto to consider" field, approves.
  - **Nadia (team manager):** Doesn't see individual intros; sees aggregate "8 intros made this quarter, 3 resulted in advisory engagements, 1 in client work, 4 no-reply" on the team dashboard.
- **Interaction states (per surface):**
  - **Requester approval email:** sent, opened (tracked via List-Unsubscribe-Post receipt), approved, edited+approved, declined, not-now, no-action-after-7d (auto-expire to `not-now`).
  - **Recipient approval email:** sent, opened, approved, declined, not-relevant, more-context (opens chat), no-action-after-7d.
  - **Warm intro thread:** sent, reply-detected, no-reply-after-14d-triggers-followup.
  - **Follow-up email:** sent, useful, not-useful, no-outcome-yet, outcome-category-reported.
  - **Chat refinement surface:** loading (proposal materializing), full (proposal rendered), edited (draft updated), approved-from-chat, declined-from-chat.
- **Designer input:** `docs/research/276-email-chat-consent-introductions-ux.md` — the full UX spec drives the User Experience sections in both sub-briefs.

## Consent State Machine (canonical reference)

The outbound (Mira-proposed) flow:

```
proposed
   │ (requester reviews via email or chat)
   ├── requester-approved ──► recipient-asked
   │                              │ (recipient reviews)
   │                              ├── recipient-approved ──► thread-sent ──► (14d) ──► feedback-requested ──► feedback-collected
   │                              ├── declined (recipient)
   │                              └── not-now (recipient; retry in 30d)
   ├── declined (requester)
   └── not-now (requester; retry in 30d)
```

**Invariants:**
- No state transition may skip requester approval or recipient approval.
- The warm intro thread cannot include both parties until state `recipient-approved`.
- Each transition is gated on `stepRunId` and writes one `network_audit_events` row.
- Declines and not-nows capture a `declineCategory` (from the 6-category reply taxonomy) and a free-text reason if present.
- `feedback-collected` is the terminal state for the outbound flow; the row may then participate in Member Signal / Active Request feedback fan-out (Brief 289).

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write/no-send assertion |
|----------------|-------------|-------------------|--------------------------|--------------------------------|
| `proposeIntroduction(stepRunId, ...)` | Writes `proposed` row; no external send | Required | Internal step (Possible Connection / Watch Proposal handler) creates wrapper | Missing guard writes nothing |
| `sendRequesterApprovalEmail(stepRunId, ...)` | Sends email to requester | Required; compliance/suppression check first | `intro-proposal.ts` step | Missing guard sends no email |
| `recordRequesterApproval(stepRunId, introId, action)` | Writes state transition `requester-approved` / `declined` / `not-now`; audit row | Required (server wrapper run only) | `/api/v1/network/intros/[id]/approve` mints | Caller `stepRunId` including falsy values rejected; no state write |
| `sendRecipientApprovalEmail(stepRunId, ...)` | Sends email to recipient | Required; compliance/suppression/source-policy check first | `intro-approval.ts` step | Missing guard sends no email |
| `recordRecipientApproval(stepRunId, introId, action)` | Writes state transition `recipient-approved` / `declined` / `not-now`; audit row | Required (server wrapper run only) | `/api/v1/network/intros/[id]/approve` mints | Caller `stepRunId` including falsy values rejected; no state write |
| `createIntroThread(stepRunId, introId)` | Sends warm intro email to both parties via AgentMail thread | Required; both approvals must be present; private-leakage scrub; compliance check | Approval route mints upon recipient approval | Missing guard sends no email; thread row not created |
| `sendFollowUpEmail(stepRunId, introId, party)` (Brief 289) | Sends separate follow-up to each party | Required; suppression/throttle pass | Scheduled process step mints | Missing guard sends no follow-up |
| `recordIntroFeedback(stepRunId, introId, party, payload)` (Brief 289) | Writes `network_intro_feedback` row; updates `introductions.state`; fans out to Member Signal / Active Request | Required (server wrapper run only) | `/api/v1/network/intros/[id]/feedback` mints | Caller `stepRunId` rejected; no feedback or fan-out |
| Inbound email reply on approval/follow-up threads | Feedback/state write | Inbound-email handler creates wrapper run; thread-id and message-id authenticated against `introductions.threadMessageId` | Inbound handler | Ambiguous/spoofed replies route to chat for human disambiguation; no automatic state write |
| `/api/v1/network/intros/[id]/approve` | Approval state write + downstream sends | Wrapper mints server-side | Route handler | Caller `stepRunId` including `null`, `""`, `0`, `false` rejected with 400 |
| `/api/v1/network/intros/[id]/feedback` | Feedback row write + fan-out | Wrapper mints server-side | Route handler | Caller `stepRunId` rejected; no row written |

## Email Model

### Decision email anatomy (all four types)

- Subject: short, specific. Never misleading (Brief 283 misleading-subject check).
- First line: why Ditto is emailing.
- Context: 2–4 bullets max.
- Primary action: one button (approve / decline / open-chat / yes-it-was-useful).
- Secondary: reply naturally — the email explicitly states "you can just reply".
- Link: magic link to chat context (24h expiry, 5/email/hour per Brief 283).
- Footer: List-Unsubscribe (mailto + https), List-Unsubscribe-Post header (RFC 8058), purpose-specific opt-out for warm intros (D4), CAN-SPAM physical address.
- **Body cap: <200 words** (D5).

### Email types

1. **Requester approval** — "Ditto found someone who may fit your request." Actions: ask if open / not this person / refine. Sender: `mira@{workspaceHandle}.ditto.partners`. Owned by Brief 288.
2. **Recipient approval** — "Someone is looking for X. This may be relevant to you." Actions: yes intro me / not now / not relevant / more context. Sender: same workspace sender (D8) for continuity. Includes only approved-shareable context (privacy scrub). Owned by Brief 288.
3. **Warm intro thread** — Sent only after both approve. Both parties on the thread. Sender: same workspace sender (D8). Includes why Ditto made the intro, approved context, suggested next step. Classified as `1:1-intro` for opt-out purposes (D4). Owned by Brief 288.
4. **Follow-up** — Sent separately to each party at `followUpCadenceDays` (default 14, D9). Single primary action ("Was the intro useful?" with 3 buttons: useful / not useful / no outcome yet); secondary actions in chat. Owned by Brief 289.

## Chat Model

The chat refinement surface (linked from every decision email) shows:

- Full proposal rationale (`whyThisFits`, `whyNow`)
- Evidence and sources (each cited via `network_signal_sources` row id per Brief 278 D-Q7)
- Private/public context boundaries — explicit "what stays private" callout
- Recipient preview (`AuthorizationRequestBlock.preview` — exactly what the recipient will see)
- Edit draft (the "Notes for Ditto to consider" field — D11 label)
- Reason for uncertainty (if `confidence < 0.7`)
- Prior feedback (linked to `network_intro_feedback` rows from past intros to this recipient)
- Watch / Active Request context (the originating Possible Connection or Watch Proposal)
- State-transition log (composed from `RecordBlock` rows per D2)
- "Ask me before anyone is contacted" affordance (always visible in `proposed` state)

## Acceptance Criteria

This parent brief has no acceptance criteria of its own. All ACs live in the sub-briefs:

- **[Brief 288 — Consent + Decision Emails](./288-intro-consent-state-machine-and-decision-emails.md):** 16 ACs covering schema extension, `IntroProposalCardBlock`, consent state machine, three email types, approval routes, chat surface, private-leakage scrub, two-sided consent invariants.
- **[Brief 289 — Reply Ingestion + Follow-Up + Outcome](./289-intro-reply-ingestion-followup-outcome.md):** 11 ACs covering reply classifier extensions, follow-up email, outcome capture, feedback fan-out, paid-successful-outcome data feed.

The combined ACs satisfy the Brief 278 D-Q7 trust gates (checklist items #23 two-sided consent, #25 outbound compliance, #21 private-leakage scrub).

## Review Process

This parent brief is reviewed once (as a design coherence check). Each sub-brief is reviewed independently before its build cycle.

1. Spawn review agent with Briefs 270, 275, 276 (this), 288, 289, 261, 259, 278, 282, 283; `docs/architecture.md`; `docs/review-checklist.md`; Designer spec at `docs/research/276-email-chat-consent-introductions-ux.md`.
2. Review agent checks:
   - Consent state machine completeness — every state transition gated and audited
   - Email content — body cap, single primary action, chat link, reply-natural-language instruction, compliance headers
   - Private data scrub coverage — recipient-facing email and warm intro thread both gated by `network-privacy-scrubber.ts`
   - Channel reuse — no parallel sender
   - State persistence and audit — every transition writes a `network_audit_events` row
   - No AI impersonation — D11 edit label, send-time scrub
   - Architectural decisions D1–D11 are addressed by the sub-briefs
   - Sub-brief split is clean (288 lands without 289; 289 strictly extends)
3. Present findings to human alongside both sub-briefs.

### Reviewer disposition (2026-05-19 round, before human approval)

- **PASS:** 22/26 checklist items.
- **FLAG 1 — Cross-deployment delivery durability (#16):** resolved in Brief 288 ACs 16, 17, 18 (sender persistence in `network_workspace_deliveries`, idempotent local-import ACK, terminal-state persistence). Added `intro-proposal-card` to `NetworkWorkspaceDeliveryKind`; added `recipientDeliveryId` / `requesterDeliveryId` to `introductions`.
- **FLAG 2 — Insight-239 validate-before-mint (#13):** resolved in Brief 288 AC 13 (action enum validated before `createNetworkLaneStepRun`) and Brief 289 AC 10 (eventType / classifiedCategory / outcomeClass validated before mint).
- **FLAG 3 — Scheduler provenance (#15):** resolved in Brief 289 Provenance table — scheduler is the same scheduled-step path used by Brief 275 background-watch; no new scheduler primitive.

## Smoke Test

The parent brief has no smoke test of its own. Sub-briefs each have their own. Run sub-brief smoke tests in order: 288 first, then 289.

## After Completion

1. Mark this parent brief `complete` only after both 288 and 289 are complete.
2. Update `docs/state.md`.
3. Update `docs/roadmap.md` row 276.
4. Consider promoting the email/chat decision model into `docs/architecture.md` if it becomes a general Network interaction pattern (likely — but evaluate after 289 ships).
5. Phase retrospective: did the consent state machine survive contact with real recipients? Did follow-up outcome data feed the future paid-successful-outcome surface as intended?
