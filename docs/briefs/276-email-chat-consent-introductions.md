# Brief 276: Email, Chat, Consent, and Introduction Facilitation

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Brief 275; Brief 261; Brief 259; Briefs 098b/099a-c
**Unlocks:** Brief 278

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Define and implement how Ditto communicates with users through email and chat, obtains consent from both sides, facilitates off-platform introductions, and captures post-intro feedback.

## Context

The product should not rely on users sitting inside the app. Ditto's superconnector behavior works best when the user receives a concise email decision, can reply naturally, and can open chat only when they want context or refinement.

Once an introduction is approved by both sides, v1 should facilitate off-platform via an email thread. Ditto should steward the intro and learn from the outcome rather than disappearing after sending.

## Objective

Every proposed introduction flows through a two-sided consent path. Ditto emails concise decisions, links to chat for context, accepts natural email replies as feedback, creates an off-platform warm intro email only after consent, and follows up separately with both parties to learn whether the connection was useful.

## Non-Goals

- No native LinkedIn/X/Instagram/WhatsApp DM sending.
- No calendar scheduling automation beyond optional calendar links if already available.
- No payment changes.
- No auto-intro without both sides approving.
- No CRM integration beyond recording interactions already supported by network primitives.
- No AI impersonation of either party.

## Inputs

1. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` - introductions primitive and refusal triggers.
2. `docs/briefs/275-background-watch-network-health.md` - watch proposals and network health.
3. `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` - representative posture and cross-deployment delivery.
4. `docs/architecture.md` - channel routing, Alex/Mira posture, Network front door.
5. `src/engine/notify-user.ts` - channel-aware outbound delivery.
6. `src/engine/inbound-email.ts` - reply ingestion.
7. `src/engine/channel.ts` - AgentMail/Gmail channel adapters.
8. `packages/core/src/content-blocks.ts` - AuthorizationRequestBlock.

## Constraints

- **Email is for durable decisions.** Each email has one clear reason and one primary action.
- **Chat is for context and refinement.** Every decision email links to a chat/session with full proposal context.
- **Natural replies count.** Email replies like "too junior, more commercial" must be parsed as feedback.
- **Both sides approve before intro.** Requester approves asking; recipient approves being introduced.
- **No cold off-platform thread.** Email thread with both parties is created only after approvals.
- **Intro copy must be representative, not impersonating.**
- **Every intro has a record.** All proposal, approval, send, and feedback states persist.
- **No private leakage.** Intro email contains only approved/shareable context.
- **Use existing channel adapters and `notifyUser`; no parallel email sender.**
- **Side-effecting send tools require `stepRunId`.**
- **HTTP wrappers mint step runs.** Approval/feedback/send routes reject caller-supplied `stepRunId`, including falsy values, and create wrapper step runs server-side.
- **Outbound email compliance applies.** Approval emails, warm intro threads, request-specific invites, and follow-ups must pass sender identity, suppression, opt-out, and misleading-copy checks from Brief 278.
- **Outcome feedback matters.** Follow-up must record whether the connection created professional/economic value, not just whether the email was sent.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| AuthorizationRequestBlock | Brief 248 + 261 | adopt | Existing approval primitive is the consent gate. |
| Network-to-workspace delivery | Brief 259 + Insight-234 | adopt | Durable delivery pattern already exists. |
| Channel routing | Briefs 098b/099a-c | adopt | Existing email/workspace resolution and throttles. |
| Off-platform warm intro email | Original to Ditto | original | The simplest high-trust v1 fulfillment path. |
| Natural reply as feedback | Ditto feedback principle | adopt | "Edits are feedback"; replies should be feedback too. |
| Outcome feedback for future pricing | Brief 119 + Brief 270 | adopt/original | Successful connection data is required before later paid-successful-outcome pricing. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add/extend `network_intro_approvals`, `network_intro_threads`, `network_intro_feedback`, and approval state on introductions if Brief 261 tables are not sufficient. |
| `drizzle/network/{NEXT}_intro_facilitation.sql` | Create if schema changes. |
| `src/engine/intro-proposal.ts` | Create or extend: constructs requester and recipient approval messages from Possible Connection/Watch Proposal. |
| `src/engine/intro-approval.ts` | Create: handles requester approval, recipient approval, decline, not-now, and edit actions. |
| `src/engine/intro-email-thread.ts` | Create: guarded `create_intro_thread(stepRunId, introId)` sends warm intro email after both approvals. |
| `src/engine/intro-feedback.ts` | Create: post-intro follow-up and feedback ingestion. |
| `src/engine/inbound-email.ts` | Modify: route replies on intro approval/follow-up threads into structured feedback. |
| `src/engine/notify-user.ts` | Reuse/modify: decision emails for proposals and approvals. |
| `src/engine/tool-resolver.ts` | Modify: register guarded intro facilitation tools. |
| `packages/web/app/api/v1/network/intros/[id]/approve/route.ts` | Create/modify: action endpoints for approval links; reject caller `stepRunId`. |
| `packages/web/app/api/v1/network/intros/[id]/feedback/route.ts` | Create: feedback from email links/chat. |
| `packages/web/components/network/intro-proposal-card.tsx` | Create: in-app/chat proposal review surface. |
| `packages/web/components/emails/` or current email template location | Add: requester approval, recipient approval, intro thread, follow-up templates. |

## Consent State Machine

Minimum states:

1. `proposed` - Possible Connection or Watch Proposal exists; no one contacted.
2. `requester-approved` - requester authorizes Ditto to ask recipient.
3. `recipient-asked` - recipient receives one decision email with approved/shareable context only.
4. `recipient-approved` - recipient explicitly agrees to be introduced.
5. `thread-sent` - both parties are placed on the same email thread.
6. `declined` / `not-now` - terminal or timed retry state; reason captured.
7. `feedback-collected` - post-intro outcome recorded separately from both parties where possible.

No state transition may skip requester approval or recipient approval. The warm intro thread cannot include both parties until state `recipient-approved`.

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write/no-send assertion |
|----------------|-------------|-------------------|--------------------------|--------------------------------|
| `create_intro_thread(stepRunId, ...)` | Sends email thread to both parties | Required; both approvals and email compliance required. | Approval route or process step creates wrapper run. | Missing guard sends no email and writes no terminal intro-thread state. |
| Requester/recipient approval handlers | Intro state write, possible recipient email send | Server wrapper run only; audit decision. | Approval route creates wrapper run. | Caller `stepRunId`, including falsy values, is rejected; no state write/send on bypass. |
| Natural reply ingestion | Feedback/state write | Existing inbound context plus audit event; no caller-supplied run id. | Inbound-email handler or wrapper route creates/propagates audited context. | Ambiguous/spoofed replies route to chat/review and write no approval/send state. |
| Follow-up sender | Sends separate outcome emails | Required; suppression/throttle pass. | Scheduled process step creates wrapper run. | Missing guard sends no follow-up and writes no feedback request event. |
| `/api/v1/network/intros/*` routes | Approval/feedback wrappers | Must not accept client-provided run ids. | Route mints wrapper run server-side. | Reject caller `stepRunId`, including `null`, `""`, `0`, `false`; no state write/send on bypass. |

## Email Model

### Decision email anatomy

- Subject: short, specific.
- First line: why Ditto is emailing.
- Context: 2-4 bullets max.
- Primary action: approve/decline/open chat.
- Secondary: reply naturally.
- Link: magic link to chat context.

### Email types

1. **Requester approval**
   - "Ditto found someone who may fit your request."
   - Actions: ask if open, not this person, refine.

2. **Recipient approval**
   - "Someone is looking for X. This may be relevant to you."
   - Actions: yes intro me, not now, not relevant, more context.

3. **Warm intro thread**
   - Sent only after both approve.
   - Both parties on thread.
   - Includes why Ditto made the intro, approved context, suggested next step.

4. **Follow-up**
   - Sent separately to each party.
   - Asks whether useful, met, more like this, avoid pattern, and whether it produced a concrete outcome.

## Chat Model

Chat should show:

- full proposal rationale,
- evidence and sources,
- private/public context boundaries,
- edit intro draft,
- reason for uncertainty,
- prior feedback,
- watch/request context,
- "ask me before anyone is contacted" state.

## Acceptance Criteria

1. [ ] Intro proposal path requires requester approval before asking recipient.
2. [ ] Recipient approval is required before creating an email thread with both parties.
3. [ ] `create_intro_thread(stepRunId, ...)` refuses without `stepRunId` outside `DITTO_TEST_MODE`.
4. [ ] Approval and feedback HTTP routes reject caller-supplied `stepRunId` where wrappers invoke guarded tools.
5. [ ] Decision emails include one primary action, chat link, and reply-natural-language instruction.
6. [ ] Chat context opens with full proposal rationale, evidence, risk, and source labels.
7. [ ] Recipient-facing email excludes private requester notes, private budget, anti-persona details, and hidden/on-request claims unless approved.
8. [ ] Warm intro email is sent only after both approvals and includes approved context only.
9. [ ] Natural replies to approval emails are captured as structured feedback or routed to chat when ambiguous.
10. [ ] Declines capture reason categories: not relevant, not now, too junior/senior, wrong domain, too salesy, already know them, other.
11. [ ] Post-intro follow-up sends separately to both parties and records outcome.
11a. [ ] Outcome feedback distinguishes no reply, useful conversation, meeting booked, work/client/hire/funding/advisory/partnership/collaboration outcome, and user willingness-to-pay signal where voluntarily provided.
12. [ ] Follow-up feedback updates Member Signal/Active Request/search preferences and aggregate economic-outcome metrics where appropriate.
13. [ ] All intro states persist and can be audited: proposed, requester-approved, recipient-asked, recipient-approved, thread-sent, declined, not-now, feedback-collected.
14. [ ] Existing Brief 261 free-counter and refusal behavior remains intact.
15. [ ] Tests cover two-sided approval, no-thread-before-consent, private scrub, email compliance/suppression, natural reply ingestion, follow-up outcome feedback, wrapper bypass rejection including falsy values, and stepRunId enforcement.
16. [ ] Manual smoke sends test-mode emails through the configured adapter or mock channel and verifies state transitions.

## Review Process

1. Spawn review agent with Briefs 270, 275-276, Brief 261, Brief 259, architecture channel sections, and review checklist.
2. Review agent checks consent, email content, private data scrub, channel reuse, state persistence, and no AI impersonation.
3. Present findings to human.

## Smoke Test

```bash
pnpm vitest run src/engine/intro-*.test.ts src/engine/inbound-email*.test.ts
pnpm --filter @ditto/web test -- intro
pnpm run type-check

# Manual in test mode:
# 1. Create Active Request and Possible Connection.
# 2. Approve as requester.
# 3. Verify recipient approval email payload.
# 4. Approve as recipient.
# 5. Verify intro email thread payload includes both parties only after approval.
# 6. Reply "not useful, too junior" to follow-up.
# 7. Verify feedback captured and applied to request preferences.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 276.
3. Consider promoting the email/chat decision model into `docs/architecture.md` if it becomes a general Network interaction pattern.
