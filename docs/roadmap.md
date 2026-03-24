# Ditto — Roadmap

**Last updated:** 2026-03-25
**Current phase:** Phase 10 in progress. Brief 039 (Web Foundation) complete — web app running, Self streaming, setup page, 5 LLM connection methods (CLI subscriptions + API keys + Ollama). 306 tests (22 test files). Briefs 040 + 041 unblocked for parallel build.
**Major reframe (ADR-010):** Roadmap restructured around workspace interaction model. Ditto is a living workspace where work evolves through governed meta-processes, not an automation platform. See ADR-010 for the full rationale.

This is the complete capability map for Ditto. Every item traces back to the architecture spec, human-layer design, or landscape analysis. Status is tracked per item. Nothing is silently omitted — deferred items have explicit re-entry conditions.

---

## How to Read This

- **Status:** not started | in progress | done | deferred
- **Source doc:** which design document defines this capability
- **Build from:** which open-source project provides the pattern (or "Original" if unique to Ditto)
- **Re-entry:** for deferred items, what condition triggers re-entry

---

## Phase 0: Scaffolding (Current)

| Capability | Status | Deliverable |
|-----------|--------|-------------|
| Persistent agent context | done | `CLAUDE.md` |
| Vision document | done | `docs/vision.md` |
| Dictionary / glossary | done | `docs/dictionary.md` |
| Roadmap (this document) | done | `docs/roadmap.md` |
| Current state tracking | done | `docs/state.md` |
| Architecture review checklist | done | `docs/review-checklist.md` |
| ADR template | done | `docs/adrs/000-template.md` |
| Phase 1 task brief | done | `docs/briefs/phase-1-storage.md` |
| AGENTS.md update | done | `AGENTS.md` |

---

## Phase 1: Storage

**Objective:** Replace Postgres with SQLite. Zero-setup: `pnpm cli sync` works on fresh clone.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| SQLite via Drizzle ORM | done | architecture.md | antfarm `/src/db.ts` + Drizzle SQLite dialect | `src/db/schema.ts` rewrite |
| WAL mode, auto-create DB | done | landscape.md | antfarm, better-sqlite3 | `src/db/index.ts` rewrite |
| Agent identity fields in schema | done | architecture.md (Governance) | Original | `agents` table: ownerId, orgId, permissions, provenance |
| Process loader → SQLite | done | architecture.md L1 | Keep existing, update DB calls | `src/engine/process-loader.ts` |
| ADR-001 written | done | — | — | `docs/adrs/001-sqlite.md` |

---

## Phase 2: Harness + Feedback Capture

**Objective:** Build the core differentiator — review patterns, trust enforcement, parallel execution. Record every harness decision as feedback from day one.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| **Review patterns** | | | | |
| Maker-checker | done | architecture.md L3 | antfarm `/src/installer/step-ops.ts` (verify_each) | `src/engine/harness-handlers/review-pattern.ts` |
| Adversarial review | done | architecture.md L3 | antfarm verifier agent pattern | `src/engine/harness-handlers/review-pattern.ts` |
| Specification testing | done | architecture.md L3 | Original | `src/engine/harness-handlers/review-pattern.ts` |
| Ensemble consensus | deferred | architecture.md L3 | Original | Re-entry: when 2+ agents can execute same step |
| **Trust enforcement** | | | | |
| Supervised tier (always pause) | done | architecture.md L3 | Original | `src/engine/harness-handlers/trust-gate.ts` |
| Spot-checked tier (~20% pause) | done | architecture.md L3 | Original | `src/engine/harness-handlers/trust-gate.ts` |
| Autonomous tier (exception only) | done | architecture.md L3 | Original | `src/engine/harness-handlers/trust-gate.ts` |
| Critical tier (always pause, never upgrades) | done | architecture.md L3 | Original | `src/engine/harness-handlers/trust-gate.ts` |
| **Parallel execution** | | | | |
| parallel_group via Promise.all | done | architecture.md L2 | Mastra `packages/core/src/workflows/handlers/control-flow.ts` | `src/engine/heartbeat.ts` |
| depends_on resolution | done | architecture.md L2 | Original (process-level construct) | `src/engine/heartbeat.ts` |
| **Feedback from day one** | | | | |
| Record every harness decision | done | architecture.md L5 | Paperclip `/server/src/services/activity-log.ts` | `src/engine/harness-handlers/feedback-recorder.ts` |
| Agent permission checks | deferred | architecture.md (Governance) | Original | Re-entry: when multi-agent orchestration needs per-agent constraints |
| **Memory** | | | | |
| Memory table (two-scope) | done | ADR-003, Mem0 scope filtering | `src/db/schema.ts` memories table |
| Memory assembly | done | Letta `compile()`, Open SWE `get_agent()` | `src/engine/harness-handlers/memory-assembly.ts` |
| Feedback-to-memory bridge | done | Original | `src/engine/harness-handlers/feedback-recorder.ts` |
| **Heartbeat rewrite** | | | | |
| Harness pipeline integration | done | architecture.md L2-3 | Paperclip `/server/src/services/heartbeat.ts` | `src/engine/heartbeat.ts` |
| Dependency resolution + parallel | done | architecture.md L2 | Mastra + Original | `src/engine/heartbeat.ts` |
| ADR-002, ADR-003 written | done | — | — | `docs/adrs/` (ADR-002 proposed, ADR-003 with phased impl) |

---

## Pre-Phase 3: Input Resolution & Dev Harness (Brief 010)

**Objective:** Give agents codebase access via tool use, enforce DB schema sync, require smoke tests. Unblocks meaningful trust earning.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| Agent read-only tools (read_file, search_files, list_files) | done | architecture.md L2 | Claude Code Read/Grep/Glob patterns | `src/engine/tools.ts` |
| Claude adapter tool_use loop | done | architecture.md L2 | Claude API tool_use spec | `src/adapters/claude.ts` |
| DB schema enforcement via drizzle-kit push | done | Insight-019 | Drizzle Kit | `src/db/index.ts` |
| Review checklist point 11 (Execution Verification) | done | Insight-019 | Original | `docs/review-checklist.md` |
| Brief template smoke test section | done | Insight-019 | Original | `docs/briefs/000-template.md` |

---

## Pre-Phase 4: Dev Pipeline Orchestrator (Brief 015)

**Objective:** Automate the dev pipeline via `claude -p` chaining with Telegram mobile review. Proves the workspace interaction model (ADR-010) on the dev process before building it into the engine.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| Pipeline orchestrator (`claude -p` role chaining) | done | Brief 015, Insight-032 | Original (`claude -p` subprocess orchestration) | `src/dev-pipeline.ts` |
| Telegram bot (conversational Claude + skill invocation) | done | Brief 015 | grammy + Telegram Bot API | `src/dev-bot.ts` |
| Session state management (checkpoint/resume) | done | Brief 015 | Mastra snapshot pattern | `src/dev-session.ts` |
| Auto-PM on startup (Daily Brief pattern) | done | ADR-010, human-layer.md | Original | `src/dev-bot.ts` |
| Skill invocation via inline keyboards | done | Brief 015 | Telegram Bot API InlineKeyboard | `src/dev-bot.ts` |
| Session handoff (Documenter before reset) | done | dev-process.md | Original | `src/dev-bot.ts` |
| **Brief 027: Telegram Bot Engine Bridge** | | | | |
| Telegram bot routes through engine harness | done | Brief 027, Insight-032, Insight-050 | Direct engine API import (same as CLI commands) | `src/dev-bot.ts` |
| Review actions extraction (approveRun/editRun/rejectRun) | done | Brief 027 | Ditto CLI approve.ts/reject.ts | `src/engine/review-actions.ts` |
| Intra-run context in memory assembly (1500 token budget) | done | Brief 027 | dev-session.ts buildContextPreamble concept | `src/engine/harness-handlers/memory-assembly.ts` |
| TELEGRAM_CHAT_ID required (security) | done | Brief 027 | Original | `src/dev-bot.ts` |
| Memory assembly intra-run context tests | done | Brief 027 | Existing test patterns | `src/engine/harness-handlers/memory-assembly.test.ts` |

---

## Phase 3: Trust Earning

**Objective:** Human feedback path (approve/edit/reject) drives progressive trust accumulation. Upgrade suggestions when thresholds met. Never auto-upgrade.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| Record human feedback (approve/edit/reject) | done | architecture.md L5 | Paperclip audit pattern | `src/engine/trust.ts` |
| Capture diffs for edits (jsdiff word-level) | done | architecture.md L5 | jsdiff + WikiTrust severity thresholds | `src/engine/trust-diff.ts` |
| Trust data accumulation (sliding window) | done | architecture.md L3 | Discourse TL3 rolling window + OpenSSF multi-source weighting | `src/engine/trust.ts` |
| Trust state CLI display | done | human-layer.md (Orient job) | Original | `pnpm cli trust <process>` |
| Tier change audit trail (`trustChanges` table) | done | architecture.md L3 | Paperclip `agentConfigRevisions` | `src/db/schema.ts` |
| Upgrade eligibility check (conjunctive conditions) | done | architecture.md L3 | eBay seller standards + SonarQube quality gate | `src/engine/trust.ts` |
| Downgrade trigger check (2 of 4: correction rate, rejection) | done | architecture.md L3 | eBay disjunctive downgrade | `src/engine/trust.ts` |
| Trust evaluator (post-run evaluation) | done | architecture.md L3 | Original | `src/engine/trust-evaluator.ts` |
| Upgrade suggestions + accept/reject CLI | done | architecture.md L3 | Paperclip approvals pattern | `src/engine/trust.ts`, `src/cli.ts` |
| Auto-downgrade + override CLI | done | architecture.md L3 | Google Binary Authorization | `src/engine/trust.ts`, `src/cli.ts` |
| Grace period (5 runs, safety valve) | done | architecture.md L3 | Discourse TL3 grace period | `src/engine/trust.ts` |
| Trust simulation (`--simulate`) | done | architecture.md L3 | GitHub Rulesets evaluate mode | `src/engine/trust.ts`, `src/cli.ts` |
| `canAutoAdvance` enforcement for critical | done | architecture.md L3 | Original | `src/cli.ts` |
| `trust-evaluator` system agent (first system agent — ADR-008) | done | ADR-008, Brief 014a | Original (Insight-044: script handler pattern) | `src/engine/system-agents/trust-evaluator.ts`, `processes/trust-evaluation.yaml` |
| ADR-007 written | done | — | — | `docs/adrs/007-trust-earning.md` |

---

## Brief 016: Intelligent Coding Orchestrator (Engine-First)

**Objective:** Run the dev pipeline on the real engine. Build 4 missing engine capabilities: CLI adapter, conditional routing, confidence gating, notification events. First process to exercise the full harness with a CLI execution substrate. Validates patterns before Phase 4b/4c user processes need them.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| **016a: CLI Adapter** | | | | |
| CLI adapter (`claude -p` as execution substrate) | done | Brief 016, Insight-041 | ralph autonomous loop, Paperclip adapter pattern | `src/adapters/cli.ts` |
| `cli-agent` executor type in step executor | done | Brief 016 | Existing adapter routing pattern | `src/engine/step-executor.ts` |
| Confidence parsing from CLI output | done | Brief 016, ADR-011 | Original (categorical) | `src/adapters/cli.ts` |
| **016b: Conditional Routing** | | | | |
| `route_to` + `default_next` on StepDefinition | done | Brief 016, Insight-039 | Inngest AgentKit three-mode, LangGraph conditional edges | `src/engine/process-loader.ts` |
| Routing handler in harness pipeline | done | Brief 016 | Inngest AgentKit code-based routing | `src/engine/harness-handlers/routing.ts` |
| `retry_on_failure` with feedback injection | done | Brief 016 | Aider lint-fix loop, Open SWE middleware | `src/engine/heartbeat.ts` |
| **016c: Dev Pipeline Process** | | | | |
| Dev pipeline as process YAML (7 roles) | done | Brief 016, Insight-032 | antfarm YAML workflows | `processes/dev-pipeline.yaml` |
| Role contracts as agent system prompts | done | Brief 016 | Open SWE `get_agent()` | `src/adapters/cli.ts` |
| **016d: Confidence + Events** | | | | |
| Confidence-based trust gate extension | done | Brief 016, ADR-011 | SAE Level 3 self-assessment | `src/engine/harness-handlers/trust-gate.ts` |
| Harness event emitter | done | Brief 016 | Trigger.dev event pattern | `src/engine/events.ts` |
| Telegram subscribes to harness events | deferred | Brief 016 | Original | Re-entry: follow-up task after live engine validation |

---

## Phase 4: Workspace Foundation

**Objective:** Prove the workspace interaction model. Work items enter, meta-processes route them, processes execute with human steps, the system demonstrates it's alive. CLI is the first surface, but the concepts transfer directly to the web dashboard.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| **Work items** | | | | |
| `workItems` table (type, status, goal_ancestry, assigned_process) | done | ADR-010 | Paperclip tickets + goal ancestry | `src/db/schema.ts` |
| Work item creation via CLI | done | ADR-010 | citty + @clack/prompts | `src/cli/commands/start.ts` |
| Goal → task decomposition (orchestrator agent — Brief 021) | done | ADR-010, Brief 021 | LangGraph plan-execute + Temporal Selectors + Manus Planner | `src/engine/system-agents/orchestrator.ts`, `src/engine/heartbeat.ts` |
| **Meta-processes (system agents)** | | | | |
| Intake-classifier agent (classify work item type via keywords) | done | ADR-010, Brief 014b | Inngest AgentKit FnRouter (code-based Mode 1) | `src/engine/system-agents/intake-classifier.ts` |
| Router agent (match work item to process via LLM) | done | ADR-010, Brief 014b | Inngest AgentKit RoutingAgent + Mastra Networks | `src/engine/system-agents/router.ts` |
| Orchestrator agent (goal-directed — Briefs 014b, 021, 022) | done | ADR-010, Briefs 014b+021+022 | Anthropic orchestrator-worker + LangGraph + Temporal | `src/engine/system-agents/orchestrator.ts` |
| System agents go through harness pipeline | done | ADR-008, ADR-010, Brief 014a | Original | `src/engine/system-agents/index.ts`, `startSystemAgentRun()` |
| **Human step executor** | | | | |
| `human` executor type with suspend/resume | done | ADR-010 | Mastra suspend/resume | `src/engine/heartbeat.ts` |
| Human step surfaces as work item in CLI | done | ADR-010 | Sim Studio HITL block | `src/cli/commands/status.ts` |
| Human step completion via CLI | done | ADR-010 | Trigger.dev waitpoint token | `src/cli/commands/complete.ts` |
| **Unified task surface** | | | | |
| CLI shows review tasks + action tasks + goal-driven tasks together | done | ADR-010 | Original | `src/cli/commands/status.ts` |
| **CLI infrastructure** | | | | |
| Command routing (citty) | done | landscape.md | citty `/src/command.ts` | `src/cli.ts` |
| Interactive UX (@clack/prompts) | done | landscape.md | @clack/prompts | `src/cli/commands/reject.ts` |
| Orient: `status` (work items + process health + brief) | done | ADR-010, human-layer.md | Original | `src/cli/commands/status.ts` |
| Review: `review`, `approve`, `edit`, `reject` | done | human-layer.md | Paperclip approval flow | `src/cli/commands/review.ts`, `approve.ts`, `reject.ts` |
| Capture: `capture` (auto-classification + auto-routing, fallback to manual) | done | ADR-010, Brief 014b | Original | `src/cli/commands/capture.ts` |
| Trust: `trust` (accept/reject/override/simulate) | done | architecture.md L3 | Original (existing) | `src/cli/commands/trust.ts` |
| Define: `sync`, `start` | done | architecture.md L1 | Keep existing patterns | `src/cli/commands/sync.ts`, `start.ts` |
| **Attention model (Phase 4 scope — partially delivered by Brief 016d)** | | | | |
| Per-output confidence metadata on `stepRuns` | done | ADR-011, Brief 016 | Content moderation three-band (adapted to categorical) | `src/db/schema.ts`, `src/engine/harness-handlers/trust-gate.ts` |
| Confidence-based routing in trust gate (low → item review regardless of tier) | done | ADR-011, Brief 016 | SAE Level 3 (system self-assessment) | `src/engine/harness-handlers/trust-gate.ts` |
| Agent system prompt instruction for confidence self-assessment | done | ADR-011, Brief 016 | Original | `src/adapters/cli.ts` |
| **Cognitive model (Phase 4 scope)** | | | | |
| `cognitive_mode` field on process definitions (optional, default: analytical) | not started | ADR-013 | Original | `src/db/schema.ts`, process YAML |
| Challenge `concern` field on confidence metadata | not started | ADR-013 | Edmondson psychological safety + SAE Level 3 | `src/db/schema.ts` |

---

## Phase 5: Work Evolution Verification

**Objective:** Prove the "seed grows into a tree" cycle end-to-end. A single work item enters → gets classified → routed to a process → process executes with a human step → human completes → process resumes → output reviewed → trust data updated → learning captured. Ship first non-coding process templates.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| Full work evolution cycle (work item → intake → route → execute → human step → resume → review → trust) | done | ADR-010, Brief 020 | — | `docs/verification/phase-5-e2e.md` |
| Goal decomposition verified (goal → multiple tasks → multiple processes → tracked completion) | done | ADR-010, Brief 021 | LangGraph + Temporal + Manus | `src/engine/system-agents/orchestrator.ts` |
| Meta-process trust earning verified (intake-classifier corrections improve routing) | done | ADR-010, Brief 020 | — | Verified in E2E report |
| All 6 layers proven working | done | architecture.md, Brief 020 | — | `docs/verification/phase-5-e2e.md` |
| Process template library (`templates/` directory) | done | ADR-008, Brief 020 | n8n/Zapier pattern + Original governance declarations | `templates/` with 3 non-coding templates |
| Template sync + adoption flow | done | ADR-008, Brief 020 | Process loader pattern + Original | `src/engine/process-loader.ts` (loads from templates/ as draft) |
| **Attention model (Phase 5 scope)** | | | | |
| Digest mode for autonomous processes (outputs not in Review Queue, summary in Daily Brief) | not started | ADR-011 | Zapier Digest + GitHub Copilot PR-as-batch | CLI status output / Daily Brief |
| Silence-as-feature verified (autonomous clean runs produce no notifications) | not started | ADR-011 | Management by Exception, PagerDuty | Verification |
| **Cognitive model (Phase 5 scope)** | | | | |
| Mode-aware review framing in CLI (analytical + creative) | not started | ADR-013 | Kahneman System 1/2, Bloom taxonomy | CLI review commands |
| Enriched rejection vocabulary (tagged + gut rejection) | not started | ADR-013 | Polanyi tacit knowledge, knowledge elicitation literature | Feedback capture |

---

## Phase 6: External Integrations

**Objective:** Connect processes to external systems via multi-protocol integration. CLI (cheapest), MCP (structured), REST (universal fallback). All calls traverse the harness.
**Re-entry condition:** Dogfood processes proven end-to-end (Phase 5) ✓
**Sub-phased:** 3 sub-briefs along dependency seams. Build order: 024 → 025 → 026. ADR-014 Phase A1 (Cognitive Toolkit) runs in parallel with 025.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| **Integration registry (Brief 024)** | | | | |
| Registry format (YAML declaration files per service) | done | ADR-005, Insight-007 | Original (informed by Nango git-tracked approach) | `integrations/github.yaml`, `integrations/00-schema.yaml` |
| Registry loader (parse + validate, like process-loader) | done | ADR-005 | Process loader pattern (existing) | `src/engine/integration-registry.ts` |
| **Step executor extension (Brief 024)** | | | | |
| `integration` executor type in schema + step-executor | done | ADR-005 | Handler registry pattern (Sim Studio) | `src/db/schema.ts`, `src/engine/step-executor.ts` |
| CLI protocol handler (execute CLI commands, parse JSON output) | done | ADR-005 | Script adapter (existing) + Google Workspace CLI pattern | `src/engine/integration-handlers/cli.ts` |
| MCP protocol handler (connect to MCP server, invoke tools) | deferred | ADR-005, Insight-065 | Re-entry: when CLI+REST insufficient for a required service | — |
| REST protocol handler (HTTP calls with auth) | done | ADR-005 | Standard HTTP client patterns (native fetch) | `src/engine/integration-handlers/rest.ts` (Brief 025) |
| **Credential management (Brief 026)** | | | | |
| Credential vault (AES-256-GCM encrypted, HKDF key derivation) | done | ADR-005 | Composio brokered credentials, Node.js crypto | `src/engine/credential-vault.ts` (Brief 035) |
| Token lifecycle (`expiresAt` stored, auto-refresh deferred) | done (partial) | ADR-005 | Nango managed auth | `credentials` table `expires_at` field (Brief 035) |
| Per-process, per-service credential scoping | done | ADR-005 | Original | `credentials` table UNIQUE(process_id, service) (Brief 035). Per-agent scoping deferred to Phase 12. |
| Unified auth resolution (vault-first, env-var fallback) | done | ADR-005 | 12-factor migration pattern | `resolveServiceAuth()` (Brief 035) |
| Credential CLI (`ditto credential add/list/remove`) | done | ADR-005 | @clack/prompts masked input | `src/cli/commands/credential.ts` (Brief 035) |
| **Agent tool use (Brief 025)** | | | | |
| Step-level `tools:` field in process definitions | done | ADR-005, Insight-065 | Ditto-native tool pattern (LlmToolDefinition) | `src/engine/process-loader.ts` (Brief 025) |
| Tool resolution from integration registry at harness assembly | done | ADR-005, Insight-065 | Integration YAML tools section + tool-resolver | `src/engine/tool-resolver.ts` (Brief 025) |
| Tool authorisation via step declaration | done | ADR-005 | Original — per-step `tools:` field in process definition | `src/engine/tool-resolver.ts` (Brief 025) |
| Tool call logging on stepRuns | done | ADR-005 | `toolCalls` JSON field | `src/db/schema.ts` (Brief 025) |
| **Process I/O (Brief 036)** | | | | |
| External input sources in process definitions (`source:` field) | done | ADR-005, architecture.md L1 | Process definition source fields | `ProcessSourceConfig` type, `processes.source` DB column (Brief 036) |
| Polling-based trigger handler | done | ADR-005 | Standard polling pattern | `src/engine/process-io.ts` (`startPolling`/`stopPolling`) (Brief 036) |
| Webhook trigger handler | deferred | ADR-005 | Re-entry: when polling proves insufficient | — |
| Output delivery to external destinations (`output_delivery:` field) | done | ADR-005 | Nango actions pattern | `src/engine/process-io.ts` (`deliverOutput`) (Brief 036) |
| Trigger CLI (`ditto trigger start/stop/status`) | done | ADR-005 | @clack/prompts | `src/cli/commands/trigger.ts` (Brief 036) |
| **Harness integration (Brief 024)** | | | | |
| External calls traverse harness pipeline (trust gate, audit) | done | ADR-005 | Harness pipeline (existing) | Existing pipeline handles integration steps |
| Integration call logging in activity table | done | ADR-005 | Feedback recorder (existing) | `src/engine/harness-handlers/feedback-recorder.ts` |
| ADR-005 formalised | done | — | — | `docs/adrs/005-integration-architecture.md` (accepted) |

---

## Integration Generation (Brief 037, post-Phase 6)

**Objective:** Auto-generate Ditto integration YAMLs from OpenAPI specs. First generation path (Insight-071, Insight-072).
**Re-entry condition:** Phase 6 integration registry working ✓

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| `ditto generate-integration` CLI command | done | Brief 037, Insight-071/072 | Taskade/Neon/FastMCP codegen patterns | `src/engine/integration-generator.ts`, `src/cli/commands/generate-integration.ts` |
| OpenAPI 3.x parse + $ref resolution | done | Brief 037 | `@apidevtools/swagger-parser` (depend) | `src/engine/integration-generator.ts` |
| Operation → tool mapping (operationId, params, method) | done | Brief 037, research report | Universal pipeline pattern | `src/engine/integration-generator.ts` |
| Read/write tool classification (GET vs mutation) | done | Brief 037 | FastMCP `from_openapi()` pattern | Comment annotations in generated YAML |
| LLM-assisted curation (`--curate` flag) | not started | Brief 037 non-goals | Neon recommendation | Re-entry: after manual curation proves the workflow |
| MCP schema ingestion | deferred | Insight-065 | — | Re-entry: when MCP stabilises |

---

## Conversational Self MVP (parallel with Phase 6, before Phase 10)

**Objective:** Give Ditto a persistent identity — the outermost harness ring that mediates between the human and the platform. Proven on the dev pipeline via Telegram first.
**Re-entry condition:** ADR-016 accepted ✓. Research + UX spec complete ✓.
**Relationship:** The Self is where ADR-015's meta processes get a face, ADR-014's cognitive framework materializes, and ADR-003's memory becomes personality. Phase 6b/6c (tools, credentials) become more valuable once the Self exists as a coherent invoker.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| LLM provider abstraction | done | Insight-060 | Vercel AI SDK pattern | `src/engine/llm.ts` (Brief 029) |
| `self` memory scope (third scope type) | done | ADR-016, ADR-003 | Mem0 reconciliation + Letta self-editing | `src/db/schema.ts` (Brief 029) |
| `sessions` table + session persistence schema | done | ADR-016 | LangGraph checkpointing | `src/db/schema.ts` (Brief 029) |
| `cognitive/self.md` — core identity content | done | ADR-016, ADR-014 | Original | `cognitive/self.md` (Brief 029) |
| Standalone role delegation processes (7) | done | ADR-016 | Option A delegation model | `processes/dev-*-standalone.yaml` (Brief 029) |
| `assembleSelfContext()` — tiered context loading | done | ADR-016 | Letta tiered memory + Anthropic just-in-time | `src/engine/self.ts` (Brief 030) |
| `selfConverse()` — core conversation loop | done | ADR-016 | Original | `src/engine/self.ts` (Brief 030) |
| Self-editing memory (post-conversation reconciliation) | deferred | ADR-016 | Mem0 + Claude auto-memory | Re-entry: follow-up brief after Self MVP proven |
| Session lifecycle (start/suspend/resume/close) | done | ADR-016 | Mastra suspend/resume | `src/engine/self-context.ts` (Brief 030) |
| Dev pipeline as first proof (Telegram) | done | ADR-016, Insight-052 | Existing Telegram bot + engine bridge (Brief 027) | `src/dev-bot.ts` (Brief 030) |
| Surface adaptation (Telegram density vs CLI) | deferred | ADR-016 | Original | Re-entry: when CLI or web surface added to Self |
| **Ditto Execution Layer (Brief 031)** | | | | |
| `write_file` tool with security model | done | ADR-017, Insight-062 | Claude Code Write tool pattern | `src/engine/tools.ts` (Brief 031) |
| All 7 roles via `ai-agent` with Ditto's tools | done | ADR-017, Insight-062 | OpenClaw execution model | `processes/dev-*-standalone.yaml` (Brief 031) |
| Role contract loading in Claude adapter | done | ADR-017, Insight-062 | OpenClaw SOUL.md pattern | `src/adapters/claude.ts` (Brief 031) |
| `cli-agent` deprecated as default (optional fallback) | done | Insight-062 | — | Brief 031 |
| **LLM Provider Extensibility (Brief 032)** | | | | |
| Multi-provider `llm.ts` (Anthropic, OpenAI, Ollama) | done | Insight-062, Insight-041 | Vercel AI SDK pattern | `src/engine/llm.ts` (Brief 032) |
| No hardcoded default model — user configures at deployment | done | Insight-062 | 12-factor app pattern | `src/engine/llm.ts` (Brief 032) |
| Startup validation (fail clearly if LLM not configured) | done | Insight-062 | Existing DB sync pattern | `src/engine/llm.ts` (Brief 032) |
| **Self Metacognitive Oversight (Briefs 034a+034b, Insight-063)** | | | | |
| `consult_role` tool (Inline weight consultation) | done | ADR-017, Insight-063 | ADR-017 Inline weight + role contract pattern | `src/engine/self-delegation.ts` (Brief 034a) |
| Self decision tracking (delegation/consultation/inline) | done | Insight-063 | Activity logging from feedback-recorder | `src/engine/self-context.ts` (Brief 034a) |
| Self-correction memories (cross-turn redirect detection) | done | Insight-063 | feedback-to-memory bridge pattern | `src/engine/self-context.ts` (Brief 034a) |
| Cognitive framework metacognitive checks | done | Insight-063, ADR-014 | Original | `cognitive/self.md` (Brief 034a) |
| Harness-level metacognitive check handler (all agents) | done | Insight-063, ADR-014 | HarnessHandler interface | `src/engine/harness-handlers/metacognitive-check.ts` (Brief 034b) |
| **Model Routing Intelligence (Brief 033)** | | | | |
| Step-level `model_hint` in process definitions | done | ADR-017, ADR-014 | Vercel AI SDK alias pattern | `src/engine/model-routing.ts` (Brief 033) |
| Model tracking on step runs (which model produced what) | done | ADR-014 Phase B1 | Vercel AI SDK `ai.response.model` | `src/db/schema.ts`, `src/engine/heartbeat.ts` (Brief 033) |
| Self recommends optimal model routing from trust data | done | ADR-014, ADR-007 | Trust earning + RouteLLM economics | `src/engine/model-routing.ts` `generateModelRecommendations()` (Brief 033) |

---

## Future Phases (sequenced but not scheduled)

### Phase 7: Layer 4 — Awareness

**Re-entry condition:** 2+ processes running and producing outputs

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| Process dependency graph | architecture.md L4 | Schema exists (`processDependencies` table) |
| Event propagation on output | architecture.md L4 | Original |
| Impact propagation ("if I change X, these processes affected") | architecture.md L4 | Original |
| Remaining 2 trust downgrade triggers (downstream reports, input changes) | architecture.md L3 | Requires L4 |

### Cognitive Architecture A1: Cognitive Toolkit (can run parallel with Phase 6)

**Re-entry condition:** Phase 5 complete (process steps, harness pipeline working)
**Note:** Primarily content + schema work. Can run in parallel with Phase 6 (external integrations) since they touch different subsystems.

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| Cognitive content library (5-7 mental models, 3+ reflection prompts, communication patterns) | ADR-014 | MeMo (Guan et al., 2024) toolkit-not-prescription pattern. Farnam Street mental model library |
| `cognitive_context` block on process step definitions (framing, toolkit, reflection, freedom) | ADR-014 | Original |
| Context assembly injects toolkit content when `cognitive_context` present | ADR-014 | MeMo pattern adapted for process harness |
| Cognitive approach recorded on step runs as metadata | ADR-014 | Original |
| Backward compatible — steps without `cognitive_context` execute identically | ADR-014 | — |
| Dev role validation — at least 2 dev roles run with cognitive context | ADR-014 | — |

### Cognitive Architecture A2: Orchestrator Reflection

**Re-entry condition:** A1 validated — cognitive context flows through harness

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| Orchestrator reflection cycle at each heartbeat (intention tracking, friction detection, approach evaluation) | ADR-014 | MAP Monitor/Evaluator (Webb et al., 2025), Reflexion (Shinn et al., 2023) |
| Four-way reflection decision: continue / adapt / escalate / stop | ADR-014 | Original |
| Reflection outputs stored as meta-memory for future retrieval | ADR-014 | Reflexion episodic memory pattern |
| Escalation surfaces structured message to human | ADR-014 | Brown productive failure pattern |
| Intuitive observation prompt in reflection cycle | ADR-014 | Original |

### Phase 8: Layer 5 — Learning (Full)

**Re-entry condition:** 50+ feedback records exist

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| Correction pattern extraction from diffs | architecture.md L5 | Original (implicit feedback) |
| Performance decay detection | architecture.md L5 | Original |
| Improvement proposal generation | architecture.md L5 | compound-product self-improvement cycle |
| Three feedback signals: output quality, process efficiency, outcome impact | architecture.md L5 | Original |
| "Teach this" button — bridge feedback to permanent learning | human-layer.md (Feedback Widget) | Original |
| **Attention model (Phase 8 scope)** | | |
| Process-level health alerts as primary escalation for autonomous processes | ADR-011 | PagerDuty Event Intelligence, SPC Western Electric rules |
| Confidence calibration tracking (does agent's high/medium/low correlate with outcomes?) | ADR-011 | Original |
| **Cognitive model (Phase 8 scope)** | | |
| Mode-aware feedback capture (aesthetic tags for creative outputs) | ADR-013 | Original |
| Insight escalation: correction → pattern ("Teach this" formalised as level 2 of 4) | ADR-013 | Weick sensemaking, Soar impasse-driven learning |
| Insight escalation: pattern → structural (LLM-based root cause detection) | ADR-013 | Original — via improvement-scanner agent |

### Cognitive Architecture B: Learning Correlation + Adaptive Scaffolding

**Re-entry condition:** A1+A2 data accumulation (20+ runs with cognitive context)

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| **B1: Learning correlation** | | |
| Approach-outcome correlation (which cognitive framings produce best results per domain) | ADR-014 | Original |
| Toolkit effectiveness tracking (which mental models correlate with high-rated outputs) | ADR-014 | Original |
| Friction pattern detection (consistent friction at specific steps suggests wrong framing) | ADR-014 | Wray et al. (2025) reconsideration gap |
| Improvement proposals include cognitive recommendations | ADR-014 | Existing improvement mechanism extended |
| **B2: Adaptive scaffolding** | | |
| Automatic scaffolding depth suggestions based on model capability + trust tier + task novelty | ADR-014 | Prompting Inversion (Bernstein et al., 2025) |
| `freedom` field always takes precedence if explicitly set | ADR-014 | — |

### Cognitive Architecture C-D: Cognitive Trust + Full Cognitive Management

**Re-entry condition:** B1+B2 evidence accumulation

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| **C: Cognitive trust** | | |
| Calibrated uncertainty as trust signal (honest low confidence that proves justified increases trust) | ADR-014 | Kadavath et al. 2022, Steyvers & Peters 2025 |
| Productive failure quality in trust evaluation | ADR-014 | Brown (vulnerability as trust builder) |
| Proactive concern flagging contributes to trust | ADR-014 | ADR-013 `concern` field, extended |
| Cross-process cognitive learning | ADR-014 | Original |
| **D: Full cognitive management** | | |
| Orchestrator recommends cognitive postures based on accumulated evidence | ADR-014 | Original |
| Cognitive toolkit expansion based on measured effectiveness | ADR-014 | Original |
| Human approves/adjusts all cognitive recommendations | ADR-014 | — |

### Phase 9: Self-Improvement Meta-Process

**Re-entry condition:** Layer 5 (Learning) is live

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| `improvement-scanner` system agent | architecture.md (Self-Improvement), ADR-008 | compound-product analyse → propose cycle |
| Improvement proposals in review queue | architecture.md L5 | compound-product |
| Approved improvements → feature-implementation handoff | architecture.md (Process 3) | Process YAML exists |

### Phase 10: Web Dashboard — The Living Workspace

**Re-entry condition:** CLI proves the workspace model works (Phase 5 complete)
**Key principle (ADR-010):** This is NOT a dashboard bolted onto an automation engine. The web UI IS the workspace. Process graph as primary navigation. Conversation pervasive. Daily Brief demonstrates memory. Unified task surface. The system feels alive.

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| **Workspace Core** | | |
| Process Graph as primary navigation (three layers: goals → processes → live state) | ADR-010, human-layer.md | Paperclip org chart + Asana Work Graph + Sim Studio DAG. Combined: Original |
| Conversation Thread as pervasive layer (available on every view) | ADR-010, human-layer.md | Vercel AI SDK `useChat` hooks + Original |
| Unified task surface (review + action + goal-driven tasks) | ADR-010 | Original |
| Daily Brief demonstrating accumulated memory | ADR-010, Insight-028, human-layer.md | Original |
| Streaming generative UI for conversation responses | ADR-010 | Vercel AI SDK multi-step tool use + OpenUI streaming |
| **16 UI Primitives** | | |
| Daily Brief (produced by `brief-synthesizer` system agent) | human-layer.md, ADR-008 | Original design |
| Process Card (glance + expanded) | human-layer.md | Original design |
| Activity Feed | human-layer.md | Original design |
| Performance Sparkline | human-layer.md | Original design |
| Review Queue (part of unified task surface) | human-layer.md, ADR-010 | Original design |
| Output Viewer (6 presentation types within view catalog; renders process outputs per ADR-009 v2) | human-layer.md, ADR-009 v2 | Original design + json-render patterns (adopt) |
| Feedback Widget (implicit capture) | human-layer.md | Original design |
| Conversation Thread (universal — Explore + Operate) | human-layer.md, ADR-010 | Original design |
| Process Builder | human-layer.md | Original design |
| Agent Card | human-layer.md | Original design |
| Trust Control | human-layer.md | Original design |
| Quick Capture (routes through intake-classifier) | human-layer.md, ADR-010 | Original design |
| Improvement Card | human-layer.md | Original design |
| Process Graph (enhanced with goal hierarchy + live execution) | human-layer.md, ADR-010 | Original design |
| Data View | human-layer.md | Original design |
| Evidence Trail | human-layer.md | Original design |
| **8 View Compositions (defaults, not fixed screens — ADR-009)** | | |
| Home (Daily Brief + unified task surface top 5 + Quick Capture + Conversation) | human-layer.md, ADR-009, ADR-010 | Original |
| Review (unified task surface full + Output Viewer + Feedback Widget) | human-layer.md, ADR-009, ADR-010 | Original |
| Map (Process Graph full screen — primary navigation) | human-layer.md, ADR-010 | Original (replaces "Processes" list view as default) |
| Process Detail (expanded card + Activity Feed + Sparklines + Trust) | human-layer.md, ADR-009 | Original |
| Setup (Conversation Thread + Process Builder dual pane) | human-layer.md, ADR-009 | Original |
| Team (Agent Cards + Sparklines + cost) | human-layer.md, ADR-009 | Original |
| Improvements (Improvement Cards + trends) | human-layer.md, ADR-009 | Original |
| Capture (full screen Quick Capture — mobile optimised) | human-layer.md, ADR-009 | Original |
| **Interaction Patterns** | | |
| Approve / Edit / Reject / Escalate flow | human-layer.md | Original |
| Human step completion (action task with input form) | ADR-010 | Sim Studio approval portal concept + Original |
| "Auto-approve similar" (trust earning via review queue) | human-layer.md | Original |
| "Teach this" (bridge feedback to learning) | human-layer.md | Original |
| "Approve batch" / "Spot-check N" | human-layer.md | Original |
| Progressive disclosure (boiling frog) | human-layer.md | Original |
| **Surface Protocol (ADR-021)** | | |
| Self emits typed ContentBlock[] (13 block types, not string) | ADR-021 | Original — Adaptive Cards (pattern), Vercel AI SDK (pattern), Slack/Telegram (pattern) |
| Per-surface renderers (web=React, Telegram=inline keyboards, CLI=prompts) | ADR-021 | Original |
| Action callbacks via handleSurfaceAction() — single entry point | ADR-021 | Slack action_id + Telegram callback_data (pattern) |
| Graceful degradation — unknown blocks fall back to text | ADR-021 | Adaptive Cards fallbackText (pattern) |
| **Composition + Output principles (ADR-009 v2)** | | |
| Process output schemas (5 destination types, static/dynamic lifecycle) | ADR-009 v2, Insight-066 | Original + json-render spec types (adopt) |
| Catalog-constrained view rendering (catalog → registry → renderer) | ADR-009 v2 | json-render (adopt, not depend — Insight-068) |
| Trust-aware UI density (supervised=full, autonomous=exceptions) | ADR-009 v2 | Original |
| Trust-governed output delivery + catalog richness | ADR-009 v2 | Original |
| No ViewSpec protocol for app's own UI — standard React | ADR-009 v2 | Standard React |
| Output-as-interface between processes (typed contracts, sync-time validation) | ADR-009 v2 | Original |
| Skills packages as agent toolkit extensions (design quality, etc.) | Insight-069 | Impeccable pattern |
| **Deferred evaluations** | | |
| QA/Tester role evaluation — browser-based behavioral testing (re-entry from Insight-038) | Insight-038, research/qa-tester-role-in-dev-pipeline.md | gstack `/qa` pattern |
| **Tech stack** | | |
| Next.js + React + shadcn/ui + Tailwind | architecture.md | 2026 default stack |
| Vercel AI SDK for conversation layer | ADR-010 | Vercel AI SDK (`vercel/ai`) |
| OpenUI for streaming generative UI (evaluate) | ADR-010 | OpenUI (`thesysdev/openui`) |
| API layer (REST + WebSocket) | architecture.md | Standard patterns |
| Real-time dashboard updates | architecture.md | WebSocket |

### Phase 11: Intelligent Discovery + Process Evolution

**Re-entry condition:** Web dashboard exists (Phase 10)
**Dependency:** Phase 6 integration connectors (for evidence-informed discovery)
**Note:** Conversation-as-pervasive-layer is already implemented in Phase 10. Phase 11 adds the intelligent agents that make discovery and evolution proactive.

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| **Discovery agents** | | |
| `process-analyst` system agent (conversational classification against APQC, template comparison) | human-layer.md, ADR-006, ADR-008 | Original |
| `onboarding-guide` system agent (first-run flow, template-aware) | ADR-008 | Original |
| `process-discoverer` system agent (data-driven pattern finding from connected sources) | ADR-006, ADR-008 | Informed by PKAI + ClearWork + Original |
| **Reactive-to-repetitive lifecycle** | | |
| System detects repeated ad-hoc work patterns | ADR-010, Insight-027 | Original to Ditto |
| System proposes new process creation from observed patterns | ADR-010 | Original to Ditto |
| User confirms/refines proposed process → activates supervised | ADR-010, Insight-016 | Original |
| **Evidence-informed discovery** | | |
| Capability Catalog (guided discovery, not app store) | human-layer.md | APQC/ITIL base knowledge |
| Evidence-informed discovery from connected org data | ADR-006, Insight-016, research report | Informed by PKAI + ClearWork + Original |
| Organizational data analysis (7 source types) | ADR-006, research report | Informed by ClearWork + Original |
| APQC/ITIL pattern classification for discovery | architecture.md (industry standards) | Original |
| Process candidate scoring and presentation | ADR-006, research report | Informed by ClearWork + Original |
| Continuous process gap detection | ADR-006, architecture.md (Self-Improvement) | Extension of self-improvement meta-process |

### Process Context Bindings (Insight-059)

**Re-entry condition:** Phase 6 integration connectors working. Process articulation tools designed (Insight-047).
**Note:** Same process definition applied to different targets with different configurations. Enables multi-repo orchestration (Insight-058) and multi-client process instances.

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| Process binding concept (persistent association of process definition + target configuration) | Insight-059 | Original |
| Binding-level credential scoping (each binding uses its own auth) | Insight-059, ADR-005 | Composio brokered credentials pattern |
| Trust per binding (same process, different trust levels per target) | Insight-059, ADR-007 | Existing trust infrastructure extended |
| Multi-repo targeting (repos as integration targets, not Ditto instances) | Insight-058 | ADR-005 registry pattern |
| Cloud execution adapter (remote agent execution for cloud-based repos) | Insight-058 | CLI adapter pattern extended |
| Goal/outcome-level binding inheritance (bindings flow from goals → tasks → runs) | Insight-059 | Orchestrator decomposition pattern |

### Phase 12: Governance at Scale

**Re-entry condition:** Multi-process orchestration working

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| `governance-monitor` system agent | architecture.md (Governance), ADR-008 | Original |
| Cross-scope compliance (individual, team, organisation) | architecture.md (Governance) | Original |
| Agent authentication enforcement | architecture.md (Governance) | Schema fields from Phase 1 |
| Permission scoping per process/environment | architecture.md (Governance) | Original |
| Full audit trail with compliance reporting | architecture.md (Governance) | Paperclip activity-log pattern |

### Phase 13: Multi-Domain & Scale

**Re-entry condition:** Dogfood proven, ready for second domain

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| Multi-tenancy | architecture.md (Open Questions) | Paperclip (built-in from day one) |
| Industry standard template library expansion (APQC-classified, community contributions) | architecture.md L1, ADR-008 | Original |
| **Mobile (Operate Mode)** | mobile-remote-experience-ux.md, Insight-011 | Original design |
| — 7 mobile-adapted primitives (Brief, Queue, Viewer, Feedback, Capture, Process Card glance, Improvement Card) | mobile-remote-experience-ux.md | Original |
| — Three-depth review (notification → queue → detail) | mobile-remote-experience-ux.md | Original (informed by Linear, GitHub Mobile, Gmail) |
| — "Edit @ desk" mobile-to-desktop handoff | mobile-remote-experience-ux.md, Insight-012 | Original to Ditto |
| — Push notification design (6 types, 4 priority levels) | mobile-remote-experience-ux.md | Informed by iOS/Android patterns |
| — Voice interaction (voice-in + voice-out) | mobile-remote-experience-ux.md persona validation | Native only (Siri App Intents, Android App Actions) |
| — Team attribution + team health for multi-person governors | mobile-remote-experience-ux.md persona validation (Nadia) | Original |
| — Offline approve/reject with conflict resolution | mobile-remote-experience-ux.md | Original |
| — Capture → Classify → Route pipeline with AI classifier | mobile-remote-experience-ux.md, input-type-taxonomies.md | Original |
| — PWA vs native decision | mobile-interfaces-for-agent-platforms.md | Architect decides based on voice constraint |
| — Formal multi-platform output protocol (re-evaluate A2UI adoption for surfaces beyond web) | ADR-009 v2, rendered-output-architectures.md | A2UI (Google, Apache 2.0) or extend json-render registry pattern — deferred from Phase 10 |
| Session persistence across heartbeats | architecture.md L2 | Paperclip session codec |
| Budget enforcement (hard stops) | architecture.md L2 | Paperclip `/server/src/services/budgets.ts` |

---

## Cross-Cutting Decision: Runtime Deployment (RESOLVED — ADR-006)

**Status:** ADR-006 accepted
**Research:** `docs/research/runtime-deployment-models.md`, `docs/research/hosted-cloud-patterns.md`
**UX constraints:** `docs/research/mobile-remote-experience-ux.md` (seven constraints)
**Insight:** `docs/insights/015-two-track-deployment.md`

**Decision: Two-track deployment model.**

| Track | For whom | When | How |
|-------|----------|------|-----|
| **A: Managed Cloud** | Users (Rob, Lisa, Jordan, Nadia) | Phase 10+ | Sign up → running in 2 min. AGPL. Per-tenant Postgres. BYOK for LLM keys. |
| **B1: Self-hosted dogfood** | Us (now) | Now → Phase 5 | VPS + SQLite + Tailscale + systemd. EUR 3.49/month. |
| **B2: Self-hosted production** | Developers, data sovereignty | Phase 10+ | Same engine on VPS/Pi/NAS + web dashboard |
| **B3: One-click deploy** | Power users (Jordan-type) | Phase 10+ | Railway/Render deploy buttons. ~5 min setup. |

Unblocks Phase 3 (always-on heartbeats for trust earning). Engine codebase is the same for both tracks.

---

## Deferred Infrastructure (re-evaluate as scale demands)

| Component | What it provides | When to re-evaluate | Source |
|-----------|-----------------|-------------------|--------|
| Inngest | Step-based durable execution, event-driven triggers | When process steps need retry/recovery at scale | landscape.md |
| Trigger.dev | AI agent workflows, waitpoint tokens for HITL | When durable execution beyond SQLite is needed | landscape.md |
| Mastra | Graph-based workflow DSL, suspend/resume | When workflow complexity exceeds our heartbeat model | landscape.md |
| Temporal | Industrial-grade durable execution | When enterprise reliability requirements emerge | landscape.md |
| Turso/libSQL | Local-first with cloud sync | When scaling beyond single machine | landscape.md |
| Rules engine executor | `rules` step executor type (in schema, no implementation) | When deterministic logic steps are needed beyond scripts | architecture.md |
| Nango (self-hosted) | Managed OAuth, 700+ API integrations, syncs + actions | When credential management complexity exceeds minimal vault | ADR-005 |
| Composio (cloud) | 1000+ integrations, brokered credentials, tool routing | When cloud dependency is acceptable for integration breadth | ADR-005 |

---

## Adopted Patterns (in use or planned)

| Pattern | Source | Where used |
|---------|--------|-----------|
| YAML + SQLite + cron | antfarm | Phases 1-2: process definitions + state |
| Flat files for context, git for history | ralph | Phase 2: agent context model |
| Heartbeat execution (wake/execute/sleep) | Paperclip | Phase 2: heartbeat engine |
| Adapter interface (invoke/status/cancel) | Paperclip | Phase 2: agent adapters (already built) |
| Verification gates (verify_each + verify_step) | antfarm | Phase 2: harness maker-checker |
| Role-based system prompts | gstack | Phase 2: Claude adapter (already built, 10 roles) |
| Self-improvement cycle (analyse → propose → PR) | compound-product | Phase 8 |
| Drizzle ORM + better-sqlite3 | bun-elysia-drizzle-sqlite | Phase 1 |
| citty (CLI routing) | UnJS ecosystem | Phase 4 |
| @clack/prompts (CLI UX) | Astro/Svelte scaffolders | Phase 4 |
| Work items with goal ancestry | Paperclip | Phase 4: work item schema (ADR-010) |
| Orchestrator-worker decomposition | Anthropic multi-agent research | Phase 4: orchestrator agent (ADR-010) |
| Path-based suspend/resume for human steps | Mastra | Phase 4: human step executor (ADR-010). Serialize suspended step paths + results; resume skips completed steps |
| Waitpoint tokens | Trigger.dev | Phase 4: human step completion (ADR-010) |
| Three-mode routing (code/LLM/hybrid) | Inngest AgentKit | Phase 4: intake-classifier + router system agents. Maps to trust progression in routing |
| Multi-source tool gathering (7 sources) | Mastra | Phase 4+: agent harness assembly. Process-scoped + agent-scoped + integration + system tools merged at invocation |
| Lifecycle hooks (onStart/onResponse/onFinish) | Inngest AgentKit | Phase 4+: pre/post-execution hooks for memory injection, trust validation, feedback capture |
| 4-layer safety-net middleware chain | Open SWE | Phase 4+: error normalization → message injection → empty-output guard → structural guarantee |
| Task guardrails with retry | CrewAI | Phase 4: routing validators return (pass/fail, feedback). Max retries configurable |
| Parallel CLI aggregation + interactive workflows | GitHub CLI + @clack/prompts | Phase 4: heterogeneous work surface in terminal. Factory-injected dependencies |
| 24-event hooks for harness interception | Claude Agent SDK | Phase 4+: PreToolUse block/modify pattern for trust gate enforcement on external calls |
| Streaming generative UI | Vercel AI SDK | Phase 10: conversation layer (ADR-010) |
| Catalog-constrained view rendering (flat spec, progressive rendering) | json-render (adopt) | Phase 10: process output rendering (ADR-009 v2). Adopt source code, not npm dependency (Insight-068) |
| Progressive streaming UI rendering | OpenUI | Phase 10: dynamic UI (ADR-010, evaluate — superseded by json-render for output rendering) |
| Three-file agent briefing (AGENTS.md + SOUL.md + IDENTITY.md) | antfarm | Phase 0: briefing system |
| SKILL.md per capability | Paperclip | Phase 0: brief structure |
| Architecture review as agent skill | Paperclip pr-report | Phase 0: review loop |
| Multi-protocol integration (CLI + MCP + REST) | Google Workspace CLI | Phase 6: integration registry |
| Skills wrapping MCP servers | OpenClaw | Phase 6: agent tool use |
| Brokered credentials | Composio | Phase 6: credential management |
| Code-first integration functions | Nango | Phase 6: process I/O |
| Dynamic tool loading | Claude Agent SDK MCP | Phase 6: agent tool resolution |
| Template library (browse, select, customize) | n8n, Zapier, Notion | Phase 5: process templates (extended with governance declarations) |
| APQC PCF as classification lens | APQC (since 1992) | Phase 11: process-analyst agent knowledge |
| Confidence-based routing (three-band) | Content moderation (TikTok/YouTube), Insurance STP | Phase 4: per-output confidence in trust gate |
| Management by Exception | Management science (MBE) | Phase 5+: silence as feature, process-level alerts |
| Batch/digest review | Zapier Digest, GitHub Copilot PR-as-batch | Phase 5: digest mode for autonomous processes |
| ISO 2859 switching rules | International acceptance sampling standard | Validates ADR-007 trust tier transitions |
| Memory salience scoring (reinforcement + recency decay) | memU `src/memu/app/retrieve.py` | Phase 4: memory assembly scoring (ADR-012, confirms ADR-003 Phase 3 plan) |
| Structured context object (model-agnostic) | Open SWE `get_agent()`, Letta `compile()` | Phase 4: adapter receives AdapterContext, not raw prompt (ADR-012) |
| Per-step model selection | Mastra Model Router, CrewAI, Inngest AgentKit | Phase 4+: model_tier field on process steps (ADR-012) |
| Stable prefix + variable suffix for cache efficiency | Claude Code, Google ADK, Anthropic prompt caching | Phase 4: context ordering in harness assembly (ADR-012) |
| Cost-based cascade routing | RouteLLM (lm-sys), xRouter | Validates cost savings from model tier routing (ADR-012) |
| Per-agent budget enforcement with CostEvent | Paperclip `server/src/services/budgets.ts` | Phase 4+: token tracking on stepRuns (ADR-012) |
| Lost-in-the-middle mitigation | Stanford NLP (Liu et al., 2023) | Phase 4: critical info at beginning + end of context (ADR-012) |
| Dual-process theory (System 1/System 2) | Kahneman | Phase 5: cognitive mode concept — analytical (System 2) vs creative (System 1) review framing (ADR-013) |
| Dreyfus skill acquisition (5 stages) | Dreyfus & Dreyfus (1980) | Conceptual: expertise progression informs trust tier analogy. Explicit per-human tracking deferred Phase 12+ (ADR-013) |
| Tacit knowledge elicitation | Polanyi, Springer 2022 Industry 4.0 research | Phase 5: enriched rejection vocabulary — tagged + gut rejection (ADR-013) |
| Sensemaking (retrospective pattern detection) | Weick | Phase 8: insight escalation — corrections cluster into patterns retrospectively (ADR-013) |
| Impasse-driven learning | Soar cognitive architecture | Phase 8: insight escalation — rejection = impasse, resolution = compiled knowledge (ADR-013) |
| Temporal knowledge graph for entity memory | Zep/Graphiti (open source, Python) | Phase 10+: entity memory as third scope alongside agent + process (ADR-013) |

---

## What's Original to Ditto

These capabilities have no equivalent in existing frameworks:

1. **Progressive trust tiers** — supervised → spot-checked → autonomous, earned through track record
2. **Trust earning with data** — approval rates, correction rates, review cycles driving upgrade suggestions
3. **Process-first model** — every framework is agent-first or task-first
4. **Implicit feedback capture** — edits-as-feedback, correction pattern extraction
5. **Three-mode UX (Analyze → Explore → Operate)** — Analyze connects to org data to understand reality, Explore crystallises into process definitions, Operate runs them
6. **Governance function** — agents providing cross-cutting compliance assurance
7. **Agent authentication** — identity, permissions, provenance for agents entering the harness
8. **16 universal UI primitives** — domain-agnostic composable interface
9. **The compound effect** — trust + learning + self-improvement compounding over time
10. **Trust-aware integration access** — external API calls governed by earned trust level
11. **Integration feedback capture** — capturing whether external actions produced correct outcomes
12. **Process-scoped integration permissions** — credentials scoped per-process, per-service (per-agent deferred to Phase 12)
13. **Evidence-informed process discovery** — discovering processes from readily available organizational data (email, calendar, documents, financial, messaging, service desk) rather than enterprise event logs or desktop surveillance
14. **Organizational data model** — persistent, evolving understanding of how the organisation actually works, derived from connected data sources (ADR-006)
15. **Continuous process gap detection** — ongoing discovery of undiscovered processes from connected data, extending self-improvement beyond existing process optimization
16. **System agents as product** — platform-level agents (governance, trust evaluation, discovery, improvement) that ARE the product, not user-configured (ADR-008)
17. **Process-level templates with governance declarations** — templates that include trust config, quality criteria, feedback loops — not just workflow snippets (ADR-008)
18. **Cold-start via AI-driven process analysis** — system agents that actively help users formalize processes against industry standards, not passive template browsing (ADR-008)
19. **Trust-aware UI density** — supervised processes show maximum UI detail, autonomous show exceptions only. No surveyed system adjusts UI density based on earned trust tiers (ADR-009)
20. **Workspace interaction model** — handoff-first, not management-first. Work enters as goals/tasks/questions, system routes to learned processes. Not automation (Zapier) or PM (Monday.com) — a living workspace (ADR-010)
21. **Work evolution** — a single input evolves through multiple processes, spawning new work. No system does this with trust governance (ADR-010)
22. **Self-referential meta-processes** — the system's own orchestration (intake, routing, decomposition) runs through its own harness, earning trust. No surveyed system does this (ADR-010)
23. **Human steps in processes** — processes can pause for real-world human actions and resume. Combined with trust gates — no surveyed HITL pattern integrates with trust tiers (ADR-010)
24. **Reactive-to-repetitive lifecycle** — system notices repeated ad-hoc work and proposes process creation. No product explicitly tracks this maturation (ADR-010)
25. **Memory as UX** — the system demonstrates accumulated context on every surface. Daily Brief feels like a chief of staff who knows everything. Never feels like "new chat" (Insight-028)
26. **Attention model** — trust tiers determine oversight rate, attention model determines oversight form (item review / digest / alert). No surveyed system combines process-level trust tiers with per-output confidence routing and trust-aware notification form (ADR-011)
27. **Silence as feature** — autonomous processes that run cleanly produce no notifications. Absence of noise IS the signal that things are working. No agent platform explicitly designs for proactive silence (ADR-011)
28. **Structure as the product** — the eight things raw chat is missing (loose structure, guidance, standards, goal orientation, quality control, informed autonomy, interconnectedness, abstraction). Ditto IS the scaffolding that makes AI useful for non-technical users (Insight-030)
29. **Process-declared context shape** — process definitions declare their context profile (memory/tools/history weighting). No system lets the process definition control context assembly shape (ADR-012)
30. **Trust-modulated model routing** — as trust is earned, system recommends downgrading to cheaper models. Same mechanism as trust tier upgrades. No system ties model selection to earned trust (ADR-012)
31. **Outcome-budget-attention triangle** — user sets importance, budget, and attention. System optimises model, context, and review pattern within those constraints. No system treats budget as a goal for meta-process optimisation (ADR-012)
32. **Cost-per-outcome as feedback signal** — fourth feedback signal alongside output quality, process efficiency, and outcome impact. No system tracks cost-per-outcome or compounds trust + model + context + cache optimisations (ADR-012)
33. **Cognitive mode on process steps** — process definitions declare what kind of human thinking review demands (analytical vs creative). Review framing, feedback capture, and learning adapt accordingly. No AI platform adapts review UX to cognitive mode (ADR-013)
34. **Tacit knowledge capture via enriched feedback** — structured rejection vocabulary (tagged rejection, gut rejection) captures pre-articulate expertise. System detects patterns in vague signals and surfaces hypotheses. No agent platform captures pre-articulate knowledge (ADR-013)
35. **Insight escalation ladder** — learning layer actively climbs from corrections → patterns → structural insights → strategic proposals. Four abstraction levels with human gating at each level. No platform models abstraction levels in its learning pipeline (ADR-013)
