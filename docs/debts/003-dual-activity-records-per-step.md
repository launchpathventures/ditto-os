---
title: "Two activity records created per step execution"
severity: low
status: deferred
scope: "src/engine/heartbeat.ts, src/engine/harness-handlers/feedback-recorder.ts"
source: review
reentry: "When building the activity feed UI (Phase 9) or when activity table volume becomes a concern"
created: 2026-03-19
resolved: null
---

## What

Every step execution that succeeds produces two activity records: `harness.decision` from the feedback-recorder handler inside the pipeline, and `step.completed` from the heartbeat outside the pipeline. They carry different metadata (harness decision details vs step-level timing/tokens), but double the activity feed entries per step.

## Why Deferred

The two records serve different purposes — `harness.decision` is the harness audit trail (trust tier, review result, memories injected), while `step.completed` is the execution audit trail (tokens, timing). Merging them would require one record to carry both concerns, making the activity schema less clean. At dogfood scale, the doubled volume is negligible.

## Re-entry Condition

When building the activity feed UI (Phase 9) — the UI needs to decide whether to show both records or merge them for display. Or when activity table volume grows large enough that the duplication matters for query performance.
