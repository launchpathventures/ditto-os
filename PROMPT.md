# Agent OS — Session Prompt

**Delete this file after using it. It's a one-time handover.**

---

## Context

This repo contains the initial scaffolding for Agent OS — a platform for human-agent collaboration where process is the primitive, not tasks or agents.

**Read these docs in order before writing any code:**

1. `docs/architecture.md` — The architecture spec. Six layers, 16 universal primitives, process-first model, trust tiers, harness patterns, governance. **This is the source of truth.**
2. `docs/human-layer.md` — Detailed design for Layer 6 (Human Layer). Wireframes for all 16 UI primitives, interaction patterns, daily experience narrative, UX philosophy, the "Teach this" feedback mechanism, the Explore/Operate modes. **This is the design source of truth.**
3. `docs/landscape.md` — Landscape analysis of every relevant framework. Evaluated: Mastra, Paperclip, Trigger.dev, Inngest, antfarm, ralph, gstack, compound-product, and tooling options. **Contains the resolved tooling decisions.**

The initial code was written too quickly and **does not follow the architecture**. It needs to be reworked.

---

## Core Concepts (Don't Skip These)

### Agent OS Is a Harness Creator

Agent OS is not an agent framework. It is a **harness creator**. Agents are commodities (Claude, GPT, scripts, APIs). What Agent OS creates is the harness within which agents operate. The harness:

1. **Evolves** — learns from feedback, corrections, and trust data
2. **Orchestrates** — coordinates multiple agents, determines who checks whom, when to pause for humans

A **process** is not a workflow — it is a **governance declaration**. It declares what inputs are acceptable, what value looks like, what quality gates apply, what trust level governs execution, and what outputs matter.

**Agents are pluggable. Processes are durable. The harness is the product.**

### Every Agent Operates Within a Common Harness

Each agent is effectively built within a common harness framework — like a mini framework that ensures consistent behaviour:
- Identity and authentication (who is this agent, what's it allowed to do?)
- Budget controls (cost tracking with soft alerts and hard stops)
- Quality criteria checking (specification testing against process-defined standards)
- Trust tier compliance (respecting the process's governance level)
- Feedback capture (every output, approval, edit, and rejection is recorded)
- Audit trail (immutable log of all actions for governance reporting)

This common harness is what enables governance at individual, team, and organisation levels.

### Composition Over Invention

The first principle — for the platform and for every agent within it — is: **"What can we build FROM?"** not **"What can we build?"**

Every significant component starts with a research step: scout what exists, evaluate, adopt or adapt the best available, and only write custom code to fill genuine gaps.

---

## What Exists (and its quality)

### Keep — these are good:
- `docs/architecture.md` — Architecture spec (source of truth)
- `docs/human-layer.md` — Human layer design (wireframes, interactions, UX)
- `docs/landscape.md` — Framework landscape scan with tooling decisions
- `processes/*.yaml` — 5 process definitions. Well-structured, faithful to the architecture.
- `src/adapters/claude.ts` — Claude adapter with 10 role-based system prompts. Prompts are good. Adapter interface needs to match `invoke()`, `status()`, `cancel()`.
- `AGENTS.md`, `README.md` — Fine as-is.

### Rework — wrong approach:
- `src/db/schema.ts` — Uses Postgres via Drizzle ORM. Replace with **Drizzle + better-sqlite3** (landscape scan recommendation). Keep the schema structure, swap the driver.
- `src/db/index.ts` — Postgres connection. Replace with SQLite.
- `drizzle.config.ts` — Postgres config. Replace with SQLite config.
- `src/engine/heartbeat.ts` — No harness. Needs complete rebuild around trust tiers, parallel execution, maker-checker patterns.
- `src/engine/step-executor.ts` — Too simple. Needs to BE the harness.
- `src/cli.ts` — Generic CRUD CLI. Replace with **citty + @clack/prompts** (landscape scan recommendation). Map to the 6 human jobs.

---

## Resolved Tooling Decisions (from landscape scan)

| Component | Choice | Why |
|-----------|--------|-----|
| **Storage** | Drizzle ORM + better-sqlite3 | Zero setup. Swap driver from Postgres, keep schema. antfarm-validated pattern. |
| **CLI routing** | citty (UnJS) | TypeScript-first, ESM, minimal. Great type inference. |
| **CLI UX** | @clack/prompts | Beautiful interactive prompts. Perfect for approve/edit/reject flows. |
| **Config** | conf | Platform-correct config directory. Good for API keys, preferences. |
| **Agent runtime** | Claude Code via Agent SDK | Hooks map to harness interception. |
| **Workflow engine** | Custom (antfarm pattern) | YAML + SQLite + cron. Defer Inngest/Trigger.dev/Mastra to scale phase. |

---

## What to Build — In Order

### Step 1: Replace Storage with SQLite (30 min)

Replace Postgres + Drizzle with Drizzle + better-sqlite3. Keep the schema structure from `schema.ts` — it defines the right entities (processes, runs, step_runs, outputs, feedback, captures, activities). Just swap the driver.

**Principles:**
- Zero setup — `pnpm cli sync` works immediately, no database server
- antfarm pattern: YAML + SQLite + cron. That's it.
- Database file lives at `data/agent-os.db` (gitignored)

### Step 2: Build the Harness (this is the core — take your time)

The harness is Layer 3 and **the most important differentiator**. Read `docs/architecture.md` section "Layer 3: Harness Layer" and the "Agent OS Is a Harness Creator" section carefully.

The harness sits between agent execution and human review. Every agent operates within the common harness framework (identity, budget, quality, trust, feedback, audit).

**A. Review patterns (per-process, configured in YAML):**

1. **Maker-Checker** — Agent A produces, Agent B reviews against quality criteria. In `processes/feature-implementation.yaml`, step 5 (self-review) is maker-checker: builder produces code, reviewer checks it.

2. **Adversarial Review** — Agent B prompted to find flaws. In `processes/code-review.yaml`, step 2 (bug-hunt): the bug-hunter's job is to break things.

3. **Parallel Execution** — In `processes/code-review.yaml`, steps 1-3 have `parallel_group: review`. Run concurrently, then step 4 (synthesise) runs after all complete.

4. **Specification Testing** — Check output against quality_criteria from the process YAML. Automatic for every process.

**B. Trust tier enforcement:**

Each process has a trust tier (supervised, spot_checked, autonomous, critical). The heartbeat must respect this:
- `supervised`: Every AI output pauses for human review before advancing
- `spot_checked`: Random ~20% of outputs pause, rest auto-advance
- `autonomous`: Only pause on exceptions (low confidence, quality criteria fail)
- `critical`: Always pause, even if trust data is good

**C. Trust earning:**

Track per-process: total runs, approval rate, correction rate, review cycles. When thresholds are met, suggest trust tier upgrade to human. **Never auto-upgrade. Auto-downgrade is always active.**

**D. Agent authentication (within the harness):**

Every agent must have a verified identity within the harness:
- Who is this agent? (identity, owner)
- What is it allowed to do? (scoped permissions per process)
- How did it get here? (provenance — registered by authorised human or trusted agent?)

**Implementation approach:**

```
When heartbeat hits an AI step:
  1. Verify agent identity and permissions for this process
  2. Check budget (soft alert at 80%, hard stop at 100%)
  3. Execute the step (via adapter)
  4. Check if this step has a harness pattern defined
     - If maker-checker: run the checker agent, include both outputs
     - If parallel_group: run all steps in group concurrently, wait for all
  5. Run specification testing against quality_criteria
  6. Check trust tier for this process
     - supervised: always create review item for human
     - spot_checked: randomly decide (80% auto-advance, 20% review)
     - autonomous: auto-advance unless confidence < threshold or spec test failed
     - critical: always create review item
  7. If review needed: pause run, create output in review queue
  8. If auto-advancing: record as auto-approved, continue to next step
  9. Record to audit trail (immutable log)
  10. Record feedback data (for learning layer)
```

### Step 3: Wire Up the Feedback Loop

When a human approves, edits, or rejects an output via the CLI:
- Record the feedback type (approve/edit/reject)
- If edited: capture the diff between agent output and human-edited version
- Extract correction patterns (the learning layer will use these later)
- Update trust data for the process
- Store in a way that future runs can reference past corrections
- Record to audit trail

Even if we don't build full degradation detection yet, the DATA must be captured from day one.

### Step 4: Make the CLI Reflect the Architecture

Use **citty** for command routing and **@clack/prompts** for interactive UX. Map to the human's six jobs (see `docs/human-layer.md` for the framework):

```
Orient:    pnpm cli status          — processes, runs, health, review queue summary
Review:    pnpm cli review [run-id] — show outputs waiting for human decision
           pnpm cli approve <id>    — approve and continue (records feedback)
           pnpm cli edit <id>       — open output for editing, then approve (captures diff)
           pnpm cli reject <id>    — reject with reason (records feedback)
Define:    pnpm cli sync            — sync YAML definitions to storage
           pnpm cli start <process> — start a new process run
Capture:   pnpm cli capture <text>  — quick capture note/task
Decide:    pnpm cli trust <process> — show trust data, earned level, current setting
Govern:    pnpm cli audit [process] — show audit trail, governance report
```

### Step 5: First End-to-End Run

Once steps 1-4 are done, run Process 1 (Feature Implementation) end to end:

```bash
pnpm cli sync
pnpm cli start feature-implementation brief="Add a health check endpoint to Agent OS that returns process status"
# Agent plans → harness checks → pauses for human review
pnpm cli review
pnpm cli approve <run-id>
# Agent implements → tests run → reviewer checks (maker-checker) → pauses for human
pnpm cli review
pnpm cli approve <run-id>
# Ships
pnpm cli trust feature-implementation  # See trust data accumulating
pnpm cli audit feature-implementation  # See full audit trail
```

This proves: process definition → agent execution → harness (review patterns + trust tiers) → human review → feedback capture → trust data → audit trail.

---

## Critical Rules

1. **Read ALL THREE docs before writing code.** `architecture.md`, `human-layer.md`, `landscape.md`. The architecture was designed over a long discovery session. Don't shortcut it.

2. **The harness is the product.** If you only build one thing well, build the harness. Every agent operates within the common harness framework. Everything else is plumbing.

3. **Borrow, don't invent.** Use the landscape scan (`docs/landscape.md`) as your shopping list. Reference antfarm, ralph, Paperclip, gstack, compound-product patterns. Look at their actual code on GitHub if needed. Ask "what can we build FROM?" before writing anything.

4. **Storage should be invisible.** Drizzle + better-sqlite3. No setup step. No database server. `pnpm cli sync` should just work on a fresh clone.

5. **Every process run must capture feedback data AND audit trail.** Even if we don't analyse it yet. The approve/edit/reject flow must record what happened, for both the learning layer and governance.

6. **Trust tiers must be enforced.** The heartbeat must check the trust tier before deciding whether to pause for human review or auto-advance.

7. **Parallel steps must actually run in parallel.** The code-review process has three agents in `parallel_group: review`. They must execute concurrently.

8. **Agent authentication must be enforced.** Every agent must be verified within the harness before it can execute. Identity, permissions, provenance.

---

## References to Study

Before building, look at how these projects handle similar problems:

- **antfarm** (`https://github.com/snarktank/antfarm`) — YAML + SQLite + sequential verification. Closest to our engine pattern.
- **ralph** (`https://github.com/snarktank/ralph`) — Flat file state, fresh context per iteration. Builder agent pattern.
- **Paperclip** (`https://github.com/paperclipai/paperclip`) — Heartbeat, adapters (`invoke/status/cancel`), budget controls, governance. Agent layer pattern.
- **Mastra** (`https://github.com/mastra-ai/mastra`) — Suspend/resume for HITL, parallel DSL. Harness pattern reference.
- **Trigger.dev** (`https://github.com/triggerdotdev/trigger.dev`) — Waitpoint tokens for HITL. Trust-tier pause mechanism reference.

---

## What Success Looks Like

After this session, I should be able to:

1. `pnpm cli sync` — loads process definitions from YAML (no database setup required)
2. `pnpm cli start feature-implementation brief="..."` — starts a run, planner agent produces a plan, harness verifies agent identity and checks quality, pauses for human review
3. `pnpm cli review` — see the plan output with confidence score and harness annotations
4. `pnpm cli approve <id>` — approve the plan, feedback recorded, audit logged, run advances
5. Builder implements, test script runs, reviewer agent checks (maker-checker harness), pauses for final human review
6. `pnpm cli approve <id>` — approve the code, feedback recorded, trust data updated
7. `pnpm cli trust feature-implementation` — see trust data accumulating (1 run, 0 corrections, supervised)
8. `pnpm cli audit feature-implementation` — see full audit trail of all agent actions and human decisions
9. `pnpm cli status` — see process health and run history

The whole thing runs locally with zero setup beyond `pnpm install` and an `ANTHROPIC_API_KEY`.
