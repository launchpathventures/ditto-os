# Agent OS Glossary

The canonical reference for every key term, concept, and component in Agent OS. This is the shared vocabulary for the entire project. Entries are alphabetical. Each entry includes its definition within the Agent OS context, the architecture layer it belongs to, and related terms.

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

**Agent Authentication** — The system by which every agent operating within Agent OS has a verified identity, scoped permissions, and known provenance. The foundation upon which governance rests.
- Layer: Cross-cutting
- Related: Governance Function, Trust Tier, Provenance

**Agent Card** — UI primitive (#10) showing an agent's name, role, processes served, runtime, cost, trust level, and performance trends. Can represent an AI agent, script, rules engine, or human.
- Layer: 6 (Human)
- Related: Delegate, Trust Control, Performance Sparkline, Process Card

**Agent Layer** — Architecture Layer 2. The workforce layer: capabilities, assignments, adapters, heartbeat execution, session management, and budget controls. Agents serve processes, not the other way around.
- Layer: 2 (Agent)
- Related: Adapter, Heartbeat, Session Persistence, Budget Controls

**Agent OS** — The universal platform for non-technical people to define, monitor, review, and improve agent-operated processes across any business domain. Not an agent framework but a harness creator.
- Layer: Meta
- Related: Harness, Process, Human Layer

**ai_agent** — A step executor type where an AI model handles the step. Recommended for pattern matching, extraction, judgment, nuance, and creativity tasks where deterministic logic would be insufficient.
- Layer: 1 (Process)
- Related: Step Executor, Script, Rules, Human, Adapter

**antfarm** — A snarktank project providing YAML workflow definitions, SQLite state, cron-based polling, and independent verification agents. Core reference for Layers 1 and 3. Validates the maker-checker principle: "the developer doesn't mark their own homework."
- Layer: Infrastructure
- Related: Maker-Checker, Composition Over Invention, ralph, YAML

**APQC** — An industry standard framework cataloguing 12,000+ standard business processes. One of several frameworks (alongside ITIL, COBIT, ISO 9001) that Agent OS uses as base knowledge. Users never see the framework identifiers directly.
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

**Capability Catalog** — The model for Agent OS's process library: a guided, evolving capability catalog (not an app store or raw templates). The platform acts as a consultant, recognising pain points and assembling capabilities into processes.
- Layer: 6 (Human)
- Related: APQC, Industry Standards, Process Builder, Conversation Thread

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

**Composition Over Invention** — A core principle: Agent OS composes proven open-source projects rather than building from scratch. Every significant component starts with a research step. The unique value is in the harness, trust, governance, and learning layers.
- Layer: Meta
- Related: Borrowing Strategy, Research Before Design, antfarm, ralph, gstack, Paperclip

**Compound Effect** — The value proposition of Agent OS over time: Week 1 you review everything; Week 8 most processes are spot-checked; Month 3 established processes are autonomous. The system gets better every week because the harness evolves from every human interaction.
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

**Dev Process** — The formalised development workflow for building Agent OS. Seven meta-roles (PM, Designer, Researcher, Architect, Builder, Reviewer, Documenter) implemented as skills that constrain the AI agent's behaviour. The manual precursor to the automated harness. Reference: `docs/dev-process.md`.
- Layer: Meta
- Related: Dev PM, Dev Designer, Dev Researcher, Dev Architect, Dev Builder, Dev Reviewer, Dev Documenter, Dogfooding

**Deferred** — A roadmap status indicating a capability is intentionally postponed with an explicit re-entry condition (e.g., "Layer 4 re-enters when 2+ processes are running"). Prevents silent omission — every deferred item is acknowledged and tracked.
- Layer: Meta
- Related: Roadmap, Phase, Re-entry Condition

**Dogfooding** — The practice of using your own product to build and test it. Agent OS dogfoods by using its own harness patterns (review loop, briefs, trust principles) to govern its own development. The coding agent team is the first dogfood — building Agent OS using Agent OS principles.
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

**Explore Mode** — One of Agent OS's two coexisting modes. A conversational interface for discovery, refinement, debugging, and strategy. The metaphor is a conversation with a smart colleague. Explore crystallises into Operate.
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

**Governance Function** — A dedicated agent or team providing cross-cutting governance and compliance assurance at individual, team, and organisation scope. Itself a process that runs within Agent OS at the supervised or critical trust tier. Can surface findings and recommend actions but cannot modify processes or override trust tiers.
- Layer: Cross-cutting
- Related: Agent Authentication, Trust Tier, Harness Layer, Provenance

**gstack** — A project by Garry Tan providing 13 specialised agent roles via slash commands. Reference for Layers 2 and 3: role diversity validates Agent OS's role-based system prompts.
- Layer: Infrastructure
- Related: Planner, Builder, Reviewer, Agent Roles, Composition Over Invention

**Handoff** — A step executor type where one process passes work to another process. Also a feedback type where the receiving process reports input quality.
- Layer: 1 (Process)
- Related: Step Executor, Process Layer, Bug Investigation, Feature Implementation

**Harness** — The core product of Agent OS. Not an agent framework but the governance structure within which agents operate. Has two dimensions: evolving (learns from feedback, corrections, trust data) and orchestrating (coordinates agents, determines who checks whom, when to pause for humans).
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

**Mastra** — A TypeScript graph-based workflow engine with suspend/resume for human-in-the-loop. Considered as a potential workflow/harness foundation for Layers 1-3, but deferred due to being monolithic with paid enterprise features.
- Layer: Infrastructure
- Related: Inngest, Trigger.dev, Temporal

**Non-Goals** — An explicit section in a brief or ADR stating what the work does NOT cover. Prevents scope creep — especially critical for agents, which default to over-solving. Provenance: Rust RFC template, Google design docs.
- Layer: Meta
- Related: Brief, Constraints, ADR

**Operate Mode** — One of Agent OS's two coexisting modes. A structured dashboard interface for daily use, monitoring, reviewing, and deciding. No conversation needed — just status, actions, and decisions. The metaphor is a factory floor with dashboards.
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

**Output Viewer** — UI primitive (#6) that universally renders any output type: text (with diff), data (table with flags), visual (preview + annotation), code (syntax highlighted), action (confirmation log), decision (reasoning trace). Every interaction within the viewer IS feedback.
- Layer: 6 (Human)
- Related: Review, Review Queue, Feedback Widget

**Paperclip** — A major source project (28.1k stars). Provides the heartbeat execution model, adapter interface, budget controls, org structure, governance patterns, and immutable audit log. The primary reference for Layer 2.
- Layer: Infrastructure
- Related: Heartbeat, Adapter, Budget Controls, Composition Over Invention

**Phase** — A numbered stage in the Agent OS roadmap (`docs/roadmap.md`). Each phase has an objective, deliverables, and status. Phases are sequenced by dependency: Phase 0 (Scaffolding) → Phase 1 (Storage) → Phase 2 (Harness) → etc. The roadmap supersedes the original 4-phase plan in architecture.md.
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

**Process** — The atomic unit of Agent OS. Inputs, transformation, outputs, with known sources and known destinations. Not a workflow — a governance declaration that specifies what inputs are acceptable, what value looks like, what quality gates apply, what trust level governs execution, and what outputs matter. Agents are pluggable; processes are durable.
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

**Process Layer** — Architecture Layer 1. The foundation: industry standard templates, organisational variations, input/output definitions, quality criteria, and step decomposition. The process definition is the atomic unit.
- Layer: 1 (Process)
- Related: Process, Industry Standards, Quality Criteria, Step Executor

**Process-as-Primitive** — The core thesis that the atomic unit of Agent OS is the process — not a task, not an agent, not a workflow. Processes are how businesses think about work. This framing is original to Agent OS.
- Layer: Meta
- Related: Process, Harness, Agent OS

**Processes View** — A view composition showing Process Cards in grid or list format with a toggle to Process Graph. Used by process owners and managers for an overview of all processes.
- Layer: 6 (Human)
- Related: Process Card, Process Graph, View Compositions

**Progressive Disclosure** — A UX principle ("the boiling frog"): setup should never overwhelm the user. One question at a time, show the structure being built alongside the conversation, start with what the user knows and expand outward. The AI fills in defaults from industry knowledge.
- Layer: 6 (Human)
- Related: Conversation Thread, Process Builder, Capability Catalog

**Progressive Trust** — The model where trust is earned per process through track record, not configured by a settings toggle. Start conservative (supervised), earn autonomy through consistent quality. Original to Agent OS.
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

**Review Checklist** — An 8-item checklist used to review every piece of work against the Agent OS architecture. Items: layer alignment, provenance, composition check, spec compliance, trust model, feedback capture, simplicity, roadmap freshness. The harness on our own build process. Located at `docs/review-checklist.md`. Provenance: Paperclip `.agents/skills/pr-report/SKILL.md`.
- Layer: Meta
- Related: Review Process, Harness, Dogfooding

**Review** — One of the six human jobs. The question: "Is this output right?" Served by Review Queue, Output Viewer, and Feedback Widget. The primary daily activity for most users.
- Layer: 6 (Human)
- Related: Review Queue, Output Viewer, Feedback Widget, Six Human Jobs

**Review Pattern** — One of four configurable patterns assigned per process in the Harness Layer: Maker-Checker, Adversarial Review, Specification Testing, or Ensemble Consensus. Selected based on process criticality.
- Layer: 3 (Harness)
- Related: Maker-Checker, Adversarial Review, Specification Testing, Ensemble Consensus

**Review Queue** — UI primitive (#5) and the single most important UI element in Agent OS. All agent outputs waiting for human decision flow through this queue. Universal interaction: review then approve, edit, reject, or escalate. Includes "Auto-approve similar" for trust building.
- Layer: 6 (Human)
- Related: Review, Output Viewer, Feedback Widget, Auto-approve, Review View

**Review View** — A view composition showing the full Review Queue, Output Viewer, and Feedback Widget. The primary workspace for anyone reviewing agent output.
- Layer: 6 (Human)
- Related: Review Queue, Output Viewer, Feedback Widget, View Compositions

**Reviewer** — An agent role in the coding team responsible for reviewing code against conventions and quality standards. Based on gstack's `/review` and antfarm's verifier pattern. Serves Code Review (all steps).
- Layer: 2 (Agent)
- Related: Builder, Code Review, Convention Checker, antfarm, gstack

**Roadmap** — The complete capability map for Agent OS (`docs/roadmap.md`). Every item traces back to architecture.md, human-layer.md, or landscape.md. Tracks status per capability: not started, in progress, done, or deferred (with re-entry condition). The current source of truth for build sequencing, superseding architecture.md's original 4-phase plan.
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

**WAL Mode (Write-Ahead Logging)** — A SQLite performance optimisation where writes go to a separate log before being merged into the main database file. Enables concurrent reads during writes. Used by antfarm and adopted for Agent OS's SQLite storage. Enabled via `db.pragma('journal_mode = WAL')`.
- Layer: Infrastructure
- Related: SQLite, better-sqlite3, antfarm

**UI Primitives** — The 16 composable, domain-agnostic components that assemble into any view in Agent OS. The same primitives serve marketing, finance, real estate, coding, or any other domain. Original to Agent OS.
- Layer: 6 (Human)
- Related: View Compositions, Six Human Jobs, Human Layer

**View Compositions** — The eight standard assemblies of UI primitives: Home, Review, Processes, Process Detail, Setup, Team, Improvements, and Capture. Each composition serves a specific user need by combining relevant primitives.
- Layer: 6 (Human)
- Related: UI Primitives, Home View, Review View, Setup View
