# Landscape Analysis — Agent Orchestration & Framework Components

**Date:** 2026-03-20
**Purpose:** Scout the gold standard for each Ditto component before building. "What can we build FROM?"

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
- **Ditto relevance:** HIGH — strongest candidate for "build FROM" for orchestration engine (Layers 2-3). Suspend/resume is the pattern for human step executor (ADR-010). Network routing pattern informs intake-classifier + router. Multi-source tool gathering informs agent harness assembly. Memory layers map to two-scope model. See `docs/research/phase-4-composition-sweep.md` for full extraction.
- **Limitation:** Enterprise features are paid. Monolithic — you adopt its opinions. No built-in trust tiers or maker-checker.

**Paperclip** — github.com/paperclipai/paperclip
- 28.1k stars | Active March 2026 | TypeScript 96%
- Heartbeat cycle (wake, execute, sleep). Adapter interface (`invoke/status/cancel`). Atomic task checkout. Budget controls. Immutable audit log. Governance rollback.
- Goal ancestry: every task carries full goal chain (mission → project → task). Agents see the "why."
- Org chart as primary navigation with real-time agent status. Delegation up/down/across.
- Tickets as universal work unit. Structured communication, not chat.
- **Ditto relevance:** HIGH — architecture borrows heavily (Layer 2). Goal ancestry pattern adopted for work items (ADR-010). Org chart pattern informs process graph as primary navigation.
- **Limitation:** Uses PostgreSQL. Full platform, not a library. React UI tightly coupled. Designed for "zero-human companies" — human interaction model is thin (board-of-directors oversight).
- **Maturity note:** Launched early 2026, 14.2K stars in first week. Production-ready org chart + ticket system. Goal cascade well-implemented.

**Vercel AI SDK** — github.com/vercel/ai
- Active March 2026 | TypeScript
- Provider-agnostic toolkit for AI-powered applications. `useChat` hooks for React. Multi-step tool use with generative UI — each tool result renders as a custom React component.
- Tool execution approval (AI SDK 6) — HITL at tool level. Structured output via Zod. Agent DevTools.
- **Ditto relevance:** HIGH for Layer 6 (conversation layer). The multi-step generative UI pattern is how "chat with my business" works — user asks, agent calls processes, results stream as components. `useChat` is the interaction primitive for pervasive conversation (ADR-010).
- **Limitation:** Frontend-focused. No built-in workflow engine, trust, or governance.

**AI SDK Elements** — github.com/vercel/ai-elements
- 1.8k stars | Active 2026 | TypeScript | Apache 2.0
- 47+ pre-built React components for AI applications, distributed as shadcn/ui custom registry (copy into project, own the code). Five categories: chatbot (18), code (15), voice (6), workflow (7), utilities (2). Built on React 19, Tailwind v4, shadcn/ui, @xyflow/react.
- Key components: **Confirmation** (approve/reject flow), **Task** (status-tracked task lists), **Plan** (collapsible step plans with streaming), **Chain of Thought** (reasoning steps), **Queue** (flexible list with sections/actions), **Agent** (agent config display), **Canvas/Node/Edge** (xyflow workflow visualization), **Attachments** (file display with grid/inline/list), **Checkpoint** (conversation bookmarks), **Context** (token/cost visualization).
- **Ditto relevance:** HIGH for Phase 10. Multiple components map directly to Ditto needs: Confirmation → review/approval flow, Task → process step display, Plan → generated process (living roadmap) view, Queue → work feed, Canvas → capability map / process graph. Composition level: **adopt** — copy source files, adapt for Ditto's domain (trust tiers, process context, user language). The wrappers are thin (50-150 lines each); the real dependencies are @xyflow/react and shadcn/ui which are already in the stack.
- **Adopted (Brief 058 + 061):** 15 components in `packages/web/components/ai-elements/`: Conversation, Message, PromptInput (composable subcomponents), Reasoning (Radix Collapsible + useControllableState), Tool (status badges + CodeBlock I/O), Confirmation (state-aware composable), Suggestion, Shimmer, **ChainOfThought** (step status + connector lines), **Plan** (Card + streaming shimmer), **Queue** (ScrollArea + collapsible sections), **InlineCitation** (HoverCard + carousel), **Sources** (collapsible source list), **Task** (collapsible container), **CodeBlock** (Shiki syntax highlighting). Plus useControllableState hook. 4 block renderers upgraded to use AI Elements internally. SDK surface utilisation ~45% (Insight-114). Radix UI deps: Collapsible, HoverCard, ScrollArea. Note: backward-compatible defaults mean architecture is in place but a UX brief is needed to surface improvements visually (Insight-119).
- **Limitation:** AI-chat oriented defaults — components assume a chat context. Ditto's work-surface-first model needs adaptation.

**OpenUI** — github.com/thesysdev/openui
- 2.1k stars | Active March 2026 | TypeScript
- Streaming-first generative UI framework. OpenUI Lang: compact language for LLM-generated UI (67% fewer tokens than JSON). Progressive rendering. Component library constrained — LLM can only output defined components. Works with shadcn, Radix.
- **Ditto relevance:** MEDIUM-HIGH for Phase 10. Could power Output Viewer (Primitive 6) dynamic rendering and streaming conversation responses. Makes the workspace feel alive through progressive rendering. Evaluate alongside Vercel AI SDK.
- **Limitation:** Early stage. Focused on rendering, not orchestration.

**json-render** — github.com/vercel-labs/json-render
- Vercel Labs | Active 2026 | TypeScript
- Generative UI framework: AI produces flat JSON specs referencing a pre-approved component catalog (Zod-validated). Three-layer separation: Catalog (Zod schema defining allowed components + props + actions) → Registry (platform-specific implementations) → Renderer (takes spec + registry, renders safely).
- Flat spec format (`{ root, elements: { id: { type, props, children } } }`) designed for LLM streaming — partial specs render progressively. Actions as first-class (predefined, not arbitrary handlers). State adapters (Redux, Zustand, Jotai, XState). MCP integration built in.
- Cross-platform from one catalog: React, React Native, Vue, Svelte, SolidJS, React PDF, React Email, Remotion (video), React Three Fiber, Satori (OG images). 36 pre-built shadcn/ui components.
- **Ditto relevance:** HIGH for rendered-view output type (Insight-066). Catalog-constrained rendering maps to trust-tier-governed output richness. One-catalog-many-registries enables multi-surface output rendering from a single process output schema. Flat spec format enables progressive rendering of dynamic outputs as processes execute. Evaluate as primary candidate for rendered-view output infrastructure. Supersedes OpenUI evaluation — more mature, richer ecosystem, Vercel backing.
- **Limitation:** UI rendering only — one output type among many (Insight-066). No orchestration, trust, or governance.

**Impeccable** — impeccable.style
- Design skills package (Paul Bakaus) | Active 2026
- 20 invocable slash commands packaging professional design expertise (typography, color, layout, motion, anti-patterns) for AI coding assistants. Command composition graph: commands declare what they pair with and lead to (e.g. `/audit` → `/normalize` → `/harden`). Persistent context via `.impeccable.md`. Anti-pattern databases alongside best practices.
- **Ditto relevance:** MEDIUM-HIGH — instance of a broader pattern (Insight-069: skills packages as agent capabilities). Three uses: (1) Dev process — Builder/Reviewer roles use design skills when producing/reviewing UI code. (2) Harness quality gate — meta-agents run design audit/polish on rendered view outputs before delivery, same pattern as metacognitive check. (3) Pattern — external domain expertise packaged as agent toolkit extensions (ADR-014 toolkit layer). Applies to design, writing, accessibility, financial formatting, and any domain with packageable expertise.
- **Limitation:** Prompts only, not a runtime. The value is the pattern and the design expertise, not adoptable code.

**Claude Agent SDK** — `@anthropic-ai/claude-agent-sdk` (TypeScript + Python)
- Active March 2026 | TypeScript + Python
- Full programmatic agent orchestration SDK (NOT just a CLI wrapper). Async generator API: `query()` yields messages as agent executes. Built-in tool implementations (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch). Handles full tool execution loop internally.
- **24 lifecycle hook events** across 4 execution types (command, HTTP, prompt, agent). `PreToolUse` hooks can block or modify operations. Regex-based matchers. Enables harness-like interception at every lifecycle point.
- **Subagent spawning** with strong isolation. Named agents defined as YAML frontmatter + markdown. Scoped: project (`.claude/agents/`), user (`~/.claude/agents/`), session (CLI flag). Tool access restricted per agent. Memory scoped to user/project/local.
- **MCP integration** with dynamic tool loading. `list_changed` notifications for tool refresh. `ENABLE_TOOL_SEARCH` defers tool loading and uses search-on-demand for scale.
- **System prompt composition:** Hierarchical CLAUDE.md loading (managed policy → ancestors → `.claude/rules/` with path-conditional loading → user rules → auto memory from MEMORY.md).
- **Ditto relevance:** HIGH across Layers 2-3. Hooks system is the richest harness-interception model in the landscape. Subagent isolation model maps to system/domain agent separation (ADR-008). MCP dynamic tool loading maps to integration registry (ADR-005). System prompt composition pattern informs agent harness assembly. See `docs/research/phase-4-composition-sweep.md` for full extraction.
- **Limitation:** Claude-specific. Hooks require settings.json configuration. Subagents run in fresh context (don't inherit parent conversation).

**Inngest AgentKit** — github.com/inngest/agent-kit
- Active March 2026 | TypeScript 100%
- Multi-agent network framework with three routing modes: code-based (`FnRouter` — deterministic, no LLM calls), routing agent (`RoutingAgent` — AI-driven selection with "done" tool), and hybrid (code-based first steps + agent-based for flexible routing). Sequential execution with shared typed state `State<T>`.
- Tool composition via `createTool()` with Zod schemas + `createToolManifest()` for type-safe tool registries. MCP server support. Tools receive `{ agent, network, step }` context.
- Agent lifecycle hooks: `onStart`, `onResponse`, `onFinish`. Dynamic system prompts via `system: (network) => string`.
- History persistence via `HistoryConfig` interface with create/get/append hooks — supports both server-authoritative and client-authoritative modes.
- 7-category streaming events including dedicated HITL: `hitl.requested_approval`, `hitl.resolved`. Durable execution via Inngest `step.ai.wrap()`.
- **Ditto relevance:** HIGH — strongest pattern for intake-classifier + router system agents. Three routing modes map directly to trust progression: code-based (supervised — deterministic routing), LLM-based (spot-checked — flexible routing), hybrid (progressive trust in routing). Tool manifest pattern maps to process-scoped tool composition. State management maps to harness context. See `docs/research/phase-4-composition-sweep.md` for full extraction.
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
- **Ditto relevance:** HIGH alternative for Layer 2. Waitpoint tokens = trust-tier pause mechanism.
- **Limitation:** Requires infrastructure (cloud or self-hosted). Heavier than SQLite + cron.

**Inngest** — github.com/inngest/inngest
- 5k+ stars | Active March 2026 | Go server, TypeScript SDK
- Step-based durable execution. Event-driven triggers. AgentKit for multi-agent networks. `step.ai.wrap()` for reliable LLM calls.
- **Ditto relevance:** HIGH — step-based execution maps to process steps. TypeScript-first SDK.
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
- **Ditto relevance:** Core reference for Layers 1, 3. "Developer doesn't mark own homework" = maker-checker. Closest existing implementation to process + harness model.

**ralph** — github.com/snarktank/ralph
- 13.1k stars | Active Jan 2026 | TypeScript 63%
- Autonomous loop with fresh context per iteration. Three-tier state: git history + progress.txt + prd.json.
- **Ditto relevance:** Core reference for Layer 2 execution model. Validates flat-file state and zero-setup approach.

**gstack** — github.com/garrytan/gstack
- 21k stars | Active March 2026 | TypeScript 75%
- 13 specialized agent roles via slash commands. 80-item design audits. Browser-based testing.
- **Ditto relevance:** Reference for Layers 2, 3. Role diversity validates our role-based system prompts.

**compound-product** — github.com/snarktank/compound-product
- 499 stars | Active Jan 2026 | Shell + JSON
- Self-improving product system. Analyse → identify priority → create PRD → execute → deliver PR.
- **Ditto relevance:** Reference for Layer 5 and Self-Improvement Meta-Process.

**OpenClaw** — openclaw.ai
- Active March 2026 | Open source agent framework
- Skills-as-progressive-disclosure, skills wrapping MCP servers (65% of skills wrap MCP), channel adapters (Telegram, Slack, Discord).
- **Memory architecture (4 layers):** (1) Bootstrap files (SOUL.md, AGENTS.md, USER.md, MEMORY.md, TOOLS.md) — reloaded every session, permanent. (2) Session transcript — subject to lossy compaction. (3) LLM context window — 200K token budget, temporary. (4) Retrieval index — searchable layer over memory files (optional, via QMD or built-in hybrid search).
- **Key limitation: compaction is lossy.** When context fills, OpenClaw summarizes conversation history, permanently destroying detail. Instructions given only in chat (not written to files) are silently lost. Core principle: "if it's not written to a file, it doesn't exist." Bootstrap files capped at 20K chars per file, 150K aggregate.
- **Memory persistence is user-managed:** pre-compaction flush (automated but imperfect), manual save discipline, strategic file organization. The burden is on the user to maintain persistence.
- **Ditto relevance:** MEDIUM for patterns (skills-over-MCP adopted in architecture.md borrowing table), HIGH as competitive contrast. Ditto's memory architecture (ADR-003) solves the compaction problem structurally — memories extracted, reconciled, stored in SQLite with scope filtering and salience scoring. The harness manages persistence, not the user. See `docs/research/qmd-obsidian-knowledge-search.md` Section 5.
- **What NOT to adopt:** User-managed memory discipline. The file-first principle is correct (data must be persisted), but the mechanism should be structural (harness), not cognitive (user remembering to save).

---

## Decision Intelligence / Governance Layers

**Hark** — gethark.ai
- Commercial product | Active 2026 | Closed source
- Decision intelligence layer that sits between AI models and real workflows. Model-agnostic (Claude, GPT, Gemini, Copilot). Four pillars: policy/rules enforcement, expert routing, accountability capture, audit evidence generation. "LLMs Reason. Hark Decides."
- Production deployment at tier-one financial institutions (live mortgage workflow). Target: regulated industries (financial services, insurance, healthcare).
- **UI patterns of interest:** Process-as-stepped-wizard (process definition generates navigable step sequence), document integrity checking (metadata analysis before content extraction), field-level human validation with source cross-reference (extracted value shown alongside source document), activity log as standard process component (human + system events in unified timeline), decision rendering with reasoning chain + supporting visualizations.
- **Ditto relevance:** MEDIUM — not a build-from source (closed, commercial), but a strong **pattern** reference for how process execution UI should feel in regulated contexts. Six specific UI patterns extracted. Validates Insights 086 (composable UI — process-as-wizard is a valid composition), 087 (provenance — cross-reference pattern), 088 (document understanding — extends to integrity checking), 089 (artifact-first — documents are primary inputs). See `docs/research/hark-decision-intelligence-ui-patterns.md`.
- **Limitation:** Closed source — pattern-only learning. Narrow scope (regulated decisions only). No progressive trust (fixed review points). No learning-from-corrections visible. Pre-designed process UIs, not composable.

---

## Meeting Intelligence

**OpenOats** — github.com/yazinsai/OpenOats
- 2,014 stars | Active March 2026 | Swift 6.2 | MIT | macOS-only (Apple Silicon)
- "A meeting note-taker that talks back." Real-time meeting assistant: captures mic + system audio, transcribes locally (WhisperKit/CoreML), searches user's knowledge base (markdown/text files → chunked, embedded, vector-searched), surfaces relevant talking points during conversations via three-layer suggestion pipeline (prefetch → gate → synthesize). Generates structured meeting notes from templates (1:1, Customer Discovery, Hiring, Stand-Up, Weekly) using LLM post-processing. Supports cloud (OpenRouter, Voyage AI) and fully local (Ollama) modes.
- **Key patterns:** Three-layer suggestion pipeline (continuous prefetch with 30s TTL cache → RealtimeGate similarity/density filter → streaming LLM synthesis). Burst-decay throttle for attention management. Header-hierarchy-aware markdown chunking (80-500 words). Multi-query cosine similarity with max-score fusion + Voyage AI reranking. Template-guided note generation with 60K char transcript truncation (head/tail preserved).
- **Ditto relevance:** MEDIUM-HIGH — **pattern** for TypeScript engine (zero code transfer), but **adopt** candidate for native macOS companion app (fork, rebrand, connect to Ditto API). Three patterns map to Ditto layers: prefetch-gate-synthesize → L4 Awareness proactive intelligence (Insight-106), meeting-to-process pipeline → L1 Process discovery, burst-decay throttle → ADR-011 attention model. Meeting transcripts are one of the 7 data sources identified in `process-discovery-from-organizational-data.md`. Integration possible via webhook/transcript file monitoring (Option A/D in research report).
- **Limitation:** Swift/macOS-only — no code adoption path. 28 days old (created 2026-02-28) — patterns may reflect initial design not tested at scale. Two-speaker architecture (mic=you, system=them) with basic diarization — multi-party business meetings are an underexplored gap. See `docs/research/openoats-meeting-intelligence.md`.

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

### Knowledge Search

**QMD** — github.com/tobi/qmd
- 16.2k stars | Active March 2026 | TypeScript | MIT
- On-device markdown search engine. BM25 full-text + vector semantic + LLM re-ranking, all local via node-llama-cpp. SQLite-based index. MCP server (stdio or HTTP daemon). CLI and SDK interfaces.
- Collections with hierarchical context descriptions. Hybrid query expansion via reciprocal rank fusion.
- **Dependencies:** better-sqlite3 (same family as Ditto), sqlite-vec (alpha), node-llama-cpp, @modelcontextprotocol/sdk, zod. Node ≥22 required.
- **Ditto relevance:** MEDIUM — future composition target for knowledge search (Insight-042 knowledge-manager agent, Analyze mode org data ingestion). MCP server mode fits ADR-005 integration architecture cleanly. Not needed now (corpus is 130 files, 1.8MB — skill commands encode the knowledge map). See `docs/research/qmd-obsidian-knowledge-search.md`.
- **Limitation:** Very young (v2.0.1, 5 weeks since 1.0). sqlite-vec alpha. node-llama-cpp requires local model downloads (~100MB-1GB). Breaking changes between minors.

### Memory Systems (Tier 2 — Pattern Sources)

**Mem0** — github.com/mem0ai/mem0
- Active March 2026 | Python + TypeScript SDK
- LLM-driven memory extraction + reconciliation (ADD/UPDATE/DELETE/NONE). Scope filtering (user_id, agent_id, run_id). 22 vector store backends. Hybrid retrieval (BM25 + vector + optional reranking). Audit trail via SQLiteManager.
- **Ditto relevance:** HIGH for memory architecture. Reconciliation model adopted in ADR-003. Scope filtering maps directly to two-scope model. 90% fewer tokens than naive approaches with 26% accuracy gain. See `docs/research/memory-systems.md`.
- **Limitation:** Python-first. Vector-dependent at scale.

**memU** — github.com/NevaMind-AI/memU
- 13K stars | Active March 2026 | Python
- Three-layer hierarchy (Resource → Item → Category). Six memory types. Reinforcement counting. Salience scoring: `similarity × log(reinforcement+1) × recency_decay(half_life=30d)`.
- **Ditto relevance:** HIGH for memory scoring. Salience formula adopted in ADR-003 (Phase 3) and confirmed by ADR-012. Reinforcement counting pattern adopted. 92.09% accuracy on LOCOMO benchmark. See `docs/research/memory-systems.md`.
- **Limitation:** Python-only. Requires PostgreSQL + pgvector at scale.

**Graphiti/Zep** — github.com/getzep/graphiti
- Active March 2026 | Python | Neo4j-based
- Temporal knowledge graph. Entity/episode/community nodes. Bi-temporal edges (valid-time + system-time). LLM-driven contradiction detection. Hybrid retrieval (BM25 + cosine + graph traversal + RRF).
- **Ditto relevance:** MEDIUM for Phase 7+ when entity-relationship memory is needed (Insight-037 relational context dimension). Temporal invalidation pattern noted in ADR-003 as deferred alternative. See `docs/research/memory-systems.md` and `docs/research/context-and-token-efficiency.md`.
- **Limitation:** Requires Neo4j. Heavy infrastructure. Python-only.

**ReMe** — github.com/agentscope-ai/ReMe
- Active March 2026 | Python | FlowLLM-based
- Three memory types (Personal, Procedural, Tool). Dual backends: file-based (ReMeLight — Markdown + JSONL) and vector-based (Qdrant/Chroma/Elasticsearch). Hybrid retrieval (0.7 vector + 0.3 BM25). Incremental session summaries that merge into structured sections (Goal/Progress/Decisions/Next Steps). Pre-reasoning hook chain (compact tool results → check token budget → compact messages → persist summaries). Memory target namespacing per user/task/tool. Profile deduplication with LRU eviction (50/user). SOTA on LoCoMo (86.23%) and HaluMem QA (88.78%).
- **Ditto relevance:** HIGH for Conversational Self (Insight-056). Three patterns identified for adoption: (1) incremental session summaries — session continuity without full replacement, (2) memory target namespacing — supports `self` scope for persistent identity, (3) pre-reasoning context hook — maps to new harness handler between memory-assembly and step-execution. File-based path aligns with composition principle and auditability.
- **Limitation:** Python-only. FlowLLM runtime dependency (not applicable — Ditto has own harness). LLM-based summarization adds cost. Vector DB needed at scale (aligns with ADR-003 deferral).

**AutoResearch** — github.com/karpathy/autoresearch
- Active March 2026 | Python | Single-GPU ML experiment runner
- Stateless autonomous agent loop: modify single file → commit → run (5 min bounded) → evaluate → keep/discard. Git branch isolation per experiment. Markdown instructions as control plane. No memory, no identity, no session continuity.
- **Ditto relevance:** LOW. Bounded execution and outcome-driven loops already covered by trust tiers (ADR-007) and feedback recorder. Evaluated for Conversational Self — no applicable patterns. Useful reference for autonomous batch execution but not for persistent identity.
- **Limitation:** No memory architecture. No multi-session continuity. Single-domain only.

### Model Routing

**RouteLLM** — github.com/lm-sys/RouteLLM
- Active 2024-2026 | Python
- Open-source framework for cost-effective LLM routing. Trained on Chatbot Arena preference data. Multiple classifier types (similarity-weighted ranking, matrix factorization, BERT, causal LLM). 85% cost reduction on MT Bench, 45% MMLU, maintaining 95% performance. 40% cheaper than commercial routing.
- **Ditto relevance:** MEDIUM — validates cost-based cascade routing pattern adopted in ADR-012. Ditto uses process-declared tiers (not runtime classification), but the cost savings benchmarks inform the value proposition.
- **Limitation:** Python-only. Binary routing (strong vs weak) only — no multi-tier. Requires training data. Runtime per-prompt classification differs from Ditto's declarative process-level approach.

**LiteLLM Router** — github.com/BerriAI/litellm
- Active 2023-2026 | Python
- Unified LLM interface (100+ providers via `litellm.completion(model="provider/model")`). Router with operational routing strategies: cost-based (cheapest healthy deployment), latency-based (fastest cached response time), round-robin, semantic auto-routing. Redis-backed stats for production. Cooldown system for failing deployments.
- **Ditto relevance:** LOW-MEDIUM — operational routing patterns (fallback, cooldown) are useful references. But Ditto already has its own multi-provider `llm.ts` (Brief 032) and routes at the process level, not the infra level. LiteLLM optimizes for operational metrics, not output quality.
- **Limitation:** Python-only. Operational routing only (cost, latency) — no quality-based learning. Infrastructure layer, not an agent framework.

**Vercel AI SDK (model routing)** — github.com/vercel/ai
- Provider registry (`provider:model` string format), `customProvider` for user-defined aliases mapping capability hints to concrete models, per-call model selection, OpenTelemetry telemetry with `ai.response.model` (actual model used).
- **Ditto relevance:** MEDIUM — provider registry and alias patterns are well-designed. Ditto's `llm.ts` already implements a simpler version. `customProvider` alias pattern is the closest existing implementation to Ditto's model hint concept. See `docs/research/llm-model-routing-patterns.md` for full analysis.

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
| **Platform harness** | Cross-process | Governance, trust, dependency graph, learning | Ditto (our product) |
| **Process harness** | Per-process | Review patterns, quality gates, escalation, process memory | Sim Studio workflow, Open SWE thread |
| **Agent harness** | Per-agent | Identity, capabilities, agent memory, tool permissions, budget | agents.md + memory.md + skills/ |
| **Runtime** | Per-invocation | The actual LLM or script execution | Claude, GPT, script adapter |

**Architectural implication for Ditto:** Our current Layer 2 treats agents as stateless adapters (`invoke()` / `status()` / `cancel()`). The landscape shows each agent needs a persistent operating context — identity, memory, tools, permissions — that travels with it across process assignments. This "agent harness" sits between the adapter pattern and the process harness. See architecture.md for the formalised model.

### Memory Tiers in the Landscape

| Tier | Pattern | Who uses it | Limitation |
|------|---------|-------------|------------|
| **File-based** | memory.md, CLAUDE.md | Claude Code, Cursor, "AI Ditto" practitioner pattern | No query capability, no multi-agent coordination, no schema enforcement |
| **Thread-scoped** | Message history + metadata | Open SWE (LangGraph threads), Sim Studio (execution state) | Ephemeral — dies with the thread/run |
| **Database-per-agent** | Serverless Postgres with branching | Deeplake, db9.ai, Neon | Full SQL queryability, heavyweight infrastructure |

**Ditto approach:** Hybrid — process memory for process-specific learning (correction patterns, quality criteria), agent memory for cross-cutting capabilities (coding style, tool preferences, domain expertise). The harness merges both at invocation time. Start with SQLite (`memory` table with `scope_type` + `scope_id`), scale to dedicated storage when needed.

### Patterns Worth Adopting

| Pattern | Source | How it applies to Ditto |
|---------|--------|---------------------------|
| Handler registry | Sim Studio | Step executor should use registered handlers, not switch statements |
| Execution snapshot/resume | Sim Studio | Serialize full process run context for heartbeat pause/resume |
| Safety-net middleware (4-layer chain) | Open SWE | Error normalization → message injection → empty-output guard → structural guarantee. Composable middleware extending harness pipeline |
| Deterministic thread IDs | Open SWE | Hash `process-id:trigger-event` into stable run IDs for continuity |
| Mid-run message injection | Open SWE | Queue human context for injection before next step, don't interrupt |
| Handoff template taxonomy | agency-agents | 7 handoff types (standard, QA pass/fail, escalation, phase gate, sprint, incident) |
| Skills as progressive disclosure | "AI Ditto" practitioner pattern | Load agent capabilities on demand to keep context lean |
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
| **Markdown files** | "AI Ditto" practitioner pattern | Low floor, low ceiling — works until it doesn't |
| **Conversational** | Ditto (our architecture) | Highest accessibility, hardest to build |
| **Prompt library** | agency-agents (54K stars) | Technical users only despite non-technical marketing |

The "AI Ditto" practitioner pattern's key insight: **frame agents as employees**. The onboarding metaphor (job description → training manual → tools → institutional knowledge) maps to familiar business processes. Non-technical users know how to hire and manage people — they don't know how to configure workflows. Ditto's Explore mode conversational interface aligns with this, but our Process Builder should feel more like editing a document than configuring a workflow tool.

---

## Additional Sources (March 2026)

### agency-agents — github.com/msitarzewski/agency-agents
- 54k stars | Active March 2026 | Shell (conversion scripts) + Markdown
- ~130 agent persona definitions across 9 divisions. NEXUS coordination framework with handoff templates and quality gates.
- **Not a runtime or engine.** Prompt library with the human as orchestration bus — copy-paste between agents.
- **Ditto relevance:** LOW for architecture, MEDIUM for patterns. Handoff template taxonomy (7 types) is a useful schema for inter-step messaging. Quality gate pattern (dev↔QA loop with max retries and escalation) maps to harness review patterns. The Workflow Architect agent's spec format (handoff contracts, cleanup inventories, observable states) is genuine process design methodology.
- **What NOT to adopt:** The fundamental approach. Human-as-bus is the exact problem Ditto solves. 130+ persona definitions optimised for breadth, not depth.

### Sim Studio — github.com/simstudioai/sim
- 27k stars | Active March 2026 | TypeScript (monorepo: Next.js + Drizzle + PostgreSQL)
- Visual workflow builder: drag blocks on ReactFlow canvas, connect with edges, trigger via webhooks/cron/chat.
- **DAG executor** with 5-phase graph construction, queue-based concurrent execution, 14 block handlers via registry pattern.
- **Execution snapshot/resume** serialises full context to JSON for pause/resume — directly relevant to our heartbeat model.
- **Variable resolver chain** (Loop → Parallel → Workflow → Env → Block) for data flow between blocks.
- **Human-in-the-loop as first-class block type**, not bolted-on approval.
- **Ditto relevance:** HIGH for execution patterns. Handler registry, snapshot/resume, and variable resolution are battle-tested solutions to problems we face in Phase 2. Not architecturally aligned (workflow-as-harness, not process-as-primitive; no trust tiers or graduated autonomy; ephemeral runs, not durable processes).
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
- **Ditto relevance:** HIGH for harness patterns, MEDIUM for direct adoption (Python, single-purpose). The 4-layer middleware chain is the most concrete reference for extending our 5-handler harness pipeline. The `get_agent()` assembly is the reference implementation for architecture.md's agent harness assembly function.

### Deeplake / db9.ai — Agent-Native Databases
- **Core argument:** Databases were built for applications, not agents. Agents need sandboxed, branching-capable, multimodal storage — not memory.md files and not shared production databases.
- **Serverless Postgres per agent** with copy-on-write branching (experiment without risk), scale-to-zero economics, and multimodal storage (vectors, images, video, relational data in one system).
- **Challenges to memory.md pattern:** No query capability, no multi-agent coordination, no schema enforcement, no branching/versioning. Fine for single-agent scratchpads, breaks for production multi-agent systems.
- **Ditto relevance:** MEDIUM — validates our need for structured memory beyond flat files. Our SQLite approach is a pragmatic middle ground: queryable, schema-enforced, lightweight. The branching concept is interesting for trust tiers (agent works on a "branch," human approves the "merge"). Deferred to scale phase — serverless Postgres per agent is infrastructure we don't need for dogfood.

### "AI Ditto" Practitioner Pattern — (Greg Isenberg / Remy Gaskell, March 2026)
- Practitioner guide for building "digital employees" using Claude Code / Cursor / Codex.
- **Folder-structure-as-harness:** agents.md (brain/identity), memory.md (persistent learning), skills/ (SOPs as markdown), MCP (tool connections). The folder IS the agent's operating context.
- **Key patterns:**
  - `agents.md` as structured persona (role, mission, rules, deliverables, communication style, success metrics)
  - `memory.md` as agent-written persistent learning (corrections, preferences, domain knowledge) — self-improving loop
  - Skills as progressive disclosure — load on demand, not upfront, to keep context lean
  - "Choose your vehicle, the engine is the same" — harness wraps runtime at multiple levels
  - Hiring metaphor for non-technical users: job description → training manual → tools → institutional knowledge
- **Ditto relevance:** HIGH for non-technical user framing, MEDIUM for architecture. Validates our Explore mode and conversational setup. The folder-structure-as-harness is what non-technical users are already doing manually — Ditto should automate and formalise this pattern with governance, trust, and learning on top.

---

## Cognitive Science References (March 2026 Research)

**LIDA Cognitive Architecture** — Stan Franklin, University of Memphis
- Java-based cognitive architecture implementing Global Workspace Theory (GWT) — the most widely accepted theory of consciousness in cognition.
- Key mechanism: attention codelets form coalitions, compete for attention; winning coalition becomes conscious content and is broadcast globally. ~10 Hz cognitive cycles as "atoms of cognition."
- **Ditto relevance:** MEDIUM as conceptual reference for ADR-011 (attention model) and ADR-013 (cognitive model). LIDA's salience model (novelty, urgency, personal relevance, emotional valence) is richer than Ditto's current confidence-based routing. Not adoptable (Java, academic).
- **Limitation:** Java. Academic architecture, not production system.

**Cognitive Load Framework for Human-AI Symbiosis** — Springer 2026
- Framework for designing human-AI interfaces that minimise extraneous cognitive load. Human working memory holds 3-5 items. Dominant design imperative: reduce extraneous load so limited working memory resources are devoted to intrinsic task demands.
- **Ditto relevance:** MEDIUM as design principle reference for review UX (ADR-013). Informs cognitive mode framing: match review interface density to cognitive demand of the task.

---

## Agent-Driven UI Protocols (March 2026 Research)

**A2UI (Agent-to-User Interface)** — github.com/google/A2UI
- Released December 2025 by Google. Apache 2.0 license. Version v0.8-v0.9.
- Declarative protocol for agents to compose UI at runtime. Agent emits JSON referencing a trusted component catalog; client renders natively. Framework-agnostic (React, Flutter, SwiftUI).
- Security model: no code execution — agents can only reference pre-approved component types.
- **Ditto relevance:** MEDIUM — architecturally aligned with our 16 primitives as a trusted catalog. However, doesn't encode Ditto's unique dimensions (6 jobs, trust tiers, process context, feedback capture). Deferred to Phase 13 (multi-platform) for re-evaluation.
- **Limitation:** v0.9 — early. Doesn't solve a problem Ditto has on web (React already composes at runtime).

**AG-UI (Agent-User Interaction Protocol)** — github.com/ag-ui-protocol/ag-ui
- Event-driven bidirectional protocol connecting agent backends to user-facing applications. Complements A2UI.
- 17 event types across 7 categories (lifecycle, text, tool calls, state, activity, reasoning, special). Snapshot-delta pattern (JSON Patch RFC 6902). Transport-agnostic (SSE, WebSocket, webhooks). JS SDK: `@ag-ui/client` (`packages/client/src/`). Apache 2.0.
- Growing adoption: CopilotKit, LangGraph, CrewAI, Mastra, Microsoft, Google ADK, Pydantic AI.
- **Ditto relevance:** MEDIUM-HIGH — Phase 10 dashboard needs real-time engine-to-frontend streaming. AG-UI's event taxonomy maps closely to Ditto's existing harness events (`src/engine/events.ts`). The snapshot-delta pattern matches json-render's streaming format. Evaluate: adopt the protocol directly (interoperability with CopilotKit), or adopt the event taxonomy only and implement Ditto-native streaming. See `docs/research/phase-10-dashboard-workspace.md` Section 4.4.

**DivKit (Yandex)** — github.com/divkit/divkit
- Apache 2.0. Open-source cross-platform SDUI framework (JSON → native UI for Android, iOS, Web, Flutter).
- Visual editor with live preview, Figma plugin. Production-proven at Yandex scale.
- **Ditto relevance:** LOW — solves multi-platform rendering problem we don't have yet. Reference for Phase 13 mobile.

**Verdict (ADR-009):** No formal view composition protocol for Phase 10 web dashboard. Standard React component architecture with the 16 primitives. Formal protocol deferred to Phase 13 when multi-platform rendering creates a real problem. See `docs/research/runtime-composable-ui.md` for full landscape survey.

---

## What's Genuinely Ours to Build

No existing framework implements these — they are Ditto's unique value:

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
