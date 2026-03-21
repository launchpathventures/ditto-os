# Agent OS — Current State

**Last updated:** 2026-03-21
**Current phase:** Phase 5 complete. ADR-014 (Agent Cognitive Architecture) accepted. Insight-047 (Outcome Owners + Process Lifecycle) captured. README, vision, personas reframed around "outcome owners" and the reinvention problem. Next: PM triage for Phase 6 or Cognitive Architecture A1.
**History:** See `docs/changelog.md` for completed phases, retrospectives, and resolved decisions.

---

## What's Working

- **Storage** — SQLite + Drizzle ORM + better-sqlite3. WAL mode. Auto-created at `data/agent-os.db`. (ADR-001)
- **Process definitions** — 11 YAML processes in `processes/` (7 domain + 4 system). Parallel groups, depends_on, human steps, conditional routing (route_to/default_next). System processes have `system: true`.
- **Claude adapter** — 10 role-based system prompts, tool use loop (read_file/search_files/list_files, max 25 calls). Categorical confidence (high/medium/low per ADR-011).
- **CLI adapter (Brief 016a)** — `src/adapters/cli.ts`. Spawns `claude -p` as subprocess. Loads role contracts from `.claude/commands/dev-*.md`. Parses CONFIDENCE from output. costCents: 0 (subscription-based). Provenance: ralph (subprocess), Paperclip (adapter pattern).
- **Script adapter** — Deterministic steps with on_failure
- **Process loader** — YAML parsing, parallel_group containers, dependency validation, cycle detection. Supports route_to, default_next, retry_on_failure fields (Brief 016b).
- **CLI** — citty + @clack/prompts. 12 commands: sync, start, heartbeat, status, review, approve, edit, reject, trust, capture, complete, debt. TTY-aware, --json on listings. Unified task surface.
- **Work items** — workItems table (type, status, goalAncestry, assignedProcess, spawnedFrom). Conditional flow (Insight-039).
- **Harness pipeline** — 6 handlers: memory-assembly → step-execution → review-pattern → routing → trust-gate → feedback-recorder. Routing handler (Brief 016b) evaluates route_to conditions via substring matching (Mode 1).
- **Trust gate** — 4 tiers: supervised, spot-checked (~20%), autonomous, critical. Deterministic SHA-256 sampling. Confidence override: `low` always pauses regardless of tier (ADR-011, Brief 016d).
- **Trust earning** — Sliding window (20 runs), conjunctive upgrades, disjunctive downgrades, grace period, simulation, override. (ADR-007)
- **Review patterns** — Maker-checker, adversarial, spec-testing. Retry with feedback injection.
- **Memory** — Two-scope (agent + process), salience sorting, token-budgeted assembly, feedback-to-memory bridge. (ADR-003)
- **Human steps** — `executor: human` suspends execution, creates action work item with input_fields, `aos complete` resumes with human input.
- **Pattern notification** — After 3+ corrections of same pattern, read-only notification surfaced. Precursor to Phase 8 "Teach this".
- **Parallel execution** — Promise.all for parallel groups, depends_on resolution
- **Heartbeat** — Routes through harness. Sequential + parallel. Human step suspend/resume. Conditional routing (route_to/default_next). Retry with feedback injection (retry_on_failure). Routing skips mark non-target siblings as "skipped".
- **Harness events** — `src/engine/events.ts`. Typed event emitter: step-start, step-complete, gate-pause, gate-advance, routing-decision, retry, step-skipped, run-complete, run-failed. Provenance: Trigger.dev event pattern.
- **Agent tools** — 3 read-only tools (read_file, search_files, list_files). Path traversal prevention, secret deny-list.
- **DB schema enforcement** — `pnpm cli sync` runs drizzle-kit push. Handles first-run and evolution.
- **Debt tracking** — `docs/debts/` markdown files. `pnpm cli debt` to list.
- **Dev process** — 7 roles as skills. Brief template. 28 active insights, 21 archived. 31 research reports. 12-point review checklist. Distributed knowledge maintenance (Insight-043): each role maintains docs it reads, Documenter does cross-cutting audit.
- **Dev pipeline** — `claude -p` orchestrator + Telegram bot. Full Claude workspace on mobile. (Brief 015). Engine-integrated: `processes/dev-pipeline.yaml` runs 7 roles through the real harness with conditional routing (Brief 016c).
- **System agents (Brief 014a+014b+021)** — 4 system agents running through the harness pipeline: trust-evaluator (wraps Phase 3 code, spot-checked), intake-classifier (keyword matching, supervised), router (LLM-based via Anthropic SDK, supervised), orchestrator (goal-directed — decomposes goals into tasks, routes around paused items, confidence-based stopping; supervised). `category: system` + `systemRole` on agents table. System agent registry dispatches via `script` executor + `systemAgent` config (Insight-044). `startSystemAgentRun()` for programmatic triggering.
- **Goal-directed orchestrator (Brief 021+022)** — Decomposes goals into child work items using process step list as blueprint. `orchestratorHeartbeat()` iterates spawned tasks, routes around trust gate pauses to independent work. Confidence-based stopping: low confidence triggers escalation (Types 1/3/4). CLI: scope negotiation in `capture`, goal tree in `status`, escalation display. Schema: `decomposition` on workItems, `orchestratorConfidence` on processRuns.
- **Process templates (Brief 020)** — 3 non-coding templates in `templates/`: invoice-follow-up (4 steps, 1 human), content-review (3 steps, all AI), incident-response (4 steps, 2 human). All include governance declarations (trust, quality_criteria, feedback). Loaded as `status: draft` via `aos sync`. Process loader reads from both `processes/` and `templates/`.
- **Auto-classification capture (Brief 014b)** — `aos capture` auto-classifies work item type (keyword patterns) and auto-routes to best matching process (LLM). Falls back to interactive @clack/prompts on low confidence. System processes filtered from routing targets.
- **Test infrastructure (Brief 017)** — vitest + 66 integration tests covering process-loader, trust-diff, heartbeat (including orchestratorHeartbeat), feedback-recorder, trust computation, system agents (registry, classifier, orchestrator decomposition + scheduling + escalation, step dispatch). Real SQLite per test (no mocks). Anthropic SDK mocked at module level. `pnpm test` runs in ~560ms.
- **E2E verification (Brief 020)** — Full work evolution cycle verified: capture → classify → route → orchestrate → execute → human step → resume → review → trust update. All 6 architecture layers proven working. Report at `docs/verification/phase-5-e2e.md`.

## What Needs Rework

- Architecture "First Implementation" section still frames everything as processes, not work items

## Recently Completed

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
| Research reports as durable artifacts | ADR-002 | Proposed |
| Memory architecture (two-scope, phased) | ADR-003 | Done (Phase 2b scope) |
| Harness as middleware pipeline | Phase 2a | Done |
| Trust gate (4 tiers, deterministic sampling) | Phase 2a | Done |
| Review patterns (composable layers) | Phase 2b | Done |
| Parallel execution via Promise.all | Phase 2c | Done |
| Dev Designer as 7th role | ADR-004 | Accepted |
| Trust earning algorithm | ADR-007 | Accepted |
| Integration architecture (multi-protocol) | ADR-005 | Proposed |
| Analyze as first-class mode + org data model | ADR-006 | Accepted |
| Two-track deployment | ADR-006 | Accepted |
| AGPL-3.0 license | ADR-006 | Accepted |
| Workspace interaction model | ADR-010 | Accepted |
| System agents + templates + cold-start | ADR-008 | Accepted |
| Runtime composable UI (no ViewSpec, React) | ADR-009 | Proposed |
| Attention model (3 modes, confidence, silence) | ADR-011 | Accepted |
| Context engineering, model routing, cost | ADR-012 | Accepted |
| Cognitive model (mode, feedback, escalation) | ADR-013 | Accepted |
| Agent cognitive architecture (toolkit, executive function, judgment hierarchy) | ADR-014 | Accepted |

## Active Briefs

| Brief | Phase | Status |
|-------|-------|--------|
| 023 — Phase 6 External Integrations (parent) | 6 | Draft — awaiting approval |
| 024 — Integration Foundation + CLI (Phase 6a) | 6a | Ready — approved 2026-03-21 |
| 025 — MCP + Agent Tool Use (Phase 6b) | 6b | Ready — approved 2026-03-21 |
| 026 — Credentials + Process I/O (Phase 6c) | 6c | Ready — approved 2026-03-21 |

## Next Steps

1. **NOW:** Phase 6 briefs approved. Build order: 024 (Integration Foundation + CLI) → 025 (MCP + Tool Use) → 026 (Credentials + Process I/O). Parallel: ADR-014 Phase A1 (Cognitive Toolkit) can run alongside 024. Next: `/dev-builder` for Brief 024.
2. **Planned:** PM triages whether process-analyst system agent should move from Phase 11 to Phase 7-8 (Insight-047). Outcome owner reframe means process creation tools are core, not late-stage.
4. **Deferred:** Brief 016 AC17 (Telegram event subscription) — follow-up after live engine validation.
5. **Deferred:** Cognitive model fields (ADR-013) — deferred to Phase 8. Extended by ADR-014 for agent-execution cognitive framing.
6. **Deferred:** Attention model extensions (ADR-011) — digest mode, silence-as-feature. Needs 3+ autonomous processes.
7. **Planned:** Knowledge lifecycle meta-process design (Insight-042)

## Documenter Retrospective (2026-03-21 — Cognitive Architecture Deep-Dive Session)

**What was produced this session:**
1. Insight-046 significantly expanded through three rounds of strategic conversation: (1) reflection & mental models, (2) mindset/state/cognitive skills, (3) executive function & intuition as the governing layer.
2. Seven layers of agent effectiveness defined (up from six): Skills → Mental Models → Thinking Style → State → Metacognition → Relational Intelligence → Executive Function.
3. Executive function mapped to agent equivalents: working memory, cognitive flexibility, inhibitory control, planning, monitoring, initiation.
4. Design principle articulated: "Agent OS provides cognitive tools and creates conditions for quality thinking. It does NOT prescribe which tool to use."
5. Incremental implementation plan: Phase 1 (toolkit + tracking, human as executive function) → Phase 2 (learning correlation, orchestrator begins) → Phase 3 (full cognitive management, orchestrator as executive function).
6. Consulting market parallel refined: ~$500B+ market, Agent OS captures methodology + execution (process-as-primitive) + problem framing + adaptation + intuitive sensing (cognitive architecture).

**What worked:**
- **Iterative deepening produced genuine insight.** Three rounds of conversation, each building on the last, moved from "agents need mental models" (obvious) to "executive function is the governing layer" (non-obvious). The third round — adding executive function and intuition — fundamentally changed the design direction from "cognitive toolkit" to "cognitive architecture with judgment."
- **The consulting market parallel sharpened the value proposition.** Connecting executive function to the 40% problem-framing / 20% adaptation split in consulting made the abstract concrete. It clarifies what Agent OS does that raw AI doesn't.
- **The "firm, not playbook" metaphor is a strong design test.** Every feature decision can be tested against: "Does this make Agent OS more like a firm (judgment, adaptation) or more like a playbook (prescription, rigidity)?"

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
1. Research report: `docs/research/qmd-obsidian-knowledge-search.md` — evaluated QMD (markdown search engine), Obsidian integration patterns, and OpenClaw memory model as composition opportunities for Agent OS. Reviewed: PASS WITH FLAGS (3 flags, 2 addressed).
2. Landscape update: OpenClaw added as proper entry in `docs/landscape.md` with memory architecture details (4-layer model, compaction limitations). Previously only referenced in architecture.md borrowing table.
3. Landscape update: QMD added to `docs/landscape.md` Knowledge Search section.
4. Research index updated with new report.

**What worked:**
- **Research triggered by external links was efficiently scoped.** The human shared 3 links. The Researcher correctly assessed them against the full project context (not just Brief 016), identified the genuine composition opportunity (QMD-via-MCP for Insight-042), and captured competitive intelligence (OpenClaw memory model) that fills a landscape gap.
- **The human's "signal, not action" assessment was correct.** Nothing in the findings changes current priorities or architecture. The research enriches landscape knowledge and creates a pointer for when Insight-042 ships. This is what good scouting looks like — information ready when needed, not premature adoption.
- **The landscape gap for OpenClaw was real.** A project referenced in architecture.md's borrowing table had no landscape.md entry. The research session surfaced this organically. Now there's a proper evaluation with memory architecture details and competitive contrast.

**What surprised us:**
- **QMD's stack overlap with Agent OS.** Same dependencies (better-sqlite3, vitest, TypeScript, MIT, Node 22), same test runner, same DB engine. If QMD stabilises, the integration path is unusually clean for a third-party tool.
- **OpenClaw's memory model has hard limits not previously documented.** 20K chars per bootstrap file, 150K aggregate. Lossy compaction. These are concrete numbers that inform competitive positioning — Agent OS's structured memory has no such limits.

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
