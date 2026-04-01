# Ditto — Current State

**Last updated:** 2026-04-01
**Current phase:** Phase 10 **complete**. Phase 11 (Chat UX & Experience) **in progress**. 478 unit tests (28 test files) + 14 e2e tests (4 spec files). **Brief 069 (complete, 2026-04-01):** Rich Block Emission — all 15 ACs pass. Expanded `toolResultToContentBlocks` so all 19 Self tools produce appropriate ContentBlocks (RecordBlock, MetricBlock, SuggestionBlock, AlertBlock, ChecklistBlock, ProcessProposalBlock, KnowledgeCitationBlock, etc.) instead of just StatusCard/Text. Metadata-first pattern: `detect_risks`, `get_briefing`, `suggest_next` now pass structured metadata alongside text output; block mapper uses metadata when available, falls back to text parsing (Insight-134). 25 new tests in `self-stream.test.ts` + 3 structural tests in `self-tools.test.ts`. `cognitive/self.md` extended with block emission guidance ("text is narrative, blocks are evidence"). Reviewed: PASS WITH FLAGS (3 flags, all fixed: action ID uniqueness, structural tests, metadata-first). **Brief 068 (complete, 2026-04-01):** Confidence & Trust Card — all 16 ACs pass. Engine: ConfidenceAssessment type (response-level metadata, NOT ContentBlock), assess_confidence as 19th Self tool, SelfStreamEvent confidence variant, heuristic floor overrides, fallback synthesis. API: data-confidence custom data part with Zod schema. UI: ConfidenceCard component (collapsed/auto-expand/user-expand, uncertainties-first, activity trace gateway, mobile truncation, split visual treatment), positioned above response text (Insight-128), shimmer during streaming. **Brief 065 (complete, 2026-04-01):** Conversation Core Feel — all 15 ACs pass. **Brief 064 (complete, 2026-03-31):** Real-Time Streaming Fix. **Briefs 057-062 (complete).** **Brief 063 (approved, ready to build):** Block Renderer Polish. **Brief 070 (draft, 2026-04-01):** Activity Progressive Disclosure — three-level display for activity traces. 12 AC. Reviewed: PASS WITH FLAGS (4 flags, all fixed). Supersedes Brief 067. **Insights 130-134 captured.** **Brief 067 superseded** by Brief 070. **Brief 049 (draft, parked):** Automaintainer Meta-Process (Phase 11+). **Prototype cleanup:** P01-P07 archived (old design system). 25 prototypes updated: prompt input border-radius 24px → 16px. Next: approve Brief 070, then `/dev-builder`.
**History:** See `docs/changelog.md` for completed phases, retrospectives, and resolved decisions.

---

## What's Working

- **Web app (Briefs 039-042, 045-046)** — Next.js 15 App Router in `packages/web/`. Monorepo via `pnpm-workspace.yaml`. `pnpm dev` from root starts the web app. **Setup system:** first-run setup page at `/setup` with 5 connection methods. **Self streaming:** `selfConverseStream()` async generator, 5 LLM providers. Route Handler at `/api/chat` (AI SDK v6 `createUIMessageStream`) + SSE at `/api/events`. **Component Protocol (Briefs 045+050):** 22 typed ContentBlock types in `src/engine/content-blocks.ts` (16 original + 3 visual + 2 record/table + 1 ArtifactBlock — ADR-023 accepted). Unified block registry at `packages/web/components/blocks/` (22 components, exhaustive switch). **TextBlock renders markdown** via `react-markdown` + `remark-gfm` (headings, tables, code blocks, GFM). **ArtifactBlock** renders compact reference card in conversation with "Open" button → artifact mode. **Engine-connected artifact mode (Brief 050):** artifact host fetches `ContentBlock[]` from `/api/processes?action=getRunOutput&runId=` → renders through `BlockList` (no bespoke viewers, 720px max-width). `start_dev_role` outputs >500 chars auto-promote to artifact mode via `DelegationResult.metadata` (structured runId/processSlug). `transition-map.ts` extended. Parts-based message rendering via AI SDK v6 `UIMessage.parts`. Tool invocations show 7-state lifecycle. Custom data parts for content blocks, credentials, status. Session-scoped action validation via `handleSurfaceAction()`. Feed assembler enriches ReviewItems and ExceptionItems with ContentBlocks. Process outputs render via block registry. **Pipeline progress (Brief 053):** `ProgressBlock` populated from `activeRuns` in CompositionContext. `/api/processes?action=activeRuns` endpoint. `useHarnessEvents` invalidates `activeRuns` query key on pipeline SSE events (step-complete, gate-pause, gate-advance, run-complete, run-failed). Today + Work compositions prepend ProgressBlock for running pipelines. `use-pipeline-review.ts` hook: listens for `gate-pause`, fetches step output, exposes `pendingReview` state for inline review prompts. Transition map: `start_pipeline` → process_run panel context. **Conversation UI (Brief 058 — AI Elements adoption):** 8 adopted AI Elements components in `packages/web/components/ai-elements/` (Conversation with use-stick-to-bottom auto-scroll, Message with vivid dot + streamdown markdown, PromptInput with abort, Reasoning with collapsible shimmer, Tool with 7-state lifecycle, Confirmation for tool approval, Suggestion chips, Shimmer). Full useChat API surface: `dataPartSchemas` (4 Zod schemas, zero `as never` casts), `experimental_throttle` (100ms), `stop()`, `regenerate()` (hover retry on last message), `addToolApprovalResponse()`, `onData` (transient status), `onFinish`. Streaming markdown via `streamdown` (replaces manual rendering). Server: `consumeStream()` via tee for disconnect resilience, `transient: true` on status data parts. 6 shadcn/ui primitives. Design tokens from visual identity spec. **Workspace layout (Briefs 042+046):** Three-panel layout: sidebar (w-64, icon rail on medium screens) + center (feed + conversation + input) + right panel (w-72 collapsible, adaptive). **Workspace transitions (Brief 046):** Conversation messages from `useChat` render in centre column between feed and input. Right panel adapts to Self tool results via `TRANSITION_TOOL_MAP` (`transition-map.ts`): `generate_process(save=false)` → Process Builder panel (YAML structure, Drafting badge), `generate_process(save=true)` → process detail navigation, `get_briefing` → Briefing panel, `get_process_detail` → process trust context. Artifact Viewer panel for output review with lifecycle badge + Approve/Edit/Reject actions. Panel override clears on sidebar/Home navigation. Mobile (<1024px): artifact-review transitions show bottom sheet with swipe-to-dismiss. Auto-switch from conversation-only to workspace when first process created via Self (`workspace-events.ts` custom event bus). Progressive reveal: conversation-only for new users, workspace when processes exist. Sidebar: "My Work" (active work items with status dots), "Recurring" (domain processes with health indicators), "How It Works" (placeholder). Empty categories hidden. Process detail: 3 variants — living-roadmap (step timeline), domain-process (how it works + metrics + sparkline + trust control + activity log), process-runner (stepped wizard for multi-step human processes). Activity log: unified human+system timeline, filterable. Trust control: natural language slider ("Check everything" ↔ "Let it run") with evidence narrative. Engine View: developer-only toggle (Ctrl+Shift+E). Responsive breakpoints: ≥1280px full, 1024-1279px collapsed sidebar, <1024px hamburger+overlay. Process data API at `/api/processes`. All engine calls server-side. **Observability layer (Brief 056):** 6 semantic interaction event types (`artifact_viewed`, `composition_navigated`, `brief_selected`, `block_action_taken`, `review_prompt_seen`, `pipeline_progress_viewed`) recorded to `interaction_events` table via fire-and-forget `POST /api/events/interaction`. `useInteractionEvent()` hook with `navigator.sendBeacon()` + `fetch()` fallback + properties-aware debounce. Artifact mode tracks view duration. Workspace tracks navigation transitions. Pipeline review tracks response time. `briefs` table synced from markdown files via `syncBriefs()` (lazy from `/api/roadmap`). Self context enriched with `buildInteractionSummary()` in `loadWorkStateSummary()`. Implicit signals feed meta-processes only — NOT trust computation (trust.ts unchanged). `architecture.md` Layer 5 updated. **Real-time streaming (Brief 064):** Claude CLI `--include-partial-messages` enables `stream_event` parsing — `text_delta` → character-level text streaming, `thinking_delta` → live reasoning content. Deduplication guard (`receivedStreamDeltas`) prevents `assistant` complete message from doubling text. CLI internal tool calls (`content_block_start` tool_use → `tool-use-start`, `content_block_stop` → `tool-use-end`) surfaced through `self-stream.ts` → `route.ts` → browser. `extractToolSummary()` + `stripProjectRoot()` provide human-readable context (file paths, search patterns). 10 CLI tool display names in `tool-display-names.ts`. Activity grouping in `message.tsx`: consecutive CLI internal tools (Read, Edit, Grep, etc.) + reasoning grouped into collapsible ChainOfThought cards. Active: auto-open with contextual header ("Reading file..."). Complete: auto-collapse with summary ("8 steps — read file (5x), searched code (2x)"). Ditto's own tools render standalone. User toggle autonomy: `defaultOpen` (not controlled `open`), `userClosedRef` in Reasoning prevents forced reopening. Insights 124 + 125.
- **Storage** — SQLite + Drizzle ORM + better-sqlite3. WAL mode. Auto-created at `data/ditto.db`. Path resolved via `src/paths.ts` (`PROJECT_ROOT` anchored to monorepo root, not `process.cwd()`). (ADR-001)
- **Process definitions** — 18 YAML processes in `processes/` (7 domain + 4 system + 7 standalone delegation roles). Parallel groups, depends_on, human steps, conditional routing (route_to/default_next). System processes have `system: true`. Standalone role processes (Brief 029, migrated Brief 031) are single-step `ai-agent` delegations with `config.role_contract` and `config.tools` (read-only, read-write, or read-write-exec — Brief 051).
- **LLM provider abstraction (Briefs 029+032+033)** — `src/engine/llm.ts`. Multi-provider registry: Anthropic, OpenAI, Ollama (via OpenAI-compatible API). Ditto-native types (`LlmToolDefinition`, `LlmContentBlock`, `LlmMessage` etc.) — no SDK types leak beyond `llm.ts`. `createCompletion()`, `extractText()`, `extractToolUse()`, `getConfiguredModel()`, `getProviderName()`. Tool format translation (Anthropic ↔ OpenAI) internal. `initLlm()` startup validation — fails clearly if `LLM_PROVIDER` or `LLM_MODEL` not set. Per-provider cost tracking ($0 for Ollama), cost calculated on actual model from API response. `LlmCompletionResponse` includes actual `model` from API. No hardcoded default model or provider. Provenance: Vercel AI SDK pattern, 12-factor app, Insight-060, Insight-062.
- **Model routing intelligence (Brief 033)** — `src/engine/model-routing.ts`. Step-level model hints (`fast`/`capable`/`default`) in process YAML `config.model_hint`. `resolveModel(hint)` maps to provider-specific models (Anthropic: Haiku/Opus, OpenAI: gpt-4o-mini/gpt-4o; Ollama falls back to default). Model recorded on every `stepRun` (both advance and pause paths). `generateModelRecommendations(db)` analyzes 20+ completed runs per (process, step, model): recommends cheaper model when quality comparable (within 5%), recommends upgrade when quality low (<80%). Current model determined from most recent 5 runs. Advisory only — no auto-switching. Process loader validates `model_hint` values. Provenance: Vercel AI SDK alias pattern, RouteLLM economics, process-level learned routing original to Ditto.
- **Claude adapter (Briefs 031+025)** — Role contract loading from `.claude/commands/dev-*.md` via `step.config.role_contract` (fallback to hardcoded prompts). Two tool categories merged at execution: codebase tools (`step.config.tools` → `readOnlyTools` or `readWriteTools`) + integration tools (resolved by harness from `step.tools`). Dispatches codebase calls to `executeTool()`, integration calls to `executeIntegrationTool()`. Confidence parsing from response text (`CONFIDENCE: high|medium|low`). Tool use loop (max 25 calls). Uses `createCompletion()` from `llm.ts`.
- **CLI adapter (Brief 016a)** — `src/adapters/cli.ts`. Spawns `claude -p` as subprocess. Loads role contracts from `.claude/commands/dev-*.md`. Parses CONFIDENCE from output. costCents: 0 (subscription-based). Provenance: ralph (subprocess), Paperclip (adapter pattern).
- **Script adapter** — Deterministic steps with on_failure
- **Integration infrastructure (Briefs 024+025+035+036)** — `integrations/` directory with YAML registry files (Insight-007). Registry loader (`src/engine/integration-registry.ts`) parses, validates, caches by service name. Supports tool definitions in YAML: `IntegrationTool` type with name, description, parameters, execute config (CLI command template or REST endpoint). `getIntegrationTools(service)` export. CLI protocol handler (`src/engine/integration-handlers/cli.ts`) executes via child_process.exec with retry (3 attempts, 1s/2s/4s backoff), JSON parsing, credential scrubbing. REST protocol handler (`src/engine/integration-handlers/rest.ts`) — native `fetch`, GET/POST/PUT/DELETE, auth header injection, credential scrubbing on all paths. `integration` executor type in step-executor switch. **Credential vault (Brief 035):** `src/engine/credential-vault.ts` — AES-256-GCM encrypted at rest, HKDF key derivation, per-(processId, service) scoping with UNIQUE constraint. Unified `resolveServiceAuth()`: vault-first, env-var fallback with deprecation warning. `processId` threaded through both execution paths (integration steps + tool use). CLI: `ditto credential add/list/remove`. `credentials` table in schema. Harness logs `integration.call` activities. Schema: `integrationService`/`integrationProtocol`/`toolCalls` on stepRuns. **Process I/O (Brief 036):** `src/engine/process-io.ts` — polling-based triggers (`startPolling`/`stopPolling`/`getPollingStatus`) and output delivery (`deliverOutput`). `source` and `outputDelivery` fields on `processes` table + `ProcessSourceConfig`/`ProcessOutputDeliveryConfig` types. Process loader validates service refs via `validateProcessIo()`. Heartbeat calls `deliverOutput()` after run completes (trust gate passed). Delivery payload includes collected approved step outputs + params. CLI: `ditto trigger start/stop/status`. Polling creates work items with `triggeredBy: "trigger"`. (ADR-005, Insight-065)
- **Agent tool use (Brief 025)** — Step-level `tools: [service.tool_name]` in process YAML. Tool resolver (`src/engine/tool-resolver.ts`) maps qualified names to `LlmToolDefinition[]` + execution dispatch function. Memory-assembly handler resolves tools → `HarnessContext.resolvedTools`. Claude adapter merges integration tools with codebase tools; dispatches integration calls via `executeIntegrationTool()`, codebase calls via existing `executeTool()`. Tool calls logged on `stepRuns.toolCalls` (name, args, resultSummary, timestamp). Process loader validates `service.tool_name` format against registry at sync time. Tools are Ditto-native (`LlmToolDefinition`), works with any LLM provider — MCP deferred (Insight-065). 2 integrations with tools: GitHub (4 CLI tools), Slack (2 REST tools). Provenance: ADR-005, Insight-065, Nango git-tracked approach.
- **Process loader** — YAML parsing, parallel_group containers, dependency validation, cycle detection, integration step validation (config.service required). Supports route_to, default_next, retry_on_failure fields (Brief 016b). Source/output_delivery validation against integration registry (Brief 036).
- **Integration generation (Brief 037)** — `ditto generate-integration --spec <file|url> --service <name>`. Parses OpenAPI 3.x spec (via `@apidevtools/swagger-parser`), emits valid Ditto integration YAML. Generate-then-curate pattern (Neon/Taskade). REST protocol only. Maps: operationId→snake_case name, summary→description, params→flat parameters, method→execute config. Classifies tools as read-only (GET) or write (POST/PUT/DELETE). PATCH skipped with warning. Handles: $ref resolution, nested object flattening (warns >1 level), missing operationId (skip+warn), deprecated ops (skip+warn), file upload (skip+warn), duplicate names (method prefix), enum values (in description), empty parameters (`{}`). Auth as placeholder only. Header comments with source, date, tool count, curation reminder. Provenance: Composio/Taskade/FastMCP/Neon patterns, Insight-071, Insight-072.
- **CLI** — citty + @clack/prompts. 15 commands: sync, start, heartbeat, status, review, approve, edit, reject, trust, capture, complete, debt, credential (add/list/remove), trigger (start/stop/status), generate-integration. TTY-aware, --json on listings. Unified task surface.
- **Work items** — workItems table (type, status, goalAncestry, assignedProcess, spawnedFrom). Conditional flow (Insight-039).
- **Harness pipeline** — 7 handlers: memory-assembly → step-execution → metacognitive-check → review-pattern → routing → trust-gate → feedback-recorder. Metacognitive check (Brief 034b): post-execution self-review via LLM (maxTokens: 512). Auto-enabled for supervised+critical tiers, opt-in for others via `harness.metacognitive: true`. Flags issues for human review; does not re-execute. Shared `parseHarnessConfig()` in `harness-config.ts`. Review-pattern handler guards prior flags and merges reviewDetails. Routing handler (Brief 016b) evaluates route_to conditions via substring matching (Mode 1).
- **Trust gate** — 4 tiers: supervised, spot-checked (~20%), autonomous, critical. Deterministic SHA-256 sampling. Confidence override: `low` always pauses regardless of tier (ADR-011, Brief 016d). **Session trust overrides (Brief 053):** `session-trust.ts` — in-memory store keyed by runId. Overrides can only relax (supervised → spot_checked), never tighten. Builder/reviewer roles and critical-tier steps cannot be relaxed. Auto-cleared on run-complete/run-failed.
- **Trust earning** — Sliding window (20 runs), conjunctive upgrades, disjunctive downgrades, grace period, simulation, override. (ADR-007)
- **Review patterns** — Maker-checker, adversarial, spec-testing. Retry with feedback injection.
- **Memory** — Three durable scopes: agent-scoped + process-scoped + self-scoped (ADR-003, ADR-016, Brief 029) + intra-run context (ephemeral, Brief 027). Salience sorting, token-budgeted assembly (2000 tokens durable, 1500 tokens run context), feedback-to-memory bridge.
- **Sessions (Briefs 029+030)** — `sessions` table with full lifecycle: create, append turns, resume within timeout, suspend after 30min idle (summary generated). Cross-surface resumption (ADR-016). DB-backed, not in-memory.
- **Cognitive framework (Brief 029, extended 034a)** — `cognitive/self.md`. Consultative framing protocol, communication principles (competent/direct/warm/purposeful), trade-off heuristics, metacognitive checks (5 pre-action checks + teammate consultation guidance), escalation sensitivity, dev pipeline domain context. Identity substrate for the Conversational Self.
- **Conversational Self (Briefs 030+034a+040+043+044+053)** — `src/engine/self.ts` + `self-context.ts` + `self-delegation.ts` + `self-tools/`. The outermost harness ring: persistent identity, tiered context assembly (~6K token budget), `selfConverse()` conversation loop with tool_use delegation, session lifecycle. **19 tools total:** Original 5 (`start_dev_role`, `consult_role`, `approve_review`, `edit_review`, `reject_review`) + 1 Brief 052 (`plan_with_role` — collaborative planning with read-only codebase tools, Architect gets `docs/`-restricted write) + 1 Brief 053 (`start_pipeline` — full pipeline trigger, async via `setImmediate`, returns runId immediately, optional `sessionTrust` overrides) + 7 Brief 040 (`create_work_item`, `generate_process`, `quick_capture`, `adjust_trust`, `get_process_detail`, `connect_service`, `update_user_model`) + 3 Brief 043 proactive (`get_briefing`, `detect_risks`, `suggest_next`) + 1 Brief 044 (`adapt_process`) + 1 Brief 068 (`assess_confidence` — structured confidence assessment, heuristic floor, conservative bias). **Confirmation model:** irreversible actions require explicit user confirmation. **Proactive engine (Brief 043):** `briefing-assembler.ts` queries 5 dimensions (focus, attention, upcoming, risk, suggestions). `risk-detector.ts` detects temporal, data staleness, and correction-pattern risks. `industry-patterns.ts` stores APQC-level business process patterns for 5 industries. `suggest-next` draws from all 9 user model dimensions + industry patterns + process maturity. Self proactively delivers briefings on user return (session gap detection). Risk signals woven into narrative — never says "risk" (Insight-073). Suggestions capped at 1-2, zero during exceptions. **User model:** 9 dimensions with behaviour tracking (`updateWorkingPatterns()` tracks login times, check frequency, preferred surface). **Onboarding (Brief 044):** `processes/onboarding.yaml` — system process with 5 steps (gather-basics, identify-first-pain, reflect-understanding, propose-first-process, first-real-work). `adapt_process` tool writes run-scoped definition override on `processRuns.definitionOverride` — template stays durable. Guards: validates against process-loader schema, cannot remove/reorder protected steps (running/waiting_review/approved), system processes only, optimistic locking. Heartbeat re-reads override at each step boundary. 3 new ContentBlock types: `knowledge_synthesis`, `process_proposal`, `gathering_indicator`. Knowledge synthesis card (editable, corrections feed back to Self). Process proposal card (plain language steps, approve/adjust). Self speaks first for new users. `cognitive/self.md` extended with onboarding conversation guidelines + AI coaching principles. **Masked credential input:** secure field at `/api/credential`. **Integration registry:** `ConnectionMetadata` type on IntegrationDefinition. Self-stream extended with `structured-data`, `credential-request`, and onboarding content block event types. Self decision tracking, self-correction memories, cross-turn redirect detection unchanged. Telegram bot routes free-text through the Self.
- **Human steps** — `executor: human` suspends execution, creates action work item with input_fields, `aos complete` resumes with human input.
- **Pattern notification** — After 3+ corrections of same pattern, read-only notification surfaced. Precursor to Phase 8 "Teach this".
- **Parallel execution** — Promise.all for parallel groups, depends_on resolution
- **Heartbeat** — Routes through harness. Sequential + parallel. Human step suspend/resume. Conditional routing (route_to/default_next). Retry with feedback injection (retry_on_failure). Routing skips mark non-target siblings as "skipped". Output delivery hook after run completion (Brief 036).
- **Harness events** — `src/engine/events.ts`. Typed event emitter: step-start, step-complete, gate-pause, gate-advance, routing-decision, retry, step-skipped, run-complete, run-failed. Provenance: Trigger.dev event pattern.
- **Agent tools (Briefs 031+051)** — 5 tools: read_file, search_files, list_files (read-only), write_file (read-write), run_command (read-write-exec). Path traversal prevention, secret deny-list, symlink protection. `run_command` executes allowlisted shell commands via `execFile` (no shell interpretation): pnpm (run/test/exec/install --frozen-lockfile), npm (run/test), node (file paths only), git (read-only ops). npx entirely blocked. Executable+subcommand allowlist enforced. Output scrubbed for secret file references. 120s timeout, 10MB buffer cap. Builder and Reviewer use `read-write-exec` for verification evidence. Exported as `readOnlyTools` (3), `readWriteTools` (4), and `execTools` (5). Command output parsed into ContentBlocks (ChecklistBlock for test results, AlertBlock for type-check/timeout, CodeBlock for generic output) via `parseCommandOutputBlocks()` in self-stream.ts.
- **DB schema enforcement** — `pnpm cli sync` runs drizzle-kit push. Handles first-run and evolution.
- **Debt tracking** — `docs/debts/` markdown files. `pnpm cli debt` to list.
- **Dev process** — 7 roles as skills. Brief template (with composition Level column, Insight-068). 67 active insight files (124 user toggle autonomy, 125 internal vs user-facing tools — new this session). **Known issue:** 2 pre-existing number collisions at 071/072 (from separate sessions). Needs renumbering cleanup. 31 archived. 42 research reports. 12-point review checklist. Distributed knowledge maintenance (Insight-043): each role maintains docs it reads, Documenter does cross-cutting audit.
- **Dev pipeline** — `claude -p` orchestrator + Telegram bot. Full Claude workspace on mobile. (Brief 015). Engine-integrated: `processes/dev-pipeline.yaml` runs 7 roles through the real harness with conditional routing (Brief 016c). Telegram bot routes free-text through the Conversational Self (Brief 030): `selfConverse()` assembles context, converses via LLM, delegates to dev roles via tool_use. Engine bridge (Brief 027) for explicit `/start` commands: `startProcessRun()` + `fullHeartbeat()` loop, review actions. Memory, trust, feedback all active.
- **Review actions (Brief 027)** — `src/engine/review-actions.ts`. Shared approve/edit/reject logic extracted from CLI commands. Pure engine functions (no TTY, no process.exit). Step-level granularity via `findWaitingStepRun()`. Used by both CLI commands and Telegram bot.
- **System agents (Brief 014a+014b+021)** — 4 system agents running through the harness pipeline: trust-evaluator (wraps Phase 3 code, spot-checked), intake-classifier (keyword matching, supervised), router (LLM-based via `llm.ts`, supervised), orchestrator (goal-directed — decomposes goals into tasks, routes around paused items, confidence-based stopping; supervised). `category: system` + `systemRole` on agents table. System agent registry dispatches via `script` executor + `systemAgent` config (Insight-044). `startSystemAgentRun()` for programmatic triggering.
- **Goal-directed orchestrator (Brief 021+022)** — Decomposes goals into child work items using process step list as blueprint. `orchestratorHeartbeat()` iterates spawned tasks, routes around trust gate pauses to independent work. Confidence-based stopping: low confidence triggers escalation (Types 1/3/4). CLI: scope negotiation in `capture`, goal tree in `status`, escalation display. Schema: `decomposition` on workItems, `orchestratorConfidence` on processRuns.
- **Process templates (Brief 020)** — 3 non-coding templates in `templates/`: invoice-follow-up (4 steps, 1 human), content-review (3 steps, all AI), incident-response (4 steps, 2 human). All include governance declarations (trust, quality_criteria, feedback). Loaded as `status: draft` via `aos sync`. Process loader reads from both `processes/` and `templates/`.
- **Auto-classification capture (Brief 014b)** — `aos capture` auto-classifies work item type (keyword patterns) and auto-routes to best matching process (LLM). Falls back to interactive @clack/prompts on low confidence. System processes filtered from routing targets.
- **Test infrastructure (Briefs 017+054)** — vitest + 400 unit tests across 24 test files + Playwright e2e (14 tests, 4 spec files). Mock LLM layer (`MOCK_LLM=true`) with regex-keyed canned responses for deterministic e2e testing. DB reset endpoint, page objects, CI workflow. vitest covers process-loader, trust-diff, heartbeat (including orchestratorHeartbeat), feedback-recorder, trust computation, system agents (registry, classifier, orchestrator decomposition + scheduling + escalation, step dispatch), integration registry (8 tests), CLI protocol handler (6 tests), memory-assembly intra-run context (6 tests, Brief 027), agent tools (9 tests + 47 run_command tests, Briefs 031+051), standalone YAML structure (13 tests incl. read-write-exec, Briefs 031+051), LLM provider abstraction (31 tests, Brief 032), metacognitive check + harness config + flag survival (21 tests, Brief 034b), model routing + hint resolution + recommendations (20 tests, Brief 033), tool resolver + tool name validation + authorisation (8 tests, Brief 025), REST handler + auth injection + credential scrubbing (10 tests, Brief 025), credential vault + scoping + auth resolution (11 tests, Brief 035), process I/O + polling + delivery + validation (10 tests, Brief 036). Real SQLite per test (no mocks). Anthropic + OpenAI SDKs mocked at module level. `pnpm test` runs in ~3.8s.
- **E2E verification (Brief 020)** — Full work evolution cycle verified: capture → classify → route → orchestrate → execute → human step → resume → review → trust update. All 6 architecture layers proven working. Report at `docs/verification/phase-5-e2e.md`.

## What Needs Rework

- ~~Architecture.md "First Implementation" section~~ — **Resolved 2026-03-23:** Added historical note, updated to reference actual dev role processes
- ~~ADR-006 naming conflict~~ — **Resolved 2026-03-23:** `006-runtime-deployment.md` renumbered to ADR-018
- ~~ADR-017 needs update post Brief 031~~ — **Resolved 2026-03-23:** Section 3 updated with post-implementation note
- ~~CLI adapter `DEFAULT_MODEL = "opus"`~~ — **Resolved 2026-03-23:** Now uses `getConfiguredModel()` from llm.ts
- **Reference doc drift (Brief 053):** architecture.md Layer 3 needs session trust overrides documented. human-layer.md needs `activeRuns` composition enrichment + review prompt rendering pattern. ADR-024 may need addendum for `activeRuns` in CompositionContext. architecture.md Layer 5 updated with interaction events (Brief 056). **Remaining action:** Architect to update Layer 3 + human-layer.md on next architecture session.

## In Progress

- **Brief 062 — Conversation Experience Activation (2026-03-31, approved, ready to build)** — Activates conversation chrome using Brief 061's composable subcomponents. 7 conversation chrome changes (reasoning auto-close 3s + summary snippet, tool human-readable labels from static map, confirmation human language + caution border, citation inline display, typing indicator with vivid dot + status text) + message queueing (always-enabled input, queue during streaming, pending visual treatment, cancel affordance, stop-then-send, error-path preservation). 15 AC. **Note:** Some ACs partially delivered by Brief 064 (reasoning auto-close, summary snippet, tool display labels). See `docs/briefs/062-conversation-experience-activation.md`.
- **Brief 063 — Block Renderer Polish (2026-03-31, approved, ready to build)** — Elevates 7 Tier 2 block renderers to match P30 prototype visual quality. SuggestionBlock (label + vivid-subtle bg), ArtifactBlock (type icon + left border), AlertBlock (Lucide SVG icons), DataBlock (table header typography + format hints), StatusCardBlock (left border accent + severity badge), ProgressBlock (status badge), InputRequestBlock (minimal left border). 11 AC. Depends on Brief 062. See `docs/briefs/063-block-renderer-polish.md`.
- **Brief 049 — Automaintainer Meta-Process (2026-03-28, draft, parked)** — Research at `docs/research/automaintainer-repos.md`. Ditto IS the automaintainer — process definition using existing engine. Phase 11+ work. 2 P1s pending resolution. See `docs/briefs/049-automaintainer-process.md`.

## Recently Completed

- **Brief 069 — Rich Block Emission (2026-04-01, complete)** — All 19 Self tools now produce appropriate ContentBlocks in conversation (RecordBlock, MetricBlock, SuggestionBlock, AlertBlock, ChecklistBlock, ProcessProposalBlock, KnowledgeCitationBlock, StatusCardBlock) instead of just StatusCard/Text. `toolResultToContentBlocks` expanded from 12 tool cases to 19 with deterministic switch-based mapping. **Metadata-first pattern (Insight-134):** `detect_risks`, `get_briefing`, `suggest_next` now pass structured data in `DelegationResult.metadata` alongside text; block mapper uses metadata when available, falls back to text parsing. Key tool mappings: `get_process_detail` → RecordBlock + MetricBlock; `detect_risks` → AlertBlocks (max 3) + SuggestionBlock overflow; `get_briefing` → MetricBlock + ChecklistBlock + KnowledgeSynthesisBlock; `suggest_next` → SuggestionBlocks with accept/dismiss actions; `adjust_trust` → RecordBlock + ChecklistBlock (proposal) or StatusCard (applied); `adapt_process` → ProcessProposalBlock; `connect_service` → StatusCardBlock; review tools → StatusCard + conditional AlertBlock; `quick_capture` → StatusCard + conditional KnowledgeCitation; `consult_role` + `assess_confidence` → explicit `return []`. `cognitive/self.md` extended with "Block Emission in Conversation" section. 25 new tests in `self-stream.test.ts` (all pass), 3 structural tests in `self-tools.test.ts` (all pass). 478 unit tests (28 test files) + 14 e2e tests. Type-check: 0 errors. Reviewed: PASS WITH FLAGS (3 flags all FIXED: action ID uniqueness, structural tests, metadata-first). **Files:** `src/engine/self-stream.ts` (core), `src/engine/self-stream.test.ts` (new), `src/engine/self-tools/detect-risks.ts`, `src/engine/self-tools/get-briefing.ts`, `src/engine/self-tools/suggest-next.ts`, `src/engine/self-tools/self-tools.test.ts`, `cognitive/self.md`.

- **Brief 068 — Confidence & Trust Card (2026-04-01, complete)** — All 16 ACs pass. Engine: ConfidenceAssessment type (response-level metadata, NOT ContentBlock), assess_confidence as 19th Self tool, SelfStreamEvent confidence variant, heuristic floor overrides, fallback synthesis. API: data-confidence custom data part with Zod schema. UI: ConfidenceCard component (collapsed/auto-expand/user-expand, uncertainties-first, activity trace gateway, mobile truncation, split visual treatment), positioned above response text (Insight-128), shimmer during streaming.

- **Brief 064 — Real-Time Streaming Fix (2026-03-31, complete)** — Claude CLI real-time streaming + tool visibility + collapsible activity groups. **Core (Brief scope):** `--include-partial-messages` flag added to CLI args. `stream_event` NDJSON parsing for `text_delta` → `text-delta` and `thinking_delta` → `thinking-delta`. Deduplication guard (`receivedStreamDeltas` boolean) prevents `assistant` complete message from yielding duplicate text. Backward-compatible: falls back to `assistant` path if no stream deltas received. `extractToolSummary()` extracts context from CLI tool input (file paths, search patterns, commands). `stripProjectRoot()` converts absolute paths to relative. 8 new integration tests using `vi.doMock("child_process")`. **Extended (beyond brief, smoke-test driven):** CLI internal tool calls (`content_block_start` tool_use → `tool-use-start`, `content_block_stop` → `tool-use-end`) surfaced through `self-stream.ts` → `route.ts` → UI. 10 Claude Code tool display names added to `tool-display-names.ts`. `tool.tsx` `hasExpandableContent` fixed to treat empty `{}` input and trivial output as non-expandable. **Activity grouping:** `message.tsx` groups consecutive CLI internal tools (Read, Edit, Grep, etc.) + reasoning into collapsible ChainOfThought cards using existing AI Elements components. Active groups auto-open ("Reading file..."), complete groups auto-collapse ("8 steps — read file (5x), searched code (2x)"). Ditto's own tools (search_knowledge, etc.) render standalone with rich output. **Toggle autonomy:** Reasoning component `userClosedRef` tracks manual close — no forced reopening during streaming. ChainOfThought uses `defaultOpen` only (no controlled `open` override). Users can toggle any collapsible at any time. `docs/architecture.md` updated (Layer 2 CLI adapter). 453 unit tests + 14 e2e tests pass. Type-check: 0 errors. **Files:** `src/engine/llm-stream.ts` (core + tool events), `src/engine/llm-stream.test.ts` (8 tests), `src/engine/self-stream.ts` (tool forwarding), `packages/web/components/ai-elements/message.tsx` (activity grouping), `packages/web/components/ai-elements/reasoning.tsx` (toggle fix), `packages/web/components/ai-elements/tool.tsx` (expandable fix), `packages/web/components/ai-elements/tool-display-names.ts` (CLI tools).

- **Brief 057 — First-Run Experience (2026-03-30, complete)** — Design token alignment (`.impeccable.md` palette replaces stale terracotta), setup page rebuild (P23 spec with 5 states), Day Zero welcome (P08 spec), workspace-from-start (remove process-count gating). E2e tests updated for Day Zero bypass + Brief 062 tool display labels + networkidle→element-wait. Dead code cleanup (`onProcessCreated` listener, stale page.tsx comments). All 17 AC pass. 451 unit tests + 14 e2e tests pass. Reviewed: PASS WITH FLAGS (stale comments FIXED, accent Phase 2 + Day Zero e2e test deferred as low severity). Approved 2026-03-31. Moved to `docs/briefs/complete/`.

- **Brief 061 — AI Elements Deep Adoption + Block Renderer Upgrades (2026-03-31, complete)** — Composable subcomponent pattern for conversation chrome (Reasoning, Tool, Confirmation, PromptInput). 7 new AI Elements: ChainOfThought, Plan, Queue, InlineCitation, Sources, Task, CodeBlock (Shiki syntax highlighting). 4 block renderer upgrades using AI Elements internally (reasoning-trace → ChainOfThought, knowledge-citation → Sources+InlineCitation, code → Shiki CodeBlock, checklist → Task). 18 no-change blocks documented. useControllableState + Radix Collapsible/HoverCard/ScrollArea. Backward-compatible default exports. 30/30 AC pass. Type-check: 0 errors. Tests: 440/440 pass. Reviewed: PASS WITH FLAGS (all flags fixed: Confirmation state reachability FIXED with local state tracking, Tool/Queue useState per brief carve-out — by design, QueueItem group class FIXED). Insights: 117 (domain primitives resist SDK mapping), 118 (backward-compatible composable migration), 119 (architecture without UX brief is invisible). Also fixed pre-existing YAML parse error + dependency validation in `processes/knowledge-extraction.yaml`. Moved to `docs/briefs/complete/`.

- **Brief 060 — Knowledge Compounding (2026-03-30, complete)** — Explicit extraction meta-process for learning from corrections. **Engine:** `processes/knowledge-extraction.yaml` — system process with 3 parallel extractors (context-analyzer LLM, solution-extractor LLM, related-finder SQL) + assembly step. `src/engine/system-agents/knowledge-extractor.ts` — 4 handlers + significance threshold + confidence decay + supersession. **Schema:** `"solution"` added to `memoryTypeValues`, `metadata` JSON column on memories table. **Trigger:** `feedback-recorder.ts` fires extraction on significant corrections (5 conditions: severity ≥ correction, rejection, retry, first 10 runs, pattern count ≥ 3) with trust-tier scaling. **Retrieval:** `memory-assembly.ts` has separate 1000-token budget, `## Prior Solution Knowledge` section, solution excluded from general process query. **Lifecycle:** confidence 0.5, decay after 50 runs, pruning below 0.2, supersession of stale solutions. **Docs:** architecture.md (L2 memory model, L5 paragraph 7, 11 system agents), ADR-003 (solution type, metadata, Phase 2b+). 26 new tests (440 total). 15/15 AC pass. Reviewed: CONDITIONAL PASS → all 6 flags FIXED.
- **Brief 058 — AI SDK & Elements Adoption (2026-03-30, complete)** — Adopted AI Elements components (8), wired full useChat API surface, adopted streamdown for streaming markdown. 414 unit tests + 14 e2e tests pass. Reviewed: PASS WITH FLAGS (6 flags, 3 actionable — all FIXED). Moved to `docs/briefs/complete/`. Insight-114 captured.
- **Brief 056 — Observability Layer (2026-03-30, complete)** — Last brief to complete Phase 10. **Engine:** `src/engine/interaction-events.ts` — 6 semantic event types (`artifact_viewed`, `composition_navigated`, `brief_selected`, `block_action_taken`, `review_prompt_seen`, `pipeline_progress_viewed`). `recordInteractionEvent()` inserts to `interaction_events` table. `getRecentInteractionEvents()` + `buildInteractionSummary()` for meta-process and Self consumption. `src/engine/brief-sync.ts` — syncs brief lifecycle from markdown files to `briefs` DB table with mtime-based invalidation + soft-delete. **Schema:** Two new tables: `interaction_events` (with composite index on userId+timestamp) and `briefs`. **Web:** `POST /api/events/interaction` (202 fire-and-forget). `useInteractionEvent()` hook with `navigator.sendBeacon()` + `fetch()` fallback, debounce with properties fingerprint. `artifact-layout.tsx` emits `artifact_viewed` with duration on exit. `workspace.tsx` emits `composition_navigated` + `brief_selected`. `use-pipeline-review.ts` emits `review_prompt_seen` with response time. `/api/roadmap` lazily calls `syncBriefs()`. **Process YAMLs:** `self-improvement.yaml` and `project-orchestration.yaml` updated with `interaction-events` + `brief-lifecycle` inputs wired into steps. **Self context:** `loadWorkStateSummary()` includes interaction signal summary via `buildInteractionSummary()`. **Critical constraint:** Implicit signals do NOT feed trust computation — trust.ts unchanged. `architecture.md` Layer 5 updated. 15/15 AC pass. Type-check: 0 errors. 411/411 tests pass (11 new). Reviewed: CONDITIONAL PASS → all 7 flags FIXED. Moved to `docs/briefs/complete/`.
- **Brief 055 — Scope Selection + Roadmap Visualization (2026-03-30, complete)** — "Roadmap" as 6th composition intent. **Engine:** `src/engine/brief-index.ts` — scans `docs/briefs/` + `docs/briefs/complete/`, parses brief metadata from Markdown headers, returns `BriefSummary[]`. Mtime + file-count cache invalidation. `buildRoadmapData()` returns phases (from `docs/roadmap.md` header structure) + briefs + stats. `filePath` stripped from API response. **Web:** `GET /api/roadmap` endpoint (follows `/api/processes` config pattern). `RoadmapData` type with `BriefSummary[]`, `Phase[]`, stats. `CompositionContext.roadmap?: RoadmapData` — lazy-loaded via React Query `enabled: intent === "roadmap"` (other intents don't pay fetch cost). `composeRoadmap()` composition: MetricBlock (brief counts by status), RecordBlock per active/upcoming phase, InteractiveTableBlock (actionable briefs with "Build"/"Plan" select action), ChecklistBlock (completed phases + recent briefs). Sidebar: "Roadmap" item (7th nav destination, `◈` icon). **Scope selection:** InteractiveTableBlock row action `select-brief-{N}` pre-fills conversation input with "Build Brief {N}: {name}" (ready briefs) or "Plan Brief {N}: {name}" (draft briefs). User sends message → Self routes via existing delegation guidance (Brief 052/053). Types re-exported from engine (single source of truth). 10/10 AC pass. Type-check: 0 errors. Unit tests: 400/400 pass. Reviewed: PASS WITH FLAGS (6 flags, all FIXED: type duplication → re-export, cache deletion detection → file count, sidebar comment → updated, dead comment → removed, filePath exposure → stripped, config pattern → added). Moved to `docs/briefs/complete/`.
- **Brief 054 — Testing Infrastructure (2026-03-30, complete)** — Playwright e2e testing infrastructure with mock LLM layer. **Engine:** `src/engine/llm-mock.ts` — deterministic canned responses keyed by regex on user message content (4 patterns: build-brief → start_pipeline tool_use, planning → plan_with_role tool_use, hello → greeting, markdown-test → rich text; generic fallback). `isMockLlmMode()` export. `createCompletion()` and `createStreamingCompletion()` both delegate to mock when `MOCK_LLM=true`. Never throws. **Web:** `POST /api/test/reset` — test-only DB reset endpoint, guarded by `MOCK_LLM=true || NODE_ENV=test`. Truncates all tables in FK order, re-seeds one process + work item + session. `isConfigured()` returns true in mock mode (bypasses setup wizard). Chat route skips config check in mock mode. `data-testid` attributes on 10+ components (prompt-input, message, text-block, artifact-block, progress-block, checklist-block, workspace, artifact-layout). **Tests:** 4 spec files, 14 tests: `blocks.spec.ts` (4: streamed markdown text, assistant message testid, user+assistant messages, generic response), `workspace.spec.ts` (4: chat input testid, branding, input clear on submit, send button disabled), `pipeline.spec.ts` (3: pipeline trigger text, tool invocation, pipeline status), `planning.spec.ts` (3: plan response text, plan_with_role invocation, architect role). Page objects: `ConversationPage` (goto, sendMessage, waitForResponse, userMessages, assistantMessages) + `WorkspacePage` (centerPanel, artifactLayout, artifactHost, artifactConversation). `fixtures.ts` with `resetDatabase()` helper. **Config:** `playwright.config.ts` at root — Chromium, headless, port 3001, webServer auto-start with MOCK_LLM=true. `fullyParallel: false` (shared DB). **CI:** `.github/workflows/test.yml` — install, type-check, unit tests, Playwright install, e2e tests, report upload. **Scripts:** `test:e2e`, `test:e2e:ui`, `test:e2e:auto`. **Deps:** `@playwright/test ^1.58.2`, `expect-cli ^0.0.18`. Dev-builder.md updated with e2e verification commands. 14/14 AC pass. Type-check: 0 errors. Unit tests: 400/400 pass. Reference docs checked: no drift found (testing infrastructure is cross-cutting, no architecture.md updates required). Reviewed: PASS WITH FLAGS (3 low-severity flags, all FIXED: state/roadmap docs — FIXED, reference doc line — FIXED, artifact-mode.spec renamed to workspace.spec — FIXED).
- **Brief 053 — Execution Pipeline Wiring (2026-03-30, complete)** — Full dev pipeline triggerable from conversation with live progress and review gates. **Engine:** `start_pipeline` Self tool (18th tool) in `self-delegation.ts` — calls `startProcessRun()` then `fullHeartbeat()` async via `setImmediate()`, returns immediately with `{ runId, processSlug, status, steps }`. Optional `sessionTrust` parameter for per-role trust relaxation. `session-trust.ts`: in-memory store with safety constraints (builder/reviewer protected, max relaxation spot_checked, critical-tier immune, auto-cleared on run events). Trust gate handler extended to check session overrides before process tier. `toolResultToContentBlocks` emits ProgressBlock + TextBlock for pipeline start. Decision tracking extended with `pipeline` type. Delegation guidance updated: "Build Brief X" → `start_pipeline`, single-role → `start_dev_role`. **Web:** `getActiveRuns()` in `process-data.ts` — joined query (no N+1) returning `ActiveRunSummary[]`. `/api/processes?action=activeRuns` endpoint. `ActiveRunSummary` type + `activeRuns` field added to `CompositionContext`. `useCompositionContext` uses `useQuery` for initial load + 30s fallback poll. `useHarnessEvents` invalidates `activeRuns` on 5 pipeline event types. Today + Work compositions prepend `ProgressBlock` for active runs. `use-pipeline-review.ts` hook: listens for `gate-pause` via SSE, fetches step output, exposes `pendingReview` state with approve/edit/reject actions (routes through `/api/actions`). Uses refs (not state) for closure stability. `transition-map.ts`: `start_pipeline` → `process_run` panel context. `right-panel.tsx`: `process_run` PanelContext type + renderer. 15/15 AC pass. 13 new tests (session-trust). 400/400 pass. Type-check: 0 errors. Reviewed: PASS — 4 flags raised, all 4 FIXED (trustInfo in output, activeRuns cold cache, N+1 query, stale closure). Moved to `docs/briefs/complete/`.
- **Briefs 053-056 Architecture Session (2026-03-30)** — Designed complete brief sequence for dev pipeline end-to-end through the web UI. Key decisions: (1) review gates via frontend SSE, not chat route injection; (2) session trust with maker-checker safety limits; (3) MOCK_LLM=true env flag for cross-process e2e testing; (4) expect-cli uses ACP protocol with Claude Code backend (not direct LLM API); (5) roadmap as composition intent using block vocabulary; (6) implicit signals feed meta-processes only, NOT trust. All four briefs reviewed with flags resolved.
- **Brief 052 — Planning Workflow (2026-03-30, complete)** — `plan_with_role` Self tool for collaborative planning conversations. Engages PM, Researcher, Designer, or Architect roles with read-only codebase tools (Architect additionally gets `docs/`-restricted `write_file`). Multi-turn tool-use loop (up to 5 turns) for document reading and analysis. Proposed writes return as metadata for user confirmation (not auto-persisted). `recordSelfDecision` extended with `planning` type. Delegation guidance updated with planning intent detection (planning vs execution routing examples). `cognitive/self.md` extended with Planning Conversations section. `toolResultToContentBlocks` handles planning results: ArtifactBlock for proposed files, ChecklistBlock for action items, TextBlock for analysis. 18 Self tools total (5 original + 1 planning + 1 pipeline + 7 workspace + 3 proactive + 1 onboarding). SELF_CONTEXT_TOKEN_BUDGET increased 4K→6K (pre-existing drift from growing cognitive framework). architecture.md updated. 10 new tests. 387/387 pass. Type-check: 0 errors. Reviewed: PASS WITH FLAGS (7 flags: path traversal FIXED, stale comments FIXED, unused imports FIXED, unit tests ADDED, budget increase justified, persistence gap acknowledged as intentional, architecture.md FIXED).
- **Brief 051 — Shell Execution Tool (2026-03-29, complete)** — `run_command` codebase tool for ai-agent executor. Executable+subcommand allowlist (pnpm run/test/exec, npm run/test, git read-only ops, node file-only). `execFile` (no shell interpretation). Output scrubbing via SECRET_PATTERNS. 120s timeout, 10MB buffer cap. `config.tools: "read-write-exec"` adds run_command to read-write tools. Builder and Reviewer standalone YAMLs upgraded. Role contracts updated with Shell Execution (Builder) and Verification (Reviewer) sections. 47 new tests. 377/377 pass. Type-check: 0 errors. architecture.md updated. Reviewed: PASS WITH FLAGS (3 flags: doc drift — FIXED, state/roadmap — FIXED, self-stream.ts ContentBlock rendering — FIXED). All flags resolved.
- **Brief 050 — ArtifactBlock + Markdown Rendering + Engine-Connected Artifact Mode (2026-03-29, complete)** — ArtifactBlock type added to engine (22nd ContentBlock, ADR-023 → accepted). TextBlock renders markdown via `react-markdown` + `remark-gfm`. Artifact host is engine-connected: fetches content via `useProcessRunOutput(runId)` → renders `BlockList` (no bespoke viewers, 720px max-width). `start_dev_role` outputs >500 chars → ArtifactBlock reference card in conversation + artifact mode transition; ≤500 chars → inline TextBlock. API: `getRunOutput` on `/api/processes` returns step outputs as `ContentBlock[]`. `DelegationResult.metadata` carries structured `runId`/`processSlug` (no regex extraction). 14/14 AC pass. Type-check: 0 errors. Tests: 330/330 pass. Reviewed: PASS WITH FLAGS (3 flags, all FIXED). Insight-107 captured: BlockList IS the viewer. Moved to `docs/briefs/complete/`.
- **Brief 048 — Artifact Mode Layout (2026-03-29, complete)** — Second scaffold layout pattern (ADR-024 Tier 1). Three-column: Conversation (300px) | Artifact host (flex, min 480px) | Context Panel (320px). `artifact-layout.tsx`, `artifact-host.tsx`, `artifact-context-panel.tsx` (new); `workspace.tsx`, `transition-map.ts`, `artifact-sheet.tsx` (modified). Responsive breakpoints. Mobile swipe gestures via FullArtifactSheet. 11/11 AC pass. Moved to `docs/briefs/complete/`.
- **Prototype-as-Specification (2026-03-25 → 2026-03-27, complete)** — 28 prototypes (P00-P41), viewer taxonomy (6 universal viewers), design system alignment, block vocabulary (21 types). Full detail in `docs/changelog.md`.
- **ADR-022: Critical Evaluation and Homeostatic Quality (2026-03-25)** — Architect session triggered by Waymo Critic architecture parallel + user observation on biological incentive gradients. Research report: `docs/research/critic-incentives-hallucination.md` (25+ sources, 3 areas). Five decisions: (D1) Accumulated failure knowledge as memory categories (4 category tags in existing scopes — `failure_pattern`, `hallucination_pattern`, `overconfidence_pattern`, `quality_drift`), (D2) Orchestrator reflection enriched with critical evaluation (3 new steps in ADR-014 reflection cycle), (D3) Conditional verification handler in harness (two-stage: fast pre-classifier + CoVe Factor+Revise), (D4) Homeostatic quality regulation (5 dimensions with optimal ranges, not single-score maximization), (D5) Cross-process failure correlation (L4 awareness enrichment). Build phasing: E1→E2→E3→E4→E5 (E1-E3 independently valuable, E4-E5 require data accumulation). 30 acceptance criteria across E1(10)+E2(8)+E3(12). Two new insights: Insight-100 (Inner Critic as capability, not entity — critical disposition delivered through Orchestrator reflection + Harness verification + Feedback & Evolution), Insight-101 (Homeostatic quality model — multi-dimensional quality balance with approach/avoidance gradients via verbal context injection). Reviewed: PASS WITH FLAGS (5 flags: trust upgrade pathway clarification, scope breadth, missing E4/E5 AC, roadmap update, reference doc staleness — none are blockers). Insight number collisions fixed: 098→100, 099→101 (existing 098-prototypes-are-specifications and 099-process-model-library keep their numbers).
- **Insight-099: Process Model Library with App-Binding (2026-03-25)** — Architect session. Strategic design insight: most business processes are structurally universal; what varies is the toolchain. Proposed Process Models = templates + quality profiles + abstract integration requirements. Key new concept: **abstract action binding** — process models declare integration needs abstractly (`email.send`, `accounting.get_invoices`), users bind their specific apps at adoption time. Architecturally, Process Models are well-formed templates (not a new artifact type) — a template with `quality_profile` and `abstract_actions` populated. Draft taxonomy: 14 abstract actions across 5 categories (email, accounting, messaging, calendar, documents). Reviewed: PASS WITH FLAGS (6 flags, 4 moderate fixed in-place: provenance added, template variant clarified, coexistence rule documented, draft taxonomy included). Phases: foundation Phase 11, maturity Phase 12, community Phase 13. ADR updates needed: ADR-005, ADR-008, ADR-019.
- **Briefs 043 + 044 complete (Proactive Engine + Onboarding Experience, 2026-03-25)** — Final two Phase 10 sub-briefs shipped in one session. **Brief 043 (Proactive Engine):** 3 new Self tools (`get_briefing`, `detect_risks`, `suggest_next`). `briefing-assembler.ts` queries 5 dimensions (focus, attention, upcoming, risk, suggestions) in parallel. `risk-detector.ts` detects 3 risk types: temporal (aging work items), data staleness (stale integration polls), correction-pattern (sliding window correction rate). `industry-patterns.ts` stores APQC-level patterns for 5 industries (trades, professional services, ecommerce, content/creative, healthcare). `suggest_next` draws from all 9 user model dimensions + industry patterns + process maturity + working patterns. Suggestions capped at 1-2, zero during exceptions. Self proactively delivers briefing on return (session gap detection via `<briefing_signal>` in system prompt). Risk signals woven into narrative — never uses word "risk". User model extended with behaviour tracking (`updateWorkingPatterns()` tracks login times, check frequency, preferred surface). 11/11 AC pass. **Brief 044 (Onboarding Experience):** `processes/onboarding.yaml` — system process with 5 steps. `adapt_process` tool: writes run-scoped `definitionOverride` on processRuns (template stays durable), validates via process-loader, guards against removing/reordering protected steps, system processes only, optimistic locking, activity logging. Schema: `definitionOverride` + `definitionOverrideVersion` columns on processRuns. Heartbeat reads override at each step boundary. 3 new ContentBlock types (`knowledge_synthesis`, `process_proposal`, `gathering_indicator`) fully wired: engine → stream → block registry → React components. Knowledge synthesis card: categorised entries, completeness indicators, editable with corrections. Process proposal card: plain language steps with status, approve/adjust actions. Gathering indicator: subtle pulsing dot. `cognitive/self.md` extended with onboarding conversation guidelines (Self speaks first, 70/30 user/Ditto ratio, industry-adaptive, progressive depth) + AI coaching principles (coach through corrections, make knowledge visible, celebrate accumulation, honest about limitations, never block work). Self speaks first for new users via `<first_session_signal>`. `onAction` wiring: card button clicks send user messages back to Self for feedback capture. 16/16 AC pass. Both briefs reviewed: PASS WITH FLAGS — critical flags fixed (reorder guard in adapt_process, UI component wiring to block registry + streaming + conversation). Total Self tools: 16 (5 original + 7 Brief 040 + 3 Brief 043 + 1 Brief 044). Test-utils SQL updated for schema change. All 330 tests pass, 0 type errors.
- **Brief 045 complete (Component Protocol, 2026-03-25)** — AI SDK v4.3 → v6 migration. 16 typed ContentBlock types in `src/engine/content-blocks.ts` (13 from ADR-021 + 3 Brief 044 onboarding types). Unified block registry at `packages/web/components/blocks/` with 16 components, exhaustive TypeScript `never` check. Parts-based message rendering: `message.tsx` iterates `message.parts`, tool parts show 7-state lifecycle (input-streaming → input-available → output-available → output-error + approval states). Route handler (`/api/chat/route.ts`) uses AI SDK v6 `createUIMessageStream` — no hand-rolled `0:/2:/d:` encoding. Custom data parts for content blocks, credentials, status. Session-scoped action validation: `src/engine/surface-actions.ts` with in-memory registry, TTL cleanup, single-use consumption. `handleSurfaceAction()` routes review approve/edit/reject. API endpoint at `/api/actions`. Feed assembler produces `ContentBlock[]` on ReviewItems (`ReviewCardBlock`) and ExceptionItems (`AlertBlock`). Process output card renders via block registry instead of `JSON.stringify`. `inline-data.tsx` deleted (absorbed into `data-block.tsx` + `progress-block.tsx`). `useChat` from `@ai-sdk/react`, `DefaultChatTransport`, input state managed via `useState` (v6 removed input management from hook). Packages: `ai@^6.0.138`, `@ai-sdk/react@^3.0.140`, `@ai-sdk/anthropic@^3.0.64`, `@ai-sdk/openai@^3.0.48`. Insight-096 captured (protocol before features). 17 AC, all pass. Reviewed: PASS WITH FLAGS (3 flags all fixed: registerBlockActions wired, feed assembler enriched, entity validation via existing functions). 0 new type errors, 0 new test failures (330 tests pass). **Brief deviations:** Brief says "v5" but actual is v6 (concepts identical, API names differ). Provider SDKs upgraded v1→v3 (peer dep requirement). 16 block types not 13 (user added 3 onboarding types during build).
- **Brief 042 complete (Navigation & Detail, 2026-03-25)** — Full workspace layout. Three-panel layout: sidebar (w-64, collapsible to icon rail) + center panel (feed or process detail) + right panel (w-80, collapsible Self). Sidebar: "My Work" (active work items with status dots), "Recurring" (domain processes with health indicators), "How It Works" (placeholder). Empty categories hidden. Process detail routing container with 3 variants: living-roadmap (✓/●/○ step timeline for active runs), domain-process ("How it works" + "How it's going" with sparkline + trust control + activity log), process-runner (stepped wizard for multi-step human processes, Hark pattern). Activity log component: unified human+system timeline, filterable "All"/"Mine"/"Ditto's", expandable detail, data from activities + stepRuns + trustChanges. Trust control: natural language slider ("Check everything" ↔ "Let it run"), evidence narrative, confirmation dialog, delegates to `executeTierChange()`. Engine View: developer-only toggle (Ctrl+Shift+E), compact footer on feed cards, full execution trace in process detail. Progressive reveal: conversation-only for new users, workspace transition via button or Self prompt, preference persisted in localStorage. Responsive: ≥1280px full three-panel, 1024-1279px sidebar collapses to icon rail, <1024px hamburger menu + Self overlay drawer. Engine-side: `src/engine/process-data.ts` with `listProcesses()`, `listActiveWorkItems()`, `getProcessDetail()`, `getProcessRunDetail()`, `getProcessActivities()`, `updateProcessTrust()`. API route: `/api/processes` (GET list/detail/activities/run, POST trust update). React Query hooks in `lib/process-query.ts`. Process detail page at `/process/[id]`. 17 AC all pass. Also fixed 2 pre-existing bugs: credential route import path, inline-data.tsx type errors. Reviewed: PASS WITH FLAGS (4 flags: 1 medium fixed — trust mutation now delegates to canonical `executeTierChange`; 3 low accepted for MVP — trust upgrade evidence warning, engine metadata in API responses, raw JSON in activity metadata). 0 new type errors, 0 new test failures.
- **Brief 040 complete (Self Extensions, 2026-03-25)** — Full conversational operating surface. 7 new Self tools (create_work_item, generate_process, quick_capture, adjust_trust, get_process_detail, connect_service, update_user_model) in `src/engine/self-tools/`. Confirmation model: irreversible actions require explicit user confirmation (adjust_trust confirmed param, generate_process save param). 9-dimension user model (`src/engine/user-model.ts`) stored as self-scoped memories with progressive population and reinforcement. Inline data rendering: `InlineTable`, `ProgressIndicator`, `TrendArrow`, `StructuredData` components in `packages/web/components/self/inline-data.tsx`. Masked credential input (`masked-input.tsx`) + `/api/credential` route bypasses conversation entirely. Integration registry extended with `ConnectionMetadata` type; GitHub + Slack YAMLs updated. Self-stream extended with `structured-data` and `credential-request` events. Chat route handler forwards new event types. `onboarding_guidance` and AI coaching in Self system prompt. Schema: `user_model` memory type, `conversation` memory source. 24 new tests (330 total, 23 files). All 15 AC pass. Reviewed: PASS WITH FLAGS (5 flags, all fixed: generate_process now uses process-loader validators, credential route error log scrubbed, connect_service check filters by service, structured data cleared per exchange). Brief 043 (Proactive Engine) unblocked. Reference doc drift: ADR-016 needs new tool list + confirmation model (after-completion item).
- **Hark research + brief upgrades (2026-03-25)** — Evaluated Hark (gethark.ai), a decision intelligence product for regulated environments. Research report: `docs/research/hark-decision-intelligence-ui-patterns.md` (6 UI patterns extracted from production screenshots). Designer cross-reference: `docs/research/hark-patterns-brief-cross-reference-ux.md` (3 upgrades, 2 deferrals). Architect absorbed upgrades into Briefs 041, 042, 038:
  - **Brief 041:** +2 ACs — decision output variant (verdict bar + reasoning + provenance + Markdown export), `decision-output.tsx`. Now 17 AC.
  - **Brief 042:** +2 ACs — process runner variant (stepped navigation for 3+ human steps, `process-runner.tsx`) + activity log component (unified human+system timeline, filterable, `activity-log.tsx`). Now 17 AC.
  - **Brief 038 (parent):** sub-brief summaries + provenance table + designer input updated.
  - **Landscape:** Hark added under new "Decision Intelligence / Governance Layers" section.
  - **Insight-095 captured:** Input integrity is a harness pattern (validate inputs, not just outputs). Deferred to Phase 11+.
  - All three stages reviewed (Researcher: PASS WITH FLAGS 4 fixed; Designer: PASS WITH FLAGS 6 fixed; Architect: PASS WITH FLAGS 3 fixed).
- **Brief 041 complete (Feed & Review, 2026-03-25)** — Feed component in `packages/web/components/feed/` with 6 item types rendered via discriminated union component registry. Types: shift report (narrative briefing with stats), review card (inline approve/edit/reject with confidence dots green/amber/none), work update (expandable status), exception card (error + natural language explanation + investigate/pause/ask-self), insight card ("Teach this" pattern detection after 3+ similar edits), process output (summary + expandable content, json-render placeholder). Feed assembler (`src/engine/feed-assembler.ts`) queries processRuns, stepRuns, processOutputs, processes, harnessDecisions, workItems, feedback. Entity grouping clusters items by work item. Priority ordering: action-required first, then informational, then historical. Inline review actions call existing `approveRun()`/`editRun()`/`rejectRun()` server-side via `/api/feed` POST (validated inputs). Edit diffs captured via existing `feedback-recorder.ts` pipeline. TanStack Query hooks with SSE subscription for real-time updates (refetch on step-complete, gate-pause, gate-advance, run-complete, run-failed). Empty/loading/error states per UX spec 7.2. Engine import layer (`packages/web/lib/engine.ts`) extended with feed-assembler + review-actions. 15 AC all pass. Reviewed: PASS WITH FLAGS (2 should-fix both fixed: missing pause button on exception card, POST input validation). 0 new type errors, 0 new test failures. Brief 042 (Navigation & Detail) unblocked.
- **Post-039 bug fixes (2026-03-25)** — Three issues found and fixed during first live web app test:
  1. **Monorepo DB path divergence:** Web app (cwd=`packages/web/`) created orphan DB at `packages/web/data/ditto.db` instead of root `data/ditto.db`. Fix: `src/paths.ts` module finds monorepo root by walking up to `package.json` with `name: "ditto"`. `src/db/index.ts` and `packages/web/lib/config.ts` now import `PROJECT_ROOT`/`DATA_DIR`/`DB_PATH` from paths.ts. Orphan `packages/web/data/` deleted, config migrated to root. Reviewed: PASS WITH FLAGS (3 low flags: dev-session.ts has duplicate DATA_DIR, process-loader.ts defaults could diverge, state not updated — all follow-up items).
  2. **Claude CLI `--verbose` flag required:** `claude -p --output-format stream-json` now requires `--verbose`. Added to args in `llm-stream.ts`.
  3. **Claude CLI stream-json format change:** The CLI emits both `{ type: "stream_event", event: { type: "content_block_delta" } }` (streaming deltas) and `{ type: "assistant", message: { content: [...] } }` + `{ type: "result", result: "..." }` (complete messages). `stream_event` deltas require `--include-partial-messages` flag. Without the flag, only `assistant`/`result` events arrive. Brief 064 restored `stream_event` parsing with `--include-partial-messages` and deduplication guard.
  - Also fixed: `templates/invoice-follow-up.yaml` — commented out `source`/`output_delivery` referencing non-existent email/accounting integrations (was blocking `pnpm cli sync`).
  - LLM abstraction layer audited: EXCELLENT. SDK types fully contained in `llm.ts`/`llm-stream.ts`. No leaks to callers. Web app has zero SDK knowledge.
- **Brief 039 complete (Web Foundation, 2026-03-25)** — Next.js 15 App Router in `packages/web/`. Streaming conversation with the Self via Vercel AI SDK `useChat` + custom data stream protocol. Engine streaming adapters: `src/engine/self-stream.ts` (Self async generator) + `src/engine/llm-stream.ts` (Anthropic/OpenAI/Ollama streaming + Claude CLI + Codex CLI subscription streaming). Route Handlers: `/api/chat` (Self streaming), `/api/events` (SSE harness events). Conversation UI: message list with Self indicator dot, auto-resizing prompt input, calm pulsing typing indicator. 6 shadcn/ui primitives (Button, Card, Dialog, Input, Tabs, ScrollArea). Design tokens from visual identity spec baked into `globals.css` (warm neutrals, terracotta accent, Inter font, 4px spacing grid, elevation shadows). Entry point: state-based routing — unconfigured → setup page, configured → full-screen conversation (workspace deferred to 042). Monorepo via `pnpm-workspace.yaml`. Lazy engine imports to avoid build-time DB conflicts. No engine internals leak to browser. 14 AC, all pass (AC14 visual QA needs human). Reviewed: PASS WITH FLAGS (2 must-fix fixed: error message leak, SSE cancel cleanup; 2 should-fix fixed: dead imports, pricing dedup). Approved 2026-03-25.
  - **Post-approval extension: LLM setup system + CLI subscription streaming.** Human feedback: subscription auth must be the primary connection path, not API keys. 5 connection methods: Claude CLI subscription, Codex/OpenAI CLI subscription, Anthropic API key, OpenAI API key, Ollama (local). Config persisted to `data/config.json`. Setup page at `/setup` with CLI auto-detection (shows "detected" badge when `claude`/`codex`/`ollama` available). `llm-stream.ts` extended with `streamClaudeCli()` (parses `claude -p --output-format stream-json` NDJSON) and `streamCodexCli()` (parses `codex exec --json` JSONL). `DITTO_CONNECTION` env var routes streaming to CLI subprocess vs API SDK. 27 new tests across 2 files (306 total, 22 test files). Provenance: OpenClaw model config patterns (JSON config, CLI auth, provider detection).
- **ADR-021 accepted (Surface Protocol, 2026-03-25)** — The Self emits `ContentBlock[]` instead of `response: string`. 13 typed content blocks (text, review_card, status_card, actions, input_request, knowledge_citation, progress, data, image, code, reasoning_trace, suggestion, alert). Per-surface renderers (web=React components, Telegram=inline keyboards, CLI=formatted prompts, API=raw JSON). Action callbacks via `handleSurfaceAction()` — single entry point, namespaced action IDs, session-scoped validation. Security: action registry, input validation, credential scrubbing. Graceful degradation: unknown blocks fall back to text. Relationship to ADR-009: process outputs appear inside content blocks. Insight-092 captured (engine output is a protocol, not a string). Reviewed: PASS WITH FLAGS (3 should-fix all fixed: missing block types for visual/code/reasoning added, security section added, reference docs expanded).
- **Architecture validation + integration auth design (approved 2026-03-24)** — Architect stress-tested architecture against 6 real businesses (Steven Leckie/real estate, Rawlinsons/QS, Delta Insurance, FICO/immigration, Abodo Wood/timber, Jay/clinical) with 33 processes. Key findings:
  - Architecture validates strongly — all 33 processes map to the process definition structure. Trust tiers, implicit feedback, conversation-first UX all hold across all domains.
  - 9 gaps identified (all extensions, not structural deficiencies): G1 document understanding (HIGH), G2 voice-to-text (MEDIUM), G3 file generation (MEDIUM), G4 deadlines/SLAs (MEDIUM), G5 entity-scoped instances (MEDIUM), G6 outcome feedback (MEDIUM), G7 cross-instance learning (MEDIUM), G8 data sensitivity classification (MEDIUM), G9 conversational integration auth (HIGH).
  - Integration auth reality designed: 4 auth types analysed (OAuth2, API key, CLI, MCP). API keys get email working day one. OAuth needs managed cloud infrastructure. Secure masked input for credential entry. Credential reuse via copy (global scope rejected). `needs_connection` process state with graceful degradation.
  - 3 new insights: 088 (document understanding is first-class gap), 089 (every process starts with an artifact), 090 (integration auth is a conversation moment).
  - Reports: `docs/research/architecture-validation-real-world-use-cases.md`, `docs/research/integration-auth-reality.md`.
  - Reviewed: PASS WITH FLAGS (both reports). All SHOULD-FIX flags addressed.
- **Self-driven workspace transitions UX spec (2026-03-25)** — `docs/research/self-driven-workspace-transitions-ux.md`. Defines the mechanism for how conversation with the Self drives workspace mode transitions. Context-shift events emitted by the streaming layer when Self tool calls imply a UI mode change (process-builder, artifact-review, process-detail, briefing, feed). 6 scenarios (quick question, process creation, output review, dev mode, mid-conversation escalation, trust upgrade decision). Conversation coexists with feed in centre column (no mode toggle, messages grow from input upward). Right panel reactivity via tool result detection (Phase 10) graduating to `context-shift` protocol events (Phase 11). Mobile: inline summaries + bottom sheets. Subsumes `artifact_focus` from output-as-artifact-ux.md. Reviewed: PASS WITH FLAGS (2 must-fix fixed: naming collision with artifact_focus reconciled, architecture.md Explore mode drift flagged; 4 should-fix fixed: Decide scenario added, session boundary behaviour defined, mobile breakpoints aligned, Nadia scenario grounded to defined context-shifts). Next: Architect to evaluate as Brief 045 extension or standalone brief.
- **Phase 10 design session (in progress, 2026-03-24)** — Major Designer session across two sub-sessions. Outputs:
  - **Session 1** — Visual identity, UI build strategy, interaction model:
    - Visual identity spec (`docs/research/visual-identity-design-system-ux.md` v2): Warm professional design system. Reviewed: PASS WITH FLAGS, fixed.
    - UI build strategy (`docs/research/ui-build-strategy-ux.md` v2): Strategy D (design tokens → HTML prototypes → reference-driven build → visual QA). Reviewed: PASS WITH FLAGS, fixed.
    - 7 early HTML prototypes (01-07) in `docs/prototypes/`. 28 reference images in `docs/references/`.
    - Real-world persona stress test. Self meta-processes spec.
    - 4 new insights: 079, 080, 081, 082. 2 new personas: Libby, Tim.
  - **Session 2** — Prototype-first design, full user journey (current):
    - **Prototype plan** (`docs/prototypes/PLAN.md`): 15 prototypes across 4 acts (Getting Started → Building Confidence → Trust Forming → Compound Effect). Sequenced into 4 sprints. Quality gates defined. Prototyping established as first-class gated process (Insight-084).
    - **6 new prototypes built**: P08 day zero, P09 first conversation with knowledge capture, P10 first output (trust moment), P11 workspace emerges, P12 morning mobile (Rob), P13 daily workspace (Rob desktop).
    - **3 new insights**: 083 (knowledge must be visible and traceable — provenance in outputs), 084 (prototyping is first-class process), plus research validated provenance gap across entire market.
    - **Research**: First-output review UX (`docs/research/first-output-review-ux.md`): 12+ products surveyed. Key finding: nobody shows knowledge provenance in outputs — Ditto's "based on" strip is genuinely novel. Edit-as-teaching also novel.
    - **Key design principles proven in prototypes**: (1) Knowledge visible everywhere — "based on" strip on outputs, knowledge panel/summary always accessible. (2) No chrome on day zero — workspace emerges from work. (3) Structure unfolds from chat, not configured. (4) Cognitive load on system, not user. (5) No jargon — zero mentions of agents, workflows, pipelines.
    - **Existing prototypes 01-07**: Archived or kept as reference. Superseded by journey-ordered P08-P13.
  - **Session 3** — Full journey prototypes + navigation architecture + composable UI pivot:
    - **13 journey prototypes** (P08-P20) covering day zero through compound effect. All at Draft v1. Navigation bar injected linking all prototypes. Index page at `docs/prototypes/index.html`.
    - **P13 (daily workspace) iterated 5 times** — through org-chart sidebar → flat list → pure nav links → three-column with Ditto right panel. Converged on: Left=navigation, Centre=canvas, Right=Ditto (alive, thinking, contextual), Bottom=chat input.
    - **Sidebar architecture explored**: Inbox/Your Work/Processes/Knowledge → simplified to: Home, Inbox, Tasks, Projects, Processes + workspace switcher. Key learning: sidebar is NAVIGATION to views, not a content index. Must scale to 50+ processes.
    - **Right column = Ditto** (not a chat panel): Always present, shows thinking for current context (what it checked, confidence level, knowledge used, similar past work), proactive suggestions. This IS the trust layer for human-in-the-loop verification.
    - **Critical pivot: Composable UI, not fixed pages** (Insight-086). Static prototypes hit their limit. Designing fixed pages contradicts Ditto's architecture — the Self should compose the UI dynamically from universal components. Next step: component catalog + composition model + interactive prototype.
    - **4 new insights**: 083 (knowledge visible and traceable), 084 (prototyping is first-class), 085 (six design gaps from v1 feedback), 086 (composable UI not fixed pages).
    - **Research**: First-output review UX (`docs/research/first-output-review-ux.md`): 12+ products surveyed. Provenance gap validated — nobody shows knowledge inputs in outputs. Edit-as-teaching is novel.
    - **Real-world test cases added to prototype plan** (from Architect session): Steven Leckie, Rawlinsons, Delta Insurance, FICO, Abodo, Jay/Status.
    - **Key design decisions proven**: (1) "Based on" provenance strip on every output. (2) Workspace emerges from work, not configured. (3) Chat bar persistent bottom-centre. (4) Items clearly typed ("Quote to review" not "Henderson bathroom"). (5) Ditto alive in right column with pulsing dot.
    - **What the 13 static prototypes become**: Composition references — visual targets for what specific Self-composed layouts should look like. P13=Home composition, P10=output review composition, P14=process detail composition, etc.
    - **Next steps**: Define universal component catalog (display + input primitives). Define composition model (how Self decides what to show). Build interactive React prototype demonstrating composable UI with click-through navigation.
- **Brief 037 complete** (Integration Generation: OpenAPI → Ditto YAML) — `ditto generate-integration` CLI command. `src/engine/integration-generator.ts` (~310 LOC): OpenAPI 3.x parse → $ref resolve → operation mapping → classify read/write → emit YAML. `src/cli/commands/generate-integration.ts` (~70 LOC). Dependencies: `@apidevtools/swagger-parser`, `openapi-types`. 22 new tests (279 total, 20 test files). Smoke test: Petstore spec → 19 tools, passes `pnpm cli sync`. Reviewed: PASS WITH FLAGS (2 flags fixed: PATCH skip warning added, `00-schema.yaml` updated with generation comment). Approved 2026-03-24.
- **Brief 036 complete** (Process I/O: Triggers + Output Delivery, Phase 6c-2) — `src/engine/process-io.ts`: polling-based triggers (`startPolling`/`stopPolling`/`stopAllPolling`/`getPollingStatus`), output delivery (`deliverOutput`). `source` and `outputDelivery` fields on `processes` table. Process loader: `ProcessSourceConfig`/`ProcessOutputDeliveryConfig` types, `validateProcessIo()` validates service references against registry. Heartbeat: `deliverOutput()` called after run completion (trust gate passed). Output delivery payload includes collected approved step outputs + delivery params. CLI: `ditto trigger start/stop/status` (14 commands total). `templates/invoice-follow-up.yaml` updated with `source:` (email check) and `output_delivery:` (accounting post). 10 new tests (257 total, 19 test files). Reviewed: PASS WITH FLAGS (5 flags, all fixed: resolveServiceAuth comment added, outputs passed to delivery, capture bypass documented, approved-only test added, result filtering improved). Approved 2026-03-23. Phase 6 complete.
- **Brief 035 complete** (Credential Vault + Auth Unification, Phase 6c-1) — `src/engine/credential-vault.ts`: AES-256-GCM encrypted credential storage, HKDF key derivation from `DITTO_VAULT_KEY`, per-(processId, service) scoping with UNIQUE constraint. Unified `resolveServiceAuth()`: vault-first, env-var fallback with deprecation warning. `credentials` table in schema. `processId` threaded through both execution paths: integration steps (`step-execution.ts` → `step-executor.ts` → `index.ts` → `cli.ts`/`rest.ts`) and tool use (`memory-assembly.ts` → `tool-resolver.ts` → `cli.ts`/`rest.ts`). `resolveAuth()` and `resolveRestAuth()` now async, backed by vault. CLI: `ditto credential add/list/remove` (masked input via @clack/prompts). 11 new tests (247 total, 18 test files). Reviewed: PASS WITH FLAGS (1 must-fix fixed: resolveServiceAuth silent catch; 2 should-fix fixed: UNIQUE constraint added, architecture.md + ADR-005 updated; 1 note acknowledged). Approved 2026-03-23.
- **Brief 025 complete** (Integration Tools + Agent Tool Use, Phase 6b) — Ditto-native integration tools (Insight-065): tool definitions in integration YAML, tool resolver (`src/engine/tool-resolver.ts`) maps `service.tool_name` → `LlmToolDefinition[]` + dispatch. REST handler (`src/engine/integration-handlers/rest.ts`): native fetch, auth injection, credential scrubbing. Memory-assembly handler resolves step tools → `HarnessContext.resolvedTools`. Claude adapter merges integration + codebase tools, dispatches via `executeIntegrationTool()`. `toolCalls` JSON field on stepRuns, recorded in both advance/pause paths. Process loader validates `service.tool_name` format against registry. GitHub integration: 4 CLI-backed tools. Slack integration: 2 REST-backed tools. MCP deferred (Insight-065). 18 new tests (236 total, 17 test files). Reviewed: PASS WITH FLAGS (1 must-fix fixed: REST success path credential scrubbing; 2 should-fix: REST error scrubbing fixed, architecture.md deferred to Documenter; 2 notes acknowledged). Approved 2026-03-23.
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

Tracked in `docs/debts/`. Run `pnpm cli debt` to list. Test-utils `createTables` SQL must be kept in sync with Drizzle schema manually (Flag 1 from review). `src/dev-session.ts` has duplicate `DATA_DIR` that should import from `paths.ts`. `src/engine/process-loader.ts` default dirs use `process.cwd()` — fine today but would need `PROJECT_ROOT` if web routes load processes directly. `llm-stream.ts` duplicates message/tool translation logic from `llm.ts` (DRY violation, no abstraction leak).

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
| Process output architecture (typed outputs, catalog-constrained views, trust-governed delivery, adopt json-render patterns) | ADR-009 v2 | Accepted |
| Attention model (3 modes, confidence, silence) | ADR-011 | Accepted |
| Context engineering, model routing, cost | ADR-012 | Accepted |
| Cognitive model (mode, feedback, escalation) | ADR-013 | Accepted |
| Agent cognitive architecture (toolkit, executive function, judgment hierarchy) | ADR-014 | Accepted |
| Meta process architecture (4 meta processes + cognitive framework environment) | ADR-015 | Accepted |
| Conversational Self (outermost harness, self memory scope, session persistence) | ADR-016 | Accepted |
| Delegation weight classes (Inline/Light/Heavy, Claude vs Claude Code, runtime resolution) | ADR-017 | Accepted |
| Standards library (quality profiles, baselines, risk thresholds, composition cascade) | ADR-019 | Accepted |
| Runtime process adaptation (template durable, run-scoped overrides, `adapt_process` tool, optimistic locking) | ADR-020 | Accepted |
| Surface protocol (19 typed content blocks, action callbacks, per-surface renderers, security model) | ADR-021 | Accepted (addendum 2026-03-27: +3 visual block types — ChecklistBlock, ChartBlock, MetricBlock) |
| Critical evaluation + homeostatic quality (failure patterns, orchestrator enrichment, conditional verification, multi-dimensional quality balance, cross-process correlation) | ADR-022 | Accepted |
| Artifact interaction model (ArtifactBlock, six universal viewers, artifact mode layout, security model) | ADR-023 | Proposed |
| Composable workspace architecture (Scaffold/Canvas/Evolvable three-tier model, composition intents, block library as vocabulary) | ADR-024 | Accepted |

## Active Briefs

| Brief | Phase | Status |
|-------|-------|--------|
| 037 — Phase 10 MVP Dashboard (old draft) | 10 | Superseded by Brief 038 |
| 038 — Phase 10 MVP Architecture (parent) | 10 | **Approved 2026-03-25.** Parent brief + 6 sub-briefs (039-044). 89 ACs total. Build order: 039 → (040 ∥ 041) → (044 ∥ 042 ∥ 043). |
| 039 — Web Foundation | 10a | **Complete 2026-03-25.** 14/14 AC pass (AC14 visual QA needs human). Reviewed: PASS WITH FLAGS (4 flags, all fixed). |
| 040 — Self Extensions | 10b | **Complete 2026-03-25.** 15/15 AC pass. Reviewed: PASS WITH FLAGS (5 flags, all fixed). |
| 041 — Feed & Review | 10c | **Complete 2026-03-25 + upgraded 2026-03-25.** 17 AC (was 15; +2 from Hark patterns: decision output variant, Markdown/text export). Reviewed: PASS WITH FLAGS (2 flags, all fixed). |
| 042 — Navigation & Detail | 10d | **Complete 2026-03-25.** 17/17 AC pass. Reviewed: PASS WITH FLAGS (4 flags: 1 medium fixed, 3 low accepted for MVP). |
| 043 — Proactive Engine | 10e | **Complete 2026-03-25.** 11/11 AC pass. Reviewed: PASS WITH FLAGS (2 fixed: reorder guard, suggest_next dimensions). |
| 044 — Onboarding Experience | 10f | **Complete 2026-03-25.** 16/16 AC pass. Reviewed: PASS WITH FLAGS (2 critical fixed: reorder guard, UI component wiring). ADR-020 accepted pre-build. |
| 045 — Component Protocol | 10g | **Complete 2026-03-25.** 17/17 AC pass. |
| 047 — Composition Engine | ADR-024 | **Complete 2026-03-28.** 17/17 AC pass. Reviewed: PASS WITH FLAGS (5 flags, all fixed). |
| 048 — Artifact Mode Layout | ADR-024 | **Complete 2026-03-29.** 11/11 AC pass. Reviewed: PASS WITH FLAGS (4 P1s all fixed). Approved. |
| 062 — Conversation Experience Activation | 11 | **Approved 2026-03-31.** 15 AC. Conversation chrome + message queueing. Reviewed: APPROVE WITH FLAGS (4 flags, all fixed). **On hold** — reassess after 069/070 (Insight-131). |
| 063 — Block Renderer Polish | 11 | **Approved 2026-03-31.** 11 AC. Tier 2 → Tier 1 visual quality for 7 block renderers. Reviewed: APPROVE WITH FLAGS (10 flags, all fixed). Ready to build. Can run in parallel with 070. |
| 066 — Conversation Polish Layer | 11 | **Draft 2026-04-01.** 14 AC. Message animations, hover actions, empty state. Lower priority — polish after blocks appear. |
| 067 — Reasoning Verification Evidence | 11 | **Superseded by Brief 070.** Activity header reframe absorbed into three-level progressive disclosure. |
| 069 — Rich Block Emission | 11 | **Approved 2026-04-01.** 15 AC. Expand toolResultToContentBlocks for all 19 Self tools. Reviewed: PASS WITH FLAGS (4 flags, all fixed). Ready to build. |
| 070 — Activity Progressive Disclosure | 11 | **Approved 2026-04-01.** 12 AC. Three-level activity display. Depends on 069. Reviewed: PASS WITH FLAGS (4 flags, all fixed). Ready to build after 069. |

## Next Steps

1. **Phase 11 Chat UX — Block emission pivot (Insight-131).** Build order:
   - **Brief 069 (Rich Block Emission)** — first priority. Makes all 19 Self tools produce appropriate ContentBlocks. Engine-side only.
   - **Brief 070 (Activity Progressive Disclosure)** — second. Three-level activity display. Depends on 069.
   - **Brief 063 (Block Renderer Polish)** — can run in parallel with 070. More impactful now that blocks appear.
   - **Brief 062 (Conversation Experience Activation)** — on hold. Reassess message queueing and chrome after 069/070.
   - **Brief 066 (Conversation Polish Layer)** — lower priority polish. After blocks and activity are right.
2. **Next viewer work:** Live Preview viewer as extension seam (ADR-024, Insight-104) → remaining viewers → Self-driven composition (Phase 11+).
3. **Brief 049 (Automaintainer Process) in draft.** Phase 11+ work. 2 P1s pending resolution.
   - AI coaching embedded in workflow, never blocking
4. **Standards Library — ADR-019 accepted.** Build brief needed for Phase 10 MVP integration (deferred — quality profiles render but don't execute in Phase 10).
5. **Integration generation follow-ups:** LLM-assisted curation, PATCH method, generate 2-3 real integrations (Stripe, Xero, HubSpot).
6. **Insight-064 active:** Benchmark Before Keep — metacognitive check handler must prove its value after 50 supervised runs.
7. **STILL NEEDED:** Architecture.md babushka diagram + Layer 2 execution model rewrite.
8. **Planned:** PM triages whether process-analyst system agent should move from Phase 11 to Phase 7-8 (Insight-047).
8b. **Planned:** Process Model Library (Insight-099) — abstract action taxonomy + binding resolution needs ADR when Phase 11 design begins. Extends ADR-005, ADR-008, ADR-019.
9. **Deferred:** Brief 016 AC17 (Telegram event subscription) — follow-up after live engine validation.
10. **Deferred:** Cognitive model fields (ADR-013) — deferred to Phase 8.
11. **Deferred:** Attention model extensions (ADR-011) — digest mode, silence-as-feature. Needs 3+ autonomous processes.
12. **Planned:** Knowledge lifecycle meta-process design (Insight-042)
13. **Insight-058/059:** Repos are process targets. Processes need context bindings.

## Documenter Retrospective (2026-03-29 — Briefs 048-051 Approval + Documentation)

**What was produced this session:**
- Brief 048 (Artifact Mode Layout) approved and moved to `docs/briefs/complete/`
- State.md and roadmap.md updated to reflect all recently completed work (Briefs 048-051)
- Stale Next Steps cleaned: corrected test count (330→377), removed incorrect Brief 049 "Live Preview Viewer" reference, consolidated completion status

**What worked:**
- The Builder's pre-approval state update (from the build session) meant the Documenter only needed to finalize status markers and fix staleness — no major rewrites needed
- Brief 048's review flags were all fixed before approval, clean handoff

**What surprised:**
- Next Steps section had accumulated drift: Brief 049 was labeled "Live Preview Viewer" (old naming from when 049 was planned for that) but the actual Brief 049 is "Automaintainer Process". This kind of naming drift in planning docs is a recurring pattern — the PM should audit Next Steps during each triage.
- Test count was stale in multiple places (330 vs actual 377 after Brief 051's 47 new tests)

**What to change:**
- Each Brief's approval/completion should trigger a staleness sweep of the Next Steps section, not just the specific brief entry
- Brief status labels should use consistent vocabulary: "done" not mix of "built"/"approved"/"complete"

---

## Documenter Retrospective (2026-03-25 — Process Model Library Insight)

**What was produced this session:**
- Insight-099: Process Model Library with App-Binding Customisation
- Reviewer report (PASS WITH FLAGS, 6 flags, 4 moderate fixed)

**What worked:**
- The Architect found rich existing primitives to build on — templates (ADR-008), quality profiles (ADR-019), integration registry (ADR-005), runtime adaptation (ADR-020) already support 80% of the concept. The insight correctly identifies one genuine gap (abstract action binding) rather than proposing a new system from scratch.
- The reviewer's challenge to define Process Model as a template variant (not a new artifact type) was exactly right — it avoids concept proliferation.
- The draft taxonomy (14 actions across 5 categories) grounded the abstract action concept and validated feasibility.

**What surprised:**
- How much of the idea was already partially designed. ADR-008 templates + ADR-019 quality profiles + ADR-005 integrations just needed a composition concept and one abstraction (abstract actions) to unify them.
- The insight connects to almost every future phase — onboarding (Brief 044), community intelligence (Insight-078), risk detection (Insight-077), process articulation (Insight-047). It's a load-bearing concept for the product strategy.

**What to change:**
- When this moves to ADR, the abstract action taxonomy needs validation against real integration definitions (not just the draft). Test against 3-4 actual vendor APIs per category.
- The Phase 11 scope is getting heavy — process-analyst, onboarding-guide, process-discoverer, AND now Process Model adoption flow. PM should triage.

**Insight audit:**
- No insights ready to archive this session. Insight-099 is new and active.
- Insight-078 (Standards Library) and Insight-047 (Outcome Owners) remain active — Insight-099 extends both but doesn't subsume them.

**Reference doc audit:**
- `docs/roadmap.md` — no milestone reached, no update needed. Phase 11 scope note is a PM triage item, not a roadmap change.
- `docs/architecture.md` — no update needed yet. Process Models will need architecture.md updates when the ADR is written (not at insight stage).
- `docs/landscape.md` — no new tool evaluations this session.

## Documenter Retrospective (2026-03-25 — ADR-021 Surface Protocol)

**What was produced this session:**
1. User asked whether the engine is truly separate from the UI. Architect confirmed yes — engine is surface-agnostic today.
2. User followed up: what does the engine actually emit? How would Telegram or another app interpret outputs? This revealed the gap — `selfConverse()` returns a plain string.
3. Architect produced ADR-021 (Surface Protocol). 13 typed content blocks, per-surface renderers, action callback model, security model. Reviewed: PASS WITH FLAGS (3 should-fix all fixed: missing block types for visual/code/reasoning, security section for third-party consumers, expanded reference doc list).
4. Insight-092 captured (engine output is a protocol, not a string).
5. Documenter fixed Insight-090 numbering collision: integration-auth stays 090, onboarding renumbered to 093. Updated 6 files (briefs 038, 040, 043, research reports).

**What worked:**
- **User's question was the design trigger.** A seemingly simple verification question ("is the engine separate from the UI?") led to examining the actual output contract, which revealed a genuine architectural gap. This is the consultative framing working correctly — the Architect didn't assume the question was answered, but traced through the actual code to see what the engine really emits.
- **Research grounded the design.** Five cross-surface systems surveyed (Adaptive Cards, Slack Block Kit, Telegram, Vercel AI SDK, Discord). The key pattern — semantic blocks with host-controlled rendering (Adaptive Cards) + typed tool-to-component mapping (Vercel AI SDK) — was a genuine synthesis, not an obvious choice.
- **Review caught real gaps.** Missing block types for visual/code/reasoning trace outputs (architecture's Output Viewer has 6 presentation types), and the security implications of action callbacks for third-party API consumers. Both materially improved the ADR.

**What surprised:**
- **The Insight-090 collision was still present.** State.md claimed numbering was fixed but the collision (two files named 090-*) was still on disk. The coordination mechanism from the previous retro wasn't applied. This is the fourth numbering collision caught.

**What to change:**
- **Insight numbering audit should be in the Documenter checklist.** Every session, check `ls docs/insights/[0-9]*.md | sort` for duplicates. Don't trust prior session claims that collisions are fixed.
- **ADR-021 follow-up needed.** The implementation brief for ContentBlock types should be written before or alongside the Phase 10 build — it affects how Brief 040 (Self Extensions) produces output and how Brief 041 (Feed & Review) consumes it. PM should triage sequencing.

**Cross-cutting audit flags:**
- Insight-090 collision: RESOLVED this session. Integration-auth = 090, onboarding = 093. 6 files updated.
- Pre-existing 071/072 collision: STILL UNRESOLVED. Needs cleanup next session.
- ADR-021 reference doc updates (architecture.md, human-layer.md, ADR-016, ADR-009): Noted in ADR, deferred to implementation brief.

## Documenter Retrospective (2026-03-24 — Architecture Validation + Integration Auth Design)

**What was produced this session:**
1. Human provided 6 real businesses with 33 processes as stress test cases for Ditto's architecture.
2. Architect produced architecture validation report (`docs/research/architecture-validation-real-world-use-cases.md`). Layer-by-layer analysis, 9 gaps identified. Reviewed: PASS WITH FLAGS (6 flags, 3 SHOULD-FIX all addressed).
3. Human asked follow-up: "Does Ditto handle integration auth during process creation?" Architect identified this as a significant gap.
4. Architect produced integration auth design (`docs/research/integration-auth-reality.md`). 4 auth types × 2 deployment tracks. Phased delivery. Reviewed: PASS WITH FLAGS (6 flags, 3 SHOULD-FIX all addressed).
5. 3 new insights captured (088-090). Documenter caught and fixed numbering collision with Designer Session 3's insights (085-087).

**What worked:**
- **Real-world use cases revealed real gaps.** The human's stress test cases exposed G1 (document understanding) and G9 (conversational integration auth) as HIGH severity gaps that were invisible when only looking at the dev pipeline dogfood. Validating against real businesses is more valuable than validating against architecture abstractions.
- **Architecture held up.** All 33 processes mapped to the process definition structure. All 9 gaps are extensions, not structural deficiencies. The six-layer model, process primitive, and trust tiers are robust across diverse domains. This is strong validation.
- **The human's follow-up question was load-bearing.** The integration auth gap (G9) was flagged in the validation report but only at surface level. The human's "think through the reality" prompt forced genuine design work — OAuth registration, deployment track implications, secure credential input, phased delivery. This is exactly how the review loop should work: architecture → human challenge → deeper design.
- **Review loop caught real issues.** Data sensitivity (G8) was missed by the Architect, caught by Reviewer. Global credential scope was correctly challenged and rejected. Secure credential input was flagged. The review process added genuine value.

**What surprised:**
- **Insight numbering collisions.** Three separate sessions (two Designer sessions + this Architect session) created insights 085-087 independently, producing 6 files with 3 duplicate numbers. Pre-existing collisions at 071/072 too. The brief numbering convention (sequential, never letter suffixes) works for briefs because they go through a single Architect. Insights are created by multiple roles across sessions — the sequential numbering scheme needs a coordination mechanism or a different approach.
- **API keys cover more ground than expected.** The initial assumption was OAuth everywhere. The reality: API keys get email working day one for most businesses. OAuth is primarily for premium Gmail and social media. This pragmatic finding enabled a cleaner MVP phasing.

**What to change:**
- **Insight numbering needs a coordination mechanism.** Options: (a) check `ls docs/insights/*.md | tail -1` before creating new insights, (b) use a counter file, (c) use date-based numbering (YYYYMMDD-N). The current convention assumes sequential creation without collision. This has now failed three times. The Architect role command should include "check the latest insight number before creating new ones."
- **Architecture validation should become a periodic practice.** This stress test was the first. It should happen whenever new use cases emerge or after major architecture changes. Consider making it a system process — the meta-process pattern applied to architecture itself.
- **ADR-005 needs a Section 6** (Connection Setup) capturing the integration auth design. This was identified but deferred to when the Phase 10 brief is written. Don't lose track of this.

**Cross-cutting audit flags:**
- ADR-005: needs Section 6 (Connection Setup) — deferred to brief writing (Architect action)
- Integration registry schema (`00-schema.yaml`): needs `connection:` section — deferred to brief writing (Architect action)
- Insight numbering: 2 pre-existing collisions (071/072) need cleanup. 085-087 collision resolved (renumbered to 088-090). **Action for next session:** clean up 071/072 collision.
- Architecture.md: no changes needed from this session's work (gaps are flagged via insights, not embedded in architecture.md yet)
- Dictionary.md: no new terms introduced
- Roadmap.md: no milestone reached — no update needed

## Documenter Retrospective (2026-03-24 — Brief 037 Build / Integration Generation)

**What was produced this session:**
1. PM triaged post-Phase 6 work. Recommended Phase 10 Dashboard as #1, Integration Generation as #2. Human overrode: Integration Generation first (dashboard research still in progress).
2. Architect designed Brief 037 (Integration Generation: OpenAPI → Ditto YAML). Single brief, 16 ACs, one subsystem. Reviewed: PASS WITH FLAGS (2 SHOULD-FIX fixed). Approved.
3. Builder implemented Brief 037: `src/engine/integration-generator.ts` (~310 LOC), `src/cli/commands/generate-integration.ts` (~70 LOC), 22 new tests. Build reviewed: PASS WITH FLAGS (MUST-FIX: PATCH skip + SHOULD-FIX: 00-schema.yaml — both fixed).
4. Smoke test: Petstore spec → 19 tools generated, passes `pnpm cli sync`. 279 tests total (20 files).

**What worked:**
- **Research→Design→Build pipeline was clean.** Research was already done (`api-to-tool-generation.md`). The Architect had a clear blueprint. The Builder implemented in one pass with no ambiguities. The generate-then-curate pattern from Neon was the right design choice — no over-engineering.
- **Existing integration registry was the acceptance test.** The constraint "generated YAML must pass `validateIntegration()` without modification" made the goal concrete. The test that round-trips through emit→parse→validate is the right integration test.
- **Brief sizing was perfect.** 16 ACs, one subsystem (~380 LOC total including tests), one focused session. No sub-briefs needed.

**What surprised:**
- **PATCH gap.** The integration registry validator only accepts GET/POST/PUT/DELETE — no PATCH. This was not flagged during the Architect's design because the registry types were written during Phase 6 when hand-written integrations didn't need PATCH. The Reviewer caught this at build time. This is a known debt: adding PATCH to the registry validator is a small engine change for a future brief.
- **Long descriptions from verbose specs.** The Petstore spec has a multi-paragraph `info.description`. The generator faithfully includes it, producing a very long `description:` line. Not a bug — the generate-then-curate model handles it — but worth noting for UX when LLM-assisted curation is added.

**What to change:**
- **ADR-005 needs a "Creation Path" section.** The ADR currently describes how integrations are *consumed* (registry, protocols, auth) but is silent on how they're *created*. Insight-071 flagged this; Brief 037 delivered the first creation path. The Architect should update ADR-005 next session.
- **Architecture.md Layer 2 integration section** needs the same "creation path" addition (Insight-071 "Where It Should Land").

**Cross-cutting audit flags:**
- ADR-005: missing creation path section (Architect action)
- Architecture.md: Layer 2 integration section doesn't mention generation (Architect action)
- Insights 071+072: partially delivered (generation exists) but not absorbed — remain active until doc updates land

## Documenter Retrospective (2026-03-23 — Brief 036 Build / Phase 6 Completion)

**What was produced this session:**
1. Builder implemented Brief 036: `src/engine/process-io.ts` (polling triggers, output delivery), `ProcessSourceConfig`/`ProcessOutputDeliveryConfig` types, `validateProcessIo()`, `source`/`outputDelivery` DB columns, heartbeat hook for output delivery after run completion, `ditto trigger start/stop/status` CLI commands, `templates/invoice-follow-up.yaml` updated with source + output_delivery. 10 new tests (257 total, 19 test files).
2. Builder review: PASS WITH FLAGS (5 flags, all fixed: resolveServiceAuth comment added, outputs passed to delivery handler, capture bypass documented as intentional, approved-only test added, result filtering improved from single-key check to any-truthy-value).
3. Brief 036 moved to `docs/briefs/complete/`. Parent briefs 023 + 026 also moved — Phase 6 fully complete.
4. Roadmap Phase 6 "Process I/O" section updated with done statuses.
5. Dictionary: "Process I/O" entry added.
6. State.md: Phase 6 completion reflected across all sections (current phase, active briefs cleared, What's Working updated, CLI count → 14, test count → 257/19).

**What worked:**
- **The brief was well-scoped.** Process I/O is the kind of feature that could sprawl (webhooks, rich output schemas, event-driven triggers) but the brief constrained it to polling + delivery with clear non-goals. This let the Builder execute in a single pass.
- **Reviewer caught real issues.** Flag #2 (outputs not passed to delivery handler) was a functional gap — the delivery call was structurally correct but would have sent empty payloads to external systems. Five flags total, all addressable without rework.
- **Transitive architecture worked.** The existing integration handler infrastructure (executeIntegration → protocol handlers → resolveServiceAuth) meant process-io.ts didn't need to duplicate any auth logic. The same code path that handles integration steps handles triggers and delivery.

**What surprised:**
- **Phase 6 is done.** Four briefs (024, 025, 035, 036) plus ADR-005 over a single extended session. The integration layer went from nothing to registry + CLI handler + REST handler + tools + credential vault + polling + delivery. The sub-phasing strategy (along dependency seams) was correct — each brief was buildable without rework.

**What to change:**
- **The `command` field as data carrier is a debt.** Output delivery encodes its payload as JSON appended to the command string because `IntegrationStepConfig` has no data payload field. This works but is inelegant — a `payload` or `data` field on the config would be cleaner. Not worth an ADR but should be cleaned up when the integration interface next evolves.
- **No insight captured this session.** The work was execution-focused — the design decisions were all made in ADR-005 and the brief. This is expected for the final sub-brief in a well-designed phase.

---

## Documenter Retrospective (2026-03-23 — Integration Generation Architecture)

**What was produced this session:**
1. Architect evaluated Ditto's ability to drive external applications natively — three scenarios analyzed (platforms Ditto didn't build, platforms another agent built, platforms Ditto built).
2. Insight-071 captured: No Hand Authoring — generation is the creation path for both integrations and processes. YAML is intermediate representation, not user interface.
3. Research report produced: `docs/research/api-to-tool-generation.md` — API spec→tool generation (Composio, LangChain, Taskade, FastMCP, Neon), source code→API discovery (tsoa, fastify-swagger, Prisma), agent-as-operator platforms. 30+ sources.
4. Insight-072 captured: Sufficiently Detailed Spec Is Code — generation must consume structured sources (OpenAPI, code analysis, templates), not natural language alone. Grounded by external blog post.
5. MCP vs CLI landscape research added to report — validates ADR-005 CLI-first approach and Insight-065 MCP deferral. Perplexity, Cloudflare, Scalekit benchmarks all confirm CLI advantage.

**What worked:**
- Architect → Researcher → Architect pipeline worked cleanly. Research ran in background while conversation continued.
- User's provocation ("no one writes by hand") immediately sharpened the architectural question from "is the integration layer right?" to "where's the generation layer?"
- External blog post (Haskell for All) provided theoretical grounding for a practical design constraint.

**What surprised:**
- The MCP backlash is stronger than expected. Perplexity's 72% context waste finding is striking. ADR-005's CLI-first approach was prescient.
- The generation layer is smaller than expected (~200 LOC for core OpenAPI→YAML codegen). The hard part is curation, not generation.
- Insight-071 and 072 are tightly coupled — together they say "automate creation AND use structured sources." Neither alone is complete.

**What to change:**
- The roadmap doesn't yet have a slot for integration/process generation. PM should triage where it lands (post-Phase 6 brief, or part of Phase 7).
- Research README needs updating with the new report.

---

## Documenter Retrospective (2026-03-23 — Brief 035 Build)

**What was produced this session:**
1. Builder implemented Brief 035: credential-vault.ts (encryption, storage, resolveServiceAuth), credentials table (schema + test-utils), CLI credential commands (add/list/remove), vault-backed auth in CLI + REST handlers, processId threading through both execution paths (integration steps + tool use). 11 new tests (247 total, 18 test files).
2. Builder review: PASS WITH FLAGS (1 must-fix fixed: resolveServiceAuth silent catch; 2 should-fix fixed: UNIQUE constraint, architecture.md + ADR-005 updated; 1 note acknowledged).
3. Brief 035 moved to `docs/briefs/complete/`.
4. Architecture.md credential scoping language updated. ADR-005 Section 3 updated with post-implementation note.
5. Dictionary.md: "Credential Vault" entry added.

**What worked:**
- **The brief was exceptionally detailed.** The "What Changes" table listed every file with specific actions, making implementation nearly mechanical. The processId threading diagram (which files pass to which) eliminated guesswork.
- **Reviewer caught a real issue.** The `resolveServiceAuth()` try/catch silently swallowing missing `DITTO_VAULT_KEY` would have been a subtle bug in production — the system would appear to work while silently using env vars instead of vault credentials.
- **The UNIQUE constraint catch was valuable.** The brief specified it, the Builder missed it, the Reviewer caught it. Three eyes on the same work product.

**What surprised:**
- **Async migration was smooth.** Converting `resolveAuth()` and `resolveRestAuth()` from sync to async (because vault operations are async) required updating existing tests but caused no cascading issues. The adapter pattern isolated the change well.

**What to change:**
- **Nothing structural.** The brief quality drove clean execution. The "STILL NEEDED: architecture.md + ADR-005" items from the Brief 025 retro are now resolved — Brief 035 addressed them as part of its own work products.

---

## Documenter Retrospective (2026-03-23 — Brief 025 Build)

**What was produced this session:**
1. Architect revised Brief 025 (MCP → Ditto-native tools, Insight-065). Reviewed PASS WITH FLAGS (5 flags, all addressed).
2. Builder implemented Brief 025: tool-resolver.ts, rest.ts handler, integration-registry tools support, process-loader validation, harness plumbing, Claude adapter tool merging, stepRuns.toolCalls. 18 new tests (236 total, 17 test files).
3. Builder review: PASS WITH FLAGS (1 must-fix fixed: REST success path credential scrubbing).
4. Insight-065 captured and archived (fully absorbed by Brief 025).
5. GitHub integration extended with 4 CLI-backed tools. Slack integration created with 2 REST-backed tools.
6. Brief 025 moved to `docs/briefs/complete/`.

**What worked:**
- **The PM's challenge was essential.** Asking "is MCP the right model?" before building saved significant rework. The 031→032→033 execution model changes had invalidated the original MCP approach. Without the challenge, we'd have built MCP passthrough that conflicted with multi-provider support.
- **Insight-first design.** Capturing Insight-065 before rewriting the brief made the rationale durable and reviewable. The Architect had a clear principle to design against.
- **The tool resolver pattern is clean.** Integration tools follow the same `LlmToolDefinition` pattern as codebase tools — no special paths, no provider-specific code. The `executeIntegrationTool` dispatch function keeps execution behind a single interface.

**What surprised:**
- **The REST handler credential scrubbing gap.** The reviewer caught that the success path returned unscrubbed response text while the error path was correctly scrubbed. Same pattern, different paths, different treatment. Worth watching in future handlers.

**What to change:**
- **Architecture.md and ADR-005 still need updates.** The Reviewer flagged these as should-fix. The brief's After Completion section lists them. They should happen next session or as part of the next Documenter run.
- **Insight count tracking is fragile.** Manually counting active/archived insights in state.md is error-prone. The Documenter keeps adjusting these numbers. Consider a script or `ls | wc -l` approach.

---

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
