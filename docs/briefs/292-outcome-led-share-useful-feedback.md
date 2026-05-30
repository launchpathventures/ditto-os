# Brief 292: Outcome-Led Share + Useful Feedback Capture

**Date:** 2026-05-19
**Status:** draft (architect synthesis — pending human approval)
**Depends on:** Sub-brief 290 (Studio receives the outcome variant); parent Brief 277; Brief 282 (scrubber + audit substrate); Brief 276 (intro consent flow — Useful? hook attaches here)
**Unlocks:** Recognition-led outcome-share loop; Insight-238 second cross-surface evidence point

## Goal

- **Roadmap phase:** Phase 14 — Network Agent.
- **Capabilities:** The strongest, most trust-sensitive viral surface — after a useful introduction, let the member opt into an outcome-led share variant ("Ditto helped create a thoughtful connection that changed the brief"), gated by a minimal Useful? capture, an explicit consent checkbox, and a hard scrub-check that blocks Continue if any other-party name, deal detail, request text, or outcome value would leak.

## Context

The most powerful share is not "I joined a network" — it is "Ditto helped create a useful outcome." But outcome reporting is the highest-risk privacy surface in the entire Network: it inherently touches a second party (the introduced person), and may carry deal details the other side never consented to share. Sub-brief 292 builds the seed capture (a single Useful? thumb on Brief 276's intro accept/decline) and the consent-gated, scrub-checked path from that signal to an outcome-led share variant that flows into the Sub-brief 290 Studio.

This is privacy-critical. The parent brief (277) carries the Q5 ruling (add `"outcome-share"` to the scrubber surface tuple; route composes outcome-specific suppression the scrubber cannot know about), the outcome-share eligibility gate, and the side-effect matrix rows for the new routes. Read the parent first. This sub-brief hard-blocks on Brief 282's scrubber returning structured `ScrubDecision.withheldByReason` (confirmed present at `network-privacy-scrubber.ts:41-55`).

## Objective

After a member clicks "Useful" on a Brief 276 intro accept/decline event, an outcome-share entry becomes available (never auto-popped). Opening it presents an `AuthorizationRequestBlock` whose preview is a `ChecklistBlock` of scrub-check rows. The member writes (or accepts a generated) outcome note. The route runs the standard surface scrub (`scrubForSurface({surface: "outcome-share"})`) PLUS an outcome-specific composition that detects other-party names, deal details, request text, and outcome value. If any of those are present without consent, Continue is hard-disabled with no override. Only when the scrub-check passes AND the explicit consent checkbox is checked does the route generate the outcome variant and continue into the Sub-brief 290 Studio with that variant pre-loaded.

## Non-Goals

- No Share Studio shell, channel tabs, or channel variants — owned by Sub-brief 290 (this sub-brief produces ONE outcome variant that flows INTO that Studio).
- No attribution, visitor CTAs, cookies, or cross-apex handoff — owned by Sub-brief 291.
- No broad feedback platform — the Useful? capture is a single thumb on the Brief 276 intro accept/decline event; nothing more.
- No auto-popup of the outcome-share offer — the member must explicitly open it (parent eligibility rule 2).
- No outcome value, deal size, client name, or other-party endorsement in any generated copy — by construction, not by tuning.
- No override of a failed scrub-check — there is no "share anyway" button (parent constraint).
- No change to Brief 276's consent semantics or Brief 282's scrubber contract beyond the additive `"outcome-share"` surface enum.
- No retroactive outcome capture for intros that predate this build.

## Inputs

1. `docs/briefs/277-share-loop-public-profile-conversion.md` — **parent brief; required reading.** Q5 ruling; "Outcome-Led Share Moments" eligibility gate; side-effect matrix rows 3 (`outcome-share`) and 4 (`intros/[id]/useful`); Curate disposition (Insight-238 provisional).
2. `docs/briefs/290-share-studio-channel-variants.md` — sibling; the Studio that receives the pre-loaded outcome variant.
3. `docs/briefs/282-network-audit-scrubber-stoprun-substrate.md` — scrubber + audit substrate (hard dependency).
4. `docs/briefs/276-email-chat-consent-introductions.md` — intro consent flow; the Useful? hook attaches to its accept/decline events.
5. `docs/research/277-share-loop-public-profile-conversion.md` — Researcher §W-8 (outcome capture), §W-9 (consent + scrub-check composition), §CC-1 (stepRunId triangle).
6. `docs/research/277-share-loop-public-profile-conversion-ux.md` — Designer §Surface 2 (outcome-share consent flow), §Interaction States (outcome consent), §Curate-vs-Orient/Decide framing.
7. `src/engine/network-privacy-scrubber.ts` — `NETWORK_PRIVACY_SURFACES` tuple (line 11), `NetworkPrivacySurface` (line 22), `SURFACE_SET` (line 79), `ScrubDecision.withheldByReason` (lines 45–55), `scrubForSurface` (line 299). Add `"outcome-share"` to the tuple.
8. `packages/web/app/api/v1/network/intros/[id]/approve/route.ts` — Brief 276 intro accept/decline route; canonical `stepRunId` bypass-rejection at line 46 (copy this exact pattern); `recordRecipientApproval` / `recordRequesterApproval` are the accept/decline events the Useful? hook attaches to.
9. `src/engine/intro-approval.ts` — `recordRecipientApproval` / `recordRequesterApproval` (Useful? capture attaches downstream of these).
10. `packages/core/src/content-blocks.ts` — `AuthorizationRequestBlock` (line 340), `ChecklistBlock` (line 667).
11. `src/engine/network-step-run.ts` — `createNetworkLaneStepRun`.
12. `src/engine/network-audit.ts` — `writeNetworkAuditEvent` (new event classes).
13. `src/engine/generate-share-variants.ts` — outcome variant generation reuses this engine path with a new outcome-aware branch (NOT a new channel — an outcome flag).
14. `packages/core/src/db/network/schema.ts` — new `networkIntroOutcomes` table near `networkAuditEvents` (line 1426).
15. `drizzle/network/meta/_journal.json` — migration journal (Insight-190).
16. `docs/insights/180-steprun-guard-for-side-effecting-functions.md`, `docs/insights/211-no-self-http-from-engine-context.md`, `docs/insights/232-audited-http-route-wrapper-step-run-for-guarded-tools.md`, `docs/insights/239-validate-input-shape-before-minting-step-runs.md`, `docs/insights/190-migration-journal-concurrency.md`, `docs/insights/238-curate-is-the-seventh-human-job.md` (provisional — parent §Curate disposition).

## Constraints

- **Inherits every constraint from parent Brief 277.** Do not restate; read the parent's Constraints section, especially "Outcome shares require explicit consent + scrub."
- **Eligibility gate is conjunctive (parent "Outcome-Led Share Moments").** All four must hold: (1) member clicked Useful on a Brief 276 intro accept/decline; (2) member explicitly opened the outcome-share flow (no auto-popup); (3) scrub-check passes; (4) explicit consent checkbox checked. Missing any → no outcome variant generated.
- **Q5 division of responsibility is normative.** Add `"outcome-share"` to `NETWORK_PRIVACY_SURFACES` so every switch on `NetworkPrivacySurface` must handle it (good exhaustiveness pressure). The scrubber handles the standard withholding reasons it already knows (`private`, `hidden`, `onRequest`, `off`, `sensitiveField`, `antiPersona` — `scrubber.ts:45-55`). The scrubber does NOT know "this is an outcome-share"; the **route** composes the outcome-specific suppression: detect other-party name, deal/financial detail, verbatim request text, and outcome value in the member's outcome note, and surface each as a `ChecklistBlock` warning row that hard-blocks Continue.
- **Scrub-check failure blocks Continue with no override.** No "share anyway" path. The `AuthorizationRequestBlock` Continue action is disabled while any scrub-check row is in `warning` state. This is a hard gate, asserted by test.
- **Outcome copy must not imply guaranteed results, paid placement, or other-party endorsement.** Default tone: "Ditto helped find a thoughtful connection that changed the brief," never "I got X dollars / Y client." Enforced in the outcome-variant system prompt AND by a post-generation reject pattern (mirror of `SHARE_BUDGET_LANGUAGE_PATTERN`) covering currency, named-party, and outcome-value tokens.
- **Side-effecting functions require `stepRunId` per Insight-180.** Both new routes (`POST /api/v1/network/intros/[id]/useful`, `POST /api/v1/network/outcome-share`) reject any caller-supplied `stepRunId` including falsy values — copy the exact pattern from `intros/[id]/approve/route.ts:46`.
- **Mint-persisted inputs validated BEFORE `createNetworkLaneStepRun` (Insight-239).** `useful` route: `verdict ∈ ["useful","not-useful"]` and `introId` is a known intro row, both validated before mint. `outcome-share` route: `action ∈ ["preview-scrub","approve-and-generate"]` and `subjectIntroId` is a known intro row, both validated before mint.
- **Audited HTTP route wrapper triangle (Insight-232).** Both routes mint `createNetworkLaneStepRun`; the `useful` route mints for audit-chain coherence (no guarded tool); the `outcome-share` route mints because it calls the guarded variant-generation engine path. One audit event per side effect.
- **No engine self-HTTP (Insight-211).** Outcome variant generation is an in-process engine call (extend `generate-share-variants.ts` with an outcome branch); the route is a thin adapter. The route never `fetch`-es itself.
- **The `outcome-share-consent` rate-limit name is registered by Sub-brief 290, not here.** `networkRateLimitNameValues` is a closed `as const` union (parent Q9). Sub-brief 290 ships first and registers all three Brief 277 names (`share-studio-variant`, `share-attribution`, `outcome-share-consent`) in both `networkRateLimitNameValues` and `DEFAULT_POLICIES` (`outcome-share-consent` policy: `{ max: 10, windowMs: 3_600_000 }` — per-user, low-rate). This sub-brief depends on that registration (declared in **Depends on**) and must NOT edit the enum; it only calls `checkRateLimit({ limitName: "outcome-share-consent", … })`.
- **Migration sequencing follows Insight-190.** `networkIntroOutcomes` table: check `_journal.json` next `idx`, `drizzle-kit generate`, verify SQL + snapshot, resequence on conflict.
- **Brief 276 consent semantics unchanged.** The Useful? hook is additive to the accept/decline events; it does not alter the consent flow, the recipient preview, or the intro approval actions.
- **Curate is provisional (Insight-238, parent §Curate disposition).** This sub-brief labels the outcome-consent surface as serving **Curate** (the member shapes how a real outcome represents them publicly). If the human declines Insight-238 ratification, re-label as ORIENT (scrub-preview communicates state) + DECIDE (checkbox is the explicit choice). **Functional design is identical — only the job label changes. No build work changes either way.**

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `AuthorizationRequestBlock` carrying `preview` for consent | Brief 248/259 transcript-carrying pattern + `content-blocks.ts:340` | adopt | Same previewable-consent pattern used elsewhere; no new primitive. |
| `ChecklistBlock` for scrub-check rows (`done`/`warning` + `detail`) | `content-blocks.ts:667` | adopt | Purpose-built for done/pending/warning lines with optional detail. |
| Privacy scrubber + surface tuple exhaustiveness | Brief 282 `network-privacy-scrubber.ts:11,299` | adopt + extend (`"outcome-share"` surface) | The scrubber is the contract; adding the enum forces exhaustiveness on every consumer (Q5). |
| `ScrubDecision.withheldByReason` for scrub telemetry | `network-privacy-scrubber.ts:45-55` | adopt | Existing scrubber output already enumerates standard withholding reasons. |
| Intro accept/decline events as the Useful? attach point | Brief 276 `intro-approval.ts` + `intros/[id]/approve/route.ts` | adopt | The minimal capture rides on existing events; no parallel mechanism. |
| Variant generation engine path | Brief 260 `generate-share-variants.ts` | adopt + extend (outcome branch) | Outcome variant is a branch of the existing generator, not a new tool. |
| Canonical `stepRunId` bypass-rejection | `intros/[id]/approve/route.ts:46` | adopt | Exact pattern to copy for both new routes. |
| Wrapper-step-run lane helper | `src/engine/network-step-run.ts` (Insight-232) | adopt | Both routes mint wrappers. |
| Audit substrate | `src/engine/network-audit.ts` (Brief 282) | adopt + extend | New `intro_useful_recorded` + `outcome_share_consent_recorded` event classes. |
| Outcome-share with consent + other-party scrub | Original to Ditto | original | No external pattern combines outcome reporting with other-party privacy enforcement. |
| Recognition-led, consent-gated outcome share psychology | Original to Ditto | original | User direction: the strongest loop is earned outcome, never vanity. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/network-privacy-scrubber.ts` | **Modify.** Add `"outcome-share"` to `NETWORK_PRIVACY_SURFACES` (line 11). This forces every exhaustive switch on `NetworkPrivacySurface` to handle the new case — fix each compile error by giving `outcome-share` the strictest existing behavior (treat like `share`/`intro-email`: visitor-tier scrub, anti-persona nulled). `withheldByReason` shape unchanged (the outcome-specific suppression is route-composed, not scrubber-composed — Q5). |
| `src/engine/network-privacy-scrubber.test.ts` | **Modify.** Add `outcome-share` surface cases: private/hidden/on-request claims withheld; anti-persona nulled; `ScrubDecision.surface === "outcome-share"`; exhaustiveness (no `default:` swallow). |
| `src/engine/outcome-share-composition.ts` | **Create.** Pure function `composeOutcomeScrubChecks(note: string, intro: IntroContext): ChecklistBlock` returning rows for: other-party name present, deal/financial detail present (currency / "deal" / "contract" / "$"), verbatim request text present, outcome value present. Each row is `done` (clean) or `warning` (would leak) with a `detail` string. No I/O, no LLM, no `stepRunId`. |
| `src/engine/outcome-share-composition.test.ts` | **Create.** Table-driven: clean note → all `done`; note naming the other party → other-party `warning`; note with "$50k" → deal-detail `warning`; note pasting the request text → request-text `warning`; mixed → multiple warnings; the `ChecklistBlock` shape matches `content-blocks.ts:667`. |
| `src/engine/generate-share-variants.ts` | **Modify.** Add an `outcome?: { introId: string; note: string }` branch to `GenerateShareVariantsInput`. When set, generate a single outcome-led variant with the recognition-led, no-value, no-named-party system prompt. Add `OUTCOME_DISALLOWED_PATTERN` (currency / named-party / outcome-value tokens) and reject post-generation, mirroring `SHARE_BUDGET_LANGUAGE_PATTERN` at line 30/148. Existing channel behavior (Sub-brief 290) unchanged. |
| `src/engine/generate-share-variants.test.ts` | **Modify.** Outcome branch: produces a recognition-led variant; `OUTCOME_DISALLOWED_PATTERN` rejects currency/named-party/value; scrubber pre-pass still runs; `stepRunId` falsy still rejected. |
| `packages/web/app/api/v1/network/intros/[id]/useful/route.ts` | **Create.** `POST` accepting `{ verdict }`. Copy the exact `stepRunId` bypass-rejection from `intros/[id]/approve/route.ts:46`. Validate `verdict ∈ ["useful","not-useful"]` and `introId` (path param) is a known intro row BEFORE `createNetworkLaneStepRun({ route: "network-intro-useful", action: verdict })` (Insight-239). Insert `network_intro_outcomes` row + `writeNetworkAuditEvent({ eventClass: "intro_useful_recorded" })`. No guarded engine tool (wrapper is for audit-chain coherence). |
| `packages/web/app/api/v1/network/intros/[id]/useful/route.test.ts` | **Create.** `useful`/`not-useful` write a row + audit row; unknown `verdict` → 400 before mint (assert no wrapper-run); unknown `introId` → 400 before mint; `stepRunId` body key incl. falsy → 400; one audit event per call. |
| `packages/web/app/api/v1/network/outcome-share/route.ts` | **Create.** `POST` accepting `{ action, subjectIntroId, note, consent }`. Copy `stepRunId` bypass-rejection. Validate `action ∈ ["preview-scrub","approve-and-generate"]` and `subjectIntroId` is a known intro row with a recorded `useful` verdict BEFORE `createNetworkLaneStepRun({ route: "network-outcome-share", action })` (Insight-239). For `preview-scrub`: run `scrubForSurface({surface:"outcome-share"})` + `composeOutcomeScrubChecks`; return the `AuthorizationRequestBlock` with the `ChecklistBlock` preview; Continue disabled if any `warning`. For `approve-and-generate`: require `consent === true` AND zero scrub-check warnings (re-checked server-side, never trust client); generate the outcome variant via `generateShareVariants({ outcome })`; `writeNetworkAuditEvent({ eventClass: "outcome_share_consent_recorded" })`; return the variant for the Sub-brief 290 Studio to pre-load. Rate-limit `{ limitName: "outcome-share-consent", actor: { kind: "user", id } }` (Q9). |
| `packages/web/app/api/v1/network/outcome-share/route.test.ts` | **Create.** `preview-scrub` returns `AuthorizationRequestBlock` + `ChecklistBlock`; a warning row disables Continue; `approve-and-generate` with `consent:false` → 403; with warnings still present (client lied) → 403 (server re-check); clean + consent → variant generated, one audit row; unknown `action`/`subjectIntroId` → 400 before mint; `stepRunId` falsy → 400; intro without recorded `useful` → 403; rate-limit → 429. |
| `packages/web/components/network/outcome-share-consent.tsx` | **Create.** Renders the `AuthorizationRequestBlock` with the `ChecklistBlock` scrub-check preview, the editable outcome-note field, the explicit consent checkbox, and a Continue button that is disabled while any scrub-check row is `warning` OR the checkbox is unchecked. On Continue → calls `approve-and-generate` → on success opens the Sub-brief 290 Studio in `mode="studio"` with the outcome variant pre-loaded. No auto-popup; entry is an explicit member action only. |
| `packages/web/components/network/outcome-share-consent.test.tsx` | **Create.** Continue disabled when any row `warning`; disabled when checkbox unchecked; enabled only when all rows `done` AND checkbox checked; editing the note re-requests `preview-scrub`; success path opens Studio with the variant. |
| Brief 276 intro accept/decline UI (e.g. `packages/web/app/network/intros/...` recipient/requester view) | **Modify.** Add a single "Was this useful?" thumb-up/down on the accept and decline confirmation states, POSTing to the `useful` route. Purely additive; no change to the consent flow, recipient preview, or approval actions. |
| `packages/core/src/db/network/schema.ts` | **Modify.** Add `networkIntroOutcomes` pgTable near `networkAuditEvents` (line ~1426): `id`, `introId`, `memberId`, `verdict` (`useful`/`not-useful`), `ts`. No other-party identity, no deal data, no note text. |
| `drizzle/network/` migration | **Create.** `drizzle-kit generate` for `network_intro_outcomes`; verify SQL + snapshot for the new `idx` (Insight-190). |
| `e2e/network/outcome-share.spec.ts` | **Create.** Playwright: accept an intro (Brief 276) → click Useful → open outcome-share → write a note naming the other party → scrub-check shows other-party `warning` → Continue disabled → edit the note clean → all rows `done` → check consent → Continue → Studio opens with the outcome variant → confirm no currency/named-party/value in the variant → confirm no autopost. |

## User Experience

- **Jobs affected:** Capture (the Useful? thumb), Review (the scrub-check preview), Decide (the consent checkbox + Continue), **Curate** (the member shapes how a real outcome represents them publicly — Insight-238 provisional; falls back to Orient + Decide if the human declines ratification, with zero build change).
- **Primitives involved:** `AuthorizationRequestBlock` (consent gate), `ChecklistBlock` (scrub-check rows), editable note field, consent checkbox, the Sub-brief 290 Studio (receives the pre-loaded variant).
- **Process-owner perspective:** A non-technical observer reading an `outcome_share` run sees, in order: intro accepted (Brief 276) → member clicked Useful → member explicitly opened outcome-share → wrote a note → scrub-check flagged the other party's name as a warning → Continue blocked → member rewrote the note without the name → all rows clean → member checked the consent box → Continue → outcome variant generated → Studio opened with it pre-loaded. No value, no named party, no autopost anywhere.
- **Interaction states:** Designer §Interaction States (outcome consent) — presenting-scrub (rows rendering) / presenting-scrub-fail (one+ `warning`, Continue hard-disabled) / consenting (rows clean, awaiting checkbox) / continuing (generating variant) / skipped (member closed without continuing) / error (generation failed — no variant, no audit-consent row written).
- **Designer input:** `docs/research/277-share-loop-public-profile-conversion-ux.md` (CLEAN-PASS 2026-05-19) §Surface 2, §Interaction States, §Curate-vs-Orient/Decide framing.

## Acceptance Criteria

1. [ ] `"outcome-share"` is added to `NETWORK_PRIVACY_SURFACES`; the build fails until every exhaustive switch on `NetworkPrivacySurface` handles it (no `default:` swallow); `outcome-share` gets visitor-tier scrub with anti-persona nulled; `ScrubDecision.surface === "outcome-share"` round-trips.
2. [ ] The Useful? capture is a single thumb-up/down additive to Brief 276's intro accept AND decline confirmation states; `POST /api/v1/network/intros/[id]/useful` writes one `network_intro_outcomes` row + one `intro_useful_recorded` audit row; Brief 276 consent semantics, recipient preview, and approval actions are unchanged (existing Brief 276 tests pass unmodified).
3. [ ] Outcome-share is eligible only when ALL four hold (Useful clicked; member explicitly opened it; scrub-check passes; consent checked); there is no auto-popup; an intro without a recorded `useful` verdict returns 403 from the outcome-share route.
4. [ ] `composeOutcomeScrubChecks` is a pure function returning a `ChecklistBlock` whose rows flag other-party name, deal/financial detail, verbatim request text, and outcome value; each row is `done` or `warning` with a `detail` — verified by table-driven tests.
5. [ ] The consent `AuthorizationRequestBlock` Continue action is hard-disabled while ANY scrub-check row is `warning` OR the consent checkbox is unchecked; there is no override / "share anyway" path; the server re-checks both conditions on `approve-and-generate` and returns 403 if a client submits with warnings or `consent:false`.
6. [ ] Both new routes reject any caller-supplied `stepRunId` including falsy values (copied from `intros/[id]/approve/route.ts:46`); both validate their mint-persisted inputs (`verdict`+`introId`; `action`+`subjectIntroId`) against allow-lists/known rows BEFORE `createNetworkLaneStepRun` (Insight-239 — test asserts no wrapper-run audit record is appended on rejection).
7. [ ] The outcome variant is generated by the in-process `generateShareVariants` outcome branch (Insight-211 — no engine self-`fetch`); `OUTCOME_DISALLOWED_PATTERN` rejects any currency, named-party, or outcome-value token post-generation; the public-claim scrubber pre-pass still runs.
8. [ ] On a clean, consented `approve-and-generate`, exactly one `outcome_share_consent_recorded` audit row is written and the Sub-brief 290 Studio opens in `mode="studio"` with the outcome variant pre-loaded; on generation error, no variant and no consent-audit row is written.
9. [ ] `network_intro_outcomes` is added via a Drizzle migration with correctly sequenced journal `idx` + SQL + snapshot (Insight-190); the table stores no other-party identity, no deal data, and no note text.
10. [ ] `outcome-share-consent` rate limit (per-user, low-rate, Q9) gates the outcome-share route via the canonical `checkRateLimit` substrate (no in-memory map); over-limit returns 429.
11. [ ] Tests + Playwright cover: scrubber `outcome-share` surface, Useful? capture, scrub-check warnings blocking Continue, server-side consent re-check, outcome variant disallowed-pattern rejection, no autopost, and the full accept→Useful→consent→Studio path.

## Review Process

1. Spawn review agent (fresh context) with this sub-brief + parent Brief 277 + Sub-brief 290 + `docs/architecture.md` + `docs/review-checklist.md` + both `docs/research/277-*` reports + `docs/briefs/282-...` + `docs/briefs/276-...`.
2. Review agent checks:
   - Q5 division is implemented correctly: scrubber gets the surface enum (exhaustiveness), the route composes the outcome-specific other-party/deal/request/value suppression the scrubber cannot know.
   - Scrub-check is a hard gate with no override; server re-checks consent + warnings (never trusts the client).
   - Insight-180 falsy-`stepRunId` rejection on both routes (pattern copied from the canonical site); Insight-239 pre-mint validation for all mint-persisted inputs; Insight-232 wrapper triangle; Insight-211 in-process variant gen; Insight-190 migration sequencing.
   - `network_intro_outcomes` stores no other-party identity / deal / note text.
   - Brief 276 consent flow and Brief 282 scrubber contract are not regressed (only additive surface enum + additive Useful? thumb).
   - Curate disposition matches parent §Curate disposition (provisional; identical functional design under the Orient+Decide fallback).
   - No leakage into Sub-brief 290 (Studio shell) or 291 (attribution/visitor) scope; all Work Product paths valid; ACs boolean and cover parent AC 9a + outcome capture + consent + scrub + variant gen + audit + tests.
3. Present sub-brief + review findings to human for approval.

## Smoke Test

```bash
pnpm run type-check
pnpm vitest run src/engine/network-privacy-scrubber.test.ts
pnpm vitest run src/engine/outcome-share-composition.test.ts
pnpm vitest run src/engine/generate-share-variants.test.ts
pnpm vitest run packages/web/app/api/v1/network/intros/\[id\]/useful/route.test.ts
pnpm vitest run packages/web/app/api/v1/network/outcome-share/route.test.ts
pnpm vitest run packages/web/components/network/outcome-share-consent.test.tsx
pnpm exec playwright test e2e/network/outcome-share.spec.ts
```

Manual smoke (web):
1. Accept an intro through the Brief 276 consent flow in a sandbox account.
2. On the accept confirmation, click the "Was this useful?" thumb-up — confirm one `network_intro_outcomes` row + one `intro_useful_recorded` audit row.
3. Explicitly open the outcome-share flow (confirm it never auto-popped).
4. Write an outcome note that names the introduced person — confirm the scrub-check shows an other-party `warning` row and Continue is disabled.
5. Add a "$50k" figure — confirm a deal-detail `warning` row appears.
6. Rewrite the note clean — confirm all rows go `done` and the consent checkbox is required.
7. Check the consent box → Continue → confirm the Studio (Sub-brief 290) opens with the outcome variant pre-loaded and the variant contains no currency, no named party, no outcome value.
8. Confirm exactly one `outcome_share_consent_recorded` audit row; confirm no autopost / auto-DM occurred.
9. Tamper a client request to send `consent:false` (or with warnings present) to `approve-and-generate` → confirm server 403.

## After Completion

1. Update `docs/state.md` rolling log + `docs/roadmap.md` row 277 with Sub-brief 292 completion (last of the three).
2. Write a design insight in `docs/insights/` titled "Recognition-led, consent-gated outcome sharing as the lowest-friction-highest-trust viral loop" if the pattern proves out (parent §After Completion item 3).
3. Insight-238 ratification path: this sub-brief's Curate-vs-Orient/Decide framing is the **second cross-surface evidence point**. When the human ratifies Curate as the 7th human job, the Documenter absorbs it into `docs/human-layer.md` and cites this surface. If declined, no code changes — only the job label in this brief + the parent §Curate disposition.
4. After all three sub-briefs (290/291/292) merge, parent Brief 277 §After Completion item 5 applies (consider whether the channel-prompt registry warrants its own brief).
