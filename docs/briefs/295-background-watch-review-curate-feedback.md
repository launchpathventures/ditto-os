# Brief 295: Background Watch — Review, Curate UI, and Feedback

**Date:** 2026-05-19
**Status:** draft
**Depends on:** Brief 293 (engine skeleton — proposals, watch state machine, audit); Brief 294 (digest delivery); Brief 274 (Possible Connection card patterns); Brief 261 (Hard Rule #5); Brief 283 (privacy scrubber); Brief 279 (invitation-candidate path)
**Unlocks:** Closes parent Brief 275
**Parent:** Brief 275 (read it for decisions D1–D16, especially D5, D9, D13, D16, and OQ-1/2/3)

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** The Review and Curate surfaces — watch status, the explainable proposal queue, three-state dismiss, the Curate settings panel, auto-pause, outcome capture, invitation-candidate handoff display, and operator failure visibility. Roadmap row 275 (part 3 of 3, closes the parent).

## Context

Briefs 293/294 make the watch run and deliver. This sub-brief makes it **felt and controllable**. It is the user's whole relationship with the watch: how they review proposals, decline calmly (three-state), refine, see status, curate settings, and report outcomes. It also wires the feedback **enum + filter** so declines actually shape subsequent runs (293 reads `loadWatchSuppressedKeys`; this brief writes what it reads).

This is where Curate becomes a load-bearing human job (Insight-238, status `active`, pending ratification) and where Brief 261 Hard Rule #5 is most exposed — every rendered field must be scrubbed and free of private-claim/anti-persona text.

## Objective

The user can review a capped, explainable proposal queue; decline with calm three-state semantics that demonstrably change the next run; pause/resume/close/refine and set frequency from a Curate panel; report outcomes in one tap; and operators (not users) can see failed runs.

## Non-Goals

- No watch runner / health / schema-for-watch-tables changes — Brief 293.
- No digest composition / cross-tier delivery changes — Brief 294.
- No intro facilitation — Brief 276 owns it; the queue links out, it does not fulfil.
- No new ContentBlock primitive (Designer §28).
- No cross-watch learning (parent OQ-2, ratified 2026-05-19: no propagation in v1).

## Inputs

1. `docs/briefs/275-background-watch-network-health.md` — parent; D5 (lifecycle/auto-pause), D9 (three-state dismiss), D13 (outcome class), D16 (privacy boundary), OQ-1/2/3.
2. `docs/research/275-background-watch-network-health-ux.md` — full interaction spec; surfaces B, B′, D, E, F, G, H; three-state semantics; ≥3-week amber state; mobile primary path.
3. `packages/core/src/db/network/schema.ts` — `networkSearchFeedbackKindValues` (L296-304; currently `refine, not-a-fit, save, intro-request, hide, watch, invitation-candidate` — confirmed has neither `not-now` nor `wrong-person`); add `not-now`, `wrong-person`. **Note (Reviewer nit-4): `not-now` already exists in the *unrelated* `introductionStateValues` enum at L231 (Brief 288 consent state machine) — do NOT confuse the two; the addition here is to `networkSearchFeedbackKindValues` only.** Reuse Brief 289's `IntroOutcomeClass` (do not define a competing enum — see Constraints / parent D13).
4. `src/engine/network-background-watch.ts` (from 293) — the runner reads `loadWatchSuppressedKeys`; this brief implements that loader + the feedback writes it consumes.
5. Brief 274 Possible Connection / proposal card components — reuse card layout, do not re-invent.
6. `packages/web/app/network/chat/client-card-actions.tsx`, `expert-card-actions.tsx` — "Keep watching" / "Find me opportunities" create real watches via the 293 HTTP route.
7. Brief 283 scrubber + Brief 261 Hard Rule #5 — every rendered field.
8. Brief 286 admin/operator surface conventions — failure visibility pattern.

## Constraints

- Three-state dismiss (parent D9): `not-now` → 90-day cooldown; `not-a-fit` → 1-year cooldown; `wrong-person` → permanent + writes an anti-persona signal. `loadWatchSuppressedKeys` (read by 293's runner) must reflect these so the next run demonstrably adapts (parent AC #14, original AC #14).
- Auto-pause (parent D5): after **N=3** consecutive declines on a watch, transition to `paused` with `pausedReason = auto_paused_decline_streak`; audited as `watch_paused_auto`; the status card explains it and offers one-tap resume/refine.
- Every rendered field passes the Brief 283 scrubber; never render private claims or anti-persona text to a non-owner (Brief 261 Hard Rule #5) — including in the proposal "why/evidence" and the near-misses list. **Admin surface (Reviewer FLAG-5):** the operator failed-run view renders only *coded/boolean* health-rule outcomes (e.g. `rule_4_anti_persona: matched`) — never the anti-persona reason text and never the target's identity sourced from a non-owner signal. An operator is a non-owner under Hard Rule #5.
- Outcome capture (parent D13 revised / OQ-1 — Reviewer FLAG-3): there is **no** new `networkWatchOutcomeClass` enum. Two independent optional fields: (1) **outcome kind** reuses Brief 289's `IntroOutcomeClass` (`advisory | hire | client | funding | partnership | collaboration | no-outcome`) as a single shared enum — if Brief 295 lands before Brief 289 it *defines* `IntroOutcomeClass` in schema and Brief 289 imports it; if 289 landed first, 295 imports it; (2) **engagement signal** is a separate small optional field `no_response | replied | meeting`, not coordinated with 289. Both optional — one-tap chip + optional free note; "Mark Fulfilled" never blocked on either. Parent After-Completion adds the coordination note to Brief 289 Inputs.
- Invitation-candidate display follows Brief 279 field-copy boundary (D-Q8): show that a non-member was found and the sanctioned next action; do not render unsanctioned contact affordances.
- Operator failure visibility (parent AC #15): failed runs appear on an operator-only surface (Brief 286 conventions); users are never notified of watch errors.
- All control mutations go through the Brief 293 `/api/v1/network/watches/*` route (server-minted wrapper run, caller `stepRunId` rejected incl falsy). The UI never mints or passes a `stepRunId`.
- Curate placement (parent OQ-3, ratified 2026-05-19): a Curate sub-section within the Privacy Center, not a new top-level nav item.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Proposal card layout | Brief 274 Possible Connection card | adopt | Reuse the existing card; no re-invention. |
| Three-state dismiss + Curate job | Designer §10/§22 + Insight-238 | original | Calm decline; Curate as 7th human job. |
| Collapsible near-misses | `<details>` (HTML) + Designer §D | pattern | Progressive disclosure; no new primitive. |
| Auto-pause on decline streak | Designer D-Q5 | original | Restraint: stop bothering a user who keeps declining. |
| Operator failure surface | Brief 286 admin conventions | adopt | Existing operator surface pattern; no user spam. |
| Outcome chip + optional note | Designer §H + parent D13 | original | Outcome quality > volume; never block on categorisation. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `not-now`, `wrong-person` to `networkSearchFeedbackKindValues`; **define `IntroOutcomeClass` (`advisory\|hire\|client\|funding\|partnership\|collaboration\|no-outcome`) IF Brief 289 has not landed it yet, else import it** (Reviewer FLAG-3 — single shared enum, no competing one); add an optional `outcomeKind` (→ `IntroOutcomeClass`) and an optional `engagementSignal` (`no_response\|replied\|meeting`) column to `network_watch_feedback` |
| `drizzle/network/00NN_*_watch_feedback_outcome.sql` + snapshot | Create: migration (journal next idx after 294's 17 = **18**; Insight-190 — re-verify at build time) |
| `src/engine/network-watch-feedback.ts` | Create: `loadWatchSuppressedKeys` (cooldown-aware) + feedback writer (three-state → suppression + anti-persona signal for `wrong-person`) |
| `packages/web/components/network/watch-status.tsx` | Create: status card — 8 states incl. active, paused (manual), paused (auto-decline-streak), closed, fulfilled, error(operator-only), quiet (ambient), ≥3-week amber calibration |
| `packages/web/components/network/watch-proposal-queue.tsx` | Create: queue — run-context header, ≤cap proposals, why/why-now/evidence/risk/recommended-action, near-misses in collapsible `<details>`, three-state dismiss + chip strip, refine inline, fulfilment outcome chip + note |
| `packages/web/app/network/chat/client-card-actions.tsx` | Modify: "Keep watching" creates a real watch via the 293 route |
| `packages/web/app/network/chat/expert-card-actions.tsx` | Modify: "Find me opportunities" starts a member-signal watch via the 293 route |
| Privacy Center page (Brief 285/284 surface) | Modify: add a Curate sub-section embedding `watch-status.tsx` controls (pause/resume/close/refine/frequency) |
| Operator/admin surface (Brief 286) | Modify: add failed-watch-run visibility (operator-only) — renders only coded/boolean health-rule outcomes; never anti-persona reason text or non-owner target identity (Reviewer FLAG-5) |

## User Experience

- **Jobs affected (7-job model):** **Review** (proposal queue), **Curate** (settings panel — load-bearing, Insight-238), **Decide** (approve/decline/three-state), **Capture** (outcome chip), Orient (status card).
- **Primitives involved:** Proposal/Activity card (reused from Brief 274), Status card, Collapsible disclosure (`<details>`), Settings panel, Chip strip, Chat card-action, Ambient indicator. No new primitives.
- **Process-owner perspective:** The user opens the digest or the network surface and sees a short, explainable queue. Each proposal says why, why-now, evidence, the risk/gap, and the one recommended next action. They approve, refine, or decline with one of three calm options — and the very next run proves the decline mattered (suppressed target / no repeat). Status is glanceable; a watch that keeps getting declined pauses itself and says so kindly with one-tap resume. Settings live in one Curate place inside the Privacy Center. Reporting an outcome is one tap; it is never required.
- **Interaction states:** loading (queue fetching), empty (quiet — ambient "watching" + ≥3-week amber calibration offering broaden/close), error (operator-only; user sees nothing), success (queue with proposals), partial (health-suppressed → "N reviewed, not surfaced" count with no private detail; near-misses behind `<details>`).
- **Mobile:** the digest → queue → approve/decline path is the primary mobile experience (glanceable, one-tap, three-state as a bottom action set); the full Curate panel is desktop-primary.
- **Designer input:** `docs/research/275-background-watch-network-health-ux.md` (surfaces B/B′/D/E/F/G/H, three-state §10/§22, mobile §, amber calibration §B).

## Acceptance Criteria

1. [ ] `networkSearchFeedbackKindValues` includes `not-now` and `wrong-person`; migration + snapshot exist; `type-check` passes.
2. [ ] `loadWatchSuppressedKeys` returns keys honouring cooldowns: `not-now` 90d, `not-a-fit` 1y, `wrong-person` permanent; the 293 runner consuming it produces a demonstrably adapted next run (declined target absent).
3. [ ] `wrong-person` additionally writes an anti-persona signal for that watch.
4. [ ] `watch-status.tsx` renders all 8 states, including the auto-paused (decline-streak) state with a one-tap resume/refine, and the ≥3-week amber calibration state offering broaden/close.
5. [ ] After N=3 consecutive declines the watch auto-pauses (`pausedReason=auto_paused_decline_streak`), audited as `watch_paused_auto`; the user is not separately notified (status only).
6. [ ] `watch-proposal-queue.tsx` renders ≤cap proposals each with why, why-now, evidence, risk/gap, and one recommended next action; near-misses are in a collapsible `<details>`.
7. [ ] The queue's three-state dismiss writes the correct feedback kind and the chip strip reflects it; refine-inline routes through the 293 route.
8. [ ] No rendered field (proposal, near-miss, status) contains private-claim or anti-persona text — asserted by a scrubber test exercising a watch whose target has a private claim and an anti-persona entry (Brief 261 Hard Rule #5).
8a. [ ] The operator failed-run admin surface renders only coded/boolean health-rule outcomes; a test asserts the anti-persona *reason text* and the target identity from a non-owner signal are NOT present in that view (Reviewer FLAG-5).
9. [ ] "Keep watching" / "Find me opportunities" chat actions create real watches via the 293 HTTP route; the client never mints or passes a `stepRunId`.
10. [ ] Fulfilment capture: an optional one-tap outcome-kind chip (Brief 289 `IntroOutcomeClass`, single shared enum — not a competing one) plus an optional engagement-signal chip (`no_response|replied|meeting`) plus optional free note; "Mark Fulfilled" succeeds with neither selected (parent D13 revised / OQ-1; Reviewer FLAG-3).
11. [ ] Invitation-candidate proposals display the Brief 279-sanctioned next action only; no unsanctioned contact affordance is rendered (D-Q8).
12. [ ] Failed watch runs are visible on the operator-only surface (Brief 286 conventions); a test asserts no user-facing notification fires for a run error.
13. [ ] Curate settings (pause/resume/close/refine/frequency) live in a Privacy Center sub-section (parent OQ-3, ratified 2026-05-19); all mutations go through the 293 route.
14. [ ] Outcome metrics surface accepted-proposal / intro-accepted / reply-meeting-outcome / more-like-this-less-like-this; proposal volume is not displayed as a success metric (parent AC #16).
15. [ ] Parent smoke (full chain) passes; `pnpm run type-check` passes.

## Review Process

1. Spawn a fresh-context review agent with this brief, parent Brief 275, Briefs 293/294, `docs/architecture.md`, `docs/review-checklist.md`.
2. Reviewer checks: three-state cooldown semantics, feedback demonstrably changes next run, scrubber on every rendered field (Hard Rule #5), auto-pause restraint, outcome optional (not gated), no client `stepRunId`, operator-only failure visibility, Curate placement, no new primitive, parent 18-AC rollup fully covered with no gap.
3. Present work + findings to the human.

## Smoke Test

```bash
pnpm vitest run src/engine/network-watch-feedback.test.ts
pnpm --filter @ditto/web test -- watch
pnpm run type-check

# Parent chain (proves the whole capability — parent Brief 275 AC #18):
# 1. Create an Active Request; start a Background Watch ("Keep watching").
# 2. Trigger run 1 (Network-tier) → proposals queued → watch-digest delivered → notifyUser locally.
# 3. In the queue, decline one proposal as "wrong person".
# 4. Assert: anti-persona signal written; loadWatchSuppressedKeys includes that target permanently.
# 5. Trigger run 2 → assert the declined target is absent and the run context header shows "1 suppressed by your feedback".
# 6. Decline two more → assert watch auto-pauses with auto_paused_decline_streak and the status card offers resume/refine.
# 7. Resume, mark a later proposal Fulfilled with NO category → assert success; outcome optional honoured.
# 8. Force a run error → assert operator surface shows it and NO user notification fired.
```

## After Completion

1. Update `docs/state.md` — Builder checkpoint; mark parent Brief 275 row complete in `docs/roadmap.md` (all 3 sub-briefs done).
2. Add the D13 coordination note to `docs/briefs/289-intro-reply-ingestion-followup-outcome.md` Inputs (shared `IntroOutcomeClass` vocabulary — single enum, no competing `networkWatchOutcomeClass`; whichever of 289/295 lands first defines it, the other imports).
3. Move parent Brief 275 and 293/294/295 to `docs/briefs/complete/` per convention.
4. Phase retrospective for the parent capability.
5. If the 8 network-health rules prove broadly reusable, promote to `docs/dictionary.md` or an ADR.
