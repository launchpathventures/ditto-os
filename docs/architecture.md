# Agent OS — Architecture Specification

**Version:** 0.1.0
**Date:** 2026-03-18
**Status:** Draft — synthesised from discovery session

---

## Vision

Working with agents should feel like working with the most reliable, self-reflective, learning-oriented teammates you've ever had. The interaction mirrors how great teams work: problems and hunches evolve into discrete work, and the team helps navigate this naturally.

Agent OS is the workspace where non-technical people hand off work to governed, trust-earning processes — and get pulled back in only when their judgment is needed. It orchestrates and creates reliable organisational memory and workflows that run, evolve, and improve.

---

## Core Thesis

### The User's Job Is Handoff, Not Management

The purpose of Agent OS is handoff. The human hands off work to the system and gets pulled back in only when required. Two kinds of work exist:

| Kind | Character | Entry | Example |
|------|-----------|-------|---------|
| **Repetitive** | Predictable, high-volume, trust-earnable | Schedule, event, data arrival | Reconcile accounts, generate quotes, format reports |
| **Reactive** | Unpredictable, variable, judgment-heavy | Human input, external event, insight | Customer calls, new idea, competitive threat, "I just realised..." |

Both need processes behind them. The difference is how they enter the system. The compound effect is that reactive work gradually becomes repetitive as the system learns patterns — ad-hoc tasks the user keeps doing become proposed processes.

Agent OS is NOT an automation platform (Zapier, n8n) and NOT a project management tool (Monday.com, Linear, Notion). It is a **living workspace** where:
- The user enters work naturally (questions, tasks, goals, insights)
- The system routes work to its learned processes
- Processes execute with trust-gated quality assurance
- Human steps pause processes for real-world actions, then resume
- The system demonstrates accumulated memory and learning
- A single input can evolve through multiple processes, spawning new work as it goes

### Conversation Is a Layer, Not a Mode

Conversation is available everywhere — not confined to a setup mode. The user can talk to the system from any context:

| Context | Conversation role | Example |
|---------|------------------|---------|
| **Analyze** | Ask questions about the org, explore data | "Why are bathroom quotes slow?" |
| **Explore** | Define and refine processes | "I need a quoting process for bathroom renos" |
| **Operate** | Give instructions, ask status, capture work | "Follow up with Henderson" / "What's the status?" |

Three **activity contexts** coexist (not hard mode switches):

| Context | Good for | Interface |
|---------|----------|-----------|
| **Analyze** | Understanding how the org actually works — connecting to systems, surfacing patterns, validating reality vs. design | Connected data views, pattern reports, gap alerts |
| **Explore** | Defining and refining processes — guided by evidence from Analyze or from a blank canvas | Conversation + Process Builder (dual pane) |
| **Operate** | Execution, monitoring, review, improvement | Process graph, queues, brief, metrics |

The magic is in the **transitions**: Analyze surfaces what's really happening → Explore crystallises that into process definitions → Operate runs them. And conversation flows across all three.

### Process Is the Internal Primitive

The atomic unit of the system's internal organisation is the **process**. But the user doesn't think in processes — they think in goals, tasks, questions, and insights. Processes are the system's learned skills for handling work, like organs in a body.

A process is: inputs → transformation → outputs, with known sources and known destinations. An agent is just the thing that executes a process. The platform's job is:

1. **Receive work** from the user (goals, tasks, questions, insights, outcomes) and route it to the right process
2. **Help humans discover and articulate processes** they can't yet describe precisely — through Analyze mode (evidence from connected data) and Explore mode (guided conversation), or both together
3. **Match agents to processes** — not the other way around
4. **Create a harness** where agents check each other and humans govern the whole thing
5. **Evolve work** — a single input can spawn research, create projects, generate tasks handled by multiple processes

### Work Items Enter, Processes Execute

All work enters Agent OS as a **work item** — a universal unit with a type, lifecycle, and goal ancestry:

| Type | Lifecycle | Example |
|------|-----------|---------|
| **Question** | Answered → done | "Why are bathroom quotes slow?" |
| **Task** | Executed → done | "Follow up with Henderson" |
| **Goal** | Persistent, tracked, decomposes into tasks | "Quotes under 24 hours" |
| **Insight** | Captured → absorbed into process improvement | "Bathroom labour is always underestimated" |
| **Outcome** | Time-bound goal with deadline | "Pricing analysis by Friday" |

Every work item carries **goal ancestry** — the chain of parent goals that explains WHY this work exists. Agents see the full chain, not just the task description. (Inspired by Paperclip's goal ancestry pattern.)

### The System Runs ON Itself

Agent OS's core orchestration capabilities are not hardcoded infrastructure — they are **meta-processes** with system agents going through the same harness pipeline as user processes. They start supervised. They earn trust. They get corrected. They improve.

Ten system agents drive the framework (see ADR-008 + ADR-010):

| Agent | Purpose | Earns trust in |
|-------|---------|---------------|
| **intake-classifier** | Classifies incoming work items | Classification accuracy |
| **orchestrator** | Decomposes goals into tasks, tracks progress | Decomposition quality |
| **router** | Matches tasks to the right process | Routing accuracy |
| **trust-evaluator** | Calculates trust scores, recommends changes | Evaluation accuracy |
| **brief-synthesizer** | Produces the Daily Brief | Prioritisation quality |
| **improvement-scanner** | Detects patterns, proposes improvements | Suggestion quality |
| **process-analyst** | Helps formalise processes via conversation | Process definition quality |
| **onboarding-guide** | Walks new users through first setup | Onboarding effectiveness |
| **process-discoverer** | Discovers processes from org data | Discovery accuracy |
| **governance-monitor** | Watches for trust gaming, compliance gaps | Detection accuracy |

The system that governs user work is itself governed by the same system. This is what makes Agent OS a living system, not a platform.

### Structure Is the Product

The biggest barrier to AI value is not AI capability — it is the absence of structure around the interaction (Insight-030). Raw chat puts the entire cognitive burden on the user: figure out what to ask, how to frame it, what to do with the output, whether it's good, and what comes next. Most people can't do this well.

Agent OS provides eight things that raw chat doesn't:

1. **Loose structure** — process definitions give shape without rigidity
2. **Guidance** — meta-agents guide how work should be composed and evolve
3. **Standards-based** — industry frameworks (APQC, ITIL) mean the system knows what good looks like
4. **Goal and task orientation** — work items with goal ancestry give direction and track progress
5. **Quality control** — harness review patterns ensure outputs meet defined standards
6. **Informed autonomy** — trust tiers provide the foundation; the attention model calibrates how and when the human gets pulled in
7. **Interconnectedness** — process dependency graph means work connects to other work
8. **Abstraction of complexity** — the human sees processes and outcomes, not AI infrastructure

The raw-chat problem and the oversight problem are two sides of the same coin: the user shouldn't need to be sophisticated to get value on the input side, and the system shouldn't demand constant attention on the execution side. **Structure on input + autonomy on execution = the manager experience.**

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

### The Organisation's Data Already Encodes Its Processes

Every organisation — from a sole trader to a 200-person company — already has a digital footprint that encodes its real processes. Emails show communication patterns and approval chains. Documents show templates and review cycles. Calendars show governance cadences. Financial records show transactional workflows. Messaging channels show where decisions happen and what gets stuck. Service desk tickets show request-to-resolution flows.

Agent OS connects to these readily available data sources and builds a persistent, evolving understanding of how the organisation actually works — the **organizational data model**. This is not a one-time onboarding step. It is an ongoing capability: a mode the user can invoke at any time for Agent OS to analyze, learn, validate, and detect gaps.

The user's role shifts from *author* to *editor*. Instead of describing processes from scratch (which requires process literacy most people don't have), the system shows them what it found and they react — confirm, correct, add context. This produces more accurate process definitions because they're grounded in evidence rather than recall.

Analyze mode feeds everything else:
- Feeds **Explore** — "we found these patterns, let's turn them into processes"
- Feeds **Operate** — "your defined process says 24 hours but reality shows 3-5 days"
- Feeds **self-improvement** — "there are patterns in your data that no process covers yet"

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
│  Living workspace: conversation pervasive,       │
│  unified task surface, process graph as nav,     │
│  daily brief with memory, review + capture       │
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
- Process definitions can originate from three paths: manual definition (conversation), template selection (industry standards), or data-driven discovery (from connected organizational data). All three produce the same process definition structure and enter the harness with the same trust rules.

### Layer 2: Agent Layer (The Workforce)

**Heartbeat execution model** (borrowed from Paperclip): Agents wake, execute, sleep. Not continuous. Cost-efficient, clean state boundaries.

**Adapter pattern**: Any runtime plugs in — Claude, GPT, scripts, APIs, rules engines, integrations. Three core methods: `invoke()`, `status()`, `cancel()`. Six executor types: `ai-agent`, `script`, `rules`, `human`, `handoff`, `integration`. The `integration` executor resolves a service and protocol from the integration registry, executes the external call (CLI, MCP, or REST), and returns structured output — subject to the full harness pipeline like any other executor.

**Agent harness** (the babushka model): Each agent operates within its own persistent operating context — the **agent harness** — which sits between the adapter (runtime) and the process harness (Layer 3). The agent harness is assembled before each invocation and includes:

```
Agent Harness: [Agent Name]
├── Identity: role, capabilities, system prompt, personality
├── Memory:
│   ├── Agent-scoped: cross-cutting knowledge that travels with the agent
│   │   (coding style, tool preferences, domain expertise, learned patterns)
│   └── Process-scoped: injected from the current process assignment
│       (correction patterns, quality criteria, process-specific context)
├── Tools: authorised tools for this agent (MCP servers, CLI commands, REST endpoints — resolved from integration registry)
├── Permissions: what this agent can read, write, execute, approve
├── Budget: remaining allocation, cost-per-invocation tracking
└── Session: resumable state across heartbeats
```

This creates a **nested harness architecture**:

```
┌─────────────────────────────────────────────────────┐
│  PLATFORM HARNESS (Agent OS)                         │
│  Cross-process governance, trust, dependency graph   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  PROCESS HARNESS (Layer 3)                       │ │
│  │  Review patterns, quality gates, escalation      │ │
│  │                                                   │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  AGENT HARNESS (Layer 2)                     │ │ │
│  │  │  Identity, memory, tools, permissions        │ │ │
│  │  │                                               │ │ │
│  │  │  ┌─────────────────────────────────────────┐ │ │ │
│  │  │  │  RUNTIME (Adapter)                       │ │ │ │
│  │  │  │  Claude, GPT, script, rules engine      │ │ │ │
│  │  │  └─────────────────────────────────────────┘ │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Each layer has a distinct responsibility. The platform harness orchestrates across processes. The process harness enforces quality for a specific process. The agent harness assembles the operating context for a specific agent. The runtime executes. This separation means you can swap any layer independently — different agent in the same process, different process for the same agent, different runtime for the same agent harness.

**Agent harness assembly** happens in a single function (inspired by Open SWE's `get_agent()` pattern): resolve agent identity → load agent memory + process memory → determine authorised tools → check budget → inject into adapter → execute. This function is the seam where all context converges before the runtime fires.

**Memory model**: Two scopes, merged at invocation:

| Scope | What it stores | Persists across | Example |
|-------|---------------|----------------|---------|
| **Agent-scoped** | Cross-cutting knowledge that travels with the agent | All process assignments | "This agent prefers explicit error handling over try/catch" |
| **Process-scoped** | Learning specific to a process | All runs of that process | "Invoice descriptions are edited 60% of the time — mostly tone" |

Both stored in the `memory` table with `scope_type` (`agent` or `process`) and `scope_id`. The harness merges relevant memories into the agent's context at invocation time, applying progressive disclosure (most relevant first, within context budget).

**Org structure**: Agents have roles, reporting lines, permissions. They serve processes — the human's mental model is "my invoice process" not "Agent #7."

**Session persistence**: Resumable sessions across heartbeats for context continuity. Execution state is serialised to a snapshot (inspired by Sim Studio's snapshot/resume pattern) so runs can pause and resume across heartbeats.

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

**Attention model** (routing mechanics here; full concept in the Cross-Cutting: Attention Model section below — see ADR-011):

Trust tiers determine oversight **rate** (how often). The attention model determines oversight **form** (how it's presented). Together they shape whether Agent OS feels like a noisy approval queue or a quiet workspace.

| Trust tier | Attention form | Override triggers |
|------------|---------------|-------------------|
| **Supervised** | Item review — every output in Review Queue | None |
| **Spot-checked** | Item review for sampled outputs + digest for the rest | Low confidence → item review regardless of sample |
| **Autonomous** | Digest only — summary in Daily Brief, detail on demand | Low confidence → item review; metric deviation → process alert |
| **Critical** | Item review — every output, always | None |

Two additional mechanisms:
- **Per-output confidence scoring** — the agent self-assesses each output. High-confidence outputs auto-advance. Low-confidence outputs route to human regardless of trust tier. This is a second dimension: trust tiers are process-level/historical; confidence is output-level/per-invocation.
- **Digest review mode** — the Review Queue supports both item review (approve/edit/reject) and digest review (summary of accumulated outputs from autonomous processes, drill-down on demand).

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
- **Work item status tracking** — every work item's lifecycle (intake → routed → in_progress → completed) is tracked in Layer 4, enabling the unified task surface and Daily Brief
- **Goal hierarchy** — goals sit above processes in the dependency graph, showing WHY each process exists (ADR-010)

**Organizational data model (Analyze mode output):** When external data sources are connected (via the integration registry), the Analyze mode builds and maintains a persistent, evolving understanding of how the organisation actually works. This is the second mechanism in Layer 4, fulfilling the "shared organisational context" promise.

Two graphs, two purposes:

| Graph | Scope | Character | Example |
|-------|-------|-----------|---------|
| **Process dependency graph** | How Agent OS processes relate to each other | Operational, reactive, event-driven | "Process A produced output, notify Process B" |
| **Organizational data model** | How the organisation actually works | Analytical, evolving, evidence-based | "Email + Xero show a quoting process averaging 3-5 days" |

The organizational data model is not just a discovery input. It enables:
- **Discovery** — surfacing undiscovered processes from data patterns
- **Validation** — comparing defined processes against actual operational reality
- **Gap detection** — identifying recurring patterns that no process covers
- **Improvement evidence** — grounding improvement proposals in real operational data

It is fed by L2 (integration connectors), held in L4 (awareness), consumed by L5 (learning/improvement), and presented by L6 (Analyze mode interface). See ADR-006.

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

**Reactive-to-repetitive lifecycle (ADR-010):** Beyond improving existing processes, Layer 5 also watches for patterns in ad-hoc work. When the system notices the user creating similar work items repeatedly (e.g., Rob keeps manually entering bathroom reno quotes), it proposes formalising the pattern as a new process. The user confirms, refines, and activates — the ad-hoc work becomes a governed, trust-earning process. This is how the system grows its capabilities from user behaviour.

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

### Cross-Cutting: External Integrations

Integrations span Layers 1 (Process), 2 (Agent), 3 (Harness), and 4 (Awareness). They connect Agent OS processes to external systems — email, communication channels, cloud storage, accounting software, CRMs, and any other service a process needs.

**Two integration purposes:**

| Purpose | When it happens | Example | Declared where |
|---------|----------------|---------|----------------|
| **Agent tool use** | During step execution — agent calls external service as part of reasoning | Agent looks up customer in Salesforce while drafting email | Step-level `tools:` field |
| **Process I/O** | At process boundaries — triggers, syncs, output delivery | New email triggers invoice process; approved invoice posted to Xero | Process-level `source:`, `trigger:`, `destination:` fields |

These are architecturally different. Agent tool use happens inside the agent's reasoning loop. Process I/O happens before the first step or after the last.

**Three integration protocols:**

| Protocol | When to use | Cost (tokens) | Reliability | Auth model |
|----------|-----------|---------------|-------------|------------|
| **CLI** | Mature CLI exists (gws, gh, stripe, aws, kubectl) | Lowest (10-32x cheaper than MCP) | ~100% | OS keyrings, env vars, config files |
| **MCP** | No CLI exists; enterprise security needs (Slack, Notion, Xero, Linear) | Higher (schema injection overhead) | ~72% (server availability) | Scoped OAuth, per-tool permissions |
| **REST API** | No CLI or MCP; inbound webhooks; simple stable endpoints | Medium | High | API keys, OAuth2, bearer tokens |

The right protocol depends on the service, not the purpose. The same service may be accessed via different protocols for different purposes.

**Integration registry** (declaration — per Insight-007):

Each external service has a registry entry declaring its available interfaces:

```
Integration: [Service Name]
├── Interfaces:
│   ├── CLI: [command, auth method]
│   ├── MCP: [server URI, auth method]
│   └── REST: [base URL, auth method]
├── Preferred: [which interface to use by default]
└── Credentials: [how auth is managed — keyring, vault, API key]
```

**Credential management — brokered credentials pattern:**

Agents never see OAuth tokens, API keys, or service account credentials. The harness brokers all external access:
- Credentials stored encrypted, isolated from agent runtime
- Token lifecycle (refresh, rotation, revocation) managed by the integration layer
- Scoped per-process, per-agent — an agent assigned to Process A cannot use Process B's credentials
- Every external call logged to the activity table

**Harness integration — all external calls are first-class harness events:**

Both purposes traverse the harness pipeline:
- Agent tool use: tools authorised at harness assembly time; trust gate can require approval before external calls
- Process I/O: output delivery happens after trust gate approval; input triggers logged as activities

External calls are not invisible side-effects. They are governed, audited, and subject to trust tiers.

**Process definition with integrations:**

```
Process: [Name]
├── Inputs:
│   ├── Source: [gmail/inbox | xero/invoices | manual | git | ...]
│   └── Trigger: [webhook | schedule | event | manual]
├── Steps:
│   ├── 1. [Action] → [Executor] → tools: [google-drive, xero-lookup]
│   └── N. [Action] → [Executor]
├── Outputs:
│   ├── [What] → [Destination: xero/invoices | slack/channel | process | ...]
├── Integrations:
│   ├── [Service]: [preferred protocol]
│   └── ...
```

**Provenance:** Multi-protocol resolution pattern from Google Workspace CLI (ships CLI + MCP + REST). Brokered credentials from Composio. Skills-wrapping-MCP from OpenClaw. Code-first integration functions from Nango. Trust-aware integration access, integration feedback capture, and process-scoped permissions are Original to Agent OS. See ADR-005.

### Cross-Cutting: Attention Model (ADR-011)

The attention model spans Layers 3 (Harness) and 6 (Human). It answers a question trust tiers don't: **in what form** does the human experience process outputs?

Trust tiers determine oversight **rate** — how often. The attention model determines oversight **form** — item review, digest, or alert. Together they shape whether Agent OS feels like a noisy approval queue or a quiet workspace where the human is pulled in only when their judgment adds value.

**Three attention modes:**

| Mode | What the human sees | When it's used |
|------|--------------------|----|
| **Item review** | Individual output in Review Queue. Requires action: approve / edit / reject. | Supervised (all), spot-checked (sampled), any output flagged as uncertain |
| **Digest** | Summary in Daily Brief or process-level report. No action required. | Autonomous (all), spot-checked (non-sampled) |
| **Alert** | Process-level health notification. Surfaces as Improvement Card. | Any tier when quality metrics cross thresholds |

**Per-output confidence scoring:** The agent producing an output includes a categorical confidence signal (`high` / `medium` / `low`) as metadata. Low confidence → escalate to item review regardless of trust tier. This is a second dimension: trust is process-level and historical; confidence is output-level and per-invocation. The agent knows when it's out of its depth and says so — the SAE Level 3 pattern applied to business processes.

**Silence is a feature.** When an autonomous process runs cleanly, the human sees nothing until the next digest. No notification, no queue item. The absence of noise IS the signal that things are working. This is the Management by Exception pattern from management science.

**Provenance:** Content moderation three-band routing (TikTok, YouTube). ISO 2859 switching rules. Management by Exception (active MBE). Hersey-Blanchard Situational Leadership. SAE J3016 Level 3 (system knows when it's out of its depth). Zapier Digest (batch review). PagerDuty Event Intelligence (noise reduction). Per-output confidence routing, digest as explicit attention mode, and silence-as-feature are Original to Agent OS. See ADR-011.

### Layer 6: Human Layer (The Interface)

A living workspace, not a dashboard. The user works IN Agent OS — it's always open, actively working on their behalf, and pulls them in when judgment is needed. Three design principles govern the layer:

**1. Conversation is pervasive.** Available on every view, not just setup. The user can talk from any context — ask questions, give instructions, capture work. The Conversation Thread (Primitive 8) is the universal interaction surface.

**2. The unified task surface.** The user sees one list of things needing their attention — not separate queues for reviews, actions, and goals. Three types of work items surface together:
- **Review tasks** — "check this output" (from harness review patterns)
- **Action tasks** — "do this thing" (from human steps in processes)
- **Goal-driven tasks** — "work toward this" (decomposed by orchestrator agent)

**3. Memory is visible.** The system demonstrates accumulated context on every surface. The Daily Brief feels like a briefing from a chief of staff who knows everything. Processes show their learning history. The system never feels like "new chat." (Insight-028)

Three activity contexts coexist (not hard mode switches):
- **Analyze** — connected data views, pattern reports, evidence-informed discovery
- **Explore** — conversation + process builder, guided process definition
- **Operate** — process graph, review queue, brief, metrics, daily workspace

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
| 5 | **Review Queue** | The primary review surface. Outputs that genuinely need human judgment — supervised outputs, sampled spot-checked outputs, and confidence-flagged outputs. Any output type, same interaction: review → approve / edit / reject / escalate. Includes "Auto-approve similar" for trust building. Autonomous process outputs appear as digest summaries (via Daily Brief or Process Card), not individual queue items (ADR-011). |
| 6 | **Output Viewer** | Universal renderer. Text (with diff), data (table with flags), visual (preview + annotation), code (syntax highlighted), action (confirmation log), decision (reasoning trace). |
| 7 | **Feedback Widget** | Embedded in review actions. Edits ARE feedback. Rejections ARE feedback. System captures structurally without forms. "Teach this" button bridges feedback to permanent learning. |

### Define (What needs to happen?)

| # | Primitive | Purpose |
|---|-----------|---------|
| 8 | **Conversation Thread** | Universal conversation surface. In Explore: dual-pane process building. In Operate: command/query interface for entering work, asking questions, giving instructions. Available on every view. Routes input through intake-classifier → router meta-processes. |
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
| 14 | **Process Graph** | Primary navigation surface. Three layers: goals (top) → processes (middle) → live execution state (bottom). Each process node is a Process Card. Colour-coded by health. Shows data flow, bottlenecks, impact propagation, what's waiting for human input. How a non-technical person sees their business operating as a system. |

### Research & Analytics

| # | Primitive | Purpose |
|---|-----------|---------|
| 15 | **Data View** | Tables, charts, comparisons, trend lines. Any agent producing structured data renders through this. Domain-agnostic quantitative display. |
| 16 | **Evidence Trail** | Sources cited, confidence per claim, links to original material. Attached to any research or analytical output. Drill-through to "where did this come from?" |

### View Compositions

| View | Primitives | Who |
|------|-----------|-----|
| **Home** | Daily Brief + Unified Task Surface (top 5: review + action + goal tasks) + Quick Capture + Conversation Thread | Everyone, every morning |
| **Review** | Unified Task Surface (full) + Output Viewer + Feedback Widget | Anyone reviewing or completing work |
| **Map** | Process Graph (full screen, three layers: goals → processes → live state) — primary navigation | Everyone — the "see my business operating" view |
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
| Agent tool integration | **MCP ecosystem** + **Claude Agent SDK** | MCP servers as tool providers, dynamic tool loading. CLI-first where mature. 24-event hooks for harness interception. |
| Multi-source tool gathering | **Mastra** | 7 tool sources merged at invocation: assigned, memory, workspace, skill, agent, runtime, client. |
| Three-mode routing | **Inngest AgentKit** | Code-based (deterministic) → LLM-based (flexible) → hybrid. Maps to trust progression in routing. |
| Safety-net middleware chain | **Open SWE** | 4-layer ordered middleware: error normalization → message injection → empty-output guard → structural guarantee. |
| Path-based suspend/resume | **Mastra** | Serialize suspended step paths + step results. Resume skips completed steps. Span continuity for tracing. |
| Agent lifecycle hooks | **Inngest AgentKit** | onStart/onResponse/onFinish for memory injection, trust validation, feedback capture. |
| Task guardrails with retry | **CrewAI** | Validators return (pass/fail, feedback) tuple. Configurable max retries. Delegation tracking. |
| CLI parallel aggregation | **GitHub CLI** | Parallel data loading for heterogeneous items. Factory-injected dependencies. Format polymorphism. |
| CLI interactive workflows | **@clack/prompts** + **Linear CLI** | Multi-step group workflows with result propagation. Interactive-with-fallback (accept arg OR prompt if TTY). |
| Process I/O integration | **Nango** (code-first TypeScript) | Syncs + actions, managed auth, git-tracked integration functions. |
| Credential brokering | **Composio** pattern | Agent never sees tokens; platform executes on agent's behalf. |
| Integration registry | **Original** (informed by Nango + Insight-007) | Declaration files mapping services to available protocols. |
| Skills-over-MCP | **OpenClaw** | Instruction layer (process def) over execution layer (protocol). 65% of skills wrap MCP. |
| Attention model — oversight form | **Content moderation** (TikTok/YouTube) + **ISO 2859** + **MBE** | Three-band confidence routing, switching rules, management by exception. Adapted for process trust. |
| Digest review | **Zapier Digest** + **GitHub Copilot** | Batch outputs for periodic review. PR-as-batch-artifact. |

**What IS original:**
- The workspace interaction model — handoff-first, not management-first (ADR-010)
- Work items with goal ancestry routed through trust-governed meta-processes (ADR-010)
- The system runs ON itself — meta-processes go through the same harness as user processes (ADR-010)
- Work evolution — a single input evolves through multiple processes, spawning new work (ADR-010)
- Reactive-to-repetitive lifecycle — system notices ad-hoc patterns and proposes processes (ADR-010)
- The process-first internal model (not task-first, not agent-first)
- The human layer (16 universal primitives + conversation as pervasive layer)
- Progressive trust that's earned, not configured
- Implicit feedback capture (edits ARE feedback)
- Human steps in processes — processes pause for real-world human actions, then resume (ADR-010)
- Memory as UX — the system demonstrates accumulated context, never feels like "new chat" (Insight-028)
- Attention model — trust tiers determine oversight rate, attention model determines oversight form. Per-output confidence + digest review. No surveyed system combines process-level trust with per-output confidence routing (autonomous-oversight-patterns research)
- Structure as the product — the eight things raw chat is missing (Insight-030). Agent OS IS the scaffolding that makes AI useful for non-technical users
- Analyze mode — connecting to readily available org data to build a persistent understanding of how the organisation actually works
- Organizational data model — persistent, evolving org understanding in Layer 4
- Self-healing via learning layer with human governance
- Trust-aware integration access (external calls governed by earned trust tier)
- Integration feedback capture (did the external action produce the right outcome?)
- Process-scoped integration permissions (credentials scoped per-process, per-agent)

---

## Self-Improvement Meta-Process

Baked into the platform, not bolted on. Every agent team runs:

```
Process: Self-Improvement Scan
├── Inputs: Performance metrics, ecosystem changes,
│   new tools/libraries, user correction patterns,
│   connected organizational data (email, calendar, financial, etc.)
├── Steps:
│   1. Review own performance trends
│   2. Scan for better approaches (new models, tools, patterns)
│   3. Analyse correction patterns (what does the human keep fixing?)
│   4. Detect process gaps (recurring patterns in connected data
│      that suggest undiscovered processes)
│   5. Propose improvements with evidence
│   6. Route proposals to human for approval
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
│  DATA (SQLite + file system)             │
│  Processes, runs, outputs, feedback,     │
│  org context, dependency graph           │
└─────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js + React + shadcn/ui + Tailwind | 2026 default, proven, fast |
| API | Next.js API routes (start) → separate service (scale) | Start simple, split later |
| Database | SQLite + Drizzle ORM (dogfood) → PostgreSQL (scale) | Zero-setup for dogfood. See ADR-001. |
| Background jobs | Node.js worker / cron (start) → proper queue (scale) | Start simple |
| Agent runtime | Claude Code (primary), scripts, HTTP adapters | Adapter pattern allows any runtime |
| Auth | API keys for agents, session auth for humans | Paperclip pattern |
| Real-time | WebSocket for dashboard updates | Status, progress, alerts |
| Mobile | Responsive web (start) → PWA → native (scale) | Progressive enhancement |

---

## Build Phases

> **Note:** These original build phases have been refined into a more granular 12-phase roadmap in `docs/roadmap.md`. The roadmap is the current source of truth for build sequencing. The phases below are preserved for historical context.

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
| OpenClaw integration specifics | Dogfood data sources | Partially addressed by ADR-005 (integration architecture). Specific OpenClaw adapter configuration deferred to Phase 6 build. |
| Integration credential platform — build minimal, Nango, or Composio? | Security, infrastructure complexity | Before integration phase |
| Integration registry format — YAML files or database-backed? | Developer experience, consistency with Insight-007 | Integration phase design |
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
| [Sim Studio](https://github.com/simstudioai/sim) | Handler registry pattern, execution snapshot/resume, variable resolver chain |
| [Open SWE](https://github.com/langchain-ai/open-swe) | Agent harness assembly (`get_agent()`), safety-net middleware, deterministic thread IDs, mid-run message injection |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | Handoff template taxonomy (7 types), quality gate pattern (dev↔QA with retries) |
| Deeplake / db9.ai | Agent-native database concepts: branching for safety, hybrid memory model (agent-scoped + process-scoped) |
| "AI Agent OS" practitioner pattern | Folder-structure-as-harness, hiring metaphor for non-technical users, skills as progressive disclosure |
| [OpenClaw](https://openclaw.ai/) | Skills-as-progressive-disclosure, skills wrapping MCP servers, channel adapters |
| [Google Workspace CLI](https://github.com/googleworkspace/cli) | Multi-protocol integration (CLI + MCP + REST for same service), agent skills pattern |
| [Nango](https://github.com/NangoHQ/nango) | Code-first TypeScript integration functions, managed OAuth, syncs + actions model |
| [Composio](https://github.com/ComposioHQ/composio) | Brokered credentials pattern, tool routing, MCP aggregation |
| [Xero MCP Server](https://github.com/XeroAPI/xero-mcp-server) | First-party MCP server for accounting software |
| Prior thinking (catalyst/temp/Agentic/) | Whitespace analysis, transformation strategy, wedge framework |
