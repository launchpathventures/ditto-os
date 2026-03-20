# Landscape Analysis — Agent Orchestration & Framework Components

**Date:** 2026-03-20
**Purpose:** Scout the gold standard for each Agent OS component before building. "What can we build FROM?"

---

## Multi-Agent Orchestration Frameworks

### Tier 1: Strong foundations (TypeScript, active, directly usable)

**Mastra** — github.com/mastra-ai/mastra
- 22.1k stars | Active March 2026 | TypeScript 99%
- Graph-based workflow engine with `.then()`, `.branch()`, `.parallel()` DSL
- First-class suspend/resume for human-in-the-loop (snapshot preservation, `suspend()`/`resume()` with structured payloads, `bail()` for rejection). Path-based resume: serializes `suspendedPaths` dict mapping step IDs to execution path indices; resume skips completed steps and condition re-evaluation. Span continuity for tracing across suspension boundaries.
- **Agent networks** (`/packages/core/src/loop/network/`): LLM-as-router pattern. Routing agent receives available primitives (agents, workflows, tools) as schemas → generates `{ primitiveId, prompt, reasoning }`. Thread-based routing memory with `isNetwork: true` flag separating routing decisions from conversation. Optional completion scoring with "all"/"any" strategies.
- **Multi-source tool gathering** (7 sources in `/packages/core/src/agent/agent.ts`, 193KB): assigned tools, memory tools, workspace tools, skill tools, agent tools (sub-agents as callable tools), runtime toolsets, client tools. Each wrapped via `makeCoreTool()` with execution context.
- Pre/post processors: `inputProcessors` for message enhancement, `outputProcessors` for memory persistence. Dynamic instructions via `instructions: Function`.
- Layered memory: conversation history + working memory + semantic recall. Agents reason about goals internally, iterate until final answer.
- Zod-validated step inputs/outputs. 40+ model providers. MCP server support.
- **Agent OS relevance:** HIGH — strongest candidate for "build FROM" for orchestration engine (Layers 2-3). Suspend/resume is the pattern for human step executor (ADR-010). Network routing pattern informs intake-classifier + router. Multi-source tool gathering informs agent harness assembly. Memory layers map to two-scope model. See `docs/research/phase-4-composition-sweep.md` for full extraction.
- **Limitation:** Enterprise features are paid. Monolithic — you adopt its opinions. No built-in trust tiers or maker-checker.

**Paperclip** — github.com/paperclipai/paperclip
- 28.1k stars | Active March 2026 | TypeScript 96%
- Heartbeat cycle (wake, execute, sleep). Adapter interface (`invoke/status/cancel`). Atomic task checkout. Budget controls. Immutable audit log. Governance rollback.
- Goal ancestry: every task carries full goal chain (mission → project → task). Agents see the "why."
- Org chart as primary navigation with real-time agent status. Delegation up/down/across.
- Tickets as universal work unit. Structured communication, not chat.
- **Agent OS relevance:** HIGH — architecture borrows heavily (Layer 2). Goal ancestry pattern adopted for work items (ADR-010). Org chart pattern informs process graph as primary navigation.
- **Limitation:** Uses PostgreSQL. Full platform, not a library. React UI tightly coupled. Designed for "zero-human companies" — human interaction model is thin (board-of-directors oversight).
- **Maturity note:** Launched early 2026, 14.2K stars in first week. Production-ready org chart + ticket system. Goal cascade well-implemented.

**Vercel AI SDK** — github.com/vercel/ai
- Active March 2026 | TypeScript
- Provider-agnostic toolkit for AI-powered applications. `useChat` hooks for React. Multi-step tool use with generative UI — each tool result renders as a custom React component.
- Tool execution approval (AI SDK 6) — HITL at tool level. Structured output via Zod. Agent DevTools.
- **Agent OS relevance:** HIGH for Layer 6 (conversation layer). The multi-step generative UI pattern is how "chat with my business" works — user asks, agent calls processes, results stream as components. `useChat` is the interaction primitive for pervasive conversation (ADR-010).
- **Limitation:** Frontend-focused. No built-in workflow engine, trust, or governance.

**OpenUI** — github.com/thesysdev/openui
- 2.1k stars | Active March 2026 | TypeScript
- Streaming-first generative UI framework. OpenUI Lang: compact language for LLM-generated UI (67% fewer tokens than JSON). Progressive rendering. Component library constrained — LLM can only output defined components. Works with shadcn, Radix.
- **Agent OS relevance:** MEDIUM-HIGH for Phase 10. Could power Output Viewer (Primitive 6) dynamic rendering and streaming conversation responses. Makes the workspace feel alive through progressive rendering. Evaluate alongside Vercel AI SDK.
- **Limitation:** Early stage. Focused on rendering, not orchestration.

**Claude Agent SDK** — `@anthropic-ai/claude-agent-sdk` (TypeScript + Python)
- Active March 2026 | TypeScript + Python
- Full programmatic agent orchestration SDK (NOT just a CLI wrapper). Async generator API: `query()` yields messages as agent executes. Built-in tool implementations (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch). Handles full tool execution loop internally.
- **24 lifecycle hook events** across 4 execution types (command, HTTP, prompt, agent). `PreToolUse` hooks can block or modify operations. Regex-based matchers. Enables harness-like interception at every lifecycle point.
- **Subagent spawning** with strong isolation. Named agents defined as YAML frontmatter + markdown. Scoped: project (`.claude/agents/`), user (`~/.claude/agents/`), session (CLI flag). Tool access restricted per agent. Memory scoped to user/project/local.
- **MCP integration** with dynamic tool loading. `list_changed` notifications for tool refresh. `ENABLE_TOOL_SEARCH` defers tool loading and uses search-on-demand for scale.
- **System prompt composition:** Hierarchical CLAUDE.md loading (managed policy → ancestors → `.claude/rules/` with path-conditional loading → user rules → auto memory from MEMORY.md).
- **Agent OS relevance:** HIGH across Layers 2-3. Hooks system is the richest harness-interception model in the landscape. Subagent isolation model maps to system/domain agent separation (ADR-008). MCP dynamic tool loading maps to integration registry (ADR-005). System prompt composition pattern informs agent harness assembly. See `docs/research/phase-4-composition-sweep.md` for full extraction.
- **Limitation:** Claude-specific. Hooks require settings.json configuration. Subagents run in fresh context (don't inherit parent conversation).

**Inngest AgentKit** — github.com/inngest/agent-kit
- Active March 2026 | TypeScript 100%
- Multi-agent network framework with three routing modes: code-based (`FnRouter` — deterministic, no LLM calls), routing agent (`RoutingAgent` — AI-driven selection with "done" tool), and hybrid (code-based first steps + agent-based for flexible routing). Sequential execution with shared typed state `State<T>`.
- Tool composition via `createTool()` with Zod schemas + `createToolManifest()` for type-safe tool registries. MCP server support. Tools receive `{ agent, network, step }` context.
- Agent lifecycle hooks: `onStart`, `onResponse`, `onFinish`. Dynamic system prompts via `system: (network) => string`.
- History persistence via `HistoryConfig` interface with create/get/append hooks — supports both server-authoritative and client-authoritative modes.
- 7-category streaming events including dedicated HITL: `hitl.requested_approval`, `hitl.resolved`. Durable execution via Inngest `step.ai.wrap()`.
- **Agent OS relevance:** HIGH — strongest pattern for intake-classifier + router system agents. Three routing modes map directly to trust progression: code-based (supervised — deterministic routing), LLM-based (spot-checked — flexible routing), hybrid (progressive trust in routing). Tool manifest pattern maps to process-scoped tool composition. State management maps to harness context. See `docs/research/phase-4-composition-sweep.md` for full extraction.
- **Limitation:** Requires Inngest server for durable execution. SSPL license. Sequential execution only (not concurrency-safe).

### Tier 2: Right concepts, wrong ecosystem

**LangGraph** — 26.7k stars | Python only
- Durable execution, graph interrupts for HITL, memory systems. Bulk Synchronous Parallel (BSP) execution model. First-class `interrupt()` API with checkpoint persistence (memory, SQLite, PostgreSQL backends). `Command` objects for dynamic routing. `Send` pattern for map-reduce (one node spawns multiple worker instances).
- **Patterns worth extracting:** Checkpoint interface (put/get/list) for state persistence. Interrupt mechanism for HITL. Send pattern for goal decomposition (orchestrator emits Send to workers). Channel-based state with reducers for multi-source aggregation.

**CrewAI** — 46.4k stars | Python only
- YAML-based config, role-based collaboration. Validates our YAML approach but opposite philosophy (autonomous crews vs trust-first).
- **Patterns worth extracting:** Hierarchical process with manager agent that delegates based on agent roles/goals. Task guardrails: validators return `(bool, feedback)` tuple with max retries. Delegation tracking: `delegations` counter, `processed_by_agents` list. Flow decorator pattern (`@start`, `@listen`, `@router`) for event-driven orchestration with `or_`/`and_` combinators.

**OpenAI Agents SDK** — 20.1k stars | Python only
- Guardrails concept loosely maps to harness. Conversation-oriented, not process-oriented.

**AG2 (formerly AutoGen)** — 4.3k stars | Python only
- UserProxyAgent for HITL. Reviewer-agent patterns validate maker-checker concept.

---

## Workflow / Process Engines

**Trigger.dev** — github.com/triggerdotdev/trigger.dev
- 14.1k stars | Active March 2026 | TypeScript 98%
- Purpose-built for AI agent workflows. Durable execution, no timeouts. Waitpoint tokens for HITL. Supports all 5 Anthropic agent patterns.
- **Agent OS relevance:** HIGH alternative for Layer 2. Waitpoint tokens = trust-tier pause mechanism.
- **Limitation:** Requires infrastructure (cloud or self-hosted). Heavier than SQLite + cron.

**Inngest** — github.com/inngest/inngest
- 5k+ stars | Active March 2026 | Go server, TypeScript SDK
- Step-based durable execution. Event-driven triggers. AgentKit for multi-agent networks. `step.ai.wrap()` for reliable LLM calls.
- **Agent OS relevance:** HIGH — step-based execution maps to process steps. TypeScript-first SDK.
- **Limitation:** Requires Inngest server. SSPL license.

**Temporal** — TypeScript SDK 789 stars
- Industrial-grade. Activity heartbeats. Conceptually perfect but requires Java server. Overkill for dogfood.

**BullMQ** — 8.6k stars
- Parent/child job dependencies. Requires Redis. Job-oriented, not workflow-oriented.

---

## Projects from Architecture Spec Borrowing Table

**antfarm** — github.com/snarktank/antfarm
- 2.2k stars | Active Feb 2026 | TypeScript 71%
- YAML workflow definitions + SQLite state + cron-based polling. Independent verification agents. 7-agent pipelines.
- **Agent OS relevance:** Core reference for Layers 1, 3. "Developer doesn't mark own homework" = maker-checker. Closest existing implementation to process + harness model.

**ralph** — github.com/snarktank/ralph
- 13.1k stars | Active Jan 2026 | TypeScript 63%
- Autonomous loop with fresh context per iteration. Three-tier state: git history + progress.txt + prd.json.
- **Agent OS relevance:** Core reference for Layer 2 execution model. Validates flat-file state and zero-setup approach.

**gstack** — github.com/garrytan/gstack
- 21k stars | Active March 2026 | TypeScript 75%
- 13 specialized agent roles via slash commands. 80-item design audits. Browser-based testing.
- **Agent OS relevance:** Reference for Layers 2, 3. Role diversity validates our role-based system prompts.

**compound-product** — github.com/snarktank/compound-product
- 499 stars | Active Jan 2026 | Shell + JSON
- Self-improving product system. Analyse → identify priority → create PRD → execute → deliver PR.
- **Agent OS relevance:** Reference for Layer 5 and Self-Improvement Meta-Process.

---

## Storage, CLI, and Infrastructure

### Storage
| Option | Stars | Fit | Notes |
|--------|-------|-----|-------|
| **better-sqlite3** | 4.6k dependents | Best | Synchronous, fast, mature. Drizzle supports it. Swap driver, keep schema. |
| **Turso/libSQL** | - | Future | Local-first with optional cloud sync. Consider when scaling beyond single machine. |
| **Node.js built-in sqlite** | - | Watch | Experimental in Node 22.5+. Not production-ready yet. |
| **lowdb** | 21k | Config only | No query engine. Good for simple key-value, not transactional data. |
| **conf** | - | Config | Platform-correct config dir. Good for API keys, preferences. |

**Recommendation:** Drizzle ORM + better-sqlite3 for structured data. conf for user config.

### Memory Systems (Tier 2 — Pattern Sources)

**Mem0** — github.com/mem0ai/mem0
- Active March 2026 | Python + TypeScript SDK
- LLM-driven memory extraction + reconciliation (ADD/UPDATE/DELETE/NONE). Scope filtering (user_id, agent_id, run_id). 22 vector store backends. Hybrid retrieval (BM25 + vector + optional reranking). Audit trail via SQLiteManager.
- **Agent OS relevance:** HIGH for memory architecture. Reconciliation model adopted in ADR-003. Scope filtering maps directly to two-scope model. 90% fewer tokens than naive approaches with 26% accuracy gain. See `docs/research/memory-systems.md`.
- **Limitation:** Python-first. Vector-dependent at scale.

**memU** — github.com/NevaMind-AI/memU
- 13K stars | Active March 2026 | Python
- Three-layer hierarchy (Resource → Item → Category). Six memory types. Reinforcement counting. Salience scoring: `similarity × log(reinforcement+1) × recency_decay(half_life=30d)`.
- **Agent OS relevance:** HIGH for memory scoring. Salience formula adopted in ADR-003 (Phase 3) and confirmed by ADR-012. Reinforcement counting pattern adopted. 92.09% accuracy on LOCOMO benchmark. See `docs/research/memory-systems.md`.
- **Limitation:** Python-only. Requires PostgreSQL + pgvector at scale.

**Graphiti/Zep** — github.com/getzep/graphiti
- Active March 2026 | Python | Neo4j-based
- Temporal knowledge graph. Entity/episode/community nodes. Bi-temporal edges (valid-time + system-time). LLM-driven contradiction detection. Hybrid retrieval (BM25 + cosine + graph traversal + RRF).
- **Agent OS relevance:** MEDIUM for Phase 7+ when entity-relationship memory is needed (Insight-037 relational context dimension). Temporal invalidation pattern noted in ADR-003 as deferred alternative. See `docs/research/memory-systems.md` and `docs/research/context-and-token-efficiency.md`.
- **Limitation:** Requires Neo4j. Heavy infrastructure. Python-only.

### Model Routing

**RouteLLM** — github.com/lm-sys/RouteLLM
- Active 2024-2026 | Python
- Open-source framework for cost-effective LLM routing. Trained on Chatbot Arena preference data. Multiple classifier types (similarity-weighted ranking, matrix factorization, BERT, causal LLM). 85% cost reduction on MT Bench, 45% MMLU, maintaining 95% performance. 40% cheaper than commercial routing.
- **Agent OS relevance:** MEDIUM — validates cost-based cascade routing pattern adopted in ADR-012. Agent OS uses process-declared tiers (not runtime classification), but the cost savings benchmarks inform the value proposition.
- **Limitation:** Python-only. Requires training data. Runtime classification approach differs from Agent OS's declarative approach.

### CLI
| Option | Stars | Fit | Notes |
|--------|-------|-----|-------|
| **@clack/prompts** | 5.1k dependents | Best (UX) | Beautiful prompts. Used by Astro, Svelte scaffolders. Perfect for approve/edit/reject. |
| **citty** (UnJS) | - | Best (routing) | TypeScript-first, ESM, minimal. Great type inference. |
| **Commander.js** | 27k | Established | Most widely used. Less TypeScript-native than citty. |
| **Ink** | - | Overkill | React for terminals. Too heavy for our needs. |
| **oclif** | - | Overkill | Enterprise-grade. Significant boilerplate. |

**Recommendation:** citty (command routing) + @clack/prompts (interactive UX).

---

## Agent Harness Patterns (Landscape Insight)

Research across five additional sources (March 2026) revealed a consistent emerging pattern: **nested harnesses** — each layer wrapping the runtime with progressively broader scope.

### The Babushka Model

Every serious agent system in the landscape implements some version of this nesting, though none names it explicitly:

| Layer | Scope | What it provides | Example |
|-------|-------|-----------------|---------|
| **Platform harness** | Cross-process | Governance, trust, dependency graph, learning | Agent OS (our product) |
| **Process harness** | Per-process | Review patterns, quality gates, escalation, process memory | Sim Studio workflow, Open SWE thread |
| **Agent harness** | Per-agent | Identity, capabilities, agent memory, tool permissions, budget | agents.md + memory.md + skills/ |
| **Runtime** | Per-invocation | The actual LLM or script execution | Claude, GPT, script adapter |

**Architectural implication for Agent OS:** Our current Layer 2 treats agents as stateless adapters (`invoke()` / `status()` / `cancel()`). The landscape shows each agent needs a persistent operating context — identity, memory, tools, permissions — that travels with it across process assignments. This "agent harness" sits between the adapter pattern and the process harness. See architecture.md for the formalised model.

### Memory Tiers in the Landscape

| Tier | Pattern | Who uses it | Limitation |
|------|---------|-------------|------------|
| **File-based** | memory.md, CLAUDE.md | Claude Code, Cursor, "AI Agent OS" practitioner pattern | No query capability, no multi-agent coordination, no schema enforcement |
| **Thread-scoped** | Message history + metadata | Open SWE (LangGraph threads), Sim Studio (execution state) | Ephemeral — dies with the thread/run |
| **Database-per-agent** | Serverless Postgres with branching | Deeplake, db9.ai, Neon | Full SQL queryability, heavyweight infrastructure |

**Agent OS approach:** Hybrid — process memory for process-specific learning (correction patterns, quality criteria), agent memory for cross-cutting capabilities (coding style, tool preferences, domain expertise). The harness merges both at invocation time. Start with SQLite (`memory` table with `scope_type` + `scope_id`), scale to dedicated storage when needed.

### Patterns Worth Adopting

| Pattern | Source | How it applies to Agent OS |
|---------|--------|---------------------------|
| Handler registry | Sim Studio | Step executor should use registered handlers, not switch statements |
| Execution snapshot/resume | Sim Studio | Serialize full process run context for heartbeat pause/resume |
| Safety-net middleware (4-layer chain) | Open SWE | Error normalization → message injection → empty-output guard → structural guarantee. Composable middleware extending harness pipeline |
| Deterministic thread IDs | Open SWE | Hash `process-id:trigger-event` into stable run IDs for continuity |
| Mid-run message injection | Open SWE | Queue human context for injection before next step, don't interrupt |
| Handoff template taxonomy | agency-agents | 7 handoff types (standard, QA pass/fail, escalation, phase gate, sprint, incident) |
| Skills as progressive disclosure | "AI Agent OS" practitioner pattern | Load agent capabilities on demand to keep context lean |
| Three-mode routing | Inngest AgentKit | Code-based (deterministic) → LLM-based (flexible) → hybrid. Maps to trust progression in routing |
| Multi-source tool gathering | Mastra | 7 tool sources merged at invocation: assigned, memory, workspace, skill, agent, runtime, client |
| Path-based suspend/resume | Mastra | Serialize suspended step paths + step results. Resume skips completed steps. Span continuity |
| Lifecycle hooks (onStart/onResponse/onFinish) | Inngest AgentKit | Pre/post-execution hooks for memory injection, trust validation, feedback capture |
| Task guardrails with retry | CrewAI | Validators return `(bool, feedback)` tuple. Max retries configurable. Delegation tracking |
| 24-event hooks system | Claude Agent SDK | PreToolUse can block/modify operations. 4 execution types (command, HTTP, prompt, agent). Harness interception |
| Parallel aggregation for CLI dashboard | GitHub CLI | `errgroup.Group` loads heterogeneous items in parallel → unified table rendering |
| Interactive workflows with graceful fallback | Linear CLI + @clack/prompts | Accept argument OR prompt if TTY. Multi-step group workflows with result propagation |

### Non-Technical User Approaches in the Landscape

| Approach | Example | Trade-off |
|----------|---------|-----------|
| **Visual DAG builder** | Sim Studio (27K stars) | Powerful but overwhelming — 100+ block types |
| **Markdown files** | "AI Agent OS" practitioner pattern | Low floor, low ceiling — works until it doesn't |
| **Conversational** | Agent OS (our architecture) | Highest accessibility, hardest to build |
| **Prompt library** | agency-agents (54K stars) | Technical users only despite non-technical marketing |

The "AI Agent OS" practitioner pattern's key insight: **frame agents as employees**. The onboarding metaphor (job description → training manual → tools → institutional knowledge) maps to familiar business processes. Non-technical users know how to hire and manage people — they don't know how to configure workflows. Agent OS's Explore mode conversational interface aligns with this, but our Process Builder should feel more like editing a document than configuring a workflow tool.

---

## Additional Sources (March 2026)

### agency-agents — github.com/msitarzewski/agency-agents
- 54k stars | Active March 2026 | Shell (conversion scripts) + Markdown
- ~130 agent persona definitions across 9 divisions. NEXUS coordination framework with handoff templates and quality gates.
- **Not a runtime or engine.** Prompt library with the human as orchestration bus — copy-paste between agents.
- **Agent OS relevance:** LOW for architecture, MEDIUM for patterns. Handoff template taxonomy (7 types) is a useful schema for inter-step messaging. Quality gate pattern (dev↔QA loop with max retries and escalation) maps to harness review patterns. The Workflow Architect agent's spec format (handoff contracts, cleanup inventories, observable states) is genuine process design methodology.
- **What NOT to adopt:** The fundamental approach. Human-as-bus is the exact problem Agent OS solves. 130+ persona definitions optimised for breadth, not depth.

### Sim Studio — github.com/simstudioai/sim
- 27k stars | Active March 2026 | TypeScript (monorepo: Next.js + Drizzle + PostgreSQL)
- Visual workflow builder: drag blocks on ReactFlow canvas, connect with edges, trigger via webhooks/cron/chat.
- **DAG executor** with 5-phase graph construction, queue-based concurrent execution, 14 block handlers via registry pattern.
- **Execution snapshot/resume** serialises full context to JSON for pause/resume — directly relevant to our heartbeat model.
- **Variable resolver chain** (Loop → Parallel → Workflow → Env → Block) for data flow between blocks.
- **Human-in-the-loop as first-class block type**, not bolted-on approval.
- **Agent OS relevance:** HIGH for execution patterns. Handler registry, snapshot/resume, and variable resolution are battle-tested solutions to problems we face in Phase 2. Not architecturally aligned (workflow-as-harness, not process-as-primitive; no trust tiers or graduated autonomy; ephemeral runs, not durable processes).
- **Composition opportunity:** Study executor patterns when building Phase 2 harness and heartbeat rewrite.

### Open SWE — github.com/langchain-ai/open-swe
- Active March 2026 | Python | Built on LangGraph + Deep Agents
- Async coding agent harness. Humans trigger from Slack/Linear/GitHub, agent clones repo into sandbox, works, opens PR.
- **Closest to "harness is the product" thesis.** The framework provides orchestration, context, sandboxing, safety nets — the agent itself is pluggable.
- **Key patterns (implementation-depth extraction in `docs/research/phase-4-composition-sweep.md`):**
  - **Single-function agent assembly** (`get_agent(config) -> Pregel` in `/agent/server.py`): 9-step assembly — extract config → create sandbox → clone repo → load AGENTS.md → assemble 13-section system prompt → configure model → bind 6 tools → inject 4 middleware → bind config. Returns empty agent if not in execution context (graceful degradation).
  - **4-layer middleware chain** (ordered, composable): (1) `ToolErrorMiddleware` catches exceptions → structured ToolMessage for self-correction, (2) `check_message_queue_before_model` retrieves queued human messages → injects before next LLM call, (3) `ensure_no_empty_msg` forces action on empty/text-only responses, (4) `open_pr_if_needed` structural guarantee — always produces a PR even if agent forgot.
  - **Deterministic thread IDs:** SHA-256 of `"linear-issue:{id}"` or `"github-issue:{id}"`. Same source always maps to same thread.
  - **Event-driven webhook routing** (`/agent/webapp.py`): Three endpoints (Linear, Slack, GitHub) with HMAC verification. New/idle threads get new runs; active threads get messages queued for middleware injection.
  - **Multi-mode authentication:** Per-user OAuth (primary), bot-token fallback, environment-based (platform-specific).
- **Agent OS relevance:** HIGH for harness patterns, MEDIUM for direct adoption (Python, single-purpose). The 4-layer middleware chain is the most concrete reference for extending our 5-handler harness pipeline. The `get_agent()` assembly is the reference implementation for architecture.md's agent harness assembly function.

### Deeplake / db9.ai — Agent-Native Databases
- **Core argument:** Databases were built for applications, not agents. Agents need sandboxed, branching-capable, multimodal storage — not memory.md files and not shared production databases.
- **Serverless Postgres per agent** with copy-on-write branching (experiment without risk), scale-to-zero economics, and multimodal storage (vectors, images, video, relational data in one system).
- **Challenges to memory.md pattern:** No query capability, no multi-agent coordination, no schema enforcement, no branching/versioning. Fine for single-agent scratchpads, breaks for production multi-agent systems.
- **Agent OS relevance:** MEDIUM — validates our need for structured memory beyond flat files. Our SQLite approach is a pragmatic middle ground: queryable, schema-enforced, lightweight. The branching concept is interesting for trust tiers (agent works on a "branch," human approves the "merge"). Deferred to scale phase — serverless Postgres per agent is infrastructure we don't need for dogfood.

### "AI Agent OS" Practitioner Pattern — (Greg Isenberg / Remy Gaskell, March 2026)
- Practitioner guide for building "digital employees" using Claude Code / Cursor / Codex.
- **Folder-structure-as-harness:** agents.md (brain/identity), memory.md (persistent learning), skills/ (SOPs as markdown), MCP (tool connections). The folder IS the agent's operating context.
- **Key patterns:**
  - `agents.md` as structured persona (role, mission, rules, deliverables, communication style, success metrics)
  - `memory.md` as agent-written persistent learning (corrections, preferences, domain knowledge) — self-improving loop
  - Skills as progressive disclosure — load on demand, not upfront, to keep context lean
  - "Choose your vehicle, the engine is the same" — harness wraps runtime at multiple levels
  - Hiring metaphor for non-technical users: job description → training manual → tools → institutional knowledge
- **Agent OS relevance:** HIGH for non-technical user framing, MEDIUM for architecture. Validates our Explore mode and conversational setup. The folder-structure-as-harness is what non-technical users are already doing manually — Agent OS should automate and formalise this pattern with governance, trust, and learning on top.

---

## Cognitive Science References (March 2026 Research)

**LIDA Cognitive Architecture** — Stan Franklin, University of Memphis
- Java-based cognitive architecture implementing Global Workspace Theory (GWT) — the most widely accepted theory of consciousness in cognition.
- Key mechanism: attention codelets form coalitions, compete for attention; winning coalition becomes conscious content and is broadcast globally. ~10 Hz cognitive cycles as "atoms of cognition."
- **Agent OS relevance:** MEDIUM as conceptual reference for ADR-011 (attention model) and ADR-013 (cognitive model). LIDA's salience model (novelty, urgency, personal relevance, emotional valence) is richer than Agent OS's current confidence-based routing. Not adoptable (Java, academic).
- **Limitation:** Java. Academic architecture, not production system.

**Cognitive Load Framework for Human-AI Symbiosis** — Springer 2026
- Framework for designing human-AI interfaces that minimise extraneous cognitive load. Human working memory holds 3-5 items. Dominant design imperative: reduce extraneous load so limited working memory resources are devoted to intrinsic task demands.
- **Agent OS relevance:** MEDIUM as design principle reference for review UX (ADR-013). Informs cognitive mode framing: match review interface density to cognitive demand of the task.

---

## Agent-Driven UI Protocols (March 2026 Research)

**A2UI (Agent-to-User Interface)** — github.com/google/A2UI
- Released December 2025 by Google. Apache 2.0 license. Version v0.8-v0.9.
- Declarative protocol for agents to compose UI at runtime. Agent emits JSON referencing a trusted component catalog; client renders natively. Framework-agnostic (React, Flutter, SwiftUI).
- Security model: no code execution — agents can only reference pre-approved component types.
- **Agent OS relevance:** MEDIUM — architecturally aligned with our 16 primitives as a trusted catalog. However, doesn't encode Agent OS's unique dimensions (6 jobs, trust tiers, process context, feedback capture). Deferred to Phase 13 (multi-platform) for re-evaluation.
- **Limitation:** v0.9 — early. Doesn't solve a problem Agent OS has on web (React already composes at runtime).

**AG-UI (Agent-User Interaction Protocol)** — github.com/ag-ui-protocol/ag-ui
- Event-driven bidirectional protocol connecting agent backends to user-facing applications. Complements A2UI.
- ~16 standard event types. Real-time streaming. Production use in CopilotKit, Microsoft Agent Framework, Oracle Agent Specification.
- **Agent OS relevance:** LOW for now — Agent OS's engine-to-frontend communication can use standard REST + WebSocket (already planned). Re-evaluate at Phase 13.

**DivKit (Yandex)** — github.com/divkit/divkit
- Apache 2.0. Open-source cross-platform SDUI framework (JSON → native UI for Android, iOS, Web, Flutter).
- Visual editor with live preview, Figma plugin. Production-proven at Yandex scale.
- **Agent OS relevance:** LOW — solves multi-platform rendering problem we don't have yet. Reference for Phase 13 mobile.

**Verdict (ADR-009):** No formal view composition protocol for Phase 10 web dashboard. Standard React component architecture with the 16 primitives. Formal protocol deferred to Phase 13 when multi-platform rendering creates a real problem. See `docs/research/runtime-composable-ui.md` for full landscape survey.

---

## What's Genuinely Ours to Build

No existing framework implements these — they are Agent OS's unique value:

1. **Progressive trust tiers** — supervised → spot-checked → autonomous, earned through track record. Every framework is binary (human checks everything, or nothing).
2. **Trust earning with data** — approval rates, correction rates, review cycles driving upgrade suggestions.
3. **Process-first model** — every framework is agent-first or task-first. Process as the primitive is original.
4. **Implicit feedback capture** — edits-as-feedback, correction pattern extraction from diffs.
5. **Explore → Operate transition** — conversation crystallising into process definition.
6. **Governance function** — agents providing cross-cutting compliance assurance across individuals, teams, organisations.
7. **Agent authentication** — identity, permissions, and provenance for agents entering the harness.
8. **Trust-aware UI density** — supervised processes show maximum UI detail, autonomous show exceptions only. No surveyed system adjusts UI composition based on earned trust tiers (ADR-009).
9. **Cognitive mode on process steps** — process definitions declare what kind of human thinking review demands (analytical vs creative). Review framing, feedback capture, and learning adapt accordingly. No surveyed AI platform adapts review UX to cognitive mode (ADR-013).
10. **Tacit knowledge capture** — enriched feedback vocabulary (tagged rejection, gut rejection) captures pre-articulate expertise. System detects patterns in vague signals and surfaces hypotheses. No surveyed agent platform captures pre-articulate knowledge (ADR-013).
11. **Insight escalation ladder** — learning layer escalates from concrete corrections → patterns → structural insights → strategic proposals. Four abstraction levels, each requiring different human cognitive engagement. No surveyed platform models abstraction levels in learning (ADR-013).

---

## Pragmatic Path for Dogfood

For the coding agent team (first implementation):

- **Adopt antfarm's pattern:** YAML + SQLite + sequential execution with verification gates
- **Adopt ralph's state model:** Flat files for context, git for history
- **Adopt Paperclip's adapter interface:** `invoke()` / `status()` / `cancel()`
- **Use Drizzle + better-sqlite3:** Swap driver, keep existing schema structure
- **Use citty + @clack/prompts:** Modern TypeScript CLI stack
- **Build our own:** Trust tier enforcement, maker-checker harness, feedback capture, governance
- **Defer infrastructure** (Inngest/Trigger.dev/Mastra) to when durable execution at scale is needed
