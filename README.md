# Ditto

**A process-governed harness for AI agents that earns trust, learns from corrections, and thinks about its work.**

Every agent framework solves execution. None solves what happens after — how agents earn autonomy through track record, learn from corrections without feedback forms, follow durable processes instead of reinventing each run, or bring the right cognitive posture to different kinds of work. Ditto is the governed layer that wraps your agents. Agents are pluggable. Processes are durable. The harness is the product.

## What Makes This Different

**Process is the primitive.** Not tasks, not agents — processes. A process is a governance declaration: inputs, quality gates, trust levels, feedback loops, cognitive framing. Defined in YAML with conditional routing, parallel execution, role assignment, human decision points, and retry with feedback injection. Defined once. Refined through use. Never reinvented.

**Trust is earned, not configured.** Four tiers — supervised → spot-checked → autonomous → critical — earned through tracked approval rates and correction patterns over a sliding window. The system suggests upgrades. Humans decide. Quality drops trigger automatic downgrade. Different processes earn trust at different rates.

**Corrections are learning.** Edits are diffed and stored. Approvals are confirmation. Rejections are signal. After 3+ similar corrections, the system surfaces the pattern. No feedback forms. The harness learns from natural human work.

**Agents have cognitive posture.** This is the gap no agent framework addresses: agents don't just need tools and prompts — they need the right *thinking approach* per task. Ditto's cognitive architecture ([ADR-014](docs/adrs/014-agent-cognitive-architecture.md)) gives agents:

- **Cognitive framing** — each process step declares a posture: exploratory ("explore widely, don't converge early"), analytical ("check assumptions, verify against evidence"), adversarial ("find what's wrong, stress-test"), generative ("prioritize novelty and quality")
- **A toolkit, not a script** — mental models (first principles, inversion, probabilistic thinking), reflection prompts, reasoning strategies. Available to the agent, never mandated. Based on MeMo (Guan et al., 2024): LLMs autonomously select appropriate mental models when given a toolkit
- **Adaptive scaffolding** — a `freedom` field per step signals how much structure to provide. Capable models get less. Based on Prompting Inversion (Bernstein et al., 2025): constraints that help mid-tier models become handcuffs on advanced ones
- **Executive function in the orchestrator** — not just "decompose goal → track tasks" but: is this approach converging? Should we rethink? When to stop? The orchestrator monitors friction, evaluates progress against intention, and surfaces structured reflection when things aren't working
- **Calibrated uncertainty** — agents express honest uncertainty. Well-calibrated low confidence that proves justified *increases* trust, not decreases it

The design principle: "Provide cognitive tools and create conditions for quality thinking. Never prescribe which tool to use." Like a consulting firm that provides methodology and mental models — the consultant's judgment determines which to apply.

> **Status:** The cognitive architecture is an accepted design (ADR-014) with a 6-phase build plan. Today's engine has role-based system prompts (10 roles), confidence-based trust gating, and retry with feedback injection. The cognitive toolkit, reflection cycle, and adaptive scaffolding are Phase A1 — designed, not yet built.

**The system runs on itself.** Intake classification, routing, trust evaluation, and orchestration are all processes running through the same governed harness. The infrastructure earns trust the same way user processes do.

## What a Real Process Looks Like

This is the actual process that builds Ditto — 7 roles with conditional routing, review-then-retry, and role-specific agents:

```yaml
name: Dev Pipeline
steps:
  - id: pm-triage
    executor: cli-agent
    agent_role: pm
    route_to:                         # PM decides what happens next
      - condition: "brief exists"
        goto: builder-implement       # skip straight to build
      - condition: "research needed"
        goto: researcher-scout
      - condition: "design needed"
        goto: designer-ux
    default_next: researcher-scout

  - id: researcher-scout
    executor: cli-agent
    agent_role: researcher
    route_to:
      - condition: "no designer needed"
        goto: architect-design        # skip design if pure infrastructure
    default_next: designer-ux

  - id: designer-ux                   # runs in parallel with researcher
    executor: cli-agent               # when PM routes to both
    agent_role: designer

  - id: architect-design
    executor: cli-agent
    agent_role: architect
    harness:
      review: [maker-checker]         # another agent checks the architect's work

  - id: builder-implement
    executor: cli-agent
    agent_role: builder
    retry_on_failure:                 # if type-check fails, retry with
      max_retries: 3                  # the error injected as feedback
      feedback_inject: true
    harness:
      review: [spec-testing]

  - id: reviewer-check
    executor: cli-agent
    agent_role: reviewer
    route_to:
      - condition: "FAIL"
        goto: builder-implement       # loop back on review failure

  - id: documenter-wrap
    executor: cli-agent
    agent_role: documenter

trust:
  initial_tier: supervised
  upgrade_path:
    - after: "10 runs at ≥85% approval"
      upgrade_to: spot_checked
```

Key patterns: **conditional routing** (PM triages to different paths), **role assignment** (each step has a specific agent role), **review-then-retry** (reviewer failure loops back to builder), **retry with feedback injection** (type-check failures feed errors back in), **composable review** (maker-checker on architecture, spec-testing on code), **trust per process** (this pipeline earns trust independently).

The cognitive architecture adds a `cognitive_context` block per step — so the researcher gets an exploratory framing, the reviewer gets adversarial, and the builder gets convergent. That's Phase A1.

## Architecture

```
L6  Human        CLI (12 commands) · web dashboard planned
L5  Learning     correction capture · pattern detection · improvement proposals (partial)
L4  Awareness    process dependencies · event propagation (planned)
L3  Harness      memory → execution → review → routing → trust gate → feedback
L2  Agent        Claude · CLI · script · integration adapters · tool use · memory
L1  Process      YAML definitions · parallel groups · conditional routing · human steps
```

**Engine:** SQLite + Drizzle ORM. WAL mode. Zero-setup.

**Harness pipeline:** 6 composable handlers. Every step — including external API calls — traverses the full pipeline.

**System agents:** 4 running through the harness: intake-classifier, router (LLM-based), orchestrator (goal-directed decomposition), trust-evaluator.

**Integrations:** Multi-protocol (CLI working, MCP and REST in progress). YAML registry per service. Credential scrubbing. Retry with backoff.

## Who It's For

Ditto serves people who own outcomes — not technology. They know what "good" looks like but aren't developers, prompt engineers, or workflow designers.

Every agent tool today asks users to think like technologists: write prompts, draw diagrams, configure triggers. Ditto's goal is consultative process setup — describe your work the way you'd explain it to a smart new hire, and the system builds the structure around your answers.

**30 concrete use cases** across trades, ecommerce, finance, HR, professional services, and team operations: [docs/use-cases.yaml](docs/use-cases.yaml).

## Current State

| Metric | Value |
|--------|-------|
| Build phases complete | 6 |
| Tests | 82 |
| Processes | 11 |
| Templates | 3 (invoice follow-up, content review, incident response) |
| System agents | 4 |

**Working:** process engine, harness pipeline, trust earning (4 tiers), human steps with suspend/resume, goal-directed orchestrator, auto-classification capture, integration registry, two-scope memory with salience scoring, implicit feedback capture, conditional routing, parallel execution, retry with feedback injection.

**In progress:** MCP + agent tool use, credential management, cognitive toolkit (ADR-014 Phase A1).

**Not yet built:** web dashboard, conversational process setup, mobile experience, full learning pipeline, process discovery from org data, adaptive scaffolding, orchestrator reflection cycle.

See [state](docs/state.md) for details and [roadmap](docs/roadmap.md) for the full map through Phase 13.

## Key Decisions

| Decision | ADR | Provenance |
|----------|-----|------------|
| SQLite + Drizzle ORM | [001](docs/adrs/001-sqlite.md) | antfarm, better-sqlite3 |
| Two-scope memory | [003](docs/adrs/003-memory-architecture.md) | Mem0, Letta, memU |
| Multi-protocol integrations | [005](docs/adrs/005-integration-architecture.md) | Google Workspace CLI, Nango |
| Trust earning | [007](docs/adrs/007-trust-earning.md) | Discourse TL3, eBay, ISO 2859 |
| Cognitive architecture | [014](docs/adrs/014-agent-cognitive-architecture.md) | MeMo, MAP, Reflexion, Prompting Inversion |

Every pattern traces to a source project or is marked as original. [Full architecture spec](docs/architecture.md).

## For Agent Developers

Ditto isn't a replacement for CrewAI, LangGraph, or AutoGen. It's the governed harness that wraps your agents:

- **Progressive trust** — supervised → autonomous, earned through track record
- **Implicit learning** — corrections become permanent without feedback forms
- **Cognitive posture** — right thinking approach per task, adaptive scaffolding
- **Durable process** — defined once, refined through use
- **Composable review** — maker-checker, adversarial, spec-testing

[Agent Integration Guide](docs/agent-integration-guide.md) — 8 patterns your agents can adopt today. Designed for machine reading.

## Learn More

- [Vision](docs/vision.md) — why this exists
- [Personas](docs/personas.md) — who we're building for
- [Technical Overview](docs/TECHNICAL.md) — engines, layers, composition
- [Architecture](docs/architecture.md) — full spec with provenance
- [Roadmap](docs/roadmap.md) — what's built, what's next

## License

AGPL-3.0
