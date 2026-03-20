---
title: "rules executor type defined but unimplemented"
severity: low
status: deferred
scope: "src/db/schema.ts, src/engine/step-executor.ts"
source: build
reentry: "When a process definition needs deterministic logic steps beyond shell scripts"
created: 2026-03-19
resolved: null
---

## What

The `rules` executor type is defined in the `stepExecutorValues` union in `src/db/schema.ts` but has no implementation in `src/engine/step-executor.ts`. A step with `executor: rules` would hit the `default` case and throw "Unknown executor type."

## Why Deferred

No current process definition uses `rules` steps. The `script` executor handles all deterministic logic needs for dogfood. Adding an unused executor would be speculative code with no way to test it against real process requirements.

## Re-entry Condition

When a process definition needs deterministic logic steps that can't be expressed as shell scripts — e.g., JSON schema validation, rule-based routing, or conditional branching that doesn't warrant an LLM call.
