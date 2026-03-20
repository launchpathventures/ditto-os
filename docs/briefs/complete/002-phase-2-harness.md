# Brief: Phase 2 — Harness + Feedback Capture

**Date:** 2026-03-19
**Status:** complete
**Depends on:** Phase 1
**Unlocks:** Phase 3 (trust earning)

## Goal

- **Roadmap phase:** Phase 2: Harness + Feedback Capture
- **Capabilities:** Review patterns (maker-checker, adversarial, specification testing), trust enforcement (4 tiers), parallel execution (parallel_group + depends_on), feedback/harness decision recording, memory table + assembly, heartbeat rewrite

## Context

Phase 1 delivered SQLite storage and process definitions. The engine can load YAML processes, create runs, and execute steps sequentially. But the heartbeat auto-approves everything (line 165 of `src/engine/heartbeat.ts`), there's no harness between agent output and human review, no trust enforcement, no parallel execution, and no memory persistence.

Phase 2 builds the **core differentiator** — the harness layer that makes Agent OS more than an orchestrator. The harness is a middleware pipeline that wraps every step execution with review patterns, trust-based gating, and feedback recording. Every harness decision is captured from day one, building the data foundation for Phase 3 (Trust Earning) and Phase 5 (Learning).

Research is complete (`docs/research/phase-2-harness-patterns.md`, `docs/research/memory-systems.md`). Memory architecture is decided (ADR-003). This brief turns those findings into buildable work.

## Objective

After Phase 2, a process run flows through a harness pipeline: heartbeat triggers step -> harness resolves review pattern from trust tier -> agent harness assembles context (identity + memory) -> adapter executes -> harness applies review gate (pause for human or auto-advance) -> feedback recorded -> activity logged. Parallel groups execute via `Promise.all`. Every harness decision is persisted.

## Non-Goals

- **Trust earning/upgrading** — Phase 3. This phase enforces the configured tier; it does not change tiers based on data.
- **Ensemble consensus** — Listed in architecture but deferred. Requires multi-agent infrastructure not yet built. Re-entry: when 2+ agents can execute the same step independently.
- **Correction pattern extraction from diffs** — ADR-003 describes this but it requires an LLM call per feedback event. Phase 2 records the raw feedback and diff; Phase 3 builds the extraction pipeline.
- **Memory consolidation/reconciliation** — ADR-003's Mem0-style reconciliation is deferred to when memory volume demands it. Phase 2 writes memories via direct insert, not LLM reconciliation.
- **Vector search** — ADR-003 confirms scope filtering is sufficient at dogfood scale.
- **Agent self-modification of memory** — ADR-003 defers this.
- **Session persistence/snapshot** — Architecture describes resumable sessions. Deferred until processes have long-running steps that span multiple heartbeats. Re-entry: when a single step execution exceeds the adapter timeout.
- **Budget enforcement (hard stops)** — Schema has budget fields. Deferred to Phase 3. Phase 2 records cost; it does not block on budget.
- **CLI rewrite** — Phase 4. Existing CLI commands continue to work.
- **`rules` executor type** — Listed in schema union but no implementation. Not needed for Phase 2.
- **Executable quality criteria** — Insight-001 describes criteria that grow from feedback. Phase 2 stores criteria in the process definition; Phase 3 makes them executable checkers.
- **Agent permission checks** — The research flagged per-agent per-process permission scoping as needing further research. The `agents` table has `permissions` (JSON) but no enforcement mechanism. Phase 2 does not enforce permissions — the harness checks that the correct `agent_role` is assigned to a step (structural match), but does not implement fine-grained read/write/execute/approve scoping. Re-entry: when multi-agent orchestration requires agents to be constrained beyond role matching. Update the roadmap to move this to Phase 3 or later.
- **Trust downgrade triggers** — Architecture spec says trust automatically downgrades on error rate spikes, correction rate increases, etc. Both upgrades and downgrades are Phase 3. Phase 2 records the data (harness decisions, feedback) that will feed downgrade detection. State this explicitly.
- **Escalation beyond pause** — If a step fails max retries or a critical issue is flagged, the current design pauses for human review. No escalation chain (e.g., escalate to a different human, alert an external system). Sufficient for dogfood. Re-entry: when multi-user teams need escalation paths.

## Inputs

1. `docs/research/phase-2-harness-patterns.md` — Harness patterns, review approaches, parallel execution, feedback recording, heartbeat rewrite patterns from 7 source projects
2. `docs/research/memory-systems.md` — Memory architectures, storage, retrieval, consolidation from 9 systems
3. `docs/adrs/003-memory-architecture.md` — Memory table design, two-scope model, harness-managed memory, assembly function
4. `docs/architecture.md` — Six-layer spec, nested harness model, trust tiers, review patterns
5. `docs/insights/001-quality-criteria-are-additive.md` — Quality criteria emerge from feedback
6. `docs/insights/002-nested-agent-harnesses.md` — Three-level harness nesting (platform > process > agent)
7. `docs/insights/002-review-is-compositional.md` — Review layers are composable and cost-asymmetric
8. `docs/insights/003-learning-overhead-is-a-dial.md` — Learning overhead is tunable per process
9. `src/engine/heartbeat.ts` — Current heartbeat (to rewrite)
10. `src/engine/step-executor.ts` — Current step executor (to extend)
11. `src/db/schema.ts` — Current schema (to extend with memories table)
12. `processes/feature-implementation.yaml` — Reference process definition showing step structure, harness field, trust config

## Constraints

- **No new runtime dependencies** beyond what's in `package.json`. SQLite + Drizzle + better-sqlite3 remain the storage stack. No Mastra, Trigger.dev, Inngest, or Temporal (confirmed deferred by research).
- **Existing CLI must keep working.** `pnpm cli sync`, `pnpm cli status`, `pnpm cli start`, `pnpm cli review`, `pnpm cli approve`, `pnpm cli capture` must not break. New capabilities are additive.
- **Schema changes via `drizzle-kit push`** — destructive sync acceptable per ADR-001 (dogfood, no production data).
- **Harness is the product** — every design choice must strengthen the harness as the differentiator, not optimise agent execution.
- **Process YAML is the source of truth** for step definitions, review patterns, trust tiers, and parallel groups. The harness reads configuration from the process definition, not from code.
- **Composition over invention** — adopt patterns from source projects before writing original code. Every original piece must be explicitly marked.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Handler registry (harness pipeline) | Sim Studio `apps/sim/executor/handlers/registry.ts` | Chain-of-responsibility with `canHandle()` + `execute()`. Ordered, extensible, first-match. Cleanest middleware pattern found. |
| Maker-checker review | antfarm `src/installer/step-ops.ts` lines 728-845 | `verify_each` pattern: loop stays running, verifier outputs STATUS. Retry with feedback injection. Proven in production. |
| Adversarial review | antfarm verifier agent (prompting strategy) | Same structure as maker-checker, different prompt. Research confirmed adversarial is a prompting layer, not a structural difference. |
| Specification testing | **Original** | Validating against defined criteria programmatically. No source found. |
| Trust tier enforcement (4 tiers) | **Original** | No system implements graduated trust with percentage-based sampling. Mastra suspend + Trigger.dev waitpoints provide mechanism patterns. |
| Parallel execution (Promise.all) | Mastra `packages/core/src/workflows/handlers/control-flow.ts` `executeParallel` | `.parallel()` uses `Promise.all`, merges results into `{ [stepId]: output }`. Closest structural reference. |
| Activity/feedback logging | Paperclip `server/src/services/activity-log.ts` | Single `logActivity()` function. Actor/action/entity model. PII sanitisation. |
| Harness decision recording | **Original** | Recording which review pattern was applied, trust tier active, sample decision. No source captures harness-level decisions distinctly. |
| Memory table (two-scope) | ADR-003, Mem0 scope filtering | `scopeType` (agent/process) + `scopeId`. Flat facts with reinforcement counting. |
| Memory assembly | Letta `compile()`, Open SWE `get_agent()` | Single function composing context before invocation. |
| Heartbeat queue + state machine | Paperclip `server/src/services/heartbeat.ts`, antfarm `src/installer/step-ops.ts` | Wake/execute/sleep cycle. SQLite state transitions. Crash-recoverable. |
| Approval lifecycle | Paperclip `server/src/services/approvals.ts` | pending -> approved/rejected/revision_requested. Typed payloads. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | **Modify**: Add `memories` table per ADR-003. Add `harnessDecisions` table for recording pipeline decisions. |
| `src/engine/harness.ts` | **Create**: The harness middleware pipeline. Handler registry with ordered handlers: trust-gate, review-pattern, memory-assembly, feedback-recorder. |
| `src/engine/harness-handlers/trust-gate.ts` | **Create**: Trust tier enforcement. Reads process trust config. Supervised = always pause. Spot-checked = sample ~20%. Autonomous = pass-through. Critical = always pause. |
| `src/engine/harness-handlers/review-pattern.ts` | **Create**: Review pattern resolution. Reads step `harness` field from YAML. Supports maker-checker (spawn reviewer), adversarial (spawn reviewer with adversarial prompt), spec-testing (validate against quality criteria). |
| `src/engine/harness-handlers/memory-assembly.ts` | **Create**: Memory assembly function per ADR-003. Loads agent-scoped + process-scoped memories, merges, sorts by confidence x reinforcement, renders as structured text for system prompt injection. |
| `src/engine/harness-handlers/feedback-recorder.ts` | **Create**: Records every harness decision to `harnessDecisions` table and `activities` table. What review pattern was applied, what trust tier was active, whether the step was paused or auto-advanced, sampling decision for spot-checked. |
| `src/engine/heartbeat.ts` | **Rewrite**: Replace auto-approve with harness pipeline integration. Step execution now flows through harness. Support `parallel_group` via `Promise.all`. Support `depends_on` resolution. |
| `src/engine/step-executor.ts` | **Modify**: Add parallel group support. Accept step groups, execute via `Promise.all`, merge results. |
| `src/engine/process-loader.ts` | **Modify**: Parse `parallel_group` and `depends_on` from YAML. Validate parallel group structure on sync. |
| `processes/feature-implementation.yaml` | **Modify**: Add `parallel_group` example if appropriate (or leave sequential — not all processes need parallelism). Ensure `harness` and `trust` fields are well-structured for the new pipeline. |

## Design

### 1. Harness Pipeline Architecture

The harness is a chain-of-responsibility pipeline (Sim Studio handler registry pattern). Each handler has `canHandle(context)` and `execute(context)` methods. Handlers execute in order. The pipeline wraps every step execution.

```
Heartbeat triggers step
  -> HarnessPipeline.run(stepContext)
     -> MemoryAssemblyHandler: assemble agent context
        (loads agent + process memories, renders into prompt)
     -> StepExecutionHandler: invoke the adapter
        (existing executeStep, now wrapped)
     -> ReviewPatternHandler: apply post-execution review
        (maker-checker, adversarial, spec-testing based on step.harness)
     -> TrustGateHandler: should this output pause for human review?
        (reads trust tier + review results, applies sampling for spot-checked)
     -> FeedbackRecorderHandler: record what happened
        (harness decision, trust tier, review result -> DB)
  <- Returns: StepResult with harness metadata
```

The pipeline context carries:
- `processRun` — the run record
- `stepDefinition` — from YAML
- `processDefinition` — full process
- `trustTier` — resolved from process config
- `memories` — assembled by memory handler
- `harnessDecision` — accumulated as handlers execute
- `reviewResult` — set by review handler (approve/pause/reject)

**Key design choice:** The pipeline is synchronous within a single step. Each handler can short-circuit (e.g., trust gate decides to pause -> skip execution -> record decision). This is simpler than async middleware chains and matches the heartbeat's wake/execute/sleep model.

### 2. Trust Gate

The trust gate runs **after** step execution and review patterns. It decides whether the output is auto-advanced or paused for human review based on the process's configured trust tier.

| Tier | Gate behaviour | Human sees |
|------|---------------|------------|
| Supervised | Always pause | Every output |
| Spot-checked | ~20% sample pause, rest auto-advance | ~1 in 5 outputs (plus any flagged by review patterns) |
| Autonomous | Auto-advance unless review pattern flagged | Only flagged outputs |
| Critical | Always pause, cannot auto-advance | Every output, always |

For **spot-checked**, the sampling decision uses a deterministic hash of `(processRunId + stepId + salt)` so the same step in the same run always gets the same decision. This prevents gaming by re-running.

For **autonomous**, the gate passes unless a downstream handler (review pattern) flags an issue. The exception triggers are:
- Review pattern returns `flag` instead of `pass`
- Confidence score below threshold (from adapter result)
- Step is explicitly marked `always_review: true` in YAML

The trust gate sets `harnessDecision.trustAction` to `pause` or `advance` and the reason why. This is recorded by the feedback handler.

### 3. Review Patterns (Composable Layers)

Per Insight-002 (Review Is Compositional), review patterns are **layers**, not alternatives. A step can have multiple review layers.

**YAML format change:** The existing `feature-implementation.yaml` uses `harness: maker-checker` (singular string, line 104). This brief introduces a structured format. The builder must update the YAML parser and all existing process YAML files to the new format:

```yaml
harness:
  review:
    - maker-checker    # Agent B reviews Agent A's output
    - spec-testing     # Validate against quality_criteria
```

The parser should accept both the legacy string format (`harness: maker-checker` → treated as `harness.review: [maker-checker]`) and the new structured format for backward compatibility during migration.

Three review patterns for Phase 2:

**Maker-checker** (from antfarm): After the primary agent produces output, a second agent reviews it. The reviewer receives the output + the step's verification criteria + process quality criteria. Returns: `pass` (no issues), `flag` (issues found, include in human review), or `retry` (send back to producer with feedback). Max retries configurable (default: 2).

**Adversarial** (from antfarm, prompting layer): Same structure as maker-checker, but the reviewer's system prompt is specifically prompted to find flaws, challenge assumptions, and argue against the output. This is a prompting strategy, not a structural difference — the handler configures the reviewer adapter with an adversarial system prompt.

**Specification testing** (Original): Validates output against the process's `quality_criteria`. For Phase 2, this is a single LLM call that receives the output + the criteria list and returns pass/fail per criterion. No programmatic validation — all criteria are evaluated via LLM judgment. Programmatic validators (regex, schema checks, etc.) are a Phase 3+ extension. Failed criteria → flag for human review.

Review layers execute in order. If any layer returns `retry`, the step re-executes (up to max retries). If any layer returns `flag`, the output is marked for human review regardless of trust tier. Only if all layers return `pass` does the trust gate's sampling decision apply.

**Cost awareness (from Insight-002):** Self-review (same agent checks its own output) is free — it's part of the agent's system prompt, not a separate handler invocation. Maker-checker and adversarial are expensive — separate agent invocations. The harness records cost per review layer.

### 4. Memory Assembly (ADR-003 Implementation)

The memory assembly handler runs before step execution. It implements ADR-003's assembly function:

1. **Load agent-scoped memories** — `SELECT * FROM memories WHERE scope_type = 'agent' AND scope_id = :agentId AND active = true`
2. **Load process-scoped memories** — `SELECT * FROM memories WHERE scope_type = 'process' AND scope_id = :processId AND active = true`
3. **Merge and sort** — by `reinforcementCount DESC, confidence DESC` (simple two-column sort). This is the canonical sorting for Phase 2. The memU-inspired `confidence * log(reinforcementCount + 1)` formula from the research is a Phase 3+ refinement when recency decay matters. ADR-003's sorting description should be updated to match this simpler approach.
4. **Apply budget** — take top-N memories that fit within a configurable token allocation (default: 2000 tokens). Count by rough character estimate (4 chars/token).
5. **Render** — format as a structured text block:
   ```
   ## Agent Memory
   - [correction] Always include error handling in API routes (confidence: 0.8, reinforced: 3x)
   - [preference] Use early returns over nested conditionals (confidence: 0.6, reinforced: 1x)

   ## Process Memory (feature-implementation)
   - [correction] Plans must identify affected test files (confidence: 0.9, reinforced: 5x)
   - [context] Target repo uses pnpm, not npm (confidence: 1.0, reinforced: 2x)
   ```
6. **Inject** — the rendered block is added to the adapter's system prompt context.

For Phase 2, memories are written manually via CLI or via the feedback recorder when a human provides `edit` or `reject` feedback. The feedback recorder creates a memory record with `source: 'feedback'`, `sourceId: feedback.id`, `type: 'correction'`, and `confidence: 0.3` (single observation). No LLM extraction — the human's comment becomes the memory content. Proper LLM-based extraction (ADR-003's Mem0-style reconciliation with ADD/UPDATE/DELETE/NONE) is Phase 3.

**ADR-003 phasing note:** ADR-003 describes the full memory architecture including LLM-based reconciliation. Phase 2 implements the schema and assembly function; Phase 3 implements reconciliation and extraction. The builder should add a "Phased Implementation" section to ADR-003 making this explicit.

### 5. Parallel Execution

Process YAML supports `parallel_group`:

```yaml
steps:
  - id: plan
    name: Plan approach
    executor: ai-agent
    # ...

  - parallel_group: review-checks
    depends_on: [plan]
    steps:
      - id: convention-check
        name: Convention compliance
        executor: ai-agent
        agent_role: reviewer
        # ...
      - id: security-scan
        name: Security scan
        executor: ai-agent
        agent_role: security
        # ...

  - id: human-review
    name: Human review
    depends_on: [review-checks]  # Waits for entire parallel group
    executor: human
```

**Execution model:**
- The heartbeat resolves `depends_on` before executing a step/group
- A `parallel_group` executes all its steps via `Promise.all`
- If any step in the group fails, the entire group fails (Mastra pattern)
- Results are merged into `{ [stepId]: output }` and available to subsequent steps
- Each step within a parallel group goes through the full harness pipeline independently
- Trust gating applies per-step within the group (a spot-checked process might pause on one parallel step and auto-advance another)
- If any step in a parallel group is paused for human review, the group as a whole is `waiting_review`. The human can review and approve individual steps within the group. The group advances only when all its steps are `approved`. The run status shows `waiting_review` with `currentStepId` set to the parallel group ID.

**`depends_on` resolution:**
- Steps/groups declare `depends_on: [stepId | groupId]`
- A step is ready when all its dependencies are `approved`
- The heartbeat finds all ready steps, groups them (parallel groups execute together, sequential steps execute one at a time)
- If no step is ready and the run isn't complete, it's blocked (waiting on human review or a failed dependency)

### 6. Harness Decision Recording

Every step execution produces a harness decision record:

```
harnessDecisions table:
├── id: text (UUID)
├── processRunId: text
├── stepRunId: text
├── trustTier: text (supervised | spot_checked | autonomous | critical)
├── trustAction: text (pause | advance | sample_pause | sample_advance)
├── reviewPattern: text (JSON array of patterns applied)
├── reviewResult: text (pass | flag | retry | skip)
├── reviewDetails: text (JSON — per-layer results)
├── reviewCostCents: integer (total cost of review-layer invocations)
├── memoriesInjected: integer (count of memories in context)
├── samplingHash: text (for spot-checked reproducibility)
├── createdAt: integer (timestamp_ms)
```

**Note for builder:** The `stepRuns` table should also gain a `parallelGroupId` field (nullable text) to associate steps executed as part of a parallel group. This aids querying group results and debugging.

This is the data foundation for Phase 3 (Trust Earning). Every harness decision is queryable: "How many times did this process's trust gate pause? What's the auto-advance rate? Which review patterns are catching real issues?"

The `activities` table also gets a `harness.decision` action type for the human-readable audit trail.

### 7. Heartbeat Rewrite

The heartbeat (`src/engine/heartbeat.ts`) is rewritten to:

1. **Load run** — same as now
2. **Resolve next step(s)** — NEW: check `depends_on`, find all ready steps, identify parallel groups
3. **For each ready step (or parallel group):**
   a. Create `HarnessContext` with step, process, trust config
   b. Run through `HarnessPipeline`
   c. Pipeline returns: `advance` (step complete, move on), `pause` (waiting for human), `retry` (re-execute with feedback), or `fail`
4. **Update run state** — advance to next step, or set `waiting_review`, or complete
5. **Log activity** — same pattern as now, enriched with harness metadata

The `fullHeartbeat()` function continues to loop until hitting a pause or completion, but now respects parallel groups (all steps in a group complete before advancing).

**What's removed:**
- Line 165: `status: "approved"` auto-approve — replaced by trust gate decision
- Direct `executeStep` call — now goes through harness pipeline
- Hardcoded `needsReview: nextStep.executor === "ai-agent"` — replaced by trust gate + review pattern

**What's preserved:**
- `startProcessRun()` — unchanged
- `logActivity()` — enhanced but same pattern
- Human step detection — still pauses for `executor: human`
- `processOutputs` table — the harness pipeline continues writing to `processOutputs` for reviewable outputs. The `harnessDecisions` table records harness metadata (trust action, review results); `processOutputs` holds the actual content for the review queue. These are complementary, not overlapping.

### 8. Schema Changes

**New table: `memories`** (per ADR-003):

```
memories
├── id: text (UUID)
├── scopeType: text ("agent" | "process")
├── scopeId: text
├── type: text ("correction" | "preference" | "context" | "skill")
├── content: text (natural language)
├── source: text ("feedback" | "human" | "system")
├── sourceId: text (nullable)
├── reinforcementCount: integer (default 1)
├── lastReinforcedAt: integer (timestamp_ms)
├── confidence: real (0.0-1.0)
├── active: integer (boolean, default true)
├── createdAt: integer (timestamp_ms)
├── updatedAt: integer (timestamp_ms)
```

**New table: `harnessDecisions`** (described in section 6).

## Acceptance Criteria

1. [ ] `memories` table exists in schema and syncs via `drizzle-kit push`
2. [ ] `harnessDecisions` table exists in schema and syncs via `drizzle-kit push`
3. [ ] `src/engine/harness.ts` exports a `HarnessPipeline` class with `run(context)` method
4. [ ] Trust gate handler correctly implements all 4 tiers: supervised always pauses, spot-checked pauses ~20%, autonomous passes unless flagged, critical always pauses
5. [ ] Spot-checked sampling is deterministic (same run + step = same decision)
6. [ ] Review pattern handler supports maker-checker: spawns reviewer agent, processes pass/flag/retry result
7. [ ] Review pattern handler supports adversarial: same as maker-checker with adversarial system prompt
8. [ ] Review pattern handler supports spec-testing: validates output against process quality_criteria
9. [ ] Review patterns are composable: a step with `[maker-checker, spec-testing]` runs both
10. [ ] Memory assembly handler loads agent-scoped + process-scoped memories, merges, sorts, renders into prompt text
11. [ ] Memory assembly respects a configurable token budget (default 2000 tokens)
12. [ ] Heartbeat no longer auto-approves AI agent outputs (line 165 replaced)
13. [ ] Heartbeat resolves `depends_on` before executing steps
14. [ ] Parallel groups execute via `Promise.all` and merge results
15. [ ] If any step in a parallel group fails, the group fails
16. [ ] Every step execution creates a `harnessDecisions` record
17. [ ] Every step execution creates an `activities` record with harness metadata
18. [ ] Feedback recorder creates a `memories` record (type: correction) when feedback type is `edit` or `reject`
19. [ ] `pnpm cli sync` still works (process loader parses parallel_group and depends_on)
20. [ ] `pnpm cli start` runs a process through the harness pipeline (not the old auto-approve path)
21. [ ] `pnpm cli review` and `pnpm cli approve` still work for paused steps
22. [ ] `pnpm run type-check` passes with zero errors
23. [ ] Process YAML with `parallel_group` + `depends_on` loads and executes correctly
24. [ ] YAML `harness` field parser accepts both legacy string format (`harness: maker-checker`) and new structured format (`harness.review: [list]`)
25. [ ] `stepRuns` table has `parallelGroupId` field for grouping parallel step executions
26. [ ] `harnessDecisions` table has `reviewCostCents` field tracking review layer costs
27. [ ] Roadmap updated: ensemble consensus moved out of Phase 2, agent permission checks deferred, ADR-003 status updated

## Review Process

How to validate the work after completion:

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Layer alignment: L2 (memory assembly, agent harness), L3 (review patterns, trust gate), L5 (feedback recording)
   - Provenance: every handler traces to a source or is marked Original
   - Composition: no reinvention of patterns available in source projects
   - Trust model: defaults to supervised, never auto-upgrades, never auto-approves without trust gate
   - Feedback capture: every harness decision recorded
   - Simplicity: minimum for Phase 2, no Phase 3+ features pulled forward
   - Spec compliance: matches architecture.md nested harness model
3. Present work + review findings to human for approval

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for completed Phase 2 items
3. Phase retrospective: what worked, what surprised, what to change
4. Write ADR-004 (Harness Pipeline) if the handler registry pattern warrants its own ADR
5. Write ADR-005 (Parallel Execution) if the parallel_group design warrants its own ADR
