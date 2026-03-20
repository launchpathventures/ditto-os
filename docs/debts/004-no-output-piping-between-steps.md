---
title: "No output piping between steps"
severity: medium
status: deferred
scope: "src/engine/heartbeat.ts"
source: review
reentry: "When a process needs a step to consume the actual output of an upstream step (not just wait for it to complete)"
created: 2026-03-19
resolved: null
---

## What

Steps can declare `depends_on` to wait for upstream steps/groups to complete, but there is no mechanism for a downstream step to receive the outputs of upstream steps. Each step receives `run.inputs` (the original run inputs), not the accumulated outputs of prior steps. The brief specified merging parallel group results into `{ [stepId]: output }` for downstream consumption, but this is not implemented.

## Why Deferred

The current process definitions don't pipe outputs between steps at runtime — step inputs reference named concepts (`[code-changes, conventions]`) that are resolved from the original run inputs, not from prior step outputs. The dependency system correctly blocks execution until prerequisites complete, but output data doesn't flow automatically.

Implementing output piping requires design decisions about: namespace conflicts between steps, output format standardisation, and how to handle the case where a step's output name doesn't match the next step's expected input name. This is a Phase 3+ design concern.

## Re-entry Condition

When a process needs a step to consume the actual output content of an upstream step — not just wait for completion. This will likely emerge when building the end-to-end verification (Phase 5).
