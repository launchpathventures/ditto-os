# Brief: `definitionOverride` Cleanup (P0 correctness)

**Date:** 2026-04-16
**Status:** complete
**Depends on:** Brief 169 (parent), Brief 044 (adapt_process)
**Unlocks:** Process adaptation is strictly run-scoped with no cross-run bleed.

## Goal

- **Roadmap phase:** Phase 4 — harness correctness
- **Capabilities:** Closes P0: `processRuns.definitionOverride` is set by `adapt_process` during onboarding, but is not cleared on run completion. A subsequent retry or resumption of the same run reads stale adaptation and diverges from the process owner's current definition.

## Context

`adapt-process.ts:194-202` writes `definitionOverride` and bumps `definitionOverrideVersion`. Heartbeat at `heartbeat.ts:726-734` reads `run.definitionOverride ?? proc.definition` on each step boundary — correct behaviour mid-run. On run completion (`completed` / `failed` / `cancelled`), no code nulls the override. If a run is later resumed (manual trigger, admin action, chain restart), it re-reads stale overrides. Worse, the override can persist in logs/activity payloads after the run ends.

## Objective

`definitionOverride` is cleared as soon as the run leaves an executable status, with an immutable activity record of the adaptation retained.

## Non-Goals

- Removing `adapt_process` itself or changing its runtime semantics during the run.
- Retroactive cleanup of existing long-dead runs (one-time migration script listed as optional follow-up).
- Changing per-run adaptation to permanent (Brief 164 `edit_process` covers permanent edits).

## Inputs

1. `src/engine/self-tools/adapt-process.ts:150-220`
2. `src/engine/heartbeat.ts` — completion paths (`status: "approved"` terminal, `"failed"`, `"cancelled"`)
3. `packages/core/src/db/schema.ts` — `processRuns` fields
4. `src/db/schema/engine.ts` re-exports

## Constraints

- Keep the existing `definitionOverrideVersion` field for audit trail.
- Retain a compact summary of the override on the run (`definitionOverrideSummary text`) so after-the-fact debugging / activity feed can still say "this run was adapted to skip step X".
- No schema column rename — additive only.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| State machine hooks on terminal transition | Trigger.dev run lifecycle | pattern | Clear cleanup point at status transitions |
| Summary-of-diff on snapshot | Git `%s` of commit message | pattern | Preserve intent when discarding the body |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | Modify: add `definitionOverrideSummary` nullable text column on `processRuns` |
| `drizzle/NNNN_definition_override_summary.sql` | Create: migration (follow Insight-190) |
| `src/engine/self-tools/adapt-process.ts` | Modify: compute 1-line summary of override and store it alongside the override |
| `src/engine/heartbeat.ts` | Modify: at the terminal-status transition points, null `definitionOverride` (keep `definitionOverrideSummary` and `definitionOverrideVersion`) |
| `src/engine/heartbeat.test.ts` | Modify: add test "run completes; definitionOverride is null, summary and version preserved" |
| `src/engine/self-tools/adapt-process.test.ts` | Modify: summary captured on adapt |

## User Experience

- **Jobs affected:** Define (trust that adaptations are scoped as promised).
- **Process-owner perspective:** None directly — invisible correctness fix. Activity log still shows "this run was adapted to …" via the summary.

## Acceptance Criteria

1. [ ] New `definitionOverrideSummary` column exists and is populated whenever `definitionOverride` is set.
2. [ ] At every terminal-status transition (`approved`, `failed`, `cancelled`, or explicit admin stop) `definitionOverride` is nulled.
3. [ ] `definitionOverrideSummary` and `definitionOverrideVersion` are preserved for audit.
4. [ ] Test: after run completes, `definitionOverride` is null; resuming it via a chain starts from the durable process definition.
5. [ ] Existing adapt_process tests pass; one new test covers the terminal cleanup.
6. [ ] Journal index is next available.

## Review Process

1. Review agent searches for every callsite that writes `processRuns.status` with a terminal value and verifies the cleanup fires for all of them.
2. Confirms the summary is user-legible.

## Smoke Test

```bash
pnpm db:generate
pnpm test -- adapt-process heartbeat
```

## After Completion

Update `docs/state.md`: "Brief 174 — definitionOverride cleanup (2026-04-16, complete): override nulled on terminal transitions; new `definitionOverrideSummary` preserves intent for audit."
