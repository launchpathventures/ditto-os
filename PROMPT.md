# Agent OS — Session Prompt

**Delete this file after using it. It's a one-time handover.**

---

## Context

This repo contains the initial scaffolding for Agent OS — a platform for human-agent collaboration where process is the primitive, not tasks or agents. The full architecture spec is at `docs/architecture.md`. Read it completely before writing any code.

The initial code was written too quickly and **does not follow the architecture**. It needs to be reworked. Here's what happened and what needs to change.

## What Exists (and its quality)

### Keep — these are good:
- `docs/architecture.md` — The architecture spec. This is the source of truth. Read it fully.
- `processes/*.yaml` — 5 process definitions (feature implementation, code review, self-improvement, bug investigation, project orchestration). Well-structured, faithful to the architecture.
- `src/adapters/claude.ts` — Claude adapter with 10 role-based system prompts (planner, builder, reviewer, bug-hunter, etc.). The prompts are good. The adapter interface needs to match the architecture's `invoke()`, `status()`, `cancel()` pattern.
- `AGENTS.md`, `README.md` — Fine as-is.

### Rework — wrong approach:
- `src/db/schema.ts` — Uses Postgres via Drizzle ORM. This is over-engineered for a dogfood. Replace with SQLite (like antfarm) or flat JSON files (like ralph). Zero setup, run immediately.
- `src/db/index.ts` — Postgres connection. Replace.
- `drizzle.config.ts` — Postgres config. Replace.
- `src/engine/heartbeat.ts` — Runs steps sequentially with no harness. Doesn't implement trust tiers, parallel execution, or maker-checker patterns. Needs to be rebuilt around the harness.
- `src/engine/step-executor.ts` — Too simple. Just routes to adapters. Needs to be the harness — the layer where agents check each other's work before output reaches humans.
- `src/cli.ts` — Generic CRUD CLI. Functional but doesn't reflect the architecture's human layer.

## What to Build — In Order

### Step 1: Replace Storage (30 min)

Replace Postgres + Drizzle with SQLite using `better-sqlite3` (or even flat JSON files in a `data/` directory). The data model from `schema.ts` is correct as a reference for WHAT to store — processes, runs, step_runs, outputs, feedback, captures, activities. The storage mechanism is what's wrong.

**Principles:**
- Zero setup — `pnpm cli sync` should work immediately, no database server needed
- Follow antfarm's pattern: "YAML + SQLite + cron. That's it."
- Or follow ralph's pattern: flat files in a data directory
- The data model is an implementation detail at this stage — don't over-engineer it

### Step 2: Build the Harness (this is the core — take your time)

The harness is Layer 3 in the architecture and **the most important differentiator**. It's what makes Agent OS not just another agent runner. The current code has no harness at all.

Read `docs/architecture.md` section "Layer 3: Harness Layer" carefully.

The harness sits between agent execution and human review. It implements:

**A. Review patterns (per-process, configured in YAML):**

1. **Maker-Checker** — Agent A produces output, Agent B reviews it against the process's quality criteria before it reaches the human. Look at `processes/feature-implementation.yaml` step 5 (`self-review`) — this IS a maker-checker pattern. The builder produces code, the reviewer checks it.

2. **Adversarial Review** — Agent B is specifically prompted to find flaws. Look at `processes/code-review.yaml` step 2 (`bug-hunt`) — the bug-hunter's job is to break things.

3. **Parallel Execution** — Look at `processes/code-review.yaml` — steps 1, 2, 3 all have `parallel_group: review`. They should run concurrently (convention-checker + bug-hunter + security-reviewer), then step 4 (synthesise) runs after all three complete.

4. **Specification Testing** — Check output against the quality_criteria defined in the process YAML. This should be automatic for every process.

**B. Trust tier enforcement:**

Each process has a trust tier (supervised, spot_checked, autonomous, critical). The heartbeat must respect this:
- `supervised`: Every AI output pauses for human review before advancing
- `spot_checked`: Random ~20% of outputs pause for review, rest auto-advance
- `autonomous`: Only pause on exceptions (low confidence, quality criteria fail)
- `critical`: Always pause, even if trust data is good

**C. Trust earning:**

Track per-process: total runs, approval rate, correction rate, review cycles. When thresholds are met (defined in process YAML under `trust.upgrade_path`), suggest trust tier upgrade to the human. Never auto-upgrade.

**Implementation approach:**

```
When heartbeat hits an AI step:
  1. Execute the step (via adapter)
  2. Check if this step has a harness pattern defined
     - If maker-checker: run the checker agent, include both outputs
     - If parallel_group: run all steps in the group concurrently, wait for all
  3. Check trust tier for this process
     - supervised: always create review item for human
     - spot_checked: randomly decide (80% auto-advance, 20% review)
     - autonomous: auto-advance unless confidence < threshold
     - critical: always create review item
  4. If review needed: pause run, create output in review queue
  5. If auto-advancing: record as auto-approved, continue to next step
  6. Record feedback data (for learning layer)
```

### Step 3: Wire Up the Feedback Loop

When a human approves, edits, or rejects an output via the CLI:
- Record the feedback type (approve/edit/reject)
- If edited: capture the diff between agent output and human-edited version
- Extract correction patterns (the learning layer will use these later)
- Update trust data for the process (increment approval count, correction count, etc.)
- Store in a way that future runs can reference past corrections

This is Layer 5 (Learning). Even if we don't build the full degradation detection yet, the DATA must be captured from day one. You can't build learning later if you didn't capture feedback now.

### Step 4: Make the CLI Reflect the Architecture

The CLI should map to the human's six jobs (from the architecture):

```
Orient:    pnpm cli status          — processes, runs, health, review queue summary
Review:    pnpm cli review [run-id] — show outputs waiting for human decision
           pnpm cli approve <id>    — approve and continue (records feedback)
           pnpm cli edit <id>       — open output for editing, then approve (captures diff)
           pnpm cli reject <id>     — reject with reason (records feedback)
Define:    pnpm cli sync            — sync YAML definitions to storage
           pnpm cli start <process> — start a new process run
Capture:   pnpm cli capture <text>  — quick capture note/task
Decide:    pnpm cli trust <process> — show trust data, earned level, current setting
```

### Step 5: First End-to-End Run

Once steps 1-4 are done, run Process 1 (Feature Implementation) end to end:

```bash
pnpm cli sync
pnpm cli start feature-implementation brief="Add a health check endpoint to Agent OS that returns process status"
# Agent plans → pauses for human review
pnpm cli review
pnpm cli approve <run-id>
# Agent implements → tests run → reviewer checks → pauses for human
pnpm cli review
pnpm cli approve <run-id>
# Ships
```

This proves: process definition → agent execution → harness (review agent checks builder) → human review → feedback capture → trust data accumulation.

## Critical Rules

1. **Read `docs/architecture.md` completely before writing code.** The architecture was designed over a long session. Don't shortcut it.

2. **The harness is the product.** If you only build one thing well, build the harness. Everything else is plumbing.

3. **Borrow, don't invent.** The architecture spec has a borrowing strategy table. Reference ralph, antfarm, gstack, Paperclip, compound-product patterns. Look at their actual code on GitHub if needed.

4. **Storage should be invisible.** SQLite or flat files. No setup step. No database server. `pnpm cli sync` should just work on a fresh clone.

5. **Every process run must capture feedback data.** Even if we don't analyse it yet. The approve/edit/reject flow must record what happened, so the learning layer has data to work with later.

6. **Trust tiers must be enforced.** The heartbeat must check the trust tier before deciding whether to pause for human review or auto-advance. This is fundamental to the progressive autonomy model.

7. **Parallel steps must actually run in parallel.** The code-review process has three agents in `parallel_group: review`. They must execute concurrently, not sequentially.

## References to Study

Before building, spend 10 minutes looking at how these projects handle similar problems:

- **antfarm** (`https://github.com/snarktank/antfarm`) — YAML workflows, SQLite state, sequential verification gates. Closest to what we need for the engine.
- **ralph** (`https://github.com/snarktank/ralph`) — Flat file state (progress.txt, prd.json). Fresh context per iteration. The builder agent should follow this pattern.
- **Paperclip** (`https://github.com/paperclipai/paperclip`) — Heartbeat cycle, adapter interface (`invoke/status/cancel`), atomic checkout, budget controls. Reference for the agent layer.

## What Success Looks Like

After this session, I should be able to:

1. `pnpm cli sync` — loads process definitions from YAML (no database setup required)
2. `pnpm cli start feature-implementation brief="..."` — starts a run, planner agent produces a plan, harness pauses for human review
3. `pnpm cli review` — see the plan output with confidence score
4. `pnpm cli approve <id>` — approve the plan, feedback recorded, run advances to builder
5. Builder implements, test script runs, reviewer agent checks (maker-checker harness), pauses for final human review
6. `pnpm cli approve <id>` — approve the code, feedback recorded, trust data updated
7. `pnpm cli trust feature-implementation` — see trust data accumulating (1 run, 0 corrections, currently supervised)
8. `pnpm cli status` — see the process health and run history

The whole thing runs locally with zero setup beyond `pnpm install` and an `ANTHROPIC_API_KEY`.
