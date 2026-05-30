# Brief 275: Background Watch and Network Health (Parent — Design Coherence Reference)

**Date:** 2026-05-19
**Status:** draft
**Depends on:** Brief 273 (complete); Brief 274 (complete); Brief 278 foundation (Briefs 282/283/284 — privacy/scrubber/source-policy/suppression); Brief 279 (outbound discovery/claim invites); Brief 288 (complete — `network_workspace_deliveries` durable substrate); operating-cycle infrastructure; Brief 261
**Unlocks:** Brief 276 (intro facilitation consumes watch proposals); Brief 278 closeout depends on watch audit classes
**Split into (build these, not this):** Brief 293 (engine skeleton) → Brief 294 (digest delivery) → Brief 295 (review + curate UI + feedback)

> **This is a parent brief.** It is the coherent design reference for the whole Background Watch capability — the cross-tier topology, the 16 architectural decisions, the unified UX, and the cross-cutting risk. **Do not build from this brief.** Build from sub-briefs 293, 294, 295 in order. Each sub-brief is independently testable and carries its own acceptance criteria, review process, and After Completion section. This brief stays as the map; the sub-briefs are the route.

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Let Ditto keep working in the background for Active Requests and Member Signals while protecting network health, attention, and trust. Roadmap row 275.

## Context

The strongest difference between Ditto and existing professional networks is that the user should not have to scroll, search repeatedly, or spam people. Ditto should quietly watch for strong-fit connections and timing, then ask for consent before acting. This is the "always-on superconnector" behaviour: calm, restrained, explainable, throttle-aware.

The original Brief 275 draft (18 ACs, 13 work products, schema + cycle YAML + 3 engine modules + tool-resolver + HTTP route + 4 UI files) **exceeds the Insight-004 build-cycle ceiling** (>17 ACs, >3 subsystems). It cannot be built and reviewed in one focused cycle. It is split here along its natural dependency seams — skeleton → delivery → review — mirroring the Brief 276→288/289 (state-machine then flesh) and Brief 278→282/283/284 (foundation checkpoint) precedents already in this codebase.

A second, load-bearing problem surfaced during research and the human's Q1 disposition ("the cycle YAML lives in the Network repo"). The watch must run on the **Network Service deployment** (`ditto.partners`, which owns the Network DB), but `notifyUser` and `loadAllProcesses` are **workspace-tier** primitives:

- `instrumentation.ts:137-156` starts `scheduler.start()` + `startPulse()` unconditionally on every deployment, but `loadAllProcesses` scans only the workspace monorepo's `PROJECT_ROOT/processes/cycles/`. A cycle YAML placed in the Network repo is **never loaded by the workspace process loader** — it is a legible artifact, not an executable the workspace harness picks up.
- `notifyUser` imports the **workspace-tier `db`**. The Network deployment cannot call it directly. ADR-036/048/025 forbid cross-boundary joins and cross-tier DB reach.

This brief resolves both: it documents how the watch is scheduled and runs entirely Network-tier, and how its only user-facing output (the digest) crosses to the workspace tier through the **durable `network_workspace_deliveries` substrate built by Brief 288** (Insight-234) — never an in-memory or parallel notification path.

## Objective

Active Requests and Member Signals can create Background Watches. A watch periodically senses new/changed signals, reuses Brief 274 search/ranking, evaluates fit, applies an 8-rule network-health gate, queues a small number of explainable Introduction Proposals / Discovery candidates / digest items, delivers a capped digest across the tier boundary, and learns from accept/decline/refine feedback — all without ever contacting a third party.

## Non-Goals

- No intro fulfilment — Brief 276 owns facilitation; the watch only proposes.
- No native social DM or any outbound third-party contact.
- No automatic public posting.
- No high-volume outreach sequencing.
- No marketplace feed or notification flood.
- No new durable workflow engine — reuse the existing scheduler/pulse sweep pattern; do not invent a parallel process primitive.
- No new cross-tier transport — reuse Brief 288's `network_workspace_deliveries` substrate; do not build a second delivery path.
- No new ContentBlock primitives (Designer §28 confirmed existing blocks suffice).

## Inputs

1. `docs/briefs/complete/273-need-request-onboarding-manual-search-entry.md` — Active Request model.
2. `docs/briefs/complete/274-manual-search-connection-proposals.md` — `runNetworkSearch`, Possible Connection, ranking, scrub, prior-feedback filter.
3. `docs/briefs/complete/288-intro-consent-state-machine-and-decision-emails.md` — `network_workspace_deliveries` durable cross-tier substrate (Insight-234).
4. `docs/briefs/289-intro-reply-ingestion-followup-outcome.md` — planned `IntroOutcomeClass` (unbuilt; coordinate the watch outcome value set with it — see D13).
5. `docs/briefs/279-outbound-discovery-claim-invites.md` — discovered non-members, source registry, claim invites, operator approval v1.
6. `docs/briefs/278-trust-privacy-admin-observability.md` + `docs/briefs/282/283/284-*.md` — privacy scrubber, source policy, suppression, email compliance gates.
7. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` — refusal triggers, block list, anti-persona, Hard Rule #5 (never quote private claims/anti-persona to non-owners).
8. `docs/research/275-background-watch-network-health.md` — 20-section technical precursor (file:line citations, options, 12 open questions).
9. `docs/research/275-background-watch-network-health-ux.md` — 28-section interaction spec (8 D-Qs, 3 OQs, surfaces A–H + B′).
10. `docs/architecture.md` — operating-cycle archetype, Network Agent, tier separation.
11. `src/engine/relationship-pulse.ts:380,443-446` — per-user iteration loop + empty-state suppression precedent.
12. `src/engine/pulse.ts:104-172`, `src/engine/scheduler.ts:109-122` — delayed-run + Brief 178 hourly stale-escalation sweep precedents (model for the per-watch `nextRunAt` sweep).
13. `src/engine/notify-user.ts` — channel resolution + throttles (`MAX_EMAILS_PER_USER_PER_DAY=5`, `MIN_MS_BETWEEN_NOTIFICATIONS=1h`).

## Constraints

- **Quiet by default.** No notification unless a meaningful update or scheduled digest exists. Empty digest = no send (Designer D-Q1).
- **Few, better proposals.** Default cap ≤3 new proposals per digest unless the user explicitly asks for more.
- **Network health first.** The 8-rule evaluator runs before any proposal reaches the user.
- **No contact without consent.** The watch proposes; it cannot contact. Enforced by the **tool-list transport boundary** (Insight-235), not a runtime filter — the watch tool list excludes every contact tool.
- **Discovered people follow Brief 279.** The watch may create Invitation Candidates (the `networkInvitationCandidates.watchId` column already exists) but cannot bypass the non-nullable `discoveryProfileId`, source-registry compliance, operator approval v1, or claim-before-public controls.
- **Privacy/admin foundation applies.** No production Discovery Profiles, claim invites, emails, or notifications outside the Brief 278/282/283/284 gates. The Brief 278/283 privacy scrubber runs on every surfaced field. Brief 261 Hard Rule #5: digest/queue/admin surfaces never quote private claims or anti-persona text to non-owners.
- **User control.** Pause, resume, refine, close, set frequency.
- **Feedback loops.** Accept / decline / "more like this" / "less like this" / three-state dismiss update future runs.
- **Explainability.** Every proposal carries why, why-now, evidence, source, risk/gap, recommended next action, and what changed since last run.
- **Throttle with existing `notifyUser` rules.** Do not create a parallel notification path. Cross-tier digest uses Brief 288's `network_workspace_deliveries` (Insight-234); the workspace consumer calls `notifyUser` locally.
- **Side-effecting functions require `stepRunId` (Insight-180).** HTTP routes mint a server-side network-lane wrapper run, reject any caller-supplied `stepRunId` including falsy values (`null`, `""`, `0`, `false`) (Insight-232), and validate the action enum **before** minting (Insight-239).
- **Use the operating-cycle shape.** sense → assess → act → gate → land → learn → brief.
- **Network-tier only.** All watch schema is Network-tier; no cross-boundary joins (ADR-036/048/025).
- **Outcome quality beats activity.** Success = accepted high-fit proposals and reported outcomes, not proposal volume.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Operating-cycle phases | Briefs 115–118 | adopt | Existing Ditto continuous-operation primitive. |
| Per-watch sweep + per-user iteration | `scheduler.ts:109-122` (Brief 178 stale-escalation), `relationship-pulse.ts:380` | pattern | Existing hourly-sweep + per-user loop; the watch reuses this shape rather than a new engine. |
| Empty-state suppression | `relationship-pulse.ts:443-446` (`shouldReach=false → skip`) | pattern | Existing "send nothing when nothing changed" precedent for quiet-by-default. |
| Search/ranking reuse | Brief 274 `runNetworkSearch` (`network-manual-search.ts:142`) | adopt | Injectable `matchFn`/`scoutFn`; the watch must not duplicate ranking (AC reuse). |
| Cross-tier durable delivery | Brief 288 `network_workspace_deliveries` (Insight-234) | adopt | Existing sender-persist / consumer pull-and-ack substrate; the only sanctioned cross-tier path. |
| Channel-aware notification + throttles | Briefs 098b/099a-c `notifyUser` | adopt | Existing throttle/resolver; digest must not bypass it. |
| Capability-by-transport boundary | Insight-235 | adopt | "Watch never contacts" enforced by tool list, not runtime filter. |
| Intro refusal / block / anti-persona | Brief 261 | adopt | Existing block/anti-persona/rate-limit logic informs network-health rules 1–5. |
| Per-user-timezone scheduling | stdlib `Intl.DateTimeFormat` | pattern | No new dependency (landscape.md entry); hourly-sweep + runner tz-filter. |
| Quiet background watch as product thesis | Original to Ditto | original | Superconnector without feed-scrolling or spam. |
| Three-state dismiss + Curate as 7th job | Designer §10/§22 + Insight-238 | original | Calm decline semantics; Curate human job (status `active`, pending ratification). |

## What Changes (Work Products)

The full work-product matrix is split across the sub-briefs. High level:

| Sub-brief | Subsystem | Net new files |
|-----------|-----------|---------------|
| **293** Engine skeleton | Network-tier schema (4 tables, migration idx 15), watch runner, network-health evaluator, scheduler sweep, HTTP route, tool-resolver, cycle-YAML artifact | `network-background-watch.ts`, `network-health.ts`, `network-background-watch.yaml`, `watches/route.ts` |
| **294** Digest delivery | Digest composer, cross-tier delivery via Brief 288 substrate, workspace consumer, timezone | `network-watch-digest.ts`, workspace delivery consumer extension |
| **295** Review + Curate UI + feedback | Watch status + proposal queue UI, three-state feedback, Curate settings panel, auto-pause, outcome capture, invitation-candidate handoff, admin failure visibility | `watch-status.tsx`, `watch-proposal-queue.tsx` |

## Architectural Decisions (D1–D16)

These resolve the Researcher's 12 open questions, the Designer's 8 D-Qs, and the cross-tier problem. Sub-briefs implement them; they are not re-litigated there.

**D1 — Cross-tier scheduling.** The watch runs Network-tier. Each `network_background_watches` row carries a `nextRunAt` column. An **hourly sweep on the Network deployment** (model: `scheduler.ts:109-122` Brief 178 stale-escalation sweep + `relationship-pulse.ts:380` per-user iteration) selects due watches and runs them. `processes/cycles/network-background-watch.yaml` is written as a **legible Network-repo artifact** documenting the sense→assess→act→gate→land→learn→brief decomposition; it is explicitly **not** loaded by workspace `loadAllProcesses` (which scans the workspace monorepo only). This honours the human's Q1 disposition and invents no new process engine (Non-Goal).

**D2 — Search reuse.** The runner calls Brief 274 `runNetworkSearch` with injectable `matchFn`/`scoutFn`; it does not duplicate ranking. Satisfies original AC #5.

**D3 — Network-health evaluator.** New `src/engine/network-health.ts`. The 4-flag `NetworkHealthSignal` is extended to cover all 8 v1 rules; the evaluator emits a sibling `NetworkHealthDecision` (`pass | downgrade | suppress | queue-for-review`) with per-rule reasons, persisted and audited. Runs before any proposal reaches the user.

**D4 — Four Network-tier tables.** `network_background_watches`, `network_watch_runs`, `network_watch_proposals`, `network_watch_feedback`. Migration `drizzle/network/0015_*_background_watch.sql` (journal next idx = **15**; current last = idx 14 `0014_intro_consent_state_machine`). **`network_watch_proposals` is a thin join, not a duplicate of the connection model** (resolves Reviewer FLAG-7): the runner calls `runNetworkSearch`, which already writes `networkPossibleConnections` rows (`network-manual-search.ts:250`) carrying the scrubbed why/evidence/risk/recommended-action and a `watched` lifecycle value (`networkPossibleConnectionLifecycleValues`, schema L278). `network_watch_proposals` holds only watch-run context: FK to the `networkPossibleConnections` id, `watchRunId`, the persisted `NetworkHealthDecision`, `whatChanged`, and the three-state dismiss state. Brief 274's Possible Connection card renders directly from `networkPossibleConnections`; the watch never re-implements connection data.

**D5 — Lifecycle state machine.** States: `active`, `paused`, `closed`, `fulfilled`, `error`. Auto-pause is `paused` with a `pausedReason` (D-Q5: `auto_paused_decline_streak`). Transitions are audited.

**D6 — Frequency/settings.** `quiet`, `weekly_digest`, `immediate_strong_fit`, `manual_only`. Quiet-week handling (D-Q1): when a scheduled digest would be empty, **suppress the send entirely**; show an ambient "watching" indicator; after **≥3 consecutive quiet weeks**, surface one amber calibration nudge offering to broaden/close the watch.

**D7 — Cross-tier digest delivery.** The Network-tier runner persists the composed digest into Brief 288's `network_workspace_deliveries` with a new kind `"watch-digest"` (extend `networkWorkspaceDeliveryKindValues`). The workspace deployment's existing delivery consumer pulls, acks idempotently, and calls `notifyUser` **locally** (workspace-tier). No parallel notification path; honours Insight-234 and review-checklist #16.

**D8 — Digest composer.** New `src/engine/network-watch-digest.ts`. Empty-state suppression mirrors `relationship-pulse.ts:443-446`. Email card HTML via `react-dom/server` `renderToStaticMarkup` (Researcher §8; no new dep). Default cap ≤3 proposals; respects `notifyUser` throttles (`MAX_EMAILS_PER_USER_PER_DAY=5`, `MIN_MS_BETWEEN_NOTIFICATIONS=1h`).

**D9 — Three-state dismiss.** Extend `networkSearchFeedbackKindValues` with `not-now` (90-day cooldown) and `wrong-person` (permanent + writes an anti-persona signal). Existing `not-a-fit` = 1-year cooldown. A `loadWatchSuppressedKeys` filter feeds the runner so dismissals shape subsequent runs (original AC #14).

**D10 — Invitation-candidate handoff.** `networkInvitationCandidates.watchId` (schema L1304) + index (L1348) already exist. The watch sets `watchId` but cannot bypass the non-nullable `discoveryProfileId` (L1298-1300), source-registry compliance, operator approval v1, or claim-before-public (Brief 279). Original AC #10.

**D11 — Per-user timezone.** Watch-scoped `ianaTimezone` column, **populated at watch-create time** from the client's `Intl.DateTimeFormat().resolvedOptions().timeZone`, passed through the `/api/v1/network/watches` POST body (no existing table carries an IANA tz — confirmed; resolves Reviewer FLAG-2). When `ianaTimezone` is null (e.g. server-initiated create), the sweep falls back to UTC explicitly; the null-fallback path is an AC, not implicit. The hourly sweep + an `Intl.DateTimeFormat` runner-side filter delivers digests at the user's local time; default **Monday 09:00 local** (D-Q3). Stdlib only — no new dependency (landscape.md entry exists).

**D12 — Tool boundary.** `src/engine/tool-resolver.ts` registers guarded watch tools (search, propose, queue-candidate, schedule-digest). The "watch never contacts" guarantee is the **absence of contact tools from the watch tool list** (Insight-235), not a runtime check. Original AC #9.

**D13 — Outcome capture (revised — Reviewer FLAG-3).** The Reviewer correctly found that a watch-defined "outcome class" and Brief 289's planned `IntroOutcomeClass` are *orthogonal taxonomies* (engagement-status vs outcome-kind) and cannot be "reconciled by whichever lands second." Corrected design: the watch captures **two independent, optional fields**, neither a new outcome-class enum.

1. **Outcome kind** reuses Brief 289's planned `IntroOutcomeClass` value set (`advisory | hire | client | funding | partnership | collaboration | no-outcome`) as the **single shared network-success vocabulary**. Brief 289 owns this enum. Whichever of Brief 289 or Brief 295 lands first **defines `IntroOutcomeClass` in `packages/core/src/db/network/schema.ts`**; the second **imports the existing enum** — this is a genuine shared enum, not a divergent union. Brief 275's After-Completion adds the coordination note to Brief 289's Inputs.
2. **Engagement signal** is a separate small optional field on watch feedback: `no_response | replied | meeting`. It is not an outcome class and is not coordinated with Brief 289.

This is a deliberate departure from the Designer's D-Q7 (which implied one combined "outcome shape"); **ratified by the human 2026-05-19** — this two-field design supersedes Designer D-Q7 for v1. **OQ-1** (outcome kind required vs optional) is **resolved below: optional**.

**D14 — Audit classes.** Add `watch_run`, `watch_proposal`, `watch_paused_auto` to `networkAuditEventClassValues` (existing `watch_lifecycle_changed` `packages/core/src/db/network/schema.ts:551` and `watch_feedback` L568 are reused — both pre-date Brief 293; the brief reuses them, it does not add them).

**D15 — HTTP route security.** `/api/v1/network/watches/*` validates the action enum first (Insight-239), then mints a **server-side network-lane wrapper step run**, and rejects any request whose body **contains a `stepRunId` key at all** — reuse the existing `hasCallerStepRun` pattern (`network/search/route.ts:64`: `Object.prototype.hasOwnProperty.call(body,"stepRunId")`), which rejects on key *presence*, not truthiness, so `null`/`""`/`0`/`false` are all rejected because the key is present (resolves Reviewer FLAG-1 — the guard is correct; the briefs now describe the actual mechanism, not a separate truthiness check). The guarded tool is never invoked and no watch row is written if the key is present.

**D16 — Privacy / Brief 261 boundary.** Every surfaced field passes the Brief 278/283 privacy scrubber. Digest, proposal queue, and admin surfaces never quote private claims or anti-persona text to non-owners (Brief 261 Hard Rule #5). Invitation-candidate copy follows the Brief 279 field-copy boundary (D-Q8). **Admin failure surface (Reviewer FLAG-5):** the operator-only failed-run view renders only *coded/boolean* health-rule outcomes (e.g. "rule 4 anti-persona: matched") and never the anti-persona reason text or the target's identity sourced from a non-owner signal — an operator is a non-owner under Hard Rule #5.

**D17 — Resolved Researcher/Designer questions (no longer open).** Recorded so sub-briefs do not re-litigate:
- **D-Q2 — manual "run now" cooldown:** a manual trigger is gated by a **4-hour cooldown** per watch (Designer D-Q2); the existing `triggerManually` active-run-overlap check is insufficient and is extended with the cooldown. Owned by Brief 293.
- **D-Q4 — implicit-signal weighting:** **v1 is explicit-feedback-only.** Only explicit signals (three-state dismiss, more/less-like-this, accept) shape subsequent runs. No implicit edit/dwell weighting in v1 (consistent with OQ-2 simplicity). If the human wants implicit weighting it is a later, separately-designed capability.
- **OQ-7 — `network-watch` abuse-control semantics:** the pre-configured `network-abuse-controls.ts` `"network-watch": { max:12, windowMs:3600000 }` governs **watch-run starts per user per hour** (it is a runner abuse control, not a create-rate or proposal-rate limit). Owned by Brief 293; stated in its Constraints.

## Resolved Decisions (ratified by the human 2026-05-19 — no longer open)

These were surfaced as open questions and ratified per the Architect's recommendation. Sub-briefs build to these; they do not re-litigate.

- **OQ-1 — Outcome category required vs optional? → RATIFIED: optional.** Capture is one tap (chip) plus optional free text; never block "Mark Fulfilled" on categorisation. Proposal volume is explicitly not a success metric (Constraints), so a missing category must not penalise the watch.
- **OQ-2 — Cross-watch learning? → RATIFIED: no propagation in v1.** Feedback shapes only the watch it was given on. Cross-watch learning is a later, separately-designed capability (avoids surprising suppression the user can't trace).
- **OQ-3 — Curate/watch settings placement? → RATIFIED: a Curate sub-section inside the Privacy Center.** This **OVERRIDES** the Designer spec §24 OQ-3 top-level-nav recommendation — it keeps "what is Ditto allowed to do for me" controls in one place, consistent with Insight-238 (Curate as the 7th human job, status `active`). Brief 295 builds the surface as a Privacy Center sub-section; the Designer's top-level-nav option is closed for v1.

## User Experience

Synthesises all 28 sections of the Designer interaction spec (`docs/research/275-background-watch-network-health-ux.md`). The Designer was invoked; this is the authoritative UX section the sub-briefs implement.

- **Jobs affected (7-job model, Insight-238):** **Review** and **Curate** are load-bearing; **+ (Capture/observe)** is the ambient quiet-state job. Secondary: Orient (watch status), Decide (approve/decline), Delegate (create watch from a request/signal).
- **Primitives involved:** Activity/Proposal card, Status card, Settings panel, Digest email card, Chat card-action, Ambient indicator, Collapsible disclosure (`<details>`). No new primitives (Designer §28).
- **Process-owner perspective.** The user creates a watch from an Active Request or Member Signal ("Keep watching" / "Find me opportunities"), then **does nothing**. On their cadence they receive at most a short digest of ≤3 explainable proposals. Each proposal states why, why-now, evidence, source, risk/gap, recommended next action, and what changed. They approve, decline (three-state), or refine inline. Quiet weeks are silent — only an ambient "watching" indicator — and after ≥3 silent weeks one calm calibration nudge offers to broaden or close. The user can pause/resume/close/refine and set frequency from a Curate panel in the Privacy Center.
- **Surfaces (Designer A–H + B′):** A — create-watch chat action; B — watch status card (8 states incl. ≥3-week amber calibration); B′ — ambient quiet indicator; C — digest email card; D — proposal queue (run-context header, near-misses in a collapsible `<details>`, three-state dismiss + chip strip); E — refine inline; F — Curate settings panel (Privacy Center sub-section); G — admin failure visibility (operator-only, no user spam); H — fulfilment/outcome capture (one-tap chip + optional note).
- **Interaction states.** Loading (watch scanning), empty (quiet week → suppressed send + ambient indicator), error (run failed → operator-visible only, user not spammed), success (digest with proposals), partial (some proposals suppressed by health gate → near-misses collapsible).
- **Mobile.** Digest + proposal approve/decline is the primary mobile path (glanceable, one-tap decisions); full Curate panel is desktop-primary.
- **Designer input:** `docs/research/275-background-watch-network-health-ux.md` (28 sections; 8 D-Qs resolved in D6/D9/D11/D13/D16; 3 OQs ratified above).

## Acceptance Criteria (parent rollup — verified across sub-briefs)

This is the original 18-AC contract, mapped to the owning sub-brief. The parent passes when all three sub-briefs pass.

1. [ ] Create a Background Watch from an Active Request — **293**
2. [ ] Create an Opportunity Watch from a Member Signal — **293**
3. [ ] Watch states: active, paused, closed, fulfilled, error — **293**
4. [ ] Frequency/settings: quiet, weekly digest, immediate strong-fit, manual — **293** (settings), **295** (UI)
5. [ ] Runner reuses Brief 274 search/proposal; no duplicate ranking — **293**
6. [ ] Network-health evaluator runs before any proposal reaches the user — **293**
7. [ ] Evaluator applies all 8 v1 rules — **293**
8. [ ] Proposal includes why, why-now, evidence, risk/gap, recommended next action — **293** (data), **295** (surface)
9. [ ] Watch never contacts a third party (tool-list boundary) — **293**
10. [ ] Watch can create Invitation Candidates but cannot invite/contact outside Brief 279 — **293**
11. [ ] Notifications route through `notifyUser`/existing resolver; no ad hoc email path — **294**
12. [ ] Digest caps proposals by default and respects existing throttles — **294**
13. [ ] User can pause/resume/close/refine a watch — **295** (UI), **293** (state machine)
14. [ ] User feedback on proposals affects subsequent runs — **293** (filter), **295** (UI)
15. [ ] Failed runs visible to admins/operators; do not spam users — **293** (audit), **295** (admin surface)
16. [ ] Outcome metrics capture accepted proposal, intro accepted, reply/meeting/outcome, more/less-like-this; volume alone is not success — **295**
17. [ ] Tests cover health rules, duplicate cooldown, high-demand throttle, pause/resume, digest cap, invitation-candidate handoff, wrapper bypass rejection incl falsy values, no-contact guarantee — **distributed; each sub-brief tests its own seam**
18. [ ] Manual smoke: watch from a request → one run produces proposals/candidates → user declines one → next run adapts — **parent smoke (after 295)**

## Cross-Cutting Risk

- **Cross-tier delivery is the single highest risk.** If Brief 288's `network_workspace_deliveries` substrate changes shape, D7 breaks. Mitigation: 294 depends on 288 (complete) and adds only a new `kind`; no schema change to the delivery table beyond the enum value.
- **Brief 289 coordination.** Per the revised D13, the watch reuses Brief 289's `IntroOutcomeClass` as a single shared enum (no competing watch-outcome enum). Mitigation: whichever of 289/295 lands first *defines* `IntroOutcomeClass` in schema, the second *imports* it; coordination note added to Brief 289's Inputs at parent After-Completion.
- **Brief 293 is the densest sub-brief (Reviewer FLAG-4).** 14 ACs but 7 work products across 5 runtime subsystems (schema, runner, health, scheduler, route+tool-resolver). The split is not re-cut — the subsystems are coupled by construction (the runner cannot be tested without health; the route cannot be tested without the runner) and a schema-only sub-brief would have no behavioural AC. Mitigation: 293's builder lands schema+migration first, then builds runner→health→scheduler→route with per-subsystem tests before the full-chain smoke; the 293 reviewer is told to expect the densest cycle. Human is aware 293 is the hard one.
- **Quiet-week counter has nowhere to live (Reviewer nit-5).** The ≥3-week amber calibration (D6) needs persisted consecutive-empty-run state. Mitigation: Brief 293 adds a `consecutiveQuietRuns` integer to `network_background_watches`; Brief 294's calibration AC reads it; without this the calibration AC is untestable.
- **Health-gate over-suppression.** Too-aggressive rules → empty digests forever → user thinks Ditto is dead. Mitigation: ≥3-week amber calibration nudge (D6); admin can see suppression-decision audit (D14).
- **Privacy leak via explainability.** "Why-now / evidence" could quote private claims. Mitigation: D16 scrubber on every surfaced field; Brief 261 Hard Rule #5 tested in 295.
- **Brief-number contention.** Parallel sessions may reserve 293-298. Mitigation: builder re-greps `docs/briefs/` before creating files.

## Build Order

```
293 (engine skeleton)  →  294 (digest delivery)  →  295 (review + curate UI + feedback)  →  close parent 275
```

Each arrow is a hard dependency: 294 needs the runner + tables from 293; 295 needs proposals flowing from 293 and the digest from 294. Build, review, and approve each before starting the next.

## Review Process

1. Spawn a fresh-context review agent with this parent brief, sub-briefs 293-295, `docs/architecture.md`, and `docs/review-checklist.md`.
2. The reviewer checks: cross-tier delivery correctness (no parallel path; Insight-234), network-health completeness (all 8 rules), no-contact guarantee by transport (Insight-235), no duplicate process primitive, sub-brief sizing (each ≤17 ACs / ≤3 subsystems), and that the three sub-briefs compose back to the original 18 ACs with no gap.
3. Present findings to the human alongside the design.

## Smoke Test

The parent smoke runs after 295 completes (it exercises the full chain):

```bash
pnpm vitest run src/engine/network-background-watch*.test.ts src/engine/network-health*.test.ts
pnpm --filter @ditto/web test -- watch
pnpm run type-check

# Manual:
# 1. Create an Active Request; start a Background Watch.
# 2. Trigger one watch run in test mode (Network-tier).
# 3. Verify proposals generated, a "watch-digest" delivery row written, and NO intro/email to targets.
# 4. As the workspace tier, pull the delivery and confirm notifyUser fired locally (throttled, capped ≤3).
# 5. Decline one proposal as "wrong person".
# 6. Trigger a second run; verify the declined target is suppressed and an anti-persona signal was written.
```

## After Completion

1. Update `docs/state.md` (Architect checkpoint + Decisions Made table) — done at design time; Documenter verifies.
2. Update `docs/roadmap.md` row 275 when all three sub-briefs are complete.
3. Add the D13 coordination note to `docs/briefs/289-intro-reply-ingestion-followup-outcome.md` Inputs.
4. If the 8 network-health rules prove broadly reusable, promote to `docs/dictionary.md` or an ADR.
5. Phase retrospective when the parent closes.
