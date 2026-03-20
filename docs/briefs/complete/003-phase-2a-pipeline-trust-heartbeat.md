# Brief: Phase 2a — Harness Pipeline + Trust Gate + Heartbeat Rewrite

**Date:** 2026-03-19
**Status:** complete
**Depends on:** Phase 1
**Unlocks:** Phase 2b, Phase 2c

## Goal

- **Roadmap phase:** Phase 2: Harness + Feedback Capture
- **Capabilities:** Harness pipeline skeleton, trust tier enforcement (4 tiers), heartbeat rewrite (remove auto-approve), harness decision recording

## Context

The heartbeat auto-approves everything (line 165 of `src/engine/heartbeat.ts`). There's no harness between agent output and human review. Phase 2a builds the **pipeline skeleton** — the structural foundation that all other Phase 2 work plugs into.

This is the critical path. Without the pipeline and trust gate, review patterns (2b) and parallel execution (2c) have nowhere to live. Without the heartbeat rewrite, the engine continues to bypass all harness logic.

Parent design: `docs/briefs/002-phase-2-harness.md` (full Phase 2 design). This sub-brief extracts sections 1, 2, 6, and 7.

## Objective

After 2a, a step execution flows through a harness pipeline: heartbeat triggers step -> pipeline runs -> step executes via adapter -> trust gate decides pause or advance -> decision recorded -> activity logged. Review patterns are stubbed (pass-through). Memory assembly is stubbed (no-op). But the pipeline exists and every step goes through it.

## Non-Goals

Everything in the parent brief's non-goals, plus:
- **Review patterns** — Phase 2b. The pipeline has a `ReviewPatternHandler` slot but it's a pass-through in 2a.
- **Memory assembly** — Phase 2b. The pipeline has a `MemoryAssemblyHandler` slot but it's a no-op in 2a.
- **Parallel execution** — Phase 2c. The heartbeat processes steps sequentially in 2a.
- **`depends_on` resolution** — Phase 2c. Steps execute in order as they do today.
- **Feedback-to-memory bridge** — Phase 2b. The feedback recorder logs to `harnessDecisions` and `activities` but does not create `memories` records.

## Inputs

1. `docs/briefs/002-phase-2-harness.md` — parent design (sections 1, 2, 6, 7)
2. `docs/research/phase-2-harness-patterns.md` — harness patterns research
3. `docs/architecture.md` — six-layer spec, trust tiers
4. `src/engine/heartbeat.ts` — current heartbeat (to rewrite)
5. `src/engine/step-executor.ts` — current step executor (unchanged, wrapped)
6. `src/db/schema.ts` — current schema (to extend)

## Constraints

All constraints from parent brief apply. Additionally:
- **Pipeline must be extensible** — 2b and 2c plug into it without modifying the pipeline core. Handlers are registered, not hardcoded.
- **Stub handlers must have the same interface as real handlers** — swapping a stub for a real handler is a drop-in replacement.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Handler registry (pipeline) | Sim Studio `apps/sim/executor/handlers/registry.ts` | Chain-of-responsibility with `canHandle()` + `execute()` |
| Trust tier enforcement (4 tiers) | **Original** | No system implements graduated trust with percentage-based sampling |
| Harness decision recording | **Original** | No source captures harness-level decisions distinctly |
| Heartbeat state machine | Paperclip `server/src/services/heartbeat.ts`, antfarm `src/installer/step-ops.ts` | Wake/execute/sleep cycle, SQLite state transitions |
| Activity logging | Paperclip `server/src/services/activity-log.ts` | Actor/action/entity model |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | **Modify**: Add `harnessDecisions` table |
| `src/engine/harness.ts` | **Create**: `HarnessPipeline` class, `HarnessHandler` interface, `HarnessContext` type, handler registration |
| `src/engine/harness-handlers/trust-gate.ts` | **Create**: Trust gate — 4 tiers, deterministic spot-check sampling |
| `src/engine/harness-handlers/step-execution.ts` | **Create**: Wraps existing `executeStep` as a pipeline handler |
| `src/engine/harness-handlers/feedback-recorder.ts` | **Create**: Records harness decisions to DB + activities |
| `src/engine/harness-handlers/review-pattern.ts` | **Create**: Stub — pass-through, returns `pass` for all steps. Interface ready for 2b. |
| `src/engine/harness-handlers/memory-assembly.ts` | **Create**: Stub — no-op, injects empty memory block. Interface ready for 2b. |
| `src/engine/heartbeat.ts` | **Rewrite**: Route step execution through `HarnessPipeline`. Remove auto-approve. Respect pipeline's pause/advance decision. |

## Design

### Pipeline Architecture

See parent brief section 1. The pipeline is:

```
MemoryAssemblyHandler (stub in 2a)
  -> StepExecutionHandler (wraps existing executeStep)
  -> ReviewPatternHandler (stub in 2a)
  -> TrustGateHandler (real — 4 tiers)
  -> FeedbackRecorderHandler (real — records decisions)
```

**Handler interface:**
```typescript
interface HarnessHandler {
  name: string;
  canHandle(context: HarnessContext): boolean;
  execute(context: HarnessContext): Promise<HarnessContext>;
}
```

Each handler receives and returns `HarnessContext`, mutating it as it proceeds. The pipeline runs handlers in order, passing context through. Any handler can short-circuit by setting `context.shortCircuit = true` (e.g., step execution fails -> skip review and trust gate -> go straight to recorder).

### Trust Gate

See parent brief section 2. Runs after step execution. Four tiers:

| Tier | Behaviour |
|------|-----------|
| Supervised | Always sets `trustAction: 'pause'` |
| Spot-checked | Deterministic hash of `processRunId + stepId + salt` → ~20% pause, ~80% advance |
| Autonomous | Sets `trustAction: 'advance'` unless `reviewResult === 'flag'` |
| Critical | Always sets `trustAction: 'pause'`, sets `canAutoAdvance: false` |

### Harness Decision Recording

See parent brief section 6. New `harnessDecisions` table:

```
harnessDecisions
├── id: text (UUID)
├── processRunId: text (FK)
├── stepRunId: text (FK)
├── trustTier: text
├── trustAction: text (pause | advance | sample_pause | sample_advance)
├── reviewPattern: text (JSON — always [] in 2a)
├── reviewResult: text (pass | flag | retry | skip — always 'skip' in 2a)
├── reviewDetails: text (JSON)
├── reviewCostCents: integer (always 0 in 2a)
├── memoriesInjected: integer (always 0 in 2a)
├── samplingHash: text
├── createdAt: integer (timestamp_ms)
```

### Heartbeat Rewrite

See parent brief section 7. Key changes:
- Remove line 165 auto-approve
- Replace direct `executeStep` call with `HarnessPipeline.run(context)`
- After pipeline returns, check `context.trustAction`:
  - `pause` → set step and run to `waiting_review`
  - `advance` → set step to `approved`, advance run
  - `fail` → set step and run to `failed`
- `startProcessRun()` unchanged
- `fullHeartbeat()` loop unchanged (still loops until pause or completion)
- Human step detection unchanged (`executor: human` → immediate pause, no pipeline)

## Acceptance Criteria

1. [ ] `harnessDecisions` table exists in schema and syncs via `drizzle-kit push`
2. [ ] `src/engine/harness.ts` exports `HarnessPipeline` class with `run(context)` method
3. [ ] `HarnessPipeline` accepts registered handlers and executes them in order
4. [ ] Trust gate correctly implements supervised (always pause)
5. [ ] Trust gate correctly implements spot-checked (~20% deterministic sampling)
6. [ ] Trust gate correctly implements autonomous (advance unless flagged)
7. [ ] Trust gate correctly implements critical (always pause, canAutoAdvance=false)
8. [ ] Spot-checked sampling is deterministic (same run + step = same decision)
9. [ ] Every step execution creates a `harnessDecisions` record
10. [ ] Every step execution creates an `activities` record with harness metadata
11. [ ] Heartbeat no longer auto-approves AI agent outputs
12. [ ] `pnpm cli start` runs a process through the harness pipeline
13. [ ] `pnpm cli review` and `pnpm cli approve` still work for paused steps
14. [ ] `pnpm cli sync` still works
15. [ ] `pnpm run type-check` passes with zero errors
16. [ ] Stub review-pattern handler returns `pass` and can be replaced without pipeline changes
17. [ ] Stub memory-assembly handler is a no-op and can be replaced without pipeline changes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Focus areas: pipeline extensibility, trust tier correctness, no auto-approve leaks, harness decision recording completeness
3. Present work + review findings to human

## After Completion

1. Update `docs/state.md` — Phase 2a complete, pipeline and trust gate working
2. Update `docs/roadmap.md` — mark harness pipeline, trust enforcement, heartbeat rewrite as done
3. Phase 2b is now unblocked
