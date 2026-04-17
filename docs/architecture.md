# Ditto — Architecture Specification

**Version:** 0.1.0
**Date:** 2026-03-18
**Status:** Draft — synthesised from discovery session

---

## Vision

Working with agents should feel like working with the most reliable, self-reflective, learning-oriented teammates you've ever had. The interaction mirrors how great teams work: problems and hunches evolve into discrete work, and the team helps navigate this naturally.

Ditto is the workspace where non-technical people hand off work to governed, trust-earning processes — and get pulled back in only when their judgment is needed. It orchestrates and creates reliable organisational memory and workflows that run, evolve, and improve.

---

## Core Thesis

### The User's Job Is Handoff, Not Management

The purpose of Ditto is handoff. The human hands off work to the system and gets pulled back in only when required. Two kinds of work exist:

| Kind | Character | Entry | Example |
|------|-----------|-------|---------|
| **Repetitive** | Predictable, high-volume, trust-earnable | Schedule, event, data arrival | Reconcile accounts, generate quotes, format reports |
| **Reactive** | Unpredictable, variable, judgment-heavy | Human input, external event, insight | Customer calls, new idea, competitive threat, "I just realised..." |

Both need processes behind them. The difference is how they enter the system. The compound effect is that reactive work gradually becomes repetitive as the system learns patterns — ad-hoc tasks the user keeps doing become proposed processes.

Ditto is NOT an automation platform (Zapier, n8n) and NOT a project management tool (Monday.com, Linear, Notion). It is a **living workspace** where:
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
| **Explore** | Defining and refining processes — guided by evidence from Analyze or from a blank canvas | Conversation in centre column + Process Builder in right panel (Brief 046) |
| **Operate** | Execution, monitoring, review, improvement | Process graph, queues, brief, metrics |

The magic is in the **transitions**: Analyze surfaces what's really happening → Explore crystallises that into process definitions → Operate runs them. And conversation flows across all three.

### Process Is the Internal Primitive

The atomic unit of the system's internal organisation is the **process**. But the user doesn't think in processes — they think in goals, tasks, questions, and insights. The user is an **outcome owner** — responsible for results, possibly with a sense of the process, possibly just knowing what "good" looks like. Processes are the system's learned skills for handling work, like organs in a body. The system helps outcome owners define, refine, and improve processes over time — through conversation, templates, evidence from connected data, and accumulated corrections.

A process is: inputs → transformation → outputs, with known sources and known destinations. An agent is just the thing that executes a process. **Processes declare structure. Agents bring judgment. The harness evaluates outcomes.** A process definition governs what happens and in what order. The agent within each step has freedom to exercise judgment about how. The harness evaluates whether the output meets quality criteria. This ensures consistency without rigidity — the same process, the same governance, but agents can adapt to genuine context shifts. Processes are durable: defined once, refined through use, executed consistently. AI does not reinvent its approach each time.

The platform's job is:

1. **Receive work** from the user (goals, tasks, questions, insights, outcomes) and route it to the right process
2. **Help outcome owners discover and articulate processes** they can't yet describe precisely — through an intelligently guided hybrid of conversation and structured process building, with meta-agents reasoning alongside the user, drawing on industry standards (APQC), templates, and evidence from connected data
3. **Match agents to processes** — not the other way around
4. **Create a harness** where agents check each other and humans govern the whole thing
5. **Evolve work** — a single input can spawn research, create projects, generate tasks handled by multiple processes

**Processes declare structure. Agents bring judgment. The harness evaluates outcomes.** A process definition governs what happens and in what order. The agent within each step has freedom to exercise judgment about how — choosing reasoning approaches, applying mental models, sensing when something is off. The harness evaluates whether the output meets quality criteria — it doesn't prescribe how the agent got there. This ensures consistency (same process, same governance) without rigidity (agents can adapt to context). See ADR-014 for the full cognitive architecture and judgment hierarchy.

### Work Items Enter, Processes Execute

All work enters Ditto as a **work item** — a universal unit with a type, lifecycle, and goal ancestry:

| Type | Lifecycle | Example |
|------|-----------|---------|
| **Question** | Answered → done | "Why are bathroom quotes slow?" |
| **Task** | Executed → done | "Follow up with Henderson" |
| **Goal** | Persistent, tracked, decomposes into tasks | "Quotes under 24 hours" |
| **Insight** | Captured → absorbed into process improvement | "Bathroom labour is always underestimated" |
| **Outcome** | Time-bound goal with deadline | "Pricing analysis by Friday" |

Every work item carries **goal ancestry** — the chain of parent goals that explains WHY this work exists. Agents see the full chain, not just the task description. (Inspired by Paperclip's goal ancestry pattern.)

### The System Runs ON Itself

Ditto's core orchestration capabilities are not hardcoded infrastructure — they are **meta-processes** with system agents going through the same harness pipeline as user processes. Initial trust tiers are context-dependent (Insight-160): processes communicating directly to the user or operating as Alex's professional work start autonomous (quality-gate as safety net); processes acting in the user's name start supervised. All earn trust, get corrected, and improve.

Fourteen system agents drive the framework (see ADR-008 + ADR-010 + Brief 079 + Brief 104):

| Agent | Purpose | Earns trust in |
|-------|---------|---------------|
| **intake-classifier** | Classifies incoming work items | Classification accuracy |
| **orchestrator** | Decomposes goals into tasks, tracks progress | Decomposition quality |
| **router** | Matches tasks to the right process | Routing accuracy |
| **trust-evaluator** | Calculates trust scores, recommends changes | Evaluation accuracy |
| **knowledge-extractor** | Extracts structured solution knowledge from corrections | Extraction quality |
| **brief-synthesizer** | Produces the Daily Brief | Prioritisation quality |
| **improvement-scanner** | Detects patterns, proposes improvements to existing processes (inward) | Suggestion quality |
| **coverage-agent** | Proactively identifies what the user should have in place but doesn't (outward). Reasons from user model + Process Model Library + industry patterns + connected data. Feeds Self with max 1-2 suggestions per cycle. (Insight-142) | Suggestion acceptance rate |
| **process-analyst** | Helps formalise processes via conversation | Process definition quality |
| **onboarding-guide** | Walks new users through first setup | Onboarding effectiveness |
| **process-discoverer** | Discovers processes from org data (inward hunting) | Discovery accuracy |
| **governance-monitor** | Watches for trust gaming, compliance gaps | Detection accuracy |
| **network-agent** | External relationship management — outreach, introductions, and nurture on behalf of users. Operates through personas (Alex/Mira). Mode-shifted posture: Selling (BDR) vs Connecting (researcher/advisor). (Brief 079) | Outreach quality, introduction match quality, reply rate |
| **process-validator** | Unified quality validator for the Process Model Library. Four checks: edge-case testing, compliance scanning, efficiency analysis, duplicate detection. Runs in the library-curation pipeline. (Brief 104) | Validation accuracy, false positive rate |

The system that governs user work is itself governed by the same system. This is what makes Ditto a living system, not a platform.

### Three-Layer Persona Architecture (Insight-153)

The system presents itself through three distinct persona layers. Each layer has a different relationship to the user, a different scope of authority, and a different trust posture. This is how Ditto scales from "one AI advisor" to "an AI workforce" without collapsing into a single undifferentiated chatbot.

| Layer | Who they are | What they do | Trust posture |
|-------|-------------|-------------|---------------|
| **Ditto** | The firm / chief of staff. The platform persona. | Coordinates work across user's processes, presents briefings, owns the workspace experience. | Quality-gate-safety-net autonomous (Insight-160). |
| **Alex / Mira** | Senior advisors at Ditto. Network connectors. | Run the user's network — introductions, nurture, relationship intelligence. Never sell on behalf of the user. | Critical on outbound introductions; autonomous on internal reasoning. |
| **User Agent** | The user's branded agent. One per user. | Direct selling, marketing, outreach in the user's voice. Two gears: Gear 1 (digital acquisition — content, social, SEO) and Gear 2 (direct outreach — sales calls, DMs, email). | Supervised at first, earns spot-checked/autonomous per process. |

**Operator field on processes:** Every process declares which persona layer runs it via the `operator` field on `ProcessDefinition`. The cognitive mode (ADR-013) resolves from operator + processId + persona guard — `selling` mode is blocked for `alex-or-mira` operators regardless of process. Alex/Mira never sell; they only connect. The User Agent sells on the user's behalf. This separation prevents Alex's reputation from being collateral in any user's commercial activity, and it prevents a single persona from having to hold contradictory allegiances.

**Scaling property:** Because Alex/Mira are shared across users (one network persona) while each User Agent is user-scoped (one per user), the network layer compounds (more users → richer relationship graph for Alex) without creating conflicts of interest (each user's agent has a single boss). See Insight-153 for the full rationale, cognitive mode sections (`cognitive/modes/{connecting,nurturing,selling,chief-of-staff}.md`) for per-mode calibration, and ADR-008 section 2 for the operator routing integration.

### The Network Is the Front Door (ADR-025, Insight-151)

The Ditto journey doesn't start with installing software. It starts with a conversation — someone gets an email from Alex, visits the website, or gets introduced. Three layers of relationship:

| Layer | Who they are | Infrastructure needed | Where they live |
|-------|-------------|----------------------|----------------|
| **Network participant** | Someone Alex knows. Got an email or introduction. | None | Centralized Ditto Network only |
| **Active user** | Working with Alex on sales/connections via email. | None | Centralized Ditto Network only |
| **Workspace user** | Full Ditto product: chief of staff, processes, trust tiers. | Workspace (managed cloud or self-hosted) | Workspace + connected to Network |

The Ditto Network is a centralized, always-on service that serves all three layers. It owns the shared relationship graph, Alex and Mira's email inboxes, the nurture scheduler, and the web front door. Workspaces are per-user (Track A or Track B per ADR-018) and connect to the Network via API (ADR-005 integration pattern). See ADR-025 for the full deployment architecture.

### Structure Is the Product

The biggest barrier to AI value is not AI capability — it is the absence of structure around the interaction (Insight-030). Raw chat puts the entire cognitive burden on the user: figure out what to ask, how to frame it, what to do with the output, whether it's good, and what comes next. Most people can't do this well.

Ditto provides eight things that raw chat doesn't:

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

Ditto connects to these readily available data sources and builds a persistent, evolving understanding of how the organisation actually works — the **organizational data model**. This is not a one-time onboarding step. It is an ongoing capability: a mode the user can invoke at any time for Ditto to analyze, learn, validate, and detect gaps.

The user's role shifts from *author* to *editor*. Instead of describing processes from scratch (which requires process literacy most people don't have), the system shows them what it found and they react — confirm, correct, add context. This produces more accurate process definitions because they're grounded in evidence rather than recall.

Analyze mode feeds everything else:
- Feeds **Explore** — "we found these patterns, let's turn them into processes"
- Feeds **Operate** — "your defined process says 24 hours but reality shows 3-5 days"
- Feeds **self-improvement** — "there are patterns in your data that no process covers yet"

### Self-Improvement Is a First-Class Capability

Every agent team has a meta-process: scan for improvements, propose changes with evidence, route to human for approval. The platform doesn't just run processes — it evolves them. The human stays in control because improvements are always proposed, never applied silently.

### Ditto Is a Harness Creator

Ditto is not an agent framework. It is a **harness creator**.

Agents are commodities — Claude, GPT, scripts, APIs, whatever comes next. What Ditto creates is the **harness** within which agents operate. The harness has two dimensions:

1. **Evolving** — it learns from feedback, corrections, and trust data. The harness today is different from the harness next month. Every human edit, every approval, every rejection feeds back into a tighter, smarter harness.
2. **Orchestrating** — it coordinates multiple agents, determines who checks whom, what runs in parallel, when to pause for humans, and how trust is earned.

The **process** is not a workflow — it is a **governance declaration**. It declares: what inputs are acceptable, what value looks like, what quality gates apply, what trust level governs execution, and what outputs matter. The process is the governor of inputs, value, and outputs.

Agents are pluggable. Processes are durable. The harness is the product.

### Composition Over Invention

Ditto composes proven open-source projects rather than building from scratch. The first principle — for the platform and for every agent within it — is: **"what can we build FROM?"** not **"what can we build?"**

Every significant component starts with a research step: scout the gold standard, evaluate what exists, adopt or adapt the best available, and only write custom code to fill genuine gaps. The unique value Ditto creates is in the harness, trust, governance, and learning layers — not in reinventing orchestration, storage, or CLI frameworks that already exist.

---

## Architecture: Six Layers

```
┌─────────────────────────────────────────────────┐
│  6. HUMAN LAYER                                  │
│  Conversation-first workspace: Self as primary   │
│  interface, composition intents, ContentBlock     │
│  rendering, artifact mode, memory visible        │
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
│   ├── 1. [Action] → [Executor: AI agent | CLI agent | Script | Rules | Human]
│   │   ├── route_to: [condition → goto step] (conditional routing)
│   │   ├── default_next: [fallback step if no condition matches]
│   │   └── retry_on_failure: [max_retries, feedback_inject]
│   ├── 2. [Action] → [Executor]
│   └── N. [Action] → [Executor]
├── Outputs:                                    (ADR-009 v2)
│   ├── [name]:
│   │   ├── type: [data | view | document | integration | external]
│   │   ├── schema: [shape declaration]
│   │   ├── lifecycle: [static | dynamic]
│   │   └── destination: [work-surface | process:<name> | integration:<service> | external]
├── Quality Criteria:
│   ├── [Measurable standard]
│   └── [Measurable standard]
├── Feedback Loop:
│   ├── [What's tracked: corrections, accuracy, speed, outcomes]
│   ├── [How it's measured]
│   └── [Alert threshold]
└── Trust Level: [Supervised | Spot-checked | Autonomous | Critical]
```

**Conditional routing** (Insight-039, Brief 016b): Steps are not fixed sequences. Each step can declare `route_to` conditions that evaluate against output — the first matching condition determines the next step. If no condition matches, `default_next` provides a deterministic fallback. Steps not on the chosen route are marked `skipped` (treated as resolved for dependency purposes). Routing is currently Mode 1 (code-based substring matching); LLM-based routing (Mode 2) is deferred. Provenance: Inngest AgentKit three-mode routing, LangGraph conditional edges.

**Retry middleware** (Brief 016b): Steps can declare `retry_on_failure` with a max retry count and optional feedback injection. On failure, the step is re-queued with error output as context. After max retries, confidence is set to `low` — the trust gate pauses for human review rather than hard-failing the run. Provenance: Aider lint-fix loop, Open SWE error recovery middleware.

**Key properties:**
- Process definitions persist independent of agents — swap the agent, the process stays
- The AI understands processes semantically — it can suggest missing steps, flag risks, propose improvements
- Industry standard templates provide starting points — users customise from known-good patterns
- Process definitions can originate from three paths: manual definition (conversation), template selection (industry standards), or data-driven discovery (from connected organizational data). All three produce the same process definition structure and enter the harness with the same trust rules.

### Layer 2: Agent Layer (The Workforce)

**Heartbeat execution model** (borrowed from Paperclip): Agents wake, execute, sleep. Not continuous. Cost-efficient, clean state boundaries.

**Pulse — continuous operation loop** (Brief 098a): The pulse is Alex's internal clock. Registered as a cron job (configurable via `PULSE_INTERVAL_MS`, default 5 min). On each tick: (1) scan `delayed_runs` table for due runs → start them via `startProcessRun()`, (2) scan completed `processRuns` where `chainsProcessed = false` → execute chain definitions. Idempotent: DB-backed state, not in-memory timers. Overlap guard prevents concurrent ticks. Provenance: OpenClaw heartbeat pattern (Insight-141), adapted from LLM-driven to code-driven for cost.

**Process chaining** (Brief 098a): Process definitions include optional `chain: ChainDefinition[]` — what happens after a process completes. `ChainDefinition` is a core engine primitive (`packages/core/`): trigger type, target process, input mappings with `{variable}` placeholders. Three trigger types: `delay` (creates a `delayed_runs` record, executed by pulse after N days), `schedule` (creates a `schedules` record, picked up by existing scheduler), `event` (logged as registered, activated by inbound email classification in 098b). Variable substitution (`{personId}` → actual process output value) is product-layer logic in `chain-executor.ts`. Chain-spawned runs inherit the more restrictive trust tier between parent and target (AC9).

**Adapter pattern** (Insight-041): Any runtime plugs in — the harness is AI-provider-agnostic. Users bring their own execution substrate (Claude CLI, Codex CLI, Anthropic API, OpenAI API, local models via ollama). All adapters implement the same `StepExecutionResult` interface: `outputs`, `tokensUsed`, `costCents`, `confidence` (categorical: high/medium/low per ADR-011), `model` (actual model that executed this step — Brief 033), `logs`. Three core methods: `invoke()`, `status()`, `cancel()`. Seven executor types: `ai-agent`, `cli-agent`, `script`, `rules`, `human`, `handoff`, `integration`.

**Model routing** (Brief 033): Process steps can declare `config.model_hint` (`fast`, `capable`, `default`) on `ai-agent` steps. `resolveModel(hint)` maps hints to provider-specific models (e.g., `fast` → Haiku for Anthropic, gpt-4o-mini for OpenAI). Steps without hints use the deployment default. Model is recorded on every step run for learning. `generateModelRecommendations()` analyzes accumulated data (20+ runs) to surface advisory cost/quality trade-offs — system recommends, human decides. Provenance: Vercel AI SDK alias pattern, RouteLLM economics.

Current adapters:
- **Claude API adapter** (`ai-agent`, primary): Calls LLM via `createCompletion()`. Per-token cost. Tool use loop with codebase tools — three subsets: `readOnlyTools` (read_file, search_files, list_files), `readWriteTools` (+ write_file), and `execTools` (+ run_command — Brief 051). Step config declares which subset via `config.tools: "read-only" | "read-write" | "read-write-exec"`. The `run_command` tool executes allowlisted shell commands via `execFile` (no shell interpretation): pnpm (run/test/exec/install --frozen-lockfile), npm (run/test), node (file paths only, no -e/--eval), git (read-only: status/log/diff/show/branch/ls-files/rev-parse). npx is entirely blocked. Executable+subcommand allowlist enforced. Output scrubbed for secret file references. 120s timeout, 10MB buffer cap. Builder and Reviewer roles use `read-write-exec` so they can verify code (type-check, tests) and include evidence. Loads role contracts from `.claude/commands/dev-*.md` via `step.config.role_contract` (fallback to hardcoded prompts). Parses `CONFIDENCE: high|medium|low` from response text. All 7 dev roles execute via this adapter (Brief 031). Provenance: Claude Code tool patterns, OpenClaw SOUL.md/skills, CI runner sandbox patterns (Brief 051).
- **CLI adapter** (`cli-agent`, optional fallback, Brief 016a): Spawns `claude -p` (or `codex`) as subprocess. `--include-partial-messages` enables real-time streaming deltas (`stream_event` with `text_delta`/`thinking_delta`) rather than complete-message-only output. Deduplication guard prevents double-yielding when both stream deltas and complete `assistant` message arrive. Falls back to `assistant`/`result` parsing when flag is unavailable (older CLI). Loads role contracts as `--append-system-prompt`. Subscription-based ($0 per step). Fresh context per step (ralph pattern). Available for tasks requiring full Claude Code capabilities (terminal, project scanning). No dev roles use this by default since Brief 031. Provenance: ralph autonomous loop, Paperclip adapter pattern.
- **Script adapter** (`script`): Deterministic commands via `child_process`. No AI cost.

The `integration` executor (Phase 6) resolves a service and protocol from the integration registry, executes the external call (CLI, MCP, or REST), and returns structured output — subject to the full harness pipeline like any other executor.

**Channel routing — `notifyUser()` and `resolveChannel()`** (Brief 099a-c): Outbound messages to users traverse a resolver that picks the right delivery channel based on the user's deployment state. `notifyUser({ userId, body, urgent? })` calls `resolveChannel(userId)` → returns `"email"` for users in the `active` state and `"workspace"` for users in the `workspace` state. Workspace delivery emits via `emitNetworkEvent()` (SSE) with email fallback on SSE failure. `urgent: true` always sends email regardless of channel — workspace users get both SSE and email. All channels record an interaction (workspace case added in 099c reviewer F1). A three-layer throttle (caller gating → 1h minimum gap → 5/day cap) bounds outbound volume, with `lastNotifiedAt` on `networkUsers` as the single source of truth. This is the Layer 2 equivalent of "tell the user something" regardless of whether they're embedded in a workspace or arms-length on email.

**Inbound session scoping** (Brief 099a): Inbound email sessions are scoped separately from workspace sessions. `sessionSurfaceValues` includes `"inbound"`; `getOrCreateSession()` filters by `ne(surface, "inbound")` when resolving workspace sessions. Email content never leaks into workspace conversation history and vice versa. Inbound sessions carry a 24-hour timeout vs 30-minute for workspace — async email threads maintain context across hours of back-and-forth.

**Two composition patterns** (Brief 099b, Insight-162): The system composes outbound messages two ways:
- **Conversational composition** — `selfConverse(surface, input)` runs the full Self pipeline (tool use, delegation, reasoning). Used when the system is responding to a user message. Creates sessions, records turns, burns session context.
- **Proactive composition** — direct `createCompletion(...)` with the cognitive core prompt. Used by `relationship-pulse.ts`, `status-composer.ts`, and other proactive outreach modules. NO session created. No tools. No delegation. Pure LLM call producing a message.

The distinction matters: proactive outreach must not pollute the Self's session history (Reviewer Flag B2 in Brief 099b). The same cognitive core governs both paths; the session lifecycle differs.

**Relationship pulse** (Brief 099b): Proactive relationship building runs as step 4 of `pulseTick()`. For each active user, assembles a context snapshot (days since signup, last contact, user model density, active processes, pending deliverables, correction history) and asks an LLM (via proactive composition) whether to reach out. The LLM can decline ("stay silent"). 1-hour minimum gap between proactive outreaches; early-relationship bias (first 7 days raises outreach propensity). Co-ordinates with `status-composer.ts` — users who received status this tick are skipped.

**Action boundaries** (Brief 102): System-enforced tool sets, not prompt-derived. `determineActionContext(state)` returns one of three contexts based on workspace/session state: `front_door` (research-only: search, assess_confidence, web_search, person_research, draft_plan), `workspace` (full 21-tool set), `workspace_budgeted` (workspace + budget-ledger tools). `getToolSetForContext(context)` returns the tool set; `filterToolsForContext()` applies it. This is the security boundary between a front-door visitor (who cannot spend money or send real email) and an authenticated workspace user (who can). Boundaries derived from state, not prompts — a compromised Self cannot escalate its own permissions.

**Orchestrator — dual decomposition paths** (Brief 102): The orchestrator has two decomposition paths. (1) **Step-based decomposition** (original): goal has a `processSlug` → decompose into the process's steps. Used when the routing already has a process. (2) **LLM-powered goal decomposition** (Brief 102): goal has no `processSlug` → `decomposeGoalWithLLM()` gathers process inventory + industry patterns + optional web search, calls LLM, parses structured `GoalDecompositionResult` (sub-goals tagged `find`/`build`, optional phase grouping). Gated by `DimensionMap` clarity assessment — vague goals trigger clarifying questions before decomposition.

**Orchestrator — find-or-build routing** (Brief 103): `routeSubGoal()` routes each sub-goal through three tiers: (1) **Process Model Library** — `findProcessModel()` matches against published models in `processModels` table (keyword-based). (2) **Existing process match** — `matchTaskToProcess()` with confidence ≥ 0.6. (3) **Build meta-process** — `triggerBuild()` researches, generates, saves, and first-run validates a new process. Build depth enforced via explicit counter (max 1 to prevent recursion). First-run gate: generated processes start `draft`, promote to `active` on successful first run. Concurrent-build dedup: keyword-based dedup key, in-flight builds tracked. `resolveSubGoalTrust()` enforces effective tier = more restrictive of goal trust and process trust. `bundled-review.ts` presents review at phase boundaries (all-find-complete or all-build-complete), not per-step. All routing decisions logged with cost category (free/cheap/expensive).

**Goal auto-wiring** (Brief 074): `goalHeartbeatLoop(goalId, trustOverrides?)` continuously orchestrates: decomposeGoal → routeDecomposedTasks → fullHeartbeat per task → chain to next. `matchTaskToProcess()` uses slug exact match (confidence 1.0) or keyword match (token overlap ≥ 0.6 with word-boundary regex). Low confidence escalates to `waiting_human`. `checkAndResumeGoal()` after `approve_review()` on child runs continues the loop. `pauseGoal()`/`resumeGoal()` control lifecycle. Dependency ordering enforced. Goal status tracks completed/paused/failed/pending. Trust overrides stored on child run inputs (trust-gate enforcement at run level remains a follow-up design — stored and logged today, not yet read by the gate).

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

This creates a **nested harness architecture** (ADR-016 adds the Conversational Self as the outermost ring):

```
┌───────────────────────────────────────────────────────────┐
│  CONVERSATIONAL SELF (ADR-016)                            │
│  Persistent identity, consultative framing, self memory,  │
│  cognitive framework, cross-surface coherence              │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  PLATFORM HARNESS (Ditto)                           │  │
│  │  Cross-process governance, trust, dependency graph  │  │
│  │                                                      │  │
│  │  ┌─────────────────────────────────────────────────┐│  │
│  │  │  PROCESS HARNESS (Layer 3)                      ││  │
│  │  │  Review patterns, quality gates, escalation     ││  │
│  │  │                                                  ││  │
│  │  │  ┌─────────────────────────────────────────────┐││  │
│  │  │  │  AGENT HARNESS (Layer 2)                    │││  │
│  │  │  │  Identity, memory, tools, permissions       │││  │
│  │  │  │                                              │││  │
│  │  │  │  ┌─────────────────────────────────────────┐│││  │
│  │  │  │  │  RUNTIME (Adapter)                      ││││  │
│  │  │  │  │  Claude, GPT, script, rules engine      ││││  │
│  │  │  │  └─────────────────────────────────────────┘│││  │
│  │  │  └─────────────────────────────────────────────┘││  │
│  │  └─────────────────────────────────────────────────┘│  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

Each layer has a distinct responsibility. The Conversational Self is the membrane between the human and the system — it is Layer 6 (Human Layer) given a voice, with persistent identity, tiered context assembly, and cross-surface coherence (see ADR-016). The platform harness orchestrates across processes. The process harness enforces quality for a specific process. The agent harness assembles the operating context for a specific agent. The runtime executes. This separation means you can swap any layer independently — different agent in the same process, different process for the same agent, different runtime for the same agent harness.

**Agent harness assembly** happens in a single function (inspired by Open SWE's `get_agent()` pattern): resolve agent identity → load agent memory + process memory → determine authorised tools → check budget → inject into adapter → execute. This function is the seam where all context converges before the runtime fires.

**Memory model**: Four durable scopes plus ephemeral run context, merged at invocation:

| Scope | What it stores | Persists across | Example |
|-------|---------------|----------------|---------|
| **Agent-scoped** | Cross-cutting knowledge that travels with the agent | All process assignments | "This agent prefers explicit error handling over try/catch" |
| **Process-scoped** | Learning specific to a process | All runs of that process | "Invoice descriptions are edited 60% of the time — mostly tone" |
| **Self-scoped** (ADR-016) | User knowledge spanning all processes and agents | All conversations, all processes | "This user prefers terse responses; their business is in construction" |
| **Person-scoped** (Brief 079/080) | Knowledge about a person in Ditto's network | All interactions with that person | "Priya Sharma: logistics consultant, Melbourne. Prefers email. Last interaction positive." |
| **Intra-run context** (Brief 027) | Prior step outputs within the current run | Current run only (ephemeral) | Output from step 1 available to step 2 within same process run |

Durable scopes stored in the `memories` table with `scope_type` (`agent`, `process`, `self`, or `person`) and `scope_id`. Memory types: `correction`, `preference`, `context`, `skill`, `user_model`, and `solution` (Brief 060). Solution memories carry structured `metadata` (JSON): category, tags, rootCause, prevention, failedApproaches, severity, sourceRunId, relatedMemoryIds. Person-scoped memories carry an additional `shared` flag (ADR-025): when `true`, the memory is institutional knowledge visible across all users ("Priya prefers email"); when `false`, it is private to the creating user. Intra-run context assembled from `stepRuns` within the active process run (separate 1500-token budget). Solution knowledge has its own 1000-token budget (Brief 060) — it doesn't compete with corrections/preferences. The harness merges relevant memories into the agent's context at invocation time, applying progressive disclosure (most relevant first, within context budget).

**Deployment topology** (ADR-025): The memory model spans two deployment units. Self-scoped and agent-scoped memories live on the Workspace. Person-scoped memories live on the Ditto Network (centralized). Process-scoped memories live wherever the process executes (Network for outreach/nurture, Workspace for user processes). The harness assembly loads memories from the local database and — when operating on the Network — from the shared person graph.

**Org structure**: Agents have roles, reporting lines, permissions. They serve processes — the human's mental model is "my invoice process" not "Agent #7."

**Session persistence**: Resumable sessions across heartbeats for context continuity. Execution state is serialised to a snapshot (inspired by Sim Studio's snapshot/resume pattern) so runs can pause and resume across heartbeats.

**Budget controls**: Per-agent, per-process cost tracking with soft alerts (80%) and hard stops (100%).

### Layer 3: Harness Layer (Quality Assurance)

**Harness pipeline — 13 handlers** (Brief 116 extended the original 7 to 11; Brief 128 added `model-purpose-resolver`; ADR-028 added `deliberative-perspectives`). Ordered chain-of-responsibility, pre-execution and post-execution handlers interleaved. Registration order in `src/engine/heartbeat.ts`:

| Order | Handler | Phase | Purpose |
|-------|---------|-------|---------|
| 1 | memory-assembly | pre | Loads relevant memories (agent/process/self/person/intra-run) within token budget |
| 2 | identity-router | pre | Resolves `sendingIdentity` (principal/user) from step/process definition (Brief 116) |
| 3 | voice-calibration | pre | Loads voice model when identity is user-scoped (ghost mode collapsed into user identity per Brief 152) |
| 4 | model-purpose-resolver | pre | Reads step-definition signals → sets `resolvedModelPurpose` on context (Brief 128, core layer) |
| 5 | step-execution | mid | Invokes the adapter to execute the step |
| 6 | metacognitive-check | post | LLM self-review for unsupported assumptions, missing edges, scope creep (opt-in below critical) |
| 7 | broadcast-direct-classifier | post | Deterministic audience-size lookup → sets `audienceClassification` on context |
| 8 | outbound-quality-gate | post | `alwaysRun: true`. Checks outbound actions against configurable house value rules. Non-bypassable — flags violations regardless of trust tier. Per-draft independent processing for staged actions (Brief 129). |
| 9 | review-pattern | post | Maker-checker / adversarial / spec-testing per process config |
| 10 | deliberative-perspectives | post | Dynamic lens composition + anonymized peer review + Self synthesis for complex/ambiguous decisions (ADR-028) |
| 11 | routing | post | Evaluates `route_to` conditions, marks skipped siblings |
| 12 | trust-gate | post | Decides pause vs auto-advance based on tier, confidence, broadcast forcing, session overrides, step-category overrides |
| 13 | feedback-recorder | post | Records every decision as an activity for learning |

**Pipeline order deviation from Brief 116 spec:** Brief 116 proposed voice-calibration at position 2 and identity-router at position 3. Implementation reversed this — identity-router runs first because voice-calibration needs `sendingIdentity` to know whether to load a voice model. The doc table reflects actual registration order in heartbeat.ts.

**Broadcast forcing** (Brief 116, security invariant): When `audienceClassification === "broadcast"`, the trust gate forces critical tier — absolute precedence. This cannot be overridden by session trust, goal trust, or step-category overrides. Rationale: a broadcast action is durable and hard to reverse; the Ditto principle is "earn trust in creation, require approval for destruction and broadcast."

**Step-category trust overrides** (Brief 116): `stepDefinition.trustOverride` relaxes within process tier bounds. Enforcement rule: overrides can only relax (supervised → spot_checked), never tighten; builder/reviewer roles and critical-tier steps cannot be relaxed. Enables fine-grained trust on operating cycle internal steps while keeping the gate step at critical.

**Session trust overrides** (Brief 053): In-memory store keyed by runId. `session-trust.ts` lets a `start_pipeline` call carry `sessionTrust` overrides for a specific run. Overrides can only relax, never tighten. Critical tier steps and builder/reviewer roles cannot be relaxed. Auto-cleared on run-complete/run-failed. This is the Self's mechanism for "just let this one run without checking every step" without changing the process's durable trust tier.

**Outbound quality gate** (Brief 116, 129): Configurable house value rules check every outbound action (email, DM, broadcast, social post). Rules evaluated per-draft, independently. Non-bypassable — the gate runs `alwaysRun: true` and flags violations without short-circuiting execution. Flags surface in review rather than silently dropping messages. Staged dispatch pattern (Brief 129): tools can queue drafts via `stagedOutboundActions` during execution; the gate processes each draft post-execution. Prevents mega-step tools from bundling multiple drafts into a single quality decision.

**Operating cycle archetype** (Brief 115-118, Insight-168): A process pattern for continuous operation across days/weeks. Seven archetype phases: SENSE → ASSESS → ACT → GATE → LAND → LEARN → BRIEF. A cycle is a long-running process (status `running` → `paused` → `running`) that spawns short-running sub-process runs per iteration. Four cycle types exist in `processes/cycles/`: `sales-marketing`, `network-connecting`, `relationship-nurture`, `gtm-pipeline`. Cycles declare `callable_as: cycle` and a `defaultIdentity`; sub-processes in `processes/templates/` declare `callable_as: sub-process` and can be invoked by `executor: sub-process` steps. Heartbeat auto-restart re-enters the cycle after iteration completion (overlap guard + fire-and-forget). This is the L1/L2/L3 pattern that lets Alex "operate continuously" rather than "run once."

Four review patterns, assigned per process based on criticality:

| Pattern | How it works | Use when |
|---------|-------------|----------|
| **Maker-Checker** | Agent A produces, Agent B reviews against spec | Standard processes |
| **Adversarial Review** | Agent B prompted specifically to find flaws | Important outputs |
| **Specification Testing** | Validation agent checks output against defined criteria | Established processes |
| **Deliberative Perspectives** | Dynamically composed cognitive lenses evaluate from different angles; anonymized peer review; Self synthesizes (ADR-028) | Complex/ambiguous decisions, goal framing, process design |

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

Trust tiers determine oversight **rate** (how often). The attention model determines oversight **form** (how it's presented). Together they shape whether Ditto feels like a noisy approval queue or a quiet workspace.

| Trust tier | Attention form | Override triggers |
|------------|---------------|-------------------|
| **Supervised** | Item review — every output in Review Queue | None |
| **Spot-checked** | Item review for sampled outputs + digest for the rest | Low confidence → item review regardless of sample |
| **Autonomous** | Digest only — summary in Daily Brief, detail on demand | Low confidence → item review; metric deviation → process alert |
| **Critical** | Item review — every output, always | None |

Three additional mechanisms:
- **Metacognitive self-check** — a fast, post-execution self-review that checks the agent's output against its input for unsupported assumptions, missing edge cases, scope creep, and contradictions. This is the *internal* oversight loop (same role's lens), complementary to review patterns which provide *external* oversight (second perspective). Auto-enabled for supervised and critical tiers; opt-in for spot-checked and autonomous via `harness.metacognitive: true`. If issues found, flags for human review. Does not re-execute or replace review patterns. (Insight-063, ADR-014 Phase A2, Brief 034b)
- **Per-output confidence scoring** — the agent self-assesses each output. High-confidence outputs auto-advance. Low-confidence outputs route to human regardless of trust tier. This is a second dimension: trust tiers are process-level/historical; confidence is output-level/per-invocation.
- **Digest review mode** — the Review Queue supports both item review (approve/edit/reject) and digest review (summary of accumulated outputs from autonomous processes, drill-down on demand).

### Layer 4: Awareness Layer (Cross-Process Intelligence)

**Model: dependency graph with event propagation.**

Every process declares what it consumes (inputs + sources) and what it produces (outputs + destinations). This creates a live graph.

When any process produces output:
1. Output published to the process's output slot — typed per the process's output schema (ADR-009 v2: data, view, document, integration, external)
2. Dependent processes notified via event — output schemas serve as typed contracts between processes, validated at definition time (`sync`)
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
| **Process dependency graph** | How Ditto processes relate to each other | Operational, reactive, event-driven | "Process A produced output, notify Process B" |
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

**4. Model routing feedback** (Brief 033) — Which model produced which output, at what cost, with what quality?
- Every step run records the actual model used (from the provider API response)
- `generateModelRecommendations()` compares models per (process, step) from 20+ runs
- Recommends cheaper model when quality is comparable (within 5% approval rate)
- Recommends upgrade when current model quality is low (<80% approval rate)
- Advisory only — the Self surfaces recommendations, human decides

**5. Implicit UI signals** (Brief 056) — How does the user interact with the workspace?
- Semantic interaction events recorded to the `interaction_events` table: `artifact_viewed` (with duration), `composition_navigated` (intent transitions), `brief_selected`, `block_action_taken`, `review_prompt_seen` (with response time), `pipeline_progress_viewed`
- These are **implicit** signals — weaker than explicit feedback but high-volume and pattern-rich
- **Critical constraint: implicit signals do NOT feed trust computation.** Trust tiers remain based exclusively on explicit human feedback (approve/edit/reject). Implicit signals feed only meta-processes (self-improvement, project-orchestration) and the Self's proactive context assembly.
- Privacy by design: events contain entity IDs and timestamps, not content. No keystroke logging, no scroll depth, no mouse tracking.
- Fire-and-forget on the frontend: `navigator.sendBeacon()` with `fetch()` fallback. Lost events are acceptable — these are statistical signals, not transactional data.
- Meta-processes query these signals via SQL to observe: which outputs get viewed vs ignored, navigation frequency patterns, average review response times, brief engagement rates.

**6. Brief lifecycle sync** (Brief 056) — The `briefs` table mirrors brief markdown files from `docs/briefs/` into the database. `syncBriefs()` parses frontmatter, upserts with mtime-based invalidation, and soft-deletes removed files. This enables the project-orchestration meta-process to track brief velocity (days in each status) and project progress without filesystem access.

**7. Explicit knowledge extraction** (Brief 060) — When a significant correction occurs (edit severity ≥ moderate, rejection, retry, first 10 runs, or correction pattern count ≥ 3), the `knowledge-extraction` system process fires. Three parallel extractors classify the correction (context-analyzer: category, tags, severity), extract solution knowledge (solution-extractor: root cause, failed approaches, prevention), and find related existing solutions (related-finder: SQL-based metadata matching, not LLM). An assembly step merges results: high overlap → reinforce existing memory; moderate → create with cross-reference; low/none → create new. Trust-tier-aware scaling: supervised extracts on every significant correction, spot-checked samples ~50%, autonomous only on degradation (rejections), critical on every correction. Solution memories start at confidence 0.5 (higher than corrections at 0.3), decay by 0.1 after 50 runs without retrieval, and are pruned when confidence drops below 0.2. Newer solutions supersede older low-confidence ones in the same category. This complements implicit feedback — the system now learns structured knowledge (root cause, prevention, what failed) not just that something was edited.

**Reactive-to-repetitive lifecycle (ADR-010):** Beyond improving existing processes, Layer 5 also watches for patterns in ad-hoc work. When the system notices the user creating similar work items repeatedly (e.g., Rob keeps manually entering bathroom reno quotes), it proposes formalising the pattern as a new process. The user confirms, refines, and activates — the ad-hoc work becomes a governed, trust-earning process. This is how the system grows its capabilities from user behaviour.

### Cross-Cutting: Admin Oversight (Brief 108)

Admin oversight is an operational layer spanning Layers 2 (Agent), 3 (Harness), and 6 (Human). The Ditto team has controls over Alex for every user on the managed network — pause/resume, feedback, act-as-Alex, and downgrade notifications. This is distinct from user-level trust (the user's ability to set trust tiers on their own processes). Admin controls operate on the network scope and carry `actorType: "admin"` in activity logs.

**Mechanisms:**
- `pauseUserProcesses(userId)` / `resumeUserProcesses(userId)` — sets/clears `pausedAt` on `networkUsers`. `status-composer.ts` and `relationship-pulse.ts` per-user loops check the flag and skip paused users. No outreach, no status email, no proactive pulse for paused users.
- `adminFeedback` table — admin-scoped guidance. Admin writes a feedback entry; memory-assembly surfaces it as context when Self operates on behalf of that user. This is how the Ditto team corrects Alex's behaviour without touching the user's own trust state.
- `sendAsAlex(userId, recipient, body)` — Ditto team composes via `sendAndRecord()` with `personaId: "alex"`. Interaction is recorded normally; the activity log marks it admin-sent.
- `notifyAdmin()` / `notifyAdminOfDowngrade()` — trust downgrades (Insight-160: "who reviews on downgrade?") fire an email to `ADMIN_EMAIL`. The answer to the open question: the Ditto team does, via the admin dashboard at `/admin/users/[userId]`.
- Admin routes (`/admin/users`, `/admin/users/[userId]`, `/admin/provision`, `/admin/fleet`, etc.) authenticated via `authenticateAdminRequest()`. Deployment mode flag (ADR-030) hard-404s admin routes in `workspace` mode — admin surfaces ship only on public Ditto Network, not on client installs.

**Why operational, not architectural:** Admin oversight does not change how the harness operates. It adds a parallel control plane for the Ditto team to act on any user's system without becoming that user. The user's trust state, process definitions, and memory are untouched by admin actions (except adminFeedback, which is read-only context from Alex's perspective).

### Cross-Cutting: Governance and Agent Authentication

Governance spans Layers 3 (Harness) and 4 (Awareness). Trust tiers govern individual processes. Governance governs the system as a whole.

**Agent Authentication:**

Every agent operating within Ditto must have a verified identity. As the platform scales beyond a single user to teams and organisations, we need to know:
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

The governance function is itself a process — it runs within Ditto, subject to its own trust tier (always supervised or critical). It monitors other processes for:
- Agents operating outside their declared permissions
- Trust tiers being circumvented or gamed
- Quality criteria being consistently unmet without escalation
- Compliance requirements (data retention, audit trails, approval chains)

**Key principle:** Governance agents cannot modify processes or override trust tiers. They can only surface findings and recommend actions to humans. The human always decides.

This is an evolving concept that will be refined as Ditto scales beyond single-user dogfooding to team and organisational use.

### Cross-Cutting: External Integrations

Integrations span Layers 1 (Process), 2 (Agent), 3 (Harness), and 4 (Awareness). They connect Ditto processes to external systems — email, communication channels, cloud storage, accounting software, CRMs, and any other service a process needs.

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
- Scoped per-process, per-service — an agent assigned to Process A cannot use Process B's credentials (per-agent scoping deferred to Phase 12). Credential vault: AES-256-GCM encrypted at rest, HKDF key derivation (Brief 035).
- Every external call logged to the activity table

**Harness integration — all external calls are first-class harness events:**

Both purposes traverse the harness pipeline:
- Agent tool use: tools authorised at harness assembly time; trust gate can require approval before external calls
- Process I/O: output delivery happens after trust gate approval; input triggers logged as activities

External calls are not invisible side-effects. They are governed, audited, and subject to trust tiers.

**Invocation guard pattern (Insight-180):** Functions that produce external side effects (social publishing, payments, webhook dispatches) must require a `stepRunId` parameter as proof the call originates from within harness pipeline step execution. This is a programmatic guard — the function rejects calls without a valid step-run context (except in test mode). This ensures all external mutations traverse trust gates, outbound-quality-gate, and audit logging. Convention-based constraints ("only call this from step execution") are insufficient; the guard makes the constraint self-enforcing.

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

**Provenance:** Multi-protocol resolution pattern from Google Workspace CLI (ships CLI + MCP + REST). Brokered credentials from Composio. Skills-wrapping-MCP from OpenClaw. Code-first integration functions from Nango. Trust-aware integration access, integration feedback capture, and process-scoped permissions are Original to Ditto. See ADR-005.

### Cross-Cutting: Attention Model (ADR-011)

The attention model spans Layers 3 (Harness) and 6 (Human). It answers a question trust tiers don't: **in what form** does the human experience process outputs?

Trust tiers determine oversight **rate** — how often. The attention model determines oversight **form** — item review, digest, or alert. Together they shape whether Ditto feels like a noisy approval queue or a quiet workspace where the human is pulled in only when their judgment adds value.

**Three attention modes:**

| Mode | What the human sees | When it's used |
|------|--------------------|----|
| **Item review** | Individual output in Review Queue. Requires action: approve / edit / reject. | Supervised (all), spot-checked (sampled), any output flagged as uncertain |
| **Digest** | Summary in Daily Brief or process-level report. No action required. | Autonomous (all), spot-checked (non-sampled) |
| **Alert** | Process-level health notification. Surfaces as Improvement Card. | Any tier when quality metrics cross thresholds |

**Per-output confidence scoring:** The agent producing an output includes a categorical confidence signal (`high` / `medium` / `low`) as metadata. Low confidence → escalate to item review regardless of trust tier. This is a second dimension: trust is process-level and historical; confidence is output-level and per-invocation. The agent knows when it's out of its depth and says so — the SAE Level 3 pattern applied to business processes.

**Silence is a feature.** When an autonomous process runs cleanly, the human sees nothing until the next digest. No notification, no queue item. The absence of noise IS the signal that things are working. This is the Management by Exception pattern from management science.

**Provenance:** Content moderation three-band routing (TikTok, YouTube). ISO 2859 switching rules. Management by Exception (active MBE). Hersey-Blanchard Situational Leadership. SAE J3016 Level 3 (system knows when it's out of its depth). Zapier Digest (batch review). PagerDuty Event Intelligence (noise reduction). Per-output confidence routing, digest as explicit attention mode, and silence-as-feature are Original to Ditto. See ADR-011.

### Cross-Cutting: Agent Cognitive Architecture (ADR-014)

The cognitive architecture spans Layers 2 (Agent), 3 (Harness), 4 (Awareness), 5 (Learning), and 6 (Human). It answers a question no other cross-cutting concern addresses: **how should the agent think?**

Trust tiers determine oversight **rate** (how often). The attention model determines oversight **form** (item review, digest, alert). The cognitive model (ADR-013) determines what kind of **human thinking** review demands. The cognitive architecture determines what kind of **agent thinking** execution demands — and provides the executive function that governs the system's cognitive resources.

**The governing principle:** Processes declare structure. Agents bring judgment. The harness evaluates outcomes. A process definition governs what happens and in what order. The agent within each step has freedom to exercise judgment about how. The harness evaluates whether the output meets quality criteria — it doesn't prescribe how the agent got there. This ensures consistency (same process, same governance) without rigidity (agents can adapt to context). The balance between **declarative process** (structured, governed, repeatable) and **intuitive metacognition** (adaptive, context-aware, capable of noticing what wasn't asked for) is the core design tension.

**Three-layer cognitive architecture:**

| Layer | Character | What it provides |
|-------|-----------|------------------|
| **A: Cognitive Infrastructure** | Always active | Executive function substrate: context assembly (position-aware working memory), metacognitive monitoring (intention tracking between steps), friction detection (retry/confidence trajectory), inhibitory control (existing trust gate), calibrated uncertainty (honest confidence signals) |
| **B: Cognitive Toolkit** | Available, not mandated | Library of cognitive tools agents can draw on: mental models (first principles, inversion, circle of competence), reasoning strategies, reflection prompts, communication patterns. Markdown templates in `cognitive/`. The MeMo pattern: provide the toolkit, let the model choose. |
| **C: Cognitive Context** | Framing, not scripting | Per-step declarations that set the cognitive register: `framing` (exploratory, analytical, convergent, adversarial, generative, integrative), `toolkit` (which models are available), `reflection` (checkpoint prompts), `freedom` (scaffolding depth: high/medium/low). The frame primes; the agent decides. |

**Executive function as orchestrator evolution:** The orchestrator evolves from task tracker to cognitive manager. At each heartbeat, it evaluates: Is this approach converging on the intention? Is friction accumulating? Should the approach be adapted? This includes space for intuitive observation — "What, if anything, surprises you about the current state?"

**Adaptive scaffolding:** Cognitive scaffolding depth adapts to model capability, task novelty, and trust tier. More capable models get less structure (addressing the Prompting Inversion finding: constrained prompting hurts frontier models). The `freedom` field controls this per step.

**Trust rewards cognitive quality:** Agents with well-calibrated uncertainty earn trust faster. Productive failure (structured learning from failures) and proactive concern flagging contribute positively to trust evaluation. Trust is built through vulnerability and authenticity, not just performance metrics.

**Provenance:** MeMo (Guan et al., 2024) for toolkit-not-prescription. MAP (Webb et al., Nature Communications 2025) for modular cognitive decomposition. Reflexion (Shinn et al., NeurIPS 2023) for metacognitive monitoring. CoALA (Sumers et al., TMLR 2024) for theoretical framework. Prompting Inversion (Bernstein et al., 2025) for adaptive scaffolding. Farnam Street (mental models), Tony Robbins (state management), Brené Brown (relational trust), cognitive neuroscience (executive function). Three-layer architecture, executive function as orchestrator, adaptive scaffolding, and cognitive quality in trust are Original to Ditto. See ADR-014.

### Cross-Cutting: Meta Process Architecture (ADR-015)

The twelve system agents (ADR-008) are implementations of five higher-order **meta processes** — the fundamental processes through which the platform operates, creates, evolves, anticipates, and reasons. ADR-015 organizes them into a coherent structural model:

| Meta Process | What it does | System agents involved |
|-------------|-------------|----------------------|
| **Goal Framing** | Consultative conversation: listen → assess clarity → ask → reflect → hand off | intake-classifier, router, orchestrator |
| **Build** | Creates all processes, agents, skills. Self-referential (builds itself). Research-driven. Generative core. | ai-agent (dev roles via `createCompletion()`, Ditto's own tools) |
| **Process Execution** | Runs governed processes through the harness with trust, memory, feedback | trust-evaluator, governance-monitor |
| **Feedback & Evolution** | Correction → pattern → structural insight → improvement proposal (inward-looking) | improvement-scanner, process-analyst |
| **Proactive Guidance** | Anticipate what the user needs before they ask. Discover gaps, hunt for new processes, guide adoption (outward-looking). Three hunting mechanisms: inward (from user data), outward (from world knowledge), cross-instance (from community corrections). Feeds Goal Framing with suggestions. (Insight-142) | coverage-agent, process-discoverer, onboarding-guide |

A sixth element — the **Cognitive Framework** — is pervasive, not a meta process. It governs how the system approaches problems, prioritizes, makes trade-offs, exercises metacognition, and maintains space for intuition. It is the environment within which all meta processes operate.

**The system runs ON itself.** Meta processes go through the same harness pipeline as user processes — earning trust, accumulating memory, receiving feedback. The dev pipeline (building Ditto itself) is the first validation target. See ADR-015.

### Cross-Cutting: The Conversational Self (ADR-016)

The Conversational Self is the outermost harness ring (see babushka diagram above) — the entity the user actually talks to. It is Layer 6 (Human Layer) given a voice: persistent identity, tiered context assembly, cross-surface coherence, and consultative framing.

The Self is singular per user/workspace. Identity lives in the engine, not the surface. It delegates to roles/processes internally but presents a unified face. It thinks through the cognitive framework (ADR-014, ADR-015) — it doesn't just route.

**Key mechanisms:**
- **Self context assembly:** Tiered loading — core identity + user knowledge always in context (~6K tokens); work state summarized; session context for current conversation; recall + deep knowledge on demand via tools
- **Self memory scope:** Third scope (`self`) alongside `agent` and `process` — stores user preferences, business context, relationship history spanning all processes
- **Session persistence:** `sessions` table tracks conversation turns across surfaces, enabling cross-session and cross-surface continuity
- **Planning vs execution:** The Self distinguishes two modes. **Planning** (`plan_with_role`) engages roles (PM, Researcher, Designer, Architect) with read-only codebase access for collaborative analysis, scoping, and document production — Architect can additionally propose writes to `docs/` paths, subject to user confirmation. **Execution** (`start_dev_role`) delegates to any role through the full harness pipeline. **Consultation** (`consult_role`) is a quick perspective check. The Self intuits which mode to use from conversation context. (Brief 052)

**Provenance:** Letta (tiered memory, self-editing blocks), Anthropic multi-agent (orchestrator-as-identity, just-in-time context), SOAR (metacognitive monitoring), Claude Code (auto-memory selectivity), Mem0 (extraction-reconciliation), Zep (temporal invalidation). Combining persistent identity + self-editing memory + delegation to governed processes + cross-surface coherence is Original to Ditto. See ADR-016.

### Layer 6: Human Layer (The Interface)

A conversation-first workspace, not a dashboard. The user works IN Ditto — it's always open, actively working on their behalf, and pulls them in when judgment is needed. Three design principles govern the layer:

**1. Conversation is the primary interaction.** The user talks to the Conversational Self. Self understands intent, assembles context, delegates to processes, and renders structured results back into the conversation as ContentBlocks. The conversation IS the workspace — not a feature buried in a tab.

**2. The unified task surface.** Composition intents (Today, Inbox, Work, Projects, Routines) render ContentBlock arrays in the center column. The user sees one workspace with things needing their attention — reviews, active work, process health — surfaced as structured blocks, not separate pages. Three types of work items surface together:
- **Review tasks** — "check this output" (from harness review patterns, rendered as ReviewCardBlock)
- **Action tasks** — "do this thing" (from human steps in processes, rendered as ActionBlock)
- **Goal-driven tasks** — "work toward this" (decomposed by orchestrator agent, rendered as StatusCardBlock)

**3. Memory is visible.** The system demonstrates accumulated context on every surface. The Daily Brief feels like a briefing from a chief of staff who knows everything. Processes show their learning history. The system never feels like "new chat." (Insight-028)

Three activity contexts coexist (not hard mode switches):
- **Analyze** — conversation with Self + data/chart blocks in response
- **Explore** — conversation with Self → `generate_process` tool → Process Builder in right panel
- **Operate** — composition intents (Today/Work/Inbox) + pipeline progress + inline review

**Workspace architecture:** Three-panel layout — sidebar (navigation to composition intents + process list) + center column (composed canvas + conversation + prompt input) + right panel (context-reactive: feed, process detail, briefing). Artifact mode for deep review: conversation (compact) + artifact host (ContentBlock[] via BlockList) + context panel. See `human-layer.md` for full workspace specification.

**Surface-aware Self** (Brief 099a): `selfConverse(surface, input)` takes a surface type — `"web" | "cli" | "telegram" | "inbound"`. Same 26-tool Self brain; different session scoping and delegation guidance. When `surface === "inbound"`, the workspace-specific `<delegation_guidance>` block (panels, artifact mode, process builder references) is replaced with async-appropriate instructions (bias toward action, mention timelines, no workspace UI references). The Self is one identity across surfaces; the surface is a hint that shapes framing, not a fork.

**Composition engine** (Briefs 073, 154): Every sidebar destination is a `CompositionIntent`, not a page. The composition engine in `packages/web/lib/compositions/` contains one pure function per intent (`composeToday(context)`, `composeInbox(context)`, etc.) returning `ContentBlock[]`. Deterministic and synchronous — no LLM in the hot path. Phase 10 MVP pattern (ADR-024): Self-driven composition deferred to Phase 11+; current functions encode reference compositions as defaults. Fallback composition renders on error (conversation input + TextBlock apology).

**Composition intents — 8 destinations** (Briefs 073, 138, 140, 154, 166-168):

| Intent | Purpose | Empty state | Composition module |
|--------|---------|-------------|-------------------|
| **Today** | What needs me right now | "Nothing needs your attention. Your processes are running smoothly." (deterministic, no LLM) | `compositions/today.ts` |
| **Inbox** | Reviews, exceptions, suggestions | Context-aware suggestion blocks | `compositions/inbox.ts` |
| **Work** | Active work items + pipelines | Suggestion blocks | `compositions/work.ts` |
| **Projects** | Goal-level items with decomposition | Suggestion blocks | `compositions/projects.ts` |
| **Routines** | Recurring processes + health | Suggestion blocks | `compositions/routines.ts` |
| **Growth** | GTM pipeline plans, experiments, published content (Brief 140) | "Tell me about an audience you want to reach" | `compositions/growth.ts` |
| **Library** | Process capability catalog (Brief 138) + recommended-for-you (Brief 168) | Personalised recommendations from user model | `compositions/library.ts` |
| **Adaptive views** | Data-driven compositions registered at runtime (Brief 154) | — | `compositions/adaptive.ts` + `workspaceViews` table |

**Intent context injection** (Brief 073): `selfConverseStream()` accepts `intentContext` — when the user starts a conversation from a specific sidebar destination, the composition intent is injected into the system prompt as `<intent_context>`. Routines → "focus on recurring cadence." Projects → "group work by parent goal." Inbox → "focus on pending reviews." This shapes Self's framing without routing to a different agent — one Self, context-aware per intent.

**Adaptive workspace views** (Brief 154, Insight-189): Network agents push blocks to the workspace live. `workspaceViews` table (core schema, opaque JSON `CompositionSchema`). `pushBlocksToWorkspace()` / `refreshWorkspaceView()` / `registerWorkspaceView()` with 20/min rate limit. `workspace.push_blocks` + `workspace.register_view` tools with `stepRunId` guards (Insight-180). Companion view registration available via `generate_process`. This closes the loop between long-running network processes and the living workspace — the agent doesn't just send an email, it materialises a dashboard.

---

## Rendering Architecture

### ContentBlocks: The Universal Unit

Everything the user sees flows through **ContentBlocks** — typed, structured data units defined in `packages/core/src/content-blocks.ts` (re-exported from `src/engine/content-blocks.ts`) and rendered by the block registry (`packages/web/components/blocks/block-registry.tsx`). **26 ContentBlock types** form a discriminated union with compile-time exhaustiveness checking. See ADR-021 addendums for the lineage; the engine source is authoritative.

**Design rule:** ALL rendering flows through ContentBlocks. No bespoke viewers. Artifact mode renders BlockList. The composition engine produces BlockList. Self responses contain BlockList. This is the most critical architecture principle. (Insight-107)

**Exception: Response-level metadata** (Insight-129). Not everything the engine produces is content. Some structured data describes the *response itself* — metadata about how confident the engine is, not a discrete content unit. `ConfidenceAssessment` is the first example: exported from `content-blocks.ts` for type co-location but NOT a member of the `ContentBlock` discriminated union. It flows via custom data parts (`data-confidence`) and is rendered by the Message component as conversation chrome, not by the block registry. The 26 ContentBlock count is unchanged. Litmus test: "Can this appear independently in a Today briefing?" If yes → ContentBlock. If no → response metadata.

### Two-Layer UI Architecture

| Layer | Concern | Location |
|-------|---------|----------|
| **ContentBlock types** | WHAT to render (engine data model) | `packages/core/src/content-blocks.ts` — 26 types |
| **Response metadata types** | Metadata ABOUT the response (not portable content) | `src/engine/content-blocks.ts` — `ConfidenceAssessment` |
| **AI Elements** | HOW to render (React components) | `packages/web/components/ai-elements/` — 16 components |
| **Block renderers** | Block → AI Element mapping | `packages/web/components/blocks/` — 22 renderers |

AI Elements are adopted from Vercel AI Elements (Brief 058+061) using the composable subcomponent pattern: Context Provider + named subcomponents + backward-compatible default export. Block renderers consume ContentBlock data and render using AI Elements.

### Conceptual Primitives

The 16 user-facing concepts from the original design (v0.1.0) remain valid as experience goals. They are now realized through ContentBlock types, composition intents, and workspace surfaces:

#### Orient (What's going on?)

| Primitive | Realized as |
|-----------|-------------|
| **Daily Brief** | TextBlock narrative assembled by `briefing-assembler.ts`, delivered via Today composition or Self's `get_briefing` tool |
| **Process Card** | StatusCardBlock in compositions + process detail view (3 variants: living-roadmap, domain-process, process-runner) |
| **Activity Feed** | Unified timeline in process detail view, filterable. Human+system actions. |
| **Performance Sparkline** | ChartBlock + MetricBlock in compositions |

#### Review (Is this right?)

| Primitive | Realized as |
|-----------|-------------|
| **Review Queue** | ReviewCardBlock in Inbox composition + inline review prompts in conversation via `use-pipeline-review.ts` |
| **Output Viewer** | BlockList in artifact mode — same block registry, wider canvas (720px max-width). Six viewer types per ADR-023 Addendum. |
| **Feedback Widget** | Implicit capture — edits ARE feedback, rejections ARE feedback. Pattern notification after 3+ corrections. "Teach this" (future). |

#### Define (What needs to happen?)

| Primitive | Realized as |
|-----------|-------------|
| **Conversation Thread** | Center column conversation with Self. Self's tools handle routing, process definition, work capture. |
| **Process Builder** | Right panel surface, populated by `generate_process` tool. YAML structure with "Drafting" badge. |

#### Delegate (Who does it?)

| Primitive | Realized as |
|-----------|-------------|
| **Agent Card** | Not yet built as a standalone surface. Agent info surfaces in process detail. |
| **Trust Control** | Natural language slider in process detail ("Check everything" ↔ "Let it run") with evidence narrative. `adjust_trust` tool. Session trust overrides via `start_pipeline`. |

#### Capture (Here's context)

| Primitive | Realized as |
|-----------|-------------|
| **Quick Capture** | Prompt input (text + drag-drop) + Self's `quick_capture` tool. Auto-classifies and routes. |

#### Decide (What should change?)

| Primitive | Realized as |
|-----------|-------------|
| **Improvement Card** | SuggestionBlock in compositions. Self's `suggest_next` tool. |
| **Process Graph** | Not yet built. Architecture describes 3-layer graph (goals → processes → live state). |

#### Research & Analytics

| Primitive | Realized as |
|-----------|-------------|
| **Data View** | DataBlock, ChartBlock, MetricBlock, InteractiveTableBlock in compositions |
| **Evidence Trail** | KnowledgeCitationBlock + ReasoningTraceBlock. InlineCitation + Sources AI Elements (Brief 061). |

### Workspace Compositions

| Intent | ContentBlocks used | Who |
|--------|-------------------|-----|
| **Today** | TextBlock (brief), ReviewCardBlock, ProgressBlock, SuggestionBlock | Everyone, every morning |
| **Inbox** | ReviewCardBlock, AlertBlock, SuggestionBlock, ActionBlock | Anyone reviewing or completing work |
| **Work** | StatusCardBlock, ProgressBlock, ChecklistBlock | Active work tracking |
| **Projects** | StatusCardBlock, MetricBlock, ChartBlock | Process portfolio health |
| **Routines** | StatusCardBlock, DataBlock | Recurring process management |
| **Process Detail** | StatusCardBlock + activity log + trust control + sparklines | Process owner (drill-down from sidebar) |
| **Artifact Mode** | Any ContentBlock[] via BlockList — review lifecycle (approve/edit/reject) | Deep review of process outputs |

---

## Borrowing Strategy

Ditto composes proven patterns rather than inventing from scratch:

| What we need | Borrow from | Pattern |
|-------------|-------------|---------|
| Heartbeat execution | **Paperclip** | Agents wake, execute, sleep. Budget controls. Atomic task checkout. |
| Adapter pattern | **Paperclip** | Any runtime plugs in via `invoke()`, `status()`, `cancel()`. |
| CLI adapter (subprocess) | **ralph** (snarktank) | Fresh context per iteration via `claude -p`. Role contracts as `--append-system-prompt`. Subscription-based ($0). |
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
| Harness event emitter | **Trigger.dev** | Typed lifecycle events (step-start/complete, gate-pause/advance, routing-decision). External surfaces subscribe. |
| Attention model — oversight form | **Content moderation** (TikTok/YouTube) + **ISO 2859** + **MBE** | Three-band confidence routing, switching rules, management by exception. Adapted for process trust. |
| Digest review | **Zapier Digest** + **GitHub Copilot** | Batch outputs for periodic review. PR-as-batch-artifact. |

**What IS original:**
- The workspace interaction model — handoff-first, not management-first (ADR-010)
- Work items with goal ancestry routed through trust-governed meta-processes (ADR-010)
- The system runs ON itself — meta-processes go through the same harness as user processes (ADR-010)
- Work evolution — a single input evolves through multiple processes, spawning new work (ADR-010)
- Reactive-to-repetitive lifecycle — system notices ad-hoc patterns and proposes processes (ADR-010)
- The process-first internal model (not task-first, not agent-first)
- The human layer (conversation-first workspace, composition intents, ContentBlock rendering architecture)
- Progressive trust that's earned, not configured
- Implicit feedback capture (edits ARE feedback)
- Human steps in processes — processes pause for real-world human actions, then resume (ADR-010)
- Memory as UX — the system demonstrates accumulated context, never feels like "new chat" (Insight-028)
- Attention model — trust tiers determine oversight rate, attention model determines oversight form. Per-output confidence + digest review. No surveyed system combines process-level trust with per-output confidence routing (autonomous-oversight-patterns research)
- Structure as the product — the eight things raw chat is missing (Insight-030). Ditto IS the scaffolding that makes AI useful for non-technical users
- Analyze mode — connecting to readily available org data to build a persistent understanding of how the organisation actually works
- Organizational data model — persistent, evolving org understanding in Layer 4
- Adapter abstraction — users bring their own AI execution substrate (CLI, API, local). Trust system handles quality differences naturally (Insight-041)
- Self-healing via learning layer with human governance
- Trust-aware integration access (external calls governed by earned trust tier)
- Integration feedback capture (did the external action produce the right outcome?)
- Process-scoped integration permissions (credentials scoped per-process, per-service; per-agent deferred to Phase 12)

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

## First Implementation: Coding Agent Team (Historical)

> **Note:** This section preserves the original design vision from pre-Phase 4 (before ADR-010, work items model). The actual implementation uses 7 dev roles (PM, Researcher, Designer, Architect, Builder, Reviewer, Documenter) as standalone `ai-agent` delegation processes — see `processes/dev-*-standalone.yaml`. The Conversational Self (ADR-016) delegates to these roles via tool_use. The dev pipeline also exists as `processes/dev-pipeline.yaml` for full sequential orchestration. The processes below were the starting conceptual model, not what shipped.

The dogfood. Applying Ditto principles to agentic coding orchestration.

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
| Agent runtime | Multi-provider LLM via `llm.ts` (Anthropic, OpenAI, Google, Ollama), scripts, CLI subprocess (optional) | Purpose-based routing (ADR-026, Insight-157) |
| Auth | API keys for agents, session auth for humans | Paperclip pattern |

### Model Routing by Purpose (ADR-026, Insight-157)

Model quality matches user proximity to the output. Ditto manages all provider keys internally — users never configure LLM providers.

| Layer | Purpose class | Model tier | Examples |
|-------|--------------|-----------|----------|
| L6 Human — Front door, Self, briefings | `conversation` | Best conversational | Sonnet, GPT-4o, Gemini Pro |
| L6 Human — Outreach, introductions | `writing` | Best writing | Sonnet, GPT-4o, Gemini Pro |
| L3 Harness — Metacognitive check, review | `analysis` | Capable | Sonnet, GPT-4o, Gemini Pro |
| L2 Agent — Research, enrichment | `analysis` | Capable | Sonnet, GPT-4o, Gemini Pro |
| L2 Agent — Classification, routing | `classification` | Fast/cheap | Haiku, 4o-mini, Gemini Flash |
| L5 Learning — Feedback, memory extraction | `extraction` | Fast/cheap | Haiku, 4o-mini, Gemini Flash |

All configured providers are loaded simultaneously. `createCompletion({ purpose: "..." })` routes to the first available provider in the preference list for that purpose. Explicit `model:` override bypasses routing. See `src/engine/model-routing.ts` for the routing table.
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
| First dogfood | Coding agent team | Meta-benefit: builds Ditto using Ditto |
| Tech stack | Next.js + Postgres + Claude | Proven, fast, the user knows it |
| Deployment | Headless engine + universal frontend | Web + mobile, separate concerns |

## Open Questions

| Question | Impact | When to resolve | Status |
|----------|--------|----------------|--------|
| Pricing model | Revenue, market positioning | Before beta | Open |
| Multi-tenancy from day one? | Architecture complexity | Phase 10+ | Open |
| Mobile capture — PWA vs native | Development effort | Phase 13 | Open |

### Resolved Questions

| Question | Resolution | When resolved |
|----------|-----------|---------------|
| Product name | **Ditto** — "AI that doesn't reinvent, it remembers and improves" | 2026-03-21 |
| Integration registry format | **YAML files** — per-service declaration files in `integrations/` (ADR-005, Brief 024) | 2026-03-21 |
| Process template library scope | **3 templates** shipped in Phase 5: invoice-follow-up, content-review, incident-response (Brief 020) | 2026-03-21 |
| System analyst AI | **Deferred to Phase 11** as `process-analyst` system agent (ADR-008). Outcome owner reframe means this may move earlier. | 2026-03-21 |
| OpenClaw integration | Partially addressed by ADR-005 (multi-protocol architecture). Specific adapter deferred to Phase 6 build. | 2026-03-21 |
| Integration credential platform — build minimal, Nango, or Composio? | **Build core inside Network Service for top-5 providers; defer Nango to Phase 12 re-evaluation (trigger: ≥3 unplanned integration requests per week for one month + commercial-licence conversation with NangoHQ)** (ADR-031) | 2026-04-17 |

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
| "AI Ditto" practitioner pattern | Folder-structure-as-harness, hiring metaphor for non-technical users, skills as progressive disclosure |
| [OpenClaw](https://openclaw.ai/) | Skills-as-progressive-disclosure, skills wrapping MCP servers, channel adapters |
| [Google Workspace CLI](https://github.com/googleworkspace/cli) | Multi-protocol integration (CLI + MCP + REST for same service), agent skills pattern |
| [Nango](https://github.com/NangoHQ/nango) | Code-first TypeScript integration functions, managed OAuth, syncs + actions model |
| [Composio](https://github.com/ComposioHQ/composio) | Brokered credentials pattern, tool routing, MCP aggregation |
| [Xero MCP Server](https://github.com/XeroAPI/xero-mcp-server) | First-party MCP server for accounting software |
| Prior thinking (catalyst/temp/Agentic/) | Whitespace analysis, transformation strategy, wedge framework |
