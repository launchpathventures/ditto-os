# Brief 272: Member Signal Onboarding, Research, and Provenance

**Date:** 2026-05-14
**Status:** built pending review/human approval
**Depends on:** Brief 271; Brief 256; Brief 258; Brief 259; Brief 260
**Unlocks:** Briefs 274, 275, 277, 278, 279

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Let a user quickly share LinkedIn, website, X, Instagram, or other sources so Ditto can research them, draft a provenance-backed Member Signal, and make their professional magic legible.

## Context

The existing expert lane asks questions and emits a profile card. That is useful, but it still makes the user do too much self-description. The core product promise is stronger: Ditto should understand what someone is great at by researching the signals they already have across the web and their own channels.

The first "aha" should be:

> Ditto understood my professional magic faster and more clearly than I could explain it myself.

This requires a dedicated Member Signal onboarding flow with source intake, research status, provenance, user review, and public/private controls.

## Objective

A new member can paste a LinkedIn URL, website, X URL, Instagram URL, additional URLs, or text. Ditto researches the available public/user-provided context, drafts a Member Signal, labels every claim with provenance, asks a small number of calibration questions, and lets the user approve/edit/hide/publicize/share the result.

## Non-Goals

- No unauthorized scraping or login-required scraping.
- No native LinkedIn/X/Instagram OAuth in this brief.
- No auto-posting to social channels.
- No deep image/video understanding beyond optional screenshot/upload metadata unless existing vision tooling is already available and safe.
- No private claim publication without explicit user approval.
- No full CRM/contact import.
- No matching/search UI beyond producing the signal that later briefs consume.
- No outbound discovery or claim invites for non-members; Brief 279 owns discovered profiles and invitations. This brief owns member-provided or claim-token-entered signal review.

## Inputs

1. `docs/briefs/271-network-doctrine-ia-copy-superconnector.md` - terms and IA.
2. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` - KB facts, per-fact visibility, web-search/scout route, `webSearch`.
3. `docs/briefs/complete/256-network-expert-intake-card.md` - profile card schema and expert intake.
4. `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` - public profile-as-chat and representative rules.
5. `docs/briefs/260-network-share-modal-og-and-png.md` - share surfaces that consume the finished signal.
6. `src/engine/web-search.ts` - Perplexity Sonar search helper; fails closed when unconfigured.
7. `src/engine/network-kb-*` - fact extraction, storage, context, and feedback modules.
8. `packages/core/src/db/network/schema.ts` - network-tier schema.
9. `packages/web/app/network/chat/network-kb-shelf.tsx` - current KB intake UI.

## Constraints

- **Every claim needs provenance.** No claim may appear as a plain fact unless it has source label and confidence.
- **Public/private split is explicit.** User can set each claim to `public`, `on-request`, `private`, or `hidden`.
- **Inferences are labeled.** If Ditto infers something from multiple sources, label it as `inferred by Ditto`.
- **Platform constraints are respected.** LinkedIn, X, and Instagram ingestion must degrade gracefully if content is unavailable.
- **Perplexity is enrichment, not authority.** The system works without `PERPLEXITY_API_KEY`; when configured, results are cited and reviewable.
- **User correction is feedback.** Edits, hides, and source removals must be recorded for future matching.
- **No background contact.** Researching a member never contacts third parties.
- **Claim-token entry is allowed.** If the user arrives from a Brief 279 claim invite, they must see what Ditto found, approve/edit/hide/delete claims, and consent before any public Member Signal is created. **Scope split with Brief 279:** the token table (`network_claim_tokens`) and the `/api/v1/network/invites/[token]/claim/route.ts` redemption route are owned by Brief 279. Brief 272 owns only the downstream review surface; the redemption route must land the redeeming user on `/network/signal` with a Member Signal whose claims are `suggested` + `on-request`, which the existing review UI already gates against public publication.
- **Side-effecting research tools require `stepRunId`.**
- **HTTP wrappers mint step runs.** Any route that invokes research/draft/update tools must reject caller-supplied `stepRunId`, including falsy values, and create the wrapper step run server-side.
- **No Network/Workspace boundary break.** Network-tier public/member signal storage lives in Network Postgres; workspace-private Self memory remains workspace-scoped unless explicitly projected.
- **Discovery Profile is not Member Signal.** Discovery Profiles are internal pre-claim records owned by Brief 279. This brief may consume them only through the claim-token path, and only after the discovered person reviews what Ditto found.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Source-backed fact extraction | Brief 258 KB intake | adopt | Already stores facts with source and visibility. |
| Public profile-as-chat projection | Brief 259 | adopt | Member Signal powers the representative surface. |
| Shareable profile card | Brief 260 | adopt | Approved Member Signal should feed the card and share assets. |
| Web enrichment via Perplexity | Existing `src/engine/web-search.ts` | adopt | Already implemented as graceful Sonar helper. |
| Claim provenance review | Original to Ditto | original | Product needs source-level trust to avoid black-box AI profiles. |
| Professional magic framing | Original to Ditto | original | User-supplied product psychology: the signal must uniquely highlight each member. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add/extend `network_member_signals`, `network_signal_sources`, `network_signal_claims`, and `network_signal_review_events` only after inspecting existing KB tables. `network_user_kb_documents`/`network_user_kb_facts` remain raw evidence; Member Signal claims are curated projections with approval/visibility. Do not duplicate raw source snippets into a parallel evidence store without a migration note. |
| `drizzle/network/{NEXT}_member_signal.sql` | Create: generated migration for any new/changed Network tables. |
| `src/engine/member-signal-source.ts` | Create: URL/source normalizer for LinkedIn, website, X, Instagram, GitHub, Substack, YouTube, portfolio, other URL, pasted text, upload. |
| `src/engine/member-signal-research.ts` | Create: guarded tool `research_member_signal(stepRunId, userId, sources)`; fetches safe public/user-provided context, calls `webSearch` when configured, returns source records and raw snippets with citation URLs. |
| `src/engine/member-signal-draft.ts` | Create: guarded tool `draft_member_signal(stepRunId, userId, researchBundle)`; outputs structured signal sections and claims. |
| `src/engine/member-signal-review.ts` | Create: saves approve/edit/hide/visibility events as feedback. |
| `src/engine/tool-resolver.ts` | Modify: register `research_member_signal`, `draft_member_signal`, `update_member_signal_claim`. |
| `src/engine/network-chat-prompt.ts` | Modify: add member-signal onboarding directive with provenance and no-unauthorized-scraping rules. |
| `packages/web/app/network/signal/page.tsx` | Create or route: source intake and review surface, or integrate into existing `/network/chat` if design chooses chat-first. |
| `packages/web/components/network/member-signal-source-intake.tsx` | Create: URL chips/input, paste/upload affordances, source status rows. |
| `packages/web/components/network/member-signal-review.tsx` | Create: structured review UI for known-for, best-fit, bad-fit, open-to, current-focus, proof, sources, visibility. |
| `packages/web/components/network/member-signal-provenance.tsx` | Create: inline source label component used by review, profile, search, and public pages. |
| `packages/web/app/people/[handle]/profile-chat-client.tsx` | Modify: public profile draws from approved public Member Signal claims. |
| `packages/web/components/network/card-silhouette.tsx` | Modify if needed: card consumes approved Member Signal fields only. |

## Member Signal Shape

At minimum:

- `knownFor`: 1-3 crisp statements.
- `bestIntroducedFor`: contexts where an intro is welcome.
- `canHelpWith`: concrete capabilities.
- `currentFocus`: what the member is doing now.
- `openTo`: opportunities, collaborations, clients, advisors, hiring, speaking, investing, etc.
- `notAFitFor`: anti-persona / bad-fit intro rules.
- `proof`: projects, roles, links, publications, case studies, posts, outcomes.
- `tasteAndStyle`: optional signal about how they work.
- `preferredIntroStyle`: email, async note, warm intro only, ask first, etc.
- `sourceSummary`: source coverage and gaps.

Each claim:

- `id`
- `memberSignalId`
- `section`
- `claimText`
- `sourceType`
- `sourceLabel`
- `sourceUrl`
- `evidenceSnippet`
- `confidence`
- `visibility`
- `approvalState`
- `createdAt`
- `updatedAt`

## Data Model Boundary

Member Signal is the reviewed, user-controlled projection of a person's professional signal. It is not the raw research corpus.

- Raw uploaded/pasted/source material remains in KB/source tables.
- Signal claims point back to source/fact ids or source records.
- User edits create review/feedback events, preserving before/after text.
- Hidden/private/on-request claims may inform internal fit reasoning only through the central scrubber defined in Brief 278.
- A Brief 279 Discovery Profile cannot create a public `/people/[handle]` page, `networkUsers.handle`, or public Member Signal claims until the person claims and approves.
- If the Builder needs a new `network_signal_sources` table, it must document why `network_user_kb_documents` is insufficient and how the two stay in sync.

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write assertion |
|----------------|-------------|-------------------|--------------------------|---------------------------|
| `research_member_signal(stepRunId, ...)` | External/public research, token spend, source row creation | Required; source-policy check before fetch/write. | Calling HTTP route or process step creates wrapper run. | Missing guard makes no external call and writes no source rows. |
| `draft_member_signal(stepRunId, ...)` | LLM token spend, draft claim creation | Required; every claim must retain provenance. | Calling HTTP route or process step creates wrapper run. | Missing guard makes no LLM call and writes no draft claims. |
| `update_member_signal_claim(stepRunId, ...)` | Claim edit, visibility change, publication-state write | Required; writes review event with before/after. | Claim edit/review HTTP route creates wrapper run. | Missing guard writes no claim/review event. |
| `/api/v1/network/signal/*` routes | Wrapper invocation of guarded tools | Must not accept client-provided run ids. | Route mints wrapper run server-side. | Reject any body containing `stepRunId`, including `null`, `""`, `0`, `false`; guarded tool is not invoked. |
| Claim-token review route | Converts internal Discovery Profile into reviewed Member Signal | Server-created wrapper run only; valid token required. | Claim-token route mints wrapper run server-side. | Caller `stepRunId` or invalid token yields no public profile, handle, claim, or review-event write. |

## Onboarding Flow

1. **Source intake**
   - User adds LinkedIn, website, X, Instagram, other URLs, pasted bio, or upload.
   - UI explains only what is necessary: "Add a few places Ditto should read. You approve what becomes public."

2. **Research progress**
   - Status rows: queued, reading, found, limited, failed, needs paste.
   - Instagram/LinkedIn constrained states are explicit: "Could not read beyond public bio. Paste text or upload screenshots if you want Ditto to consider more."

3. **Draft signal**
   - Ditto drafts structured signal.
   - Every claim has source chip.
   - Uncertain claims sit in "Needs your review."

4. **Calibration**
   - Ask 3-5 questions only where the research cannot infer:
     - What do people usually come to you for?
     - What kind of work do you want more of?
     - What should Ditto avoid introducing you for?
     - Who would be valuable for you to meet this quarter?

5. **Review and publish**
   - User approves sections.
   - User sets public/private/on-request.
   - Public profile and share card update.

6. **Next action**
   - Share signal.
   - Create request.
   - Find someone now.
   - Start background watch.

## Acceptance Criteria

1. [ ] User can add LinkedIn URL, website URL, X URL, Instagram URL, other URLs, pasted text, and upload/text import as source inputs.
2. [ ] Source normalizer classifies source type and preserves original URL/text provenance.
3. [ ] LinkedIn, X, and Instagram limited-access cases render clear fallback states instead of failing silently.
4. [ ] `research_member_signal(stepRunId, ...)` refuses without `stepRunId` outside `DITTO_TEST_MODE`.
5. [ ] Research works when `PERPLEXITY_API_KEY` is absent; web enrichment returns "unconfigured" state without blocking user-provided sources.
6. [ ] When Perplexity/web search is configured, every result used in a claim stores source URL and source label.
7. [ ] `draft_member_signal(stepRunId, ...)` refuses without `stepRunId` and returns structured sections listed in this brief.
8. [ ] Every drafted claim has source label, source URL or user-provided source id, confidence, and visibility.
9. [ ] Claims inferred across multiple sources are labeled `inferred by Ditto`.
10. [ ] User can approve, edit, hide, and change visibility per claim.
11. [ ] User edits are persisted as feedback events and update the live signal.
12. [ ] No claim becomes public until explicitly approved or covered by a clear "approve all public suggestions" action.
13. [ ] Public `/people/[handle]` surfaces only approved public claims; `on-request` claims are not shown directly but can drive "ask the member" behavior.
14. [ ] Share card and OG/PNG surfaces consume only approved public claims.
15. [ ] Search/matching can consume private/on-request claims only for internal fit reasoning and must scrub them from candidate-facing/searcher-facing copy.
16. [ ] Component tests cover source intake, limited-source fallback, claim review, visibility changes, and public/private rendering.
17. [ ] Engine tests cover `stepRunId` enforcement, Perplexity-unconfigured path, provenance persistence, and no-public-without-approval.
18. [ ] Member Signal claim storage references source/fact records rather than duplicating raw evidence without a documented migration note.
19. [ ] Claim-token flow cannot create a public profile, public handle, or public Member Signal claim until the person approves.
20. [ ] HTTP routes reject caller-supplied `stepRunId`, including falsy values, and tests assert guarded tools are not invoked and no rows are written on bypass.
21. [ ] Playwright smoke covers first-time member onboarding from source input to approved signal.

## Review Process

1. Spawn review agent with Briefs 270-272, Brief 258, Brief 259, Brief 260, `docs/architecture.md`, and `docs/review-checklist.md`.
2. Review agent checks provenance rigor, platform-conservative ingestion, privacy boundaries, signal/schema duplication risk, public rendering, and source-limited fallbacks.
3. Present review findings and unresolved platform constraints to human.

## Smoke Test

```bash
pnpm vitest run src/engine/member-signal-*.test.ts
pnpm --filter @ditto/web test -- member-signal
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Open /network and choose "Help Ditto understand me".
# 2. Add a website URL, X URL, Instagram URL, and pasted bio.
# 3. Verify source status rows.
# 4. Draft signal.
# 5. Approve one claim, hide one claim, mark one on-request.
# 6. Open /people/{handle}; verify only approved public claim appears.
# 7. Open share modal; verify hidden/on-request claims are absent.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 272.
3. If the claim/provenance model proves durable, add it to `docs/dictionary.md` and consider an ADR if it affects architecture-wide memory/provenance.
