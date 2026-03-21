# Agent OS

**Making agentic AI accessible and useful for everyone.**

AI agents are powerful but unusable for most people. They require prompt engineering, workflow design, or developer skills. They can't be trusted without constant supervision. They don't learn from corrections. They don't remember what worked. And they reinvent their approach every time — the same prompt produces different outcomes, not because context shifted, but because nothing durable governs how the work gets done.

Agent OS solves this. It's the structured layer between humans and AI that makes delegation reliable — balancing declarative process (consistent, governed, improving) with intuitive metacognition (adaptive, context-aware, intelligent). So anyone can hand off real work to agents and trust the results.

---

## Who This Is For

Agent OS is for **outcome owners** — people responsible for results who need reliable ways to get there. They might have a clear sense of the process, or they might just know what "good" looks like and need a system to help them define, refine, and improve the process over time.

They're not prompt engineers, workflow designers, or developers. They're domain experts drowning in operational work:

- A trades business owner who checks every quote personally because the last time he didn't, the wrong price went out
- An ecommerce director who rewrites the same marketing content every week because AI output is "fine but not us"
- A team lead who spends 3 hours every Monday reconciling invoices she knows a machine should handle

Their problem isn't "I need AI." It's **"I need to stop doing this myself, but nothing I've tried is reliable enough to hand off."**

Agent OS makes handoff safe. One process at a time.

## Why This Exists

Every time you give an AI the same task, it starts from scratch. No memory of what worked last time. No process to follow. No standards to meet. It reinvents the approach every time — and you re-check the same things every time. This is the fundamental problem: **AI without process is unreliable, and AI without memory is unlearning.**

On top of that, every agent platform has the same trust problem: **it's binary**. Either a human checks everything (expensive, doesn't scale) or the agent runs autonomously (risky, no governance). There's no middle ground. No way to earn trust progressively. No way for the system to learn from corrections without explicit feedback forms that nobody fills out.

Agent OS is the middle ground. Processes are durable — defined once, refined over time, executed consistently. The system learns from every correction. Trust is earned, not assumed.

## What Makes This Different

Agent OS is not an agent framework. It's a **harness creator** — a living workspace where work evolves through governed processes. The harness is the product, not the agents.

### Progressive trust — not binary

Every other platform is all-or-nothing: either you supervise everything or you let the agent run free. Agent OS has **four trust tiers** (supervised → spot-checked → autonomous → critical) that agents earn through track record. The system tracks approval rates, correction rates, and consistency over a sliding window. When an agent proves reliable, it *suggests* an upgrade — but never auto-promotes. When quality drops, trust auto-downgrades immediately. Different processes earn trust independently: you might trust the quoting agent but still supervise the invoicing agent.

### Agents check agents — before you see anything

Three composable review patterns run before output reaches a human: **maker-checker** (a second agent verifies), **adversarial** (an agent tries to find flaws), and **spec-testing** (output tested against quality criteria). These compose — a high-stakes process can use all three. Failed reviews trigger retry with the reviewer's feedback injected, so agents self-correct without human involvement.

### Implicit feedback — no forms, no friction

Humans won't fill out feedback forms. So the system learns from what they naturally do. An edit IS feedback (the system diffs and stores the correction). A rejection IS feedback (with optional reason). An approval IS feedback (reinforces the approach). Over time, the system detects patterns: "You consistently add the sustainability angle to product descriptions. Teach this?" The human taps yes. Learning without teaching.

### Work evolves — not just executes

A question becomes a task. A task spawns research. Research spawns a project. A goal decomposes into work items that route through multiple processes. The **goal-directed orchestrator** handles this evolution: it breaks goals into tasks, assigns them to processes, tracks completion, routes around paused items to continue independent work, and escalates when confidence is low. This is how real work happens — it grows and branches — and the system orchestrates it.

### Human steps — not just AI

Processes include real-world human actions, not just AI execution and review. A step can pause execution, create an action item with specific input fields, and wait for the human to complete their part. The orchestrator continues independent work while waiting. This models how work actually flows: some steps need a phone call, a site visit, or a judgment that only a human can make.

### The system runs on itself

The four system agents (intake classifier, router, trust evaluator, orchestrator) run through the same harness pipeline they govern — same trust tiers, same review patterns, same feedback capture. The development process (7 roles: PM, researcher, designer, architect, builder, reviewer, documenter) is a process definition that runs through the engine. Agent OS is its own first user.

### Quiet oversight — not a noisy approval queue

The system models how great managers actually work: periodic, trust-calibrated, exception-driven. As trust increases, oversight decreases. Autonomous processes run silently — no notifications unless something goes wrong. The morning brief summarises what happened overnight. The review queue shows only what needs human judgment. The goal is a quiet, reliable team — not a constant stream of approval requests.

## Core Concepts

**Agents are commodities. The harness is the product.** Claude, GPT, scripts, APIs — whatever comes next. The harness (review patterns, trust enforcement, memory, learning) is the unique value. Agents are pluggable. Processes are durable.

**Process is the primitive.** Not tasks, not agents, not workflows. A process is a governance declaration: what inputs are acceptable, what quality looks like, what trust tier applies, what review patterns enforce quality. Users think in goals and tasks; processes are the system's learned skills for handling work.

**Structure is what makes AI useful.** Raw AI chat is missing governance, memory, trust, continuity, quality assurance, and learning. Agent OS IS that structural scaffolding. The system does cognitive work; the human does judgment work.

### How it works

```
Work enters naturally (goal, task, question, insight)
  → Auto-classified and routed to the right process
  → Goals decompose into tasks across multiple processes
  → Steps execute (AI, script, or human action)
  → Review patterns enforce quality (maker-checker, adversarial, spec-testing)
  → Trust gate applies (supervised → spot-checked → autonomous)
  → Feedback captured implicitly (edits, approvals, rejections → learning)
  → Memory updated (what worked, what was corrected, what to remember)
  → Orchestrator routes around pauses to continue independent work
```

## Architecture

Six layers, each composable and independently evolvable:

| Layer | Purpose | Key feature |
|-------|---------|-------------|
| **L1 Process** | Governance declarations in YAML | Steps, parallel groups, conditional routing, human steps, quality criteria |
| **L2 Agent** | Executor abstraction | Bring your own AI — Claude, GPT, scripts, APIs. Role-based system prompts, tool use |
| **L3 Harness** | Middleware pipeline | 6 composable handlers: memory → execution → review → routing → trust → feedback |
| **L4 Awareness** | Event system | Pattern detection (e.g. "you keep correcting the same thing"), proactive notification |
| **L5 Learning** | Feedback loop | Implicit capture, trust earning algorithm, correction-to-memory bridge |
| **L6 Human** | Interaction surface | CLI today, web dashboard planned. Review queues, goal capture, trust controls |

See [docs/architecture.md](docs/architecture.md) for the full specification.

## Current Status

The engine is functional through **Phase 5** (5 build phases complete). Key capabilities working:

- 11 process definitions with parallel groups, conditional routing, and human steps
- Goal-directed orchestrator — decomposes goals, routes around pauses, escalates on low confidence
- Trust system — 4 tiers with deterministic sampling, sliding-window earning, automatic downgrade
- Review patterns — maker-checker, adversarial, spec-testing with retry and feedback injection
- Two-scope memory (agent + process) with salience sorting
- Auto-classification capture with graceful fallback
- 4 system agents running through the same harness they govern
- 3 non-coding process templates (invoice follow-up, content review, incident response)
- CLI with 12 commands
- 66 integration tests (real SQLite, no mocks except the LLM layer)

Currently dogfooding with its own development process — the 7-role dev pipeline runs through the engine.

See [docs/state.md](docs/state.md) for current status and [docs/roadmap.md](docs/roadmap.md) for the full capability map.

## Tech Stack

TypeScript (strict) on Node.js. SQLite via Drizzle ORM + better-sqlite3. Anthropic SDK. CLI via citty + @clack/prompts. Vitest. YAML process definitions. Zod validation.

## Project Structure

```
src/
  adapters/       # Agent executors (Claude API, CLI subprocess, script)
  cli/            # Commands and formatting
  db/             # Schema and database
  engine/         # Harness pipeline, heartbeat, process loader, system agents
processes/        # Domain and system process definitions (YAML)
templates/        # Non-coding process templates
docs/
  architecture.md # Full specification
  vision.md       # Why this exists
  personas.md     # Who we're building for
  state.md        # Current project state
  roadmap.md      # Capability map with status
```

## Development

```bash
pnpm install
pnpm cli sync        # Initialize database
pnpm test            # Run integration tests
pnpm run type-check  # TypeScript strict mode
```

## License

AGPL-3.0
