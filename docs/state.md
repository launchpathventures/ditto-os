# Ditto — Current State

**Last updated:** 2026-03-23
**Current phase:** Brief 025 revised (Insight-065: Ditto-native tools, not MCP passthrough). Reviewed: PASS WITH FLAGS (3 should-fix, 2 notes — all addressed). Pending human approval. Next: Builder implements 025, then 026.
**History:** See `docs/changelog.md` for completed phases, retrospectives, and resolved decisions.

---

## What's Working

- **Storage** — SQLite + Drizzle ORM + better-sqlite3. WAL mode. Auto-created at `data/ditto.db`. (ADR-001)
- **Process definitions** — 18 YAML processes in `processes/` (7 domain + 4 system + 7 standalone delegation roles). Parallel groups, depends_on, human steps, conditional routing (route_to/default_next). System processes have `system: true`. Standalone role processes (Brief 029, migrated Brief 031) are single-step `ai-agent` delegations with `config.role_contract` and `config.tools` (read-only or read-write).
- **LLM provider abstraction (Briefs 029+032+033)** — `src/engine/llm.ts`. Multi-provider registry: Anthropic, OpenAI, Ollama (via OpenAI-compatible API). Ditto-native types (`LlmToolDefinition`, `LlmContentBlock`, `LlmMessage` etc.) — no SDK types leak beyond `llm.ts`. `createCompletion()`, `extractText()`, `extractToolUse()`, `getConfiguredModel()`, `getProviderName()`. Tool format translation (Anthropic ↔ OpenAI) internal. `initLlm()` startup validation — fails clearly if `LLM_PROVIDER` or `LLM_MODEL` not set. Per-provider cost tracking ($0 for Ollama), cost calculated on actual model from API response. `LlmCompletionResponse` includes actual `model` from API. No hardcoded default model or provider. Provenance: Vercel AI SDK pattern, 12-factor app, Insight-060, Insight-062.
- **Model routing intelligence (Brief 033)** — `src/engine/model-routing.ts`. Step-level model hints (`fast`/`capable`/`default`) in process YAML `config.model_hint`. `resolveModel(hint)` maps to provider-specific models (Anthropic: Haiku/Opus, OpenAI: gpt-4o-mini/gpt-4o; Ollama falls back to default). Model recorded on every `stepRun` (both advance and pause paths). `generateModelRecommendations(db)` analyzes 20+ completed runs per (process, step, model): recommends cheaper model when quality comparable (within 5%), recommends upgrade when quality low (<80%). Current model determined from most recent 5 runs. Advisory only — no auto-switching. Process loader validates `model_hint` values. Provenance: Vercel AI SDK alias pattern, RouteLLM economics, process-level learned routing original to Ditto.
- **Claude adapter (Brief 031)** — Role contract loading from `.claude/commands/dev-*.md` via `step.config.role_contract` (fallback to hardcoded prompts). Tool subset selection: `step.config.tools` → `readOnlyTools` or `readWriteTools`. Confidence parsing from response text (`CONFIDENCE: high|medium|low`). Tool use loop (read_file/search_files/list_files/write_file, max 25 calls). Uses `createCompletion()` from `llm.ts`.
- **CLI adapter (Brief 016a)** — `src/adapters/cli.ts`. Spawns `claude -p` as subprocess. Loads role contracts from `.claude/commands/dev-*.md`. Parses CONFIDENCE from output. costCents: 0 (subscription-based). Provenance: ralph (subprocess), Paperclip (adapter pattern).
- **Script adapter** — Deterministic steps with on_failure
- **Integration infrastructure (Brief 024)** — `integrations/` directory with YAML registry files (Insight-007). Registry loader (`src/engine/integration-registry.ts`) parses, validates, caches by service name. CLI protocol handler (`src/engine/integration-handlers/cli.ts`) executes via child_process.exec with retry (3 attempts, 1s/2s/4s backoff), JSON parsing, credential scrubbing. `integration` executor type in step-executor switch. `resolveAuth(service, cliInterface, processId?)` reads env vars (Brief 026 swaps to vault). Harness logs `integration.call` activities. Schema: `integrationService`/`integrationProtocol` on stepRuns. (ADR-005)
- **Process loader** — YAML parsing, parallel_group containers, dependency validation, cycle detection, integration step validation (config.service required). Supports route_to, default_next, retry_on_failure fields (Brief 016b).
- **CLI** — citty + @clack/prompts. 12 commands: sync, start, heartbeat, status, review, approve, edit, reject, trust, capture, complete, debt. TTY-aware, --json on listings. Unified task surface.
- **Work items** — workItems table (type, status, goalAncestry, assignedProcess, spawnedFrom). Conditional flow (Insight-039).
- **Harness pipeline** — 7 handlers: memory-assembly → step-execution → metacognitive-check → review-pattern → routing → trust-gate → feedback-recorder. Metacognitive check (Brief 034b): post-execution self-review via LLM (maxTokens: 512). Auto-enabled for supervised+critical tiers, opt-in for others via `harness.metacognitive: true`. Flags issues for human review; does not re-execute. Shared `parseHarnessConfig()` in `harness-config.ts`. Review-pattern handler guards prior flags and merges reviewDetails. Routing handler (Brief 016b) evaluates route_to conditions via substring matching (Mode 1).
- **Trust gate** — 4 tiers: supervised, spot-checked (~20%), autonomous, critical. Deterministic SHA-256 sampling. Confidence override: `low` always pauses regardless of tier (ADR-011, Brief 016d).
- **Trust earning** — Sliding window (20 runs), conjunctive upgrades, disjunctive downgrades, grace period, simulation, override. (ADR-007)
- **Review patterns** — Maker-checker, adversarial, spec-testing. Retry with feedback injection.
- **Memory** — Three durable scopes: agent-scoped + process-scoped + self-scoped (ADR-003, ADR-016, Brief 029) + intra-run context (ephemeral, Brief 027). Salience sorting, token-budgeted assembly (2000 tokens durable, 1500 tokens run context), feedback-to-memory bridge.
- **Sessions (Briefs 029+030)** — `sessions` table with full lifecycle: create, append turns, resume within timeout, suspend after 30min idle (summary generated). Cross-surface resumption (ADR-016). DB-backed, not in-memory.
- **Cognitive framework (Brief 029, extended 034a)** — `cognitive/self.md`. Consultative framing protocol, communication principles (competent/direct/warm/purposeful), trade-off heuristics, metacognitive checks (5 pre-action checks + teammate consultation guidance), escalation sensitivity, dev pipeline domain context. Identity substrate for the Conversational Self.
- **Conversational Self (Briefs 030+034a)** — `src/engine/self.ts` + `self-context.ts` + `self-delegation.ts`. The outermost harness ring: persistent identity, tiered context assembly (~4K token budget), `selfConverse()` conversation loop with tool_use delegation, session lifecycle. 5 tools: `start_dev_role`, `consult_role` (Inline weight — Brief 034a), `approve_review`, `edit_review`, `reject_review`. `consult_role` loads role contract and calls `createCompletion()` directly (no harness, no process run, `maxTokens: 1024`). Self decision tracking: every delegation, consultation, and inline response recorded as activities. Self-correction memories: human redirects feed back into self-scoped memory with reinforcement. Cross-turn redirect detection (prior session turn scan + negation keyword heuristic). Delegated roles run through full harness (trust, memory, feedback). Telegram bot routes free-text through the Self.
- **Human steps** — `executor: human` suspends execution, creates action work item with input_fields, `aos complete` resumes with human input.
- **Pattern notification** — After 3+ corrections of same pattern, read-only notification surfaced. Precursor to Phase 8 "Teach this".
- **Parallel execution** — Promise.all for parallel groups, depends_on resolution
- **Heartbeat** — Routes through harness. Sequential + parallel. Human step suspend/resume. Conditional routing (route_to/default_next). Retry with feedback injection (retry_on_failure). Routing skips mark non-target siblings as "skipped".
- **Harness events** — `src/engine/events.ts`. Typed event emitter: step-start, step-complete, gate-pause, gate-advance, routing-decision, retry, step-skipped, run-complete, run-failed. Provenance: Trigger.dev event pattern.
- **Agent tools (Brief 031)** — 4 tools: read_file, search_files, list_files (read-only), write_file (read-write). Path traversal prevention, secret deny-list, symlink protection. Exported as `readOnlyTools` (3) and `readWriteTools` (4).
- **DB schema enforcement** — `pnpm cli sync` runs drizzle-kit push. Handles first-run and evolution.
- **Debt tracking** — `docs/debts/` markdown files. `pnpm cli debt` to list.
- **Dev process** — 7 roles as skills. Brief template. 37 active insights, 29 archived. 33 research reports. 12-point review checklist. Distributed knowledge maintenance (Insight-043): each role maintains docs it reads, Documenter does cross-cutting audit.
- **Dev pipeline** — `claude -p` orchestrator + Telegram bot. Full Claude workspace on mobile. (Brief 015). Engine-integrated: `processes/dev-pipeline.yaml` runs 7 roles through the real harness with conditional routing (Brief 016c). Telegram bot routes free-text through the Conversational Self (Brief 030): `selfConverse()` assembles context, converses via LLM, delegates to dev roles via tool_use. Engine bridge (Brief 027) for explicit `/start` commands: `startProcessRun()` + `fullHeartbeat()` loop, review actions. Memory, trust, feedback all active.
- **Review actions (Brief 027)** — `src/engine/review-actions.ts`. Shared approve/edit/reject logic extracted from CLI commands. Pure engine functions (no TTY, no process.exit). Step-level granularity via `findWaitingStepRun()`. Used by both CLI commands and Telegram bot.
- **System agents (Brief 014a+014b+021)** — 4 system agents running through the harness pipeline: trust-evaluator (wraps Phase 3 code, spot-checked), intake-classifier (keyword matching, supervised), router (LLM-based via `llm.ts`, supervised), orchestrator (goal-directed — decomposes goals into tasks, routes around paused items, confidence-based stopping; supervised). `category: system` + `systemRole` on agents table. System agent registry dispatches via `script` executor + `systemAgent` config (Insight-044). `startSystemAgentRun()` for programmatic triggering.
- **Goal-directed orchestrator (Brief 021+022)** — Decomposes goals into child work items using process step list as blueprint. `orchestratorHeartbeat()` iterates spawned tasks, routes around trust gate pauses to independent work. Confidence-based stopping: low confidence triggers escalation (Types 1/3/4). CLI: scope negotiation in `capture`, goal tree in `status`, escalation display. Schema: `decomposition` on workItems, `orchestratorConfidence` on processRuns.
- **Process templates (Brief 020)** — 3 non-coding templates in `templates/`: invoice-follow-up (4 steps, 1 human), content-review (3 steps, all AI), incident-response (4 steps, 2 human). All include governance declarations (trust, quality_criteria, feedback). Loaded as `status: draft` via `aos sync`. Process loader reads from both `processes/` and `templates/`.
- **Auto-classification capture (Brief 014b)** — `aos capture` auto-classifies work item type (keyword patterns) and auto-routes to best matching process (LLM). Falls back to interactive @clack/prompts on low confidence. System processes filtered from routing targets.
- **Test infrastructure (Brief 017)** — vitest + 218 tests across 15 test files covering process-loader, trust-diff, heartbeat (including orchestratorHeartbeat), feedback-recorder, trust computation, system agents (registry, classifier, orchestrator decomposition + scheduling + escalation, step dispatch), integration registry (8 tests), CLI protocol handler (6 tests), memory-assembly intra-run context (6 tests, Brief 027), agent tools (9 tests, Brief 031), standalone YAML structure (11 tests, Brief 031), LLM provider abstraction (31 tests, Brief 032), metacognitive check + harness config + flag survival (21 tests, Brief 034b), model routing + hint resolution + recommendations (20 tests, Brief 033). Real SQLite per test (no mocks). Anthropic + OpenAI SDKs mocked at module level. `pnpm test` runs in ~3.3s.
- **E2E verification (Brief 020)** — Full work evolution cycle verified: capture → classify → route → orchestrate → execute → human step → resume → review → trust update. All 6 architecture layers proven working. Report at `docs/verification/phase-5-e2e.md`.

## What Needs Rework

- ~~Architecture.md "First Implementation" section~~ — **Resolved 2026-03-23:** Added historical note, updated to reference actual dev role processes
- ~~ADR-006 naming conflict~~ — **Resolved 2026-03-23:** `006-runtime-deployment.md` renumbered to ADR-018
- ~~ADR-017 needs update post Brief 031~~ — **Resolved 2026-03-23:** Section 3 updated with post-implementation note
- ~~CLI adapter `DEFAULT_MODEL = "opus"`~~ — **Resolved 2026-03-23:** Now uses `getConfiguredModel()` from llm.ts

## Recently Completed

- **Brief 033 complete** (Model Routing Intelligence) — `src/engine/model-routing.ts`: `resolveModel(hint)` maps `fast`/`capable`/`default` to provider-specific models (Anthropic, OpenAI; Ollama falls back to default). `generateModelRecommendations(db)` analyzes accumulated step run data (20+ runs threshold) — recommends cheaper model when quality comparable (within 5%), recommends upgrade when quality low (<80%). Current model determined from most recent 5 runs. Cost calculated on actual model from API response. `model` field added to `LlmCompletionResponse`, `StepExecutionResult`, `stepRuns` table. Claude adapter uses `resolveModel(step.config?.model_hint)`. CLI adapter returns model. Heartbeat records model in both advance and pause paths. Process loader validates `model_hint` on `ai-agent` steps. 20 new tests (218 total, 15 test files). Reviewed: PASS WITH FLAGS (1 should-fix: docs deferred to Documenter; 3 notes, 2 fixed: cost on actual model, recent-5 for current model). Approved 2026-03-23.
- **Brief 034b complete** (Harness-Level Metacognitive Check) — `metacognitiveCheckHandler` in harness pipeline (after step-execution, before review-pattern). Auto-enabled for supervised+critical trust tiers. Opt-in via `harness.metacognitive: true` for spot_checked/autonomous. LLM self-check (maxTokens: 512) catches unsupported assumptions, missing edge cases, scope creep, contradictions. Issues → `context.reviewResult = 'flag'`. Shared `parseHarnessConfig()` extracted to `harness-config.ts`. Review-pattern handler updated: guards prior flag, merges reviewDetails. StepDefinition.harness type extended. 21 new tests (198 total, 14 test files). Reviewed: PASS WITH FLAGS (3 notes + 1 should-fix fixed: string output branch test added). Approved 2026-03-23. Insight-063 fully absorbed.
- **Brief 034a complete** (Self Consultation + Decision Tracking) — `consult_role` as 5th Self tool (Inline weight, ADR-017 — no harness, no process run). Loads role contract, calls `createCompletion()` with `maxTokens: 1024`. Self decision tracking: every delegation, consultation, and inline response recorded via `recordSelfDecision()` in activities table. Self-correction memories: cross-turn redirect detection (prior session scan + negation heuristic) creates self-scoped correction memories with reinforcement. Cognitive framework (`cognitive/self.md`) updated with metacognitive checks section (5 pre-action checks + consultation guidance). Delegation guidance updated. `DelegationResult` extended with `costCents`. 16 new tests (177 total, 13 test files). Reviewed: PASS WITH FLAGS (4 flags, all fixed: `as any` removed, cross-turn detection added, recording path unified, mock test added). Approved 2026-03-23.
- **Brief 032 complete** (LLM Provider Extensibility) — Multi-provider `llm.ts` rewrite: Anthropic, OpenAI, Ollama. Ditto-native LLM types replace all Anthropic SDK type leaks across 6 caller files. `initLlm()` startup validation. Tool format translation (Anthropic ↔ OpenAI). Per-provider cost tracking (fixed pre-existing 10x underreporting bug). `getConfiguredModel()` replaces `DEFAULT_AGENT_MODEL` env var in all callers. `openai` dependency added. 31 new tests (161 total, 13 test files). Reviewed: PASS WITH FLAGS (4 flags: cost bug fixed, CLI adapter default tracked as debt, brief scope wording, docs deferred to Documenter). Approved 2026-03-23.
- **Brief 031 complete** (Ditto Execution Layer) — All 7 dev roles migrated from `cli-agent` to `ai-agent` with Ditto's own tools. `write_file` tool added to `tools.ts` with same security model (path validation, secret deny-list, symlink protection). `readOnlyTools`/`readWriteTools` exports. Claude adapter: role contract loading from `.claude/commands/dev-*.md`, tool subset selection via `step.config.tools`, confidence parsing from response text. All 7 standalone YAMLs updated to version 2. 20 new tests (130 total). Reviewed: PASS WITH FLAGS (3 flags: smoke test needs live confirmation, ADR-017 Section 3 update, Ditto-native types deferred to 032). Approved 2026-03-23.
- **ADR-017 accepted** (Delegation Weight Classes) — Three execution levels: Inline (Self reasons directly), Light (`ai-agent` → Claude, ~10-30s), Heavy (`cli-agent` → Claude Code, ~5-10min). Process definitions declare capabilities, runtime resolves execution mode. Light roles: PM, Researcher, Designer, Architect. Heavy roles: Builder, Reviewer, Documenter. OpenClaw-informed user choice model. Model routing deferred to ADR-012 extension. Reviewed: PASS WITH FLAGS (4 flags, all addressed). Approved 2026-03-23.
- **Brief 030 complete** (Self Engine) — Conversational Self: `self.ts` (assembleSelfContext + selfConverse), `self-context.ts` (work state summary, self memories, session lifecycle), `self-delegation.ts` (4 delegation tools via tool_use). Telegram bot routes free-text through the Self. DB-backed sessions with cross-surface resumption. 22 new tests (110 total). Reviewed: PASS WITH FLAGS (1 significant flag fixed: cross-surface session lookup). Approved 2026-03-23.
- **Brief 029 complete** (Self Foundation) — LLM provider abstraction (`src/engine/llm.ts`), `self` memory scope, `sessions` table, `cognitive/self.md`, 7 standalone role process YAMLs. 3 existing `new Anthropic()` call sites migrated to `createCompletion()`. 88 tests pass, 0 type errors. Reviewed: PASS WITH FLAGS (Anthropic type leakage noted as acceptable for single-provider MVP; stale comment fixed). Insight-060 absorbed. Approved 2026-03-23.
- **ADR-016 accepted** (Conversational Self) — The Self is the outermost babushka ring: persistent identity, tiered context assembly, `self` memory scope, session persistence, cross-surface coherence, cognitive framework as thinking substrate. MVP on dev pipeline via Telegram. Research: 12 systems surveyed (`docs/research/persistent-conversational-identity.md`). UX spec: 4 persona encounters, communication principles, error recovery (`docs/research/conversational-self-ux.md`). Reviewed: PASS WITH FLAGS (7 flags, 3 substantive — all addressed). Approved 2026-03-23.
- **ADR-015 accepted** (Meta Process Architecture) — 4 meta processes (Goal Framing, Build, Execution, Feedback & Evolution) within the Cognitive Framework environment. Build as generative core. Brief gate as governance parameter (not universal rule). Decomposition governance via trust tiers. Security model. Section 2a extracted to Insight-057. ADR-016 cross-references added. Approved 2026-03-23.
- **Brief 027 complete** (Telegram Bot Engine Bridge) — Telegram bot routes through engine harness pipeline. Review-actions extraction (`approveRun`/`editRun`/`rejectRun`), memory-assembly intra-run context (1500-token budget), dev-bot engine heartbeat loop. 14 AC, 6 new tests (88 total). Reviewed: CONDITIONAL PASS (1 must-fix applied: step-level granularity in CLI edit path). Insight-032 archived, Debt-005 resolved. Approved 2026-03-21.
- **Brief 024 complete** (Phase 6a: Integration Foundation + CLI) — Integration registry (YAML loader + validation), CLI protocol handler (exec + retry + credential scrubbing), `integration` executor type, harness `integration.call` logging, process loader validation. ADR-005 accepted. 13 AC, 16 new tests (82 total). Reviewed: PASS WITH FLAGS (4 flags, 2 addressed inline). Approved 2026-03-21.
- **ADR-014 accepted** (Agent Cognitive Architecture) — Three-layer cognitive architecture (infrastructure + toolkit + context), orchestrator as executive function, adaptive scaffolding, cognitive quality in trust. 6-phase build plan (A1-D). Research report: 30+ sources. Approved 2026-03-21.
- **Insight-047 captured** (Outcome Owners + Process Lifecycle) — Architecture review against "outcome owner" reframe. Two gaps: process articulation tools deferred too far (Phase 11), declarative-metacognitive balance unnamed. Judgment hierarchy proposed. Reviewed: PASS WITH FLAGS.
- **Outcome owner reframe** — README rewritten, vision.md updated, personas.md updated. Users are "outcome owners" not "process owners." Reinvention problem (AI without durable process) is central. Declarative process vs intuitive metacognition named as core design tension.
- **Phase 5 complete** (Briefs 018-022) — Goal-directed orchestrator, CLI integration, E2E verification, 3 process templates. 42 AC across 3 build briefs. 11 new tests (66 total). All reviewed: PASS WITH FLAGS (all addressed). Approved 2026-03-21.
- **Phase 4c complete** (Brief 014 = 014a + 014b) — 4 system agents. Auto-classification capture pipeline. 17 AC. Approved 2026-03-21.
- **Brief 016 complete** — CLI adapter, conditional routing, dev pipeline YAML, confidence gating + events. Approved 2026-03-21.
- **Brief 017 complete** — Test infrastructure. vitest, 66 tests.
- **Phase 4b complete** (Brief 013) — Human steps, capture, unified task surface, pattern notification. 12 AC.

## What's Blocked

Nothing.

## Known Debt

Tracked in `docs/debts/`. Run `pnpm cli debt` to list. Test-utils `createTables` SQL must be kept in sync with Drizzle schema manually (Flag 1 from review).

## Decisions Made

| Decision | ADR | Status |
|----------|-----|--------|
| SQLite via Drizzle + better-sqlite3 | ADR-001 | Done |
| Research reports as durable artifacts | ADR-002 | Accepted |
| Memory architecture (three-scope, phased) | ADR-003 | Accepted (Phase 2b done; self scope done Brief 029, ADR updated; LLM reconciliation pending) |
| Harness as middleware pipeline | Phase 2a | Done |
| Trust gate (4 tiers, deterministic sampling) | Phase 2a | Done |
| Review patterns (composable layers) | Phase 2b | Done |
| Parallel execution via Promise.all | Phase 2c | Done |
| Dev Designer as 7th role | ADR-004 | Accepted |
| Trust earning algorithm | ADR-007 | Accepted |
| Integration architecture (multi-protocol) | ADR-005 | Accepted |
| Analyze as first-class mode + org data model | ADR-006 | Accepted |
| Two-track deployment | ADR-018 (was ADR-006) | Accepted |
| AGPL-3.0 license | ADR-018 (was ADR-006) | Accepted |
| Workspace interaction model | ADR-010 | Accepted |
| System agents + templates + cold-start | ADR-008 | Accepted |
| Runtime composable UI (no ViewSpec, React) | ADR-009 | Proposed |
| Attention model (3 modes, confidence, silence) | ADR-011 | Accepted |
| Context engineering, model routing, cost | ADR-012 | Accepted |
| Cognitive model (mode, feedback, escalation) | ADR-013 | Accepted |
| Agent cognitive architecture (toolkit, executive function, judgment hierarchy) | ADR-014 | Accepted |
| Meta process architecture (4 meta processes + cognitive framework environment) | ADR-015 | Accepted |
| Conversational Self (outermost harness, self memory scope, session persistence) | ADR-016 | Accepted |
| Delegation weight classes (Inline/Light/Heavy, Claude vs Claude Code, runtime resolution) | ADR-017 | Accepted |

## Active Briefs

| Brief | Phase | Status |
|-------|-------|--------|
| 023 — Phase 6 External Integrations (parent) | 6 | In progress — 024 complete. 025+026 ready. |
| 025 — Integration Tools + Agent Tool Use (Phase 6b) | 6b | Draft — revised 2026-03-23 (Insight-065: Ditto-native tools, MCP deferred). Reviewed PASS WITH FLAGS (addressed). Pending approval. |
| 026 — Credentials + Process I/O (Phase 6c) | 6c | Ready — reconciled and re-approved 2026-03-23 |

## Next Steps

1. **NOW:** Brief 025 revised. Pending human approval. Once approved, `/dev-builder` to implement.
2. **PARALLEL TRACK:** Briefs 025+026 (Phase 6b/6c) remain ready. Touch different subsystems (integration registry).
4. **Insight-064 active:** Benchmark Before Keep — metacognitive check handler must prove its value after 50 supervised runs (flag rate, catch rate, false positive rate). Decision thresholds defined.
5. **STILL NEEDED:** Architecture.md babushka diagram + Layer 2 execution model rewrite.
7. **Planned:** PM triages whether process-analyst system agent should move from Phase 11 to Phase 7-8 (Insight-047).
8. **Deferred:** Brief 016 AC17 (Telegram event subscription) — follow-up after live engine validation.
9. **Deferred:** Cognitive model fields (ADR-013) — deferred to Phase 8.
10. **Deferred:** Attention model extensions (ADR-011) — digest mode, silence-as-feature. Needs 3+ autonomous processes.
11. **Planned:** Knowledge lifecycle meta-process design (Insight-042)
12. **Insight-058/059:** Repos are process targets. Processes need context bindings.

## Documenter Retrospective (2026-03-23 — Post-Sprint Cross-Cutting Audit)

**What was produced this session:**
1. ADR-017 updated: two post-implementation notes added for model routing (Brief 033) — future references now marked as "Done."
2. Insight-061 (Delegation Weight Classes) archived — fully absorbed by ADR-017 + Brief 031.
3. Insight-062 status corrected from "active" to "archived" with absorption note (was moved to archived/ but status field left stale).
4. Insight count corrected: 37 active, 29 archived (was 39/27).
5. State.md current phase and next steps updated to reflect Documenter retro complete.

**Cross-cutting audit findings:**
- ADR-012 ✓ — post-implementation note already added by Builder
- ADR-017 — had two forward references to model routing marked "future" that were now implemented. Fixed.
- Architecture.md ✓ — Layer 2 model routing + Layer 3 metacognitive check + Layer 5 model routing feedback all added by Builder
- Dictionary.md ✓ — 3 entries added by Builder
- Landscape.md ✓ — RouteLLM updated + LiteLLM + Vercel AI SDK added by Researcher
- Research README ✓ — new report indexed
- Remaining debt: architecture.md babushka diagram + Layer 2 execution model rewrite still needed (not this session's scope — needs Architect)

**What worked:**
- **Producing roles did most of the doc work.** Builder updated state, roadmap, architecture, dictionary, ADR-012. Researcher updated landscape and research index. The Documenter's job was genuinely cross-cutting audit — catching stale insight statuses and ADR forward references, not rewriting docs.
- **The sprint velocity was exceptional.** Six briefs (029-034b) shipped in what appears to be a single day. The sequential dependency chain (029→032→033, 030→034a→034b) was well-planned.

**What surprised:**
- **Insight status fields drift when insights are archived.** Insight-062 was moved to `archived/` but its status field still said "active." Need a checklist: when archiving, always update the status field in the file before/after moving it.

**What to change:**
- **Archive checklist:** When moving insights to `archived/`, always (1) update the Status field, (2) add absorption note, (3) then `mv` the file. Two-step is error-prone.

---

## Documenter Retrospective (2026-03-23 — Brief 033 Build)

**What was produced this session:**
1. Brief 033 built: `model-routing.ts` (resolveModel + generateModelRecommendations), model field on LlmCompletionResponse/StepExecutionResult/stepRuns, Claude adapter uses resolveModel(), CLI adapter returns model, heartbeat records model in both paths, process loader validates model_hint. 20 new tests (218 total, 15 test files).
2. Architecture.md updated: Layer 2 model routing paragraph, Layer 5 model routing feedback signal.
3. ADR-012 updated: post-implementation note on Section 3 (model_hint vs model_tier, simplified to 2 hints + default).
4. Dictionary.md updated: "Model Hint" and "Model Recommendation" entries.
5. Roadmap.md updated: 3 Brief 033 items marked done.
6. Insight-062 fully absorbed: all 3 items (multi-provider, Ditto tools, model routing) complete. Archived.
7. Brief 033 moved to `docs/briefs/complete/`.

**What worked:**
- **The brief was exceptionally detailed.** Provider-specific implementation notes (which line numbers, which API field) made the build mechanical. The Architect session + research report produced a brief that could be implemented with zero guesswork.
- **Review flags improved the implementation.** Flag 2 (cost on actual model) and Flag 3 (recent-5 vs total count) were both valid improvements. The "fix the things" instruction led to a better final product than the first pass.
- **The 031→032→033 sequence was well-designed.** Each brief built cleanly on the prior: tools → provider abstraction → model routing. No backtracking or rework of earlier briefs.

**What surprised:**
- **Test data ordering matters for window functions.** The `ROW_NUMBER() OVER ... ORDER BY created_at DESC` query required test data with distinct timestamps. Default `created_at` values are all identical in fast test loops. This is a recurring pattern to watch for in tests involving recency queries.

**What to change:**
- **Nothing structural.** The brief→build→review pipeline worked well. The only process note: briefs that reference line numbers should be verified against the current code before building, as line numbers drift.

---

## Documenter Retrospective (2026-03-23 — Brief 034b Build + Insight-064)

**What was produced this session:**
1. Brief 034b built: metacognitive check handler, harness-config parser, review-pattern modifications, pipeline registration. 21 new tests (198 total, 14 test files).
2. Insight-064 captured: "Benchmark Before Keep" — pipeline handlers must justify their place with data. Decision thresholds defined for metacognitive check at 50 runs.
3. Architecture.md Layer 3 updated: metacognitive self-check added as third mechanism alongside confidence scoring and digest review.
4. Dictionary.md updated: "Metacognitive Check" entry added.
5. Review: PASS WITH FLAGS (2 should-fix: architecture.md gap + state/roadmap updates — both fixed).

**What worked:**
- **The human's challenge drove a better outcome.** Questioning "is this necessary?" before building led to Insight-064 — benchmark criteria in the brief. The handler ships, but with an explicit earn-your-place contract. This is healthier than shipping without accountability or not shipping at all.
- **Prior session pre-populated state.md and roadmap.md.** The Documenter from the 034a session anticipated 034b completion and pre-wrote the entries. This session verified and corrected (insight/test counts, architecture.md gap).
- **Implementation was already ~95% done.** Only a test type error needed fixing. The Builder's main contribution was the review loop and ensuring all 16 AC passed.

**What surprised:**
- The brief had been moved to `docs/briefs/complete/` and Insight-063 archived before 034b was actually built and approved. State docs were optimistic. Need to be careful about pre-populating state before code is reviewed and approved.

**What to change:**
- State/roadmap entries for a brief should only be written after the brief is approved by the human, not when the brief is designed by the Architect. The prior session's Documenter jumped ahead.

---

## Documenter Retrospective (2026-03-23 — Brief 034a Build + Insight-063)

**What was produced this session:**
1. Insight-063 captured and actioned: Self has no oversight — two-loop metacognitive model (internal checks + external consultation). Extended to all agents ("when it counts").
2. Cognitive framework updated (`cognitive/self.md`): 5 metacognitive pre-action checks + teammate consultation guidance.
3. Brief 034a designed (Architect), reviewed (PASS WITH FLAGS), and built (Builder): `consult_role` tool, `recordSelfDecision()`, `detectSelfRedirect()`, `recordSelfCorrection()`. 16 new tests.
4. Brief 034b designed (Architect), reviewed (PASS WITH FLAGS, all flags addressed): harness-level metacognitive check handler. Ready for builder.
5. All 4 reviewer flags on 034a fixed before approval: `as any` removed, cross-turn detection added, recording path unified, mock test added.

**What worked:**
- **The insight-to-brief-to-code pipeline ran in a single session.** PM identified the gap, the insight was captured, the cognitive framework was updated immediately (zero-code value delivery), then the Architect wrote briefs, the Builder implemented, and the Documenter closed the loop. The full dev pipeline exercised end-to-end.
- **The creator's framing drove the design.** "Two loops — internal self-awareness and external teammate feedback" and "every agent should operate in this mode when it counts" directly shaped the architecture: Brief 034a for the Self, Brief 034b for all agents via the harness.
- **Existing patterns composed well.** `consult_role` reused role contract loading from `claude.ts`, activity logging from `feedback-recorder.ts`, memory creation from `createMemoryFromFeedback()`. No new abstractions needed.
- **Reviewer flag discipline worked.** The creator asked "have the flags been fixed?" and the answer was honestly "no." Fixing them before approval caught real issues: the `as any` casts were unnecessary, cross-turn detection was a genuine gap, and the mock test proved the consultation path works.

**What surprised:**
- **test-utils.ts `DEFAULT 1` for `reinforcement_count`** diverges from the schema's `DEFAULT 0`. This caused the correction memory reinforcement test to fail unexpectedly. The test-utils SQL must be kept in sync with Drizzle schema — this is known debt but bit us here.
- **The `detectSelfRedirect` keyword ordering matters.** `ROLE_KEYWORDS.find()` returns the first match, so a message containing both "research" and "triage" returns whichever comes first in the array. Test had to be adjusted. The heuristic is lightweight and will need refinement once live data shows real patterns.

**What to change:**
- **Report flags with explicit FIXED/NOT FIXED status.** The creator had to ask whether flags were addressed. Future handoffs should always include a table showing each flag's resolution status.
- **test-utils.ts defaults should match schema.** The `reinforcement_count DEFAULT 1` divergence is a ticking bomb. Should be reconciled (existing debt item).

---

## Documenter Retrospective (2026-03-23 — Brief 032 Build)

**What was produced this session:**
1. Brief 032 implemented: `llm.ts` full rewrite with provider registry (Anthropic, OpenAI, Ollama), Ditto-native LLM types replacing all Anthropic SDK type leaks, `initLlm()` startup validation, tool format translation, per-provider cost tracking.
2. Caller updates: 6 files migrated from Anthropic SDK types to Ditto-native types (`claude.ts`, `self.ts`, `self-delegation.ts`, `tools.ts`, `review-pattern.ts`, `router.ts`). `DEFAULT_AGENT_MODEL` env var eliminated — all callers use `getConfiguredModel()`.
3. Startup integration: `initLlm()` added to `dev-bot.ts` (mandatory) and `cli.ts` (conditional).
4. 31 new tests (161 total, 13 test files). OpenAI SDK mock added to `test-setup.ts`.
5. `.env.example` updated with all 3 provider configurations.
6. Pre-existing cost calculation bug fixed (divisor 100,000 → 10,000, was 10x underreporting).
7. Reviewed: PASS WITH FLAGS (4 flags, 1 fixed inline).

**What worked:**
- **The brief was precise.** Provider registry design, tool format examples, env var names, cost tracking formula — all specified. The Builder had zero design decisions to make. This is the brief template continuing to prove its value.
- **The existing abstraction was well-placed.** Brief 029 created `llm.ts` with the right interface (`LlmCompletionRequest`/`LlmCompletionResponse`). The rewrite was surgical: same interface, new implementation. Callers only changed their type imports, not their logic.
- **The OpenAI SDK's type system was the only surprise.** SDK v6 uses union types (`ChatCompletionTool = ChatCompletionFunctionTool | ChatCompletionCustomTool`) that required explicit narrowing. Resolved quickly.
- **The reviewer caught a real pre-existing bug.** The cost calculation divisor was wrong since Brief 029. This validates the maker-checker pattern — the Builder carried forward the same bug from the original code, and the fresh-context Reviewer caught it.

**What surprised us:**
- **The cost calculation bug.** It was in the original code, the new code carried it forward, and the tests were written to match the buggy formula. Only the Reviewer's independent math caught it. This is a strong argument for the separate-agent review pattern.
- **Ollama was trivial.** The `OllamaProvider extends OpenAIProvider` pattern worked perfectly — 5 lines of code. Ollama's OpenAI-compatible API means one implementation covers both.

**What to change:**
- **Brief constraint wording matters.** The brief said "MUST NOT require changes to the Self, delegation, or harness code — only `llm.ts` changes." But removing Anthropic SDK type leaks inherently required touching callers. Future briefs should say "callers don't change their behavioral logic" rather than "only X file changes."
- **Cost formulas should have a verification test with known expected values.** The existing pattern of "calculate and assert" hides bugs if the assertion is derived from the same formula. Better: assert specific known costs from provider pricing pages.

---

## Documenter Retrospective (2026-03-23 — Brief 031 Build)

**What was produced this session:**
1. Brief 031 implemented: `write_file` tool in `tools.ts`, tool subset exports (`readOnlyTools`/`readWriteTools`), Claude adapter role contract loading + tool subset selection + confidence parsing, all 7 standalone YAMLs migrated to `ai-agent` v2.
2. 20 new tests (130 total, 12 test files): 9 tools tests (write_file security, subsets, backward compat), 11 YAML structure tests.
3. Reviewed: PASS WITH FLAGS (3 non-blocking).

**What worked:**
- **The brief was exceptionally buildable.** Every file, every change, every test was specified. The Builder had zero ambiguity — no design decisions needed during implementation. This is the brief template working as intended.
- **The existing infrastructure absorbed the changes gracefully.** `validatePath()` and `isSecretFile()` applied to `write_file` without modification. The `claudeAdapter.execute()` tool_use loop handled write tools with zero changes to the loop itself — just a different tools array passed in. The step-executor routing was untouched. This validates the adapter pattern from Phase 2.
- **The YAML migration was mechanical.** All 7 YAMLs follow the same pattern change: swap executor, remove repository input, add config block. This is what good architecture feels like — the risky decision (ADR-017) was made once, and the implementation was a template application.
- **Test-first verification.** 20 new tests written alongside the code, all passing before review. The YAML structure tests are particularly valuable — they verify the migration was consistent across all 7 roles without needing to run each role.

**What surprised us:**
- **Nothing.** This is the first build session where nothing surprised the Builder. The brief anticipated every detail. The reviewer found no blocking issues. This is a sign that the design phase (Briefs 031/032/033 designed in the previous session) was thorough.
- **The confidence parsing was simpler than expected.** A single regex and a default value. The existing CLI adapter already had this pattern, so it was a direct port.

**What to change:**
- **Smoke test should be automated.** AC15 (Telegram PM delegation <60s) can't be verified in CI. Consider a lightweight integration test that runs `selfConverse()` → delegation → `claudeAdapter.execute()` with a mock LLM, verifying the full path without Telegram. This would catch regressions without needing a live bot.
- **The "Execution Layer Redesign" retro below covers the design session.** Having two retros for one logical piece of work (design + build) is natural but verbose. The PM should consider whether the design-only retro pattern (retro after architect, then another after builder) is adding value or just adding words.

---

## Documenter Retrospective (2026-03-23 — Execution Layer Redesign)

**What was produced this session:**
1. PM triage: identified ADR-017 implementation as highest-priority next work (latency is the #1 UX bottleneck).
2. Architect session: the human challenged the Light/Heavy role split through a chain of questions that escalated from "why only 4 roles?" → "don't all roles need file access?" → "how does this work in the cloud?" → "users must choose their own models." Each question revealed a deeper architectural assumption to fix.
3. Insight-062 captured (Ditto Owns Its Execution Layer) — the foundational insight that `cli-agent` (Claude Code) is dogfood debt, not architecture. Ditto must own its tools and be LLM-provider-agnostic.
4. Brief 031 designed (Ditto Execution Layer) — write_file tool, all 7 roles via `ai-agent`, role contract loading. 15 AC.
5. Brief 032 designed (LLM Provider Extensibility) — multi-provider `llm.ts` for Anthropic/OpenAI/Ollama, no hardcoded default. 14 AC.
6. Brief 033 designed (Model Routing Intelligence) — step-level model hints, model tracking in trust data, Self recommends optimal routing. 10 AC.
7. All three briefs reviewed (CONDITIONAL PASS — 2 blocking, 7 significant flags). Approved by human.
8. Two feedback memories saved: no vendor lock-in, Ditto owns execution layer.
9. Roadmap updated with execution layer capabilities.

**What worked:**
- **The human's questioning chain was the session's most valuable contribution.** The architect started with a narrow brief (4 roles go light), and the human's escalating questions — each building on the previous — drove the design from a tactical fix to a foundational architectural shift. The PM triage was correct (latency is the problem) but the solution needed to go much deeper than the PM identified.
- **The "composition over invention" principle held under pressure.** At each escalation point, the answer was "we already have this infrastructure" — `ai-agent` executor exists, `createCompletion()` exists, `tools.ts` exists, OpenAI-compatible APIs exist. The work is connecting and extending, not inventing.
- **The brief chain (031→032→033) has clean dependency seams.** Each brief is independently shippable. 031 works with current Anthropic-only LLM. 032 adds providers without touching tools. 033 adds routing without touching providers. A builder can ship 031 and the system improves immediately.

**What surprised us:**
- **The deepest insight came from a deployment question, not a code question.** "How will this work in the cloud?" revealed that `cli-agent` is fundamentally local-only — it can't exist in a managed cloud deployment. This is not a code quality issue; it's an architectural constraint that was invisible when we only thought about local development.
- **Insight-041 was absorbed but not acted on.** "Users Bring Their Own AI" was captured and marked absorbed back in Brief 016a, but `llm.ts` still hardcodes `claude-sonnet-4-6` as the default. An absorbed insight that hasn't changed the code is not actually absorbed. The Documenter should check for this pattern: insights marked "absorbed" whose implications haven't materialized.
- **The brief that started as "make 4 roles faster" became "Ditto owns its execution layer."** The scope expanded 3x (from 1 brief to 3) but the clarity improved enormously. Each brief is more focused than the original single brief because the architectural thinking is sharper.

**What to change:**
- **Challenge architectural assumptions earlier.** The PM recommended a narrow "implement ADR-017" brief. The Architect designed exactly that. It took the human's questions to reveal the deeper issue. The PM/Architect skills should include "challenge the framing" as a step — ask "does this design work in all deployment contexts?" before finalizing.
- **Insight absorption audit should be more rigorous.** Insight-041 was "absorbed" but the code didn't change. The Documenter should verify: does "absorbed" mean the code reflects the insight, or just that the insight was acknowledged in a doc? These are different things.
- **The `cli-agent` shortcut should have been flagged as debt earlier.** The retrospective from Brief 029 noted "Anthropic type leakage" as acceptable for single-provider MVP. That was a signal that vendor coupling was accumulating. Debt items should be checked against the roadmap to see if they'll block upcoming phases.

---

## Documenter Retrospective (2026-03-23 — ADR-017 Delegation Weight Classes)

**What was produced this session:**
1. Insight-061 captured (Delegation Weight Classes) — triggered by live testing of the Self on Telegram. PM delegation took 5+ minutes, bot blocked.
2. ADR-017 designed and reviewed (PASS WITH FLAGS, 4 flags addressed). Three execution levels (Inline/Light/Heavy), Claude vs Claude Code distinction, runtime mode resolution, OpenClaw user choice pattern.
3. Three post-build fixes to `dev-bot.ts` during live testing: (a) removed blocking auto-PM, (b) replaced emoji with native typing indicator + Markdown parse_mode, (c) added intermediate text callbacks + non-blocking message handler.

**What worked:**
- **Live testing drove the architecture.** The ADR came from actually using the product, not from theoretical analysis. The 5-minute PM delegation latency was immediately obvious in conversation. The bot blocking on long-running delegations was only visible when the user tried to send a follow-up. This validates the "use the product to build the product" strategy.
- **The infrastructure already existed.** The `ai-agent` executor already calls `createCompletion()` directly, already conditionally excludes codebase tools, already goes through the full harness. The ADR's core contribution is recognizing this and using it — not inventing something new. Composition over invention.
- **The human brought critical clarity.** Three specific interventions shaped the ADR: (1) "Claude vs Claude Code — you're getting confused" forced the technical distinction that anchors the design, (2) "OpenClaw lets users choose" introduced the runtime resolution pattern, (3) "What if we wanted Codex?" surfaced the model routing orthogonality. Each intervention sharpened the architecture.

**What surprised us:**
- **The biggest UX problem wasn't the Self's intelligence — it was latency.** The Self's consultative framing, delegation decisions, and work state awareness all worked well. The experience was ruined by the 5-minute wait. Architecture matters less than responsiveness for the first impression.
- **grammY's sequential message processing was a hidden blocker.** The bot framework processes one message at a time by default. A long-running delegation blocked ALL incoming messages — the user couldn't even ask for status. The fix (fire-and-forget pattern) was simple but non-obvious.
- **The distinction between Claude and Claude Code is not widely understood.** Even within this project, the terms were being used interchangeably. Making this distinction explicit in the ADR is one of its most valuable contributions.

**What to change:**
- **Live testing should happen earlier.** The PM triage via `cli-agent` latency issue would have been caught immediately if the Self had been tested conversationally during Brief 030's build. The smoke test in the brief describes this scenario but it was deferred. Build → live test → fix should be one cycle, not sequential phases.
- **Architecture.md needs the execution mode resolution concept.** Layer 2 currently describes executor types as static declarations. ADR-017 introduces runtime resolution. This is an architecture.md update, not just an ADR.
- **The `ai-agent` executor's hardcoded role prompts need alignment with the `.claude/commands/dev-*.md` role contracts.** Two different prompt sources for the same roles is a maintenance risk. The implementation brief should resolve this.

---

## Documenter Retrospective (2026-03-23 — Conversational Self MVP Session)

**What was produced this session:**
1. PM triage: confirmed Brief 030 as next work. All dependencies met, no blockers, no research or design gaps.
2. Builder: Brief 030 implemented. 3 new engine files (`self.ts`, `self-context.ts`, `self-delegation.ts`), `dev-bot.ts` modified, 22 new tests (110 total). Type-check and tests pass.
3. Reviewer (separate agent): PASS WITH FLAGS. 1 significant flag (cross-surface session lookup filtered by surface, contradicting ADR-016). Fixed same cycle.
4. Live verification on Telegram: Self responds conversationally, uses work state from context, delegates only when appropriate.
5. Two post-review fixes during live testing: (a) removed blocking auto-PM on startup that delegated to PM subprocess, (b) replaced ⏳ emoji with native Telegram typing indicator + added Markdown parse_mode for message formatting.

**What worked:**
- **The brief was well-specified enough for a clean build.** All 11 acceptance criteria were verifiable. The file-level work product table in the brief meant no guessing about what to create. The brief's provenance table traced every pattern. Result: zero ambiguity pauses during implementation.
- **The reviewer caught a real spec deviation.** Cross-surface session lookup was filtering by surface, contradicting ADR-016's explicit cross-surface continuity design. One-line fix, but it would have been a subtle bug in production — sessions started on Telegram wouldn't resume on CLI. The maker-checker pattern continues to deliver.
- **Live testing surfaced issues that unit tests cannot.** The auto-PM delegation and the missing typing indicator were UX issues that only became visible when the human actually used the bot. The fix cycle was fast (identify → fix → restart → verify) because the code was already clean.
- **The Self's delegation guidance prompt was the right abstraction level.** Rather than hard-coding "don't delegate for greetings," the guidance tells the LLM when delegation is appropriate vs not. This scales — new conversation types don't need new rules.

**What surprised us:**
- **The auto-PM on startup was a blocking trap.** `sendSelfResponse()` called `selfConverse()` which let the LLM decide to delegate, which spawned `claude -p` — a minutes-long subprocess. This blocked the entire bot from responding to user messages. The fix was simple (remove auto-PM), but the failure mode was non-obvious: the Self's autonomy about when to delegate meant it could choose to delegate at startup, which the original code assumed would be fast.
- **Stale sessions from previous bot runs caused confusion.** DB-backed sessions persisted across bot restarts. The Self resumed old sessions with old context, influencing the LLM's delegation decisions. Required a manual `UPDATE sessions SET status = 'closed'` to clear. This is a deployment concern — the bot should probably close active sessions on startup.
- **Telegram Markdown rendering requires explicit `parse_mode`.** grammY doesn't default to Markdown — bold text shows as raw asterisks without `parse_mode: "Markdown"`. The fallback to plain text on parse failure is important because LLM output can contain characters that break Telegram's Markdown parser.

**What to change:**
- **The bot should close stale sessions on startup.** When the bot process restarts, any "active" sessions from the previous run should be suspended. This prevents the Self from resuming stale context. A simple `UPDATE sessions SET status = 'suspended'` on startup would handle this.
- **Delegation latency is the primary UX bottleneck.** When the Self does delegate (correctly), `fullHeartbeat()` for a `cli-agent` step spawns `claude -p` which takes minutes. The typing indicator disappears after ~5 seconds. Consider: (a) periodic re-sending of typing indicator during delegation, (b) a "Working on this..." message before delegation starts, or (c) async delegation with progress notifications.
- **The cognitive framework + delegation guidance should be consolidated.** Currently, delegation guidance is in the system prompt assembly (`self.ts`) and the cognitive framework is in `cognitive/self.md`. The delegation guidance is essentially part of the cognitive framework — it tells the Self how to behave. Consider moving it into `cognitive/self.md` in a future iteration.

---

## Documenter Retrospective (2026-03-21 — Brief 027 Engine Bridge Session)

**What was produced this session:**
1. Strategic PM conversation: human identified "use the product to build the product via Telegram" as the right next move. PM validated the nesting-problem workaround (Telegram = Node.js, no nesting) and recommended Architect.
2. Architect: Brief 027 (Telegram Bot Engine Bridge) designed. 14 AC, one integration seam. Reviewed: PASS WITH FLAGS (4 flags addressed — intra-run context budget, step-level granularity, security, architecture.md update).
3. Builder: 6 files changed. `review-actions.ts` (new), `approve.ts` + `reject.ts` (refactored), `memory-assembly.ts` (intra-run context), `memory-assembly.test.ts` (new, 6 tests), `dev-bot.ts` (rewritten for engine heartbeat loop). Reviewed: CONDITIONAL PASS (1 must-fix applied: step-level granularity in CLI edit path).
4. 88 tests pass (6 new). Type-check passes with 0 errors.
5. Insight-032 archived (dev process is first workspace dogfood — completed by this brief).
6. Debt-005 resolved (dev memory not dogfooding — the dev pipeline now runs through engine memory).

**What worked:**
- **The human's strategic insight drove the session.** "The outcome of the next move must be to actually use the Ditto CLI via Telegram to continue the build." This was not a technical observation — it was a product-level insight that the dev process was not using the product. The PM validated it technically (nesting workaround) and routed to the Architect. The dev process supported strategic thinking before blind execution.
- **The nesting-problem workaround was hiding in plain sight.** `claude -p` can't nest inside Claude Code, but the Telegram bot runs as a standalone Node.js process — no nesting. This constraint was documented in Phase 5's retrospective as a blocker, but nobody had connected "Telegram = Node.js = no nesting problem" until this session. The PM conversation surfaced it.
- **Extraction before integration.** Creating `review-actions.ts` as shared functions before modifying the bot meant the review logic was tested and proven before the integration. The reviewer caught that the CLI's `--edit` path still used run-wide updates — a pre-existing bug that the extraction made visible.
- **Intra-run context fills a real gap.** The standalone orchestrator's `buildContextPreamble()` passed prior role outputs to subsequent roles. Without this, engine-routed steps would execute blind to what prior steps produced. The separate token budget (1500 tokens) prevents run context from starving durable memories.
- **The reviewer caught a real bug.** The CLI `approve.ts` `--edit` path updated ALL step runs for a process run, not just the waiting one. This pre-existed Brief 027 but was made visible by the extraction. The fix (using `findWaitingStepRun()`) improves correctness for the CLI too, not just the bot.

**What surprised us:**
- **The session spanned PM → Architect → Builder → Reviewer → Documenter in one flow.** Five role transitions driven by a single strategic insight. The dev process handled this naturally — the human's "just do it" instruction skipped unnecessary research/design phases because the components already existed.
- **Two parallel systems had been running without anyone connecting them.** The engine (heartbeat, harness, trust, memory) and the standalone orchestrator (dev-pipeline.ts, dev-session.ts) were functionally equivalent but completely disconnected. Brief 027 bridges them with minimal code — the engine already did everything the standalone orchestrator did, plus memory/trust/feedback.
- **Debt-005 was resolved as a side effect.** Nobody explicitly planned to resolve the "dev memory not dogfooding" debt. It was resolved because the bridge routes through the engine's memory system. The debt's re-entry condition ("Phase 4 complete") was met long ago but nobody triggered the resolution until the strategic conversation surfaced it.

**What to change:**
- **Architecture.md Layer 2 needs updating.** The reviewer flagged that intra-run context is a new memory scope not documented in architecture.md. The brief's "After Completion" item 6 specifies this. This should be done in the next session.
- **The smoke test was not executed.** The brief includes a 6-step smoke test (start bot, /start, approve, check engine state, check memories). This requires a live Telegram bot token and a real `claude` binary — it should be done when the human first runs `pnpm dev-bot`.
- **The standalone orchestrator (`dev-pipeline.ts`) should be deprecated.** It still works for terminal use, but with the engine bridge in place, there are now two ways to run the dev pipeline. The terminal mode should eventually route through the engine too (same pattern as the bot).

---

## Documenter Retrospective (2026-03-21 — Phase 6a Build Session)

**What was produced this session:**
1. Brief 024 implemented: integration registry loader, CLI protocol handler, `integration` executor type, harness `integration.call` activity logging, process loader validation for integration steps, schema additions (`integrationService`/`integrationProtocol` on stepRuns).
2. 16 new tests (8 registry, 6 CLI handler, 2 resolveAuth) — 82 total. All pass.
3. ADR-005 accepted (proposed → accepted).
4. Review: PASS WITH FLAGS (4 flags — 2 addressed inline: `resolveAuth` signature + ADR-005 status; 2 acknowledged: smoke test + unpopulated schema fields).

**What worked:**
- **The existing patterns made this fast.** The integration registry is a near-copy of the process-loader pattern. The CLI handler extends the script adapter's exec approach. The step-executor switch was a one-case addition. The infrastructure layers are composable — Brief 024 added a new executor type with minimal cross-cutting changes.
- **The reviewer caught real interface issues.** The `resolveAuth(service, cliInterface)` signature didn't match the brief's `resolveAuth(service, processId)`. Adding `processId` now (even unused) means Brief 026's vault can scope credentials per-process without changing call sites. Good forward-compatibility fix caught by maker-checker.
- **Test infrastructure paid off.** The injectable `execAsync.fn` wrapper was needed because Node's `exec` has a custom promisify symbol that vitest module mocks can't intercept. Having real-DB test patterns already in place meant the registry tests were straightforward.

**What surprised us:**
- **Mocking `child_process.exec` is harder than expected.** Three attempts before finding a working pattern. Node's `promisify` uses a custom symbol on `exec` that bypasses standard mock interception. The injectable wrapper (`execAsync.fn`) was the clean solution — this pattern should be noted for Brief 025/026 if they also need exec mocking.
- **The `integrationService`/`integrationProtocol` schema fields are defined but not yet populated.** The step-execution harness handler doesn't write them after execution. This is a gap — the schema declares columns that are always null. Flagged by reviewer; TODO comment added. Worth resolving in Brief 025 when the step-execution handler is already being touched for tool use.

**What to change:**
- **Smoke tests should be run when the tool is available.** The reviewer correctly flagged that no real `gh` CLI invocation was tested. For Brief 025 (MCP), a similar problem exists — testing against real MCP servers. Consider creating a minimal test integration (e.g., `echo` wrapper) that can be smoke-tested in CI without external dependencies.
- **Schema fields should only be added when the code that populates them is in the same brief.** The `integrationService`/`integrationProtocol` fields were specified in the brief but the population code wasn't — leaving dead columns. Future briefs should either include the full pipeline or defer the schema addition.

---

## Documenter Retrospective (2026-03-21 — ADR-014 + Phase 6 Design Session)

**What was produced this session:**
1. Insight-046 evolved through three rounds of strategic conversation into a full design principle (7 layers of agent effectiveness, executive function as governing layer, intuition as design requirement).
2. Research report: `docs/research/cognitive-prompting-architectures.md` — 30+ sources across prompting science, cognitive architectures, metacognition, executive function in AI. Key finding: "provide tools, don't prescribe."
3. ADR-014 (Agent Cognitive Architecture) — three-layer design (infrastructure + toolkit + context), executive function as orchestrator evolution, adaptive scaffolding, cognitive quality in trust, judgment hierarchy. Reviewed: PASS WITH FLAGS (5 flags, all addressed). Accepted.
4. Architecture.md updated — new cross-cutting section for Agent Cognitive Architecture, "Processes declare structure, agents bring judgment" principle added to Core Thesis.
5. PM triage: two parallel tracks identified (Phase 6 sub-phasing + ADR-014 A1).
6. Phase 6 parent brief (023) + 3 sub-briefs (024, 025, 026) designed. ADR-005 follow-up decisions resolved. Reviewed: PASS WITH FLAGS (2 flags, both addressed). All approved.
7. Health audit: 66 tests pass, types clean, no TODO/FIXME in source, 5 debts tracked (all deferred, Debt-005 re-entry approaching). Insight/research counts corrected.

**What worked:**
- **The strategic conversation produced the session's most valuable artifact.** Insight-046 started as "agents need mental models" and evolved through three rounds to "executive function + intuition govern all cognitive resources." Each round deepened the concept: (1) reflection + mental models, (2) mindset/state/cognitive skills (Farnam Street, Robbins, Brown), (3) executive function + the prescriptive-vs-intuitive tension. The final design principle — "provide tools, don't prescribe" — came from the research confirming the human's intuition.
- **Research validated before design.** The human asked "is there evidence?" before committing to the architecture. The research (MeMo, MAP, Prompting Inversion, Reflexion) provided both validation and key constraints (adaptive scaffolding from Prompting Inversion, modular decomposition from MAP). The ADR is grounded in 30+ sources, not just conversation.
- **Phase 6 sub-phasing was efficient.** The Architect split 16 capabilities into 3 briefs (13+14+13 AC) along clear dependency seams. All ADR-005 follow-up decisions resolved in the parent brief. The reviewer found real issues (webhook deferral inconsistency, auth abstraction migration path) that improved the design.
- **Two major design outputs in one session** (ADR-014 + Phase 6 briefs). Different in character — ADR-014 was strategic/philosophical, Phase 6 was tactical/concrete — but both flowed naturally from the PM's triage identifying them as parallel tracks.

**What surprised us:**
- **The "outcome owner" reframe happened mid-session.** The human updated README, vision, and personas between messages. This reframe (users as outcome owners, not process owners) influenced both ADR-014 (judgment hierarchy) and the Phase 6 approach (process articulation tools discussion). Organic evolution of project identity during a design session.
- **Insight-047 appeared without being explicitly designed.** The human captured it directly while the Architect was working on ADR-014. It identified two architecture gaps (process articulation tools deferred too far, declarative-metacognitive balance unnamed) that the Architect then incorporated. User-as-designer pattern working.
- **The health audit found no retrospective rework needed for cognitive architecture.** ADR-014 is entirely additive — no existing code needs changing. This validates the six-layer architecture's extensibility: a major new cross-cutting concern slots in without touching existing code.

**What to change:**
- **Strategic sessions should explicitly separate "conversation" from "design."** This session had ~4 rounds of strategic conversation, then research, then ADR, then Phase 6 briefs. The conversation rounds are high-value but don't produce trackable artifacts until the research/ADR phase. A future session could capture the conversation insights as a lightweight "design notes" artifact before the formal ADR.
- **The Architect role was invoked once but did two distinct jobs** (ADR-014 + Phase 6 sub-phasing). These are genuinely different design tasks. The second invocation was handled via the PM coordinating a re-entry to the Architect, which worked but meant a very long Architect context. Future sessions: separate Architect invocations for separate design tasks.
- **Debt-005 (dev memory not dogfooding) re-entry condition is now met** (Phase 5 complete). PM should triage whether to address it before or alongside Phase 6 build.

---

## Documenter Retrospective (2026-03-21 — Cognitive Architecture Deep-Dive Session)

**What was produced this session:**
1. Insight-046 significantly expanded through three rounds of strategic conversation: (1) reflection & mental models, (2) mindset/state/cognitive skills, (3) executive function & intuition as the governing layer.
2. Seven layers of agent effectiveness defined (up from six): Skills → Mental Models → Thinking Style → State → Metacognition → Relational Intelligence → Executive Function.
3. Executive function mapped to agent equivalents: working memory, cognitive flexibility, inhibitory control, planning, monitoring, initiation.
4. Design principle articulated: "Ditto provides cognitive tools and creates conditions for quality thinking. It does NOT prescribe which tool to use."
5. Incremental implementation plan: Phase 1 (toolkit + tracking, human as executive function) → Phase 2 (learning correlation, orchestrator begins) → Phase 3 (full cognitive management, orchestrator as executive function).
6. Consulting market parallel refined: ~$500B+ market, Ditto captures methodology + execution (process-as-primitive) + problem framing + adaptation + intuitive sensing (cognitive architecture).

**What worked:**
- **Iterative deepening produced genuine insight.** Three rounds of conversation, each building on the last, moved from "agents need mental models" (obvious) to "executive function is the governing layer" (non-obvious). The third round — adding executive function and intuition — fundamentally changed the design direction from "cognitive toolkit" to "cognitive architecture with judgment."
- **The consulting market parallel sharpened the value proposition.** Connecting executive function to the 40% problem-framing / 20% adaptation split in consulting made the abstract concrete. It clarifies what Ditto does that raw AI doesn't.
- **The "firm, not playbook" metaphor is a strong design test.** Every feature decision can be tested against: "Does this make Ditto more like a firm (judgment, adaptation) or more like a playbook (prescription, rigidity)?"

**What surprised us:**
- **Intuition emerged as a design requirement.** The original insight was about structured cognitive tools. The conversation surfaced that too much structure kills the very intelligence we're trying to enable. "Space for intuition" is now a first-class design principle — genuinely unexpected.
- **The orchestrator evolution table was clarifying.** Mapping current orchestrator capabilities (decompose, route, track, stop) against cognitive equivalents (evaluate decomposition, sense approach failure, track convergence, reflect on why) revealed how far the orchestrator needs to evolve. It's currently a task tracker, not an executive function.

**What to change:**
- **Strategic insight sessions produce high-value artifacts but no code.** The dev process accommodates this (Researcher/Designer/Architect can run standalone), but the Documenter retrospective format assumes build artifacts. Should distinguish "design evolution" sessions from "build" sessions.
- **Insight-046 is now quite large.** At 129 lines, it's approaching the size of a design document. When research completes and ADR-014 is written, the insight should be significantly trimmed — it will have served its purpose as a staging area.

---

## Documenter Retrospective (2026-03-21 — Phase 5 Session)

**What was produced this session:**
1. PM triage: identified Phase 5 as next work. Surfaced Insight-045 (orchestrator stopping condition = confidence, not gate pauses).
2. Research report: `docs/research/goal-directed-orchestrator-patterns.md` — 12 frameworks across 3 areas (decomposition, scheduling, stopping). Reviewed: PASS WITH FLAGS (F3+F5 addressed).
3. UX interaction spec: `docs/research/phase-5-orchestrator-ux.md` — 5 interaction patterns (goal setting, decomposition visibility, progress/routing, stopping conditions, templates). Reviewed: PASS WITH FLAGS (F4+F5 addressed).
4. Architect: Phase 5 parent brief (018) + orchestrator parent (019) + 3 build briefs (020, 021, 022). Reviewed: PASS WITH FLAGS (5 amendments applied).
5. Builder (021): orchestrator engine — schema changes, orchestrator rewrite, heartbeat extension, 11 new tests. Reviewed: PASS WITH FLAGS (Flag 3 fixed).
6. Builder (022): orchestrator CLI — scope negotiation in capture, goal tree in status, escalation display. Reviewed: PASS WITH FLAGS (Flag 1 + Flag 3 fixed).
7. Builder (020): 3 process templates (invoice-follow-up, content-review, incident-response), template loading in process-loader, E2E verification report. Reviewed: PASS WITH FLAGS (Flag 1 + Flag 2 addressed).
8. ADR-008 fixes: system agent table updated (7→10), template status updated (`template`→`draft`).
9. Insight-045 absorbed and archived.

**What worked:**
- **The human's overnight pipeline question was the catalyst.** "Can we run the pipeline overnight?" → exposed the orchestrator gap → shaped the entire Phase 5 scope. One practical question produced the design insight that ADR-010 already specified but hadn't been connected to implementation.
- **Full pipeline in one session.** PM → Research → Design → Architect → Builder (×3) → Documenter. Nine role transitions. All seven dev roles exercised. Three build briefs completed, reviewed, and approved.
- **Brief splitting paid off immediately.** The Architect's initial Brief 019 (21 ACs, 9 files) was correctly flagged as too large. Splitting into 021 (engine, 18 ACs) + 022 (CLI, 10 ACs) let each build in a clean session. The human pushed for the split — validates Insight-004's sizing heuristic.
- **The reviewer caught real issues every time.** AC 9 (escalation display dead code in 022), the orchestratorConfidence no-op update (021), ADR-008 system agent count drift (020). The maker-checker pattern consistently improves output quality.
- **Templates are immediately useful.** Three distinct domains (accounts receivable, marketing, operations), three distinct patterns (mixed executors, all-AI, multi-human-step). All include governance. They demonstrate the engine handles non-coding work.

**What surprised us:**
- **The "can't run from Claude Code" problem.** `aos start dev-pipeline` failed because `cli-agent` spawns `claude -p` which can't nest. This practical constraint drove the conversation from "run the pipeline" to "build the orchestrator" to "what does the architecture already say?" — the right question in the right order.
- **Phase 5 was a build phase, not a verification phase.** The roadmap called it "Work Evolution Verification." The actual work was building the goal-directed orchestrator (substantial engine work) + templates. The verification was the smallest part. The PM triage correctly identified this.
- **The four-way escalation taxonomy emerged from research, not design.** Blocked/uncertain/error/aggregate-uncertainty came from the Multi-Tier Confidence Routing research (Section 3.3), not from the UX designer. The designer then made it actionable. Research → Design → Architecture worked as intended.

**What to change:**
- **The roadmap's Phase 5 description was misleading.** "Verification" suggested minimal code. The actual deliverable was a major engine feature (orchestrator) + CLI + templates. Future phase descriptions should distinguish "verify existing" from "build new + verify."
- **Smoke tests on CLI briefs need the engine running.** Brief 022's smoke test requires Brief 021's orchestrator. The review caught this but it should be explicit in the brief: "Smoke test requires: [prior brief output]."
- **The session was very long.** Nine role transitions in one session is productive but approaching the limit of what a single conversation can hold. Consider: if the brief split had been decided earlier, the engine and CLI could have been separate sessions.

---

## Documenter Retrospective (2026-03-21 — Knowledge Maintenance Design Session)

**What was produced this session:**
1. PM triage: confirmed Brief 014b as next work. Identified brief naming convention drift (014a/014b vs sequential numbering).
2. Brief naming convention added to `docs/briefs/000-template.md`.
3. Insight-043: knowledge maintenance belongs at point of contact, not centralised cleanup.
4. Distributed knowledge maintenance design (Architect): ownership table, flag-vs-fix distinction, handoff visibility rule. Reviewed: PASS WITH FLAGS (all addressed).
5. Implementation: 7 dev role skills updated, review checklist point 12 added, dev-process.md Knowledge Maintenance section added.
6. Insight audit: Insight-021 and Insight-038 absorbed and archived.

**What worked:**
- **The human's question surfaced the deeper principle.** "Why has naming drifted?" → "when do ADRs get revised?" → "shouldn't each agent maintain what it reads?" → Insight-043. Natural progression from observation to principle to design.
- **The Architect design was appropriately scoped.** No brief needed — constraint language in existing skills. Reviewer found real issues (ownership table gaps, parallel-role coordination) that improved the design.
- **Dogfooding immediately.** The session both designed the pattern AND used it. The Documenter then audited for gaps — found count drift and two absorbable insights. The pattern works.

**What surprised us:**
- **State.md had accumulated multiple count inconsistencies.** Insight and research counts were wrong from prior sessions. Nobody owned accuracy of these specific numbers. Validates Insight-043.
- **Two insights were absorbable and nobody noticed.** Insight-021 and 038 were fully codified but still active. Only the cross-cutting audit caught them.

**What to change:**
- **The Documenter's cross-cutting audit is still load-bearing.** Distributed maintenance catches drift in actively-read docs. It doesn't catch drift in docs nobody reads this session (stale insight status, count mismatches). Both mechanisms are needed.
- **Verify counts against filesystem, not prior state.md.** Counts should be verified by counting files, not reading what state.md claims.

---

## Documenter Retrospective (2026-03-21 — Phase 4c Session)

**What was produced this session:**
1. PM triage: identified Brief 014 as stale (pre-016 deliverables duplicated), recommended Architect finalization.
2. Architect: reconciled Brief 014 with 016 deliverables, split into 014a + 014b. Reviewed (PASS WITH FLAGS). Approved.
3. Builder (014a — separate session): system agent infrastructure + trust-evaluator. 8 AC.
4. Builder (014b — this session): 3 new system agents + auto-classification capture. 9 AC. 23 new tests (55 total). Reviewed (PASS WITH FLAGS — 2 minor, both resolved).
5. Insight-044: system agents use `script` executor + `systemAgent` handler, even for LLM-calling agents.

**What worked:**
- **Brief splitting was the right call.** 014a validated the system agent pattern with the simplest case (trust-evaluator wraps existing code). 014b used that validated pattern for three new agents. No surprises in 014b because 014a had already proven the infrastructure.
- **The keyword classifier is appropriately simple.** Regex patterns for 5 work item types with sensible priority ordering. Low confidence default triggers fallback. No over-engineering.
- **Fallback to interactive is a genuine differentiator.** No surveyed system degrades gracefully from AI classification to manual selection. The capture flow never dead-ends.
- **The uniform `script` + `systemAgent` pattern emerged organically.** The brief specified `ai-agent` for the router, but structured JSON output control matters more. Insight-044 captures this.

**What surprised us:**
- **System agents are "supervised" but don't block.** The trust gate pauses the step run, but the capture command reads outputs from the step run anyway. "Supervised" means the classification decision appears in the review queue for later verification — not that capture blocks until approval. Architecturally correct but wasn't explicit in the brief.
- **The N+1 query pattern in the router's process filter.** Initial implementation queried once for summaries, then N times for full records. Reviewer caught this; builder fixed it same cycle.

**What to change:**
- **Briefs specifying system agent executors should follow Insight-044.** All system agents should default to `script` + `systemAgent` config.
- **"Supervised but non-blocking" pattern needs a name.** System agents that produce reviewable outputs but don't block the triggering operation are a distinct interaction pattern. Worth naming when more examples accumulate.

---

## Documenter Retrospective (2026-03-21 — QMD/Obsidian Research Session)

**What was produced this session:**
1. Research report: `docs/research/qmd-obsidian-knowledge-search.md` — evaluated QMD (markdown search engine), Obsidian integration patterns, and OpenClaw memory model as composition opportunities for Ditto. Reviewed: PASS WITH FLAGS (3 flags, 2 addressed).
2. Landscape update: OpenClaw added as proper entry in `docs/landscape.md` with memory architecture details (4-layer model, compaction limitations). Previously only referenced in architecture.md borrowing table.
3. Landscape update: QMD added to `docs/landscape.md` Knowledge Search section.
4. Research index updated with new report.

**What worked:**
- **Research triggered by external links was efficiently scoped.** The human shared 3 links. The Researcher correctly assessed them against the full project context (not just Brief 016), identified the genuine composition opportunity (QMD-via-MCP for Insight-042), and captured competitive intelligence (OpenClaw memory model) that fills a landscape gap.
- **The human's "signal, not action" assessment was correct.** Nothing in the findings changes current priorities or architecture. The research enriches landscape knowledge and creates a pointer for when Insight-042 ships. This is what good scouting looks like — information ready when needed, not premature adoption.
- **The landscape gap for OpenClaw was real.** A project referenced in architecture.md's borrowing table had no landscape.md entry. The research session surfaced this organically. Now there's a proper evaluation with memory architecture details and competitive contrast.

**What surprised us:**
- **QMD's stack overlap with Ditto.** Same dependencies (better-sqlite3, vitest, TypeScript, MIT, Node 22), same test runner, same DB engine. If QMD stabilises, the integration path is unusually clean for a third-party tool.
- **OpenClaw's memory model has hard limits not previously documented.** 20K chars per bootstrap file, 150K aggregate. Lossy compaction. These are concrete numbers that inform competitive positioning — Ditto's structured memory has no such limits.

**What to change:**
- **Landscape.md should have entries for every project in architecture.md's borrowing table.** OpenClaw was borrowed from but never evaluated in the landscape doc. A periodic audit of the borrowing table against landscape.md would catch these gaps. This is a Documenter responsibility.

---

## Documenter Retrospective (2026-03-21 — Phase 4b + Test Infrastructure Session)

**What was produced this session:**
1. Phase 4b implementation (Brief 013) — human step suspend/resume, `aos complete`, `aos capture` rewrite, unified task surface, pattern notification. 12 AC, reviewed (PASS WITH 2 FLAGS, resolved).
2. Test infrastructure (Brief 017) — vitest setup, 32 integration tests across 5 engine modules, dead `captures` table removed. 15 AC, reviewed (PASS WITH 2 FLAGS, acknowledged).
3. PM triage: test infrastructure prioritised ahead of Brief 016 based on compounding debt analysis.
4. Architect brief (017) designed and reviewed in same session.

**What worked:**
- **Two briefs in one session.** Phase 4b (substantial engine feature) and Brief 017 (infrastructure) both completed, reviewed, and approved. The session flow was natural: build 4b → documenter → PM triage → architect 017 → build 017 → documenter. Six role transitions, no friction.
- **The PM correctly identified the testing gap as urgent.** The research (Insight-038, QA report) had already concluded testing belongs in the build loop. The PM connected this to the compounding debt: 4 phases with no regression coverage. Prioritising 017 before 016 was the right call.
- **Brief 017 was small enough to not need sub-phasing.** 15 AC, 5 test files, one config file. Designed, built, and reviewed in under an hour. This validates Insight-004's sizing heuristic — infrastructure briefs can be lean.
- **The human's question about end-user process testing** surfaced a clear articulation: the trust system IS the testing strategy for user processes. Governance replaces testing. This was already implicit in the architecture but hadn't been stated this clearly.

**What surprised us:**
- **The stale dependency claim from a prior session.** State.md said Phase 4b "depends on 016 for CLI adapter and conditional routing." The actual brief (013) had no such dependency. Phase 4b built cleanly without 016. Documentation accuracy matters — wrong dependency claims can missequence work.
- **vitest's db mock pattern.** The `vi.mock("../db")` with a getter function (`get db() { return testDb; }`) was necessary because the db module creates a singleton at import time. This is a known vitest pattern for module-level singletons but wasn't anticipated in the brief. The review correctly flagged the repetition across 3 test files.
- **The `correctionRate` formula.** The trust test initially expected `edits / humanReviews` but the actual formula is `(edits + rejections) / humanReviews`. The Builder caught this by running the tests (not by reading the code first). This validates the Aider pattern: run tests, read failures, fix.

**What to change:**
- **Verify dependency claims against actual briefs** before documenting them in state.md. This is the second session where a stale dependency claim was found.
- **Builder should run tests early** (before writing all test files) to catch API shape mismatches. The two test failures (trust-diff severity, trust correctionRate) would have been caught faster with incremental test-driven development.
- **The `createTables` SQL duplication** in test-utils is a known maintenance risk. If schema changes become frequent, explore using drizzle-kit's programmatic API to push schema to test DBs. For now, the warning comment is sufficient.
