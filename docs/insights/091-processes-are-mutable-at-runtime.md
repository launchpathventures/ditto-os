# Insight-091: Process Definitions Are Mutable at Runtime

**Date:** 2026-03-24
**Trigger:** Architecture question during onboarding design — "shouldn't the Self be able to adapt a running process's YAML as the conversation unfolds?"
**Layers affected:** L1 Process (mutable definitions), L2 Agent (Self as process adapter), L3 Harness (adaptation governance)
**Status:** active

## The Insight

Process YAML definitions should be mutable at runtime, not frozen at sync time. The Self can already *create* process YAML from conversation (Brief 040 `generate_process` tool). It should also be able to *adapt* a running process between steps — adding, removing, reordering, or modifying steps based on what it learns during execution.

This is architecturally simple because:
1. The process loader already writes YAML to the DB at sync time
2. The heartbeat already reads process definitions from the DB at each step boundary
3. If the Self updates the definition in the DB between steps, the heartbeat picks up the change naturally

No new executor type needed. No new "adaptive process" concept. Just: process definitions are mutable data, and the Self has a tool to modify them.

## What This Enables

- **Onboarding adapts to the user:** Template starts generic, Self adds trades-specific steps when Rob says "plumbing company," removes irrelevant ones, reorders based on what the user cares about
- **Strategy sessions evolve:** Self adds research steps mid-session when knowledge gaps emerge
- **Process definition through conversation:** The YAML literally takes shape as the user describes their work
- **Processes improve over time:** After 10 runs, the template has been refined by accumulated adaptations. New runs get the improved version.
- **Every interactive process benefits:** Not just onboarding — any process where the Self needs adaptive control

## The `adapt_process` Self Tool

One new tool that can:
- Add a step (insert in `steps:` array)
- Remove/skip a step (mark as skipped or remove)
- Reorder steps (change sequence)
- Modify step config (update inputs, outputs, config fields)
- Update quality criteria
- Update any other process definition field

Each adaptation is logged as an activity with provenance (what changed, why, triggered by what user input). Trust governs whether adaptations need human approval — at supervised tier, the Self proposes changes and the user confirms.

## Key Decision: Template vs Instance

**The template definition is durable. The run instance gets the adapted copy.** `adapt_process` writes to `processRuns.definitionOverride`, not to `processes.definition`. This reconciles "processes are durable" (architecture.md) with "the Self adapts mid-flight":

- The canonical YAML template (`processes/onboarding.yaml`) is never modified at runtime
- Each process run can have a `definitionOverride` that supersedes the template for that run
- The heartbeat reads the override if present, falls back to the template
- The template improves over time through the normal sync cycle (human edits YAML), not through runtime mutation

## Architectural Requirements

- `processRuns.definitionOverride` column (nullable JSON) on the processRuns table
- Heartbeat reads override if present, falls back to canonical definition. Re-reads at each step boundary.
- `adapt_process` validates adapted definition against process-loader schema before writing
- `adapt_process` guards: cannot remove/reorder steps in `running` or `waiting_review` status
- Adaptation activities: log each modification with before/after and reasoning
- Scope enforcement: `system: true` check in code, not just prompt
- **ADR-020 required** before build — this is a fundamental extension to the process model

## Where It Should Land

- Brief 040: `adapt_process` as a Self tool
- Engine: verify heartbeat re-reads from DB (may already work)
- Engine: adaptation logging in activities table
- Insight-072 update: "living roadmaps" is now literally true at engine level
- ADR-016 update: Self can modify process definitions, not just execute them
