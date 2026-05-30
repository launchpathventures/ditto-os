# Brief 287: Closeout — Review-Checklist Gates, Dictionary, Regression, Parent-270 Acceptance

**Date:** 2026-05-18
**Status:** implemented 2026-05-19; closeout-checkpoint reviewer caught two defects (misattribution of pre-existing review-checklist items #18/#19 from the 2026-05-18 ref-doc reconciliation session, and an in-session expansion of `Possible Connection` that violated Brief 271 idempotency); both fixed under "fix all" — checklist diff now correctly attributed in `docs/state.md`, dictionary `Possible Connection` reverted to Brief 271 form. Closeout set (285, 286, 287) ready for fresh-context closeout-checkpoint re-review; pending human approval to close parent Brief 270
**Depends on:** Sub-briefs **285, 286**; Briefs **275-277** (the surfaces the regression suite spans); the whole 272-279 program
**Unlocks:** the **closeout checkpoint** → human approval to close parent Brief 270

> Closeout sub-brief 3 of 3 under parent **Brief 278**. The acceptance/documentation gate that closes the Network Superconnector Reframe program. Small by nature (2 ACs) — it is the closeout glue, not a build.

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Durable review-checklist gates for the Network superconnector trust model, finalized dictionary terms, the full superconnector regression suite, and the parent-270 closeout acceptance.

## Context

After the member Privacy Center (285) and operator dashboard (286) land, the parent program needs durable review gates so future Network work is reviewed against the trust model, the canonical Brief 270 terms finalized in the dictionary, a regression suite spanning Briefs 272-279, and a single acceptance pass that lets the human close parent Brief 270. The Designer correctly flagged the review-checklist gates as engine/policy patterns out of UX scope (D-Q7); the parent assigned the enumeration to this sub-brief.

## Objective

`docs/review-checklist.md` carries seven durable Network trust gates; `docs/dictionary.md` has the finalized canonical terms; a focused regression suite runs green across Briefs 272-279 plus root type-check; and the closeout acceptance pass is ready for the fresh-context closeout review and human approval to close parent Brief 270.

## Non-Goals

- No new product code or UI — this is documentation + test-aggregation + acceptance.
- No new review *process* — it adds gates to the existing checklist, it does not change how reviews run.
- No reopening of resolved parent open questions.
- Does not itself close parent Brief 270 — it prepares the acceptance; the human closes after the fresh-context closeout review (parent §Review Process step 3-4).

## Inputs

1. `docs/briefs/278-trust-privacy-admin-observability.md` — parent; D-Q7 (the 7 gates enumerated), §Acceptance Criteria, §After Completion.
2. `docs/research/278-trust-privacy-admin-ux.md` §8 Q7 — the flag that these are engine/policy gates, Architect-owned.
3. `docs/review-checklist.md` — the current gates (append, don't restructure).
4. `docs/dictionary.md` — current terms; `docs/briefs/270-network-superconnector-reframe-parent.md` canonical objects/lifecycle table (the terms to finalize, if 271 didn't).
5. `docs/briefs/271-network-doctrine-ia-copy-superconnector.md` — check whether dictionary finalization already happened there (avoid double-work).
6. Briefs 272-279 + sub-briefs 282-286 — the surfaces/tests the regression suite spans.

## Constraints

- Side-effecting functions require `stepRunId` per Insight-180 — N/A here (no new side-effecting code); state this explicitly so the reviewer can confirm the no-op.
- Review-checklist additions are **append-only** durable gates; do not restructure existing checklist content.
- The seven gates are exactly those the parent enumerated (D-Q7): (1) Member Signal provenance, (2) private-leakage scrub coverage, (3) no-contact background watch, (4) two-sided intro consent, (5) claim-before-public discovery, (6) outbound-email suppression/compliance, (7) source-policy enforcement-before-store/outreach.
- Dictionary finalization is idempotent: if Brief 271 already finalized a term, leave it; only add/finish the missing canonical Brief 270 terms.
- The regression suite is **focused** (the parent's named test globs across 272-279), not a full repo run; it must include root `pnpm run type-check`.
- `@ditto/core` boundary: docs only + a test-aggregation script if needed; no engine/product code.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Durable review gates | Existing `docs/review-checklist.md` 12-point pattern | adopt | Same boolean-gate idiom; this extends it with Network trust gates. |
| The 7 gate definitions | Parent Brief 278 D-Q7; Briefs 261/272-279 trust rules | adopt | The parent enumerated them from the program's own trust rules. |
| Dictionary canonical terms | Brief 270 canonical objects/lifecycle table | adopt | The program's own canonical vocabulary. |
| Focused regression idiom | Parent §Smoke Test test globs | adopt | The parent already named the focused test surface. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/review-checklist.md` | Modify (append): add the 7 durable Network trust gates as boolean review items with a one-line "how to verify" each. |
| `docs/dictionary.md` | Modify: finalize the canonical Brief 270 terms not already finalized in Brief 271 (idempotent — check 271 first). |
| `docs/briefs/278-...` / sub-briefs status | Modify: mark the closeout set ready for the fresh-context closeout review. |
| a focused regression script/entry (e.g. a documented `pnpm` invocation or `package.json` script) | Create/Modify: one command that runs the parent's named focused test globs across Briefs 272-279 + sub-briefs 282-286 + root `pnpm run type-check`. |

## User Experience

- **Jobs affected:** None — documentation, review-gate, and acceptance work; no user-facing surface.
- **Primitives involved:** None.
- **Process-owner perspective:** invisible to end users; the *reviewer* of future Network work experiences the seven new gates as the durable trust contract.
- **Interaction states:** N/A.
- **Designer input:** `docs/research/278-trust-privacy-admin-ux.md` §8 Q7 — the Designer explicitly flagged these as non-UX engine/policy gates, correctly out of the UX spec; this brief owns them per the parent.

## Acceptance Criteria

1. [ ] (Parent AC #25) `docs/review-checklist.md` includes the seven durable, boolean review gates — Member Signal provenance; private-leakage scrub coverage; no-contact background watch; two-sided intro consent; claim-before-public discovery; outbound-email suppression/compliance; source-policy enforcement-before-store/outreach — each with a one-line verification note, appended without restructuring existing content.
2. [ ] (Parent AC #29) The focused superconnector regression suite runs green across Briefs 272-279 + sub-briefs 282-286 plus root `pnpm run type-check`, invocable by a single documented command.
3. [ ] **(Internal AC — dictionary idempotency; supports parent §After Completion, not one of the 29 parent ACs.)** `docs/dictionary.md` contains the finalized canonical Brief 270 terms; terms already finalized in Brief 271 are unchanged (idempotent — a diff against 271 shows no churn of already-final terms).
4. [ ] **(Internal AC — closeout-set-ready marker; the procedural gate that triggers the closeout fresh-context review per parent §Review Process step 3, not one of the 29 parent ACs.)** The closeout set (285, 286, 287) is marked ready for the fresh-context closeout review; the parent §Review Process step 3 inputs are assembled.

## Review Process

1. **This triggers the closeout checkpoint.** Spawn the **closeout** fresh-context review agent with Briefs 270-279, sub-briefs 282-287, `docs/architecture.md`, `docs/review-checklist.md` (with the new gates), and all implemented diffs (parent §Review Process step 3).
2. Closeout reviewer checks: all closeout ACs (13-29) pass; the seven gates are durable and boolean; the regression suite is green; no resolved parent open question regressed; dictionary finalized without churn.
3. Present the full program + closeout review findings to the human **before closing parent Brief 270** (parent §Review Process step 4).

## Smoke Test

```bash
# The single focused regression command this brief defines, e.g.:
pnpm vitest run src/engine/network-privacy-scrubber*.test.ts src/engine/network-audit*.test.ts \
  src/engine/network-abuse-controls*.test.ts src/engine/discovery-source-policy*.test.ts \
  src/engine/network-suppression*.test.ts src/engine/network-email-compliance*.test.ts \
  src/engine/network-identity-verification*.test.ts src/engine/network-retention*.test.ts
pnpm --filter @ditto/web test -- privacy network-health
pnpm run type-check

# Manual:
# 1. Open docs/review-checklist.md → the 7 Network trust gates are present, boolean, each with a verify note; pre-existing gates unchanged.
# 2. Open docs/dictionary.md → Brief 270 canonical terms finalized; diff vs 271 shows no churn of already-final terms.
# 3. Run the single regression command → green, including type-check.
```

## After Completion

1. Update `docs/state.md` (closeout set 285-287 complete; **closeout checkpoint** ready; parent 270 pending fresh-context review + human approval).
2. Update `docs/roadmap.md` rows 278 and 270.
3. Run the **closeout-checkpoint retrospective** (the second parent checkpoint): what worked across the 282-287 split, what surprised, what to change in future parent/sub-brief programs.
4. After the closeout fresh-context review and human approval: move parent Brief 270 (and 278 + 282-287) to complete; the Documenter records the human's Insight-238 (Curate 7th job) ruling in `docs/human-layer.md` and the "Network audiences" persona note in `docs/personas.md`.
5. Write the **Network Superconnector trust/privacy-model ADR** (audit topology R-Q1/Q2/Q10, hybrid delete/tombstone R-Q9, retention defaults, identity-verifier seam R-Q7, in-code source-policy R-Q4) — the architecture is now built and durable (parent §After Completion #5).
