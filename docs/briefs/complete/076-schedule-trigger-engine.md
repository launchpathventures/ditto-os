# Brief 076: Schedule Trigger Engine

**Date:** 2026-04-02
**Status:** ready
**Depends on:** Phase 10 complete, Brief 075 (parent — Proactive Operating Layer)
**Unlocks:** Brief 077 (Proactive Monitor Definition), cron-driven EA workflows

## Goal

- **Roadmap phase:** Phase 11+ — Proactive Operating Layer
- **Capabilities:** Schedule triggers on processes, cron-based recurring execution, schedule management CLI

## Context

Ditto process definitions already declare `trigger: { type: schedule, cron: "..." }` in the schema (process-loader.ts), but no scheduler engine exists to act on it. The `trigger.type` field supports `manual`, `event`, and `schedule` — only the first two are wired. This brief builds the scheduler: a cron-based engine that creates process runs on schedule and feeds them through the existing harness pipeline.

Source pattern: clawchief (snarktank/clawchief) `cron/jobs.template.json` proves schedule-driven execution is the highest-value capability for personal agent workflows. See Insight-141.

## Non-Goals

- Event/webhook triggers (separate brief)
- Scheduler UI (CLI only for now)
- Distributed scheduling (single-node node-cron is sufficient)
- Schedule creation through conversation with Self (future — requires Self tool extension)

## Inputs

1. `src/engine/process-loader.ts` — ProcessDefinition interface, trigger field parsing (line 110-116)
2. `src/engine/heartbeat.ts` — heartbeat execution model, how runs are created and executed
3. `src/db/schema.ts` — processRuns table (triggeredBy field), processes table
4. `src/engine/step-executor.ts` — executor routing pattern
5. `docs/architecture.md` — L1 trigger types, L2 heartbeat model
6. `docs/briefs/075-proactive-operating-layer.md` — parent brief

## Constraints

- MUST use the existing harness pipeline — scheduled runs go through trust gate, review patterns, feedback capture like any other run
- MUST NOT auto-start the scheduler on import — it should be explicitly started (e.g., `pnpm cli scheduler start`)
- MUST validate cron expressions at process sync time (not at runtime)
- MUST record `triggeredBy: "schedule"` on process runs so trust/learning can distinguish scheduled from manual runs
- MUST handle overlapping runs gracefully — if a previous scheduled run is still in progress (waiting_review, waiting_human), skip the new trigger and log it
- MUST use node-cron (mature, zero-dependency cron parser/scheduler)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Cron scheduling | node-cron | depend | Mature, zero-dep, standard cron syntax |
| Schedule-as-trigger pattern | clawchief `cron/jobs.template.json` | pattern | Proves the application pattern |
| Run creation | Existing `processRuns` table + heartbeat | pattern | Follow existing engine patterns |
| Overlap prevention | GitHub Actions concurrency groups | pattern | Skip-if-running is the standard approach |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `schedules` table (processId, cronExpression, enabled, lastRunAt, nextRunAt, createdAt) |
| `src/engine/scheduler.ts` | Create: Cron-based scheduler — registers jobs from DB, creates process runs, invokes heartbeat |
| `src/engine/process-loader.ts` | Modify: Validate `trigger.cron` when `trigger.type === "schedule"` during sync. Auto-populate `schedules` table from process definitions |
| `src/cli/commands/schedule.ts` | Create: `schedule list`, `schedule enable <process>`, `schedule disable <process>`, `schedule trigger <process>` (manual trigger of a scheduled process) |
| `src/cli.ts` | Modify: Register schedule subcommands |

## User Experience

- **Jobs affected:** Orient (see scheduled process status), Delegate (trust tiers apply to scheduled runs)
- **Primitives involved:** CLI status output (scheduled processes show next run time)
- **Process-owner perspective:** Define a process YAML with `trigger: { type: schedule, cron: "*/15 * * * *" }`, run `pnpm cli sync`, then `pnpm cli schedule list` to see it registered. The scheduler creates runs automatically; supervised-tier processes pause for review just like manual runs.
- **Interaction states:** N/A — CLI only
- **Designer input:** Not invoked — no UI changes

## Acceptance Criteria

1. [ ] `schedules` table exists with columns: id, processId, cronExpression, enabled, lastRunAt, nextRunAt, createdAt
2. [ ] `pnpm cli sync` validates cron expressions in process definitions and populates the `schedules` table
3. [ ] Invalid cron expressions cause sync to fail with a clear error message
4. [ ] `scheduler.start()` registers cron jobs for all enabled schedules and creates process runs at the specified intervals
5. [ ] Scheduled process runs have `triggeredBy: "schedule"` in the processRuns table
6. [ ] Scheduled runs go through the full harness pipeline (trust gate, review patterns, feedback capture)
7. [ ] If a previous run for the same process is still active (status not completed/failed), the scheduler skips the trigger and logs a warning
8. [ ] `pnpm cli schedule list` shows all scheduled processes with cron expression, enabled status, last/next run times
9. [ ] `pnpm cli schedule enable <process>` and `schedule disable <process>` toggle the enabled flag
10. [ ] `pnpm cli schedule trigger <process>` manually creates a run for a scheduled process (for testing)
11. [ ] `scheduler.stop()` cleanly shuts down all cron jobs
12. [ ] Type-check passes with zero errors
13. [ ] Tests cover: schedule creation from sync, overlap prevention, enable/disable toggle, manual trigger

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review checks: Does the scheduler use the existing harness pipeline? Is overlap prevention correct? Is the cron validation robust? Are scheduled runs indistinguishable from manual runs in the harness (except triggeredBy)?
3. Present work + review findings to human

## Smoke Test

```bash
# 1. Create a test process with schedule trigger
cat > processes/test-scheduled.yaml << 'YAML'
name: Test Scheduled Process
version: 1
status: active
trigger:
  type: schedule
  cron: "*/2 * * * *"
  description: "Run every 2 minutes for testing"
inputs: []
steps:
  - id: greet
    name: Greet
    executor: script
    config:
      command: "echo 'Hello from scheduled process'"
outputs: []
quality_criteria: []
trust_level: supervised
YAML

# 2. Sync and verify schedule registered
pnpm cli sync
pnpm cli schedule list
# Expected: test-scheduled-process | */2 * * * * | enabled | next: <2min from now>

# 3. Manual trigger test
pnpm cli schedule trigger test-scheduled-process
pnpm cli status
# Expected: run with triggeredBy: "schedule", goes through harness

# 4. Clean up
rm processes/test-scheduled.yaml
pnpm cli sync
```

## After Completion

1. Update `docs/state.md` — Brief 076 complete
2. Update `docs/roadmap.md` — schedule triggers capability done
3. Remove test process YAML
