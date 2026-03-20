# Agent OS — Current State

**Last updated:** 2026-03-20
**Current phase:** Phase 4a **complete** (work items + CLI infrastructure). Phase 4b (human steps + capture) next.
**Major reframe (ADR-010):** Workspace interaction model adopted. Architecture and roadmap updated.

---

## What's Working

- **Storage (SQLite)** — Postgres replaced with SQLite via better-sqlite3 + Drizzle ORM. Zero-setup: `pnpm install` → `pnpm cli sync` works on fresh clone. WAL mode enabled. DB auto-created at `data/agent-os.db`. ADR-001 written.
- **Process definitions** — 5 YAML processes in `processes/`. Two use parallel groups (code-review, self-improvement). All parse and sync cleanly.
- **Claude adapter** — `src/adapters/claude.ts` with 10 role-based system prompts. Tool use: when step inputs include repository/document sources, adapter includes read_file/search_files/list_files tools and handles tool_use loop (max 25 calls). Provenance: Claude Code tool patterns + Claude API tool_use.
- **Script adapter** — `src/adapters/script.ts` handles deterministic steps with on_failure.
- **Process loader** — `src/engine/process-loader.ts` parses YAML including `parallel_group` containers and `depends_on` declarations. Validates dependencies (no circular deps, all targets exist). Exports named `StepDefinition`, `ParallelGroupDefinition`, `StepEntry` types.
- **CLI (Phase 4a)** — Rewritten from switch-statement to citty framework. 11 commands: `sync`, `start`, `heartbeat`, `status`, `review`, `approve`, `edit` (alias), `reject`, `trust` (with `accept`/`reject`/`override`/`--simulate`), `capture`, `debt`. TTY-aware, `--json` on listing commands. `@clack/prompts` for interactive input. All backward compatible.
- **Work items (Phase 4a)** — `workItems` table per ADR-010: type (question/task/goal/insight/outcome), status (intake/routed/in_progress/waiting_human/completed/failed), content, source, goalAncestry, assignedProcess, spawnedFrom, spawnedItems, executionIds, context, timestamps. `pnpm cli start` creates a work item of type `task` linked to the process run. Schema supports conditional flow per Insight-039 (no fixed-sequence assumptions).
- **Harness pipeline** — `src/engine/harness.ts` with `HarnessPipeline` class. 5 handlers: memory-assembly → step-execution → review-pattern → trust-gate → feedback-recorder. Chain-of-responsibility pattern (Sim Studio provenance).
- **Trust gate** — 4 tiers: supervised (always pause), spot-checked (~20% deterministic SHA-256+salt sampling), autonomous (advance unless flagged), critical (always pause, canAutoAdvance=false). Original pattern.
- **Review patterns** — `src/engine/harness-handlers/review-pattern.ts`. Three composable patterns: maker-checker (antfarm provenance), adversarial (prompting layer), spec-testing (Original). Retry logic with feedback injection. Model-aware cost tracking.
- **Memory system** — `memories` table per ADR-003. Memory assembly loads agent-scoped + process-scoped memories, sorts by reinforcement/confidence, budgets by token count, renders as structured text. Feedback-to-memory bridge creates correction memories on edit/reject with dedup/reinforcement.
- **Harness decision recording** — `harnessDecisions` table. Every step execution produces a harness decision record + activity record. Review cost tracked per decision.
- **Parallel execution** — `Promise.all` for parallel groups (Mastra provenance). `depends_on` resolution with cycle detection. Each parallel step goes through full harness pipeline independently. Group-fail-if-any-fails semantics.
- **Heartbeat** — `src/engine/heartbeat.ts` routes all execution through harness pipeline. Dependency resolution via `findNextWork()`. Supports sequential (backward compatible) and parallel execution modes.
- **Debt tracking** — `docs/debts/` with numbered markdown files and YAML frontmatter. `pnpm cli debt` lists deferred items by severity. `pnpm cli status` shows debt summary.
- **Trust data & scoring (Phase 3a)** — `src/engine/trust.ts` computes trust state from sliding window (default 20 runs) over `feedback` + `harnessDecisions` + `stepRuns`. `src/engine/trust-diff.ts` computes word-level structured diffs via jsdiff with edit severity classification (WikiTrust thresholds). `trustChanges` table for immutable tier transition audit trail. CLI: `pnpm cli trust <process>` shows trust metrics, `pnpm cli approve --edit` opens $EDITOR with structured diff capture, `pnpm cli reject` records rejections. Trust state cached in `processes.trustData`. All 14 AC pass.
- **Trust actions & decisions (Phase 3b)** — Trust tiers are now dynamic. `src/engine/trust-evaluator.ts` runs after every feedback record, checking upgrade eligibility (conjunctive) and downgrade triggers (disjunctive). `trustSuggestions` table for upgrade proposals. Upgrade: system suggests, human accepts/rejects via `pnpm cli trust accept/reject`. Downgrade: auto-executes to supervised, human can override via `pnpm cli trust override` (break-glass with escalation after 3). Grace period: 5 runs after upgrade, safety valve at 50%. Simulation: `pnpm cli trust <process> --simulate <tier>` replays sampling decisions. `canAutoAdvance=false` enforced for critical tier in CLI approve. Sub-window metrics (last 10 runs) for downgrade triggers. `SPOT_CHECK_RATE` shared constant. ADR-007 written. All 16 AC pass.
- **Governance scaffolding** — All Phase 0 docs complete. Agent identity fields in schema.
- **Review loop** — Tested 11 times across all phases. Found real issues each time (Phase 3b: window size mismatch for sub-window metrics, dead import, magic number duplication).
- **Agent tools** — `src/engine/tools.ts`. Three read-only codebase tools: `read_file`, `search_files`, `list_files`. Path traversal prevention (resolve + realpath). Secret file deny-list. Token budget (500 lines/read). Provenance: Claude Code Read/Grep/Glob patterns.
- **DB schema enforcement** — `pnpm cli sync` runs `drizzle-kit push` before syncing process definitions. Handles both first-run (creates all tables) and schema evolution (diffs and applies changes). No manual migration needed.
- **Development process** — 7 meta-roles as Claude Code skills (ADR-004: added Dev Designer). Brief template with status/depends_on/unlocks metadata, mandatory UX section, and mandatory Smoke Test section. Insights system (20 active, 15 archived — lifecycle-managed per Insight-021/022). Research system (9 reports). Debt system (4 items). Review checklist expanded to 11 points (added point 11: Execution Verification). Conditional handoffs: skills determine next steps based on output type, not hardcoded pipeline (Insight-018, absorbed). Artifact lifecycle management: briefs in `complete/` subfolder, insights audited and archived by Documenter, no duplicate numbering. QA/testing responsibility explicitly distributed: Builder owns execution (`pnpm test`, smoke test, test authoring), Reviewer verifies evidence (Insight-038). QA role re-entry at Phase 10.

## What Needs Rework

- **CLI** — `src/cli.ts` is generic CRUD. Phase 4 (Workspace Foundation) will rewrite around work items, meta-processes, and human steps.
- **Architecture "First Implementation" section** — still frames everything in terms of processes, not work items. Update when Phase 4 brief is written.

## In Progress

- **Phase 4 briefs approved by Architect** — Parent brief (011) and sub-brief 4a (012) approved. Sub-briefs 4b (013) and 4c (014) refined with reviewer findings addressed (correctionPattern population specified, trust-evaluator bootstrap resolved). All briefs reviewed: FLAG → findings resolved. Next: `/dev-builder` with Brief 012.
- **Phase 4a research validation** — Complete. All Brief 012 inputs verified, no gaps. Report at `docs/research/phase-4a-research-validation.md`.
- **Phase 4 design assessment** — Complete (reviewed, PASS WITH NOTES, findings addressed). Report at `docs/research/phase-4-design-assessment.md`.

## What's Blocked

Nothing. Phase 4 (Workspace Foundation) is next.

## Known Debt

Tracked in `docs/debts/`. Run `pnpm cli debt` to list all deferred items.

## Decisions Made

| Decision | ADR | Status |
|----------|-----|--------|
| SQLite via Drizzle + better-sqlite3 | ADR-001 | **Done** |
| Research reports as durable artifacts | ADR-002 | **Proposed** — awaiting formal approval |
| Memory architecture (two-scope, no vectors, phased implementation) | ADR-003 | **Done** — Phase 2b scope implemented, Phase 3 scope documented |
| Harness as middleware pipeline | Phase 2a | **Done** — 5 handlers, chain-of-responsibility |
| Trust gate (4 tiers, deterministic sampling) | Phase 2a | **Done** — Original pattern |
| Review patterns (composable layers) | Phase 2b | **Done** — maker-checker, adversarial, spec-testing |
| Parallel execution via Promise.all | Phase 2c | **Done** — Mastra provenance |
| Declarations vs state (Insight-007) | — | Active insight — files for declarations, tables for state |
| Dev Designer as 7th development role | ADR-004 | **Accepted** — skill contract, doc updates, review checklist point 9 |
| Trust earning algorithm (fixed window, conjunctive/disjunctive, grace period) | ADR-007 | **Accepted** — see `docs/adrs/007-trust-earning.md` |
| Integration architecture: multi-protocol, multi-purpose | ADR-005 | **Proposed** — see `docs/adrs/005-integration-architecture.md` |
| Analyze as first-class mode + org data model | ADR-006 | **Accepted** — Analyze is third mode (alongside Explore, Operate). Core Thesis, L1, L4, L5, L6 amended. Phase 11 expanded. |
| Two-track deployment (managed cloud + self-hosted) | ADR-006 | **Accepted** |
| AGPL-3.0 license (protects cloud, keeps code open) | ADR-006 | **Accepted** — follows Cal.com/Plane/Twenty precedent |
| citty + @clack/prompts for CLI | ADR-009 (to write) | Planned — Phase 4 |
| Workspace interaction model: handoff-first, work items, meta-processes, human steps, conversation pervasive, memory as UX | ADR-010 | **Accepted** — architecture + roadmap updated |
| System agents + process templates + cold-start architecture | ADR-008 | **Accepted** — system/domain agent distinction, template library (hybrid model), APQC as classification lens, phased cold-start |
| Runtime composable UI: no ViewSpec protocol for web, React composition, formal protocol deferred to Phase 13 | ADR-009 | **Proposed** — three design principles (jobs as dimension, trust-aware density, defaults not fixed screens). A2UI/AG-UI deferred. |
| Attention model: three modes (item review, digest, alert), per-output confidence, silence as feature | ADR-011 | **Accepted** — cross-cutting L3+L6. Review Queue scope refined. Importance classification deferred. |
| Context engineering, model routing, cost optimisation: process-declared context shape, structured AdapterContext, model tiers (fast/balanced/reasoning), cost-per-outcome as 4th feedback signal, budget-as-goal, trust-evaluator extended for model tier recs, outcome-budget-attention triangle | ADR-012 | **Accepted** — cross-cutting L1-L3, L5-L6. Phased across 4-10. Four insights absorbed (033-036). |
| Cognitive model: cognitive mode on process steps (analytical/creative), enriched feedback vocabulary (tagged + gut rejection), insight escalation ladder (correction → pattern → structural → strategic), challenge concern field, stakes/entity memory/expertise deferred | ADR-013 | **Accepted** — cross-cutting L1, L3, L5, L6. Three mechanisms ship Phase 4a-8. Four dimensions deferred Phase 10-12+. Insight-037 captured. |

## Phase 2 Design Documents

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/briefs/complete/002-phase-2-harness.md` | Parent design — full Phase 2 architecture | **in_progress** (parent) |
| `docs/briefs/complete/003-phase-2a-pipeline-trust-heartbeat.md` | Harness pipeline + trust gate + heartbeat rewrite (17 AC) | **complete** |
| `docs/briefs/complete/004-phase-2b-review-memory.md` | Review patterns + memory table + assembly (15 AC) | **complete** |
| `docs/briefs/complete/005-phase-2c-parallel-feedback.md` | Parallel execution + depends_on (15 AC) | **complete** |
| `docs/briefs/complete/006-debt-tracking.md` | Debt tracking as markdown files in `docs/debts/` | **complete** |

## Phase 3 Research (Completed)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/trust-earning-patterns.md` | Trust algorithms, multi-source aggregation, gaming prevention, Phase 2 data consumption | **complete** (2nd pass, reviewed, approved) |
| `docs/research/trust-visibility-ux.md` | 18 UX patterns for trust visibility from 8 source systems | **complete** (reviewed, approved) |
| `docs/insights/009-feedback-is-multi-source.md` | Feedback is multi-source, not just human review | **active** |
| `docs/research/phase-3-trust-earning-ux.md` | UX interaction spec: 4 persona journeys, 4 interaction patterns, 7 gaps, 7 design questions | **complete** (reviewed, revised per review) |

## Phase 3 Design (Approved)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/briefs/complete/007-phase-3-trust-earning.md` | Parent design — full Phase 3 architecture, algorithm decisions, signal scoping | **complete** (both sub-phases implemented) |
| `docs/briefs/complete/008-phase-3a-trust-data-scoring.md` | Trust data & scoring: schema, jsdiff, trust computation, CLI display (14 AC) | **complete** (all 14 AC pass) |
| `docs/briefs/complete/009-phase-3b-trust-actions-decisions.md` | Trust actions & decisions: upgrades, downgrades, simulation, override, ADR (16 AC) | **complete** (all 16 AC pass) |

## Dev Process: Designer Role (Complete)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/ux-process-design-role.md` | Research: 5 options for UX/process design role, professional patterns, human-layer.md assessment | **complete** (reviewed twice, revised) |
| `docs/adrs/004-dev-designer-role.md` | ADR: Dev Designer as 7th role, A+B hybrid with conditional activation | **accepted** |
| `.claude/commands/dev-designer.md` | Skill contract for `/dev-designer` | **complete** |
| `docs/insights/024-design-and-engineering-are-different-cognitive-modes.md` | Design and engineering are different cognitive orientations | **active** |

## Integration Architecture (Forward-Looking)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/external-integrations-architecture.md` | 7 options, 6 patterns, CLI/MCP/REST comparison, framework survey | **complete** (reviewed twice) |
| `docs/adrs/005-integration-architecture.md` | Multi-protocol, multi-purpose integration architecture decision | **proposed** (approved by human) |
| `docs/insights/010-integrations-are-two-modes.md` | Integrations split on two axes: purpose × protocol | **active** |
| `docs/architecture.md` | New cross-cutting Integrations section, L2 updates, borrowing strategy | **updated** |
| `docs/roadmap.md` | New Phase 6: External Integrations (16 capabilities, needs sub-phasing) | **updated** (phases renumbered 6-13) |

## User Personas (Foundational)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/personas.md` | Four personas (Rob trades MD, Lisa ecommerce MD, Jordan generalist technologist, Nadia team manager), six user problems, JTBD mapped to six human jobs, emotional journey, two design principles (single-process value, mobile-first) | **complete** (v0.2.0, reviewed twice, issues fixed) |
| `docs/insights/025-system-design-needs-user-framing.md` | System-level design needs explicit user-level framing | **active** |
| `docs/insights/014-single-process-must-be-valuable.md` | One process must deliver complete value on its own | **active** |
| `docs/insights/015-mobile-is-primary-surface.md` | Mobile must be seamless — supporting surface, not primary; desktop is where most work happens | **active** |

## Mobile/Remote Experience Research (Complete — Sequenced for Phase 10/13)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/runtime-deployment-models.md` | Cloud vs local vs hybrid deployment models, always-on problem, cost models, data sovereignty | **complete** (reviewed, approved) |
| `docs/research/input-type-taxonomies.md` | Standardised input type taxonomies across PM tools, GTD, BPMN, ITIL, AI agents | **complete** (reviewed, revise: add source URLs) |
| `docs/research/mobile-interfaces-for-agent-platforms.md` | Mobile UX patterns for agent platforms, PWA vs native, secure remote access, approval patterns | **complete** (reviewed, revise: add React Native/Expo coverage) |
| `docs/research/mobile-remote-experience-ux.md` | UX interaction spec: mobile primitives, three-depth review, "Edit @ desk" pattern, notification design, persona validation | **complete** (reviewed twice, all feedback incorporated) |
| `docs/insights/011-mobile-is-operate-mode.md` | Mobile = Operate mode only, 7 of 16 primitives need mobile adaptation | **active** |
| `docs/insights/012-edit-at-desk-is-first-class.md` | "Edit @ desk" is a fourth review action: active acknowledgment with deferred resolution | **active** |
| `docs/insights/013-jobs-vs-skills.md` | Six human jobs (what) vs skills like taste/creative/critical thinking (how) — two distinct axes | **active** |
| `docs/insights/026-collaborate-is-a-mode-not-a-job.md` | Collaborate is Explore mode, not a seventh job | **active** |

**Architecture gaps to absorb (future Documenter task):**
- Mobile = Operate mode (Insight-011) → L6 Human Layer
- "Edit @ desk" interaction (Insight-012) → L6 Human Layer, Review Queue
- Jobs vs Skills framework (Insight-013) → L6 Human Layer, L5 Learning Layer
- Persona validation findings: team attribution for Nadia, voice interaction for Rob, voice annotation for Lisa

## Process Discovery Research (Strategic — Not Brief-Directed)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/process-discovery-from-organizational-data.md` | Research: process mining landscape, 7 practical data sources, 5 discovery approaches, gap analysis, architecture mapping | **complete** (reviewed, PASS WITH NOTES, updated per user feedback to focus on practical data ingestion) |
| `docs/insights/016-discovery-before-definition.md` | Discovery should precede definition — system discovers processes from existing org data, user confirms/refines | **active** |
| `docs/insights/018-skills-have-two-invocation-modes.md` | Dev role skills need to handle standalone (strategic) vs in-flow (brief-directed) invocation | **absorbed** into `docs/dev-process.md` + skill commands |

**Architect evaluation complete (ADR-006).** Analyze elevated to first-class mode — third mode alongside Explore and Operate. Architecture amended: Core Thesis (new section + three-mode table), process provenance (L1), organizational data model (L4 — moderate, fulfils "shared organisational context"), process gap detection (L5), three modes in human-layer.md (L6). Roadmap amended: Phase 11 gains 5 new capabilities, dependency on Phase 6 connectors noted, re-entry condition for blank-canvas fallback. No new phase, no resequencing.

## System Agents + Process Templates (ADR-008 — Accepted)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/pre-baked-agents-and-process-templates.md` | Landscape survey: templates, system agents, cold-start, APQC/framework analysis | **complete** (reviewed) |
| `docs/insights/016-discovery-before-definition.md` | Discovery should precede definition | **active** |
| `docs/insights/archived/029-platform-agents-are-the-product.md` | System agents are the product, not a feature; system vs domain agent distinction | **absorbed** into ADR-008 |
| `docs/adrs/008-system-agents-and-process-templates.md` | System/domain agents, template library (hybrid), APQC as lens, phased cold-start | **accepted** |

**Decision summary:**
- **Two agent categories:** `system` (ships with platform, can't be deleted) vs `domain` (user-configured). Both go through same harness pipeline.
- **Ten system agent roles** (ADR-008 + ADR-010): intake-classifier + orchestrator + router (Phase 4, ADR-010), trust-evaluator (Phase 3), improvement-scanner (Phase 9), brief-synthesizer (Phase 10), process-analyst + onboarding-guide + process-discoverer (Phase 11), governance-monitor (Phase 12).
- **Template library:** Hybrid model — YAML files in `templates/`, synced to DB, dual-purpose (user-browsable + agent training material). Hand-crafted and persona-grounded, not bulk APQC conversion.
- **APQC:** Classification lens embodied in process-analyst agent's knowledge, not materialized as 1,000 template files.
- **Cold-start:** Phase 5 = template-driven (select, customize, run). Phase 11 = agent-driven (conversation + data discovery + templates).
- **Roadmap impacts:** Phase 3 gains trust-evaluator system agent. Phase 5 gains template library + adoption flow. Phase 10 Daily Brief notes brief-synthesizer dependency. Phase 11 splits "System Analyst AI" into three system agents.

## Skill Invocation Model (Complete)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/dev-process.md` | New "Invocation Modes" section + Pattern E (standalone role invocation) | **updated** |
| `.claude/commands/dev-pm.md` | Conditional handoff: pipeline recommendation vs standalone triage | **updated** |
| `.claude/commands/dev-researcher.md` | Conditional handoff: research for design vs strategic research | **updated** |
| `.claude/commands/dev-designer.md` | Conditional handoff: spec for brief vs exploratory spec | **updated** |
| `.claude/commands/dev-architect.md` | Conditional handoff: brief (→ builder) vs non-brief (→ documenter) | **updated** |
| `CLAUDE.md` | Added standalone invocation note to "How Work Gets Done" | **updated** |
| `docs/insights/archived/018-skills-have-two-invocation-modes.md` | Conditional handoffs based on output type | **absorbed** into dev-process.md + skill commands |

**Design principle:** No upfront mode flag. Skills determine next steps based on what they produced (conditional handoff), not a hardcoded pipeline position. Provenance: Original to Agent OS.

**Resolved:** Duplicate insight numbering cleaned up — duplicates renumbered (023-026), absorbed insights archived.

## Runtime Deployment Decision (RESOLVED)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/adrs/006-runtime-deployment.md` | Two-track deployment: managed cloud (primary for users) + self-hosted (for developers/data sovereignty) | **proposed** (reviewed, approved by reviewer, pending human approval) |
| `docs/research/hosted-cloud-patterns.md` | How 10 OSS projects offer hosted cloud: Supabase, n8n, Cal.com, Plane, OpenClaw, PocketBase, etc. | **complete** |
| `docs/insights/archived/028-two-track-deployment.md` | Deployment must be two-track from day one: managed cloud + self-hosted | **absorbed** into ADR-006 |

**Decision summary:**
- **Track A: Managed Cloud** — primary user path. "Sign up → first process in 2 minutes." AGPL license. Per-tenant PostgreSQL. BYOK for LLM keys. Free tier + Pro + Enterprise. Built post-Phase 5.
- **Track B: Self-Hosted** — developer and data-sovereignty path. VPS + SQLite + Tailscale for dogfood (now). One-click Railway/Render deploy for power users (Phase 10+).
- **Dogfood (now):** Track B1 — cheap VPS, SQLite stays, Tailscale for access, systemd for always-on. Unblocks Phase 3.

## Pre-Phase 3: Input Resolution & Dev Harness (Complete)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/briefs/complete/010-input-resolution-and-dev-harness.md` | Agent codebase access via tool use, DB schema enforcement, smoke test requirement | **complete** (built, reviewed, approved) |
| `docs/insights/archived/019-smoke-test-before-building-on.md` | Smoke-test before building on — review without execution missed real bugs | **absorbed** into review checklist point 11 + brief template |

**What was built:** `src/engine/tools.ts` (3 read-only tools), Claude adapter tool use loop, `ensureSchema()` in DB init, review checklist point 11, brief template smoke test section, `.env.example` updated. All 16 AC pass. Smoke test verified: agent made 20 tool calls, read architecture docs, ADRs, and source files, produced a grounded plan referencing TypeScript/tsx/Drizzle/SQLite and citing real ADR-006 and Insight-015.

## Runtime Composable UI Research (Strategic — Forward-Looking)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/runtime-composable-ui.md` | Landscape survey: SDUI (Airbnb/Lyft/DoorDash/Netflix), A2UI + AG-UI protocols, AI-generated UI, schema-driven rendering, agent platform UI, block-based editors | **complete** (reviewed, PASS WITH NOTES, feedback incorporated) |
| `docs/insights/020-ui-is-job-scoped-not-domain-scoped.md` | React is already runtime composable — don't over-engineer. Three principles: jobs as organising dimension, trust-aware density, 8 views as defaults not fixed screens. | **active** |
| `docs/adrs/009-runtime-composable-ui.md` | ADR: No ViewSpec protocol for Phase 10. Standard React composition. Formal protocol deferred to Phase 13 (multi-platform). Three design principles. | **proposed** |

**Key findings from research:**
- **SDUI** was invented for mobile app store delays — doesn't apply to web. React already composes at runtime.
- **A2UI** (Google, Apache 2.0, Dec 2025) and **AG-UI** are architecturally sound but solve a multi-platform problem Agent OS doesn't have yet. Deferred to Phase 13.
- **Three design principles adopted:** (1) jobs are the organising dimension, not domains, (2) trust tier modulates UI density, (3) the 8 view compositions are defaults, not fixed screens.
- **Output Viewer (Primitive 6)** carries most composability burden — adapts to six output types at runtime. That IS the runtime composition.
- **No formal protocol for Phase 10.** Build 16 React components (shadcn/ui + Tailwind), compose in 8 Next.js pages, use data-driven rendering.
- **Re-entry condition for formal protocol:** Phase 13 (Mobile) or when multi-platform rendering creates a real problem.

## Workspace Interaction Model Research (Strategic — Affects Phase 4+)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/insights/archived/027-workspace-not-automation-platform.md` | Agent OS is a workspace (handoff + org memory), not an automation platform. | **absorbed** into ADR-010 + architecture.md |
| `docs/research/workspace-interaction-model.md` | Landscape survey: 14 systems across 10 sections. Work input models, HITL-as-participant (5 patterns), work evolution (Manus/Cowork/Anthropic), meta-process architecture (no existing product), build-from assessment (Mastra + Vercel AI SDK + OpenUI), 6 identified gaps. | **complete** (reviewed, PASS WITH NOTES, revised, expanded) |

**Key findings:**
- Workspace products (Notion, Asana, ClickUp) are converging with automation — agents as workspace members
- Paperclip's goal ancestry model (every task carries full goal chain) is relevant for process context
- Five HITL-as-participant patterns surveyed (Mastra suspend/resume, Trigger.dev waitpoint tokens, LangGraph interrupts, Inngest waitForEvent, Sim Studio HITL block)
- Reactive-to-repetitive lifecycle is a genuine gap — no product explicitly tracks work maturing from ad-hoc to automated
- Manus AI demonstrates autonomous goal-to-completion decomposition but lacks governance/trust/learning
- Claude Cowork demonstrates plugin-as-skill model and cross-app orchestration but lacks persistent process memory
- Anthropic's orchestrator-worker pattern maps directly to Agent OS's process model (orchestrator meta-process + domain worker processes)
- **The "seed grows into a tree" pattern** — where a single input evolves through multiple processes, spawning new work — is not implemented by any existing product. This is the core differentiator.
- Five architectural options presented for Architect evaluation

## Workspace Interaction Model — Architecture Decision (ADR-010)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/adrs/010-workspace-interaction-model.md` | Core architectural decision: handoff-first model, work items, meta-processes, human steps, conversation as layer, memory as UX | **accepted** |
| `docs/architecture.md` | Core Thesis rewritten, Layer 4/5/6 amended, View Compositions updated, "What IS original" extended | **updated** (reviewed, all findings addressed) |
| `docs/roadmap.md` | Phase 4→Workspace Foundation, Phase 5→Work Evolution Verification, Phase 10→Living Workspace, Phase 11→Intelligent Discovery. New adopted patterns and originals. | **updated** (reviewed, coherent) |
| `docs/research/autonomous-oversight-patterns.md` | Parallel research: 5 patterns for calibrating human attention (confidence routing, batch/digest, management by exception, adaptive sampling, autonomy levels). 4 gaps identified. Attention model concept. | **complete** |
| `docs/insights/archived/030-structure-is-the-missing-layer.md` | Structure is the product: 8 things raw chat is missing. | **absorbed** into architecture.md Core Thesis |
| `docs/architecture.md` | Additionally updated: "Structure Is the Product" design principle added to Core Thesis. Attention model added to L3. Per-output confidence + digest review mode specified. | **updated** |

## Phase 4 Composition Sweep (Complete)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/phase-4-composition-sweep.md` | Implementation pattern extraction: 7 projects studied across 6 capabilities (agent assembly, work routing, goal decomposition, human step suspend/resume, safety-net middleware, CLI patterns). Challenges "Original" claims with extracted patterns. | **complete** (reviewed, PASS WITH NOTES) |
| `docs/insights/031-research-extract-evolve-is-the-meta-process.md` | The research-extract-evolve cycle IS the core meta-process Agent OS runs on itself | **active** |

**Key findings:**
- 4 of 12 "Original" claims remain genuinely original after extraction (work item taxonomy, meta-processes through own harness, unified task surface, trust-governed routing)
- Inngest AgentKit not in landscape.md — should be added as Tier 1
- Claude Agent SDK landscape entry outdated — now a full programmatic orchestration SDK
- Three routing modes (code-based, LLM-based, hybrid) from Inngest AgentKit cover intake-classifier + router patterns
- Mastra suspend/resume with path-based skip is the closest pattern for human step executor

**Landscape freshness flags:** All 5 resolved by Documenter:
- Inngest AgentKit → added as Tier 1 with three-mode routing, tool composition, lifecycle hooks, streaming events
- Mastra → updated with network routing, multi-source tool gathering, path-based suspend/resume detail
- Claude Agent SDK → rewritten: full programmatic SDK, 24 hook events, subagent spawning, MCP dynamic loading
- Open SWE → expanded with 4-layer middleware implementation detail, webhook routing, multi-mode auth
- CrewAI → added pattern extraction notes: hierarchical manager, task guardrails, flow decorators

## Attention Model (ADR-011 — Accepted)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/autonomous-oversight-patterns.md` | 5 patterns for calibrating human attention, 4 gaps identified, attention model concept | **complete** (reviewed, PASS WITH NOTES, revised) |
| `docs/insights/archived/030-structure-is-the-missing-layer.md` | Structure is the product: 8 things raw chat is missing. Raw chat problem + oversight problem = two sides of same coin | **absorbed** into architecture.md Core Thesis (prior session) |
| `docs/adrs/011-attention-model.md` | Three attention modes (item review, digest, alert), per-output confidence scoring, silence as feature, process importance deferred | **accepted** |
| `docs/architecture.md` | Cross-cutting Attention Model section added. Review Queue (Primitive 5) scope refined. Borrowing strategy updated. L3 attention model routing mechanics with cross-reference. | **updated** |

**Decision summary:**
- **Three attention modes:** Item review (individual output in queue), digest (summary in Daily Brief), alert (process-level health notification). Trust tiers determine rate; attention modes determine form.
- **Per-output confidence:** Agent self-assesses each output as `high`/`medium`/`low`. Low confidence → item review regardless of trust tier.
- **Silence is a feature:** Autonomous processes that run cleanly produce no notifications, no queue items. Absence of noise = things working.
- **Review Queue scope narrowed:** Only outputs genuinely needing human judgment. Autonomous process outputs appear as digest summaries, not queue items.
- **Deferred:** Process importance classification (Phase 10+, re-entry when 10+ processes compete for attention).
- **Build phasing:** Confidence metadata (Phase 4), digest mode (Phase 5), health alerts (Phase 8), calibration tracking (Phase 8), importance (Phase 10+).

**Documenter follow-ups (all complete):**
- ✓ `human-layer.md` Primitive 1 (Daily Brief) wireframe updated with "Running quietly" digest section + design decision
- ✓ `docs/roadmap.md` updated with attention model build phasing (confidence Phase 4, digest Phase 5, alerts Phase 8, importance Phase 10+)
- ✓ `docs/landscape.md` updated with 5 freshness flags resolved, date bumped to 2026-03-20
- ✓ `docs/architecture.md` borrowing strategy expanded with 9 new patterns from composition sweep
- ✓ `docs/roadmap.md` adopted patterns expanded with composition sweep findings

## Documenter Retrospective (2026-03-20 — Context/Cost/Model Session)

**What was produced this session:**
1. Context management and token efficiency research report (`docs/research/context-and-token-efficiency.md`) — 30+ sources, 12 sections, covering context assembly, caching, compression, memory decay, model routing, and cost optimisation
2. Four insights (033-036) — all absorbed into ADR-012 within the same session
3. ADR-012 (context engineering, model routing, cost optimisation) — 7 decisions, cross-cutting L1-L3 and L5-L6
4. Landscape.md updated with 4 new entries (Mem0, memU, Graphiti/Zep, RouteLLM)
5. Roadmap.md updated with 7 new adopted patterns and 4 new originals (#29-32)

**What worked:**
- **Human-driven insight chain.** The user's three successive challenges ("different processes need different context", "don't build just around Claude", "when do you route to different models?") each deepened the research and led to the next insight. The CPC analogy that produced Insight-036 (outcome-budget-attention triangle) was the user's own framing — a concrete mental model the architecture can build on.
- **Research → Insight → ADR in one session.** The full cycle (research, 4 insights, architectural decision, review, approval, documentation) completed within a single conversation. This is the fastest insight-to-decision cycle we've had.
- **Parallel research agents** (3 concurrent for context, 2 concurrent for model routing) produced comprehensive results efficiently. Total research covered 30+ sources across frameworks, APIs, and academic papers.
- **The Architect correctly scoped the output as an ADR, not a brief.** Cross-cutting architectural decisions that span multiple phases shouldn't be forced into a single brief — the ADR format worked well here.

**What surprised us:**
- **The user's insights were more architectural than the research.** The research produced technical patterns (caching, compression, salience scoring). The user produced the architectural insight: "the everyday user doesn't want to think about models, context, compacting — they want to think about how important is this and how much am I willing to pay." This reframed the entire output from "how to optimise tokens" to "how to hide complexity behind meaningful user dials."
- **The outcome-budget-attention triangle is potentially as significant as ADR-010 (workspace interaction model).** It redefines the user's relationship with cost — from "don't exceed $X" to "deliver this outcome and keep getting cheaper." This is the compound effect made measurable.
- **Cost-per-outcome as a 4th feedback signal** was not in any existing research or architecture. L5 had three signals for 11 ADRs. The user's CPC analogy added the fourth.

**What to change:**
- **Proactively research cost/efficiency before building phases**, not just quality/capability. This session was triggered by the user's concern, but cost efficiency should be a standard research dimension.
- **ADR-012's phasing needs cross-referencing with Phase 4 briefs.** The adapter interface change and cost tracking fields affect briefs 011-014. This should be done before building Phase 4.
- **The insight-to-ADR pipeline worked well.** When insights clearly belong in the architecture (cross-cutting, multi-layer), going straight to ADR rather than leaving insights to stage is more efficient. The session proved insights can be both captured AND absorbed in one conversation when the architectural impact is clear.

**Prior retrospective (2026-03-20 — Composition Sweep Session):**
- Composition sweep format validated (Insight-031). Run before every phase build.
- Landscape freshness schedule needed. Framework evaluations decay fast.
- Insight-031 absorption into dev-process.md still pending.

## Next Steps

## Phase 4 Designer Spec (Complete)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/phase-4-workspace-cli-ux.md` | CLI workspace interaction spec: 5 persona scenarios, 6 human jobs mapped to commands, interaction states for all commands, output formatting principles, confidence escalation (ADR-011), deferred items with persona impact notes | **complete** (reviewed, PASS WITH NOTES, findings addressed) |

**Key design decisions:**
- **Silence is the happy path** — autonomous processes produce nothing in default status output. No green checkmarks, no "all good" messages.
- **Verbs not nouns** — `aos status`, `aos capture`, `aos complete`, not `aos work-item list`
- **Morning check-in pattern** — `aos status` serves all four personas' morning rituals in under 60 seconds
- **Never leak implementation** — user never sees "work item", "intake-classifier", "harness pipeline", "trust gate"
- **Consistent item format** — `#ID Type Summary / Context | Process | Age` across all commands

**Architect decisions made:**
- "Teach this" pattern detection: YES — minimal read-only notification in 4b (count corrections per field, surface message after 3). Full teach → memory → enforce is Phase 8.
- Sub-phasing: YES — 4a (foundation: 14 AC) → 4b (human steps + capture: 12 AC) → 4c (meta-processes + confidence: 10 AC). Sequential chain, each independently testable.
- Trust-evaluator: folded into 4c alongside intake-classifier, router, orchestrator (first system agent pattern).

## Phase 4 Architecture (Briefs — Ready for Approval)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/briefs/011-phase-4-workspace-foundation.md` | Parent brief: full Phase 4 design, sub-phasing rationale, provenance, security, non-goals | **draft** (reviewed, PASS WITH FINDINGS, findings addressed) |
| `docs/briefs/012-phase-4a-foundation.md` | Sub-brief 4a: workItems table + CLI rewrite (citty + clack) + status/review/approve/edit/reject/trust/sync/start (14 AC) | **draft** |
| `docs/briefs/013-phase-4b-human-steps-capture.md` | Sub-brief 4b: human executor suspend/resume + aos complete + aos capture (manual) + unified task surface + pattern notification (12 AC) | **draft** |
| `docs/briefs/014-phase-4c-meta-processes.md` | Sub-brief 4c: 4 system agents + per-output confidence + auto-classification (10 AC) | **draft** |

## Pre-Phase 4: Dev Pipeline Orchestrator (Brief 015 — Draft)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/briefs/015-dev-pipeline-orchestrator.md` | Dev pipeline orchestrator (`claude -p` chaining) + Telegram bot for mobile review. Proves ADR-010 workspace model on the dev process. 18 AC. | **complete** (built, reviewed, iterated with user, deployed) |
| `docs/insights/032-dev-process-is-first-workspace.md` | The dev process is the first workspace dogfood — building Agent OS should use Agent OS patterns | **active** |

**Key design decisions:**
- Uses `claude -p` (headless Claude CLI) — same subscription, no API token cost
- Telegram bot for mobile review with inline keyboards (approve/reject/feedback/desk)
- Pinned status message for cold-start context (always-visible current state)
- Terminal fallback when Telegram is not configured
- Bridge infrastructure — planned sunset when Phase 4 engine can run the dev pipeline as a process
- Session state checkpointed to files, not conversation memory

**Relationship to Phase 4:** This is a stepping stone, not a replacement. Lessons learned (session context management, review gate UX, mobile feedback patterns) inform the Phase 4 engine design. The orchestrator is retired when Phase 4 can run the dev pipeline as a process.

**What was built:**
- `src/dev-session.ts` — Session state types, CRUD, context assembly, formatting (status, role list, transition banners)
- `src/dev-pipeline.ts` — Orchestrator: `claude -p` chaining via `ReviewGateHandler` interface, terminal mode, CLI entry point. Exported `runClaude()` with full options (model, session persistence, system prompt append).
- `src/dev-bot.ts` — Telegram bot: full conversational Claude (Opus, persistent sessions), inline keyboards, skill invocation buttons (all 7 dev roles), auto-PM on startup/newchat, session handoff (runs Documenter before reset), `/start`/`/status`/`/resume`/`/newchat`/`/help` commands, pinned status message with quick actions.
- `package.json` — Added `grammy`, `dev-pipeline` and `dev-bot` scripts
- `.env.example` — Added `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (chat ID optional — auto-locks on first message)
- `docs/dev-process.md` — Referenced orchestrator as primary invocation method

**Implementation review:** PASS WITH NOTES. All 18 AC addressed. Reviewer findings addressed.

**Post-review iteration (with user):**
- Fixed handler registration order (commands before `message:text` — grammy processes in registration order)
- Fixed `main()` guard in dev-pipeline.ts (importing it from dev-bot was triggering the CLI)
- Made `TELEGRAM_CHAT_ID` optional — auto-locks to first chat that messages the bot
- Added free-text chat via `claude -p` with persistent sessions (Opus model) — equivalent to Claude Code conversation quality
- Added auto-PM on startup and `/newchat` — Daily Brief pattern, no manual invocation needed
- Added skill invocation via inline keyboard buttons (all 7 dev roles)
- Added session handoff: runs Documenter role before `/newchat` to capture state/insights
- Added `--dangerously-skip-permissions` for headless mode — prevents silent tool failures
- Set Opus model on all calls (pipeline roles, chat, skills) for parity with interactive Claude Code
- Removed artificial constraints: no system prompt on free-text chat, no tool restrictions — identical to Claude Code

**Key design discovery:** The Telegram bot evolved from a pipeline controller into a full Claude workspace during the build session. The user's feedback drove this: "Why can't I talk to you normally?", "Why do I need a command?", "Make it the same quality as here." This validated Insight-032 — the dev process IS the first workspace. The bot is now a genuine mobile Claude Code experience, not a notification surface.

## Context Management and Token Efficiency Research (Cross-Cutting)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/context-and-token-efficiency.md` | Deep dive: context assembly patterns, token budgeting, prompt caching, memory decay, context compression, lost-in-the-middle mitigation, multi-step context management, model routing (agent team vs single generalist). 30+ sources examined. | **complete** (reviewed, PASS WITH NOTES, findings addressed, expanded with model routing) |

**Key findings — context management:**
- **Stable prefix + variable suffix** architecture maximises prompt cache hits (90% cost reduction on repeated process invocations). Agent OS's harness assembly should order: identity → process def → tools → memories → task content → instruction anchors.
- **Deferred tool loading** (Claude Agent SDK + Mastra patterns) achieves 85% reduction in tool schema tokens.
- **Memory salience scoring** (`confidence × log(reinforcement+1) × recency_decay`) validates ADR-003's planned Phase 3 formula from an independent source (memU).
- **Lost-in-the-middle** effect (30%+ accuracy drop) means context ordering matters — critical info should go at beginning and end of prompt, not middle.
- **Context compression** at 70% budget threshold prevents overflow (Letta recursive summarization, Factory AI compaction).
- **Trust-modulated context depth** — adjusting context richness based on earned trust level — is Original to Agent OS.
- Two gaps addressed during review: context for human steps (resume requires fresh assembly) and cross-process boundary context (explicit outputs, not shared memory).

**Key findings — model routing:**
- **Multi-agent specialist teams** outperform single agents on complex/parallelisable tasks (90.2% improvement, Anthropic research) but at 3.5-15× token cost. Benefits plateau at ~4 agents; sequential reasoning degrades 39-70%.
- **Cost-based cascade routing** (Haiku → Sonnet → Opus based on confidence) saves 60% vs all-Sonnet. RouteLLM framework achieves 85% cost reduction on benchmarks maintaining 95% performance.
- **Structured schema handoffs** between agents are critical — free-text handoffs are the primary failure mode in multi-agent systems.
- All major frameworks support per-step model selection (Mastra, CrewAI, Inngest AgentKit, OpenAI Agents SDK, LangGraph).
- **Trust-modulated model routing** (downgrade to cheaper model as trust is earned) is Original to Agent OS.

**Insights captured and absorbed:**
- Insight-033: Process declares its context shape → **absorbed** into ADR-012 Decision 1
- Insight-034: Context assembly belongs in the harness, not the adapter → **absorbed** into ADR-012 Decision 2
- Insight-035: Model routing is a process declaration → **absorbed** into ADR-012 Decision 3
- Insight-036: Outcome-budget-attention triangle → **absorbed** into ADR-012 Decisions 4-6

**Landscape updates (complete):** Mem0, memU, Graphiti/Zep added as Tier 2 memory entries. RouteLLM added under Model Routing. All in `docs/landscape.md`.

## Human Cognition Models Research (Strategic — Cross-Cutting)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/human-cognition-models-for-agent-os.md` | Cognitive science frameworks (Kahneman, Dreyfus, Klein, Polanyi, Simon, Weick, Edmondson, Bloom) applied to Agent OS. 8 research areas, 3 cognitive architectures (ACT-R, Soar, LIDA), entity memory landscape (Zep/Graphiti). Identifies 7 cognitive dimensions the architecture doesn't model. | **complete** (reviewed, PASS WITH FLAGS, findings addressed) |
| `docs/insights/037-cognition-is-a-missing-architectural-dimension.md` | Agent OS models work flow and governance but not how humans think through work. Seven cognitive dimensions identified. | **absorbed** into ADR-013 |
| `docs/adrs/013-cognitive-model.md` | ADR: Cognitive model as cross-cutting concern. Three mechanisms (cognitive mode, enriched feedback, insight escalation). Four deferred dimensions (expertise, challenge, stakes, entity memory). | **accepted** |

**Seven cognitive dimensions identified:**
1. **Cognitive Mode** — type of thinking a task demands (analytical, creative, critical, strategic). No AI platform adapts review UX to cognitive mode. Original to Agent OS.
2. **Expertise Level** — where the human sits on the Dreyfus scale per domain. Trust tiers partially cover (process-level), but not per-human-per-domain.
3. **Tacit Knowledge** — pre-articulate expertise ("feels wrong"). Current feedback captures explicit corrections only. Knowledge elicitation literature offers approaches.
4. **Abstraction Level** — the ladder from corrections to patterns to structural insights to strategic changes. L5 has improvement proposals; gap is the systematic escalation ladder.
5. **Challenge Orientation** — agent constructive pushback on task approach, not just output confidence. ADR-011 confidence is the embryo; challenge goes further.
6. **Stakes Awareness** — calibrating review depth to impact (enriches ADR-011's deferred "process importance" concept with Simon's satisficing).
7. **Relational Context** — entity-relationship memory (who's involved, history, value). Zep/Graphiti temporal knowledge graph is the build-from candidate.

**Key finding:** No surveyed AI platform, agent framework, or cognitive architecture implements cognitive modeling for work oversight. This is genuinely original territory where cognitive science theory must be translated to architecture.

**Landscape updates (complete):** LIDA cognitive architecture added as reference. Cognitive Load Framework (Springer 2026) added as reference. Zep/Graphiti already present. Mem0 already present. Three ADR-013 originals added to "What's Genuinely Ours to Build."

## Documenter Retrospective (2026-03-20 — Dev Pipeline Orchestrator Session)

**What was produced this session:**
1. Insight-032 (dev process is the first workspace dogfood)
2. Brief 015 (dev pipeline orchestrator + Telegram bot) — designed, reviewed, built, deployed
3. Three new files: `src/dev-session.ts`, `src/dev-pipeline.ts`, `src/dev-bot.ts`
4. `grammy` dependency added for Telegram bot
5. `docs/dev-process.md` updated with automated pipeline as primary invocation method
6. Significant post-review iteration: bot evolved from pipeline controller to full Claude workspace

**What worked:**
- **User-driven scope expansion was correct.** The brief scoped a pipeline controller + notification bot. The user pushed for conversational parity: "Why can't I just type?", "Make it the same as here." Each push removed an artificial constraint and made the bot genuinely useful. The final product is materially better than the brief specified.
- **The ReviewGateHandler interface** was the right abstraction. Terminal and Telegram modes share the same pipeline logic, differing only in the handler. Adding features to one mode doesn't break the other.
- **Building then using immediately** revealed real issues the review didn't catch: handler registration order in grammy, `main()` executing on import, chat ID friction. These are the bugs you only find by running the thing.

**What surprised us:**
- **The brief under-scoped the bot.** Brief 015 described a pipeline controller with approve/reject buttons. The user correctly saw it as the first Agent OS workspace surface — identical to Claude Code but on mobile. This is exactly the insight from Insight-032. The brief said "stepping stone"; the user said "this IS the thing."
- **Permission bypass was necessary.** The brief carefully avoided `--dangerously-skip-permissions`. In practice, headless mode without it causes silent tool failures — Claude tries to write state.md, gets blocked, produces incomplete output. The user cut through the caution: "Any reason we shouldn't?"
- **`--append-system-prompt` on chat was degrading quality.** The "be concise, mobile chat" instruction was making Claude worse, not better. Removing it and letting CLAUDE.md + project context do the work produced equivalent quality to the IDE.

**What to change:**
- **Brief 015 should be updated to reflect the actual scope** — it's now a full Claude workspace, not just a pipeline controller. The brief as written understates what was built.
- **Insight-032 is validated and should be considered for absorption** into dev-process.md as a formal principle: "The dev process runs through the orchestrator and Telegram bot, not just manual skill invocation."
- **The `claude -p` session persistence model needs monitoring** — we're assuming `--resume <sessionId>` maintains full conversation context. If sessions grow large, quality may degrade. This connects to the context management research (Insight-033/034).

## Documenter Retrospective (2026-03-20 — Cognitive Model Session)

**What was produced this session:**
1. Human cognition models research report (`docs/research/human-cognition-models-for-agent-os.md`) — 8 research areas, 7 cognitive science frameworks, 3 cognitive architectures (ACT-R, Soar, LIDA), entity memory landscape (Zep/Graphiti). Identifies 7 cognitive dimensions.
2. Insight-037 (cognition is a missing architectural dimension) — captured and absorbed into ADR-013 in same session
3. ADR-013 (cognitive model) — cross-cutting concern with 3 mechanisms and 4 deferred dimensions. Reviewed, accepted.
4. Landscape.md updated with 2 new reference entries (LIDA, Cognitive Load Framework) and 3 new originals (#9-11)
5. Roadmap.md updated with cognitive model items in Phase 4, 5, 8 and 7 new adopted patterns and 3 new originals (#33-35)

**What worked:**
- **User-driven foundational question.** The session started from the user's challenge: "what are you missing about how the human mind works?" This was not a PM-triaged work item — it was a strategic probe that revealed a genuine architectural gap. The PM tried to redirect to Phase 4; the user correctly pushed for architecture-level thinking first.
- **Research → Insight → ADR pipeline in one session** (again). This is the second consecutive session where the full cycle completed in a single conversation. The pattern is: user challenges an assumption → research validates the challenge → insight captures the finding → ADR codifies the architectural response.
- **The Architect correctly constrained scope.** Seven research dimensions could have become seven mechanisms. The Architect reduced to three mechanisms (cognitive mode, enriched feedback, insight escalation) and deferred four as design principles. The reviewer further constrained from four cognitive modes to two (analytical, creative). This layered scope reduction is the right pattern.
- **Reviewer pushed back on the right things.** The reviewer's challenge on four modes being premature led to a stronger, simpler design. The pattern-to-structural detection underspecification flag was accurate — this is genuinely the hardest mechanism.

**What surprised us:**
- **No applied examples exist anywhere.** The research surveyed cognitive science, cognitive architectures, AI agent platforms, and HCI systems. Zero implementations of cognitive modeling for work oversight. This is either a genuine blind spot in the industry or a sign that the translation from theory to architecture is harder than it looks. Either way, it validates the "genuinely original" claim.
- **The analytical/creative distinction is the high-signal move.** The review correctly identified that critical/strategic modes overlap with existing concepts (adversarial review, human steps). The analytical/creative pair captures the sharpest cognitive distinction in the research — Lisa's "does this feel right?" vs Rob's "do the numbers check out?" — with minimal mechanism cost.
- **Tacit knowledge capture via "gut rejection"** is potentially the most impactful mechanism. The permission to say "not right, not sure why" is something no AI system gives users today. If this works, it bridges Polanyi's paradox — the system helps users articulate what they already know but haven't expressed.

**What to change:**
- **Architecture.md needs the new cross-cutting Cognitive Model section.** The ADR is accepted but the architecture spec hasn't been amended yet. This should happen before Phase 4 building starts (the `cognitive_mode` field is in Phase 4a scope).
- **Phase 4a brief (012) should be updated to include `cognitive_mode` field.** It's a trivial addition (one optional YAML field + schema column, no runtime effect) but should be in the brief's acceptance criteria.
- **The insight-to-ADR pipeline is now a proven pattern.** Three consecutive sessions (ADR-011 attention model, ADR-012 context engineering, ADR-013 cognitive model) have followed: user challenge → research → insight → ADR → approval. This is the dev process working as designed.

## QA/Tester Role Evaluation (Dev Process — Decision Made)

| Document | Purpose | Status |
|----------|---------|--------|
| `docs/research/qa-tester-role-in-dev-pipeline.md` | Research: 6 options across 11 projects/frameworks for QA as a distinct role. gstack, agency-agents, Aider, CrewAI, AutoGen, Codex, Cursor, etc. | **complete** (reviewed, revised per review) |
| `docs/insights/038-testing-is-a-quality-dimension-not-always-a-role.md` | Testing is a quality dimension distributed across Builder + Reviewer, not always a separate role. Re-enter at Phase 10. | **active** |
| `.claude/commands/dev-builder.md` | Updated: `pnpm test`, smoke test ownership, test authoring, test evidence in handoff | **updated** |
| `.claude/commands/dev-reviewer.md` | Updated: verify Builder ran tests/smoke test, fixed checklist reference | **updated** |
| `docs/dev-process.md` | Updated: Quality Check Layering section rewritten with clear ownership | **updated** |
| `docs/roadmap.md` | Updated: QA re-entry row added to Phase 10 | **updated** |

**Decision summary:**
- **No 8th role (QA/Tester) now.** Testing is distributed: Builder owns execution (`pnpm test`, smoke test, test authoring), Reviewer verifies evidence.
- **Reasoning:** CLI-only project (browser QA doesn't apply), CrewAI showed LLM QA unreliable, solo-founder overhead, Insight-002 (strengthen free layers first).
- **Re-entry:** Phase 10 (web UI) — evaluate gstack `/qa` browser-based testing pattern. Row added to roadmap.
- **Dogfooding gap acknowledged:** Product architecture defines QA as a distinct agent role; dev process doesn't exercise it. Phase 10 re-entry must compare approaches.

## Documenter Retrospective (2026-03-20 — QA/Tester Role Session)

**What was produced this session:**
1. QA/Tester research report (`docs/research/qa-tester-role-in-dev-pipeline.md`) — 6 options, 11 projects surveyed, gap analysis, counter-arguments
2. Insight-038 (testing is a quality dimension, not always a separate role)
3. Builder and Reviewer contract updates (testing ownership, smoke test evidence, test authoring)
4. Quality Check Layering section rewritten in dev-process.md
5. Phase 10 roadmap QA re-entry row added

**What worked:**
- **Research → Architect decision → contract updates in one session.** The full Research → Review → Architect → Review → Documenter cycle completed efficiently. The question was well-scoped and the research surfaced a clear answer.
- **The Researcher review caught real problems.** Neutrality violations (Sections 5-6 advocating rather than presenting) and provenance gaps were flagged and fixed before the Architect consumed the research. The two-stage review (research review, then design review) caught different classes of issues.
- **The Architect review caught the dogfooding tension.** The product defines QA as a separate role but the dev process omits it — the reviewer correctly identified this as under-acknowledged and the insight was strengthened.
- **Counter-arguments in the research prevented over-engineering.** The research's Section 7 (reasons NOT to add QA) and the CrewAI unreliability finding were decisive in the architectural evaluation. Good research presents both sides.

**What surprised us:**
- **The answer was "no" — but a productive "no."** The session didn't add a role, but it strengthened two existing roles and created a clear re-entry mechanism. The dev process is measurably better (Builder now explicitly owns smoke test, `pnpm test`, and test authoring; Reviewer now verifies test evidence). The value was in the strengthened contracts, not a new role.
- **The highest-value QA pattern (browser testing) is currently inaccessible.** gstack's `/qa` is powerful because it opens a real browser. For a CLI-only project, the most impactful QA capability is unavailable. This is a genuine constraint, not an excuse.

**What to change:**
- **State.md "Next Steps" should reflect the approved work ordering** — cognition research is approved, Phase 4 briefs ready, orchestrator deployed.

## Next Steps

1. **NOW:** Brief 015 complete — orchestrator + Telegram bot deployed. Use it to build Phase 4.
2. **Then:** Phase 4 (briefs 011-014 already written, with ADR-012 context engineering + ADR-013 cognitive model fields in 4a scope)
3. **After Phase 4:** Phase 5 Work Evolution Verification (cognitive mode review framing + enriched feedback vocabulary)
