# Brief 293: Background Watch — Engine Skeleton

**Date:** 2026-05-19
**Status:** draft
**Depends on:** Brief 274 (complete — `runNetworkSearch`); Brief 261 (block/anti-persona); Brief 279 (invitation candidates); Brief 282/283 (privacy scrubber, suppression); operating-cycle infrastructure
**Unlocks:** Brief 294 (digest delivery)
**Parent:** Brief 275 (design coherence reference — read it for the cross-tier topology and decisions D1–D16)

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** The Network-tier skeleton that lets a Background Watch exist, schedule itself, run a search through the network-health gate, and queue proposals — with no user-facing delivery yet. Roadmap row 275 (part 1 of 3).

## Context

Brief 275 (parent) is split per Insight-004. This sub-brief is the **skeleton**: schema, lifecycle, runner, health evaluator, scheduler, HTTP control surface, tool boundary, and the legible cycle-YAML artifact. It produces proposals and writes them to the queue — but does **not** deliver a digest (Brief 294) or render review UI (Brief 295). It is independently testable: a watch can be created, a run triggered in test mode, and proposals + health decisions asserted directly against the Network DB.

The load-bearing constraint (parent §Context, D1): the watch runs entirely Network-tier. `notifyUser` and workspace `loadAllProcesses` are out of reach. This brief schedules via a per-watch `nextRunAt` + hourly Network-deployment sweep, and writes the cycle YAML as a documentation artifact only.

## Objective

A Background Watch can be created from an Active Request or a Member Signal, scheduled Network-tier, run through Brief 274 search + an 8-rule network-health gate, and produce queued, explainable proposals — provably without contacting any third party.

## Non-Goals

- No digest composition or delivery — Brief 294.
- No watch status / proposal-queue / Curate UI — Brief 295.
- No three-state dismiss UI — Brief 295 (the feedback *filter* is here; the *enum extension and UI* are in 295).
- No new process engine — reuse the scheduler/pulse sweep pattern.
- No outbound contact of any kind.

## Inputs

1. `docs/briefs/275-background-watch-network-health.md` — parent; decisions D1–D16, especially D1–D5, D10, D12, D14, D15.
2. `docs/briefs/complete/274-manual-search-connection-proposals.md` + `src/engine/network-manual-search.ts:142` — `runNetworkSearch`, injectable `matchFn`/`scoutFn`, `health: Record<string, NetworkHealthSignal>`, `stepRunId` required.
3. `packages/core/src/db/network/schema.ts` — add 4 tables; `networkInvitationCandidates.watchId` (L1304) + index (L1348) already exist; `networkAuditEventClassValues` (L419-458); `NetworkHealthSignal` shape via `connection-proposal.ts:70-76`.
4. `drizzle/network/meta/_journal.json` — next migration idx = **17** (idx 16 is `0016_share_attribution`, Brief 291; Insight-190 — re-verify at build time, parallel sessions contend on the journal).
5. `src/engine/scheduler.ts:109-122` — Brief 178 hourly stale-escalation sweep (model for the per-watch `nextRunAt` sweep).
6. `src/engine/relationship-pulse.ts:380` — per-user iteration loop precedent.
7. `src/engine/tool-resolver.ts` — guarded-tool registration; the watch tool list MUST exclude every contact tool (Insight-235).
8. `src/engine/network-abuse-controls.ts:117-127` — `"network-watch": { max:12, windowMs: 3600000 }` already configured.
9. `docs/insights/` — Insight-180 (stepRunId guard), Insight-232 (reject caller stepRunId incl falsy), Insight-235 (capability by transport), Insight-239 (validate action before mint).

## Constraints

- Side-effecting functions require `stepRunId` (Insight-180). The runner accepts a harness/scheduler step run id; with no run id it writes no proposals, no candidates, no audit rows, and performs no contact.
- `/api/v1/network/watches/*` validates the action enum **before** minting (Insight-239), mints a server-side network-lane wrapper step run, and **rejects any request body containing a `stepRunId` key at all** — reuse the existing `hasCallerStepRun` helper verbatim (`network/search/route.ts:64`: `Object.prototype.hasOwnProperty.call(body,"stepRunId")`). Rejection is on key *presence*, not truthiness; `null`/`""`/`0`/`false` are rejected because the key is present, and `{}` (no key) correctly passes to minting (Insight-232; resolves Reviewer FLAG-1 — there is no separate truthiness check to write). Reject path writes nothing.
- Runner reuses `runNetworkSearch` — no duplicate ranking (parent D2). `runNetworkSearch` already writes `networkPossibleConnections` rows (`network-manual-search.ts:250`); the runner does **not** duplicate that data — it writes thin `network_watch_proposals` join rows (parent D4, Reviewer FLAG-7).
- The `network-abuse-controls.ts` `"network-watch"` policy (max 12 / 3600000ms) governs **watch-run starts per user per hour** — it is a runner abuse control, not a create-rate or proposal-rate limit (parent D17, resolves Researcher OQ-7).
- Manual "run now" is gated by a **4-hour per-watch cooldown** in addition to the existing active-run-overlap check; the bare overlap check is insufficient (parent D17, Designer D-Q2).
- "Watch never contacts" = the watch tool list contains no contact tool (parent D12, Insight-235). This is the enforcement; there is no runtime contact check to add. The verifying test is a **routing-invariant test** (assert a watch step run cannot resolve/invoke a contact tool through `tool-resolver`), not merely a table-membership assertion — a table-inspection test gives false confidence per Insight-235 / review-checklist §18.
- Network-tier schema only; no cross-boundary joins (ADR-036/048/025).
- Invitation candidates: set `watchId`; never write a nullable-bypass of `discoveryProfileId`; never invite/contact (Brief 279, parent D10).
- Privacy scrubber (Brief 283) runs on any field persisted into a proposal; Brief 261 Hard Rule #5 — no private-claim/anti-persona text in proposal records that non-owner surfaces will read.
- The cycle YAML is a documentation artifact: it MUST NOT be placed where workspace `loadAllProcesses` scans it (parent D1).
- Migration: follow Insight-190 — claim journal idx 17 (re-verify at build time; parallel sessions contend on the journal), run `drizzle-kit generate`, verify SQL + snapshot exist.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Per-watch sweep | `scheduler.ts:109-122` (Brief 178) | pattern | Existing hourly sweep; reuse shape, no new engine. |
| Per-user iteration | `relationship-pulse.ts:380` | pattern | Existing loop precedent. |
| Search/ranking | Brief 274 `runNetworkSearch` | adopt | Injectable match/scout; no duplicate ranking. |
| Health flags 1–5 | Brief 261 block/anti-persona/rate-limit | adopt | Existing refusal logic. |
| Capability-by-transport | Insight-235 | adopt | No-contact guarantee by tool list. |
| Watch lifecycle/runs/proposals/feedback schema | Original to Ditto | original | No existing watch primitive in the codebase. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `network_background_watches` (incl. `status`, `pausedReason`, `frequency`, `nextRunAt`, `ianaTimezone` nullable, `consecutiveQuietRuns` int default 0, `lastManualRunAt`, `requestId`/`signalId`, settings), `network_watch_runs`, **`network_watch_proposals` (thin join — FK to `networkPossibleConnections.id`, `watchRunId`, persisted `NetworkHealthDecision`, `whatChanged`, dismiss-state; NOT a copy of connection data — Reviewer FLAG-7)**, `network_watch_feedback`; extend `networkAuditEventClassValues` with `watch_run`, `watch_proposal`, `watch_paused_auto` |
| `drizzle/network/0017_*_background_watch.sql` + snapshot | Create: migration for the above (journal idx 17, Insight-190 — re-verify at build time) |
| `src/engine/network-background-watch.ts` | Create: watch runner — sense→assess→act→gate→land→learn→brief; calls `runNetworkSearch` (which writes `networkPossibleConnections` with lifecycle `watched`); writes thin `network_watch_proposals` rows linking those connections; sets invitation `watchId`; requires `stepRunId`; manual path enforces 4h cooldown via `lastManualRunAt` |
| `src/engine/network-health.ts` | Create: 8-rule evaluator; extended `NetworkHealthSignal`; emits `NetworkHealthDecision` (`pass\|downgrade\|suppress\|queue-for-review`) with per-rule reasons; persisted + audited |
| `src/engine/scheduler.ts` | Modify: add a Network-deployment hourly sweep selecting watches where `nextRunAt <= now` and status `active`, with per-user iteration + tz filter (`Intl.DateTimeFormat`) |
| `src/engine/tool-resolver.ts` | Modify: register guarded watch tools (search, propose, queue-candidate); the list MUST NOT include any contact tool |
| `packages/web/app/api/v1/network/watches/route.ts` | Create: create/list/pause/resume/close/refine; validate action enum first, mint server-side wrapper run, reject caller `stepRunId` incl falsy |
| `processes/cycles/network-background-watch.yaml` | Create: legible artifact documenting the cycle decomposition; NOT loaded by workspace `loadAllProcesses` |

## User Experience

- **Jobs affected:** Delegate (create watch) and Decide (pause/close via API) — but no rendered UI in this sub-brief. UI is Brief 295.
- **Primitives involved:** None rendered here; the HTTP route is the seam Brief 295's UI will call.
- **Process-owner perspective:** Invisible in this sub-brief — the watch exists and runs but produces no user-facing output yet. This is the skeleton; Brief 294/295 make it felt.
- **Interaction states:** N/A (no UI). Run states (`active/paused/closed/fulfilled/error`) are data only.
- **Designer input:** `docs/research/275-background-watch-network-health-ux.md` — surfaces A/F state machine and the lifecycle states this brief must support are specified there; rendering deferred to 295.

## Acceptance Criteria

1. [ ] A Background Watch can be created from an Active Request (Request Watch / Mutual Fit / Timing type).
2. [ ] An Opportunity Watch can be created from a Member Signal.
3. [ ] Watch has states `active`, `paused`, `closed`, `fulfilled`, `error`; transitions are audited (`watch_lifecycle_changed`).
4. [ ] Watch persists `frequency` (`quiet`/`weekly_digest`/`immediate_strong_fit`/`manual_only`), `nextRunAt`, `consecutiveQuietRuns` (int, default 0), and `ianaTimezone` (nullable). `ianaTimezone` is populated at create from the POST body (client `Intl.DateTimeFormat().resolvedOptions().timeZone`); a server-initiated create leaves it null.
5. [ ] When `ianaTimezone` is null the sweep falls back to UTC explicitly (asserted by a test with a null-tz watch — resolves Reviewer FLAG-2; no silent UTC degradation).
6. [ ] The runner calls `runNetworkSearch` and does not re-implement ranking; `network_watch_proposals` rows are thin joins to `networkPossibleConnections` (FK + `watchRunId` + `NetworkHealthDecision` + `whatChanged` + dismiss-state) and do not duplicate connection fields (Reviewer FLAG-7).
7. [ ] `network-health.ts` runs before any proposal is written; no `network_watch_proposals` row exists for a `suppress` decision.
8. [ ] The evaluator applies all 8 v1 rules and persists a `NetworkHealthDecision` with per-rule reasons (audited as `watch_run`).
9. [ ] The thin proposal row + its joined `networkPossibleConnections` together expose why, why-now, evidence, source, risk/gap, recommended-next-action, and what-changed.
10. [ ] No watch step run can resolve or invoke any contact tool through `tool-resolver` — verified by a **routing-invariant test** (attempt to resolve a contact tool under a watch step run → not resolvable), not merely a table-membership assertion (Insight-235 / checklist §18).
11. [ ] The runner sets `networkInvitationCandidates.watchId` for high-fit non-members and never writes without a non-null `discoveryProfileId` (Brief 279 path intact).
12. [ ] The hourly Network sweep selects only `active` watches with `nextRunAt <= now`, iterates per user, and applies the `Intl.DateTimeFormat` tz filter.
13. [ ] A manual "run now" within 4 hours of `lastManualRunAt` is rejected (cooldown, parent D17 / Designer D-Q2); a manual run beyond 4h succeeds and updates `lastManualRunAt`.
14. [ ] `network-abuse-controls.ts` `"network-watch"` is enforced as ≤12 watch-run *starts* per user per hour (parent D17 / OQ-7).
15. [ ] `/api/v1/network/watches/*` rejects any body containing a `stepRunId` key (including value `null`, `""`, `0`, `false`) via the existing `hasCallerStepRun` presence check — guarded tool not invoked, no watch row written, no audit row; a body with no `stepRunId` key passes — and the action enum is validated before minting.
16. [ ] The runner with no `stepRunId` writes no proposals, no candidates, no audit rows, and performs no contact.
17. [ ] `pnpm run type-check` passes; the migration SQL + snapshot exist for the claimed journal idx (17 at design time; re-verify per Insight-190).

**Tool-YAML check (Insight-180):** every tool name in `network-background-watch.yaml` resolves in `tool-resolver.ts` builtInTools or the integration registry — AND the YAML is not in a path scanned by workspace `loadAllProcesses` (it is documentation; an AC test asserts the loader does not pick it up).

## Review Process

1. Spawn a fresh-context review agent with this brief, parent Brief 275, `docs/architecture.md`, `docs/review-checklist.md`.
2. Reviewer checks: no-contact-by-transport verified by routing-invariant test (not table inspection), all 8 health rules present, runner reuses `runNetworkSearch` with thin-join proposals (no connection-data duplication), `hasCallerStepRun` key-presence rejection, Network-tier-only schema, cycle YAML is non-executable artifact, migration idx correct (16 at design time; re-verify per Insight-190), `ianaTimezone` null→UTC fallback tested.
3. Present work + findings to the human.

## Smoke Test

```bash
pnpm vitest run src/engine/network-background-watch.test.ts src/engine/network-health.test.ts
pnpm run type-check

# Manual (Network-tier, test mode):
# 1. POST /api/v1/network/watches { fromRequestId, ianaTimezone } — assert watch row, status=active,
#    nextRunAt set, ianaTimezone persisted; POST without ianaTimezone — assert null persisted.
# 2. POST with stepRunId: 0 / "" / false / null — assert 4xx each, no watch row, no audit row;
#    POST with no stepRunId key — assert it proceeds to minting.
# 3. Trigger one run with a harness stepRunId — assert network_watch_runs row, thin
#    network_watch_proposals rows joined to networkPossibleConnections, a NetworkHealthDecision
#    persisted. Assert NO contact: zero rows in network_workspace_deliveries for this run,
#    notifyUser spy invoked zero times, zero outbound-audit rows (this is how "no contact" is proven).
# 4. Trigger one run with NO stepRunId — assert zero proposals, zero audit rows.
# 5. Manual run-now twice within 4h — assert the second is rejected (cooldown).
```

## After Completion

1. Update `docs/state.md` rolling log (Builder checkpoint).
2. Parent Brief 275 row in `docs/roadmap.md` stays in-progress (1 of 3).
3. Hand off to Brief 294.
