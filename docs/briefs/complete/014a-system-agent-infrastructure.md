# Brief: Phase 4c-a — System Agent Infrastructure + Trust-Evaluator

**Date:** 2026-03-21
**Status:** ready (approved 2026-03-21)
**Depends on:** Brief 016 (complete — CLI adapter, confidence gating, harness events)
**Unlocks:** Brief 014b (intake-classifier, router, orchestrator, auto-capture)

## Goal

- **Roadmap phase:** Phase 4: Workspace Foundation
- **Capabilities:** System agent category in schema, system agent registration via `pnpm cli sync`, trust-evaluator as first system agent running through the harness pipeline.

## Context

ADR-008 defines two agent categories: `system` (shipped with platform, cannot be deleted) and `domain` (user-configured). The schema needs `category` and `systemRole` fields on the agents table. The trust-evaluator is the ideal first system agent — it wraps existing, validated code from Phase 3 and runs frequently (after every feedback record), making it a good stress test for the system agent pattern.

This sub-brief validates the pattern. 014b then uses it for the three new agents.

## Objective

The `agents` table supports system agent category. System agent process definitions sync via `pnpm cli sync`. The trust-evaluator runs as a system agent through the harness pipeline after every feedback record. System agents cannot be deleted via CLI.

## Non-Goals

- Intake-classifier, router, orchestrator (014b)
- System agent permissions model beyond process YAML scoping (ADR-008 defers to Phase 9)
- System agent prompt management tooling (ADR-008 defers to Phase 9/11)
- `integration` executor type (Phase 6)

## Inputs

1. `docs/adrs/008-system-agents-and-process-templates.md` — system agent schema, categories
2. `src/engine/trust-evaluator.ts` — existing trust evaluation code
3. `src/engine/trust.ts` — trust computation functions
4. `src/engine/harness-handlers/feedback-recorder.ts` — where trust evaluation is currently triggered
5. `src/engine/process-loader.ts` — YAML sync logic
6. `src/db/schema.ts` — current schema (agents table)

## Constraints

- System agents go through the same harness pipeline as domain agents (ADR-008/010). No exemptions.
- The trust-evaluator starts at `spot_checked` (not supervised). Rationale: it wraps already-validated Phase 3 code and runs after every feedback record — starting supervised would double the review burden without adding value. This is an explicit exception documented in the brief, not a pattern for other system agents.
- System agent process definitions live in `processes/` alongside domain processes. They are distinguished by a `system: true` field in the YAML (which maps to `category: system` on the agent record).
- The existing `evaluateTrust()` function in `src/engine/trust-evaluator.ts` remains as the implementation. The system agent wraps it — it does not rewrite or duplicate the logic. The wrapping means: the harness pipeline runs around the invocation, recording the decision, applying trust gate, logging activity.
- System agents use the `script` executor type (not `ai-agent` or `cli-agent`). The trust-evaluator is deterministic code, not an LLM call. This keeps it fast and free.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| System agent category (`system` vs `domain`) | ADR-008 | Formalizes platform-level functions as a distinct agent class |
| Trust-evaluator as first system agent | ADR-008 | Wraps existing validated code. Low risk, high frequency — ideal pattern validator |
| Script executor for deterministic system agents | Existing `script` executor | No LLM needed for trust evaluation — deterministic code |
| Process YAML for system definitions | Existing process loader pattern | Same sync mechanism, same harness pipeline |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `category` field to agents table (`system` \| `domain`, default `domain`). Add `systemRole` field (nullable text). |
| `processes/trust-evaluation.yaml` | Create: Process definition for the trust-evaluator system agent. Single step, `script` executor, wraps `evaluateTrust()`. `system: true` field. Starts at `spot_checked`. |
| `src/engine/process-loader.ts` | Modify: When syncing a process with `system: true`, create/update an agent record with `category: system` and `systemRole` matching the process slug. |
| `src/engine/system-agents/trust-evaluator.ts` | Create: System agent module that wraps `evaluateTrust()` for harness pipeline execution. Accepts processId as input, returns trust evaluation result as output. |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: After recording feedback, trigger the trust-evaluator system agent via `startProcessRun()` instead of calling `evaluateTrust()` directly. |
| `src/engine/heartbeat.ts` | Modify: Add `startSystemAgentRun()` helper that creates a process run for a system agent and executes it programmatically (not via CLI `start` command). Uses `fullHeartbeat()` internally. |
| `src/cli/commands/sync.ts` | Modify: System agent sync creates agent records with `category: system`. Prevent deletion of system agents (if a system process YAML is removed, warn but don't delete). |
| `src/engine/step-executor.ts` | Modify: For `script` executor with a `systemAgent` config, resolve and call the system agent module instead of running a shell command. |
| `src/test-utils.ts` | Modify: Update `createTables` SQL to include new `category` and `system_role` columns on agents table. |

## User Experience

- **Jobs affected:** Orient (`aos status` shows system agent processes, marked as [system])
- **Primitives involved:** None directly — this is infrastructure
- **Process-owner perspective:** System processes appear in `aos status` clearly labeled. Users cannot delete them. Otherwise invisible — trust evaluation continues to work as before, now with harness auditing.
- **Interaction states:** N/A — no new interactive flows
- **Designer input:** Not invoked — infrastructure only, no user-facing interaction changes

## Acceptance Criteria

1. [ ] `agents` table has `category` field (`system`|`domain`, default `domain`) and `systemRole` field (nullable text)
2. [ ] `pnpm cli sync` creates system agent records with `category: system` when syncing process YAMLs with `system: true`
3. [ ] System agent records cannot be deleted via CLI (attempting to delete warns and skips)
4. [ ] `processes/trust-evaluation.yaml` exists and syncs successfully
5. [ ] Trust-evaluator system agent runs through the harness pipeline (memory-assembly → step-execution → review → routing → trust-gate → feedback-recorder)
6. [ ] Trust-evaluator is triggered programmatically after every feedback record (replacing direct `evaluateTrust()` call)
7. [ ] Trust-evaluator produces the same results as the existing `evaluateTrust()` function (no behavioral regression)
8. [ ] `aos status` shows system agent processes labeled as `[system]`

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: system agent goes through full harness pipeline (not bypassed), trust-evaluator wraps (not duplicates) existing logic, schema changes are backward compatible, no trust tier bypass possible

## Smoke Test

```bash
# Sync with new system agent process
pnpm cli sync
# Expected: trust-evaluation process synced, system agent record created

# Verify system agent in status
pnpm cli status
# Expected: trust-evaluation process listed with [system] label

# Run a process, approve output, verify trust-evaluator fires
pnpm cli start dev-pipeline --json
pnpm cli heartbeat <run-id>
pnpm cli approve <step-run-id>
# Expected: trust-evaluator system agent runs (visible in activity log)

pnpm cli trust dev-pipeline
# Expected: trust state reflects the approval (same as before 014a)

# Run tests
pnpm test
# Expected: all existing tests pass + new system agent tests pass
```

## After Completion

1. Update `docs/state.md`: system agent infrastructure complete, trust-evaluator running as system agent
2. Proceed to Brief 014b (intake-classifier + router + orchestrator + auto-capture)
