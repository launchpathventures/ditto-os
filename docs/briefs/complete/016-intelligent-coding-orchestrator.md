# Brief: Intelligent Coding Orchestrator (Engine-First)

**Date:** 2026-03-20
**Status:** ready
**Depends on:** Phase 4a (complete), Brief 015 (complete — provides Telegram bot, to be evolved)
**Unlocks:** Phase 4b/4c (human steps, meta-processes, confidence scoring) — this brief builds the missing engine capabilities. Also unlocks continuous roadmap execution and proves the adapter abstraction.

## Goal

- **Roadmap phase:** Phase 4b/4c (delivers 4 missing engine capabilities needed for these phases)
- **Capabilities:** CLI adapter, conditional routing, notification surface, confidence-based gating

## Context

Brief 015 delivered a working dev pipeline as a **parallel system** — `claude -p` calls chained by a TypeScript script, outside the engine. This was a valid stepping stone, but it has three problems:

1. **It's a parallel system.** The engine has a harness (trust gates, feedback capture, memory, review patterns). The dev pipeline has none of it — feedback goes to session JSON and is forgotten.
2. **It can't improve.** No feedback loop, no trust progression, no correction patterns. The process is static code.
3. **It's not what ships.** End users get the engine, not `dev-pipeline.ts`. Patterns validated here must be rebuilt.

The solution: define the dev pipeline as a **process YAML** and run it on the **real engine**. The coding process becomes the first process that exercises conditional routing, a CLI adapter, notification events, and confidence-based gating — all capabilities the engine needs for Phase 4b/4c anyway.

This also establishes the **adapter abstraction**: users choose their execution substrate (Claude CLI, Codex CLI, API) and Agent OS wraps it in governance. The CLI adapter is the first alternative to the existing API adapter.

## Objective

The dev pipeline runs as a process on the Agent OS engine. The heartbeat drives execution. The harness wraps every step with trust gates, feedback capture, memory assembly, and review patterns. The coding process earns trust, captures corrections, and improves over time — like any Agent OS process. The Telegram bot subscribes to harness events for mobile review and digest.

## Non-Goals

- **Not replacing all of dev-pipeline.ts in one brief.** The Telegram bot and session management evolve incrementally. The engine runs the process; the bot becomes a notification/review surface for harness events.
- **Not implementing the full attention model.** We implement confidence-based gating at the trust gate level. Adaptive sampling and health alerts come later.
- **Not implementing all meta-processes.** intake-classifier and orchestrator system agents are Phase 4c scope. This brief adds conditional routing to the heartbeat — the infrastructure they'll need.
- **Not multi-provider adapter support yet.** We build the CLI adapter for `claude` first. Codex/OpenAI adapters follow the same interface but come later.
- **Not a generic "coding agent framework."** This is the dev pipeline process running on the engine. Generalization to end-user coding processes is informed by this experience.

## Inputs

1. `src/engine/heartbeat.ts` — Heartbeat loop to extend with conditional routing
2. `src/engine/harness.ts` — Harness pipeline (5 handlers) — the coding process goes through this
3. `src/adapters/claude.ts` — Existing API adapter — interface to match for CLI adapter
4. `src/engine/step-executor.ts` — Routes to adapters by executor type — add `cli-agent` routing
5. `src/engine/process-loader.ts` — Process YAML loading — extend StepDefinition for routing
6. `src/dev-bot.ts` — Telegram bot — evolve to subscribe to harness events
7. `src/db/schema.ts` — Schema — extend for confidence, routing decisions
8. `processes/feature-implementation.yaml` — Existing process — pattern reference for dev-pipeline YAML
9. `.claude/commands/dev-*.md` — Role contracts — become agent system prompts
10. `docs/adrs/011-attention-model.md` — Confidence scoring design
11. `docs/insights/039-fixed-sequences-are-an-anti-pattern.md` — Conditional routing requirement
12. `docs/insights/040-continuous-roadmap-execution.md` — Continuous execution requirement

## Constraints

- MUST use the existing engine (heartbeat, harness, trust gates, feedback, memory) — not a parallel system
- MUST implement CLI adapter as a proper adapter alongside the API adapter (same interface)
- MUST use `claude -p` via CLI adapter (no API tokens — runs on Claude subscription)
- MUST use `--dangerously-skip-permissions` for headless roles (no TTY for interactive approval; this grants full filesystem access — the trust gate and supervised default are the governance layer; continuous mode amplifies exposure window, which is acceptable because trust must be earned before auto-advance)
- MUST use `--model opus` for parity with interactive Claude Code
- MUST preserve existing API adapter — CLI adapter is additive
- MUST preserve existing process definitions — no breaking changes to YAML format
- MUST preserve existing CLI commands (`aos start`, `aos approve`, etc.)
- MUST trace every pattern to a source project
- MUST start processes in supervised tier (architecture constraint) — trust is earned, not assumed

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| CLI adapter (subprocess execution) | ralph (snarktank/ralph) | Autonomous loop with fresh context per iteration; proven for coding agents |
| Adapter abstraction (multiple substrates) | Paperclip (paperclipai/paperclip) | Adapter pattern for different execution backends; TypeScript |
| Conditional routing (output → next step) | Inngest AgentKit `/packages/agent-kit/src/network.ts` | Three-mode routing: code → LLM → human; maps to trust progression |
| Conditional edges (graph-based) | LangGraph `/libs/langgraph/langgraph/pregel/main.py` | `path_function(output) → next_node`; deterministic routing |
| Verify-fix middleware | Aider (via QA research) | Auto-lint-and-fix loop; integrated into build cycle |
| Completion scoring | Mastra Networks `/packages/core/src/loop/network/index.ts` | Validate output quality before advancing |
| Error recovery middleware | Open SWE (langchain-ai) | 4-layer middleware: error handling → feedback injection → empty forcing → fallback |
| Confidence self-assessment | ADR-011 (Original) | Categorical high/medium/low; low = escalate regardless of tier |
| Continuous prioritise → execute | compound-product (snarktank/compound-product) | Self-improving product cycle; continuous roadmap execution |
| Notification events | Trigger.dev (triggerdotdev/trigger.dev) | Event emitter pattern for external surface subscription |
| Process YAML for coding | antfarm (snarktank/antfarm) | YAML workflow definitions + independent verification agents |

## What Changes (Work Products)

### Sub-brief 016a: CLI Adapter + Executor Routing

| File | Action |
|------|--------|
| `src/adapters/cli.ts` | Create: CLI adapter — spawns `claude -p` (or `codex`) as subprocess, same interface as claude.ts |
| `src/engine/step-executor.ts` | Modify: Add `cli-agent` executor type routing to CLI adapter |
| `src/db/schema.ts` | Modify: Add `cli-agent` to StepExecutor type union |

### Sub-brief 016b: Conditional Routing in Heartbeat

| File | Action |
|------|--------|
| `src/engine/heartbeat.ts` | Modify: After step completion, evaluate `route_to` / `skip_if` conditions before advancing |
| `src/engine/process-loader.ts` | Modify: Extend StepDefinition with `route_to`, `skip_if`, `retry_on_failure` fields |
| `src/engine/harness-handlers/routing.ts` | Create: Routing handler — evaluates step output for routing signals, sits between step-execution and trust-gate in harness chain |

### Sub-brief 016c: Dev Pipeline Process Definition

| File | Action |
|------|--------|
| `processes/dev-pipeline.yaml` | Create: Dev pipeline as process YAML — 7 roles as steps with conditional routing |
| `src/adapters/cli.ts` | Modify: Add role contract loading (`.claude/commands/dev-*.md`) as system prompt source |

### Sub-brief 016d: Confidence-Based Gating + Notification Events

| File | Action |
|------|--------|
| `src/engine/harness-handlers/trust-gate.ts` | Modify: Read confidence from step output, use for gate decisions alongside trust tier |
| `src/engine/harness-handlers/step-execution.ts` | Modify: Parse confidence self-assessment from adapter output |
| `src/engine/events.ts` | Create: Event emitter for harness lifecycle (step-start, step-complete, gate-pause, gate-advance, digest) |
| `src/dev-bot.ts` | Modify: Subscribe to harness events instead of custom pipeline callbacks |
| `src/db/schema.ts` | Modify: Add `confidenceLevel` text column to stepRuns (high/medium/low) |

## Schema Changes (Review Finding Resolution)

### Confidence type migration (numeric → categorical)

The existing code uses `confidence?: number` (e.g., `0.7` in `StepExecutionResult`, `< 0.5` comparison in trust-gate.ts). ADR-011 specifies categorical (`high/medium/low`). This brief implements ADR-011's categorical model. Migration:

1. `StepExecutionResult.confidence` changes from `number | undefined` to `"high" | "medium" | "low" | undefined`
2. Trust-gate handler changes from `confidence < 0.5` to `confidence === "low"`
3. `processOutputs.confidenceScore` (real column) is replaced by `confidenceLevel` (text column) on `stepRuns`
4. Existing Claude API adapter changes its return from `confidence: 0.7` to `confidence: "high"` (or undefined if not assessable)
5. All existing processes continue to work — if confidence is undefined, trust gate falls back to tier-only logic (current behaviour)

### StepDefinition extensions

New optional fields added to `StepDefinition` in `process-loader.ts`:

```typescript
interface StepDefinition {
  // ... existing fields ...

  // Conditional routing (016b)
  route_to?: Array<{ condition: string; goto: string }>;
  default_next?: string;

  // Retry middleware (016b)
  retry_on_failure?: {
    max_retries: number;
    retry_condition?: string;
    feedback_inject?: boolean;
  };
}
```

All new fields are optional — existing process YAMLs continue to parse unchanged.

### ProcessDefinition trust/feedback structure

The dev-pipeline.yaml uses the same `trust` and `feedback` structures as existing process YAMLs (`feature-implementation.yaml`). The `trust.upgrade_path` and `trust.downgrade_triggers` fields already exist in the `ProcessDefinition` type as free-form YAML (stored as JSON in the `definition` column). No schema change needed — these are parsed from the YAML `definition` blob, not from typed columns.

### RunStatus extension

Add `"skipped"` to `runStatusValues` in schema.ts. Steps skipped by conditional routing get this status. The heartbeat's `findNextWork()` treats `"skipped"` the same as `"completed"` for dependency resolution (the step is done, just not executed).

### Routing handler position in harness pipeline

The routing handler runs **after review-pattern, before trust-gate**. Pipeline order becomes:
1. memory-assembly
2. step-execution
3. review-pattern
4. **routing** (new — evaluates output for routing signals)
5. trust-gate (reads routing confidence alongside step confidence)
6. feedback-recorder (records routing decisions)

Routing runs after review because the reviewer's verdict may affect routing (e.g., reviewer FAIL → route back to builder).

### Routing decision persistence

Routing decisions are recorded by the feedback-recorder handler (which already records all harness decisions to `harnessDecisions` table). The `harnessDecisions` table stores `decision` as JSON — routing decisions are added as `{ type: "routing", from: stepId, to: stepId, reasoning, confidence, mode }`. No new table needed.

## Design

### 1. CLI Adapter (`src/adapters/cli.ts`)

Same interface as the Claude API adapter. Instead of calling the Anthropic API, spawns `claude -p` as a subprocess.

```typescript
interface AdapterConfig {
  type: "cli-agent";
  cli: "claude" | "codex";     // Which CLI tool to use
  model?: string;               // --model flag (default: "opus")
  permissionMode?: string;      // --dangerously-skip-permissions by default
}

interface CLIAdapterResult {
  outputs: Record<string, unknown>;  // { response: string }
  tokensUsed?: number;               // Estimated from output length
  costCents?: number;                // 0 for subscription-based CLI
  confidence?: "high" | "medium" | "low";  // Parsed from output
  logs?: string[];
}
```

**Key behaviours:**
- Loads role contract from `.claude/commands/{agent_role}.md` as `--append-system-prompt`
- Injects memories from harness context as part of the prompt preamble
- Parses `CONFIDENCE: high|medium|low` from output tail
- Uses `--no-session-persistence` (fresh context per step, ralph pattern)
- Uses `--model opus` by default (parity with interactive Claude Code)
- Passes `--dangerously-skip-permissions` (no TTY for approval)
- Returns stdout as `outputs.response`

**Future adapters follow the same interface:**
- `codex` CLI adapter — same pattern, different binary
- OpenAI API adapter — same interface, API calls instead of subprocess
- Local model adapter (ollama) — same interface, local inference

### 2. Conditional Routing in Heartbeat

Currently `findNextWork()` returns the next step whose dependencies are met. It doesn't consider the *output* of the previous step. Adding routing means:

**Step definition extensions:**
```yaml
steps:
  - id: pm-triage
    executor: cli-agent
    agent_role: pm
    route_to:                    # Output-driven routing
      - condition: "output contains 'skip researcher'"
        goto: architect-design
      - condition: "output contains 'brief exists'"
        goto: builder-implement
      - condition: "output contains 'research needed'"
        goto: researcher-scout
    default_next: researcher-scout

  - id: builder-implement
    executor: cli-agent
    agent_role: builder
    retry_on_failure:
      max_retries: 3
      retry_condition: "output contains 'type-check failed'"
      feedback_inject: true     # Feed error output back into retry
```

**Routing handler (new harness handler):**

Sits in the harness chain between step-execution and trust-gate. After a step executes:

1. Check `route_to` conditions against step output (code-based, Mode 1 — simple string matching)
2. If no match, use `default_next` (deterministic fallback)
3. Set `context.routingDecision` with `{ nextStepId, reasoning, confidence, mode }`
4. Heartbeat reads `routingDecision` when selecting next work

**Deferred: LLM-based routing (Mode 2).** For 016b, only code-based routing (Mode 1) and `default_next` are implemented. The dev-pipeline.yaml's `route_to` conditions are all simple string matches — Mode 1 is sufficient. LLM-based routing (Mode 2, using Sonnet for novel routing decisions) is deferred to a follow-up brief when processes have routing needs that can't be expressed as string conditions.

**Retry middleware (verify-fix loop):**

Part of the routing handler. If `retry_on_failure` is defined and the retry condition matches:
1. Increment retry counter on stepRun
2. Re-queue the same step with error output injected as input feedback
3. If max retries exceeded, set confidence to "low" → trust gate will pause

### 3. Dev Pipeline Process Definition (`processes/dev-pipeline.yaml`)

```yaml
name: Dev Pipeline
id: dev-pipeline
version: 1
status: active

trigger:
  type: manual

inputs:
  - name: task
    type: text
    source: manual
    required: true
  - name: codebase
    type: repository
    source: git
    required: true

steps:
  - id: pm-triage
    name: PM Triage
    executor: cli-agent
    agent_role: pm
    description: Read state.md and roadmap.md, recommend what to work on
    inputs: [task, codebase]
    outputs: [recommendation, next_role]
    route_to:
      - condition: "brief exists"
        goto: builder-implement
      - condition: "research needed"
        goto: researcher-scout
      - condition: "design needed"
        goto: designer-ux
    default_next: researcher-scout

  - id: researcher-scout
    name: Research Scout
    executor: cli-agent
    agent_role: researcher
    depends_on: [pm-triage]
    inputs: [task, codebase]
    outputs: [research_report]
    route_to:
      - condition: "no designer needed"
        goto: architect-design
    default_next: designer-ux

  - id: designer-ux
    name: Designer UX
    executor: cli-agent
    agent_role: designer
    depends_on: [pm-triage]
    inputs: [task, codebase]
    outputs: [interaction_spec]
    default_next: architect-design

  - id: architect-design
    name: Architect Design
    executor: cli-agent
    agent_role: architect
    depends_on: [pm-triage]
    inputs: [task, codebase]
    outputs: [brief, adr]
    route_to:
      - condition: "brief produced"
        goto: builder-implement
    default_next: builder-implement
    harness:
      review: [maker-checker]

  - id: builder-implement
    name: Builder Implement
    executor: cli-agent
    agent_role: builder
    depends_on: [pm-triage]
    inputs: [task, codebase]
    outputs: [code_changes, acceptance_status]
    retry_on_failure:
      max_retries: 3
      retry_condition: "type-check failed"
      feedback_inject: true
    default_next: reviewer-check
    harness:
      review: [spec-testing]

  - id: reviewer-check
    name: Reviewer Check
    executor: cli-agent
    agent_role: reviewer
    depends_on: [builder-implement]
    inputs: [task, codebase]
    outputs: [review_verdict]
    route_to:
      - condition: "FAIL"
        goto: builder-implement
    default_next: documenter-wrap

  - id: documenter-wrap
    name: Documenter Wrap
    executor: cli-agent
    agent_role: documenter
    depends_on: [reviewer-check]
    inputs: [task, codebase]
    outputs: [state_update]

outputs:
  - name: completed-work
    type: code
    destination: git-repository

quality_criteria:
  - Type-check passes after builder step
  - All acceptance criteria from the brief are met
  - Reviewer finds no architectural violations
  - State.md is updated with what changed

trust:
  initial_tier: supervised
  upgrade_path:
    - from: supervised
      to: spot_checked
      requires: "10 runs at ≥85% approval rate"
    - from: spot_checked
      to: autonomous
      requires: "20 runs at ≥90% approval, trend stable"
  downgrade_triggers:
    - condition: "approval rate drops below 70%"
      to: supervised
    - condition: "2 consecutive rejections"
      to: supervised

feedback:
  capture:
    - type: approval_rate
    - type: edit_severity
    - type: correction_patterns
```

### 4. Confidence-Based Gating

**Extension to trust-gate handler:**

Currently the trust gate reads `trustTier` and makes pause/advance decisions. Add confidence as a second dimension:

```typescript
// In trust-gate.ts, after existing tier logic:
const confidence = context.stepResult?.confidence;

if (confidence === "low") {
  // Override: always pause for low confidence, regardless of tier
  context.trustAction = "pause";
  context.pauseReason = "low-confidence";
} else if (tier === "autonomous" && confidence === "high") {
  // Fast path: auto-advance with digest
  context.trustAction = "advance";
  context.digestMode = true;
}
```

**Confidence parsing in CLI adapter:**

The CLI adapter includes this instruction in every role's prompt:
```
At the end of your response, include:
CONFIDENCE: high|medium|low
REASON: <brief explanation>
```

The adapter parses this from output tail and returns it in `StepExecutionResult.confidence`.

### 5. Notification Events (`src/engine/events.ts`)

Simple event emitter that the harness publishes to and external surfaces subscribe to.

```typescript
type HarnessEvent =
  | { type: "step-start"; processRunId: string; stepId: string; roleName: string }
  | { type: "step-complete"; processRunId: string; stepId: string; summary: string; confidence: string; duration: number }
  | { type: "gate-pause"; processRunId: string; stepId: string; reason: string; output: string }
  | { type: "gate-advance"; processRunId: string; stepId: string; confidence: string }
  | { type: "routing-decision"; processRunId: string; from: string; to: string; reasoning: string; mode: string }
  | { type: "retry"; processRunId: string; stepId: string; attempt: number; feedback: string }
  | { type: "phase-complete"; processRunId: string; summary: string }
  | { type: "digest"; processRunId: string; items: DigestItem[] }

const harnessEvents = new EventEmitter<HarnessEvent>();
export { harnessEvents };
```

The Telegram bot subscribes:
```typescript
harnessEvents.on("gate-pause", (event) => {
  // Send alert with inline keyboard to Telegram
});

harnessEvents.on("digest", (event) => {
  // Send accumulated digest summary
});

harnessEvents.on("step-complete", (event) => {
  // Update pinned status message
});
```

### 6. Continuous Mode

Uses the existing heartbeat's `fullHeartbeat()` in a loop:

```typescript
async function continuousMode(processSlug: string) {
  while (true) {
    // 1. Start a new run of the dev-pipeline process
    const run = await startProcessRun(processSlug, {
      task: "Read docs/roadmap.md and identify the next incomplete milestone",
      codebase: process.cwd(),
    });

    // 2. Run heartbeat until completion or pause
    await fullHeartbeat(run.id);

    // 3. Check result
    const result = loadRun(run.id);
    if (result.status === "waiting_review") {
      // Trust gate paused — wait for human via CLI or Telegram
      break;
    }
    if (result.status === "completed") {
      // Task done — loop back for next priority
      harnessEvents.emit({ type: "phase-complete", processRunId: run.id, summary: "..." });
      continue;
    }
    if (result.status === "failed") {
      harnessEvents.emit({ type: "gate-pause", processRunId: run.id, stepId: "?", reason: "unrecoverable failure", output: "..." });
      break;
    }
  }
}
```

This reuses the existing `fullHeartbeat` loop — which already handles dependency resolution, parallel groups, trust gates, and memory assembly. Continuous mode just wraps it in an outer loop that starts new runs.

## Sub-Brief Sizing

This brief has 4 natural seams. Each sub-brief is independently testable:

### Sub-brief 016a: CLI Adapter + Executor Routing
**Depends on:** Nothing (additive)
**Unlocks:** 016c (process definition needs cli-agent executor)
**AC:** 1-5 (5 criteria)

### Sub-brief 016b: Conditional Routing in Heartbeat
**Depends on:** Nothing (additive to heartbeat)
**Unlocks:** 016c (process definition uses route_to)
**AC:** 6-10 (5 criteria)

### Sub-brief 016c: Dev Pipeline Process Definition
**Depends on:** 016a (cli-agent executor), 016b (conditional routing)
**Unlocks:** 016d (notification surface for the running process)
**AC:** 11-14 (4 criteria)

### Sub-brief 016d: Confidence Gating + Notification Events
**Depends on:** 016a (confidence parsing in CLI adapter), 016c (process to emit events from)
**Unlocks:** Continuous mode, mobile review via Telegram
**AC:** 15-17 (3 criteria)

## User Experience

- **Jobs affected:** Orient (digest from running process), Review (exception-only via trust gate), Delegate (kick off continuous mode), Define (process YAML defines the coding workflow)
- **Primitives involved:** Daily Brief (digest events), Review Queue (trust gate pauses), Activity Feed (step-complete events), Quick Capture (feedback at exception gates)
- **Process-owner perspective:** "I typed `aos start dev-pipeline --input task='Build Phase 4b'` and the engine ran it. I got a Telegram digest when it finished. One step had low confidence and paused — I approved it from my phone. The process earned trust and now auto-advances for high-confidence outputs."
- **Interaction states:** Running (heartbeat executing), Paused (trust gate), Completed (process done), Digest (accumulated summary), Exception (low confidence alert)
- **Designer input:** Not invoked — Telegram UX carries forward from Brief 015

## Acceptance Criteria

### 016a: CLI Adapter
1. [ ] CLI adapter spawns `claude -p` with `--model opus`, `--dangerously-skip-permissions`, `--no-session-persistence`
2. [ ] CLI adapter loads role contract from `.claude/commands/{agent_role}.md` as `--append-system-prompt`
3. [ ] CLI adapter parses `CONFIDENCE: high|medium|low` from output and returns in result
4. [ ] Step executor routes `cli-agent` executor type to CLI adapter
5. [ ] CLI adapter returns `costCents: 0` (subscription-based, no API cost)

### 016b: Conditional Routing
6. [ ] StepDefinition supports `route_to` field with condition/goto pairs
7. [ ] Heartbeat evaluates `route_to` conditions against step output after completion
8. [ ] If no `route_to` condition matches, `default_next` is used
9. [ ] `retry_on_failure` re-queues the same step with error output as input (up to max_retries)
10. [ ] After max_retries exceeded, step confidence is set to "low" (triggers trust gate pause)

### 016c: Dev Pipeline Process
11. [ ] `processes/dev-pipeline.yaml` parses and syncs to DB via `aos sync`
12. [ ] `aos start dev-pipeline --input task="Build Phase 4b"` runs the process through the heartbeat
13. [ ] PM role output triggers correct routing (skip to builder when brief exists)
14. [ ] Reviewer FAIL routes back to builder (not forward to documenter)

### 016d: Confidence + Events
15. [ ] Trust gate reads confidence from step result; `low` confidence overrides tier to pause
16. [ ] Harness emits events (step-start, step-complete, gate-pause, gate-advance) via event emitter
17. [ ] Telegram bot subscribes to harness events and sends messages (replacing custom pipeline callbacks)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Does CLI adapter follow the same interface as the API adapter?
   - Does conditional routing preserve dependency resolution integrity?
   - Does the process YAML parse correctly with existing process-loader?
   - Does confidence gating honour the trust model (supervised default, earned autonomy)?
   - Are all patterns traced to source projects?
   - Is each sub-brief independently testable?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 016a: CLI adapter works
aos sync  # Sync processes
aos start dev-pipeline --input task="Write a hello-world test"
# → PM role runs via claude -p, output includes CONFIDENCE line
# → Step recorded in DB with confidence level

# 016b: Conditional routing works
# → PM output contains "brief exists"
# → Heartbeat skips researcher/designer, routes to builder
# → Visible in step_runs table: researcher and designer have status "skipped"

# 016c: Full pipeline
aos start dev-pipeline --input task="Build Phase 4b"
# → Process runs through heartbeat with correct routing
# → Trust gate pauses (supervised tier) for human review
aos review  # Shows pending review
aos approve <runId>  # Approve and continue
# → Heartbeat advances to next step

# 016d: Confidence + events
# → Builder runs, outputs CONFIDENCE: high
# → After earning spot_checked tier: high confidence auto-advances
# → Telegram receives step-complete event with digest
# → Low confidence step triggers gate-pause event → Telegram alert
```

## After Completion

1. Update `docs/state.md` — CLI adapter, conditional routing, dev-pipeline process, confidence gating
2. Update `docs/roadmap.md` — Mark Phase 4b/4c capabilities delivered by this brief
3. Update `docs/architecture.md` — Add CLI adapter to Layer 2, conditional routing to Layer 1
4. Retrospective: Did the coding process earn trust? How many corrections before auto-advance? What routing patterns were missing? How does CLI adapter quality compare to API adapter?
5. Capture insight: What did we learn about running the dev process on the engine?
6. Move Brief 016 to `docs/briefs/complete/`
