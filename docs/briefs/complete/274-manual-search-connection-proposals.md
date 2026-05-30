# Brief 274: Manual Search and Connection Proposals

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Brief 272; Brief 273; Brief 258; Brief 261
**Unlocks:** Briefs 275, 276, 278, 279

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Make manual search a first-class, evidence-backed workflow that returns reasoned Possible Connections rather than generic candidate cards.

## Context

Manual search must remain available. Users should be able to ask Ditto directly for people, expertise, opportunities, collaborators, or peers. But the output should not feel like a talent marketplace list. It should feel like a superconnector explaining why a few people might be worth considering.

This brief turns existing suggested candidates/scout reports into a richer Possible Connection model with rationale, provenance, risk, confidence, consent path, and save/refine actions.

## Objective

A user can run a manual search from `/network`, from an Active Request, or from a Member Signal. Ditto returns a compact set of Possible Connections with evidence, source labels, confidence, uncertainty, and clear next actions: refine, save to request, ask if open, or keep watching.

## Non-Goals

- No vector-search infrastructure unless existing data volume requires it.
- No public directory or faceted browsing.
- No third-party contact.
- No outbound claim invites; Brief 279 owns inviting discovered non-members.
- No background watch scheduler; this brief can save search into a request for Brief 275.
- No final email introduction fulfillment; Brief 276 owns facilitation.
- No platform-native DMs.

## Inputs

1. `docs/briefs/272-member-signal-onboarding-research-provenance.md` - Member Signal and claim provenance.
2. `docs/briefs/273-need-request-onboarding-manual-search-entry.md` - Active Request input.
3. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` - off-network scout, source-grounded results.
4. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` - intro gate and refusal triggers.
5. `packages/web/app/network/chat/suggested-candidates-panel.tsx` - current candidates panel.
6. `src/engine/network-scout.ts` - current off-network scout.
7. `packages/core/src/db/network/schema.ts` - network users, KB facts, requests, introductions.

## Constraints

- **Search result is a proposal, not a claim of fit.** Use "possible connection" language.
- **Every result has a why.** No naked list rows.
- **Every evidence item has provenance.**
- **Uncertainty is visible.** Show risks/gaps; do not overstate confidence.
- **Private facts are scrubbed.** Use private/on-request facts for reasoning only if allowed, but never quote them to the seeker unless authorized.
- **Search now can become background watch.** User can save/refine into Active Request.
- **No contact before consent.**
- **Off-network result can become discovery candidate.** A public, high-fit non-member result may be saved for Brief 279 discovery/invite review; search itself does not invite them.
- **Side-effecting search/scout tools require `stepRunId`.**
- **HTTP wrappers mint step runs.** Search routes, feedback routes, and save-to-request routes must reject caller-supplied `stepRunId`, including falsy values.
- **When Perplexity/web search is unavailable, public-web search degrades to internal/member-only search with clear copy.**
- **Manual Search is not Outbound Discovery.** Manual Search may save an Invitation Candidate for review, but it cannot create a Discovery Profile, claim token, invite, email, or contact attempt.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Suggested candidates panel | Brief 266 | adopt | Existing UI and match endpoint are the starting point. |
| Off-network scout | Brief 258 | adopt | Existing source-grounded public web scouting covers off-network candidates. |
| Possible Connection object | Original to Ditto | original | Distinguishes high-trust connection proposal from marketplace candidate. |
| Evidence/risk/result framing | Original to Ditto | original | Required for superconnector trust and network health. |
| Intro gate | Brief 261 | adopt | Search results hand off to consent-based intro, not direct contact. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add/extend `network_possible_connections`, `network_search_runs`, and `network_search_feedback` if persistence is needed. Avoid duplicating scout report storage if existing tables suffice. |
| `drizzle/network/{NEXT}_manual_search.sql` | Create if schema changes. |
| `src/engine/network-manual-search.ts` | Create: guarded `run_network_search(stepRunId, searchInput)` combining member signals, active requests, and off-network scout. |
| `src/engine/connection-proposal.ts` | Create: builds Possible Connection objects with why, evidence, risk, confidence, and recommended next step. |
| `src/engine/network-search-feedback.ts` | Create: records refine, not-a-fit, save, intro-request, hide. |
| `src/engine/tool-resolver.ts` | Modify: register `run_network_search` and feedback tool. |
| `src/engine/network-chat-prompt.ts` | Modify: Greeter language for manual search, uncertainty, and consent. |
| `packages/web/app/api/v1/network/search/route.ts` | Create: manual search endpoint using audited wrapper step run; rejects caller `stepRunId`. |
| `packages/web/components/network/search-box.tsx` | Create: manual search input with source scope and save-to-request affordance. |
| `packages/web/components/network/possible-connection-card.tsx` | Create: result card with why/evidence/risk/confidence/actions. |
| `packages/web/app/network/chat/suggested-candidates-panel.tsx` | Refactor: consume Possible Connection cards where possible. |
| `packages/web/components/network/search-results-panel.tsx` | Create: list, empty, loading, partial, web-unavailable states. |

## Possible Connection Shape

At minimum:

- `id`
- `source`: `ditto-member | public-web | imported-contact | user-provided`
- `personId` nullable
- `displayName`
- `headline`
- `canonicalUrl`
- `isDittoMember`
- `whyThisFits`
- `whyNow`
- `evidence[]`: source label, URL, snippet, claim id
- `risks[]`: missing proof, geography mismatch, seniority uncertainty, stale source, low context
- `confidence`: `low | medium | high`
- `networkHealthFlags`: high-demand, recently contacted, blocked, anti-persona risk
- `nextAction`: `refine | ask-if-open | save | watch | not-a-fit`
- `introEligibility`

## Lifecycle Boundary

Manual Search stops at Possible Connection unless the user takes a next action:

- `refine` updates the current search/session feedback only.
- `save` attaches the result to an Active Request.
- `watch` creates/updates a Background Watch seed for Brief 275.
- `ask-if-open` is disabled or rendered as "save proposal" until Brief 276's consent foundation is available.
- `save as invitation candidate` can queue a high-fit non-member for Brief 279, but does not create a Discovery Profile or send an invite.

Any transition out of Manual Search must write an audit event with actor, source result id, target lifecycle state, and scrub decision.

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write assertion |
|----------------|-------------|-------------------|--------------------------|---------------------------|
| `run_network_search(stepRunId, ...)` | External search, token spend, search-run persistence | Required; source-policy and private-scrub checks before write. | Search HTTP route or process step creates wrapper run. | Missing guard makes no external/LLM call and writes no search run. |
| `record_network_search_feedback(stepRunId, ...)` | Feedback/ranking preference write | Required; before/after audit. | Feedback route creates wrapper run. | Missing guard writes no feedback or ranking update. |
| Save result to Active Request | Request/result association write | Required; copied fields scrub private/on-request data. | Save route creates wrapper run. | Missing guard creates no association and copies no result fields. |
| Save off-network result as Invitation Candidate | Creates candidate for Brief 279 review | Required; no invite/contact; operator review required later. | Candidate-save route creates wrapper run. | Missing guard creates no Invitation Candidate and sends no invite/contact. |
| `/api/v1/network/search/*` routes | Wrapper invocation of guarded tools | Must not accept client-provided run ids. | Route mints wrapper run server-side. | Reject caller `stepRunId`, including `null`, `""`, `0`, `false`; guarded tool is not invoked and no rows are written. |

## Search Modes

- **Member search:** Ditto member signals only.
- **Public web search:** off-network source-grounded scout via `webSearch`.
- **Both:** merge and dedupe, member results prioritized when fit is equal.
- **From request:** query grounded in Active Request fields.
- **From member signal:** "find opportunities/people for me" grounded in approved signal and user's desired work.

## Acceptance Criteria

1. [ ] User can run manual search from `/network` without creating a full Member Signal.
2. [ ] User can run manual search from an Active Request.
3. [ ] User can run "find opportunities/people for me" from a Member Signal.
4. [ ] `run_network_search(stepRunId, ...)` refuses without `stepRunId` outside `DITTO_TEST_MODE`.
5. [ ] HTTP search route rejects any caller-supplied `stepRunId`.
6. [ ] Search result cards use "Possible Connection" framing and include why, evidence, risk/gaps, confidence, and next action.
7. [ ] Every evidence item has a source label and source URL or source id.
8. [ ] Private/on-request claims are not quoted in seeker-facing result copy unless authorized.
9. [ ] Perplexity/web-search unconfigured path returns member-only results or a clear "public web unavailable" state; it does not crash.
10. [ ] Search can return partial results: member results now, public-web still running/unavailable.
11. [ ] User can refine search in natural language; refinement is stored as feedback.
12. [ ] User can mark a result not relevant; reason is stored and affects future ranking in the same session/request.
13. [ ] User can save a search as an Active Request or attach it to an existing Active Request.
14. [ ] "Ask if open" is disabled, hidden, or rendered as "save proposal" until Brief 276's consent foundation exists; once available, it routes into Brief 276/261 and does not directly contact the person.
15. [ ] High-fit off-network results can be saved as Invitation Candidates for Brief 279 without sending any invite.
16. [ ] High-demand/recent-contact/network-health flags can suppress or downgrade a result with visible "not currently recommended" copy.
17. [ ] Tests cover source merge/dedupe, private scrub, stepRunId, wrapper bypass rejection including falsy values, unconfigured web search, refine feedback, invitation-candidate save, and consent-gated intro handoff.
18. [ ] Playwright covers search loading, success, empty, partial, and mobile result cards.

## Review Process

1. Spawn review agent with Briefs 270-274, Brief 258, Brief 261, architecture/review checklist.
2. Review agent checks evidence/provenance, private scrub, no-contact-before-consent, result language, and whether manual search remains first-class.
3. Present findings to human.

## Smoke Test

```bash
pnpm vitest run src/engine/network-manual-search*.test.ts src/engine/connection-proposal*.test.ts
pnpm --filter @ditto/web test -- search
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Open /network and choose "Find someone now".
# 2. Search "marketplace operations expert for a messy two-sided network".
# 3. Verify result cards include why, evidence, risks, source labels, and no private facts.
# 4. Mark one as not relevant and refine "more commercial, less academic".
# 5. Save as Active Request.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 274.
3. Capture any generalized "possible connection" object model in `docs/dictionary.md`.
