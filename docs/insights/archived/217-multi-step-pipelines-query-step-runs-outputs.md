# Insight-217: Multi-step pipelines must query `step_runs.outputs` — the harness does not auto-merge

**Date:** 2026-04-27
**Trigger:** Brief 226 build — the analyser has 9 sequential steps where the cloned-repo path emitted by `clone-and-scan` must reach 8 downstream handlers. The brief described "passing findings via the in-memory handler context" loosely; verifying the actual harness pipeline showed it does NOT merge previous step outputs into the next step's `inputs`. Each step receives the original `processRun.inputs` only.
**Layers affected:** L1 Process (process definitions), L3 Harness (pipeline contract)

## The Insight

The harness pipeline (`packages/core/src/harness/pipeline.ts` + `src/engine/heartbeat.ts:executeSingleStep`) wraps every step execution but does NOT auto-merge previous step outputs into the next step's input map. Each step's handler receives `processRun.inputs` (the original kickoff inputs) plus the harness-injected `_stepRunId` + `_processRunId` — nothing more.

This means: when downstream steps in a multi-step pipeline need data produced by an earlier step (analyser handlers reading the cloned-repo `tempDir`, knowledge-extractor's assembler reading three parallel extractors' outputs, etc.), the downstream handler MUST query `step_runs.outputs` from the database itself, keyed by `processRunId` + `stepId`. There is no implicit "context" object that carries forward.

Brief 226 codified this with a small helper at `src/engine/onboarding/handlers.ts:readPriorStepOutputs(processRunId)` that returns `{ [stepId]: outputs }` — every detector + scoring + surface-report handler uses it. The pre-existing `knowledge-extractor.ts:executeKnowledgeAssembler` follows the same pattern via `inputs["context-analysis"]` etc. (the parallel-group runner appears to flow some outputs but linear sequences do NOT).

## Implications

1. **Architects writing multi-step process definitions must explicitly plan how downstream steps read upstream output.** Loose phrases like "passes via handler context" or "threads through inputs" are misleading. The reality is: each handler queries `step_runs.outputs` for the data it needs.
2. **Helper-pattern is reusable.** `readPriorStepOutputs(processRunId)` returning `Record<stepId, outputs>` is the canonical shape. Future multi-step processes should adopt the same helper rather than re-inventing per-handler queries.
3. **Last-write-wins semantics on retries.** When the heartbeat retries a failed step, the new step_run row has the same `stepId` and a new `id` + `outputs`. The aggregator should pick the most recent row (or filter to `status='approved'`) — Brief 226 currently does last-write-wins via the iteration order returned by drizzle. Future helper hardening could sort by `completedAt DESC`.
4. **Defensive fallbacks are valuable.** When upstream step output is missing (a step crashed without writing outputs), surface-step handlers can either fail-fast or recompute inline. Brief 226's `surface-report` recomputes inline AND logs a warning — silent recovery would hide upstream-step failures.

## Where It Should Land

**Near-term:** This insight, plus a one-paragraph note in `docs/architecture.md` §Layer 3 (Harness) clarifying the pipeline's input-passing contract — the loose "handler context" language has misled at least Brief 226's author and probably others.

**Medium-term:** A small reusable utility at `packages/core/src/harness/step-output-reader.ts` exporting `readPriorStepOutputs(db, processRunId)` so the pattern is one-import everywhere, not re-implemented per process. The current implementation in `src/engine/onboarding/handlers.ts` could become the seed when the second multi-step process needs it.

**Long-term:** Consider whether the harness pipeline itself should optionally auto-merge step outputs (e.g., a step config flag `inherits_outputs: true`). Today's contract — every handler queries explicitly — is more verbose but less magical. Don't change it without an explicit ergonomics complaint from a process author.

**Status until absorbed:** active. Will become absorbed when (a) the architecture.md note lands, OR (b) the reusable utility exists in core. Trigger for absorption: third multi-step process that needs the pattern.

---

## Status: absorbed (2026-04-28, Brief 228 wrap)

Brief 228 (Project Retrofitter) discharged BOTH absorption conditions in a single brief:
- **(a) Architecture.md §Layer 3 paragraph landed** at 2026-04-28 by the Documenter (one-paragraph note: "Multi-step pipeline output passing — handlers query `step_runs.outputs` explicitly"). Names the canonical helper at `packages/core/src/harness/step-output-reader.ts`; warns architects against loose "passes via handler context" language; cites Briefs 226, 228, and the cron-driven outbound monitor as the three multi-step pipelines that exercised the pattern.
- **(b) Reusable utility extracted to `packages/core/src/harness/step-output-reader.ts`** by Brief 228 Builder. Exported via the `@ditto/core` barrel (`packages/core/src/index.ts:75` + `packages/core/src/harness/index.ts:41`). Brief 226's onboarding handlers now consume the shared helper (no behavioural drift; 13 Brief-226 tests still pass). Brief 228's retrofit handlers consume the shared helper from day one.

The third-multi-step-pipeline trigger fired as predicted. Insight is moved to `docs/insights/archived/`.
