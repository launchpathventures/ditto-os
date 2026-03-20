---
title: "Development memory uses flat files instead of Agent OS memory architecture"
severity: high
status: deferred
scope: system
source: manual
reentry: "Phase 4 complete — dev process should migrate onto Agent OS memory"
created: 2026-03-20
resolved: null
---

## What

The development process (Claude Code auto-memory in `.claude/projects/*/memory/`) uses a flat-file persistence mechanism with no scoring, no decay, no deduplication, no reinforcement signals, and no scope filtering. Meanwhile, Agent OS has a researched memory architecture (ADR-003) with two-scope design, reinforcement weighting, token budgeting, confidence scoring, and a feedback-to-memory bridge.

We are not using the patterns we're building. The development harness should converge with the product's memory principles.

## Why Deferred

Agent OS's memory system currently runs inside the engine (SQLite-backed, harness-integrated). The development process runs in Claude Code, which has its own persistence mechanism. Until Agent OS can manage its own dev process context, there's no clean way to bridge the two.

## Re-entry Condition

When Phase 4 (Workspace Foundation) is complete and the system can accept work items and route them through processes — the dev process itself should be expressible as Agent OS processes, and dev memory should use Agent OS memory.

## Resolution

[Pending]
