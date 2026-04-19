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
- **Ditto relevance:** LOW — operational routing patterns (fallback, cooldown) informed ADR-026 design. Ditto now has purpose-based multi-provider routing (Brief 096, Insight-157) that routes by task purpose, not operational metrics. Preference-list fallback across providers implemented.
- **Limitation:** Python-only. Operational routing only (cost, latency) — no quality-based learning. Infrastructure layer, not an agent framework.

**Vercel AI SDK (model routing)** — github.com/vercel/ai
- Provider registry (`provider:model` string format), `customProvider` for user-defined aliases mapping capability hints to concrete models, per-call model selection, OpenTelemetry telemetry with `ai.response.model` (actual model used).
- **Ditto relevance:** MEDIUM — provider registry and `customProvider` alias pattern informed the original `model_hint` design (Brief 033) and the upgraded purpose-based routing (ADR-026). Ditto's implementation now goes beyond Vercel's: multi-provider simultaneous loading + purpose-based routing (not just aliases within one provider).

### CLI
| Option | Stars | Fit | Notes |
|--------|-------|-----|-------|
| **@clack/prompts** | 5.1k dependents | Best (UX) | Beautiful prompts. Used by Astro, Svelte scaffolders. Perfect for approve/edit/reject. |
| **citty** (UnJS) | - | Best (routing) | TypeScript-first, ESM, minimal. Great type inference. |
| **Commander.js** | 27k | Established | Most widely used. Less TypeScript-native than citty. |
| **Ink** | - | Overkill | React for terminals. Too heavy for our needs. |
| **oclif** | - | Overkill | Enterprise-grade. Significant boilerplate. |

**Recommendation:** citty (command routing) + @clack/prompts (interactive UX).

### Voice / Conversational AI

**ElevenLabs Conversational AI** — elevenlabs.io
- Industry-leading TTS quality. Conversational AI SDK supports sub-second voice interactions (~600ms total latency: STT ~200ms + LLM ~232ms + TTS ~200ms).
- Server SDK (`elevenlabs` npm, depend level): programmatic agent creation/update, signed URL generation for private agents. React SDK (`@elevenlabs/react`, depend level): `useConversation` hook with `startSession`, `endSession`, `sendUserMessage`, `sendContextualUpdate`, `sendUserActivity`, `onMessage`, `onModeChange`, `onVadScore`.
- Server tools (webhooks): agent calls back to your server during conversation. Supports `constant_value` and `dynamic_variable` in request schemas. Tool timeout configurable (default 10s).
- LLM options: hosted fast models (GLM-4.5-Air, Qwen3) for speed, or custom LLM endpoint for intelligence. Fast models are unreliable at complex tool calling (Insight 178).
- **Ditto relevance:** HIGH — adopted as voice transport layer. Harness owns intelligence via server tools (Insight 178: voice as transport, harness as brain). Used for front door voice channel (Brief 142b). SDK quality is excellent; API docs are clear.
- **Limitation:** Fast LLM can't follow complex process instructions — intelligence must be pushed via contextual updates. No built-in transcript persistence. Agent config update via SDK is buggy (REST API used directly).

**SDK method semantics — Brief 180 findings:**

| Method | Behaviour | Source | Ditto use |
|--------|-----------|--------|-----------|
| `sendContextualUpdate(text)` | Injects a system-role message into the agent's next-turn context. Does NOT interrupt mid-speech. Fires no message back to the client. | `@elevenlabs/react` SDK surface (`ConversationControls.d.ts`) + matches observed behaviour in front-door. **CONFIRMED.** | Primary push channel. `voice-call.tsx` emits one per guidance delta (push_fired). |
| `sendUserMessage(text)` | Treated as a user turn — triggers an agent response. | SDK surface + Brief 150 integration testing. **CONFIRMED.** | Reserved for text-side messages the user sends during a voice call. |
| `sendUserActivity()` | Undocumented. Name implies "user is still speaking/typing" — may defer agent turn. **UNVERIFIED.** See probe below. | SDK surface only. | **NOT SHIPPED.** Gated on `VOICE_PATIENCE_HEARTBEAT_ENABLED` flag, which is off until probe returns `CONFIRMED_DEFERS_TURN`. |
| `onModeChange({mode})` | Fires when agent transitions `listening` ↔ `speaking`. **CONFIRMED** via event-handler wiring. | SDK surface + Brief 180 integration. | Used as the push trigger: when agent transitions `speaking → listening`, we refresh guidance so the next agent turn starts from current harness state. |

**SDK probe status (Brief 180 AC 22):** `sendUserActivity` probe is `PROBE_NOT_RUN` — automated probe requires a live ElevenLabs session and ElevenLabs credits (browser-only SDK, no Node transport). Procedure documented in `scripts/voice-sdk-probe.ts`. Until the human operator runs the probe and updates this row, the patience-heartbeat feature does not ship. The brief's explicit fallback (AC 24) permits this: shipping the rest of Brief 180 while the heartbeat stays disabled is the correct path.

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

## AI SDR / BDR and Network Introduction Platforms (2026-04-05)

New category added for Brief 079 (Network Agent MVP). Full report: `docs/research/ai-sdr-and-network-introduction-platforms.md`.

### AI SDR/BDR Tools

**11x (Alice)** — 11x.ai
- Hierarchical multi-agent architecture. ~2M leads, ~3M messages, ~21K replies (~2% reply rate). Ghostwriting model. $50M Series B, $350M valuation. High churn. Credibility issues (fake customer logos).
- **Ditto relevance:** LOW — volume-first, single-tenant, no trust model. Multi-agent sub-specialization pattern worth studying.

**Artisan (Ava)** — artisan.co (YC)
- 10-min conversational onboarding → knowledge base. 270M+ contact DB. Ghostwriting in user's voice. Built-in deliverability. $25M Series A, ~$5M ARR.
- **Ditto relevance:** MEDIUM — conversational intake pattern directly applicable to Ditto onboarding. Deliverability infrastructure as reference. Volume model does not fit.

**Clay** — clay.com
- Data orchestration, not outreach. 150+ data providers. Waterfall enrichment (80%+ match rates). Claygent (GPT-4) for autonomous web research. 100K+ users, 10x YoY growth.
- **Ditto relevance:** MEDIUM-HIGH — waterfall enrichment pattern and Claygent research pattern both adoptable for person enrichment. Not a competitor (different category).

**Relevance AI** — relevanceai.com (Australian)
- Agent builder platform. Custom BDR workflows. Autonomous research direction. Event-triggered agents.
- **Ditto relevance:** LOW — technical platform for sales teams, not end-user product. Agent builder pattern noted.

### Network Introduction Platforms

**Lunchclub** — lunchclub.com
- AI superconnector for 1:1 video meetings. Post-meeting feedback → match quality. Club points as trust currency. Invite-only quality gate.
- **Ditto relevance:** MEDIUM — outcome-based learning (not profile matching) is key pattern. Points/reputation system informative. No AI intermediary character.

**Commsor** — commsor.com
- Go-to-Network (GTN) platform. Surfaces existing connections for warm intros. Data from Slack, LinkedIn, CRM. Warm intros: 3% no-show, 3-5x conversion.
- **Ditto relevance:** MEDIUM — relationship surfacing and warm intro metrics as benchmarks. Enterprise GTM tool, not SMB. No AI intermediary.

### Email Infrastructure for AI Agents

**AgentMail** — agentmail.to
- Purpose-built email infrastructure for AI agents. Programmatic inbox creation via API. Native reply handling with `extractedText` (reply content without quoted history). Thread management. Webhooks for inbound messages (`message.received`, `message.bounced`). Custom domains with DNS verification. WebSocket support for real-time. Usage-based pricing with free tier. $6M seed funding. MIT-licensed Node.js and Python SDKs.
- **Ditto relevance:** HIGH — primary email adapter for Network Agent. Key advantages over Gmail API: per-agent inbox creation (`alex@ditto.partners`), extracted reply text for agent processing, native threading, and inbound webhooks. `depend` level (npm install). Gmail retained as fallback for workspace email (inbox triage). See `integrations/agentmail.yaml`.

**googleapis** — github.com/googleapis/google-api-nodejs-client (12k+ stars, Apache-2.0)
- Official Google APIs Node.js client. Covers 200+ Google APIs including Gmail, Calendar, Drive, Sheets. OAuth2 client built-in (`google.auth.OAuth2`) with automatic token refresh. Gmail API: `gmail.users.messages.send` for sending, `gmail.users.messages.list`/`.get` for reading. Typed interfaces generated from discovery docs. Maintained by Google (googleapis org). Weekly releases. 2M+ weekly npm downloads.
- **Ditto relevance:** HIGH — server-side Gmail API access for `agent-of-user` and `ghost` sending identities (Brief 152). CLI (`gws`) is inappropriate for programmatic OAuth token management — the SDK handles token refresh, credential lifecycle, and API call construction. `depend` level (npm install). Mature, official, heavily used.
- **Why not alternatives:** `gmail-api-parse-message` (low maintenance), `nodemailer` with OAuth2 (adds unnecessary SMTP layer), raw REST (reimplements what the SDK provides). The official SDK is the obvious choice for server-side Google API access.
- **Scopes needed:** `gmail.send` (send as user), `gmail.readonly` (read sent mail for voice learning + contact extraction), `userinfo.email` (verify account).

### Market Signal

AI SDR market in correction: 50-70% churn within 3 months. Hybrid (AI+human) model: 2.3x more revenue than AI-only. Warm intros: 3-5x conversion vs cold. Ditto's low-volume, relationship-first, trust-progressive model is validated by market data.

### Ditto-Original (No Existing Solution)

- Named AI intermediary with compounding reputation (Insight-144)
- Cross-instance person memory / network intelligence (Insight-146)
- Mode-shifted alignment (Self / Selling / Connecting)
- Refusals as trust-building feature
- Relationship-first outreach for SMB owners

### Managed OAuth & Integration Platforms (2026-04-17, ADR-031)

**Nango** — github.com/NangoHQ/nango (6.9k stars, TypeScript 96%)
- Code-first integration platform: 700+ APIs with managed OAuth + automatic token refresh. Self-hostable (Docker/Helm) or cloud. SOC 2 Type II, HIPAA, GDPR compliant. Integrations authored as TypeScript functions, git-tracked, CI/CD-deployed. Syncs (scheduled pulls) + actions (agent-triggered) model. Per-tenant isolation, retries, rate-limit handling.
- **Classification: DEFERRED (ADR-031).** Elastic License v2 restricts "providing the software to third parties as a hosted or managed service, where the service provides users with access to any substantial set of the features or functionality of the software." A conservative reading triggers for the Ditto Network Service (managed-cloud hosts OAuth functionality for paying users). Commercial licence from NangoHQ would resolve the ambiguity; not pursued yet.
- **Re-evaluation trigger (Phase 12, owner: Dev PM):** ≥3 unplanned integration requests per week sustained over one month AND a commercial-licence conversation with NangoHQ completed (pricing in hand OR legal confirmation that ELv2 does not apply). Canonical definition: ADR-031.
- **What we adopted anyway (patterns, not code):** brokered-credentials invariant, refresh-before-expiry pattern, integration-as-declaration (YAML registry). See ADR-031 §Provenance.

**Composio** — composio.dev (27.4k stars, MIT, TypeScript + Python)
- 1000+ pre-built tool integrations. Managed OAuth/credential vault (SOC 2). Tool Router for runtime tool discovery. MCP server support (Rube) — 850+ apps. Framework-agnostic (OpenAI, Anthropic, LangChain, CrewAI, Mastra). **Primarily a cloud service** — SDK connects to Composio's hosted backend, not self-hostable.
- **Classification: DEFERRED (ADR-031).** Cloud-only conflicts with Ditto owning the integration layer directly and with self-hosted Track B. "Brokered credentials" pattern already adopted at the ADR-005 level without Composio dependency.

**Decision (ADR-031):** Build core OAuth inside the Network Service for top-5 providers (Gmail, Google Calendar, Google Drive, Slack, Notion). Top-5 is small enough that building is cheaper than integrating. Re-evaluate Nango when coverage demand exceeds engineering patience. Keep the integration-handler shape provider-agnostic so a Nango-backed handler can slot in later without re-architecture.

### Browser Automation (2026-04-13, extended 2026-04-17, Browserbase products detailed 2026-04-19)

**Stagehand SDK** — github.com/browserbase/stagehand (8k+ stars, TypeScript + Python, MIT)
- AI browser SDK built on Playwright. Four primitives: `act`, `extract`, `observe`, `agent`. Supports Anthropic, OpenAI, Gemini via Vercel AI SDK. Runtime modes: `env: "LOCAL"` (local headless Chromium) and `env: "BROWSERBASE"` (remote Chromium via CDP).
- **Classification:** ADOPT — TypeScript-first, MIT license, clean API, actively maintained. Young project (startup-backed, 8k stars) — adoption validated in Brief 134 READ-only use.
- **Ditto usage:** `browse_web` self-tool (Brief 134). READ-only: `extract` primitive. Configured `env: "LOCAL"` (no Browserbase cloud dependency). SSRF guard blocks private/internal addresses. Token budget hard-enforced. Model configurable via `STAGEHAND_MODEL` env var.
- **WRITE/act modality status (2026-04-17):** unexplored in Ditto. `act` / `agent` / `observe` primitives available but not surfaced; `WRITE_INTENT_PATTERNS` at `src/engine/self-tools/browser-tools.ts:52-79` blocks writes at the tool boundary. Brief 182 family scopes WRITE via **direct Playwright**, not Stagehand — keeps self-tool vs integration tracks separate.
- **Full evaluation:** `docs/research/linkedin-ghost-mode-and-browser-automation.md` (READ/LinkedIn), `docs/research/authenticated-saas-browser-automation.md` (WRITE/authenticated-SaaS), `docs/research/browserbase-product-family.md` (Browserbase peripherals).

**Browserbase Cloud Runtime** — browserbase.com (Added 2026-04-19)
- Hosted Chromium-over-CDP service. Replaces the local headless-Chromium transport used by Stagehand or Playwright without changing caller code. **Pricing as checked 2026-04-19 — verify at the pricing page before any adoption decision:** Free $0 (3 concurrent, 1 hr, 15-min sessions, no captcha/stealth); Developer $20/mo (25 concurrent, 100 hr, basic stealth, captcha); Startup $99/mo (100 concurrent, 500 hr, 5 GB proxies, basic stealth); Scale custom (250+ concurrent, advanced stealth, HIPAA BAA, DPA, SSO).
- **Classification:** DEPEND CANDIDATE — evaluated, not adopted. Brief 182 line 85 explicitly excludes cloud runtime from sub-briefs 183–185 ("MUST NOT require Browserbase cloud"). Candidate for a future `BrowserRuntimeBrowserbase` implementation of the Brief 183 interface seam when Network deployment or anti-bot fingerprinting creates a real trigger.
- **Ditto relevance:** MEDIUM-HIGH when Network Service becomes multi-tenant (per-tenant isolation, no Chromium on the hub) and/or when datacenter IPs get blocked by target SaaS. LOW while single-user / local-CLI.
- **Open Question 1** in Brief 182 (Runtime isolation for Network) is the decision gate that would re-surface this.
- **Full evaluation:** `docs/research/browserbase-product-family.md` §Product 2.

**Browserbase Browse CLI (`bb`)** — `@browserbasehq/cli` (Added 2026-04-19)
- OSS terminal CLI for coding agents. Commands: `bb fetch` (URL → clean content), `bb search`, `bb browse open`, `bb sessions list/logs`, `bb functions init/dev/publish`. Session persistence via Browserbase cloud contexts (cookies + localStorage survive across invocations). Positioned for Claude Code / Cursor / Codex integration.
- **Classification:** PATTERN CANDIDATE — shape overlaps Brief 184's planned `pnpm cli browser auth <service>` session-capture command. Not a depend candidate: subprocess boundary, session persistence tied to Browserbase account rather than Ditto vault, Functions deploy path forks Ditto's runtime.
- **Ditto relevance:** LOW as dependency; MEDIUM as prior art for CLI session-capture UX.
- **Full evaluation:** `docs/research/browserbase-product-family.md` §Product 3.

**Browserbase Director** — browserbase.com/director (Added 2026-04-19)
- Hosted UI for building browser agents from natural language. NL task description → executable Stagehand code export; real-time visual playback; mid-execution NL corrections; scheduled / parallel-scaled runs; 1Password integration for credentials. Free trial tier; production runs meter against the tenant's Browserbase usage budget.
- **Classification:** PATTERN CANDIDATE only — UI product, not a library. Closest prior art for Brief 186 (deferred `stagehand-agent-authoring.md`). Export format ("Stagehand code") is the primary study artefact.
- **Ditto relevance:** LOW as dependency; MEDIUM as UX reference if/when Brief 186 is scheduled.
- **Full evaluation:** `docs/research/browserbase-product-family.md` §Product 4.

**Playwright MCP (Microsoft)** — github.com/microsoft/playwright-mcp (TypeScript, Apache-2.0, Added 2026-04-17)
- Official Microsoft MCP server wrapping Playwright. Exposes tools: `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot` (accessibility-tree, not pixels), `browser_select_option`, `browser_wait_for`, `browser_pdf_save`, `browser_file_upload`, and others. Snapshot-based (a11y-tree rather than vision).
- **Classification:** UNEVALUATED — candidate for DEPEND or ADOPT if Ditto's MCP handler ships. Maps cleanly to ADR-005's existing MCP protocol slot; `--user-data-dir` flag supports persistent auth sessions. Brief 183's `BrowserRuntime` interface permits a future `BrowserRuntimePlaywrightMcp` implementation without caller changes.
- **Ditto relevance:** HIGH if a second MCP-server use case arrives and justifies building the generic MCP handler. Otherwise MEDIUM while direct Playwright covers the WRITE path.
- **Full evaluation:** `docs/research/authenticated-saas-browser-automation.md` §Modality 3.

**Anthropic Computer Use** — part of Anthropic SDK (Added 2026-04-17)
- LLM-driven vision-based browser/desktop control. Screenshot → model → `computer` tool calls (`click`, `type`, `key`, `screenshot`). Tool versioned; specific identifier to be verified per Insight-180 before adoption.
- **Classification:** UNEVALUATED — PATTERN / DEPEND-on-SDK-tool. Viable when vision is needed (canvas apps, Citrix, UIs without good a11y tree).
- **Ditto relevance:** MEDIUM — handles any visual UI but Claude-only (violates ADR-026 multi-provider goal); expensive per step (vision tokens per screenshot).
- **Full evaluation:** `docs/research/authenticated-saas-browser-automation.md` §Modality 2.

**Hosted-browser alternatives to Browserbase:** Steel Browser (github.com/steel-dev/steel-browser, OSS self-hostable), Anchor Browser (anchorbrowser.io), Hyperbrowser (hyperbrowser.ai), Airtop (airtop.ai). Catalogued but not individually evaluated. Any would be a candidate if Brief 183's `BrowserRuntime` interface gains a hosted implementation; comparative research is a separate Researcher invocation. See `docs/research/authenticated-saas-browser-automation.md:119-125` and `docs/research/browserbase-product-family.md` §Alternatives.

**browser-use / Skyvern / AgentQL / Firecrawl-actions / Gumloop / n8n / OpenAI Operator** — surveyed but not individually evaluated. See `docs/research/authenticated-saas-browser-automation.md` §Modality 4.

### Hub-and-Spoke Deployment (2026-04-06)

New category for Insight-152 (Network Service is centralized). Full report: `docs/research/centralized-network-service-deployment.md`.

**Temporal** — temporal.io
- Central orchestration + distributed workers. Workers poll task queues. Central server owns workflow state and history.
- **Ditto relevance:** HIGH (pattern) — the hub-and-spoke model maps directly to Network Service (hub) + Workspaces (workers).

**Inngest** — inngest.com
- Central event bus + distributed function execution. Apps register webhook endpoints; Inngest calls them on events.
- **Ditto relevance:** HIGH (pattern) — Network fires events, Workspaces receive via webhook/SSE.

**Turso** — turso.tech
- Hosted SQLite (libSQL) with embedded replicas. Local reads, remote writes, periodic background sync.
- **Ditto relevance:** HIGH (future depend) — per-user Turso databases as long-term Network ↔ Workspace sync. Free tier: 100 databases, 5GB. Drizzle-compatible.

**Composio** — composio.dev
- Centralized credential/tool proxy for AI agents. `composio.create(user_id)` for multi-tenant session isolation.
- **Ditto relevance:** MEDIUM (pattern) — user-scoped session pattern applicable to Network API design.

---

## Managed Agent Infrastructure (2026-04-09)

### Claude Managed Agents (Anthropic, beta)

- Managed container-based agent execution service. Four concepts: Agent (versioned config: model + system prompt + tools + MCP), Environment (container template with packages/networking), Session (running agent instance), Events (SSE-based message exchange). Built-in tools: bash, file read/write/edit, glob, grep, web search/fetch. Custom tools (client-executed, JSON schema). MCP server integration. Multi-agent orchestration (coordinator → callable agents, shared filesystem, isolated context threads — research preview). Memory stores (path-based, versioned, auditable, optimistic concurrency via content_sha256 — research preview). Outcomes (rubric-based grading with separate evaluator context, iterative refinement up to 20 cycles — research preview). SSE streaming with typed events, mid-stream interrupts, tool confirmation flow. Agent versioning with optimistic concurrency. `ant` CLI for management. SDKs: Python, TypeScript, Go, Java, C#, Ruby, PHP.
- **Classification:** PATTERN (study the approach, implement your way) for now. Upgradable to DEPEND when Track B deployment needs a cloud runtime.
- **Ditto relevance:** MEDIUM-HIGH as future runtime substrate for Layer 2 adapter pattern. Maps to the runtime inside `claudeAdapter.execute()` — everything above (harness pipeline, trust, memory assembly, review patterns, learning) stays Ditto. Multi-agent threads provide genuine context isolation for maker-checker review patterns. Outcomes grader validates Ditto's spec-testing review pattern. Memory store versioning/redaction patterns worth adopting for Ditto's `memories` table. Natural first consumer: Ditto Network (ADR-025) for Alex/Mira cloud execution.
- **Limitation:** Claude-only (no multi-provider). Beta API — will change. Open bash access inside containers (loses Ditto's fine-grained tool control: allowlisted commands, path traversal prevention, secret deny-list). Opaque agent loop — Ditto can't control turn-by-turn execution, memory injection, or confidence parsing inline. No process governance, trust tiers, or learning-from-feedback. Cost model unclear. User workspace agents that need Ollama/OpenAI stay on existing adapters.
- **Patterns to adopt:** (1) Memory versioning with `content_sha256` optimistic concurrency — solves concurrent write conflicts during parallel process runs. (2) Immutable version history with redaction — compliance/PII handling gap in Ditto's memory system. (3) Multi-agent thread isolation model — better maker-checker runtime than same-API-call or CLI subprocess.
- **Watchpoint:** Monitor quarterly for upward feature creep into process orchestration, trust systems, or human-facing interfaces. Current trajectory is infrastructure, not product. If they ship workflow orchestration or earned trust, re-evaluate from complementary to competitive.
- See `docs/research/claude-managed-agents-architectural-review.md` and Insight-165.

---

## Social Content Publishing APIs (2026-04-13)

### Unipile Posts API (LinkedIn)

- Part of the `unipile-node-sdk` already in use for social DMs (Brief 133). `UsersResource.createPost()` publishes feed posts with text and optional image attachments. Same connected account, same SDK, no additional auth.
- **Classification:** DEPEND — already paying per connected account.
- **Ditto relevance:** HIGH — publishes LinkedIn feed posts from GTM pipeline `land-content` step after GATE approval. No additional setup beyond existing Unipile connection.
- **Limitation:** Feed posts only — no LinkedIn articles (long-form). TypeScript SDK types don't include the Posts API resource (requires type cast). No built-in scheduling.
- See ADR-029 for adoption decision.

### X API v2 (Tweets/Threads)

- Official REST API at `api.x.com/2/tweets`. Pay-per-use since 2026: $0.01/tweet (~$1-2/month at GTM volume of ~20 tweets/week). OAuth 1.0a for single-user posting. Thread support via sequential tweets with `reply.in_reply_to_tweet_id`.
- **Classification:** DEPEND — official API, no SDK (direct `fetch`), minimal surface.
- **Ditto relevance:** HIGH — publishes X tweets and threads from GTM pipeline `land-content` step. `XApiClient` class in `channel.ts` handles OAuth 1.0a signing, single tweets, and thread posting with partial failure handling.
- **Limitation:** Requires separate X developer account and API keys (one-time setup). OAuth 1.0a is single-user; multi-user would need OAuth 2.0 with PKCE. No free tier for new developers.
- See ADR-029 for adoption decision.

### Buffer API (not adopted)

- Third-party scheduling/publishing service. Supports LinkedIn + X. $6/mo/channel. OAuth required.
- **Classification:** NOT ADOPTED — adds a dependency for both channels when Unipile (already paying) covers LinkedIn and X API v2 is cheaper for X.
- **Ditto relevance:** LOW for v1 — both channels publish natively. Could be reconsidered for scheduling/analytics if needed later.
- See ADR-029 for evaluation rationale.

---

## Release Distribution + Signing (2026-04-17)

Added to support Brief 181 (Network-Scale Recursive Self-Improvement) and ADR-034 (Release Distribution Model). Full survey in `docs/research/network-scale-rsi-tech-choices.md` §Topic 1.

**TUF — The Update Framework** — theupdateframework.github.io/specification/latest/ (spec, CNCF-adjacent, Added 2026-04-17)
- Specification for secure software update distribution with four-role threshold signing (root/targets/snapshot/timestamp), delegation, versioned metadata, and defenses against 12 documented attack classes including rollback, freeze, fast-forward, and key compromise.
- **Classification:** ADOPT (via `tuf-js`) for ADR-034 signing protocol.
- **Ditto usage:** core signing protocol for network release manifests per ADR-034 §1. Nodes verify signed releases via walk-forward metadata protocol.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1A.

**tuf-js (theupdateframework/tuf-js)** — github.com/theupdateframework/tuf-js (82 stars, TypeScript 97.5%, MIT, Added 2026-04-17)
- Reference TypeScript TUF client implementation. Latest: tuf-js@5.0.1 (April 2026). Maintained by `theupdateframework` org. Production exemplars: PyPI (via PEP 458 Python TUF sibling), Docker Notary v1. Not the library behind npm's package-provenance stack (that's Sigstore/keyless).
- **Classification:** DEPEND — mature, typed, actively maintained.
- **Ditto usage:** ADR-034 §1 release signing + verification. Sub-brief 184.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1A.

**Sigstore / cosign (sigstore/cosign)** — github.com/sigstore/cosign (5.8k stars, Go 98.7%, Apache-2.0, Added 2026-04-17)
- Keyless artifact signing: OIDC-bound short-lived certificates from Fulcio CA, signatures logged in Rekor transparency log. Used by npm provenance, GitHub Actions attestations, PyPI pilots, Kubernetes SLSA compliance.
- **Classification:** PATTERN + DEPEND (Rekor only, optional) — full keyless model rejected for Ditto because it requires live Fulcio at sign time, blocking the air-gap ceremony requirement in ADR-034 §1. Rekor transparency log is adopted optionally for post-hoc audit (`verify_rekor: false` default per ADR-034).
- **Ditto usage:** optional Rekor entry submission per release for audit trail.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1B.

**sigstore-js (sigstore/sigstore-js)** — github.com/sigstore/sigstore-js (178 stars, TypeScript 98.2%, Apache-2.0, Added 2026-04-17)
- TypeScript Sigstore client, used by npm for provenance signing.
- **Classification:** EVALUATE — only if ADR-034 §1 Rekor optional-integration ships. Otherwise unused.
- **Ditto usage:** potential Rekor lookup client for optional verification, sub-brief 184.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1B.

**npm ECDSA registry signatures + npm/ssri** — github.com/npm/ssri (Node ecosystem utility, MIT, Added 2026-04-17)
- SSRI (Subresource Integrity) for content hashing and ECDSA registry signatures over package metadata. Verified via `npm audit signatures`. Single-key model, no delegation or rotation protocol.
- **Classification:** SKIP for Ditto's use case — signing protocol too minimal (no rotation, no threshold). SSRI hash format itself is useful if Ditto needs content-hash fields in release manifests.
- **Ditto usage:** SSRI hash format as a reference if ADR-034 sub-brief 184 designs release-manifest content-hash fields.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1C.

**Omaha Protocol (google/omaha)** — github.com/google/omaha (Chrome auto-update stack, Apache-2.0, Added 2026-04-17)
- Chrome's auto-update protocol. Handles version targeting, differential updates, staged rollout, channel assignment. Purpose-built for installed-app fleet; not a pure signing system (signing delegated to OS layer).
- **Classification:** PATTERN (for staged rollout concepts) + SKIP (as a product — too heavy, wrong shape for pull-based node updates).
- **Ditto usage:** staged-rollout pattern reference for ADR-034 §4; not adopted as a product.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1D.

**in-toto / SLSA** — github.com/in-toto/in-toto (994 stars, Python, Apache-2.0 + Apache-2.0 for SLSA framework, Added 2026-04-17)
- Specification for supply-chain provenance attestations. SLSA (Supply-chain Levels for Software Artifacts) builds graded assurance levels on top. in-toto attestations are JSON documents describing build inputs, steps, outputs, signed separately.
- **Classification:** ADOPT — composable with TUF signing; attestations carry build provenance.
- **Ditto usage:** ADR-034 §1 release manifests include in-toto attestations under the targets key describing build commit, workflow, input artifacts.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1F.

**Notary v2 / notation (notaryproject/notation)** — github.com/notaryproject/notation (477 stars, Go 95.5%, Apache-2.0, CNCF Incubating, Added 2026-04-17)
- OCI-native signing via the OCI distribution-spec referrers API. Plugin architecture supports multiple backends including Sigstore.
- **Classification:** SKIP for Ditto v1 — requires OCI artifact format for distribution, which Ditto does not use. Worth revisiting if Ditto later ships as OCI artifacts.
- **Ditto usage:** none at v1.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1G.

**gh attestation (cli/cli)** — part of GitHub CLI, GitHub-specific, Added 2026-04-17
- GitHub's attestation tooling built on Sigstore. `gh attestation sign` produces keyless Sigstore attestations tied to GitHub Actions workflow identity.
- **Classification:** SKIP — vendor lock-in on GitHub; incompatible with ADR-034's air-gap ceremony.
- **Ditto usage:** none.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §1H.

## Progressive Delivery + Feature Gating (2026-04-17)

Added to support Brief 181 and ADR-034 §4 rollout gating. Full survey in `docs/research/network-scale-rsi-tech-choices.md` §Topic 3.

**Argo Rollouts (argoproj/argo-rollouts)** — github.com/argoproj/argo-rollouts (3.4k stars, Go 86.7%, Apache-2.0, v1.9.0 March 2026, Added 2026-04-17)
- Kubernetes controller for progressive delivery (blue-green, canary, progressive rollout). Configurable step-based traffic splits with metric-driven analysis (`AnalysisTemplate`) between steps. Automatic rollback on analysis failure.
- **Classification:** PATTERN (staged rollout + metric-gated progression concepts) — product skipped because it's Kubernetes-native and Ditto's rollout model is pull-based, not traffic-split.
- **Ditto usage:** stage progression + gate pattern informing ADR-034 §4; not adopted as a dependency.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §3B.

**Flagger (fluxcd/flagger)** — github.com/fluxcd/flagger (5.3k stars, Go 91.7%, Apache-2.0, v1.42.0 October 2025, Added 2026-04-17)
- Progressive delivery controller for Kubernetes + service mesh (Istio, Linkerd, NGINX). Deeper traffic-routing integration than Argo Rollouts; automated A/B testing.
- **Classification:** SKIP — service-mesh requirement mismatches Ditto's architecture.
- **Ditto usage:** none.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §3C.

**Kayenta (spinnaker/kayenta)** — github.com/spinnaker/kayenta (1.3k stars, Java 78.5%, Apache-2.0, v2.42.2 May 2025, archived December 2025, Added 2026-04-17)
- Netflix-originated statistical canary analysis. Judges canary vs baseline via Mann-Whitney U-test on time-series metrics.
- **Classification:** PATTERN (statistical comparison concept — revisit in sub-brief 186 once evidence deep enough); SKIP as a product (archived repo, Spinnaker dependency prohibitive).
- **Ditto usage:** statistical-comparison pattern reference for future sub-brief 186 iteration when node count supports proper statistical tests.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §3D.

**OpenFeature (open-feature/spec)** — github.com/open-feature/spec (1.1k stars, polyglot, Apache-2.0, CII Best Practices certified, Added 2026-04-17)
- Vendor-neutral feature-flag specification with SDKs for multiple languages. Aims to be the OpenTelemetry-equivalent for feature management.
- **Classification:** EVALUATE — potential fit if Ditto later needs runtime activation gating distinct from release distribution.
- **Ditto usage:** not adopted for ADR-034 (release distribution is the chosen primary mechanism); candidate for future work if runtime gating becomes needed.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §3F.

**Unleash (Unleash/unleash)** — github.com/Unleash/unleash (13.4k stars, TypeScript 96.9%, Apache-2.0, v7.6.3 April 2026, Added 2026-04-17)
- Open-source feature management platform with optional commercial tier. Self-hostable. Privacy-by-design, API-first, 12+ official SDKs.
- **Classification:** EVALUATE — TypeScript ecosystem fit if feature-flag path is taken.
- **Ditto usage:** not adopted at v1; reference if ADR-034 rollout distribution proves insufficient and runtime gating becomes needed.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §3F.

**Flagsmith, LaunchDarkly** — mentioned alongside OpenFeature/Unleash as commercial alternatives. Not separately evaluated at v1.

## Privacy Primitives (2026-04-17)

Added to support Brief 181 Sub-brief 182 (evidence harvest) and ADR-033 §1 consent model. Full survey in `docs/research/network-scale-rsi-tech-choices.md` §Topic 2.

**k-anonymity / l-diversity / t-closeness** — academic literature, Added 2026-04-17
- Tabular de-identification primitives. k-anonymity requires each record indistinguishable from ≥k−1 others on quasi-identifiers; l-diversity extends to sensitive-attribute diversity; t-closeness extends to distribution bounding. Widely used in HIPAA de-identification (k=5 to 20 typical).
- **Classification:** PATTERN (k-anonymity adopted for evidence aggregation thresholds in ADR-033 §1 and §5; l-diversity and t-closeness flagged as future enhancements if threat model sharpens).
- **Ditto usage:** k=5 threshold on aggregate evidence actionability per ADR-033; joint-tuple k-anonymity on integration-creation signals per ADR-033 §5 revision.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §2A–2C.

**RAPPOR (Google)** — historical: github.com/google/rappor (Apache-2.0, deprecated in production 2023), Added 2026-04-17
- Local differential privacy mechanism for collecting categorical telemetry from Chrome browsers. Two-stage randomized response with permanent + instantaneous noise. Deployed by Google 2014-2023, then deprecated in favor of shuffle-DP approaches.
- **Classification:** PATTERN (reference for LDP mechanics if Ditto later adopts DP); SKIP as a product (deprecated).
- **Ditto usage:** not adopted. Reference point if privacy threat model sharpens toward adversarial aggregator scenarios.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §2D.

**TensorFlow Federated (tensorflow/federated)** — github.com/tensorflow/federated (Python, Apache-2.0, Added 2026-04-17)
- Federated learning framework with Secure Aggregation primitive. Clients contribute to aggregate sum via pairwise-masked protocol; aggregator learns only the sum. Mature Bonawitz et al. (CCS 2017) implementation.
- **Classification:** EVALUATE — only if Ditto's SLM training pipeline (Briefs 135–137) draws on network evidence; not needed for scaffold-level RSI at v1.
- **Ditto usage:** future candidate for federated SLM training.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §2G.

**Flower (adap/flower)** — github.com/adap/flower (6.8k stars, Python 72.5%, Apache-2.0, v1.29.0 April 2026, Added 2026-04-17)
- Framework-agnostic federated learning framework. Supports PyTorch, TensorFlow, JAX, scikit-learn, XGBoost, Opacus (DP), iOS/Android edge. Newer and more active than TFF.
- **Classification:** EVALUATE — same rationale as TFF; federated learning is out of scope for RSI v1.
- **Ditto usage:** future candidate for federated SLM training.
- **Full evaluation:** `docs/research/network-scale-rsi-tech-choices.md` §2G.

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
