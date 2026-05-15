# Brief 273: Need Request Onboarding and Manual Search Entry

**Date:** 2026-05-14
**Status:** built (2026-05-14; fresh-context review attempt blocked by usage limit; pending review retry + human approval)
**Depends on:** Brief 271; Brief 257/264-266; Brief 258; Brief 261
**Unlocks:** Briefs 274, 275, 276, 278

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Let seekers arrive with a specific need or opportunity, turn it into a structured Active Request, and choose manual search, background watch, or both.

## Context

Someone may come to Ditto because they need an expert, collaborator, client, advisor, opportunity, investor, candidate, or peer. The product should not force them to build a full profile first. It should capture the need, clarify only what matters, and start producing useful possible connections quickly. The request is an outcome object: what has to become true for this connection to matter economically or professionally.

The user direction is explicit: people come to Ditto with a specific need first; over time, the goal is that they become both seekers and discoverable members.

## Objective

A seeker can describe a need in natural language, get a structured request brief, answer only missing calibration questions, choose "search now", "keep watch", or "both", and receive manual search results or an Active Request without completing full member onboarding first.

## Non-Goals

- No background watch scheduler in this brief; it creates the request state that Brief 275 consumes.
- No final connection facilitation beyond handing off to the existing intro/proposal primitive.
- No payment gating.
- No public job board or opportunity feed.
- No long form required account setup before value.
- No native social posting of requests.

## Inputs

1. `docs/briefs/271-network-doctrine-ia-copy-superconnector.md` - IA and copy system.
2. `docs/briefs/257-client-lane-job-request-and-on-network-match.md` or complete rows 264-266 - existing client-lane intake and match.
3. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` - off-network scout and source-grounded candidate model.
4. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` - intro request and refusal gates.
5. `packages/web/app/network/chat/client-card-actions.tsx` - current request actions.
6. `packages/web/app/network/chat/suggested-candidates-panel.tsx` - current result surface.
7. `packages/core/src/db/network/schema.ts` - existing `networkJobRequests` and introduction tables.

## Constraints

- **Need-first, account-later.** A seeker can create a draft request before full profile onboarding.
- **Outcome-first.** The request must capture what success means in concrete terms: revenue, work delivered, hire made, investor/advisor found, partnership opened, expertise obtained, or similar value.
- **Ask only missing questions.** Do not run a rigid six-question script when the initial need already contains enough information.
- **Manual search is not background watch.** User explicitly chooses search now, keep watch, or both.
- **Private details are protected.** Budget, sensitive company details, and private filters do not appear in public/member-facing copy unless the user explicitly marks them shareable.
- **Seeker identity is calibrated before contact.** Before an intro or outreach request is sent, collect enough identity/trust data: name, email, org/site, reason credible.
- **Every request inference is editable.** Ditto drafts; user confirms.
- **No third-party contact without the intro gate.**
- **All request-drafting and search tools with side effects require `stepRunId`.**
- **HTTP wrappers mint step runs.** Request/search starter routes must reject caller-supplied `stepRunId`, including falsy values, and create wrapper step runs server-side.
- **Existing request schema first.** `networkJobRequests` is the current request-like table. Extend or migrate it unless a separate Active Request table is clearly justified.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Existing client-lane request card | Brief 257/264-266 | adopt | The `JobRequestCardBlock` and suggested candidates panel already encode much of the demand-side shape. |
| Request-as-brief | Original to Ditto | original | A request is the work product Ditto can search and watch against. |
| Need-first onboarding | Original to Ditto | original | Required by user direction and the professional-network thesis. |
| Budget privacy | Brief 254/257 | adopt | Existing constraint that budget never leaks to share/search surfaces. |
| Guarded intro request | Brief 261 | adopt | Existing consent and refusal primitives apply to any request-generated intro. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add/extend `network_need_requests` only if `networkJobRequests` cannot evolve cleanly. Preferred path: migrate/evolve `networkJobRequests` into Active Request shape with backward compatibility for existing `JobRequestCardBlock` rows. |
| `drizzle/network/{NEXT}_active_requests.sql` | Create: migration for request/watch fields if needed. |
| `src/engine/need-request-draft.ts` | Create: guarded tool `draft_need_request(stepRunId, rawNeed, requesterContext?)`. |
| `src/engine/need-request-calibration.ts` | Create: determines missing fields and next-best questions. |
| `src/engine/need-request-storage.ts` | Create: creates/updates Active Request rows and audit events. |
| `src/engine/tool-resolver.ts` | Modify: register `draft_need_request`, `update_need_request`, and any request-search starter tool. |
| `src/engine/network-chat-prompt.ts` | Modify: add request-mode directive that distinguishes manual search, background watch, and both. |
| `packages/web/app/network/request/page.tsx` | Create or route: need-first request onboarding, if not kept inside `/network/chat`. |
| `packages/web/components/network/request-intake.tsx` | Create: natural language need input with structured draft preview. |
| `packages/web/components/network/request-review.tsx` | Create: editable request brief with public/private fields and search/watch mode choice. |
| `packages/web/app/network/chat/client-card-actions.tsx` | Modify: use Active Request modes instead of one-off stub actions. |
| `packages/web/app/api/v1/network/requests/route.ts` | Create: create/update/list Active Requests; rejects caller-supplied `stepRunId` where guarded tools are invoked via HTTP wrapper. |

## Active Request Shape

At minimum:

- `id`
- `requesterUserId` nullable
- `visitorSessionId` nullable
- `status`: `draft | active | paused | fulfilled | closed`
- `mode`: `manual-search | background-watch | both`
- `rawNeed`
- `outcomeNeeded`
- `idealPerson`
- `proofRequired`
- `badFit`
- `urgency`
- `geography`
- `commercialShape`
- `successOutcome`
- `outcomeValueHint` optional, private by default
- `budgetPrivate`
- `budgetShareableLabel`
- `shareableSummary`
- `privateNotes`
- `sourcesAllowed`: `ditto-members | public-web | both`
- `contactPolicy`: `ask-before-contact | ask-before-intro | never-contact-without-approval`
- `createdAt`
- `updatedAt`

## Request Flow

1. **Need input**
   - User writes a plain-language need.
   - Examples should be available as chips but not inserted automatically.

2. **Draft request**
   - Ditto extracts outcome, target person, proof, urgency, bad fit, commercial shape, and what success would be worth to the requester.

3. **Calibration**
   - Ask only missing questions:
     - What outcome would make this a success?
     - What proof would make someone credible?
     - Is this paid, advisory, hiring, partnership, or exploratory?
     - What would make this connection a successful outcome?
     - What should Ditto avoid?
     - What can be shared with potential matches?

4. **Mode choice**
   - Search now.
   - Keep watch.
   - Do both.
   - Ask before contacting anyone is default.

5. **Identity/trust**
   - Before any intro request: name, email, org/site, reason credible.
   - Can be deferred for search-only.

6. **Next**
   - Manual search results (Brief 274).
   - Background Watch active state (Brief 275).
   - Introduction Proposal (Brief 276).

## Data Model Boundary

Active Request is the durable demand-side object. It should supersede the older client-lane job request language without losing compatibility.

- Existing `networkJobRequests` rows must still render and search after migration.
- If `networkJobRequests.jobRequestCard` remains the stored card, new Active Request fields must be stored beside it or derived deterministically.
- If a new table is created, the brief closeout must document backfill, dual-read period, and the deletion/retirement plan for obsolete fields.
- Budget, outcome value, and private notes are private by default and may only appear in recipient/searcher-facing copy when explicitly marked shareable.

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write assertion |
|----------------|-------------|-------------------|--------------------------|---------------------------|
| `draft_need_request(stepRunId, ...)` | LLM token spend and draft extraction | Required. | Intake/request HTTP route creates wrapper run. | Missing guard makes no LLM call and writes no draft row. |
| `update_need_request(stepRunId, ...)` | Active Request create/update/pause/resume/close | Required; audit before/after fields. | Request edit/publish route creates wrapper run. | Missing guard writes no request row and no audit row. |
| Request search starter tool | Creates manual-search handoff or watch seed | Required; private fields scrubbed from payload. | Mode-choice route creates wrapper run. | Missing guard creates no search run, watch seed, or copied private payload. |
| `/api/v1/network/requests/*` routes | Wrapper invocation and request writes | Must not accept client-provided run ids. | Route mints wrapper run server-side. | Reject caller `stepRunId`, including `null`, `""`, `0`, `false`; guarded tool is not invoked and no request row is written. |

## Acceptance Criteria

1. [ ] User can start with a one-line need and get a structured draft request.
2. [ ] `draft_need_request(stepRunId, ...)` refuses without `stepRunId` outside `DITTO_TEST_MODE`.
3. [ ] Drafted request includes outcome, ideal person, proof required, bad fit, urgency, geography, commercial shape, shareable summary, and private notes.
3a. [ ] Drafted request includes `successOutcome` and optional private `outcomeValueHint`; neither leaks to member-facing copy unless explicitly marked shareable.
4. [ ] User can edit every drafted field before saving.
5. [ ] Calibration asks only missing fields; if raw need contains budget, geography, and proof, those questions are skipped.
6. [ ] User can choose `manual-search`, `background-watch`, or `both`.
7. [ ] Default contact policy is "ask before contacting anyone."
8. [ ] Search-only can proceed with light identity; intro/contact requires name, email, org/site or credibility context.
9. [ ] Budget/private notes never appear in member-facing result cards or public request copy unless explicitly marked shareable.
10. [ ] Existing `/network/chat?mode=client` and `networkJobRequests` flows either map into Active Request or remain backward-compatible with a documented migration path.
11. [ ] HTTP request route rejects caller-supplied `stepRunId` where wrapper-step-run tools are invoked.
12. [ ] Active Request rows can be listed, paused, resumed, and closed.
13. [ ] Search now handoff produces an input payload compatible with Brief 274.
14. [ ] Keep watch handoff produces an Active Request payload compatible with Brief 275.
15. [ ] Component tests cover raw need drafting, calibration skip logic, private field handling, and mode choice.
16. [ ] Engine tests cover `stepRunId`, wrapper bypass rejection including falsy values, draft extraction, private scrub, and identity-gated intro path.

## Review Process

1. Spawn review agent with Briefs 270-273, Brief 257/264-266, Brief 258, Brief 261, and architecture/review checklist.
2. Review agent checks need-first posture, field privacy, intro consent, schema duplication with existing `networkJobRequests`, and backward compatibility.
3. Present findings to human.

## Smoke Test

```bash
pnpm vitest run src/engine/need-request-*.test.ts
pnpm --filter @ditto/web test -- request
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Open /network and choose "Create a request".
# 2. Enter: "Need a fractional CMO for a climate startup, B2B SaaS, UK or Europe, paid advisory."
# 3. Verify Ditto does not ask redundant questions.
# 4. Mark budget private.
# 5. Choose "Do both".
# 6. Verify Active Request created and search/watch handoffs are visible.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 273.
3. If Active Request supersedes `networkJobRequests`, document the migration path in the brief closeout.

## Builder Closeout Notes (2026-05-14)

- Active Request evolves `networkJobRequests` in place. Existing `JobRequestCardBlock` rows remain readable because `jobRequestCard` stays required and legacy `status="open"` remains accepted.
- New nullable Active Request columns sit beside the existing card: `visitorSessionId`, `mode`, outcome/proof/geography/commercial/private fields, `sourcesAllowed`, `contactPolicy`, identity fields, and search/watch handoff JSON.
- Migration path: dual-read period is unnecessary for v1 because the durable table is unchanged. Older rows render through the existing card path; new rows have both the old card payload and the Active Request columns. Future cleanup can retire legacy "job request" labels after Briefs 274-275 consume the new columns.
- Request audit events are stored in `network_request_audit_events` with `stepRunId`, before/after snapshots, and lifecycle event type.
