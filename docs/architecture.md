# Agent OS — Architecture Specification

**Version:** 0.1.0
**Date:** 2026-03-18
**Status:** Draft — synthesised from discovery session

---

## Vision

Working with agents should feel like working with the most reliable, self-reflective, learning-oriented teammates you've ever had. The interaction mirrors how great teams work: problems and hunches evolve into discrete work, and the team helps navigate this naturally.

Agent OS is the universal platform for non-technical people to define, monitor, review, and improve agent-operated processes — across any business domain.

---

## Core Thesis

### The Chat Interface Is the Wrong Metaphor for Business Processes

Chat is a conversation metaphor. Business processes are a factory metaphor. A conversation is freeform, ephemeral, exploratory. A process is structured, repeatable, measurable. Every agent platform today forces processes into chat.

Agent OS has **two modes that coexist:**

| Mode | Good for | Metaphor | Interface |
|------|----------|----------|-----------|
| **Explore** | Discovery, refinement, debugging, strategy | Conversation with a smart colleague | Chat, canvas, whiteboard |
| **Operate** | Execution, monitoring, review, improvement | Factory floor with dashboards | Structured views, queues, metrics |

The magic is in the **transition**: a conversation *crystallises* into a process definition. The platform is the consultant.

### Process Is the Primitive

The atomic unit isn't a task, an agent, or a workflow. It's a **process**.

A process is: inputs → transformation → outputs, with known sources and known destinations. An agent is just the thing that executes a process. The platform's job is:

1. **Help humans articulate processes** they can't yet describe precisely
2. **Match agents to processes** — not the other way around
3. **Create a harness** where agents check each other and humans govern the whole thing

### Not Everything Should Be an AI Agent

The platform recommends the right tool for each process step:

| Step type | Best served by | Example |
|-----------|---------------|---------|
| Pattern matching, extraction | AI agent | Extract invoice data from email |
| Deterministic logic | Script / rules engine | Match invoice amount to PO amount |
| Data transformation | Code / ETL | Format data for Xero API |
| Judgment, nuance, creativity | AI agent | Draft exception report with context |
| Final approval, relationships | Human | Approve payment, call supplier |

### Industry Standards Are the Base Knowledge

Frameworks like APQC (12,000+ standard business processes), ITIL, COBIT, and ISO 9001 have already mapped what businesses do. The platform knows these the way an LLM knows language. Users never see "APQC 8.3.1" — they see: "This sounds like invoice reconciliation. Let me walk you through how YOUR version works."

### Self-Improvement Is a First-Class Capability

Every agent team has a meta-process: scan for improvements, propose changes with evidence, route to human for approval. The platform doesn't just run processes — it evolves them. The human stays in control because improvements are always proposed, never applied silently.

### Agent OS Is a Harness Creator

Agent OS is not an agent framework. It is a **harness creator**.

Agents are commodities — Claude, GPT, scripts, APIs, whatever comes next. What Agent OS creates is the **harness** within which agents operate. The harness has two dimensions:

1. **Evolving** — it learns from feedback, corrections, and trust data. The harness today is different from the harness next month. Every human edit, every approval, every rejection feeds back into a tighter, smarter harness.
2. **Orchestrating** — it coordinates multiple agents, determines who checks whom, what runs in parallel, when to pause for humans, and how trust is earned.

The **process** is not a workflow — it is a **governance declaration**. It declares: what inputs are acceptable, what value looks like, what quality gates apply, what trust level governs execution, and what outputs matter. The process is the governor of inputs, value, and outputs.

Agents are pluggable. Processes are durable. The harness is the product.

### Composition Over Invention

Agent OS composes proven open-source projects rather than building from scratch. The first principle — for the platform and for every agent within it — is: **"what can we build FROM?"** not **"what can we build?"**

Every significant component starts with a research step: scout the gold standard, evaluate what exists, adopt or adapt the best available, and only write custom code to fill genuine gaps. The unique value Agent OS creates is in the harness, trust, governance, and learning layers — not in reinventing orchestration, storage, or CLI frameworks that already exist.

---

## Architecture: Six Layers

```
┌─────────────────────────────────────────────────┐
│  6. HUMAN LAYER                                  │
│  Review queues, dashboards, trust controls,      │
│  conversational setup, process builder           │
├─────────────────────────────────────────────────┤
│  5. LEARNING LAYER                               │
│  Feedback loops, correction patterns,            │
│  performance decay detection, improvement        │
│  suggestions                                     │
├─────────────────────────────────────────────────┤
│  4. AWARENESS LAYER                              │
│  Process dependency graph, event propagation,    │
│  shared organisational context                   │
├─────────────────────────────────────────────────┤
│  3. HARNESS LAYER                                │
│  Review patterns (maker-checker, adversarial,    │
│  spec-testing, ensemble), trust levels,          │
│  escalation rules                                │
├─────────────────────────────────────────────────┤
│  2. AGENT LAYER                                  │
│  Capabilities, assignments, adapters,            │
│  heartbeat execution, session management         │
├─────────────────────────────────────────────────┤
│  1. PROCESS LAYER                                │
│  Industry standard templates, org variations,    │
│  input/output definitions, quality criteria,     │
│  step decomposition                              │
└─────────────────────────────────────────────────┘
```

### Layer 1: Process Layer (The Foundation)

The process definition is the atomic unit:

```
Process: [Name]
├── Based on: [Industry standard reference, if applicable]
├── Inputs:
│   ├── Source: [where data comes from]
│   └── Trigger: [what starts the process — schedule, event, manual]
├── Steps:
│   ├── 1. [Action] → [Executor: AI agent | Script | Rules | Human]
│   ├── 2. [Action] → [Executor]
│   └── N. [Action] → [Executor]
├── Outputs:
│   ├── [What] → [Destination: human review | another process | system]
├── Quality Criteria:
│   ├── [Measurable standard]
│   └── [Measurable standard]
├── Feedback Loop:
│   ├── [What's tracked: corrections, accuracy, speed, outcomes]
│   ├── [How it's measured]
│   └── [Alert threshold]
└── Trust Level: [Supervised | Spot-checked | Autonomous | Critical]
```

**Key properties:**
- Process definitions persist independent of agents — swap the agent, the process stays
- The AI understands processes semantically — it can suggest missing steps, flag risks, propose improvements
- Industry standard templates provide starting points — users customise from known-good patterns

### Layer 2: Agent Layer (The Workforce)

**Heartbeat execution model** (borrowed from Paperclip): Agents wake, execute, sleep. Not continuous. Cost-efficient, clean state boundaries.

**Adapter pattern**: Any runtime plugs in — Claude, GPT, scripts, APIs, rules engines. Three core methods: `invoke()`, `status()`, `cancel()`.

**Org structure**: Agents have roles, reporting lines, permissions. They serve processes — the human's mental model is "my invoice process" not "Agent #7."

**Session persistence**: Resumable sessions across heartbeats for context continuity.

**Budget controls**: Per-agent, per-process cost tracking with soft alerts (80%) and hard stops (100%).

### Layer 3: Harness Layer (Quality Assurance)

Four review patterns, assigned per process based on criticality:

| Pattern | How it works | Use when |
|---------|-------------|----------|
| **Maker-Checker** | Agent A produces, Agent B reviews against spec | Standard processes |
| **Adversarial Review** | Agent B prompted specifically to find flaws | Important outputs |
| **Specification Testing** | Validation agent checks output against defined criteria | Established processes |
| **Ensemble Consensus** | Multiple agents produce independently, compare for divergence | Critical / compliance |

**Trust tiers** (configured per process, earned over time):

| Tier | Human involvement | Earns upgrade after |
|------|-------------------|-------------------|
| **Supervised** | Reviews every output | Consistent quality over N runs |
| **Spot-checked** | Reviews ~20% sample | Low correction rate sustained |
| **Autonomous** | Exception-only review | Proven track record, stable inputs |
| **Critical** | Always full review | Never auto-upgrades |

Trust automatically **downgrades** when:
- Error rate exceeds threshold
- Human correction rate spikes
- Downstream process reports issues
- Process inputs change significantly

### Layer 4: Awareness Layer (Cross-Process Intelligence)

**Model: dependency graph with event propagation.**

Every process declares what it consumes (inputs + sources) and what it produces (outputs + destinations). This creates a live graph.

When any process produces output:
1. Output published to the process's output slot
2. Dependent processes notified via event
3. If output changed materially, dependent processes re-evaluate
4. If a downstream process ran with stale input, it flags this to the human

**What this gives you:**
- No central orchestrator — processes are loosely coupled through declared dependencies
- Impact propagation is visible — "if I change X, these 4 processes are affected"
- Bottlenecks surface naturally — "process Y is waiting on process X"
- The human sees a live map of how their business actually flows

### Layer 5: Learning Layer (Self-Healing)

Every process tracks three feedback signals:

**1. Output quality** — Did the output meet quality criteria?
- Measured by: human corrections, downstream rejection rate, metric checks
- Example: "Listing descriptions are edited 60% of the time — mostly tone adjustments"

**2. Process efficiency** — Is the process getting faster/cheaper/more reliable?
- Measured by: execution time, token cost, error rate, human intervention rate

**3. Outcome impact** — Is the process achieving its business purpose?
- Measured by: KPIs defined during process setup

**Feedback capture is implicit, not explicit:**

| Output type | Feedback mechanism |
|-------------|-------------------|
| Text | Human edits tracked as diff → correction patterns extracted |
| Data | Downstream system validates (did it accept? flag errors?) |
| Visual | Human accepts/rejects/modifies → preference patterns extracted |
| Decision | Outcome tracking (was the lead actually hot? was the flag real?) |
| Handoff | Receiving process reports input quality |

**When degradation is detected:**
1. Surface diagnosis to the human
2. Identify pattern (what kind of corrections? when do they cluster?)
3. Propose specific improvement with evidence
4. Human approves/modifies/dismisses
5. If approved, system updates the process
6. Verify the improvement actually helped

**The platform never auto-fixes. It surfaces, diagnoses, and suggests.**

### Cross-Cutting: Governance and Agent Authentication

Governance spans Layers 3 (Harness) and 4 (Awareness). Trust tiers govern individual processes. Governance governs the system as a whole.

**Agent Authentication:**

Every agent operating within Agent OS must have a verified identity. As the platform scales beyond a single user to teams and organisations, we need to know:
- **Who is this agent?** — Identity, owner, organisation
- **What is it allowed to do?** — Scoped permissions per process, per environment
- **How did it get here?** — Provenance (was it registered by an authorised human? by another trusted agent?)

Authentication is how agents enter the harness. Without it, governance has no foundation.

**Governance Function:**

A dedicated agent or team of agents provides cross-cutting governance and compliance assurance:

| Scope | What governance watches | Example |
|-------|----------------------|---------|
| **Individual** | Agent behaviour within its assigned processes | Builder agent stays within its budget and permissions |
| **Team** | Cross-agent interactions, review pattern integrity | Reviewer agent actually challenges builder output (not rubber-stamping) |
| **Organisation** | Policy compliance, data handling, audit completeness | All outputs in regulated processes have full audit trails |

The governance function is itself a process — it runs within Agent OS, subject to its own trust tier (always supervised or critical). It monitors other processes for:
- Agents operating outside their declared permissions
- Trust tiers being circumvented or gamed
- Quality criteria being consistently unmet without escalation
- Compliance requirements (data retention, audit trails, approval chains)

**Key principle:** Governance agents cannot modify processes or override trust tiers. They can only surface findings and recommend actions to humans. The human always decides.

This is an evolving concept that will be refined as Agent OS scales beyond single-user dogfooding to team and organisational use.

### Layer 6: Human Layer (The Interface)

Two faces, one platform:

**Explore Mode** — Conversational, guided. For discovery, setup, refinement. The conversation progressively builds structured output in the Process Builder. By the time you're done talking, you have a complete process definition.

**Operate Mode** — Structured, dashboard. For daily use, monitoring, reviewing, deciding. No conversation needed — just status, actions, and decisions.

---

## Universal UI Primitives

16 composable components that assemble into any view. Domain-agnostic — the same primitives serve marketing, finance, real estate, coding, or any other domain.

### Orient (What's going on?)

| # | Primitive | Purpose |
|---|-----------|---------|
| 1 | **Daily Brief** | Synthesised priorities, risks, reviews needed. Personalised per role. Explains reasoning. |
| 2 | **Process Card** | Visual representation of any process: name, status, health, trust tier, last run, trend. Works at glance (grid) or expanded (detail). |
| 3 | **Activity Feed** | What happened, when, by whom/what. Filterable. The audit trail in human-readable form. |
| 4 | **Performance Sparkline** | Tiny trend line attachable to anything measurable. "Is this getting better or worse?" |

### Review (Is this right?)

| # | Primitive | Purpose |
|---|-----------|---------|
| 5 | **Review Queue** | The primary workspace. All agent outputs waiting for human decision. Any output type, same interaction: review → approve / edit / reject / escalate. Includes "Auto-approve similar" for trust building. |
| 6 | **Output Viewer** | Universal renderer. Text (with diff), data (table with flags), visual (preview + annotation), code (syntax highlighted), action (confirmation log), decision (reasoning trace). |
| 7 | **Feedback Widget** | Embedded in review actions. Edits ARE feedback. Rejections ARE feedback. System captures structurally without forms. "Teach this" button bridges feedback to permanent learning. |

### Define (What needs to happen?)

| # | Primitive | Purpose |
|---|-----------|---------|
| 8 | **Conversation Thread** | Explore-mode interface. Attached to a process (setup/refinement) or freeform (discovery). Progressively builds structured output alongside. Conversation is ephemeral; the process definition it produces is permanent. |
| 9 | **Process Builder** | Structured editor for process definitions. Populated by conversation or edited directly. Universal structure: inputs → steps → outputs → quality → feedback. |

### Delegate (Who does it?)

| # | Primitive | Purpose |
|---|-----------|---------|
| 10 | **Agent Card** | Like Process Card but for agents. Name, role, processes served, status, trust, performance, cost. Can represent AI agent, script, rules engine, or human. |
| 11 | **Trust Control** | Visible, adjustable dial per process. Shows current tier, how earned, what changes if adjusted. Human can always override. System recommends upgrades based on track record. |

### Capture (Here's context)

| # | Primitive | Purpose |
|---|-----------|---------|
| 12 | **Quick Capture** | Always accessible. Text, voice, files, links. Context-aware (knows where you are). Auto-classifies and routes. Distinguishes "new task" vs "just context." |

### Decide (What should change?)

| # | Primitive | Purpose |
|---|-----------|---------|
| 13 | **Improvement Card** | Surfaced by learning layer. What changed, why, evidence, proposed fix, predicted impact. Always a human decision: apply / modify / dismiss / discuss. |
| 14 | **Process Graph** | Live map of process dependencies. Each node is a Process Card. Colour-coded by health. Shows data flow, bottlenecks, impact propagation. How a non-technical person understands their business as a system. |

### Research & Analytics

| # | Primitive | Purpose |
|---|-----------|---------|
| 15 | **Data View** | Tables, charts, comparisons, trend lines. Any agent producing structured data renders through this. Domain-agnostic quantitative display. |
| 16 | **Evidence Trail** | Sources cited, confidence per claim, links to original material. Attached to any research or analytical output. Drill-through to "where did this come from?" |

### View Compositions

| View | Primitives | Who |
|------|-----------|-----|
| **Home** | Daily Brief + Review Queue (top 5) + Quick Capture | Everyone, every morning |
| **Review** | Review Queue (full) + Output Viewer + Feedback Widget | Anyone reviewing output |
| **Processes** | Process Cards (grid/list) + Process Graph (toggle) | Process owners, managers |
| **Process Detail** | Process Card (expanded) + Activity Feed + Performance Sparklines + Trust Control | Process owner |
| **Setup** | Conversation Thread + Process Builder (dual pane) | New process creation |
| **Team** | Agent Cards + Performance Sparklines + cost summary | Managers |
| **Improvements** | Improvement Cards + Performance trends | Process owners, analysts |
| **Capture** | Quick Capture (full screen) | Mobile, on-the-go |

---

## Borrowing Strategy

Agent OS composes proven patterns rather than inventing from scratch:

| What we need | Borrow from | Pattern |
|-------------|-------------|---------|
| Heartbeat execution | **Paperclip** | Agents wake, execute, sleep. Budget controls. Atomic task checkout. |
| Adapter pattern | **Paperclip** | Any runtime plugs in via `invoke()`, `status()`, `cancel()`. |
| Org structure + governance | **Paperclip** | Agent hierarchy, approval gates, audit trail. |
| Autonomous implementation loop | **ralph** (snarktank) | Fresh context per iteration, progress tracking, AGENTS.md for patterns. |
| Multi-agent verification | **antfarm** (snarktank) | Sequential steps with verification gates. Role-based agents checking each other. |
| Specialised agent roles | **gstack** (Garry Tan) | Roles like planner, builder, reviewer, QA. Adapt into process-specific agents. |
| Self-improvement cycle | **compound-product** (snarktank) | Analyse performance → identify priority → propose improvement → implement via PR. |
| Task decomposition | **ai-dev-tasks** (snarktank) | PRD → structured tasks → iterative execution with verification. |
| Dev kit / UI | **Proven stacks** | Next.js + shadcn + Postgres + Drizzle (2026 default stack). |

**What IS original:**
- The process-first model (not task-first, not agent-first)
- The human layer (16 universal primitives)
- Progressive trust that's earned, not configured
- Implicit feedback capture (edits ARE feedback)
- The two-mode UX (Explore → crystallises into → Operate)
- Self-healing via learning layer with human governance

---

## Self-Improvement Meta-Process

Baked into the platform, not bolted on. Every agent team runs:

```
Process: Self-Improvement Scan
├── Inputs: Performance metrics, ecosystem changes,
│   new tools/libraries, user correction patterns
├── Steps:
│   1. Review own performance trends
│   2. Scan for better approaches (new models, tools, patterns)
│   3. Analyse correction patterns (what does the human keep fixing?)
│   4. Propose improvements with evidence
│   5. Route proposals to human for approval
├── Outputs: Improvement proposals → Human review queue
├── Frequency: Weekly (configurable)
└── Trust: Always supervised (never self-modify without approval)
```

---

## First Implementation: Coding Agent Team

The dogfood. Applying Agent OS principles to agentic coding orchestration.

### Coding Processes

**Process 1: Feature Implementation**
```
Inputs:   Brief/PRD + codebase context + conventions
Steps:    1. Plan approach                     [AI — Planner]
          2. Human reviews/refines plan        [Human]
          3. Implement code                    [AI — Builder]
          4. Run tests + type-check            [Script]
          5. Self-review against conventions   [AI — Reviewer]
          6. Human reviews code                [Human]
          7. Ship (commit/PR)                  [Script]
Outputs:  Working code → repo
          Architecture decision → process memory
Quality:  Tests pass, types clean, conventions followed, human approved
Feedback: Edit count, review cycles, regressions introduced
Trust:    Start supervised → earn spot-checked per project
```

**Process 2: Code Review (agents checking agents)**
```
Inputs:   Diff/PR + codebase context + conventions + learnings
Steps:    1. Pattern compliance check          [AI — Convention checker]
          2. Bug/logic analysis                [AI — Bug hunter]
          3. Security scan                     [AI — Security reviewer]
          4. Synthesise review                 [AI — Lead reviewer]
          5. Human final review                [Human]
Outputs:  Annotated diff → builder agent or human
Quality:  Signal-to-noise ratio, real issues found
Feedback: Were flagged issues real? Were comments addressed?
Trust:    Critical — always human final review
```

**Process 3: Codebase Self-Improvement**
```
Inputs:   Ecosystem changes, performance metrics, correction patterns
Steps:    1. Scan for relevant improvements    [AI — Scout]
          2. Evaluate applicability            [AI — Evaluator]
          3. Propose with evidence             [AI — Proposer]
          4. Human decides                     [Human]
          5. If approved → Process 1           [Handoff]
Outputs:  Improvement proposals → Review Queue
Quality:  Proposals justified, low-risk, genuinely useful
Feedback: Approval rate, impact of approved changes
Heartbeat: Weekly
Trust:    Always supervised
```

**Process 4: Bug Investigation**
```
Inputs:   Bug report or failing test + logs + codebase
Steps:    1. Reproduce                         [AI — Debugger]
          2. Trace root cause                  [AI — Debugger]
          3. Propose fix with explanation       [AI — Debugger]
          4. Human reviews diagnosis            [Human]
          5. Implement fix → Process 1 step 3+  [Handoff]
Outputs:  Fix → repo, root cause → process memory
Quality:  Bug fixed, no regressions, diagnosis correct
Feedback: Bug recurrence, diagnosis accuracy
Trust:    Start supervised → earn spot-checked for known patterns
```

**Process 5: Project Orchestration (meta-process)**
```
Inputs:   All process states, git activity, briefs, captures, deadlines
Steps:    1. Assess current state across projects  [AI — PM]
          2. Identify ready/blocked/at-risk         [AI — PM]
          3. Recommend priorities with reasoning     [AI — PM]
          4. Surface cross-project dependencies      [AI — PM]
          5. Human reviews and adjusts               [Human]
Outputs:  Daily Brief → dashboard, Priority recommendations
Quality:  Recommendations match actual priorities, nothing missed
Feedback: Did human follow recommendations? What actually happened?
Heartbeat: Daily 6am + on capture
Trust:    Start supervised → earn spot-checked
```

### Process Graph (Coding)

```
                    [Quick Capture]
                         │
                         ▼
              ┌─ [Project Orchestration] ─┐
              │    (daily priorities)      │
              ▼                           ▼
     [Feature Implementation]    [Bug Investigation]
          │         │                    │
          ▼         ▼                    │
     [AI Plans] → [AI Builds] ◄─────────┘
                     │
                     ▼
              [Code Review]
          (agents check agents)
                     │
                     ▼
              [Human Review]
                     │
                     ▼
                  [Ship]
                     │
              ┌──────┴──────┐
              ▼              ▼
     [Feedback Loop]  [Self-Improvement]
```

### Agent Roles (Coding Team)

| Role | Based on | Serves processes |
|------|----------|-----------------|
| **Planner** | gstack `/plan-eng-review` | Process 1 (step 1) |
| **Builder** | ralph autonomous loop | Process 1 (step 3), Process 4 (step 5) |
| **Reviewer** | gstack `/review` + antfarm verifier | Process 2 (all steps) |
| **QA** | gstack `/qa` | Process 1 (step 4), Process 4 (step 1) |
| **Scout** | compound-product analyser | Process 3 (steps 1-3) |
| **PM** | Custom | Process 5 (all steps) |

---

## Technical Architecture

### Headless Engine + Universal Frontend

```
┌─────────────────────────────────────────┐
│  FRONTEND (Next.js — web + mobile)       │
│  16 universal primitives composed into   │
│  views. No domain-specific UI.           │
├─────────────────────────────────────────┤
│  API LAYER (REST + WebSocket)            │
│  Process CRUD, run triggers, feedback,   │
│  real-time status updates                │
├─────────────────────────────────────────┤
│  ENGINE (background service)             │
│  Heartbeat scheduler, agent execution,   │
│  harness orchestration, learning engine  │
├─────────────────────────────────────────┤
│  ADAPTERS                                │
│  Claude API, OpenClaw, scripts, HTTP,    │
│  rules engines                           │
├─────────────────────────────────────────┤
│  DATA (Postgres + file system)           │
│  Processes, runs, outputs, feedback,     │
│  org context, dependency graph           │
└─────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js + React + shadcn/ui + Tailwind | 2026 default, proven, fast |
| API | Next.js API routes (start) → separate service (scale) | Start simple, split later |
| Database | PostgreSQL + Drizzle ORM | Relational, typed, proven |
| Background jobs | Node.js worker / cron (start) → proper queue (scale) | Start simple |
| Agent runtime | Claude Code (primary), scripts, HTTP adapters | Adapter pattern allows any runtime |
| Auth | API keys for agents, session auth for humans | Paperclip pattern |
| Real-time | WebSocket for dashboard updates | Status, progress, alerts |
| Mobile | Responsive web (start) → PWA → native (scale) | Progressive enhancement |

---

## Build Phases

### Phase 1: One Process, End to End (Weeks 1-3)
- Data model: process definitions, runs, outputs, feedback
- One adapter: Claude Code
- Process 1 (Feature Implementation) for one project
- Simplest Review Queue (web page showing outputs)
- Basic feedback capture (approve / edit / reject)
- **Deliverable:** Define a feature, agent implements it, review in dashboard

### Phase 2: Agents Checking Agents (Weeks 3-5)
- Process 2 (Code Review) as harness around Process 1
- Convention checker, bug hunter, security reviewer agents
- Pre-annotated outputs in Review Queue
- Feedback on review quality
- **Deliverable:** Code reaches you pre-reviewed by agents

### Phase 3: The Dashboard (Weeks 4-7)
- Daily Brief (Process 5)
- Full Review Queue with Output Viewer
- Process Cards showing health across projects
- Quick Capture (web + mobile)
- **Deliverable:** Morning dashboard, phone capture, full daily experience

### Phase 4: Self-Improvement (Weeks 6-9)
- Process 3 (Codebase Self-Improvement)
- Weekly scan agent
- Improvement proposals in Review Queue
- Trust data accumulating
- **Deliverable:** System is executing AND evolving

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary primitive | Process (not task, not agent) | Processes are how businesses think about work |
| Build approach | Compose proven stacks, don't invent | Paperclip + ralph + gstack + antfarm patterns |
| UI architecture | 16 universal primitives | Domain-agnostic — same UI for any business |
| Trust model | Progressive, earned per-process | Start conservative, earn autonomy via track record |
| Feedback capture | Implicit (edits ARE feedback) | Humans won't fill out forms |
| Self-healing | Propose, never auto-fix | Human governance preserved |
| First dogfood | Coding agent team | Meta-benefit: builds Agent OS using Agent OS |
| Tech stack | Next.js + Postgres + Claude | Proven, fast, the user knows it |
| Deployment | Headless engine + universal frontend | Web + mobile, separate concerns |

## Open Questions

| Question | Impact | When to resolve |
|----------|--------|----------------|
| Agent OS product name | Branding, repo name | Before public launch |
| Pricing model | Revenue, market positioning | Before beta |
| Multi-tenancy from day one? | Architecture complexity | Phase 1 |
| Process template library — initial scope | Onboarding quality | Phase 3+ |
| System analyst AI (meta-agent for setup) | Onboarding scalability | Phase 3+ |
| OpenClaw integration specifics | Dogfood data sources | Phase 1 |
| Mobile capture — PWA vs native | Development effort | Phase 3 |

---

## References

| Source | What we took |
|--------|-------------|
| [Paperclip](https://github.com/paperclipai/paperclip) | Heartbeat model, adapters, budget controls, org structure, governance |
| [ralph](https://github.com/snarktank/ralph) | Autonomous loop, fresh context per iteration, progress tracking |
| [antfarm](https://github.com/snarktank/antfarm) | Multi-agent sequential verification, role-based checking |
| [gstack](https://github.com/garrytan/gstack) | Specialised agent roles, parallel execution, design-first |
| [compound-product](https://github.com/snarktank/compound-product) | Self-improvement cycle, autonomous analysis → PR |
| [ai-dev-tasks](https://github.com/snarktank/ai-dev-tasks) | PRD → structured tasks → iterative execution |
| Prior thinking (catalyst/temp/Agentic/) | Whitespace analysis, transformation strategy, wedge framework |
