# Ditto — Roadmap

**Last updated:** 2026-04-20
**Current phase:** Phase 9 **in progress** (Recursive Self-Improvement — Briefs 189-196 ready; 189 builder-claimable). **User-Facing Legibility phase in progress** (2026-04-20) — parent Brief 197 + sub-briefs 198/199/200 ready; 198 + 200 builder-claimable in parallel, 199 waits for 198. Phase 10 **complete**. Phase 14 **in progress** (Network Agent — engine code complete, Briefs 071+097+098a+098b+099a+099b+099c+108+110+114+119+120+121+124+125+126+127+128+129+130+131 all complete. Brief 115 Operating Cycle Archetype designed — split into sub-briefs 116-118, all complete. Briefs 119-141 complete. GTM pipeline fully tooled). Phase 15 **complete** (Managed Workspace Infrastructure — Briefs 090+091+100 all complete). Phase 11 **in progress** (Briefs 101-104+107+135 complete; browser-write Briefs 182-185 ready, 183 builder-claimable). Phases 12-13 **future**. 1797 unit tests + 14 e2e tests (4 spec files). 32 process templates. Front door conversational experience live. **Meta-process robustness: ALL COMPLETE (2026-04-16).** All 10 meta processes (MP-1 through MP-10), 44 work items, 11 briefs (145-148, 155-165). See `docs/meta-process-roadmap.md`. **User-journey P0 residuals closed (2026-04-16):** Brief 169 parent + sub-briefs 170-178 landed, covering shell-injection, credential-leak via tool output, budget pre-dispatch guard, YAML round-trip validation, definitionOverride cleanup, memory dropout observability, briefing query efficiency, ambiguous-intent clarification, stale-escalation ladder primitive. Dev-reviewer: CONDITIONAL PASS, follow-ups tracked in Brief 179 (3 P0 + 4 P1).
**Major reframe (ADR-010):** Roadmap restructured around workspace interaction model. Ditto is a living workspace where work evolves through governed meta-processes, not an automation platform. See ADR-010 for the full rationale.

This is the complete capability map for Ditto. Every item traces back to the architecture spec, human-layer design, or landscape analysis. Status is tracked per item. Nothing is silently omitted — deferred items have explicit re-entry conditions.

**Sub-roadmap:** [`docs/meta-process-roadmap.md`](meta-process-roadmap.md) — 10 meta processes (MP-1 through MP-10) that must be robust and tight for an excellent user journey. 44 work items across Goal Framing, Onboarding, Briefing, Feedback Loop, Trust Earning, Inbound Email, Exception Handling, Cycle Management, Process Editing, and Proactive Suggestions. Prioritised P0–P3 with dependency ordering. Read this when triaging next work.

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
| `cognitive_mode` field on process definitions (optional, default: analytical) | deferred | ADR-013 | Original | Re-entry: Cognitive Architecture A1 begins |
| Challenge `concern` field on confidence metadata | deferred | ADR-013 | Edmondson psychological safety + SAE Level 3 | Re-entry: Cognitive Architecture A1 begins |

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
| Digest mode for autonomous processes (outputs not in Review Queue, summary in Daily Brief) | deferred | ADR-011 | Zapier Digest + GitHub Copilot PR-as-batch | Re-entry: when autonomous tier processes running in web app |
| Silence-as-feature verified (autonomous clean runs produce no notifications) | deferred | ADR-011 | Management by Exception, PagerDuty | Re-entry: when autonomous tier processes running in web app |
| **Cognitive model (Phase 5 scope)** | | | | |
| Mode-aware review framing in CLI (analytical + creative) | deferred | ADR-013 | Kahneman System 1/2, Bloom taxonomy | Re-entry: Cognitive Architecture A1 begins |
| Enriched rejection vocabulary (tagged + gut rejection) | deferred | ADR-013 | Polanyi tacit knowledge, knowledge elicitation literature | Re-entry: Cognitive Architecture A1 begins |

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
| Per-process, per-service credential scoping | done | ADR-005 | Original | `credentials` table UNIQUE(process_id, service) (Brief 035). User-scoped credentials added (Brief 152): `userId` column, nullable `processId`, UNIQUE(user_id, service). Per-agent scoping deferred to Phase 12. |
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
| **SLM Training Data Pipeline (Brief 135/136)** | | | | |
| Training data type contracts (engine-generic) | done | Brief 136, Insight-175 | Original (trust system as training data flywheel) | `packages/core/src/learning/types.ts` |
| Training data extraction from step_runs + feedback | done | Brief 136 | Stanford Alpaca (pattern) | `src/engine/training-data.ts` |
| SLM readiness scoring (5 signals) | done | Brief 136 | Original | `src/engine/readiness-scorer.ts` |
| Fine-tuning candidate detection in model recommendations | done | Brief 136 | RouteLLM economics + Insight-175 | `src/engine/model-routing.ts` |
| `slm_training_exports` schema table | done | Brief 136 | Original | `src/db/schema.ts` |
| SLM provider factory (`createSlmProvider`, Neurometric auto-load) | done | Brief 137 | Neurometric API, OpenAI-compatible (pattern) | `src/engine/llm.ts` |
| SLM eval pipeline (deterministic holdout, classification+extraction comparison) | done | Brief 137 | EleutherAI lm-evaluation-harness (pattern) | `src/engine/eval-pipeline.ts` |
| SLM deployment lifecycle (state machine, drift retirement, human-gated promotion) | done | Brief 137 | Original | `src/engine/slm-deployment.ts` |
| Per-(process, step) routing override for promoted SLMs | done | Brief 137 | Original | `src/engine/model-routing.ts` `resolveProviderForStep()` |
| `slm_deployments` schema table | done | Brief 137 | Original | `src/db/schema.ts` |

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
| **Explicit knowledge extraction from corrections (Brief 060)** | architecture.md L5, ADR-003 | CE compound (pattern), Reflexion (evidence-grounded), Devin (structured extraction) | **done** — `processes/knowledge-extraction.yaml`, `src/engine/system-agents/knowledge-extractor.ts` |
| **Solution memory type with structured metadata (Brief 060)** | ADR-003 | memU reinforcement, Mem0 scope filtering | **done** — `src/db/schema.ts` (solution type + metadata column) |
| **Solution-aware retrieval with separate token budget (Brief 060)** | architecture.md L2 | Ditto memory-assembly pattern (Brief 027) | **done** — `src/engine/harness-handlers/memory-assembly.ts` (1000-token budget) |
| **Knowledge lifecycle: decay, supersession, pruning (Brief 060)** | Insight-022 | CE compound-refresh (pattern) | **done** — confidence decay after 50 runs, supersession of stale solutions |
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

### Critical Evaluation E1-E3: Failure Patterns + Verification (ADR-022)

**Re-entry condition:** A2 complete (orchestrator reflection cycle working)
**Note:** E1-E3 are independently valuable. E4-E5 require data accumulation (20+ runs).

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| **E1: Failure Pattern Memory** | | |
| Failure pattern extraction from corrections (5+ same type → pattern) | ADR-022 | Reflexion verbal reinforcement (Shinn et al., NeurIPS 2023) |
| Memory category tagging (`failure_pattern`, `hallucination_pattern`, `overconfidence_pattern`, `quality_drift`) | ADR-022 | Original — process-scoped failure accumulation |
| Context assembly retrieval of failure patterns + avoidance signal injection (max 2 per step) | ADR-022 | Reflexion context injection pattern |
| Pattern staleness (demote after 30+ runs untriggered, clear on trust upgrade) | ADR-022 | Original |
| **E2: Orchestrator Critical Enrichment** | | |
| Orchestrator reflection cycle gains steps 3, 5, 6 (failure retrieval, Self challenge, caution option) | ADR-022 | Waymo Critic concept + MAP Monitor + actor-critic pattern |
| Self suggestions evaluated against accumulated failure data before delivery | ADR-022 | Original |
| **E3: Conditional Verification Handler** | | |
| Two-stage `verification-check` handler in harness (pre-classifier + CoVe Factor+Revise) | ADR-022 | CoVe (Meta 2023), HaluGate (vLLM 2025), FActScore (EMNLP 2023) |
| Verification uses different model than producer when available | ADR-022 | AgentCoder independence principle |
| Verification issues flagged on step runs, routed to human review | ADR-022 | Existing trust gate pattern |

### Critical Evaluation E4-E5: Homeostatic Quality + Correlation (ADR-022)

**Re-entry condition:** E1+E2 data accumulation (20+ runs per process)

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| **E4: Homeostatic Quality Regulation** | | |
| 5-dimension quality tracking with optimal ranges (not single-score maximization) | ADR-022 | Keramati & Gutkin homeostatic regulation (eLife 2014) |
| Approach/avoidance signal generation via verbal context injection | ADR-022 | Reflexion + METR reward hacking evidence |
| **E5: Cross-Process Failure Correlation** | | |
| Awareness-level systemic failure pattern detection (same pattern in 3+ processes) | ADR-022 | Original — L4 awareness enrichment |

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

**Re-entry condition:** Layer 5 (Learning) is live ✓ (Brief 060 knowledge-compounding shipped; correction → solution memory bridge operational).
**Status (2026-04-17): re-opened as network-scale learning loop.** Brief 181 (`docs/briefs/181-recursive-self-improvement.md`) is the parent plan. ADR-033 (`docs/adrs/033-network-scale-rsi-architecture.md`) resolves the five architecture-layer questions; ADR-034 (`docs/adrs/034-release-distribution-model.md`) resolves the three distribution-layer questions. Research report: `docs/research/network-scale-rsi-tech-choices.md`. Seven sub-briefs described in Brief 181 §Phasing, pending renumbering (originally 182–188, collide with browser/OAuth/autopilot briefs that shipped in parallel; will renumber to 189+ when detailed).

| Capability | Status | Source doc | Build from |
|-----------|--------|-----------|------------|
| **Parent plan + architectural decisions (2026-04-17)** | | | |
| Brief 181 parent — network-scale RSI plan | done | Brief 181 | Original + DGM/HGM/Promptbreeder/STOP/TextGrad/DSPy/compound-product |
| ADR-033 — network-scale RSI architecture | done (proposed) | Brief 181, research report | Original (composed from Brief 091 canary primitive + Insight-111/156 constraints + surveyed options) |
| ADR-034 — release distribution model | done (proposed) | Brief 181, research report | TUF-lite + optional Rekor + in-toto; air-gapped YubiKey ceremony; cause-attributed rollback; adaptive cadence |
| Research report — 25 signing/privacy/canary options surveyed | done | — | WebSearch + WebFetch audit, neutrality review |
| 18 landscape entries for RSI external deps | done | Insight-043 | Live metadata verified |
| **Sub-briefs (ready for builder)** | | | |
| Brief 189 — Evidence harvest pipeline (node emitter + network receiver + privacy layer) | ready | Brief 181, ADR-033 §1 | Original; starts |
| Brief 190 — Network scanner + sandbox + archive | ready | Brief 181, ADR-033 §2/§4 | DGM archive + probabilistic selection; depends 189 |
| Brief 191 — Release signing + ceremony + shard escrow (narrowed 2026-04-18 per reviewer) | ready | Brief 181, ADR-034 §1-3 | TUF walk-forward; depends 189 |
| Brief 195 — Rollout controller + cause-attributed gating + telemetry (split from original 191) | ready | Brief 181, ADR-034 §4 | Cause-attributed rollback weighting; depends 189+191 |
| Brief 196 — Node adoption policy + three-way merge + rollback (split from original 191) | ready | Brief 181, ADR-034 §3-4, ADR-033 §3 | Tier-gated adoption; depends 191+195 |
| Brief 192 — Scanner self-evolution + cognitive layer (L5 × LC) | ready | Brief 181, ADR-033 §3 | Promptbreeder mutation-prompt; depends 190+191+195+196 |
| Brief 193 — Adversarial detection + meta-observability | ready | Brief 181, ADR-033 §1a | Original reputation-weighted aggregation; depends 189+190 |
| Brief 194 — Dev pipeline integration for engine-level changes | ready | Brief 181 | Existing dev-pipeline + replay-corpus validator + shadow-mode; depends 190+191+195+196 |
| **Legacy/prior single-node capabilities (absorbed)** | | | |
| `improvement-scanner` system agent (single-node framing) | superseded by ADR-033 network-scale model | architecture.md, ADR-008 | — |
| Improvement proposals in review queue (single-node framing) | superseded by ADR-033 Improvement Card + release manifest model | architecture.md L5 | — |
| Approved improvements → feature-implementation handoff (single-node framing) | superseded by ADR-034 release distribution model | architecture.md (Process 3) | — |

**Downstream prerequisites:** All 8 sub-briefs are Status: ready. Sequential dependency: 189 (starts) → {190, 191} (both depend 189) → 195 (depends 189+191) → 196 (depends 191+195) → {192, 194} (both depend 190+191+195+196) → 193 (depends 189+190, can run parallel with 191+). Recommended build order: 189 → 190 → 191 → 195 → 196 → {192, 193, 194} parallel.

### User-Facing Legibility (2026-04-20, Phase 9/10 parallel)

**Re-entry condition:** principle captured in Insight-201 (`docs/insights/201-user-facing-legibility.md`); four-category frame (outbound / inbound / generated / internal) defined; cabinet triage (2026-04-20) surfaced the underlying property.

**Key principle:** at user-facing data seams, file-backed projection is the default — DB-opacity must justify itself. Ditto itself is the git remote (Insight-202); no external-service dependency.

**Key design calls (parent Brief 197):**
- Four categories: outbound (emails/DMs/posts Ditto sent — Rob's *"did you actually send that?"*), inbound (received + processed), generated (quotes/invoices/reports/briefings), internal (memories/improvements/work_items/feedback/process_versions/activities)
- Categories 1–3 carry an **artefact canonicalisation prerequisite** — content is not currently persisted as discrete retrievable things; they need research + design before projection applies
- Category 4 is the cheapest pilot — DB already has the data
- Read-only projection in v1; bidirectional deferred behind named trigger (Insight-200)
- Secrets and PII MUST NOT project — fail-closed filter at 0.95 classifier confidence

| Capability | Status | Source doc | Build from |
|-----------|--------|-----------|------------|
| **Design artefacts (2026-04-20)** | | | |
| Insight-201 — principle + four-category frame | active | `docs/insights/201-user-facing-legibility.md` | Original (triggered by cabinet triage) |
| Insight-202 — Ditto-as-X before external-X | active | `docs/insights/202-ditto-as-X-before-external-X.md` | Original |
| Research — option space (cabinet/Obsidian/Logseq/Foam/Dendron/Datasette) + three gaps | done | `docs/research/user-facing-legibility-patterns.md` | Public PKM architectures + DLP pattern |
| Designer UX — persona-driven memories inspection | done (Architect-as-Designer; re-review owed) | `docs/research/memories-legibility-ux.md` | Original |
| Brief 197 — phase design parent | ready | `docs/briefs/197-user-facing-legibility-phase.md` | Original |
| **Memories pilot (parallel-unlockable, 2026-04-20)** | | | |
| Brief 198 — memory write chokepoint refactor (prerequisite) | ready | `docs/briefs/198-memory-write-chokepoint-refactor.md` | Original; mechanical refactor across 22 call-sites |
| Brief 199 — memories projection + 2-stage safety filter (regex→LLM) + 54-entry corpus | ready | `docs/briefs/199-memories-projection-and-safety-filter.md` | gitleaks/truffleHog patterns (pattern) + DLP two-stage classifier (pattern) + cabinet git-auto-commit (pattern); isomorphic-git (depend) |
| Brief 200 — workspace git-over-HTTPS server + bootstrap + clone credentials UI | ready | `docs/briefs/200-workspace-git-server.md` | isomorphic-git + @isomorphic-git/http-node (depend); gitea/gogs self-hosted pattern |
| **Future sub-briefs (not pre-numbered per Insight-200 hygiene)** | | | |
| Category 4 siblings — `improvements`, `work_items`, `process_versions`, `feedback` legibility | future | — | Same pattern as memories; no canonicalisation prerequisite |
| Category 4 — `activities` legibility | future (separate research pass) | — | High-volume seam needs date-sharding / pruning research first |
| Category 1 — outbound communications legibility (emails/DMs/posts) | **blocked on canonicalisation research** | — | **Requires research pass on canonical outbound-artefact storage** before Designer + Architect |
| Category 2 — inbound communications legibility | **blocked on canonicalisation research** | — | Same canonicalisation prerequisite |
| Category 3 — generated artefacts legibility (quotes/invoices/reports/briefings) | **blocked on canonicalisation research** | — | Same canonicalisation prerequisite |

**Downstream prerequisites:** 198 starts (no deps); 200 can build in parallel (no deps); 199 depends on 198. Pilot demonstrable end-to-end once all three ship. Category 1-3 sub-briefs require a dedicated research pass on artefact canonicalisation before they can be designed.

**Compensating control owed (Brief 199):** fresh-context Designer re-review on `memories-legibility-ux.md` was **waived by user authorization 2026-04-20** on status promotion to `ready`. AC #18 in Brief 199 remains as principle; waiver documented in brief header.

### Cloud Execution Runners (2026-04-25, Phase 9+ substrate)

**Re-entry condition:** Brief 212 (Workspace Local Bridge) **complete 2026-04-26**; the local-mac-mini runner is the local arm. Brief 214 (`docs/briefs/214-cloud-execution-runners-phase.md`) is the parent phase that adds the four cloud peers around it (`claude-code-routine`, `claude-managed-agent`, `github-action`, `e2b-sandbox` deferred). End-state: phone-only operation of intake → triage → approve → dispatch → PR → review → checks → ready-to-deploy → deploy across any project.

**Key principle (Brief 214 §D1):** Runner is a *work-item-level dispatch primitive*, not a step.executor value. Step.executor stays unchanged for Ditto's per-step loop; runners hand the whole work item to an external execution surface.

| Capability | Status | Source doc | Build from |
|---|---|---|---|
| **Substrate (this brief)** | | | |
| Brief 215 — Projects + Runner Registry schema + dispatcher resolution + admin scaffold | **complete (2026-04-26)** | `docs/briefs/complete/215-projects-and-runner-registry.md` | Original schema + adopted bridge state-machine pattern (adapted to 9 dispatch states); runner resolution algorithm has no surveyed equivalent (Brief 214 §D5) |
| `projects` + `project_runners` + `runner_dispatches` tables + `processes.projectId` FK + `workItems.runnerOverride/ModeRequired` columns | done | Brief 215 schema additions in `packages/core/src/db/schema.ts` | Drizzle migration `0012_projects_runners.sql` (idx=11) |
| Engine-core runner module: kinds, 9-state SM, `RunnerAdapter` interface, pure resolver, Zod webhook discriminated-union | done | `packages/core/src/runner/` | Original |
| Pure project status-transition invariants (`analysing`→`active` requires defaultRunnerKind + enabled row) | done | `packages/core/src/projects/invariants.ts` | Original (Brief 224 will call) |
| In-process runner registry + dispatcher (chain walk + per-attempt audit + `harness_decisions` row tagged `reviewPattern: ["runner-dispatch"]`) | done | `src/engine/runner-registry.ts`, `src/engine/runner-dispatcher.ts` | Original; adopts Insight-180 stepRunId-guard pattern |
| `local-mac-mini` `RunnerAdapter` over Brief 212's `LocalBridge`; engine-boot wiring composes Brief 212 primitives into the interface | done (2026-04-26 — Brief 212 complete) | `src/adapters/local-mac-mini.ts`, `src/engine/local-bridge.ts`, `packages/web/instrumentation.ts` | Brief 212's `dispatchBridgeJob` + `sendBridgeFrame` + `revokeDeviceConnection` + `bridgeDevices` query composed into `LocalBridge` interface |
| Idempotent project seed at boot (`agent-crm` + `ditto`) wrapped in transaction | done | `src/engine/projects/seed-{data,on-boot}.ts` | Original |
| `/projects` admin scaffold (index / new / detail / runners) — mobile-first, kind-selector with disabled cloud kinds + tooltips | done | `packages/web/app/projects/`, `packages/web/app/api/v1/projects/` | Original |
| **Sub-briefs (downstream of Brief 215)** | | | |
| Brief 216 — `claude-code-routine` adapter | done (2026-04-27, post-Reviewer-fix) | `docs/briefs/complete/216-routine-dispatcher.md` | Anthropic Routine HTTP `/fire`. AC #1-#10, #13 PASS via 87 tests across 6 files; AC #11 (E2E smoke) deferred manual; AC #12 (trust-tier) covered at dispatcher layer per Brief 215. GitHub webhook receiver `POST /api/v1/integrations/github/webhook` wired (HMAC-SHA256 + 7 tests). |
| Brief 217 — `claude-managed-agent` adapter | done (2026-04-27, post-Reviewer-fix) | `docs/briefs/complete/217-managed-agent-dispatcher.md` | Anthropic Managed Agents HTTP API (raw `fetch` — bundled `@anthropic-ai/sdk` doesn't expose `beta.managedAgents.*` yet; deviation flagged for Architect). AC #1-#10, #14, #15 PASS via 143 tests across 10 files; AC #11 (SSE observability) DEFERRED to a polish brief (config flag round-trips, runtime SSE not wired); AC #12 (E2E smoke) deferred manual; AC #13 (trust-tier) covered at dispatcher layer per Brief 215. Cross-runner poll cron (`runner-poll-cron.ts`) walks 30s cadence; routines stay GitHub-events-only. Kind-agnostic shared modules (`cloud-runner-prompt.ts`, `cloud-runner-fallback.ts`) renamed per §D14 coordination — no duplicate kind-specific modules survive. |
| Brief 218 — `github-action` adapter | done (2026-04-27, post-Builder + Reviewer-fix) | `docs/briefs/complete/218-github-action-dispatcher.md` | GitHub `workflow_dispatch` + `workflow_run` webhook. Raw `fetch` against `api.github.com` (brief assumed `@octokit/rest` was in stack — wasn't; same Insight-213 SDK-mismatch pattern as Brief 217's Anthropic-SDK case; flagged in landscape.md as PATTERN not DEPEND). Three callback modes (`webhook-only` default / `in-workflow-secret` / `in-workflow` with per-dispatch ephemeral token + log-masking risk). Webhook-primary status via `cloud-runner-fallback.ts` extended with `workflow_run` correlation by `external_run_id` + `check_run.completed` infrastructure for Brief 219; 60s polling backup via `pollCadenceMs['github-action']`. Real cancellation. Engine-core: `githubActionStatusPayload` Zod schema (full 9-conclusion mapping incl. `stale → cancelled`) + `WorkflowRunConclusion` type re-exported. AC #1-#10, #12, #13 PASS via 156 Brief-218-specific tests across 7 files (51 adapter + 38 fallback + 11 status-handler + 11 poll-cron + 13 engine-core schema + 12 cadence + spike). AC #11 (E2E smoke) deferred manual per the brief. **Reviewer-fix commit `c337c95`:** HIGH-1 `harness_type` was hardcoded to "catalyst" — added `harnessTypeFor` resolver mirroring sibling adapters; native + none projects now correctly trigger workflow's release-asset skill fetch per §D4. MEDIUM-1 6 trust-tier integration tests added at adapter layer. MEDIUM-2 `defaultDevReviewSkillUrlFor` requires ALL THREE env vars (was defaulting `anthropic/ditto` → 404). MEDIUM-3 `listRunIdFallback` actually filters by created_at within ±windowMs. MEDIUM-4 `handlePullRequestEvent` allows non-`claude/*` branches when an active github-action dispatch exists for the repo. LOW-1 verifier perf SQL filter. LOW-2 template `env.PR_URL` conditional + admin-form string lockstep. Template workflow YAML at `docs/runner-templates/dispatch-coding-work.yml` ships as docs (no auto-commit). |
| Brief 219 — Optional Greptile/Argos integrations (per-project detected) | not yet written | — | Greptile + Argos APIs (cloud SaaS only at MVP) |
| Brief 220 — Mobile deploy-gate UX | not yet written | — | Original |
| Brief 221 — Mobile pill / "Run on:" selector + runner metrics admin | not yet written | — | Original |
| **Adjacent — Battle-Ready Project Onboarding (Insight-205, depends on this substrate)** | | | |
| Brief 223 — Projects brief-equivalent workItems extension + status webhook + CRUD | rescoped per Brief 215 collision reconciliation | `docs/briefs/223-projects-schema-and-crud.md` | Brief 215 substrate |
| Brief 224 — Project Onboarding & Battle-Readiness (parent) | not yet detailed | `docs/briefs/224-project-onboarding-and-battle-readiness.md` | Insight-205 |
| Brief 225 — Connection-as-process plumbing (sub-brief #1 of 224) | done (2026-04-27, post-Reviewer + dev-review fixes) | `docs/briefs/complete/225-connection-as-process-plumbing.md` | Substrate plumbing: `projects.kind` schema column, `processes/project-onboarding.yaml` system process with placeholder handlers, `start_project_onboarding` Self tool, env-var-gated `kickOffOnboarding` body field on POST /api/v1/projects, three onboarding routes (GET state / atomic confirm / cancel), in-process `createOnboardingProject` helper, Server Component at `/projects/:slug/onboarding`, sidebar CTA, ConnectionSetupBlock renderer extension. Insight-180-guarded handlers + idempotency on retries. AC 1-4, 9-14 PASS; ACs 5-8 PARTIAL (route-level tests deferred). |
| Brief 226 — In-depth analyser (sub-brief #2 of 224) | done (2026-04-27, post-Builder + dev-review fixes) | `docs/briefs/complete/226-in-depth-analyser.md` | Replaces Brief 225's `clone-and-scan` + `surface-report` placeholder bodies with the read-only analyser brain. 7 new sibling steps in `processes/project-onboarding.yaml` (build-system / test-framework / CI / existing-harness detectors + persona-fit scoring + gold-standard match + runner+tier recommendation; total 9 steps). `isomorphic-git` newly installed (Briefs 199/200 hadn't shipped — Builder flagged for Architect). New `AnalyserReportBlock` ContentBlock type (27th in discriminated union) + React renderer + Server Component branch + boot-time cleanup sweep. Detector partial-success path (Brief 226 §AC #11) wired throughout: a thrown detector emits `_detectorError` instead of blocking the report. Engine-side detection types in `packages/core/src/onboarding/types.ts` (portable). Persona-fit type-system enforcement (descriptor-only, internal labels never exported; regression test asserts the regex). Gold-standard graceful degradation when `docs/landscape-index.json` is missing. **Insight-205 absorption gate discharged** — sub-brief #2 ships per Brief 224 §AC #8. 53 onboarding tests pass; root + core type-check clean. **Reference doc drift flagged for Architect:** isomorphic-git pre-install assumption + design-package component CSS layer (`alex-line`, `block.evidence`, `block.decision`, `recbadge`, `.dopt.rec`) not yet in `globals.css` (semantic tokens are). |
| Brief 227 — Project memory scope + promotion (sub-brief #4 of 224) | done (2026-04-27, post-Reviewer + dev-review fixes) | `docs/briefs/complete/227-project-memory-scope-and-promotion.md` | `memories.appliedProjectIds` JSON column + `activities_entity_action_idx` composite index (migration `0016_broad_onslaught.sql`); `HarnessContext.projectId` threaded via heartbeat; `buildProjectScopePredicate()` in memory-assembly.ts (project-mate sharing + self-scope `appliedProjectIds` retrieval + AC #12 backfill discipline); 3 new Self tools (`promote_memory_scope`, `demote_memory_scope`, `dismiss_promotion_proposal`) with Insight-180 guards + activities audit trail; `cross_project_promotion` SuggestionItem variant + `detectCrossProjectPromotionCandidate()` with 30-day cooldown; `MemoryScopePill` (4 variants) + `MemoryPromoteConfirmation` + memory detail surface + 3 API endpoints. ADR-003 amended at both required locations + 3 new dictionary entries. 39 tests across 5 files. |

**Downstream prerequisites:** Brief 215 substrate done. Brief 212 cloud dispatcher landed 2026-04-26 — `dispatchBridgeJob` + `sendBridgeFrame` + `revokeDeviceConnection` + `bridgeDevices` query are the primitives the `local-mac-mini` `RunnerAdapter` composes via `LocalBridge`. Sub-briefs 216-218 unblocked — each registers an adapter into the in-process registry and ships its kind-specific `configSchema` Zod tightening on `webhook-schema.ts`. AC #11 wiring obligation closed: instrumentation.ts can now swap `bridge: null` for the real `LocalBridge` instance composed of Brief 212 functions.

### Hire a Specialist — Activate L2 Agent Primitive (2026-04-20, adjacent to User-Facing Legibility)

**Re-entry condition:** Paperclip re-evaluation surfaced that Ditto's L2 Agent primitive + UI primitive #10 Agent Card (spec'd in `human-layer.md`) have been dormant for ~18 months with no activation path. Persona Nadia ("Team Manager Supporting Specialists with Agents") has been effectively unserved.

**Key principle:** Self manages the agents. The user may converse directly with any hired agent; Self observes every turn and has standing authority to Ask / Flag / Pause / Escalate / Propose (five interjection verbs, closed enumeration). Observation rate is trust-tier-driven per ADR-007 + ADR-038.

**Key design calls (parent Brief 201):**
- Hired Agent as a user-facing hirable specialist primitive — YAML-primary storage, conversational hire as default, DB mirror for query.
- No `reports_to`, no `company_id`, no corporate vocabulary. Self is the sole manager; agents are peers under Self.
- Three-voice conversation UX (user / agent / Self) — novel axis, no prior art in surveyed systems.
- Memory scoped per hired agent; Self reads all; default isolation between agents; cross-share deferred.
- Trust tiers use ADR-007's four-tier enum; ADR-038 introduces observation-rate bands mapped from tier + time-in-tier.

| Capability | Status | Source doc | Build from |
|---|---|---|---|
| ADR-036 — Database Tier Strategy (substrate) | proposed | `docs/adrs/036-database-tier-strategy.md` | Original (extends ADR-001); closes architecture.md:1205 multi-tenancy open question |
| ADR-037 — Hired Agents Primitive | proposed | `docs/adrs/037-hired-agents-primitive.md` | Paperclip `agents` schema (adopt, minus `reports_to` and `company_id`); YAML-primary storage extends Ditto process pattern |
| ADR-038 — Self-Supervised Agent Dialogue | proposed | `docs/adrs/038-self-supervised-agent-dialogue.md` | Maker-checker dev-process pattern (extend); three-voice UX (original) |
| ADR-039 — Hired-Agent Memory Scope | proposed | `docs/adrs/039-hired-agent-memory-scope.md` | Extends ADR-003; new `hired-agent` scope_type + access-control matrix |
| Brief 201 — Hire a Specialist (parent) | **draft (2026-04-20)** | `docs/briefs/201-hire-a-specialist-phase.md` | Paperclip (adopt schema + pattern UX), ADR-016 + ADR-007 + ADR-003 (extend) |
| **Pre-build UX pass** | owed | `docs/research/hire-a-specialist-ux.md` | `/dev-designer` covering Agent Card (#10), Agent Detail, three-voice conversation surface |
| **Sub-briefs 202-206** (not yet drafted) | outlined in parent | — | Schema/YAML (202) → hire flow (203) → Agent Card (204) → detail page (205) → supervision (206) |

**Downstream prerequisites:** (a) ADRs 036-039 move `proposed → accepted`, (b) `/dev-designer` produces `docs/research/hire-a-specialist-ux.md`, (c) sub-briefs 202-206 drafted before build. Build order: 202 → 203 → 204 → 205 → 206 (205 and 206 parallelizable if reviewer bandwidth allows).

**Deferred (post-phase):** Multi-user workspace access (Nadia's EA delegation); agent-to-agent delegation; harness-legibility view (reimagined OrgChart); integrations-management surface; workspace-multi-user.

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
| Output Viewer (renders through BlockList, not bespoke viewers — ADR-021/023) — **first viewer done (Brief 050: document/markdown)** | human-layer.md, ADR-009 v2, ADR-023, Brief 050 | Original design + react-markdown (depend) |
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
| **Workspace Transitions (Brief 046)** — **done** | | |
| Conversation renders in workspace centre column (between feed and input) | Brief 046, human-layer.md | AI SDK v6 `useChat` + `ConversationMessage` reuse |
| Right panel adaptive modes (Process Builder, Artifact Viewer, Briefing) | Brief 046, human-layer.md | Melty IDE badge pattern, credential-request pattern (extend) |
| Tool-result → panel transition map (`TRANSITION_TOOL_MAP`) | Brief 046 | Original |
| Mobile bottom sheet for artifact review (<1024px) | Brief 046 | iOS/Android bottom sheet convention |
| Auto-switch conversation → workspace on first process creation | Brief 046 | Custom event bus |
| **Surface Protocol (ADR-021)** — **web surface done (Brief 045)** | | |
| Self emits typed ContentBlock[] (22 block types incl. ArtifactBlock, not string) — **done** | ADR-021, ADR-023 | Original — Adaptive Cards (pattern), Vercel AI SDK v6 (depend), Slack/Telegram (pattern) |
| Per-surface renderers (web=React **done**, Telegram=inline keyboards, CLI=prompts) | ADR-021 | Original |
| Action callbacks via handleSurfaceAction() — single entry point — **done (web)** | ADR-021 | Slack action_id + Telegram callback_data (pattern) |
| Graceful degradation — unknown blocks fall back to text — **done** | ADR-021 | Adaptive Cards fallbackText (pattern) |
| **Composition + Output principles (ADR-009 v2)** | | |
| Process output schemas (5 destination types, static/dynamic lifecycle) | ADR-009 v2, Insight-066 | Original + json-render spec types (adopt) |
| Catalog-constrained view rendering (catalog → registry → renderer) | ADR-009 v2 | json-render (adopt, not depend — Insight-068) |
| Trust-aware UI density (supervised=full, autonomous=exceptions) | ADR-009 v2 | Original |
| Trust-governed output delivery + catalog richness | ADR-009 v2 | Original |
| ~~No ViewSpec protocol for app's own UI — standard React~~ | ADR-009 v2 | Revised by ADR-024: centre canvas is composition surface |
| **Composable Workspace Architecture (ADR-024, Brief 047)** | | |
| Centre canvas as composition surface (deterministic composition functions per nav intent) — **done (Brief 047)** | ADR-024, Brief 047 | Original — navigation-as-composition-intent |
| Must-show blocks (critical alerts + trust gate reviews composition-immune) — **done (Brief 047)** | ADR-024, Brief 047 | Harness pattern — never suppress critical items |
| Sidebar navigation aligned to prototypes (Today/Inbox/Work/Projects/Routines/Settings) — **done (Brief 047)** | ADR-024, .impeccable.md | P00 v2 prototype |
| ArtifactBlock type + engine-connected artifact mode (BlockList renders content from API) — **done (Brief 050)** | ADR-023, ADR-024, Brief 050 | react-markdown + remark-gfm (depend) |
| TextBlock markdown rendering (headings, tables, code, GFM) — **done (Brief 050)** | ADR-021, Brief 050 | react-markdown (depend) |
| Shell execution tool for ai-agent executor (`run_command`, allowlisted commands) — **done (Brief 051)** | Brief 051, architecture.md | Node.js `execFile` + CI runner allowlist pattern |
| Planning workflow (`plan_with_role` Self tool for collaborative planning) — **done (Brief 052)** | Brief 052, ADR-016 | consult_role pattern (extend) + codebase tools |
| Execution pipeline wiring (`start_pipeline`, ProgressBlock, review gates, session trust) — **done (Brief 053)** | Brief 053, ADR-024 | SSE event pattern (existing) + session-scoped trust (original) |
| Testing infrastructure (Playwright e2e, MOCK_LLM, expect-cli AI tests, CI) — **done (Brief 054)** | Brief 054 | @playwright/test (depend), millionco/expect via ACP (adopt) |
| Scope selection + roadmap visualization (Roadmap composition, brief index) — **done (Brief 055)** | Brief 055, ADR-024 | Composition engine pattern (existing) + Markdown header parsing (original) |
| Observability layer (interaction events, brief sync, meta-process signals) — **done (Brief 056)** | Brief 056, architecture.md L5 | PostHog event model (pattern) + existing activity recording |
| AI SDK & Elements Adoption — full useChat API surface + adopted AI Elements components + streamdown markdown — **done (Brief 058)** | Brief 058, Insight-114 | AI Elements (adopt), streamdown (depend), use-stick-to-bottom (depend), Zod v4 dataPartSchemas |
| AI Elements Deep Adoption — composable subcomponents, Radix primitives, 4 block renderer upgrades, 7 new AI Elements, Shiki syntax highlighting — **done (Brief 061)** | Brief 061, Insight-114, Insight-117 | AI Elements (adopt), Radix UI (depend), Shiki (depend) |
| Conversation Experience Activation — conversation chrome (reasoning, tools, confirmations, citations, typing indicator) + message queueing — **approved, ready to build (Brief 062)** | Brief 062, Insight-119 | AI Elements composable subcomponents (Brief 061), Claude.ai queue pattern |
| Real-Time Streaming Fix — Claude CLI `--include-partial-messages`, stream_event parsing (text_delta + thinking_delta), CLI internal tool visibility (tool-use-start/end), collapsible activity groups, user toggle autonomy — **done (Brief 064)** | Brief 064, Insight-120, Insight-124 | Claude CLI headless stream-json protocol (pattern), Conductor IDE tool visibility (pattern) |
| Conversation Core Feel — floating prompt input, streaming cursor (vivid caret on text-delta), dot breathing, tool step compaction, reasoning content display — **done (Brief 065)** | Brief 065, Insight-110, Insight-124, Insight-125 | Claude.ai (pattern), ChatGPT (pattern), Cursor (pattern) |
| Confidence & Trust Card — response-level confidence assessment, ConfidenceCard UI component, uncertainties-first display — **done (Brief 068)** | Brief 068, Insight-128, Insight-129 | Claude.ai (pattern), uncertainty-first display (original) |
| Rich Block Emission — all 19 Self tools produce appropriate ContentBlocks (Record, Metric, Suggestion, Alert, Checklist, etc.), metadata-first block mapping pattern — **done (Brief 069)** | Brief 069, Insight-131, Insight-134 | Deterministic tool→block mapping (original), metadata-first pattern (original) |
| Block Renderer Polish — Tier 2→Tier 1 visual quality for 7 block renderers — **done (Brief 063, verified 2026-04-01)** | Brief 063, P30 prototype | Tier 1 block patterns (existing), Lucide icons (depend) |
| Interactive ContentBlocks — editable ProcessProposalBlock, WorkItemFormBlock, ConnectionSetupBlock, form-submit action routing — **done (Brief 072)** | Brief 072, ADR-021, Insight-135 | Notion block editor (pattern), Paperclip.ai (pattern), ADR-021 handleSurfaceAction (extend) |
| Orchestrator Auto-Wiring — goalHeartbeatLoop, auto-decompose → route → execute → chain, pause_goal tool, keyword+slug task routing — **done (Brief 074)** | Brief 074, ADR-010, ADR-015, Insight-132/133 | Temporal workflow engine (pattern), Mastra control-flow (adopt) |
| Goal-Level Reasoning — LLM-powered goal decomposition into sub-goals (find/build tagged), dimension map clarity assessment (6 dimensions), system-enforced action boundaries per context (front_door/workspace/workspace_budgeted), GoalDecomposition types in @ditto/core — **done (Brief 102)** | Brief 102, ADR-015, ADR-010 | LangGraph plan-and-execute (pattern), MEDDIC/BANT clarity assessment (pattern), RBAC on tools (pattern) |
| Budget Infrastructure — per-goal budget ledger, Stripe Checkout payment, spend tracking per sub-goal, budget exhaustion soft-stop with notifyUser top-up request, 90% warning, heartbeat integration — **done (Brief 107)** | Brief 107, Brief 102 | Stripe Checkout (depend), AgentMail webhook pattern (adopt), double-entry bookkeeping (pattern) |
| Find-or-Build Routing — three-tier sub-goal routing (Process Model Library → existing process → Build meta-process), build depth=1 enforcement, first-run gate, goal-level trust inheritance (more-restrictive resolution), LLM output threading between sub-goals, bundled phase-boundary reviews, concurrent build dedup, goal cancellation — **done (Brief 103)** | Brief 103, ADR-015, Insight-163 | npm registry (pattern: check before build), canary deployment (pattern: first-run gate), session trust Brief 053 (adopt: relax-only inheritance), Agile sprint review (pattern: bundled reviews) |
| Composition Intent Activation — 6 intent compose functions with empty/active states, intentContext in Self system prompt — **done (Brief 073)** | Brief 073, ADR-024, Insight-134/136 | Linear empty states (pattern), ADR-024 deterministic composition (extend) |
| Live Preview viewer as extension seam | ADR-024, Insight-104 | Claude Artifacts / Cursor / Lovable (pattern) |
| Self-driven composition (replaces deterministic functions) | ADR-024 Phase 11+ | Original — deferred |
| Output-as-interface between processes (typed contracts, sync-time validation) | ADR-009 v2 | Original |
| Skills packages as agent toolkit extensions (design quality, etc.) | Insight-069 | Impeccable pattern |
| **Deferred evaluations** | | |
| QA/Tester role evaluation — browser-based behavioral testing (re-entry from Insight-038) | Insight-038, research/qa-tester-role-in-dev-pipeline.md | gstack `/qa` pattern |
| **Tech stack** | | |
| Next.js + React + shadcn/ui + Tailwind | architecture.md | 2026 default stack |
| Vercel AI SDK v6 for conversation layer — **done (Brief 045)** | ADR-010 | Vercel AI SDK v6 (`vercel/ai` + `@ai-sdk/react`) |
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
| **Process Model Library curation** (Brief 104) | ADR-008, ADR-015, Insight-099 | App store review pattern + spec testing + semantic versioning |
| `process-validator` system agent (4-check quality gate) | Brief 104 | Done |
| `library-manager.ts` (nominate/publish/archive/query) | Brief 104 | Done |
| `processModels` DB table (engine primitive in @ditto/core) | Brief 104 | Done |
| `library-curation.yaml` (5-step meta-process) | Brief 104 | Done |
| `findProcessModel()` DB-backed (replaces filesystem) | Brief 104 | Done |
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

### Phase 14: Network Agent

**Re-entry condition:** Phase 10 complete, Proactive Operating Layer designed
**Status:** Engine code complete (Briefs 080-085). Process templates complete. Character bible + persona architecture complete. Front door + intake flow complete. **Web acquisition funnel complete (Briefs 093-095):** conversational front door, verify page, referred page, post-submission engagement. **Multi-provider purpose routing complete (Brief 096, ADR-026):** Anthropic + OpenAI + Google simultaneous loading, purpose-based model selection. Deployment briefs (086-089) designed and approved. **Integration tools complete (Brief 097):** CRM built-in tools, atomic send-and-record. **Pulse + chain execution complete (Brief 098a):** continuous operation loop, chain definitions, delayed runs, trust inheritance. **Inbound email + status composition complete (Brief 098b).** **Communication intelligence complete (Brief 099a/b/c).** **Referral footer complete (Brief 109):** two-sided acquisition loop end-to-end (Insight-155). **Admin oversight complete (Brief 108):** admin dashboard, pause/resume, feedback, act-as-Alex, downgrade notifications (Insight-160 implementation). **Workspace suggestion trigger complete (Brief 110):** automated detection of workspace readiness (3+ processes, 4+ sub-goals, keyword signals), woven into status email, 30-day cooldown (Insight-161). **Cognitive mode extensions complete (Brief 114):** mode-dependent judgment calibration for connecting/selling/nurturing/chief-of-staff (Insight-165). **Operating Cycle Archetype complete (Briefs 115-118):** coarse judgment-driven cycles, shared infrastructure, cycle definitions, self-tools — all complete. Insights 166-169. **Pricing strategy complete (Brief 119).** **Front door relationship lifecycle complete (Briefs 120-121):** process primitives (schedule, wait_for, gate, email_thread), magic links, ghost mode, email cancellation. **Ghost mode complete (Brief 124):** cognitive extension, voice model, eligibility validation via rules executor. **Journey edge cases complete (Brief 126):** AC19 (both-mode cancellation) + AC20 (trust inheritance in fireEvent) fixed. **Cognitive orchestration complete (Brief 127, ADR-027):** staged outbound tools pattern, partially superseded by operating cycles. **Model purpose resolver complete (Brief 128).** **Staged outbound tools complete (Brief 129).** **Thin process templates complete (Brief 130):** 4 templates refactored to cognitive steps per ADR-027. **Universal Work Loop Activation complete (Brief 071):** all 11 parent ACs, 6 sub-briefs complete. **Self Cognitive Orchestration complete (Brief 131, ADR-027):** `orchestrate_work` tool (Self spawns thin processes via `startSystemAgentRun`), `generate_chat_link` tool (email-to-chat escalation with pre-seeded sessions), cognitive mode orchestration sections. ADR-027 mechanism 3 fully implemented. **Deliberative perspectives complete (Brief 136, ADR-028):** parallel lens generation, peer review, synthesis handler. **Browser research skill complete (Brief 134):** Stagehand-based `browse_web` self-tool. **Front door content blocks complete (Brief 137, Insight-177):** BlockRenderer in front door conversation. **GTM cycle type complete (Brief 139):** `gtm-pipeline` as first-class cycle type with multi-plan concurrency, structured `gtmContext` input, perspectives on research steps, social delivery tools (Unipile DMs, X API, feed posts). Unlocks Brief 140 (Growth Composition Intent) and Brief 141 (Structured GATE + Posting Queue). **Outreach strategy layer complete (Brief 149, Insight-182):** plan-approve-execute pattern, volume governance (5→10→20), dual-surface outreach tables, htmlBlocks pipeline. **Adaptive workspace views complete (Brief 154, Insight-189):** data-driven compositions registered at runtime via `workspaceViews` table, network agents push blocks live via SSE, `workspace.push_blocks` + `workspace.register_view` tools, process companion view registration, adaptive sidebar navigation. Next: Briefs 086-089 (Network Service deployment).

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| **People & Relationships (Brief 080)** | | | | |
| `people` + `interactions` tables | done | Brief 079/080 | Original | `src/db/schema.ts` |
| Fourth memory scope (`person`) | done | Brief 080, ADR-003 | Mem0 scope pattern | `src/engine/harness-handlers/memory-assembly.ts` |
| Visibility promotion (person→agent→process) | done | Brief 080 | Original | `src/engine/people.ts` |
| **Channel Adapters (Brief 081)** | | | | |
| `ChannelAdapter` interface | done | Brief 081 | Original | `src/engine/channel.ts` |
| AgentMail adapter (primary) | done | Brief 081 | agentmail npm (depend) | `src/engine/channel.ts` |
| Gmail adapter (fallback) | done | Brief 081 | Google Workspace CLI | `src/engine/channel.ts` |
| Opt-out signal detection | done | Brief 081 | Original | `src/engine/channel.ts` |
| **Persona System (Brief 082)** | | | | |
| Alex + Mira persona configs | done | Brief 082 | Original | `src/engine/persona.ts` |
| Character bible as prompt artifact | done | Brief 082 | Original | `src/engine/persona.ts` |
| **Network Process Templates (Brief 083 + session)** | | | | |
| 4 core templates (selling-outreach, connecting-research, connecting-introduction, network-nurture) | done | Brief 083 | Original | `processes/templates/` |
| 15 additional templates (shared, Alex/Mira, User Agent Gear 1+2) | done | Insight-153 | Original | `processes/templates/` |
| Self tools (create_sales_plan, create_connection_plan, network_status) | done | Brief 083 | Original | `src/engine/self-tools/network-tools.ts` |
| **Nurture Scheduling (Brief 084)** | | | | |
| Schedule wiring + template validation | done | Brief 084, Brief 076 | Schedule trigger engine | `src/engine/network-nurture.test.ts` |
| **Intake + Verification (Brief 085)** | | | | |
| `verifyOutreach()` anti-phishing | done | Brief 085 | Original | API route `/api/network/verify` |
| `startIntake()` with participant recognition | done | Brief 085 | Original | API route `/api/network/intake` |
| **Three-Layer Persona Architecture (Insight-153)** | | | | |
| Character bible rewrite (three-layer model) | done | Insight-153 | Original | `docs/ditto-character.md` |
| Front door conversational experience (Alex speaks first) | done | Insight-153, Brief 085 | formless.ai pattern | `packages/web/app/welcome/ditto-conversation.tsx` |
| **Web Acquisition Funnel (Briefs 093-095)** | | | | |
| Conversational front door chat API | done | Brief 093, ADR-026 | Formless.ai pattern | `src/engine/network-chat.ts`, `/api/v1/network/chat` |
| Conversational home page (replaces monologue) | done | Brief 094 | Formless.ai, Drift pills | `packages/web/app/welcome/ditto-conversation.tsx` |
| Anti-enumeration verify page | done | Brief 095 | Magic Link pattern | `packages/web/app/verify/page.tsx` |
| Recipient-to-user referred page | done | Brief 095 | Referral landing pattern | `packages/web/app/welcome/referred/page.tsx` |
| **Multi-Provider Purpose Routing (Brief 096)** | | | | |
| Google Gemini provider | done | Brief 096, ADR-026 | `@google/generative-ai` (depend) | `src/engine/llm.ts` |
| Purpose-based routing (conversation/writing/analysis/classification/extraction) | done | Brief 096, ADR-026, Insight-157 | RouteLLM (pattern) | `src/engine/model-routing.ts` |
| Multi-provider simultaneous loading | done | Brief 096, Insight-158 | Vercel AI SDK (pattern) | `src/engine/llm.ts` |
| **Integration Tools + Interaction Recording (Brief 097)** | | | | |
| CRM built-in tools (send_email, record_interaction, create_person) | done | Brief 097 | tool-resolver builtInTools pattern | `src/engine/tool-resolver.ts` |
| Atomic send-and-record (`sendAndRecord()`) | done | Brief 097 | Original | `src/engine/channel.ts` |
| **Pulse Engine + Chain Execution (Brief 098a)** | | | | |
| `ChainDefinition` type on `ProcessDefinition` | done | Brief 098a | Original (core primitive) | `packages/core/src/harness/harness.ts` |
| `delayed_runs` table | done | Brief 098a | BullMQ delayed job pattern (SQLite) | `src/db/schema.ts` |
| Chain executor (variable substitution, delay/schedule/event) | done | Brief 098a | Inngest event fan-out (pattern) | `src/engine/chain-executor.ts` |
| Pulse — continuous operation loop (cron, configurable interval) | done | Brief 098a | OpenClaw heartbeat (Insight-141, pattern) | `src/engine/pulse.ts` |
| Trust inheritance for chain-spawned runs | done | Brief 098a AC9 | Original | `src/engine/heartbeat.ts` |
| Heartbeat → chain processing on completion | done | Brief 098a | Original | `src/engine/heartbeat.ts` |
| 22 tests (pulse + chain executor) | done | Brief 098a | — | `src/engine/pulse.test.ts` |
| **Inbound Email + Status Composition (Brief 098b)** | | | | |
| Inbound email webhook + status composer + weekly briefing | done | Brief 098b | AgentMail webhook pattern | `src/engine/inbound-email.ts`, `src/engine/status-composer.ts`, `src/engine/notify-user.ts`, `src/engine/completion-notifier.ts` |
| **Communication Intelligence (Brief 099)** | | | | |
| 099a: Route inbound messages through Self | done | Brief 099 | Self `selfConverse()` pattern | `src/engine/self.ts`, `src/engine/self-context.ts`, `src/engine/inbound-email.ts` |
| 099b: Adaptive relationship building (relationship-pulse) | done | Brief 099 | `status-composer.ts` `createCompletion()` pattern | `src/engine/relationship-pulse.ts`, `src/engine/pulse.ts`, `cognitive/self.md` |
| 099c: Workspace graduation + channel transition | done | Brief 099 (depends on 089) | Insight-161 | `src/engine/notify-user.ts`, `src/engine/relationship-pulse.ts`, `src/engine/status-composer.ts` |
| **Referral Footer — Two-Sided Acquisition (Brief 109)** | | | | |
| Referral footer in every outgoing email | done | Brief 109, Insight-155 | Standard SaaS referral (pattern) | `src/engine/channel.ts` |
| Referral click tracking via funnel events | done | Brief 109, Insight-155 | UTM tracking (pattern) | `packages/web/app/welcome/referred/page.tsx`, `src/engine/network-chat.ts` |
| **Admin Oversight (Brief 108)** | | | | |
| `adminFeedback` table + `pausedAt` on networkUsers | done | Brief 108, Insight-160 | Intercom/Zendesk admin impersonation (pattern) | `src/db/schema.ts` |
| Admin dashboard with user health (green/yellow/red) | done | Brief 108 | Original | `src/engine/admin-oversight.ts`, `packages/web/app/admin/page.tsx` |
| Per-user detail + admin actions (pause/resume/feedback/act-as) | done | Brief 108 | Original | `packages/web/app/admin/users/[userId]/page.tsx` |
| `notifyAdmin()` + trust downgrade hook | done | Brief 108 | `notifyUser()` pattern (adopt) | `src/engine/notify-admin.ts`, `src/engine/trust.ts` |
| Pause-flag propagation in pulse pipeline | done | Brief 108 | Original | `src/engine/status-composer.ts`, `src/engine/relationship-pulse.ts` |
| Admin API routes (users list + user detail/actions) | done | Brief 108 | Existing admin auth pattern | `packages/web/app/api/v1/network/admin/users/` |
| 12 tests (pause/resume, feedback, dashboard, notify) | done | Brief 108 | — | `src/engine/admin-oversight.test.ts` |
| **Workspace Suggestion Trigger (Brief 110)** | | | | |
| `checkWorkspaceReadiness()` — 3 threshold checks | done | Brief 110, Insight-161 | SaaS upgrade prompt pattern | `src/engine/workspace-readiness.ts` |
| Status composer workspace suggestion integration | done | Brief 110, Insight-161 | Insight-161 (woven communication) | `src/engine/status-composer.ts` |
| 30-day cooldown + dismissal tracking | done | Brief 110 | `suggestion_dismissals` pattern (adopt) | `src/engine/status-composer.ts` |
| 20 tests (readiness thresholds + multi-cycle no-nag) | done | Brief 110 | — | `src/engine/workspace-readiness.test.ts`, `src/engine/status-composer.test.ts` |
| **Cognitive Mode Extensions (Brief 114)** | | | | |
| 4 mode extension files (connecting/selling/nurturing/chief-of-staff) | done | Brief 114, Insight-165 | Original | `cognitive/modes/` |
| `getCognitiveModeExtension()` + `resolveModeFromProcess()` | done | Brief 114 | Original | `packages/core/src/cognitive/index.ts`, `src/engine/cognitive-core.ts` |
| Mode-aware memory assembly | done | Brief 114 | Memory assembly pattern | `src/engine/harness-handlers/memory-assembly.ts` |
| **Operating Cycle Archetype (Briefs 115-118)** | | | | |
| 4 core harness handlers (outbound-quality-gate, broadcast-direct-classifier, identity-router, voice-calibration) | done | Brief 116, Insights 166-168 | Original | `packages/core/src/harness/handlers/` |
| Step-category trust overrides in trust gate | done | Brief 116, Insight-168 | Original | `packages/core/src/harness/handlers/trust-gate.ts` |
| Schema: cycleType, outboundActions table, voice_model memory type | done | Brief 116 | Original | `packages/core/src/db/schema.ts` |
| 3 Operating Cycle definitions (sales, connecting, nurture) | done | Brief 117, Insight-168 | Original | `processes/cycles/` |
| Sub-process invocation (cycle steps call sub-processes through harness) | done | Brief 117 | Process chaining pattern | `src/engine/heartbeat.ts`, `src/engine/process-loader.ts` |
| 25 templates reorganised as callable sub-processes | done | Brief 117 | Original | `processes/templates/` |
| 5 cycle self-tools (activate, pause, resume, briefing, status) | done | Brief 118 | Self tool pattern | `src/engine/self-tools/cycle-tools.ts` |
| Scheduler dual triggers + front door continuous framing | done | Brief 118 | Existing trigger.also type | `src/engine/scheduler.ts`, `src/engine/network-chat-prompt.ts` |
| **Front Door Content Blocks (Brief 137)** | | | | |
| Content block rendering in front door conversation | done | Brief 137, Insight-177 | `self-stream.ts` content-block pattern | `src/engine/network-chat-blocks.ts`, `chat-message.tsx` |
| Bespoke plan card replaced with ProcessProposalBlock | done | Brief 137 | BlockRenderer (existing) | `packages/web/app/welcome/chat-message.tsx` |
| **Outreach Visibility + Email Cancellation (Brief 125)** | | | | |
| Full email body stored in interaction metadata | done | Brief 125 | Interaction metadata pattern (adopt) | `src/engine/channel.ts` |
| Email-initiated cancellation (keyword detection + goal pause) | done | Brief 125 | `isOptOutSignal()` pattern (adopt) | `src/engine/inbound-email.ts` |
| Thread-context → goal resolution with ownership validation | done | Brief 125 | Interaction `processRunId` (adopt) | `src/engine/inbound-email.ts` |
| Report-back + day-7 templates include actual outreach text | done | Brief 125 | Original | `processes/templates/` |
| **Workspace Lite — Magic Link Auth (Brief 123)** | | | | |
| Magic link module (create/validate/consume, rate limiting, atomic single-use) | done | Brief 123 | Slack magic link pattern | `src/engine/magic-link.ts` |
| `/chat` page with ai-elements message rendering + status strip | done | Brief 123 | `/welcome` layout + `/review` token pattern | `packages/web/app/chat/` |
| POST `/chat/auth` with httpOnly session cookie (GET auto-submit redirect) | done | Brief 123 | Next.js cookies() API | `packages/web/app/chat/auth/route.ts` |
| Auto-generated magic link footer in all outbound emails | done | Brief 123 | `sendAndRecord` pattern (adopt) | `src/engine/channel.ts` |
| Rolling 30-day TTL for authenticated sessions | done | Brief 123 | Redis session pattern | `src/engine/network-chat.ts` |
| Session revocation on opt-out | done | Brief 123 | `isOptOutSignal` pattern (adopt) | `src/engine/inbound-email.ts` |
| **Workspace Magic-Link Auth (Brief 143)** | | | | |
| Next.js middleware — session cookie check, redirect to `/login` | done | Brief 143 | Brief 123 pattern (adopt) | `packages/web/middleware.ts` |
| Login page — email input, magic link request, "check your email" | done | Brief 143 | Brief 123 `/chat` auth UX (adopt) | `packages/web/app/login/page.tsx` |
| Login auth callback — validate token, set HMAC-signed cookie | done | Brief 143 | `/chat/auth` auto-submit pattern (adopt) | `packages/web/app/login/auth/route.ts` |
| Workspace session API (check + logout) | done | Brief 143 | Next.js cookies() API | `packages/web/app/api/v1/workspace/session/route.ts` |
| Magic link request API — owner validation, AgentMail send | done | Brief 143 | Anti-enumeration pattern (Brief 123) | `packages/web/app/api/v1/workspace/request-link/route.ts` |
| `createWorkspaceMagicLink()` — workspace-prefixed session IDs | done | Brief 143 | `createMagicLink()` (adopt) | `src/engine/magic-link.ts` |
| **Pricing Strategy (Brief 119)** | | | | |
| Pricing page with tiers, success fees, trust ladder, FAQ | done | Brief 119 | SaaS pricing patterns | `packages/web/app/pricing/page.tsx` |
| **Front Door Relationship Lifecycle (Briefs 120-121)** | | | | |
| Process primitive wiring (schedule, wait_for, gate, email_thread) | done | Brief 121 | Original | `packages/core/src/duration.ts`, `src/engine/heartbeat.ts` |
| Front door relationship lifecycle (magic links, ghost mode, cancellation) | done | Brief 120 | Original | `src/engine/magic-link.ts`, `src/engine/channel.ts`, `src/engine/inbound-email.ts` |
| **Model Purpose Resolver (Brief 128)** | | | | |
| Model purpose resolver handler (9 resolution strategies) | done | Brief 128, ADR-027 | Original | `packages/core/src/harness/handlers/model-purpose-resolver.ts` |
| **Staged Outbound Tools (Brief 129)** | | | | |
| StagedOutboundAction type + per-draft quality gating | done | Brief 129, ADR-027 | Original | `packages/core/src/harness/harness.ts`, `packages/core/src/harness/handlers/outbound-quality-gate.ts` |
| **Ghost Mode (Brief 124)** | | | | |
| Ghost cognitive mode, voice model collection, identity-aware email, rules executor | done | Brief 124, Insight-166 | Lavender.ai (pattern), Superhuman (pattern) | `cognitive/modes/ghost.md`, `src/engine/rules-executor.ts`, `src/engine/channel.ts` |
| **Journey Edge Cases (Brief 126)** | | | | |
| P0 dead ends + P1 gaps closed, trust inheritance in fireEvent enforced | done | Brief 126 | Original | `src/engine/inbound-email.ts`, `src/engine/scheduler.ts`, `src/engine/network-chat.ts` |
| **Universal Work Loop Activation (Brief 071)** | | | | |
| 6 sub-briefs complete: block emission, interactive blocks, composition intents, orchestrator auto-wiring | done | Brief 071, Insights 132-136 | Paperclip.ai (pattern), ADR-010/015/021/024 | `src/engine/self-stream.ts`, `src/engine/surface-actions.ts`, `src/engine/composition-engine.ts` |
| **Self Cognitive Orchestration (Brief 131)** | | | | |
| `orchestrate_work` tool — Self spawns thin process templates with context via `startSystemAgentRun()` | done | Brief 131, ADR-027 | ADR-016 Self (adopt), ADR-020 adapt_process (adopt) | `src/engine/self-delegation.ts` |
| `generate_chat_link` tool — email-to-chat escalation with pre-seeded sessions | done | Brief 131 | Intercom Resolution Bot (pattern) | `src/engine/self-delegation.ts`, `src/engine/magic-link.ts` |
| Cognitive mode orchestration sections (connecting, selling, chief-of-staff) | done | Brief 131, ADR-027 | Existing mode files (adopt) | `cognitive/modes/*.md` |
| **Deliberative Perspectives (Brief 136)** | | | | |
| Perspectives handler — parallel lens generation, peer review, synthesis | done | Brief 136, ADR-028 | Karpathy llm-council (pattern), Self-MoA (pattern) | `src/engine/harness-handlers/deliberative-perspectives.ts`, `src/engine/harness-handlers/lens-composer.ts`, `src/engine/harness-handlers/peer-review.ts` |
| **Browser Research Skill (Brief 134)** | | | | |
| `browse_web` self-tool — Stagehand-based READ-only web research + data extraction | done | Brief 134, research/linkedin-ghost-mode-and-browser-automation.md | Stagehand (adopt), Playwright (depend) | `src/engine/self-tools/browser-tools.ts`, `src/engine/self-delegation.ts`, `src/engine/tool-resolver.ts` |
| **Web Search + Fetch Tools** | | | | |
| `web-search` and `web-fetch` as built-in tools in tool-resolver | done | merge commit | Tavily (depend) | `src/engine/tool-resolver.ts` |
| **GTM Cycle Type + Structured Inputs (Brief 139)** | | | | |
| `gtm-pipeline` as first-class cycle type with multi-plan concurrency | done | Brief 139, Brief 138 | Existing cycle-tools pattern (adopt) | `src/engine/self-tools/cycle-tools.ts` |
| `GtmContext` structured input with `planName` disambiguation | done | Brief 139 | Original | `src/engine/self-tools/cycle-tools.ts`, `src/engine/self-delegation.ts` |
| Deliberative perspectives on GTM YAML steps (sense, assess) | done | Brief 139, Brief 136 | `deliberative-perspectives.ts` handler (adopt) | `processes/templates/gtm-pipeline.yaml`, `processes/cycles/gtm-pipeline.yaml` |
| Social delivery tools (Unipile DMs, X API, feed posts) in YAML | done | Brief 139, Brief 133 | UnipileAdapter (adopt) | `processes/templates/gtm-pipeline.yaml`, `processes/cycles/gtm-pipeline.yaml` |
| **Growth Composition Intent (Brief 140)** | | | | |
| `"growth"` composition intent + `composeGrowth()` function | done | Brief 140, ADR-024 | Existing composition pattern (adopt) | `packages/web/lib/compositions/growth.ts`, `packages/web/lib/compositions/types.ts` |
| `GrowthPlanSummary` type + lazy fetch from `/api/growth` | done | Brief 140 | Roadmap lazy-fetch pattern (adopt) | `packages/web/lib/composition-context.ts`, `packages/web/app/api/growth/route.ts` |
| Growth sidebar nav item (trending-up icon) | done | Brief 140 | Existing sidebar pattern (adopt) | `packages/web/components/layout/sidebar.tsx` |
| `getGrowthPlans()` server-side query (GTM pipeline runs) | done | Brief 140 | `getActiveRuns()` pattern (adopt) | `src/engine/process-data.ts` |
| **Structured GATE Review + Automated Content Publishing (Brief 141)** | | | | |
| Structured GTM GATE review cards (experiment markdown by track) | done | Brief 141 | Feed assembler pattern (adopt) | `src/engine/feed-assembler.ts` |
| `publishPost()` — LinkedIn via Unipile Posts API | done | Brief 141, ADR-029 | Unipile SDK `users.createPost()` (depend) | `src/engine/channel.ts` |
| `publishPost()` — X via API v2 (tweets + threads) | done | Brief 141, ADR-029 | X API v2 direct fetch (depend) | `src/engine/channel.ts` |
| `XApiClient` — OAuth 1.0a signing, thread posting, partial failure | done | Brief 141, ADR-029 | X API v2 docs (depend) | `src/engine/channel.ts` |
| `asset.generate.{type}` surface action → suggestion block | done | Brief 141 | Surface action pattern (adopt) | `src/engine/surface-actions.ts` |
| Published content with `content` field in growth API | done | Brief 141 | Growth API pattern (adopt) | `src/engine/process-data.ts` |
| **Outreach Strategy Layer (Brief 149)** | | | | |
| Outreach strategy sub-process (plan-approve-execute) | done | Brief 149, Insight-182 | connecting-research.yaml human step (pattern) | `processes/templates/outreach-strategy.yaml` |
| Volume governance (5→10→20 ladder, cycleConfig) | done | Brief 149, Insight-179 | SaaS trial-to-paid (pattern) | `src/engine/self-tools/cycle-tools.ts` |
| Dual-surface outreach table (HTML email + InteractiveTableBlock) | done | Brief 149 | Stripe/Linear digest emails (pattern) | `src/engine/outreach-table.ts` |
| htmlBlocks pipeline (notifyUser→sendAndRecord→adapter) | done | Brief 149 | Original | `src/engine/channel.ts`, `src/engine/notify-user.ts` |
| Sales cycle strategy step between ASSESS and ACT | done | Brief 149 | Operating cycle archetype (Insight-168) | `processes/cycles/sales-marketing.yaml` |
| **Outreach Deliberation Infrastructure (Brief 151)** | | | | |
| Outreach dedup safety net (per-run + per-person daily cap) | done | Brief 151, Insight-184 | `hasInteractionSince` pattern (adopt) | `src/engine/channel.ts`, `src/engine/people.ts` |
| Cycle auto-restart context injection (recentOutreach) | done | Brief 151 | Original | `src/engine/heartbeat.ts` |
| `dispatchStagedAction` wiring (staged→send pipeline) | done | Brief 151 | `@ditto/core` outbound-quality-gate (adopt) | `src/engine/heartbeat.ts` |
| Status email per-person aggregation | done | Brief 151 | `outreach-table.ts` grouping (pattern) | `src/engine/status-composer.ts` |
| Relationship pulse time gate 24h→4h | done | Brief 151 | Original | `src/engine/relationship-pulse.ts` |
| `stepRunId` threading through tool-resolver | done | Brief 151, Insight-180 | Step-run guard pattern | `src/engine/tool-resolver.ts` |
| **Adaptive Workspace Views (Brief 154)** | | | | |
| `workspaceViews` table (core schema, opaque JSON blob) | done | Brief 154 | Notion database views (pattern) | `packages/core/src/db/schema.ts` |
| CompositionSchema types + validation | done | Brief 154 | Retool/Appsmith (pattern) | `packages/web/lib/compositions/composition-schema.ts` |
| Adaptive composition evaluator (schema → ContentBlock[]) | done | Brief 154 | Existing compositions (adopt) | `packages/web/lib/compositions/adaptive.ts` |
| AdaptiveCanvas + sidebar integration (both render paths) | done | Brief 154 | ComposedCanvas (adopt) | `packages/web/components/layout/adaptive-canvas.tsx` |
| Network workspace push (pushBlocks, refreshView, registerView) | done | Brief 154, Supabase Realtime (pattern) | SSE ring buffer (adopt) | `src/engine/workspace-push.ts` |
| `workspace.push_blocks` + `workspace.register_view` tools | done | Brief 154, Insight-180 | tool-resolver builtInTools (adopt) | `src/engine/tool-resolver.ts` |
| Companion view registration in generate_process | done | Brief 154 | Linear custom views (pattern) | `src/engine/self-tools/generate-process.ts` |
| **Network Service Deployment (Briefs 086-089)** | | | | |
| Brief 086: Network Service deployment (Railway — was Fly.io, needs brief update) | not started | ADR-025, Brief 086 | Railway patterns | — |
| Brief 088: Network API + Auth | not started | ADR-025, Brief 088 | Standard REST API | — |
| Brief 089: Workspace Seed + SSE Bridge | not started | ADR-025, Brief 089 | Turso/SSE patterns | — |

---

### Phase 15: Managed Workspace Infrastructure

**Re-entry condition:** Phase 14 Network Service deployment briefs (086-089) complete
**Status:** Brief 090 (Workspace Provisioning) complete. Brief 091 (Fleet Upgrades) complete. Brief 100 (Railway Migration) complete. Brief 153 (Workspace Provisioning Wiring) complete — end-to-end from email suggestion acceptance to authenticated workspace. Phase 15 **complete**. All infrastructure now targets Railway (migrated from Fly.io).

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| **Automated Workspace Provisioning (Brief 090)** | | | | |
| `managedWorkspaces` table + admin auth | done | Brief 090, ADR-025 | Temporal namespace registry | `src/db/schema.ts` |
| One-command provisioning via Railway GraphQL API | done | Brief 090, 100 | Railway API (migrated from Fly.io) | `src/engine/workspace-provisioner.ts` |
| Deep health checks (liveness + readiness) | done | Brief 090 | Kubernetes probe pattern | `packages/web/app/api/healthz/route.ts` |
| Provisioning rollback on failure | done | Brief 090 | Saga/compensating actions | `src/engine/workspace-provisioner.ts` |
| Admin CLI (provision, deprovision, fleet) | done | Brief 090 | — | `src/cli/commands/network.ts` |
| Admin API (provision, deprovision, fleet) | done | Brief 090 | — | `packages/web/app/api/v1/network/admin/` |
| Idempotent + stale recovery | done | Brief 090 | — | `src/engine/workspace-provisioner.ts` |
| Rate limiting (10 req/min per token) | done | Brief 090 | — | `src/engine/workspace-provisioner.ts` |
| 14 tests, all passing | done | Brief 090 | — | `src/engine/workspace-provisioner.test.ts` |
| **Fleet-Wide Workspace Upgrades (Brief 091)** | | | | |
| `upgradeHistory` + `upgradeWorkspaceResults` tables | done | Brief 091 | Railway upgrade history | `src/db/schema.ts` |
| Canary-first rolling upgrade | done | Brief 091 | Google SRE canary deployment | `src/engine/workspace-upgrader.ts` |
| Circuit breaker (configurable threshold) | done | Brief 091 | Nygard "Release It!" | `src/engine/workspace-upgrader.ts` |
| Per-workspace rollback on failure | done | Brief 091 | Saga/compensating actions | `src/engine/workspace-upgrader.ts` |
| Fleet rollback (reverts all including canary) | done | Brief 091 | Saga/compensating actions | `src/engine/workspace-upgrader.ts` |
| Webhook alerting with retry | done | Brief 091 | PagerDuty/OpsGenie pattern | `src/engine/workspace-alerts.ts` |
| Admin API (upgrade, rollback, upgrades, status polling) | done | Brief 091 | — | `packages/web/app/api/v1/network/admin/` |
| Admin CLI (upgrade, rollback, upgrades) | done | Brief 091 | — | `src/cli/commands/network.ts` |
| `/healthz?deep=true` version field | done | Brief 091 | — | `packages/web/app/api/healthz/route.ts` |
| Idempotent resume | done | Brief 091 | — | `src/engine/workspace-upgrader.ts` |
| 24 tests, all passing | done | Brief 091 | — | `src/engine/workspace-upgrader.test.ts` |
| **Railway Migration (Brief 100)** | | | | |
| `RailwayClient` + `RailwayServiceClient` interfaces | done | Brief 100 | Railway GraphQL API | `src/engine/workspace-provisioner.ts`, `workspace-upgrader.ts` |
| `service_id`, `railway_environment_id`, `auth_secret_hash` columns | done | Brief 100 | — | `src/db/schema.ts` |
| SQLite-safe ALTER TABLE migration + backfill | done | Brief 100 | — | `src/db/index.ts` |
| `NETWORK_AUTH_SECRET` per workspace (magic link readiness) | done | Brief 100 | — | `src/engine/workspace-provisioner.ts` |
| Two-phase health check (deploy status + deep health) | done | Brief 100 | Railway deploy lifecycle | `src/engine/workspace-provisioner.ts` |
| Zero Fly.io references (grep-verified) | done | Brief 100 | — | All provisioner/upgrader/admin/CLI files |
| All admin routes + CLI updated for Railway | done | Brief 100 | — | 7 admin routes, `src/cli/commands/network.ts` |
| **Workspace Provisioning Wiring (Brief 153)** | | | | |
| Email acceptance detection + thread matching | done | Brief 153 | Cancellation handler pattern (Brief 125) | `src/engine/inbound-email.ts` |
| `WORKSPACE_OWNER_EMAIL` env var injection | done | Brief 153 | Brief 143 middleware | `src/engine/workspace-provisioner.ts` |
| User status transition (active → workspace) | done | Brief 153 | — | `src/engine/workspace-provisioner.ts` |
| Welcome email with magic link | done | Brief 153 | Brief 123 magic link | `src/engine/workspace-welcome.ts` |
| `suggestionThreadId` + `workspaceAcceptedAt` schema | done | Brief 153 | — | `src/db/schema/network.ts` |
| 9 new tests (6 inbound, 3 provisioner) | done | Brief 153 | — | `src/engine/inbound-email.test.ts`, `workspace-provisioner.test.ts` |

---

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
| Nango (self-hosted) | Managed OAuth, 700+ API integrations, syncs + actions | **Phase 12 re-evaluation — canonical trigger in ADR-031 §Decision.** Summary: ≥3 unplanned integration requests/week sustained over one month AND NangoHQ commercial-licence conversation completed. Owner: Dev PM. Elastic License v2 blocks drop-in adoption inside the Network Service; build core OAuth for top-5 providers instead. | ADR-005, ADR-031 |
| Composio (cloud) | 1000+ integrations, brokered credentials, tool routing | **Deferred (ADR-031): cloud-only, incompatible with Track B and with Ditto owning the integration layer.** | ADR-005, ADR-031 |

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
