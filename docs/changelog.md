# Agent OS — Changelog

Historical record of completed phases, research, design decisions, and retrospectives. For current state, see `docs/state.md`.

---

## Phase 4b: Human Steps + Capture (2026-03-21)

**Brief:** `docs/briefs/complete/013-phase-4b-human-steps-capture.md`
**Review:** PASS WITH 2 FLAGS (missing --data input validation, work item scan performance). Both resolved.
**AC:** 12/12 pass. Smoke test verified (human-step-test process: script → human → script cycle).

**What was built:**
- Human step executor: `executor: human` in YAML → suspend → action work item → `aos complete` → resume
- `aos capture` rewritten: interactive type/process selection + --type/--process flags
- `aos complete`: interactive prompts from input_fields + --data for scripted use
- Unified task surface: `aos status` shows review tasks + action tasks together
- Pattern notification: correction count per field, message after 3+ corrections

**Files:** `complete.ts` (new), `human-step-test.yaml` (new), `capture.ts` (rewritten), + 7 modified (schema, process-loader, heartbeat, status, approve, format, feedback-recorder, cli, code-review.yaml)

**Retrospective:**
- Brief was self-contained — dependency on Brief 016 in state.md was incorrect. Brief 013 only depends on 012.
- No test suite exists after 4 phases. Compounding debt.
- `captures` table superseded by `workItems` — cleanup needed.

---

## Phase 4a: Foundation (2026-03-20)

**Brief:** `docs/briefs/complete/012-phase-4a-foundation.md`
**Review:** PASS WITH 4 FLAGS (command injection, N+1 queries, label conflation, dead code). All resolved.
**AC:** 14/14 pass. Smoke test verified.

**What was built:**
- CLI rewrite: switch-statement → citty framework. 11 commands.
- workItems table per ADR-010
- @clack/prompts for interactive input
- TTY-aware, --json on listings

**Retrospective:**
- Review found real issues: `execSync` command injection → `execFileSync`, N+1 queries in status → pre-built process map
- Builder didn't run smoke test (second time). Contract strengthened but habit not yet formed.
- Dead CLIContext code shipped — abandoned mid-implementation without cleanup.

---

## Brief 016: Intelligent Coding Orchestrator — Design (2026-03-20)

**Brief:** `docs/briefs/016-intelligent-coding-orchestrator.md`
**Review:** PASS. Approved by human.
**Insights:** 039 (fixed sequences anti-pattern), 040 (continuous roadmap execution), 041 (adapter abstraction)

**What it delivers:**
- 016a: CLI adapter (`claude -p` / `codex` as execution substrate)
- 016b: Conditional routing (`route_to` + `default_next` + `retry_on_failure`)
- 016c: Dev pipeline as process YAML (7 roles with conditional routing)
- 016d: Confidence gating + notification events (ADR-011 categorical confidence, event emitter)

---

## Dev Pipeline Orchestrator (Brief 015 — 2026-03-20)

**Brief:** `docs/briefs/complete/015-dev-pipeline-orchestrator.md`
**Review:** PASS WITH NOTES. All 18 AC addressed.
**Insight:** 032 (dev process is first workspace)

**What was built:**
- `src/dev-session.ts` — Session state CRUD, context assembly
- `src/dev-pipeline.ts` — `claude -p` chaining via ReviewGateHandler interface
- `src/dev-bot.ts` — Telegram bot: full conversational Claude, skill invocation, auto-PM, session handoff
- grammy dependency, dev-pipeline and dev-bot scripts

**Retrospective:**
- Brief under-scoped the bot — evolved from pipeline controller to full Claude workspace during build.
- User pushed for conversational parity: "Make it the same quality as here." Each push removed artificial constraints.
- Permission bypass (`--dangerously-skip-permissions`) was necessary for headless mode.
- `--append-system-prompt` degraded quality — removed, let CLAUDE.md do the work.

---

## Attention Model (ADR-011 — 2026-03-20)

**ADR:** `docs/adrs/011-attention-model.md` — Accepted
**Research:** `docs/research/autonomous-oversight-patterns.md`

Three attention modes (item review, digest, alert). Per-output confidence (high/medium/low). Silence as feature. Review Queue narrowed to genuine judgment items. Process importance deferred to Phase 10+.

Build phasing: confidence (Phase 4), digest (Phase 5), alerts (Phase 8), importance (Phase 10+).

---

## Context Engineering + Model Routing (ADR-012 — 2026-03-20)

**ADR:** `docs/adrs/012-context-cost-model-architecture.md` — Accepted
**Research:** `docs/research/context-and-token-efficiency.md` (30+ sources)
**Insights absorbed:** 033 (context shape), 034 (harness not adapter), 035 (model routing), 036 (outcome-budget-attention triangle)

7 decisions: process-declared context profile, structured AdapterContext, model tiers (fast/balanced/reasoning), cost-per-outcome as 4th feedback signal, budget-as-goal, trust-evaluator extended for model tiers.

**Retrospective:**
- User's insights were more architectural than the research. "The everyday user doesn't want to think about models — they want to think about how important is this and how much am I willing to pay."
- Cost-per-outcome as 4th feedback signal was the user's CPC analogy.
- Outcome-budget-attention triangle potentially as significant as ADR-010.

---

## Cognitive Model (ADR-013 — 2026-03-20)

**ADR:** `docs/adrs/013-cognitive-model.md` — Accepted
**Research:** `docs/research/human-cognition-models-for-agent-os.md` (8 areas, 7 frameworks, 3 cognitive architectures)
**Insight absorbed:** 037 (cognition is a missing architectural dimension)

Three mechanisms: cognitive mode (analytical/creative), enriched feedback vocabulary (tagged + gut rejection), insight escalation ladder. Four deferred: expertise, challenge, stakes, entity memory.

**Retrospective:**
- No applied examples exist anywhere. Genuinely original territory.
- Analytical/creative distinction is the high-signal move.
- "Gut rejection" — permission to say "not right, not sure why" — potentially most impactful.

---

## QA/Tester Role Evaluation (2026-03-20)

**Research:** `docs/research/qa-tester-role-in-dev-pipeline.md`
**Insight:** 038 (testing is quality dimension, not always a role)
**Decision:** No 8th role now. Testing distributed: Builder owns execution, Reviewer verifies evidence. Re-entry at Phase 10.

---

## Phase 4 Composition Sweep (2026-03-20)

**Research:** `docs/research/phase-4-composition-sweep.md` (7 projects, 6 capabilities)
**Insight:** 031 (research-extract-evolve is the meta-process)

4 of 12 "Original" claims survived extraction. 5 landscape freshness flags → all resolved by Documenter (Inngest AgentKit, Mastra, Claude Agent SDK, Open SWE, CrewAI updated).

---

## Workspace Interaction Model (ADR-010 — 2026-03-20)

**ADR:** `docs/adrs/010-workspace-interaction-model.md` — Accepted
**Research:** `docs/research/workspace-interaction-model.md` (14 systems, 10 sections)
**Insights absorbed:** 027 (workspace not automation), 030 (structure is the missing layer)

Core architectural decision: handoff-first model, work items, meta-processes, human steps, conversation as layer, memory as UX. Architecture.md and roadmap.md restructured.

---

## Phase 4 Designer Spec (2026-03-20)

**Research:** `docs/research/phase-4-workspace-cli-ux.md`

Key decisions: silence is happy path, verbs not nouns, morning check-in pattern, never leak implementation, consistent item format. Sub-phasing: 4a → 4b → 4c.

---

## System Agents + Process Templates (ADR-008 — 2026-03-20)

**ADR:** `docs/adrs/008-system-agents-and-process-templates.md` — Accepted
**Research:** `docs/research/pre-baked-agents-and-process-templates.md`

Two agent categories (system/domain). Ten system agent roles. Template library (hybrid). APQC as classification lens. Phased cold-start.

---

## Runtime Composable UI (ADR-009)

**ADR:** `docs/adrs/009-runtime-composable-ui.md` — Proposed
**Research:** `docs/research/runtime-composable-ui.md`

No ViewSpec protocol for Phase 10. Standard React composition. Formal protocol deferred to Phase 13.

---

## Runtime Deployment (ADR-006)

**ADR:** `docs/adrs/006-runtime-deployment.md` — Accepted
**Research:** `docs/research/runtime-deployment-models.md`, `docs/research/hosted-cloud-patterns.md`

Two-track: Managed Cloud (Phase 10+) + Self-Hosted (now = VPS+SQLite+Tailscale). AGPL-3.0 license.

---

## Integration Architecture (ADR-005)

**ADR:** `docs/adrs/005-integration-architecture.md` — Proposed
**Research:** `docs/research/external-integrations-architecture.md`

Multi-protocol (CLI + MCP + REST), multi-purpose integration architecture.

---

## Dev Designer Role (ADR-004)

**ADR:** `docs/adrs/004-dev-designer-role.md` — Accepted
**Research:** `docs/research/ux-process-design-role.md`

7th development role. A+B hybrid with conditional activation.

---

## User Personas (Foundational)

**Document:** `docs/personas.md` (v0.2.0)

Four personas (Rob, Lisa, Jordan, Nadia). Six user problems. JTBD mapped to six human jobs. Emotional journey. Design principles: single-process value, mobile-as-supporting.

**Architecture gaps to absorb:** Mobile = Operate mode (011), "Edit @ desk" (012), Jobs vs Skills (013), team attribution (Nadia), voice interaction (Rob), voice annotation (Lisa).

---

## Pre-Phase 3: Input Resolution & Dev Harness (Brief 010)

**Brief:** `docs/briefs/complete/010-input-resolution-and-dev-harness.md`
**AC:** 16/16 pass. Smoke test verified.

Agent read-only tools, Claude adapter tool_use loop, DB schema enforcement, review checklist point 11, brief template smoke test.

---

## Phase 3: Trust Earning (Briefs 007-009)

**Briefs:** `docs/briefs/complete/007-phase-3-trust-earning.md` (parent), `008-phase-3a-*`, `009-phase-3b-*`
**Research:** `docs/research/trust-earning-patterns.md`, `docs/research/trust-visibility-ux.md`, `docs/research/phase-3-trust-earning-ux.md`

Phase 3a (trust data + scoring): 14/14 AC. Phase 3b (trust actions + decisions): 16/16 AC. ADR-007 written.

---

## Phase 2: Harness + Feedback Capture (Briefs 002-006)

**Briefs:** `docs/briefs/complete/002-phase-2-harness.md` (parent), `003-phase-2a-*`, `004-phase-2b-*`, `005-phase-2c-*`, `006-debt-tracking.md`
**Research:** `docs/research/phase-2-harness-patterns.md`, `docs/research/memory-systems.md`

Phase 2a (pipeline + trust + heartbeat): 17 AC. Phase 2b (review + memory): 15 AC. Phase 2c (parallel + feedback): 15 AC. ADR-002, ADR-003 written.

---

## Skill Invocation Model (Dev Process)

Conditional handoffs based on output type (Insight-018, absorbed). All 7 skill commands updated. CLAUDE.md updated.

---

## Process Discovery Research (Strategic)

**Research:** `docs/research/process-discovery-from-organizational-data.md`
**Insight:** 016 (discovery before definition)

ADR-006 evaluation: Analyze elevated to first-class mode (third alongside Explore, Operate).

---

## Mobile/Remote Experience Research (Strategic — Phase 10/13)

**Research:** `docs/research/mobile-interfaces-for-agent-platforms.md`, `docs/research/mobile-remote-experience-ux.md`, `docs/research/runtime-deployment-models.md`, `docs/research/input-type-taxonomies.md`
**Insights:** 011 (mobile is operate mode), 012 (edit @ desk), 013 (jobs vs skills), 026 (collaborate is a mode)

---

## Prior Retrospective Notes (2026-03-20 — Composition Sweep)

- Composition sweep format validated (Insight-031). Run before every phase build.
- Landscape freshness schedule needed. Framework evaluations decay fast.
- Insight-031 absorption into dev-process.md still pending.
