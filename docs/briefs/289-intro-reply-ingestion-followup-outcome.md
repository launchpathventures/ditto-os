# Brief 289: Intro Reply Ingestion, Follow-Up, and Outcome Capture

**Date:** 2026-05-19
**Status:** implemented — fresh-context reviewed APPROVE-WITH-NITS; reviewer nit fixed
**Depends on:** Brief 288 (consent state machine + decision emails); Brief 276 (parent design); Briefs 282/283; Brief 270 (paid-successful-outcome data feed); Brief 119 (feedback fan-out)
**Unlocks:** Future paid-successful-outcome pricing surface (consumes outcome data); Brief 278 D-Q7 closure for intro pipeline

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Natural-reply ingestion on approval and follow-up email threads; 14-day follow-up email with outcome capture; feedback fan-out to Member Signal / Active Request / search preferences; outcome aggregate metric writes for the future paid-successful-outcome pricing surface.

## Context

Sub-brief 2 of 2 split from Brief 276. The split seam is **consent gate vs. learning loop** (Insight-004 sizing). Brief 288 lands the consent state machine and the three decision emails — the **skeleton**. This brief lands the **flesh**: how Ditto interprets the user's natural-language reply ("too junior, more commercial" / "great intro, advisory engagement signed last week"), how the follow-up email captures outcome 14 days later, and how outcome data fans out to the systems that need it.

The follow-up loop is what makes this loop **economic, not vanity**. Brief 270 (paid-successful-outcome) and Brief 278 (D-Q7 economic-outcome trust gate) both depend on durable outcome data per intro. Without 289, intros are fire-and-forget; with 289, every intro produces a labelled outcome row that feeds the larger superconnector learning loop.

## Objective

Every natural-language reply to a requester-approval, recipient-approval, or follow-up email is classified into a structured feedback row. Each intro that reached `thread-sent` triggers a follow-up email 14 days later (or at the user-configured cadence) — separately to each party — capturing one of three outcome categories (useful / not useful / no outcome yet) plus optional outcome-class (advisory, hire, client, funding, partnership, collaboration, no-outcome). Outcome rows fan out: useful + outcome-class updates the requester's Member Signal and Active Request preferences; not-useful with category updates anti-persona; no-outcome-yet schedules one more follow-up at 30 days. Aggregate outcome counts are written to `network_outcome_metrics` for the future paid-successful-outcome surface (Brief 270).

## Non-Goals

- No payment processing (Brief 270 consumes outcome data; pricing implementation is separate).
- No LLM call in the inbound hot path (keyword classifier + chat-fallback only — D7 from parent).
- No multi-party group introductions (1:1 only).
- No backfill of outcome data for pre-289 intros (Brief 261 inbound intros stay on their existing terminal states).
- No automatic 90-day "did you stay in touch" check (out of scope; capture in a separate brief if it proves valuable).
- No native CRM sync.

## Inputs

1. `docs/briefs/276-email-chat-consent-introductions.md` — parent design; canonical state machine, reply taxonomy (D10), follow-up cadence (D9).
2. `docs/briefs/288-intro-consent-state-machine-and-decision-emails.md` — schema, blocks, and state machine this brief extends.
3. `docs/research/276-email-chat-consent-introductions-ux.md` — Designer spec; reply categories, follow-up email anatomy, outcome taxonomy.
4. `docs/briefs/270-paid-successful-outcome.md` (or roadmap reference) — outcome-data consumer; defines the outcome enum we must align with.
5. `docs/briefs/119-feedback-fan-out.md` (if present, else `src/engine/feedback-*.ts`) — feedback-fan-out pattern.
6. `docs/briefs/278-trust-privacy-admin-observability.md` — D-Q7 trust gates; "economic outcome" gate.
7. `docs/briefs/282-network-audit-scrubber-stoprun-substrate.md` — audit substrate.
8. `docs/briefs/283-network-source-policy-suppression-email-compliance.md` — compliance.
9. `src/engine/inbound-email.ts` — existing `classifyReply` 6-category keyword classifier (to be extended).
10. `src/engine/notify-user.ts` — follow-up send path.
11. `packages/core/src/db/network/schema.ts` — `introductions` table (Brief 261 + extensions from Brief 288).
12. `docs/insights/180-step-run-invocation-guard.md`, `docs/insights/232-http-wrapper-mints-step-runs.md`, `docs/insights/238-curate-is-the-seventh-human-job.md`.

## Constraints

- **Side-effecting functions require `stepRunId`** (Insight-180). HTTP wrappers mint server-side; reject caller-supplied including falsy values (Insight-232).
- **Reply classifier is keyword-first** (D7 from parent). No LLM call in the inbound hot path. Ambiguous replies route to the chat surface for human disambiguation.
- **Every feedback row writes one `network_audit_events` row** (Brief 282 substrate).
- **Follow-up email passes outbound compliance** (Brief 283): suppression check, sender identity, RFC 8058 List-Unsubscribe + List-Unsubscribe-Post, CAN-SPAM footer, misleading-subject check.
- **Follow-up email body cap <200 words; single primary action** ("Was the intro useful?" with 3 buttons) (D5 from parent).
- **Follow-up sender = same workspace sender as warm intro thread** (D3 from parent) — `mira@{workspaceHandle}.ditto.partners`.
- **Default cadence = 14 days** (D9 from parent); user-configurable per intro at approval time via `followUpCadenceDays` on the `introductions` row (column lands in Brief 288).
- **Inbound thread authentication.** Inbound replies are matched against `introductions.threadMessageId` (warm intro) or the approval-thread message-id; spoofed/unrelated messages route to chat for human disambiguation with no automatic state write.
- **Feedback fan-out is additive only.** A "not useful — too junior" reply updates anti-persona signals but does not delete or rewrite prior Member Signal claims (Insight-238 Curate posture).
- **Outcome enum is shared with Brief 270.** Any change to the outcome taxonomy is coordinated, not unilateral.
- **No private-claim leakage in follow-up email.** Follow-up references the intro only by its public-shareable label (the warm intro subject); does not echo the requester's private notes or anti-persona.
- **Engine-first.** Any new `ContentBlock` types land in `@ditto/core`; outcome enum and feedback-event-type enum live in `packages/core/src/db/network/schema.ts`.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Keyword reply classifier seed | `src/engine/inbound-email.ts:classifyReply` | adopt | 6-category classifier exists; extend with intro-context categories. |
| Feedback fan-out pattern | `src/engine/feedback-*.ts` (Brief 119) | adopt | Existing pattern for feedback → Member Signal / Active Request updates. |
| Outcome taxonomy (advisory/hire/client/funding/partnership/collaboration/no-outcome) | Brief 270 + Designer spec section 5 | adopt | Aligns with future pricing surface; matches Designer's recommended taxonomy. |
| Follow-up email template | Original to Ditto | original | Specific to Ditto's stewarded-intro model. |
| Scheduled follow-up via process step | `src/engine/heartbeat.ts` + existing `processes/*.yaml` schedule blocks; the same scheduled-step path Brief 275 background-watch uses | adopt | Uses the standard scheduled-process-step path; no new scheduler primitive. The Builder MUST follow Brief 275's pattern — do not create a parallel scheduler. |
| Append-only `network_intro_feedback` table | Original to Ditto | original | Granular feedback events distinct from the single `introductions` state column. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `network_intro_feedback` table (id, introId, party, eventType, classifiedCategory, freeText, outcomeClass, outcomeAmountCents, sourceStepRunId, sourceMessageId, createdAt); add `feedbackCollectedAt`, `feedbackRequestedAt`, `lastClassifiedReplyAt` columns to `introductions`. Add enums `IntroFeedbackParty`, `IntroFeedbackEventType`, `IntroOutcomeClass`. |
| `drizzle/network/{NEXT}_intro_feedback_and_outcomes.sql` | Create: migration. Resequence idx per Insight-190. |
| `src/engine/inbound-email.ts` | Modify: extend `classifyReply` with intro-context categories — `decline:not-relevant`, `decline:too-junior`, `decline:too-senior`, `decline:wrong-domain`, `decline:too-salesy`, `decline:already-know-them`, `decline:other`, `outcome:useful`, `outcome:not-useful`, `outcome:no-outcome-yet`, `ambiguous`. Add `matchInboundToIntroduction` (matches on threadMessageId / In-Reply-To / References headers). |
| `src/engine/intro-feedback.ts` | Create: `recordIntroFeedback(stepRunId, introId, party, payload)`; `fanOutIntroFeedback(stepRunId, feedbackRowId)`; outcome-class router (useful → Member Signal update; not-useful → anti-persona update; no-outcome-yet → reschedule). |
| `src/engine/intro-followup-scheduler.ts` | Create: schedules and emits the 14-day follow-up email; calls `sendFollowUpEmail` per party. |
| `src/engine/intro-followup-email.ts` | Create: `sendFollowUpEmail(stepRunId, introId, party)` — uses `notifyUser` + workspace sender; body <200 words; primary action = "Was the intro useful?" (3 buttons). |
| `src/engine/intro-email-templates.ts` | Modify (from Brief 288): add `renderFollowUpEmail`. |
| `src/engine/tool-resolver.ts` | Modify: register `sendFollowUpEmail`, `recordIntroFeedback`, `fanOutIntroFeedback`. |
| `packages/web/app/api/v1/network/intros/[id]/feedback/route.ts` | Create: POST endpoint; mints wrapper step run server-side; rejects caller-supplied `stepRunId` including falsy values. Handles both follow-up button clicks (magic-link token) and chat-rendered disambiguation submissions. |
| `packages/web/app/api/v1/network/intros/[id]/feedback/route.test.ts` | Create. |
| `packages/web/app/network/intros/[id]/chat/page.tsx` | Modify (from Brief 288): render ambiguous-reply disambiguator and outcome capture surface; show prior feedback rows. |
| `src/engine/intro-feedback.test.ts`, `src/engine/intro-followup-*.test.ts` | Create. |
| `src/engine/inbound-email.test.ts` | Modify: cover the extended reply taxonomy + intro-match logic + ambiguous-fallback. |
| Optional: `packages/core/src/db/network/schema.ts` — `network_outcome_metrics` table | Create if not already in Brief 270: rolling aggregate (workspaceId, periodStart, useful, not-useful, no-outcome-yet, outcome-class breakdown). |

## User Experience

- **Jobs affected:** Capture (natural replies as feedback), Review (outcome reporting via follow-up), Define (replies update Active Request), Curate (Insight-238 — "don't introduce me to this kind of person again" via follow-up opt-out).
- **Primitives involved:** Existing `RecordBlock` (feedback log), `AuthorizationRequestBlock` (follow-up button is an authorization for the workspace to record the outcome and possibly fan out), chat surface, email channel.
- **Process-owner perspective:**
  - **Rob:** Replies "great, advisory engagement signed last week" to follow-up → classified as `outcome:useful` + `outcomeClass=advisory` → Member Signal updated to include "willing to advise on residential reno"; aggregate metric increments.
  - **Lisa:** Replies "too junior — looking for someone who's run a Series A" to the recipient-approval email → classified as `decline:too-junior` → her Active Request adds a refinement "min-stage: post-Series-A" → Mira queues a new Possible Connection cycle.
  - **Jordan:** Hits "not useful" on the follow-up → opens chat → chat surface shows "what didn't fit?" with the 6 decline categories → Jordan picks "wrong domain" + free text → anti-persona signal added.
  - **Nadia:** Team dashboard shows "8 intros made this quarter, 3 advisory, 1 client, 4 no-reply"; one of those 4 was "no outcome yet" and is in the queue for a 30-day re-check.
- **Interaction states:**
  - **Follow-up email:** sent / opened / outcome-reported / no-action-after-7d / reschedule-at-30d (for `no-outcome-yet`).
  - **Inbound reply:** matched-to-intro / classified-confidently / classified-ambiguous-routes-to-chat / spoofed-or-orphan (logged but no state write).
  - **Chat disambiguator:** loading / showing-candidate-categories / submitted / rejected (user provides new free text).
- **Designer input:** `docs/research/276-email-chat-consent-introductions-ux.md` sections 5 (Natural-Language Reply Ingestion), 6 (Post-Intro Outcome Taxonomy), 7 (Interaction States Per Surface — follow-up surface).

## Reply Taxonomy (canonical, owned by this brief)

| Category | Trigger keywords (seed) | Side effect on classify |
|----------|------------------------|--------------------------|
| `decline:not-relevant` | "not relevant", "not a fit" | `recordRecipientApproval(decline)` if recipient; refinement signal if requester |
| `decline:too-junior` | "too junior", "more senior" | anti-persona refinement: min-seniority |
| `decline:too-senior` | "too senior", "more junior" | anti-persona refinement: max-seniority |
| `decline:wrong-domain` | "wrong domain", "different industry" | refinement: domain |
| `decline:too-salesy` | "salesy", "sales pitch" | suppression signal for similar profiles |
| `decline:already-know-them` | "already know", "we've met" | already-connected dedupe signal |
| `decline:other` | (free text decline without keyword match) | logged; chat-disambiguator surfaced |
| `outcome:useful` | "great", "useful", "thanks", "introduced", "met", "talking" | outcome row + Member Signal update |
| `outcome:not-useful` | "not useful", "didn't fit", "no good" | outcome row + anti-persona update |
| `outcome:no-outcome-yet` | "too early", "still talking", "haven't met yet" | reschedule follow-up at +30d (one retry max) |
| `ambiguous` | (no keyword match, classifier confidence <threshold) | routed to chat-disambiguator; NO automatic state write |

`outcomeClass` is captured separately when `outcome:useful` is detected; the follow-up email's chat-link surface asks the user to pick one of: `advisory`, `hire`, `client`, `funding`, `partnership`, `collaboration`, `no-outcome`. The classifier seeds `outcomeClass` from keywords when present (e.g., "advisory engagement" → `advisory`); otherwise the chat surface prompts.

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper creator | Bypass assertion |
|----------------|-------------|-------------------|-----------------|------------------|
| `sendFollowUpEmail(stepRunId, introId, party)` | Email send to one party | Required; compliance/suppression first | Scheduled process step (14d after `thread-sent`) | Missing guard sends no email |
| `recordIntroFeedback(stepRunId, introId, party, payload)` | Writes `network_intro_feedback` row; updates `introductions` state to `feedback-collected` (or schedules retry); audit row | Required (server-minted only) | `/api/v1/network/intros/[id]/feedback` mints | Caller `stepRunId` (including `null`/`""`/`0`/`false`) → 400, no write |
| `fanOutIntroFeedback(stepRunId, feedbackRowId)` | Member Signal / Active Request / anti-persona / outcome-metric writes | Required; called only after feedback row written | `recordIntroFeedback` chains | Missing guard writes nothing downstream |
| Inbound reply ingestion (`inbound-email.ts`) | Feedback row write IF confidently classified; else chat disambiguation | Inbound-email handler mints wrapper; thread-match authenticated against `introductions.threadMessageId` / In-Reply-To headers | Inbound handler | Spoofed/orphan reply: log + chat surface; no automatic state write |
| `/api/v1/network/intros/[id]/feedback` POST | Wrapper for feedback button or chat-disambiguator submit | Wrapper minted server-side | Route handler | Rejects caller `stepRunId` (all falsy variants) |
| Reschedule retry (`no-outcome-yet`) | Schedules a single +30d follow-up | Wrapper minted by the scheduler step | Scheduler | Refuses second retry (max 1 retry per intro) |

## Acceptance Criteria

1. [ ] `network_intro_feedback` table exists with columns: `id`, `introId` (FK to `introductions`), `party` (enum: `requester`/`recipient`), `eventType` (enum: `reply` / `button-click` / `chat-disambiguator-submit`), `classifiedCategory` (the 11-value taxonomy above), `freeText` (nullable), `outcomeClass` (nullable; the 7-value outcome enum from Brief 270), `outcomeAmountCents` (nullable integer — voluntary willingness-to-pay signal), `sourceStepRunId`, `sourceMessageId` (nullable; for email-originated rows), `createdAt`.
2. [ ] `IntroFeedbackParty`, `IntroFeedbackEventType`, `IntroOutcomeClass` enums exported from `packages/core/src/db/network/schema.ts`. `IntroOutcomeClass` matches the Brief 270 outcome enum (coordinated update, not unilateral).
3. [ ] Drizzle migration generates successfully; idx is unique and resequenced per Insight-190.
4. [ ] `inbound-email.ts:classifyReply` extended with the 11-category taxonomy above. Vitest covers each category with at least 2 trigger-keyword samples + 1 false-positive guard.
5. [ ] `matchInboundToIntroduction(message)` matches inbound replies against `introductions.threadMessageId` (warm intro thread) AND against `In-Reply-To` / `References` headers on approval-email threads. Spoofed/unrelated messages (no match) are logged and surfaced in chat for human review; no automatic state or feedback write.
6. [ ] `recordIntroFeedback(stepRunId, introId, party, payload)` refuses without `stepRunId` outside `DITTO_TEST_MODE`; writes one `network_intro_feedback` row; updates `introductions.state` to `feedback-collected` when the payload is a terminal outcome (`outcome:useful` or `outcome:not-useful`); schedules one +30d retry when `outcome:no-outcome-yet` (max one retry per intro); writes one `network_audit_events` row tagged with `by-party`.
7. [ ] `fanOutIntroFeedback(stepRunId, feedbackRowId)` chains from `recordIntroFeedback`: useful + `outcomeClass` → Member Signal additive update; decline category → anti-persona refinement signal; `outcome:useful` → outcome-metric increment in `network_outcome_metrics`; never deletes or rewrites prior Member Signal claims (Insight-238 Curate posture, additive only).
8. [ ] `sendFollowUpEmail(stepRunId, introId, party)` refuses without `stepRunId`; passes `network-email-compliance.ts` (suppression hit → audited refusal, not silent drop); uses workspace sender `mira@{workspaceHandle}.ditto.partners` (D3); body <200 words (vitest regression); single primary action "Was the intro useful?" with 3 buttons (useful / not useful / no outcome yet).
9. [ ] Scheduled follow-up fires at `followUpCadenceDays` (default 14) after `thread-sent`; one send per party; honors per-user throttles from `src/engine/notify-user.ts` (`MAX_EMAILS_PER_USER_PER_DAY`, `MIN_MS_BETWEEN_NOTIFICATIONS`); suppression-listed users receive no send and produce an audited refusal row.
10. [ ] `POST /api/v1/network/intros/[id]/feedback` mints a wrapper step run server-side; rejects any caller-supplied `stepRunId` (including `null`, `""`, `0`, `false`) with HTTP 400; verifies the magic-link token; honors the 24h expiry and 5-per-email-per-hour limit; routes ambiguous payloads to the chat surface without writing state. **Validate-before-mint (Insight-239):** the route validates `eventType` against (`button-click` / `chat-disambiguator-submit`), `classifiedCategory` against the 11-value taxonomy, and `outcomeClass` against the 7-value enum **before** calling `createNetworkLaneStepRun`; malformed values return HTTP 400 with no wrapper-run row written.
11. [ ] Tests cover: full reply-classifier matrix, inbound-match-by-thread-id happy path, spoofed-reply rejection, scheduled follow-up fires at cadence, follow-up email body <200 words, recordIntroFeedback writes audit row, fanOutIntroFeedback additive (never rewrites prior signals), outcome-metric increment, caller-`stepRunId` rejection for all falsy values, +30d retry caps at one, ambiguous-reply routes to chat without state write.

## Review Process

1. Spawn review agent with: this brief, Brief 288, Brief 276 (parent), Brief 270, Brief 282, Brief 283, Designer spec, `docs/architecture.md`, `docs/review-checklist.md`.
2. Review agent verifies:
   - Side-effect guard matrix complete (Insight-180/232)
   - Outcome enum stays aligned with Brief 270
   - Feedback fan-out is additive (Insight-238 Curate posture, no destructive rewrites)
   - Reply classifier coverage matches Designer spec section 5
   - Inbound-match guards against spoofed replies (no automatic write on orphan)
   - Follow-up compliance gate is wired (Brief 283 misleading-subject + suppression + List-Unsubscribe)
   - Schema additive only (no breaking changes to Brief 288 columns)
   - Brief 278 D-Q7 economic-outcome gate satisfied (outcome data feeds aggregate metrics)
3. Present findings to human alongside the brief.

## Smoke Test

```bash
pnpm vitest run src/engine/inbound-email.test.ts
pnpm vitest run src/engine/intro-feedback.test.ts src/engine/intro-followup-*.test.ts
pnpm vitest run packages/web/app/api/v1/network/intros/[id]/feedback/route.test.ts
pnpm run type-check

# Manual in test mode (DITTO_TEST_MODE=1, building on the Brief 288 smoke test fixture):
# 1. From the Brief 288 fixture, advance an introduction to state=thread-sent.
# 2. Manually trigger the follow-up scheduler (or fast-forward followUpCadenceDays).
# 3. Verify two follow-up emails fired (one per party), compliance headers present, body <200 words.
# 4. Simulate inbound reply: "great intro, advisory engagement signed last week" referencing the warm intro thread message-id.
#    → classifyReply → outcome:useful with outcomeClass=advisory seed
#    → recordIntroFeedback writes network_intro_feedback row
#    → fanOutIntroFeedback updates Member Signal (additive) + increments outcome metric
#    → introductions.state = feedback-collected
#    → exactly one network_audit_events row written
# 5. Simulate inbound reply: "too junior" on a recipient-approval email (no warm-intro thread yet).
#    → classifyReply → decline:too-junior
#    → recordRecipientApproval(decline) (from Brief 288)
#    → recordIntroFeedback writes refinement signal
#    → requester's Active Request gains "min-seniority" refinement
# 6. Simulate inbound reply: "haven't met yet, too early" on follow-up.
#    → classifyReply → outcome:no-outcome-yet
#    → schedules one +30d retry
#    → state stays at thread-sent (NOT feedback-collected)
# 7. Simulate inbound spoofed reply with no matching thread-id.
#    → matchInboundToIntroduction returns null
#    → routed to chat for human disambiguation
#    → NO automatic state write, NO feedback row
# 8. Submit ambiguous reply via chat-disambiguator with selected category.
#    → POST /api/v1/network/intros/[id]/feedback with caller stepRunId="" → HTTP 400
#    → POST with valid magic-link token → feedback row written with eventType=chat-disambiguator-submit
```

## After Completion

1. Update `docs/state.md`: brief 289 complete; Phase 14 intro pipeline closed end-to-end (consent + facilitation + outcome).
2. Update `docs/roadmap.md` row 276 to `complete`; mark parent Brief 276 `complete`.
3. Update Brief 270 status: outcome data feed is now live; pricing surface unblocked.
4. Confirm Brief 278 D-Q7 economic-outcome gate is satisfied; update Brief 278 checklist.
5. If the keyword classifier accuracy is below ~70% on the Designer spec's sample replies, FLAG for revisit (LLM-fallback may be needed; out of scope but worth noting).
6. Phase retrospective: did outcome data quality meet the bar for paid-successful-outcome pricing? Did the +30d retry cap make sense, or do we need richer scheduling? Did the additive fan-out (Insight-238 Curate) prevent the "anti-persona feedback erodes prior claims" failure mode?
