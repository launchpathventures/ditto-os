---
title: "Development memory uses flat files instead of Ditto memory architecture"
severity: high
status: resolved
scope: system
source: manual
reentry: "Phase 4 complete — dev process should migrate onto Ditto memory"
created: 2026-03-20
resolved: 2026-03-21
---

## What

The development process (Claude Code auto-memory in `.claude/projects/*/memory/`) uses a flat-file persistence mechanism with no scoring, no decay, no deduplication, no reinforcement signals, and no scope filtering. Meanwhile, Ditto has a researched memory architecture (ADR-003) with two-scope design, reinforcement weighting, token budgeting, confidence scoring, and a feedback-to-memory bridge.

We are not using the patterns we're building. The development harness should converge with the product's memory principles.

## Why Deferred

Ditto's memory system currently runs inside the engine (SQLite-backed, harness-integrated). The development process runs in Claude Code, which has its own persistence mechanism. Until Ditto can manage its own dev process context, there's no clean way to bridge the two.

## Re-entry Condition

When Phase 4 (Workspace Foundation) is complete and the system can accept work items and route them through processes — the dev process itself should be expressible as Ditto processes, and dev memory should use Ditto memory.

## Resolution

Brief 027 (Telegram Bot Engine Bridge) routes the Telegram dev bot through the engine's harness pipeline. Dev pipeline runs now use the engine's memory architecture (agent-scoped + process-scoped + intra-run context), trust evaluation, and feedback recording. The dev process dogfoods the memory system it builds.
