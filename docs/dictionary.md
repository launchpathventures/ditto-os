# Ditto Glossary

The canonical reference for every key term, concept, and component in Ditto. This is the shared vocabulary for the entire project. Entries are alphabetical. Each entry includes its definition within the Ditto context, the architecture layer it belongs to, and related terms.

---

**ADR (Architecture Decision Record)** — A lightweight document recording a significant technical decision: what was decided, what was considered, provenance (which source project), and consequences. Accumulated ADRs form the decision history. Template at `docs/adrs/000-template.md`. Format based on Michael Nygard's original ADR specification.
- Layer: Meta
- Related: Provenance, Borrowing Strategy, Composition Over Invention

**Activity Feed** — UI primitive (#3) that displays a filterable, chronological timeline of everything that happened across agents and processes. The audit trail in human-readable form.
- Layer: 6 (Human)
- Related: Orient, Daily Brief, Process Card, Evidence Trail

**Adapter** — A pluggable interface that connects any runtime (Claude, GPT, scripts, APIs, rules engines) to the Agent Layer. Defines three core methods: `invoke()`, `status()`, `cancel()`.
- Layer: 2 (Agent)
- Related: Heartbeat, Agent Layer, Paperclip, Claude Agent SDK

**Adversarial Review** — A harness review pattern where Agent B is specifically prompted to find flaws in Agent A's output. Used for important outputs where pleasing or hallucination is a risk.
- Layer: 3 (Harness)
- Related: Maker-Checker, Specification Testing, Ensemble Consensus, Review Pattern

**Agent Authentication** — The system by which every agent operating within Ditto has a verified identity, scoped permissions, and known provenance. The foundation upon which governance rests.
- Layer: Cross-cutting
- Related: Governance Function, Trust Tier, Provenance

**Agent Card** — UI primitive (#10) showing an agent's name, role, processes served, runtime, cost, trust level, and performance trends. Can represent an AI agent, script, rules engine, or human.
- Layer: 6 (Human)
- Related: Delegate, Trust Control, Performance Sparkline, Process Card

**Agent Layer** — Architecture Layer 2. The workforce layer: capabilities, assignments, adapters, heartbeat execution, session management, and budget controls. Agents serve processes, not the other way around.
- Layer: 2 (Agent)
- Related: Adapter, Heartbeat, Session Persistence, Budget Controls

**Ditto** — The universal platform for non-technical people to define, monitor, review, and improve agent-operated processes across any business domain. Not an agent framework but a harness creator.
- Layer: Meta
- Related: Harness, Process, Human Layer

**ai_agent** — A step executor type where an AI model handles the step. Recommended for pattern matching, extraction, judgment, nuance, and creativity tasks where deterministic logic would be insufficient.
- Layer: 1 (Process)
- Related: Step Executor, Script, Rules, Human, Adapter

**antfarm** — A snarktank project providing YAML workflow definitions, SQLite state, cron-based polling, and independent verification agents. Core reference for Layers 1 and 3. Validates the maker-checker principle: "the developer doesn't mark their own homework."
- Layer: Infrastructure
- Related: Maker-Checker, Composition Over Invention, ralph, YAML

**APQC** — An industry standard framework cataloguing 12,000+ standard business processes. One of several frameworks (alongside ITIL, COBIT, ISO 9001) that Ditto uses as base knowledge. Users never see the framework identifiers directly.
- Layer: 1 (Process)
- Related: Capability Catalog, Industry Standards, Process Builder

**Approve** — A feedback action in the Review Queue indicating the output meets quality standards. Each approval contributes to trust earning data for the process.
- Layer: 6 (Human)
- Related: Edit, Reject, Escalate, Auto-approve, Feedback Widget, Trust Earning

**Auto-approve** — A Review Queue action where the human signals "stop asking me about outputs like this." Triggered by tapping "Auto-approve similar" after repeated approvals. This is how trust gets earned through the review interface, not through a settings page.
- Layer: 6 (Human)
- Related: Approve, Trust Earning, Review Queue, Spot-checked

**Autonomous** — A trust tier where the agent operates with exception-only human review. Requires a proven track record and stable inputs. Automatically downgrades if error rates spike.
- Layer: 3 (Harness)
- Related: Supervised, Spot-checked, Critical, Trust Tier, Trust Downgrade

**Autopilot (Dev Process)** — Two skills (`/drain-queue` and `/autobuild`) that automate dispatch through Ditto's seven-role dev pipeline. `/drain-queue` claims `**Status:** ready` briefs from `docs/briefs/` via atomic-push mutex on `origin/main` and runs `/autobuild` on each. `/autobuild` orchestrates `/dev-builder` (full role contract) → fresh-subagent `/dev-reviewer` → fresh-subagent `/dev-review` → PR open → feature-branch `**PR:** <url>` annotation. Stops at the human merge gate. Companion brief: Brief 188. Doctrine: ADR-035. Operational guide: `docs/dev-process.md` §Autopilot.
- Layer: Meta (dev-process)
- Related: Brief State Mutex, Dispatch-Authorization Trust Boundary, Maker-Checker, Dev Builder, Dev Reviewer

**Brief State Mutex** — The cross-workspace dispatch coordination primitive. Brief state lives in markdown bold-prefix lines (`**Status:** ready | draft | in_progress | complete`) inside the brief file. The atomic claim is a single-line edit pushed to `origin/main`; git's non-fast-forward push rejection is the mutex. Race-loss recovery via `git checkout -B claim-tmp origin/main`. No filename prefixes, no schemas, no external locks. See ADR-035 doctrine 1.
- Layer: Meta (dev-process)
- Related: Autopilot, Dispatch-Authorization Trust Boundary, ADR-035

**Dispatch-Authorization Trust Boundary** — Architectural trust surface orthogonal to the agent-execution trust tiers. Flipping a brief's `**Status:**` to `ready` IS the boundary that authorizes autonomous build via `/drain-queue`. Reviewers approving briefs for `ready` should treat the flip as code-execution authorization. The autopilot's pre-flight hard-stops cover DB-related risk only; everything else relies on the human at the gate. See ADR-035 doctrine 2 and `docs/architecture.md` §Cross-Cutting Governance.
- Layer: Cross-cutting
- Related: Autopilot, Brief State Mutex, Trust Tier, Maker-Checker

**Awareness Layer** — Architecture Layer 4. Cross-process intelligence through a dependency graph with event propagation. Processes declare what they consume and produce, creating a live graph of the organisation's data flow.
- Layer: 4 (Awareness)
- Related: Process Graph, Dependency Graph, Event Propagation, Process Layer

**Borrowing Strategy** — The approach of composing proven patterns from existing open-source projects rather than inventing from scratch. Codified in the architecture spec's borrowing table mapping needs to source projects.
- Layer: Meta
- Related: Composition Over Invention, Paperclip, ralph, antfarm, gstack, compound-product

**Budget Controls** — Per-agent and per-process cost tracking with soft alerts at 80% and hard stops at 100%. Borrowed from the Paperclip pattern.
- Layer: 2 (Agent)
- Related: Agent Layer, Paperclip, Agent Card

**Brief (Task Brief)** — A structured task specification that tells an agent (or a new session) exactly what to build. Tied to a roadmap goal. Contains: context, objective, non-goals, inputs, constraints, provenance, work products, boolean acceptance criteria, and review process. Template at `docs/briefs/000-template.md`. Provenance: Paperclip Goal→Issue→WorkProduct model, Rust RFC template (non-goals), antfarm AGENTS.md (constraints), compound-product (boolean criteria).
- Layer: Meta
- Related: Goal, Roadmap, Review Process, Acceptance Criteria

**Bug Hunter** — A specialised agent role in the coding team that performs bug and logic analysis as part of the Code Review process (Process 2, step 2).
- Layer: 2 (Agent)
- Related: Code Review, Convention Checker, Security Reviewer, Lead Reviewer

**Bug Investigation** — Process 4 in the coding agent team. Takes a bug report or failing test, reproduces, traces root cause, proposes a fix, and hands off to Feature Implementation for the actual code change.
- Layer: 1 (Process)
- Related: Debugger, Feature Implementation, Handoff

**Builder** — An agent role in the coding team responsible for implementing code. Based on the ralph autonomous loop pattern. Serves Feature Implementation (step 3) and Bug Investigation (step 5).
- Layer: 2 (Agent)
- Related: Planner, Reviewer, ralph, Feature Implementation

**Capability Catalog** — The model for Ditto's process library: a guided, evolving capability catalog (not an app store or raw templates). The platform acts as a consultant, recognising pain points and assembling capabilities into processes.
- Layer: 6 (Human)
- Related: APQC, Industry Standards, Process Builder, Conversation Thread

**Catalog (View)** — A per-process declaration of which UI components are available for rendered-view outputs. Catalogs are Zod-based: the same definition validates AI output, generates prompts, and produces JSON Schema (triple-duty contract). Trust tiers modulate catalog richness. Catalogs compose by spreading from a base. Pattern adopted from json-render (Vercel Labs). ADR-009 v2.
- Layer: 1 (Process), 6 (Human)
- Related: Output Schema, Output Viewer, Registry, Work Surface

**Capture** — One of the six human jobs. The question: "Here's something the system needs to know." Served primarily by the Quick Capture primitive.
- Layer: 6 (Human)
- Related: Quick Capture, Six Human Jobs, Capture View

**Capture View** — A view composition showing Quick Capture in full-screen mode. Optimised for mobile and on-the-go use.
- Layer: 6 (Human)
- Related: Quick Capture, View Compositions

**Claude Agent SDK** — The `@anthropic-ai/claude-code` npm package for programmatic Claude Code orchestration. Used as an adapter in the Agent Layer. Supports custom tools as MCP servers, hooks for intercepting tool use, and subagents.
- Layer: Infrastructure
- Related: Adapter, Agent Layer, MCP

**Code Review** — Process 2 in the coding agent team. Agents checking agents: convention compliance, bug/logic analysis, security scan, and synthesised review, all before human final review. Always at the Critical trust tier.
- Layer: 1 (Process)
- Related: Convention Checker, Bug Hunter, Security Reviewer, Lead Reviewer, Maker-Checker

**Codebase Self-Improvement** — Process 3 in the coding agent team. Scans for ecosystem changes, evaluates applicability, proposes improvements with evidence, and routes to human for decision. Always supervised. Weekly heartbeat.
- Layer: 1 (Process)
- Related: Scout, Evaluator, Proposer, Self-Improvement Meta-Process, compound-product

**Composition Over Invention** — A core principle: Ditto composes proven open-source projects rather than building from scratch. Every significant component starts with a research step. The unique value is in the harness, trust, governance, and learning layers.
- Layer: Meta
- Related: Borrowing Strategy, Research Before Design, antfarm, ralph, gstack, Paperclip

**Compound Effect** — The value proposition of Ditto over time: Week 1 you review everything; Week 8 most processes are spot-checked; Month 3 established processes are autonomous. The system gets better every week because the harness evolves from every human interaction.
- Layer: Meta
- Related: Trust Earning, Implicit Feedback, Learning Layer

**compound-product** — A snarktank project providing the reference pattern for the self-improvement cycle: analyse performance, identify priority, create PRD, execute, deliver PR. Reference for Layer 5 and the Self-Improvement Meta-Process.
- Layer: Infrastructure
- Related: Self-Improvement Meta-Process, Learning Layer, Scout

**Confidence Score** — A visible score on every Review Queue item indicating the agent's certainty about its output. The human learns to calibrate ("85% from this agent usually means one minor issue").
- Layer: 3 (Harness)
- Related: Review Queue, Output Viewer, Evidence Trail

**Convention Checker** — A specialised agent role in the coding team that checks code against established conventions and patterns (Process 2, step 1).
- Layer: 2 (Agent)
- Related: Code Review, Bug Hunter, Security Reviewer, Lead Reviewer

**Conversation Thread** — UI primitive (#8) for Explore Mode. A guided conversation (not a chatbot) that progressively builds a process definition in the adjacent Process Builder. The conversation is ephemeral; the structure it produces is permanent.
- Layer: 6 (Human)
- Related: Define, Process Builder, Explore Mode, Crystallisation, Setup View

**Correction Pattern** — A recurring type of human correction detected by the Feedback Widget across multiple reviews. When confirmed via "Teach this," becomes a permanent rule in the process's quality criteria.
- Layer: 5 (Learning)
- Related: Teach This, Feedback Widget, Implicit Feedback, Quality Criteria

**Critical** — A trust tier where every output receives full human review and the tier never auto-upgrades. Reserved for compliance, high-stakes, or regulated processes.
- Layer: 3 (Harness)
- Related: Supervised, Spot-checked, Autonomous, Trust Tier

**Credential Vault** — Encrypted per-process credential storage using AES-256-GCM with HKDF key derivation from `DITTO_VAULT_KEY`. Scoped by (processId, service) — one process cannot access another's credentials. Unified auth resolution (`resolveServiceAuth`) tries vault first, falls back to env vars with deprecation warning. CLI management: `ditto credential add/list/remove`. Provenance: ADR-005, Composio brokered credentials, Nango token lifecycle, Brief 035.
- Layer: 2 (Agent) / Integration
- Related: Integration Registry, resolveServiceAuth, ADR-005, Brokered Credentials

**Integration Generation** — CLI tool (`ditto generate-integration`) that auto-generates Ditto integration YAML files from OpenAPI 3.x specs. Parses the spec, resolves $refs, maps operations to tools (operationId→name, params→parameters, method→execute config), classifies tools as read-only/write, and emits YAML in the same format as hand-written integrations. The generated YAML is the starting point; the human curates (generate-then-curate pattern). First automated creation path for integrations (Insight-071, Insight-072). Provenance: Taskade/Neon/FastMCP codegen patterns, Brief 037.
- Layer: 2 (Agent) / Integration
- Related: Integration Registry, Credential Vault, ADR-005, Insight-071, Insight-072

**Crystallisation** — The transition from Explore Mode to Operate Mode, where a freeform conversation solidifies into a structured, repeatable process definition. The platform's signature moment.
- Layer: 6 (Human)
- Related: Explore Mode, Operate Mode, Conversation Thread, Process Builder

**Daily Brief** — UI primitive (#1) that synthesises priorities, risks, and reviews needed each morning. Personalised per role. Explains its reasoning ("Why this order"). Produced by the Project Orchestration process (Process 5).
- Layer: 6 (Human)
- Related: Orient, Home View, Project Orchestration, PM

**Data View** — UI primitive (#15) for tables, charts, comparisons, and trend lines. Domain-agnostic quantitative display. Any agent producing structured data renders through this. Supports annotations marking events for context.
- Layer: 6 (Human)
- Related: Decide, Performance Sparkline, Evidence Trail

**Debugger** — An agent role in the coding team responsible for reproducing bugs, tracing root causes, and proposing fixes. Serves Bug Investigation (steps 1-3).
- Layer: 2 (Agent)
- Related: Bug Investigation, Builder, Feature Implementation

**Decide** — One of the six human jobs. The question: "What should change?" Served by Improvement Card, Process Graph, Data View, and Evidence Trail.
- Layer: 6 (Human)
- Related: Improvement Card, Process Graph, Six Human Jobs

**Define** — One of the six human jobs. The question: "What needs to happen?" Served by Conversation Thread and Process Builder.
- Layer: 6 (Human)
- Related: Conversation Thread, Process Builder, Six Human Jobs, Explore Mode

**Delegate** — One of the six human jobs. The question: "Who/what should do it and how much do I trust them?" Served by Agent Card and Trust Control.
- Layer: 6 (Human)
- Related: Agent Card, Trust Control, Six Human Jobs

**Dev Architect** — A development meta-role responsible for designing solutions and producing briefs, ADRs, and architecture updates. Takes research findings as input and produces documents, never code. Skill: `/dev-architect`.
- Layer: Meta (Development Process)
- Related: Dev Researcher, Dev Builder, Brief, ADR, Dev Process

**Dev Builder** — A development meta-role responsible for implementing approved plans as code. Follows the brief precisely, runs automated quality checks before handoff. Must not redesign. Skill: `/dev-builder`.
- Layer: Meta (Development Process)
- Related: Dev Reviewer, Dev Architect, Brief, Quality Check Layering, Dev Process

**Dev Documenter** — A development meta-role responsible for updating project state after approved work. Updates `docs/state.md`, `docs/roadmap.md`, captures insights, runs retrospectives. Skill: `/dev-documenter`.
- Layer: Meta (Development Process)
- Related: Dev PM, State, Roadmap, Insight, Dev Process

**Dev PM** — A development meta-role responsible for triaging and sequencing work. Reads state and roadmap, identifies blockers, recommends next work. Must not design or build. Skill: `/dev-pm`.
- Layer: Meta (Development Process)
- Related: Dev Researcher, Dev Architect, State, Roadmap, Dev Process

**Dev Researcher** — A development meta-role responsible for finding existing solutions and patterns before design begins. Presents options neutrally without evaluating or recommending. Skill: `/dev-researcher`.
- Layer: Meta (Development Process)
- Related: Dev Architect, Composition Over Invention, Landscape, Provenance, Dev Process

**Dev Reviewer** — A development meta-role responsible for challenging work against the architecture specification. Operates with fresh context (maker-checker). Produces PASS/FLAG/FAIL reports. Must not fix problems. Skill: `/dev-reviewer`.
- Layer: Meta (Development Process)
- Related: Dev Builder, Maker-Checker, Review Checklist, Dev Process

**Dev Designer** — A development meta-role responsible for UX research and interaction specs. Thinks user-first (desirability → feasibility). Produces interaction specs that the Architect must address. Runs as a parallel track alongside the Researcher. Conditionally activated based on user-facing impact. Skill: `/dev-designer`. ADR-004.
- Layer: Meta (Development Process), L1 Process, L6 Human
- Related: Dev Researcher, Dev Architect, Human Layer, Six Human Jobs

**Dev Process** — The formalised development workflow for building Ditto. Seven meta-roles (PM, Designer, Researcher, Architect, Builder, Reviewer, Documenter) implemented as skills that constrain the AI agent's behaviour. The manual precursor to the automated harness. Reference: `docs/dev-process.md`.
- Layer: Meta
- Related: Dev PM, Dev Designer, Dev Researcher, Dev Architect, Dev Builder, Dev Reviewer, Dev Documenter, Dogfooding

**Deferred** — A roadmap status indicating a capability is intentionally postponed with an explicit re-entry condition (e.g., "Layer 4 re-enters when 2+ processes are running"). Prevents silent omission — every deferred item is acknowledged and tracked.
- Layer: Meta
- Related: Roadmap, Phase, Re-entry Condition

**Dogfooding** — The practice of using your own product to build and test it. Ditto dogfoods by using its own harness patterns (review loop, briefs, trust principles) to govern its own development. The coding agent team is the first dogfood — building Ditto using Ditto principles.
- Layer: Meta
- Related: Composition Over Invention, Review Checklist, Brief

**Dependency Graph** — The live graph created by processes declaring their inputs (sources) and outputs (destinations). Enables impact propagation, bottleneck detection, and cross-process intelligence.
- Layer: 4 (Awareness)
- Related: Awareness Layer, Process Graph, Event Propagation

**Edit** — A feedback action in the Review Queue where the human modifies agent output. The diff between original and edited output is captured structurally as implicit feedback, enabling correction pattern extraction.
- Layer: 6 (Human)
- Related: Approve, Reject, Implicit Feedback, Feedback Widget

**Ensemble Consensus** — A harness review pattern where multiple agents produce output independently, then results are compared for divergence. Used for critical and compliance scenarios.
- Layer: 3 (Harness)
- Related: Maker-Checker, Adversarial Review, Specification Testing, Review Pattern

**Escalate** — A feedback action in the Review Queue where the human flags an output as requiring higher-level attention or intervention beyond the current reviewer's scope.
- Layer: 6 (Human)
- Related: Approve, Edit, Reject, Review Queue

**Evaluator** — An agent role in the coding team that evaluates the applicability of scouted improvements. Serves the Codebase Self-Improvement process (Process 3, step 2).
- Layer: 2 (Agent)
- Related: Scout, Proposer, Self-Improvement Meta-Process

**Event Propagation** — The mechanism by which output from one process triggers notification and re-evaluation in dependent processes. When output changes materially, downstream processes react.
- Layer: 4 (Awareness)
- Related: Awareness Layer, Dependency Graph, Process Graph

**Evidence Trail** — UI primitive (#16) showing sources cited, confidence per claim, and links to original material. Attached to any research or analytical output. Per-claim confidence, not just overall.
- Layer: 6 (Human)
- Related: Decide, Data View, Output Viewer, Confidence Score

**Explore Mode** — One of Ditto's two coexisting modes. A conversational interface for discovery, refinement, debugging, and strategy. The metaphor is a conversation with a smart colleague. Explore crystallises into Operate.
- Layer: 6 (Human)
- Related: Operate Mode, Crystallisation, Conversation Thread, Process Builder

**Feature Implementation** — Process 1 in the coding agent team. The core build process: plan, human review, implement, test, self-review, human review, ship. Starts supervised, earns spot-checked per project.
- Layer: 1 (Process)
- Related: Planner, Builder, Reviewer, Code Review, Handoff

**Feedback Loop** — A required section of every process definition that specifies what is tracked (corrections, accuracy, speed, outcomes), how it is measured, and alert thresholds for degradation.
- Layer: 5 (Learning)
- Related: Learning Layer, Implicit Feedback, Quality Criteria, Performance Decay Detection

**Feedback Widget** — UI primitive (#7) embedded in review actions. Not a form. Edits ARE feedback, rejections ARE feedback. Captures structurally without asking the human to fill out anything. Includes the "Teach this" button for bridging feedback to permanent learning.
- Layer: 6 (Human)
- Related: Review, Implicit Feedback, Teach This, Correction Pattern

**Governance Function** — A dedicated agent or team providing cross-cutting governance and compliance assurance at individual, team, and organisation scope. Itself a process that runs within Ditto at the supervised or critical trust tier. Can surface findings and recommend actions but cannot modify processes or override trust tiers.
- Layer: Cross-cutting
- Related: Agent Authentication, Trust Tier, Harness Layer, Provenance

**gstack** — A project by Garry Tan providing 13 specialised agent roles via slash commands. Reference for Layers 2 and 3: role diversity validates Ditto's role-based system prompts.
- Layer: Infrastructure
- Related: Planner, Builder, Reviewer, Agent Roles, Composition Over Invention

**Handoff** — A step executor type where one process passes work to another process. Also a feedback type where the receiving process reports input quality.
- Layer: 1 (Process)
- Related: Step Executor, Process Layer, Bug Investigation, Feature Implementation

**Harness** — The core product of Ditto. Not an agent framework but the governance structure within which agents operate. Has two dimensions: evolving (learns from feedback, corrections, trust data) and orchestrating (coordinates agents, determines who checks whom, when to pause for humans).
- Layer: 3 (Harness)
- Related: Harness Layer, Trust Tier, Review Pattern, Governance Function

**Harness Layer** — Architecture Layer 3. Quality assurance through four review patterns, trust tiers, and escalation rules. Assigned per process based on criticality.
- Layer: 3 (Harness)
- Related: Maker-Checker, Adversarial Review, Specification Testing, Ensemble Consensus, Trust Tier

**Heartbeat** — The execution model borrowed from Paperclip: agents wake, execute, sleep. Not continuous. Cost-efficient with clean state boundaries. Configurable frequency (e.g., daily 6am, weekly, on-event).
- Layer: 2 (Agent)
- Related: Adapter, Paperclip, Agent Layer, Session Persistence

**Home View** — A view composition combining Daily Brief, Review Queue (top 5), and Quick Capture. The "what should I be doing" view that opens every morning.
- Layer: 6 (Human)
- Related: Daily Brief, Review Queue, Quick Capture, View Compositions

**Human** — A step executor type where the step requires human judgment, relationships, creativity, or final approval. The platform explicitly recommends human steps where appropriate rather than forcing everything through AI.
- Layer: 1 (Process)
- Related: Step Executor, ai_agent, Script, Rules

**Human Layer** — Architecture Layer 6. The interface layer with two faces: Explore Mode (conversational, for discovery and setup) and Operate Mode (structured dashboards, for daily use). Built from 16 universal UI primitives.
- Layer: 6 (Human)
- Related: Explore Mode, Operate Mode, UI Primitives, Six Human Jobs

**Implicit Feedback** — A core principle: feedback is captured from natural human actions (edits, corrections, approvals, rejections) rather than explicit forms. "Edits ARE feedback." The system extracts correction patterns from diffs, tracks downstream acceptance, and monitors outcome quality.
- Layer: 5 (Learning)
- Related: Feedback Widget, Teach This, Correction Pattern, Learning Layer

**Improvement Card** — UI primitive (#13) surfaced by the Learning Layer when degradation is detected. Shows diagnosis, evidence, suggested fix, predicted impact, and confidence level. Always a human decision: apply, modify, dismiss, or discuss.
- Layer: 6 (Human)
- Related: Decide, Learning Layer, Self-Improvement Meta-Process, Improvements View

**Improvements View** — A view composition showing Improvement Cards alongside performance trends. Used by process owners and analysts to review and decide on proposed changes.
- Layer: 6 (Human)
- Related: Improvement Card, View Compositions, Performance Sparkline

**Industry Standards** — Frameworks like APQC, ITIL, COBIT, and ISO 9001 that serve as base knowledge for process templates. Users never see the framework identifiers; they see natural-language descriptions of recognised patterns.
- Layer: 1 (Process)
- Related: APQC, Capability Catalog, Process Builder

**Insight** — A design discovery that emerges during building. More than a decision (ADR) but not yet an architecture change. Insights are provisional principles that stage in `docs/insights/` until mature enough to absorb into the architecture spec or become an ADR. Each insight is one file, following the pattern of ADRs and briefs. Template: `docs/insights/000-template.md`.
- Layer: Meta
- Related: ADR, Architecture, Dev Process, Dev Documenter

**Inngest** — A step-based durable execution engine (Go server, TypeScript SDK) considered as infrastructure. Event-driven triggers, AgentKit for multi-agent networks. Deferred to when durable execution at scale is needed.
- Layer: Infrastructure
- Related: Trigger.dev, Mastra, Temporal

**Lead Reviewer** — A specialised agent role in the coding team that synthesises the outputs of all review agents into a coherent review (Process 2, step 4).
- Layer: 2 (Agent)
- Related: Code Review, Convention Checker, Bug Hunter, Security Reviewer

**Learning Layer** — Architecture Layer 5. Self-healing through three feedback signals: output quality, process efficiency, and outcome impact. Detects degradation, diagnoses patterns, proposes improvements, and verifies fixes. Never auto-fixes; always surfaces, diagnoses, and suggests.
- Layer: 5 (Learning)
- Related: Feedback Loop, Implicit Feedback, Improvement Card, Self-Improvement Meta-Process

**Maker-Checker** — A harness review pattern where Agent A produces output and Agent B reviews it against the specification. The standard pattern for most processes. The core principle: "the developer doesn't mark their own homework."
- Layer: 3 (Harness)
- Related: Adversarial Review, Specification Testing, Ensemble Consensus, antfarm

**Metacognitive Check** — A harness handler that performs a fast, post-execution self-review of an agent's output against its input. Checks for unsupported assumptions, missing edge cases, scope creep, and contradictions. This is the *internal* oversight loop (same role's lens), complementary to review patterns which provide *external* oversight (second perspective). Auto-enabled for supervised and critical trust tiers; opt-in for others via `harness.metacognitive: true`. Issues flag for human review; does not re-execute. Must justify its place via benchmarks (Insight-064).
- Layer: 3 (Harness)
- Related: Review Patterns, Maker-Checker, Trust Tiers, Insight-063, Brief 034b

**Mastra** — A TypeScript graph-based workflow engine with suspend/resume for human-in-the-loop. Considered as a potential workflow/harness foundation for Layers 1-3, but deferred due to being monolithic with paid enterprise features.
- Layer: Infrastructure
- Related: Inngest, Trigger.dev, Temporal

**Model Hint** — An optional `config.model_hint` field on `ai-agent` process steps that declares the model capability needed (`fast`, `capable`, `default`). `resolveModel()` maps hints to provider-specific models. Steps without hints use the deployment default. Provenance: Vercel AI SDK `customProvider` alias pattern.
- Layer: 2 (Agent)
- Related: Model Recommendation, LLM Provider Abstraction

**Model Recommendation** — An advisory suggestion generated by `generateModelRecommendations()` from accumulated step run data (20+ runs). Compares models by approval rate and cost per (process, step). The Self surfaces recommendations; the human decides. No auto-switching. Provenance: RouteLLM economics, trust earning pattern applied to model selection.
- Layer: 5 (Learning)
- Related: Model Hint, Trust Earning

**Non-Goals** — An explicit section in a brief or ADR stating what the work does NOT cover. Prevents scope creep — especially critical for agents, which default to over-solving. Provenance: Rust RFC template, Google design docs.
- Layer: Meta
- Related: Brief, Constraints, ADR

**Operate Mode** — One of Ditto's two coexisting modes. A structured dashboard interface for daily use, monitoring, reviewing, and deciding. No conversation needed — just status, actions, and decisions. The metaphor is a factory floor with dashboards.
- Layer: 6 (Human)
- Related: Explore Mode, Crystallisation, Review Queue, Process Card

**Orient** — One of the six human jobs. The question: "What's going on and what needs my attention?" Served by Daily Brief, Process Card, Activity Feed, and Performance Sparkline.
- Layer: 6 (Human)
- Related: Daily Brief, Process Card, Activity Feed, Six Human Jobs

**Outcome Impact** — One of three feedback signals tracked by the Learning Layer. Measures whether a process is achieving its business purpose, using KPIs defined during process setup.
- Layer: 5 (Learning)
- Related: Output Quality, Process Efficiency, Learning Layer, Feedback Loop

**Output Quality** — One of three feedback signals tracked by the Learning Layer. Measures whether outputs meet quality criteria through human corrections, downstream rejection rates, and metric checks.
- Layer: 5 (Learning)
- Related: Outcome Impact, Process Efficiency, Learning Layer, Quality Criteria

**Output Destination Type** — One of five types that describe where a process output goes and Ditto's relationship to it: `data` (stays in Ditto, passes to next process), `view` (rendered on the work surface), `document` (exported/attached), `integration` (fired to external system via integration registry), `external` (produced artifact that leaves Ditto entirely, tracked as pointer). Defined in ADR-009 v2.
- Layer: 1 (Process)
- Related: Output Schema, Output Viewer, Work Surface

**Output Schema** — A declaration in a process definition specifying what the process produces: output name, destination type, shape (Zod for data/view, MIME for document, service for integration), lifecycle (static or dynamic), and destination. Output schemas are contracts — process A's output schema is process B's input contract. Validated at sync time. ADR-009 v2.
- Layer: 1 (Process)
- Related: Output Destination Type, Process Definition, Catalog

**Output Viewer** — UI primitive (#6) that renders process outputs on the work surface. Six presentation types within the view catalog: text (with diff), data (table with flags), visual (preview + annotation), code (syntax highlighted), action (confirmation log), decision (reasoning trace). Presentation types are distinct from the five output destination types (ADR-009 v2). Every interaction within the viewer IS feedback.
- Layer: 6 (Human)
- Related: Review, Review Queue, Feedback Widget, Output Schema, Catalog, Work Surface

**Paperclip** — A major source project (28.1k stars). Provides the heartbeat execution model, adapter interface, budget controls, org structure, governance patterns, and immutable audit log. The primary reference for Layer 2.
- Layer: Infrastructure
- Related: Heartbeat, Adapter, Budget Controls, Composition Over Invention

**Phase** — A numbered stage in the Ditto roadmap (`docs/roadmap.md`). Each phase has an objective, deliverables, and status. Phases are sequenced by dependency: Phase 0 (Scaffolding) → Phase 1 (Storage) → Phase 2 (Harness) → etc. The roadmap supersedes the original 4-phase plan in architecture.md.
- Layer: Meta
- Related: Roadmap, Brief, Deferred, Re-entry Condition

**Performance Decay Detection** — The Learning Layer's ability to detect when a process is degrading over time. Triggers diagnosis, pattern identification, and improvement proposals.
- Layer: 5 (Learning)
- Related: Learning Layer, Improvement Card, Feedback Loop

**Performance Sparkline** — UI primitive (#4) providing a tiny trend line attachable to anything measurable. Shows direction arrow and colour coding. Appears inside Process Cards, Agent Cards, Daily Brief, and Improvement Cards. Clicking opens the Data View.
- Layer: 6 (Human)
- Related: Orient, Data View, Process Card, Agent Card

**Plan Before Build** — A principle: slow down and define the framework thoroughly before building agents. The coding team is a testbed, not the goal.
- Layer: Meta
- Related: Research Before Design, Composition Over Invention

**Planner** — An agent role in the coding team responsible for planning the approach to feature implementation. Based on gstack's `/plan-eng-review` pattern. Serves Feature Implementation (step 1).
- Layer: 2 (Agent)
- Related: Builder, Reviewer, gstack, Feature Implementation

**PM** — An agent role serving Project Orchestration (Process 5). Assesses current state across projects, identifies ready/blocked/at-risk items, recommends priorities with reasoning, and produces the Daily Brief.
- Layer: 2 (Agent)
- Related: Project Orchestration, Daily Brief, Process Graph

**Process** — The atomic unit of Ditto. Inputs, transformation, outputs, with known sources and known destinations. Not a workflow — a governance declaration that specifies what inputs are acceptable, what value looks like, what quality gates apply, what trust level governs execution, and what outputs matter. Agents are pluggable; processes are durable.
- Layer: 1 (Process)
- Related: Process Layer, Process-as-Primitive, Process Builder, Step Executor

**Process Builder** — UI primitive (#9) providing a structured editor for process definitions. Populated by conversation (via Conversation Thread) or edited directly. Universal structure: inputs, steps, outputs, quality criteria, review pattern, trust level, feedback loop.
- Layer: 6 (Human)
- Related: Define, Conversation Thread, Process, Setup View

**Process Card** — UI primitive (#2) showing a process's name, status, health, trust tier, last run, trend, and next scheduled run. Works at glance level (in a grid) or expanded (full detail with activity feed, sparklines, trust control).
- Layer: 6 (Human)
- Related: Orient, Process Graph, Trust Control, Activity Feed

**Process Definition** — The persistent, structured specification of a process: inputs, steps, outputs, quality criteria, feedback loop, trust level, and review pattern. Persists independent of agents — swap the agent, the process stays.
- Layer: 1 (Process)
- Related: Process, Process Builder, Process Layer

**Process Detail View** — A view composition showing Process Card (expanded), Activity Feed, Performance Sparklines, and Trust Control. Used by process owners for deep inspection of a single process.
- Layer: 6 (Human)
- Related: Process Card, View Compositions, Trust Control

**Process Efficiency** — One of three feedback signals tracked by the Learning Layer. Measures whether a process is getting faster, cheaper, and more reliable: execution time, token cost, error rate, human intervention rate.
- Layer: 5 (Learning)
- Related: Output Quality, Outcome Impact, Learning Layer

**Process Graph** — UI primitive (#14) providing a live map of process dependencies. Each node is a Process Card, colour-coded by health. Shows data flow, bottlenecks, and impact propagation. How a non-technical person understands their business as a system.
- Layer: 6 (Human)
- Related: Decide, Awareness Layer, Dependency Graph, Process Card

**Process I/O** — The mechanism by which processes connect to external systems at their boundaries (distinct from agent tool use, which happens inside a step's reasoning loop). Two directions: **source** (polling-based trigger that checks an external service and creates work items) and **output delivery** (sending approved process outputs to an external destination after the trust gate passes). Implemented in `src/engine/process-io.ts`. Provenance: standard polling pattern, Nango actions pattern, ADR-005, Brief 036.
- Layer: 1 (Process) / Integration
- Related: Integration Infrastructure, Credential Vault, Heartbeat, Trust Gate, Output Delivery, Trigger

**Process Layer** — Architecture Layer 1. The foundation: industry standard templates, organisational variations, input/output definitions, quality criteria, and step decomposition. The process definition is the atomic unit.
- Layer: 1 (Process)
- Related: Process, Industry Standards, Quality Criteria, Step Executor

**Process-as-Primitive** — The core thesis that the atomic unit of Ditto is the process — not a task, not an agent, not a workflow. Processes are how businesses think about work. This framing is original to Ditto.
- Layer: Meta
- Related: Process, Harness, Ditto

**Processes View** — A view composition showing Process Cards in grid or list format with a toggle to Process Graph. Used by process owners and managers for an overview of all processes.
- Layer: 6 (Human)
- Related: Process Card, Process Graph, View Compositions

**Progressive Disclosure** — A UX principle ("the boiling frog"): setup should never overwhelm the user. One question at a time, show the structure being built alongside the conversation, start with what the user knows and expand outward. The AI fills in defaults from industry knowledge.
- Layer: 6 (Human)
- Related: Conversation Thread, Process Builder, Capability Catalog

**Progressive Trust** — The model where trust is earned per process through track record, not configured by a settings toggle. Start conservative (supervised), earn autonomy through consistent quality. Original to Ditto.
- Layer: 3 (Harness)
- Related: Trust Tier, Trust Earning, Trust Downgrade, Compound Effect

**Project Orchestration** — Process 5 in the coding agent team (a meta-process). Scans all process states, git activity, briefs, captures, and deadlines. Produces the Daily Brief and priority recommendations. Runs on a daily heartbeat.
- Layer: 1 (Process)
- Related: PM, Daily Brief, Process Graph, Meta-Process

**Proposer** — An agent role in the coding team that formulates improvement proposals with evidence. Serves the Codebase Self-Improvement process (Process 3, step 3).
- Layer: 2 (Agent)
- Related: Scout, Evaluator, Self-Improvement Meta-Process

**Provenance** — The tracked origin of an agent: was it registered by an authorised human? By another trusted agent? Part of agent authentication, ensuring governance has a verifiable chain of identity.
- Layer: Cross-cutting
- Related: Agent Authentication, Governance Function

**QA** — An agent role in the coding team responsible for running tests and type-checks. Based on gstack's `/qa` pattern. Serves Feature Implementation (step 4) and Bug Investigation (step 1).
- Layer: 2 (Agent)
- Related: Builder, Reviewer, Feature Implementation, Bug Investigation

**Quality Criteria** — Measurable standards defined in every process that specify what "good output" looks like. Includes both original criteria and learned rules (from "Teach this" interactions). The basis for specification testing and health scoring.
- Layer: 1 (Process)
- Related: Process Definition, Specification Testing, Teach This, Output Quality

**Quick Capture** — UI primitive (#12) providing always-accessible, frictionless input via text, voice, files, links, or photos. Context-aware, auto-classifies, and routes to the appropriate project and process. The "Trojan horse feature" — if frictionless, all context flows through the platform.
- Layer: 6 (Human)
- Related: Capture, Capture View, Home View

**ralph** — A snarktank project providing the autonomous implementation loop pattern: fresh context per iteration, three-tier state (git history, progress.txt, prd.json), and progress tracking. Core reference for Layer 2 execution.
- Layer: Infrastructure
- Related: Builder, Composition Over Invention, antfarm

**Re-entry Condition** — The specific trigger that brings a deferred roadmap item back into active planning. Examples: "Layer 4 re-enters when 2+ processes are running", "Layer 5 re-enters when 50+ feedback records exist." Prevents deferred items from being forgotten.
- Layer: Meta
- Related: Deferred, Roadmap, Phase

**Reject** — A feedback action in the Review Queue indicating the output does not meet standards and should be redone. Captured structurally as feedback to improve future runs.
- Layer: 6 (Human)
- Related: Approve, Edit, Escalate, Feedback Widget

**Research Before Design** — A principle: every significant build decision must start with scouting the gold standard. Never skip the research step. Evaluate what exists, adopt or adapt the best available, only write custom code for genuine gaps.
- Layer: Meta
- Related: Composition Over Invention, Borrowing Strategy, Landscape Analysis

**Review Checklist** — An 8-item checklist used to review every piece of work against the Ditto architecture. Items: layer alignment, provenance, composition check, spec compliance, trust model, feedback capture, simplicity, roadmap freshness. The harness on our own build process. Located at `docs/review-checklist.md`. Provenance: Paperclip `.agents/skills/pr-report/SKILL.md`.
- Layer: Meta
- Related: Review Process, Harness, Dogfooding

**Review** — One of the six human jobs. The question: "Is this output right?" Served by Review Queue, Output Viewer, and Feedback Widget. The primary daily activity for most users.
- Layer: 6 (Human)
- Related: Review Queue, Output Viewer, Feedback Widget, Six Human Jobs

**Review Pattern** — One of four configurable patterns assigned per process in the Harness Layer: Maker-Checker, Adversarial Review, Specification Testing, or Ensemble Consensus. Selected based on process criticality.
- Layer: 3 (Harness)
- Related: Maker-Checker, Adversarial Review, Specification Testing, Ensemble Consensus

**Review Queue** — UI primitive (#5) and the single most important UI element in Ditto. All agent outputs waiting for human decision flow through this queue. Universal interaction: review then approve, edit, reject, or escalate. Includes "Auto-approve similar" for trust building.
- Layer: 6 (Human)
- Related: Review, Output Viewer, Feedback Widget, Auto-approve, Review View

**Review View** — A view composition showing the full Review Queue, Output Viewer, and Feedback Widget. The primary workspace for anyone reviewing agent output.
- Layer: 6 (Human)
- Related: Review Queue, Output Viewer, Feedback Widget, View Compositions

**Reviewer** — An agent role in the coding team responsible for reviewing code against conventions and quality standards. Based on gstack's `/review` and antfarm's verifier pattern. Serves Code Review (all steps).
- Layer: 2 (Agent)
- Related: Builder, Code Review, Convention Checker, antfarm, gstack

**Roadmap** — The complete capability map for Ditto (`docs/roadmap.md`). Every item traces back to architecture.md, human-layer.md, or landscape.md. Tracks status per capability: not started, in progress, done, or deferred (with re-entry condition). The current source of truth for build sequencing, superseding architecture.md's original 4-phase plan.
- Layer: Meta
- Related: Phase, Brief, State, Deferred, Re-entry Condition

**Rules** — A step executor type where deterministic logic or a rules engine handles the step. Recommended over AI when the transformation is pattern-based with clear conditions (e.g., match invoice amount to PO amount).
- Layer: 1 (Process)
- Related: Step Executor, Script, ai_agent, Human

**Scout** — An agent role in the coding team that scans for relevant improvements in the ecosystem (new models, tools, patterns, libraries). Serves Codebase Self-Improvement (Process 3, step 1). Based on compound-product's analyser.
- Layer: 2 (Agent)
- Related: Evaluator, Proposer, Self-Improvement Meta-Process, compound-product

**Script** — A step executor type for deterministic code, ETL, or data transformation steps. Recommended over AI when the logic is well-defined and repeatable (e.g., format data for an API).
- Layer: 1 (Process)
- Related: Step Executor, Rules, ai_agent, Human

**Security Reviewer** — A specialised agent role in the coding team that performs security scanning as part of the Code Review process (Process 2, step 3).
- Layer: 2 (Agent)
- Related: Code Review, Convention Checker, Bug Hunter, Lead Reviewer

**Self-Improvement Meta-Process** — A built-in process that every agent team runs: review performance trends, scan for better approaches, analyse correction patterns, propose improvements with evidence, route to human for approval. Baked into the platform, not bolted on. Always supervised.
- Layer: 5 (Learning)
- Related: Learning Layer, Improvement Card, compound-product, Codebase Self-Improvement

**Session Persistence** — Resumable sessions across heartbeats for context continuity. Allows agents to maintain context even though they operate in a wake-execute-sleep cycle.
- Layer: 2 (Agent)
- Related: Heartbeat, Agent Layer

**Setup View** — A view composition combining Conversation Thread and Process Builder in a dual-pane layout. Where new processes are born through guided conversation.
- Layer: 6 (Human)
- Related: Conversation Thread, Process Builder, View Compositions, Explore Mode

**Six Human Jobs** — The universal framework for all UI decisions: Orient, Review, Define, Delegate, Capture, Decide. If a UI element does not clearly serve one of these six jobs, it does not belong. Regardless of domain, role, or industry.
- Layer: 6 (Human)
- Related: Orient, Review, Define, Delegate, Capture, Decide

**Specification Testing** — A harness review pattern where a validation agent checks output against defined quality criteria. Used for established processes with well-defined standards.
- Layer: 3 (Harness)
- Related: Maker-Checker, Adversarial Review, Ensemble Consensus, Quality Criteria

**Spot-checked** — A trust tier where the human reviews approximately 20% of outputs (sample-based). Requires a sustained low correction rate. The middle ground between full oversight and full autonomy.
- Layer: 3 (Harness)
- Related: Supervised, Autonomous, Critical, Trust Tier

**Step Executor** — The type of runtime assigned to each step in a process definition. Five types: ai_agent, script, rules, human, and handoff. The platform recommends the right type per step — not everything should be an AI agent.
- Layer: 1 (Process)
- Related: ai_agent, Script, Rules, Human, Handoff, Process Definition

**Supervised** — A trust tier where the human reviews every output. The default starting tier for new processes. Earns upgrade after consistent quality over N runs.
- Layer: 3 (Harness)
- Related: Spot-checked, Autonomous, Critical, Trust Tier, Trust Earning

**System Analyst** — A role (initially human, eventually AI meta-agent) that guides non-technical users through process discovery and setup. The AI system analyst itself follows the trust tier model: starts supervised, earns autonomy.
- Layer: 6 (Human)
- Related: Conversation Thread, Process Builder, Capability Catalog, Progressive Trust

**Teach This** — A one-tap button in the Feedback Widget that bridges a detected correction pattern into a permanent learning rule. The correction is extracted as a rule, added to quality criteria, included in future agent context, and validated by specification testing.
- Layer: 5 (Learning)
- Related: Feedback Widget, Implicit Feedback, Correction Pattern, Quality Criteria

**Team View** — A view composition showing Agent Cards, Performance Sparklines, and cost summary. Used by managers for a workforce-level overview.
- Layer: 6 (Human)
- Related: Agent Card, Performance Sparkline, View Compositions

**Trigger.dev** — A TypeScript workflow engine purpose-built for AI agent workflows. Durable execution with no timeouts. Waitpoint tokens for human-in-the-loop. Considered as a Layer 2 alternative, deferred to scale phase.
- Layer: Infrastructure
- Related: Inngest, Mastra, Temporal

**Trust Control** — UI primitive (#11) providing a visible, adjustable dial per process showing current trust tier, how it was earned, what changes if adjusted, auto-downgrade triggers, and system recommendations for upgrades. The human can always override.
- Layer: 6 (Human)
- Related: Delegate, Trust Tier, Progressive Trust, Process Card

**Trust Downgrade** — The automatic reduction of a process's trust tier when error rate exceeds threshold, human correction rate spikes, downstream processes report issues, or process inputs change significantly. Trust can be lost automatically but not gained automatically.
- Layer: 3 (Harness)
- Related: Trust Tier, Trust Earning, Progressive Trust

**Trust Earning** — The mechanism by which processes move from lower to higher trust tiers based on tracked data: approval rates, correction rates, downstream acceptance, and run consistency. The system recommends upgrades; the human decides.
- Layer: 3 (Harness)
- Related: Trust Tier, Trust Downgrade, Progressive Trust, Auto-approve

**Trust Tier** — The level of human oversight assigned to a process. Four tiers: Supervised (review everything), Spot-checked (review ~20%), Autonomous (exceptions only), Critical (always full review, never auto-upgrades). Configured per process, earned over time.
- Layer: 3 (Harness)
- Related: Supervised, Spot-checked, Autonomous, Critical, Trust Control

**WAL Mode (Write-Ahead Logging)** — A SQLite performance optimisation where writes go to a separate log before being merged into the main database file. Enables concurrent reads during writes. Used by antfarm and adopted for Ditto's SQLite storage. Enabled via `db.pragma('journal_mode = WAL')`.
- Layer: Infrastructure
- Related: SQLite, better-sqlite3, antfarm

**UI Primitives** — The 16 composable, domain-agnostic components that assemble into any view in Ditto. The same primitives serve marketing, finance, real estate, coding, or any other domain. Original to Ditto.
- Layer: 6 (Human)
- Related: View Compositions, Six Human Jobs, Human Layer

**View Compositions** — The eight standard assemblies of UI primitives: Home, Review, Processes, Process Detail, Setup, Team, Improvements, and Capture. Each composition serves a specific user need by combining relevant primitives.
- Layer: 6 (Human)
- Related: UI Primitives, Home View, Review View, Setup View

**Work Surface** — The primary gravitational center of the Ditto app. Where running processes, their current state, and their outputs live. Not a dashboard reporting on work — it IS the work: living, interactive, evolving. Process outputs (static and dynamic) manifest here. Distinct from the conversation surface, which is where the user and the Self align, decide, and steer. Insight-067, ADR-009 v2.
- Layer: 6 (Human)
- Related: Output Viewer, Conversation Surface, Output Schema, Conversational Self

---

## Terms added 2026-04-16 (drift batch)

The following terms are additions from Briefs 072-074, 099a-c, 102-103, 108, 115-118, 143, 151-154, and Insights 153 / 180 / 184. Next maintenance pass should fold them into alphabetical order.

### Three-Layer Persona Architecture (Insight-153)

**User Agent** — The user's branded agent, one per user. Does direct selling, marketing, and outreach in the user's voice. Two gears: Gear 1 (digital acquisition — content, social, SEO) and Gear 2 (direct outreach — sales calls, DMs, email). Scoped to a single user's commercial activity. Contrast with Alex/Mira (network connectors, never sell).
- Layer: 2 (Agent), persona
- Related: Persona Layer, Operator, Gear, Alex / Mira

**Persona Layer** — One of three presentation layers: Ditto (firm/chief of staff), Alex/Mira (senior advisors, network connectors), User Agent (user-branded seller). Each layer has a different scope of authority and trust posture. Scaling property: Alex/Mira are shared across users; each User Agent is user-scoped.
- Layer: 2 (Agent)
- Related: User Agent, Operator, Three-Layer Persona Architecture

**Operator (process field)** — The persona layer that runs a process. Declared on `ProcessDefinition.operator`. Cognitive mode resolver uses operator + processId + persona guard to select the mode file (`cognitive/modes/{connecting,nurturing,selling,chief-of-staff}.md`). Selling mode is blocked for `alex-or-mira` operators.
- Layer: 1 (Process)
- Related: User Agent, Persona Layer, Cognitive Mode

**Gear** — A User Agent posture. Gear 1 is digital acquisition (content creation, social publishing, SEO). Gear 2 is direct outreach (sales calls, DMs, email). A single User Agent runs both gears across different processes.
- Layer: 2 (Agent)
- Related: User Agent, GTM Pipeline

### Surface-Aware Self (Brief 099)

**Inbound Session** — A session scoped to email-based conversation with the Self. `sessionSurfaceValues` includes `"inbound"`. Scoped separately from workspace sessions (`ne(surface, "inbound")` filter) to prevent cross-contamination. 24-hour timeout (vs 30-minute workspace) for async email continuity.
- Layer: 2 (Agent)
- Related: Conversational Self, selfConverse, Surface

**notifyUser** — `notifyUser({ userId, body, urgent? })` — channel-aware outbound delivery. Calls `resolveChannel(userId)` → returns `"email"` or `"workspace"`. Workspace delivery via SSE with email fallback. Urgent flag always sends email regardless of channel. Three-layer throttle (caller gating + 1h minimum gap + 5/day cap). `lastNotifiedAt` on `networkUsers` is the single source of truth for "when did Alex last email this user."
- Layer: 2 (Agent)
- Related: resolveChannel, workspaceSuggestedAt, ComplexitySignals

**resolveChannel** — Returns `"email"` for users in `active` state, `"workspace"` for users in `workspace` state. The channel selector underneath `notifyUser`. Brief 099c added the workspace case on top of the original email-only path.
- Layer: 2 (Agent)
- Related: notifyUser, Workspace Graduation

**Relationship Pulse** — Proactive relationship building module. Runs as step 4 of `pulseTick()`. Per active user, assembles a context snapshot and asks an LLM (via proactive composition, not selfConverse) whether to reach out. Can decline. Early-relationship bias (first 7 days). 4h minimum gap (tightened from 24h in Brief 151). Coordinates with status-composer to avoid double-notify.
- Layer: 2 (Agent)
- Related: Pulse, Status Composer, Proactive Composition

**Proactive Composition** — Composition pattern for outbound messages via direct `createCompletion(...)` with the cognitive core prompt — no session, no tools, no delegation. Contrast with conversational composition (full `selfConverse()` pipeline). Used by relationship-pulse, status-composer. Reason: proactive outreach must not pollute session history.
- Layer: 2 (Agent)
- Related: Conversational Composition, Relationship Pulse, Status Composer

**ComplexitySignals** — Four signals tracked per user to identify workspace-readiness: concurrent active processes (≥3), batch reviews (≥2), correction frequency (≥3), `wantsVisibility` flag. When 2+ signals are met and `workspaceSuggestedAt` is null, Alex weaves a one-time workspace suggestion into proactive outreach.
- Layer: 2 (Agent) / Learning
- Related: Workspace Graduation, workspaceSuggestedAt

**workspaceSuggestedAt** — Timestamp on `networkUsers`. Set once when Alex suggests a workspace. Never cleared. Prevents nag.
- Layer: 2 (Agent), schema
- Related: ComplexitySignals, Workspace Graduation

### Interactive Blocks + Composition (Briefs 072, 073, 074)

**InteractiveField** — Field definition for interactive ContentBlocks. `type: "text" | "select" | "number" | "toggle"` with label, placeholder, options, required flag. Used by WorkItemFormBlock, ConnectionSetupBlock, and interactive-mode ProcessProposalBlock.
- Layer: 1 (Process) / 6 (Human)
- Related: WorkItemFormBlock, ConnectionSetupBlock, FormSubmitAction

**WorkItemFormBlock** — ContentBlock for in-conversation work item creation. Fields (title, description, etc.) are InteractiveFields. Submit routes via form-submit action namespace.
- Layer: 6 (Human)
- Related: InteractiveField, FormSubmitAction, create_work_item

**ConnectionSetupBlock** — ContentBlock for in-conversation integration connection setup (e.g., "Connect GitHub"). Fields are InteractiveFields for the credential handshake. Submit routes via form-submit action namespace.
- Layer: 6 (Human) / Integration
- Related: InteractiveField, FormSubmitAction, connect_service

**FormSubmitAction** — Action type for form-submit routing on interactive blocks. Validated via block-type-scoped registry tokens (Brief 072 Reviewer F1 fix — no action-registry bypass). Routes through `handleSurfaceAction` to block-specific handlers.
- Layer: 6 (Human)
- Related: InteractiveField, WorkItemFormBlock, ConnectionSetupBlock, handleSurfaceAction

**goalHeartbeatLoop** — `goalHeartbeatLoop(goalId, trustOverrides?)` — continuous goal orchestration. Loops decomposeGoal → routeDecomposedTasks → fullHeartbeat per task → checkAndResumeGoal. Auto-resume after `approve_review()` on child runs. Status tracks completed/paused/failed/pending.
- Layer: 2 (Agent)
- Related: orchestrator, matchTaskToProcess, pauseGoal, resumeGoal

**matchTaskToProcess** — Routing function in `router.ts`. Returns `{ processSlug, confidence }` via slug exact match (confidence 1.0) or keyword match (word-boundary regex, token overlap). Confidence ≥ 0.6 auto-routes; below → `waiting_human`.
- Layer: 2 (Agent)
- Related: router, goalHeartbeatLoop

**pauseGoal / resumeGoal** — Self tools (pause_goal is the 20th tool). Pause sets goal status to paused; heartbeat loop stops. Resume restarts the loop from the current dependency-ordered position.
- Layer: 2 (Agent), Self tools
- Related: goalHeartbeatLoop, start_pipeline

**intentContext** — Context injected into `selfConverseStream()` when the user starts a conversation from a specific sidebar destination. Rendered into the system prompt as `<intent_context>`. One Self, context-aware per intent.
- Layer: 6 (Human)
- Related: Composition Intent, selfConverseStream

### Goal Decomposition + Action Boundaries (Brief 102)

**DimensionMap** — Six-dimension clarity assessment: outcome, assets, constraints, context, infrastructure, risk_tolerance. `assessClarity()` evaluates via heuristic signal matching. `isDecompositionReady()` gates on outcome dimension. Vague dimensions trigger clarifying questions before decomposition.
- Layer: 2 (Agent)
- Related: GoalDecomposition, Goal Framing

**GoalDecomposition** — Engine primitive (`packages/core/src/goal-decomposition.ts`) — `SubGoal`, `GoalPhase`, `GoalDecompositionResult` discriminated union. Sub-goals tagged `find` (existing process matches) or `build` (requires new process). Optional phase grouping when >8 sub-goals.
- Layer: 1 (Process), engine primitive
- Related: DimensionMap, orchestrator, Find-or-Build Routing

**ActionBoundary / ActionContext** — System-enforced tool sets keyed by state. Three contexts: `front_door` (research-only), `workspace` (full tools), `workspace_budgeted` (workspace + budget ledger). `determineActionContext(state)` derives from workspace/session state, not from prompts. Prevents prompt-based privilege escalation.
- Layer: 2 (Agent)
- Related: Tool Resolver, System-enforced boundaries

**SubGoalRouting** — Three-tier routing performed by `routeSubGoal()`: (1) Process Model Library → (2) existing process match → (3) Build meta-process. Each sub-goal routed independently.
- Layer: 2 (Agent)
- Related: Find-or-Build Routing, ProcessModelMatch, triggerBuild

### Find-or-Build Routing (Brief 103)

**ProcessModelMatch** — Match result from `findProcessModel()` against published process models. Keyword-based scoring. Preferred over live process match when model library has a better fit.
- Layer: 2 (Agent)
- Related: Process Model Library, library-curation

**GoalTrust** — Effective trust tier for a sub-goal = more restrictive of goal trust and process trust. `resolveSubGoalTrust()` enforces. Critical tier and builder/reviewer roles cannot be relaxed. Parent trust inherited via `parentTrustTier` on `delayedRuns` and chain-spawned runs.
- Layer: 3 (Harness)
- Related: Trust Tier, SubGoalRouting

**BuildResult** — Output of `triggerBuild()` — research → generate → save → first-run validate. Generated processes start `draft`, promote to `active` on successful first run, archive on failure (max 1 retry). Build depth enforced via explicit counter.
- Layer: 2 (Agent)
- Related: Build Meta-Process, Find-or-Build Routing

**BundledReview** — Review at phase boundaries (all-find complete, or all-build complete in a dependency tier), not per-step. `collectForBundledReview()` + `isReviewBoundary()` + `presentBundledReview()`. Individual approve/edit/reject per sub-goal output within the bundle.
- Layer: 3 (Harness)
- Related: review-pattern, Find-or-Build Routing

**RoutingPath** — The chosen tier for a sub-goal (`model | find | build`). Logged on the decision with cost category (free/cheap/expensive) for observability.
- Layer: 2 (Agent)
- Related: SubGoalRouting, Cost Observability

### Operating Cycle Archetype (Briefs 115-118, Insight-168)

**OperatingCycle** — A long-running process archetype for continuous operation. Seven phases: SENSE → ASSESS → ACT → GATE → LAND → LEARN → BRIEF. Lives in `processes/cycles/` with `callable_as: cycle`. Spawns sub-process runs per iteration via `executor: sub-process`.
- Layer: 1 (Process) / 2 (Agent)
- Related: Sub-Process Executor, Cycle Briefing, sendingIdentity

**SendingIdentity** — Identity-aware delivery: `principal` (Alex sends as Alex → always AgentMail) or `user` (Alex sends on user's behalf → Gmail API when connected, AgentMail fallback). Declared at process or step level; identity-router handler resolves before execution. Legacy `agent-of-user` and `ghost` collapse into `user` per Brief 152.
- Layer: 2 (Agent)
- Related: Channel Resolver, Identity Router, Ghost Mode

**AudienceClassification** — Post-execution result of the broadcast-direct-classifier: `broadcast` or `direct`. Deterministic from configurable audience-size lookup. Forces critical tier when `broadcast`.
- Layer: 3 (Harness)
- Related: broadcast-direct-classifier, Broadcast Forcing

**VoiceModel** — Structured voice capture (tone, diction, patterns, samples). Loaded by the voice-calibration handler when sending identity is user-scoped. Persisted as a `voice_model` memory type.
- Layer: 2 (Agent)
- Related: voice-calibration, SendingIdentity

**TrustOverride (step-category)** — `stepDefinition.trustOverride` relaxes trust within the process tier bounds. Relaxation-only (supervised → spot_checked). Builder/reviewer roles and critical-tier steps cannot be relaxed. Enables fine-grained trust on cycle internal steps.
- Layer: 3 (Harness)
- Related: Trust Tier, Session Trust Override

**BroadcastForcing** — Security invariant. When `audienceClassification === "broadcast"`, the trust gate forces critical tier — absolute precedence, cannot be overridden by session trust, goal trust, or step-category overrides.
- Layer: 3 (Harness)
- Related: AudienceClassification, broadcast-direct-classifier

**OutboundQualityRule** — Configurable house value rule evaluated by the outbound-quality-gate. Non-bypassable (`alwaysRun: true`). Runs per-draft for staged actions.
- Layer: 3 (Harness)
- Related: outbound-quality-gate, OutboundActionRecord, StagedOutboundAction

**OutboundActionRecord** — Structured record of an outbound action (email, DM, broadcast, social post). Persisted in `outboundActions` table. Used by the quality gate for per-draft evaluation and by Insight-184 dedup logic.
- Layer: 3 (Harness), schema
- Related: outbound-quality-gate, OutboundQualityRule

### Admin Oversight (Brief 108)

**adminFeedback** — Table storing admin-scoped guidance for Alex. Memory-assembly surfaces entries as context when Self operates on behalf of a user. Admin corrects Alex without touching the user's trust state.
- Layer: 2 (Agent) / Admin
- Related: pausedAt, notifyAdmin, Admin Oversight

**pausedAt** — Column on `networkUsers`. When non-null, status-composer and relationship-pulse skip the user. Admin pause/resume mechanism.
- Layer: 2 (Agent), schema
- Related: pauseUserProcesses, resumeUserProcesses

**notifyAdmin / notifyAdminOfDowngrade** — Fire-and-forget email to `ADMIN_EMAIL` on trust downgrades and critical events. Resolves Insight-160's "who reviews on downgrade?" open question: the Ditto team, via `/admin/users/[userId]`.
- Layer: 2 (Agent) / Admin
- Related: Trust Downgrade, Insight-160

**sendAsAlex** — Admin composes an email via `sendAndRecord()` with `personaId: "alex"`. Activity logged as admin-sent (`actorType: "admin"`). Does not modify user trust state.
- Layer: 2 (Agent) / Admin
- Related: sendAndRecord, adminFeedback

### Session Trust Override (Brief 053)

**Session Trust Override** — In-memory store keyed by `runId`. `start_pipeline` can carry `sessionTrust` overrides for a specific run. Relaxation-only, never tighten. Auto-cleared on run-complete/run-failed. The Self's "just let this run without checking every step" mechanism.
- Layer: 3 (Harness)
- Related: Trust Tier, start_pipeline, TrustOverride (step-category)

### Step-Run Invocation Guard (Insight-180)

**Step-Run Guard** — Functions that produce external side effects (social publishing, payments, webhooks, `sendAndRecord`) must require a `stepRunId` parameter as proof the call originates from within harness pipeline step execution. Programmatic guard — the function rejects calls without a valid step-run context (except in test mode).
- Layer: 2 (Agent) / Cross-cutting
- Related: Invocation Guard, Tool Resolver, stepRunId

### Projects + Runner Registry (Brief 215)

**Project** — Workspace-scoped row in `projects`: a code repo Ditto can dispatch work to. Carries slug, github_repo, harness_type, default+fallback runner, optional runner_chain, status, deploy_target, runnerBearerHash. `processes.projectId` FKs into this. One user, n projects.
- Layer: 1 (Process)
- Related: Project Status, Harness Type, Runner Kind, Brief 224 onboarding

**Runner** — Work-item-level dispatch primitive that hands a whole work item to an external execution surface. Sibling to step.executor; runners sit ABOVE the step loop. Each runner has a kind, mode, and `RunnerAdapter` contract: `{ execute, status, cancel, healthCheck }`.
- Layer: 3 (Harness)
- Related: Step Executor, Adapter, Brief 214 cloud runners phase

**Runner Kind** — One of `local-mac-mini | claude-code-routine | claude-managed-agent | github-action | e2b-sandbox`. Each kind ships its own adapter (sub-briefs 216-218) and config schema. The kind determines the mode.
- Layer: 3 (Harness)
- Related: Runner Mode, RunnerAdapter

**Runner Mode** — `local | cloud`. Pre-computed from kind via `kindToMode()`. Filters the chain when work-item `mode_required` is set (`local`, `cloud`, or `any`).
- Layer: 3 (Harness)
- Related: Mode-Required Constraint, Runner Chain

**Runner Chain** — Ordered list of runner kinds the dispatcher walks for a work item. Built from `[default, fallback]` or the project's explicit `runner_chain` JSON, prepended with the work-item override. Filtered by mode + enabled + healthy. On `failed`/`rate_limited`/`timed_out` the dispatcher advances to the next kind.
- Layer: 3 (Harness)
- Related: resolveChain, Mode-Required Constraint

**Runner Dispatch** — One row in `runner_dispatches` per chain attempt. Lifecycle: `queued → dispatched → running → {succeeded | failed | timed_out | rate_limited | cancelled | revoked}`. FK'd to workItem, project, stepRunId. `attemptIndex` distinguishes primary vs fallbacks.
- Layer: 3 (Harness)
- Related: Runner Chain, harness_decisions, Insight-180

**Mode-Required Constraint** — Optional column on workItems (`runner_mode_required`: `local | cloud | any`). Soft constraint filtering the chain. `any` (or null) imposes no constraint. Set when a work item must run on/off the user's machine for a specific reason.
- Layer: 1 (Process)
- Related: Runner Mode, resolveChain

**Fallback Runner** — `projects.fallbackRunnerKind`. The simple-chain alternative when only default + fallback are needed. Overridden when `runnerChain` JSON is present.
- Layer: 1 (Process)
- Related: Runner Chain, Default Runner

**Harness Type** — `projects.harnessType`: `catalyst | native | none`. `catalyst` = Catalyst-built repo (Ditto-driven external project). `native` = Ditto's own codebase. `none` = the BEFORE-flow case where no harness scaffolding exists yet (Brief 224 territory).
- Layer: 1 (Process)
- Related: Project, Brief 224 onboarding

**Brief Source** — `projects.briefSource`: `filesystem | ditto_native | github_issues`. Where the project's brief artefacts live; the analyser pass uses this to find work to dispatch.
- Layer: 1 (Process)
- Related: Project, Brief 224 onboarding

**Deploy Target** — `projects.deployTarget`: `vercel | fly | manual`. The deploy surface the deploy-gate (sub-brief 220) wires up.
- Layer: 1 (Process)
- Related: Project, Brief 220 deploy-gate

**Project Status** — `projects.status`: `analysing | active | paused | archived`. New rows default to `analysing` (Brief 224 BEFORE-flow). Transition `analysing → active` requires `defaultRunnerKind` set + an enabled `project_runners` row for that kind. Archive is one-way.
- Layer: 1 (Process)
- Related: validateStatusTransition (engine-core), Project

### Projects CRUD + Brief-Equivalent WorkItems (Brief 223)

**Project Slug** — `projects.slug`. Lowercase `[a-z][a-z0-9-]{1,63}` URL-safe identifier. The CRUD endpoints accept either id or slug at `:id` route segment. Unique per workspace.
- Layer: 1 (Process)
- Related: Project, /api/v1/projects/:id

**Runner Config** — Per-(project × runner-kind) JSON shape stored on `project_runners.config_json`. Validated by each adapter's `RunnerAdapter.configSchema`. The `POST /api/v1/projects` convenience accepts an optional `runnerConfig: { kind, config, credentialIds }` and inserts the first `project_runners` row in the same transaction.
- Layer: 3 (Harness) / 1 (Process API)
- Related: Project Runner, RunnerAdapter

**Runner Bearer** — Per-project plaintext token surfaced ONCE on `POST /api/v1/projects` and on `PATCH …/projects/:id { rotateBearer: true }` with `bearerOnceWarning: true`. bcrypt(cost=12) hashed at rest in `projects.runnerBearerHash` (column landed by Brief 215, populated by Brief 223). Used for inbound webhook auth (Authorization: Bearer …). Rotation writes an `activities` row with `actorType='admin-cookie'` for forensic auditability.
- Layer: 1 (Process API)
- Related: Status Webhook, Insight-017 security checklist

**Bearer-Once Warning** — Response shape on bearer-issuing endpoints: `{ project, bearerToken, bearerOnceWarning: true }`. Subsequent `GET /api/v1/projects/:id` does NOT return the bearer (only the hash). The plaintext is the caller's only chance to capture.
- Layer: 1 (Process API)
- Related: Runner Bearer

**Brief State** — `work_items.briefState`: `backlog | approved | active | review | shipped | blocked | archived`. Project-flavored work-item lifecycle, coexisting with the existing `status` field (`intake | routed | …`) on the same table. Partitioned by `projectId` via DB-level CHECK constraint: non-project rows can never hold a `briefState`; project rows must declare `projectId`.
- Layer: 1 (Process)
- Related: WorkItem, Status Webhook

**Status Webhook** — `POST /api/v1/work-items/:id/status`. Bearer-token gated against `projects.runnerBearerHash` of the work item's project (long-lived) OR `runner_dispatches.callback_token_hash` of an active dispatch (per-dispatch ephemeral, Brief 216). Updates `briefState`, `stateChangedAt`, optionally `linkedProcessRunId`. Bridges `runner_dispatches` lifecycle when `runnerKind` + `externalRunId` provided. Writes `activities` row with `action='work_item_status_update'` and `metadata.webhook.bearerSource ∈ {ephemeral, project}`. Insight-180 bounded waiver: missing `stepRunId` is allowed but recorded as `metadata.webhook.guardWaived = true`.
- Layer: 1 (Process API)
- Related: Brief State, Insight-180, Runner Dispatch, Ephemeral Callback Token

### Cloud Execution — Routine Dispatcher (Brief 216)

**Routine** — Anthropic's Claude Code Routines research-preview feature. A persistent, web-fired Claude Code session triggered via `POST https://api.anthropic.com/v1/claude_code/routines/{trigger_id}/fire` with bearer + `experimental-cc-routine-2026-04-01` beta header. Returns `{claude_code_session_id, claude_code_session_url}` synchronously; terminal state is back-channeled via in-prompt callback (Ditto's status webhook) plus GitHub fallback events on PR / workflow_run / deployment_status.
- Layer: 3 (Harness — runner)
- Related: Routine Trigger, Ephemeral Callback Token, Default Review Path

**Routine Trigger** — The HTTP-fireable handle to a Routine, identified by a `trigger_id` segment in the `/fire` endpoint URL. Created in Anthropic's web UI; the URL + bearer are pasted into Ditto's `/projects/[slug]/runners` form. One trigger = one runner = one project_runners row of kind `claude-code-routine`.
- Layer: 3 (Harness — runner config)
- Related: Routine

**Ephemeral Callback Token** — Per-dispatch random token generated by the Routine adapter at execute() entry. bcrypt-hashed (cost 12) into `runner_dispatches.callback_token_hash`; plaintext appears only in the prompt sent to Anthropic for the duration of the dispatch and is forgotten by Ditto immediately after. The status webhook accepts EITHER the long-lived `projects.runnerBearerHash` (for non-prompt-composing runners) OR this ephemeral token (for prompt-composing runners). Token capability is strictly less than the project bearer: it can post one status update for one specific dispatch.
- Layer: 3 (Harness — security)
- Related: Routine, Status Webhook

**Default Review Path** — Brief 214 §D11 discipline: every cloud runner's prompt invokes the `/dev-review` skill in-session and posts its output as a PR comment. The Routine adapter is the first runner where this is implemented. Catalyst projects rely on `.catalyst/skills/dev-review/SKILL.md` in the cloned repo; native projects inline the skill text from Ditto's deployed binary (capped at 4 KB per Brief 216 §D7). No optional review integrations (Greptile / Argos) — Brief 219 owns those.
- Layer: 3 (Harness — review)
- Related: Routine, dev-review skill

**Vercel Preview URL Inline Card** — The conversation-surface card emitted when a `deployment_status` event with `state==="success"` and a non-production `environment` arrives on a routine-configured repo. Detection rule (Brief 216 §D5): `state === "success" && environment !== "Production" && environment !== project.deployTargetEnvironment`. Vendor-agnostic — Vercel "Preview", Netlify "deploy-preview", custom-staging all surface as previews. Production deploys are no-op here (Brief 220 owns the deploy-gate state machine).
- Layer: 3 (Harness — observability) / Layer 6 (Human — conversation surface)
- Related: Routine, Default Review Path

### Cloud Execution — Managed Agents Dispatcher (Brief 217)

**Managed Agent** — Anthropic's Managed Agents beta product. A persistent, container-based agent execution service (Agent + Environment + Session + Events). Sibling cloud runner to Routines with a different fit envelope: Routines are fire-and-forget; Managed Agents earn complexity when work needs steering, structured tool confirmations, or rubric-graded outcomes. Auth via `x-api-key` + `anthropic-beta: managed-agents-2026-04-01`.
- Layer: 3 (Harness — runner)
- Related: Managed Agents Session, Polling-Primary Status, Cloud Runner Prompt Composer

**Managed Agents Session** — A running instance of a Managed Agent, identified by an Anthropic-issued `session_id`. Created per dispatch via `POST /v1/sessions`; first work kicked off via `POST /v1/sessions/{id}/events` with a `user.message` event. Lifecycle: `idle | running | rescheduling | terminated`. Lifecycle observed via the polling cron (`GET /v1/sessions/{id}` + recent events) and the GitHub fallback handler. Best-effort archive on terminal state via `POST /v1/sessions/{id}/archive`.
- Layer: 3 (Harness — runner)
- Related: Managed Agent, Terminal-State Heuristic

**Polling-Primary Status** — Brief 217 §D2 status discipline. Anthropic's Managed Agents API does NOT ship a native completion event for "agent finished its assigned work"; the polling cron at `src/engine/runner-poll-cron.ts` walks non-terminal `claude-managed-agent` dispatches every 30 seconds (per `pollCadenceMs` in `@ditto/core`) and applies the terminal-state heuristic. Distinct from Brief 216's Routines, which are GitHub-events-only. The optional in-prompt callback path (`callback_mode='in-prompt'`) is OFF by default.
- Layer: 3 (Harness — runner)
- Related: Managed Agents Session, Terminal-State Heuristic, Cross-Runner Poll Cron

**Terminal-State Heuristic** — Brief 217 §D2 7-row table mapping (session.status, last events, time since dispatch) onto `runner_dispatches.status`. Conservative: `terminated→failed`; `running/rescheduling→running`; `idle + agent.message + idle for >threshold→succeeded`; `idle + agent.error→failed/rate_limited/timed_out` per error pattern; `idle + pending agent.tool_use→running` (no auto-fail at MVP — steering surface absent); `idle + dispatch grace not elapsed→running`. Ambiguous idle stays `running` until either GitHub PR-merged event arrives (authoritative success) or staleness sweeper marks dispatch orphaned. Configurable via `MANAGED_AGENT_TERMINAL_IDLE_THRESHOLD_MS` + `MANAGED_AGENT_DISPATCH_GRACE_MS`.
- Layer: 3 (Harness — runner)
- Related: Polling-Primary Status, Cross-Runner Poll Cron

**Cross-Runner Poll Cron** — `src/engine/runner-poll-cron.ts`. Periodic worker that walks non-terminal `runner_dispatches` rows for kinds registered in `pollCadenceMs` (engine-core), calls each row's adapter `status()` per its kind cadence, and persists state transitions via the shared state machine. Currently registers only `claude-managed-agent` at 30s; routines stay GitHub-events-only per Brief 216 design. Adapter throws are isolated per-row. Boot-side `startRunnerPollCron()` wires from `instrumentation.ts`.
- Layer: 3 (Harness — runner)
- Related: Polling-Primary Status, Terminal-State Heuristic

**Cloud Runner Prompt Composer** — `src/adapters/cloud-runner-prompt.ts`. Kind-agnostic prompt composition shared by `claude-code-routine` (Brief 216) and `claude-managed-agent` (Brief 217). Renamed from `routine-prompt.ts` per Brief 217 §D14 coordination. Sections: work-item body (always), `/dev-review` directive (always; for native projects skill text inlined at 4 KB cap), optional INTERNAL callback section (only when `ephemeralToken` is supplied; the runner_kind literal is parametrized so the receiving session sends the correct kind label back).
- Layer: 3 (Harness — runner shared)
- Related: Managed Agent, Routine, Default Review Path

**Optional In-Prompt Callback** — Brief 217 §D3 mode (`callback_mode='in-prompt'`, OFF by default). When enabled, the managed-agent adapter generates a per-dispatch ephemeral token (bcrypt cost 12 hash on `runner_dispatches.callback_token_hash`, plaintext only in the prompt sent to Anthropic), and the composed prompt's INTERNAL section instructs the session to POST status back to Ditto's webhook on terminal state. Default `polling` mode skips this entirely. Reuses Brief 216's column without schema additions.
- Layer: 3 (Harness — security)
- Related: Managed Agent, Polling-Primary Status, Ephemeral Callback Token

### Project Onboarding — Connection-as-Process (Brief 225)

**Project Kind** — `projects.kind`: `'build' | 'track'` (default `'build'`). `'build'` projects are connected to a repo and managed by Ditto's runner pipeline; `'track'` projects are passively monitored (manual-entry flow, future brief). Brief 225's onboarding flow creates `'build'`-kind projects only. Schema-side enum at `packages/core/src/db/schema.ts:projectKindValues`.
- Layer: 1 (Process — substrate)
- Related: Onboarding Run, Connection Form

**Onboarding Run** — A `process_runs` row whose `processId` resolves to `processes/project-onboarding.yaml` (slug `project-onboarding`). Triggered by `POST /api/v1/projects` with `kickOffOnboarding: true`. Walks two placeholder steps (`clone-and-scan` no-op + `surface-report` writes the report stub); sub-brief #2 fills the steps in. The run drives the chat-col surface at `/projects/:slug/onboarding`.
- Layer: 1 (Process — system process) / Layer 6 (Human — chat-col surface)
- Related: Project Kind, Connection Form, Default Review Path

**Connection Form** — The URL-paste form rendered by reusing the existing `ConnectionSetupBlock` ContentBlock with `serviceName: 'github-project'`. The block's existing `connectionStatus` state machine (`disconnected | connecting | connected | error`) is wired to the URL-probe. Per Designer spec §Stage 0, both the conversational entry path (Self emits the block) and the sidebar entry path ("Connect a project" CTA seeds a Self message) converge on the same conversation-embedded form. NOT a separate `/projects/new` route — the block renders inline in the chat-col.
- Layer: 6 (Human — chat-col surface)
- Related: Project Kind, Onboarding Run, ConnectionSetupBlock

## Workspace Local Bridge (Brief 212)

**Bridge Daemon** — `ditto-bridge`, the outbound-dial worker that runs on the user's laptop / Mac mini. Connects out to a cloud-hosted Ditto workspace via WebSocket. Transport only — no agent code runs on user hardware. Lives in `packages/bridge-cli/`.
- Layer: 6 (Human / harness extension)
- Related: Bridge Pairing Code, Device JWT, Bridge Dispatch

**Bridge Pairing Code** — A 6-character base32 code (Crockford-style alphabet, ≥30 bits entropy) shown once in the Devices admin page. 15-minute TTL, single-use, atomically consumed, bcrypt cost-12 hashed at rest. Daemon exchanges the code for a Device JWT via `POST /api/v1/bridge/pair`.
- Layer: 6 (Human / pairing UX)
- Related: Bridge Daemon, Device JWT

**Device JWT** — HS256-signed token (key: `BRIDGE_JWT_SIGNING_KEY` env, ≥16 chars). Carries `{ deviceId, workspaceId, protocolVersion: "1.0.0" }`. Persisted on the device at `~/.ditto/bridge.json` mode 0600. Verified on every WebSocket upgrade. Major-version mismatches reject HTTP 426. Revocable via `DELETE /api/v1/bridge/devices/[id]`.
- Layer: 6 / Layer 3 (Harness)
- Related: Bridge Pairing Code, Bridge Daemon

**Bridge Dispatch** — `dispatchBridgeJob()` in `src/engine/harness-handlers/bridge-dispatch.ts`. Cloud-side function that resolves the target device (with optional fallback chain), persists a `bridge_jobs` row, sends the JSON-RPC `exec` or `tmux.send` request over the wire if trust says advance, and writes one `harness_decisions` row keyed on stepRunId per Insight-180. Callable from process YAML via the `bridge.dispatch` built-in tool.
- Layer: 3 (Harness)
- Related: Bridge Job, stepRunId guard (Insight-180)

**Bridge Job** — A row in `bridge_jobs`. State machine: `queued | dispatched | running | succeeded | failed | orphaned | cancelled | revoked`. Discriminated payload by `kind: 'exec' | 'tmux.send'`. Records the actual executor in `deviceId` and (when fallback routing kicked in) the originally-requested primary in `requestedDeviceId`. Audit trail in `harness_decisions.reviewDetails.bridge`.
- Layer: 3 (Harness)
- Related: Bridge Dispatch, Orphaned Job

**Orphaned Job** — A `bridge_jobs` row that was `running` but whose `lastHeartbeatAt` exceeded `ORPHAN_STALENESS_MS` (10 min). Transitioned to `orphaned` by the cloud-side staleness sweeper. Writes a `harness_decisions` row with `trustAction='pause'` + `reviewDetails.bridge.orphaned=true` so the review surface knows to flag it for human attention. The pause action is the existing-enum signal, NOT a new "escalate" value.
- Layer: 3 (Harness)
- Related: Bridge Job, Sweeper
