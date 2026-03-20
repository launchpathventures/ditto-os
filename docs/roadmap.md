# Agent OS — Roadmap

**Last updated:** 2026-03-20
**Current phase:** Phase 3 complete. Pre-Phase 4 (dev pipeline orchestrator) complete. Phase 4 next (Workspace Foundation).
**Major reframe (ADR-010):** Roadmap restructured around workspace interaction model. Agent OS is a living workspace where work evolves through governed meta-processes, not an automation platform. See ADR-010 for the full rationale.

This is the complete capability map for Agent OS. Every item traces back to the architecture spec, human-layer design, or landscape analysis. Status is tracked per item. Nothing is silently omitted — deferred items have explicit re-entry conditions.

---

## How to Read This

- **Status:** not started | in progress | done | deferred
- **Source doc:** which design document defines this capability
- **Build from:** which open-source project provides the pattern (or "Original" if unique to Agent OS)
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
| `trust-evaluator` system agent (first system agent — ADR-008) | not started | ADR-008 | Original | System agent definition + schema `category` field |
| ADR-007 written | done | — | — | `docs/adrs/007-trust-earning.md` |

---

## Phase 4: Workspace Foundation

**Objective:** Prove the workspace interaction model. Work items enter, meta-processes route them, processes execute with human steps, the system demonstrates it's alive. CLI is the first surface, but the concepts transfer directly to the web dashboard.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| **Work items** | | | | |
| `workItems` table (type, status, goal_ancestry, assigned_process) | not started | ADR-010 | Paperclip tickets + goal ancestry | `src/db/schema.ts` |
| Work item creation via CLI | not started | ADR-010 | citty + @clack/prompts | `src/cli.ts` |
| Goal → task decomposition (manual first, orchestrator agent later) | not started | ADR-010 | Manus Planner module pattern | CLI command |
| **Meta-processes (system agents)** | | | | |
| Intake-classifier agent (classify work item type + urgency) | not started | ADR-010 | Original | System agent definition |
| Router agent (match work item to process) | not started | ADR-010 | Original | System agent definition |
| Orchestrator agent (decompose goals into tasks) | not started | ADR-010 | Anthropic orchestrator-worker | System agent definition |
| System agents go through harness pipeline | not started | ADR-008, ADR-010 | Original | Harness integration |
| **Human step executor** | | | | |
| `human` executor type with suspend/resume | not started | ADR-010 | Mastra suspend/resume | `src/engine/step-executor.ts` |
| Human step surfaces as work item in CLI | not started | ADR-010 | Sim Studio HITL block | CLI display |
| Human step completion via CLI | not started | ADR-010 | Trigger.dev waitpoint token | CLI command |
| **Unified task surface** | | | | |
| CLI shows review tasks + action tasks + goal-driven tasks together | not started | ADR-010 | Original | CLI command |
| **CLI infrastructure** | | | | |
| Command routing (citty) | not started | landscape.md | citty `/src/command.ts` | `src/cli.ts` |
| Interactive UX (@clack/prompts) | not started | landscape.md | @clack/prompts | `src/cli.ts` |
| Orient: `status` (work items + process health + brief) | not started | ADR-010, human-layer.md | Original | CLI command |
| Review: `review`, `approve`, `edit`, `reject` | not started | human-layer.md | Paperclip approval flow | CLI commands |
| Capture: `capture` (creates work item, routes via intake-classifier) | not started | ADR-010, human-layer.md | Original | CLI command |
| Trust: `trust` (accept/reject/override/simulate) | not started | architecture.md L3 | Original (existing) | CLI command |
| Define: `sync`, `start` | not started | architecture.md L1 | Keep existing patterns | CLI commands |
| **Attention model (Phase 4 scope)** | | | | |
| Per-output confidence metadata on `stepRuns` | not started | ADR-011 | Content moderation three-band (adapted to categorical) | `src/db/schema.ts`, `src/engine/harness-handlers/trust-gate.ts` |
| Confidence-based routing in trust gate (low → item review regardless of tier) | not started | ADR-011 | SAE Level 3 (system self-assessment) | `src/engine/harness-handlers/trust-gate.ts` |
| Agent system prompt instruction for confidence self-assessment | not started | ADR-011 | Original | `src/adapters/claude.ts` |
| **Cognitive model (Phase 4 scope)** | | | | |
| `cognitive_mode` field on process definitions (optional, default: analytical) | not started | ADR-013 | Original | `src/db/schema.ts`, process YAML |
| Challenge `concern` field on confidence metadata | not started | ADR-013 | Edmondson psychological safety + SAE Level 3 | `src/db/schema.ts` |

---

## Phase 5: Work Evolution Verification

**Objective:** Prove the "seed grows into a tree" cycle end-to-end. A single work item enters → gets classified → routed to a process → process executes with a human step → human completes → process resumes → output reviewed → trust data updated → learning captured. Ship first non-coding process templates.

| Capability | Status | Source doc | Build from | Deliverable |
|-----------|--------|-----------|------------|-------------|
| Full work evolution cycle (work item → intake → route → execute → human step → resume → review → trust) | not started | ADR-010 | — | Successful run |
| Goal decomposition verified (goal → multiple tasks → multiple processes → tracked completion) | not started | ADR-010 | — | Successful run |
| Meta-process trust earning verified (intake-classifier corrections improve routing) | not started | ADR-010 | — | Feedback data |
| All 6 layers proven working | not started | architecture.md | — | Verification report |
| Process template library (`templates/` directory) | not started | ADR-008 | n8n/Zapier pattern + Original governance declarations | `templates/` with 2-3 non-coding templates |
| Template sync + adoption flow | not started | ADR-008 | Process loader pattern + Original | CLI command or flow |
| **Attention model (Phase 5 scope)** | | | | |
| Digest mode for autonomous processes (outputs not in Review Queue, summary in Daily Brief) | not started | ADR-011 | Zapier Digest + GitHub Copilot PR-as-batch | CLI status output / Daily Brief |
| Silence-as-feature verified (autonomous clean runs produce no notifications) | not started | ADR-011 | Management by Exception, PagerDuty | Verification |
| **Cognitive model (Phase 5 scope)** | | | | |
| Mode-aware review framing in CLI (analytical + creative) | not started | ADR-013 | Kahneman System 1/2, Bloom taxonomy | CLI review commands |
| Enriched rejection vocabulary (tagged + gut rejection) | not started | ADR-013 | Polanyi tacit knowledge, knowledge elicitation literature | Feedback capture |

---

## Future Phases (sequenced but not scheduled)

### Phase 6: External Integrations

**Re-entry condition:** Dogfood processes proven end-to-end (Phase 5), ready for non-coding domain
**Sizing note:** 16 capabilities across 6 subsystems — exceeds Insight-004 splitting heuristic. Must be split into sub-phases before building. Natural seam: (a) registry + CLI protocol + harness integration, (b) MCP + REST + credential vault + process I/O.

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| **Integration registry** | | |
| Registry format (YAML declaration files per service) | ADR-005, Insight-007 | Original (informed by Nango git-tracked approach) |
| Registry loader (parse + validate, like process-loader) | ADR-005 | Process loader pattern (existing) |
| **Step executor extension** | | |
| `integration` executor type in schema + step-executor | ADR-005 | Handler registry pattern (Sim Studio) |
| CLI protocol handler (execute CLI commands, parse JSON output) | ADR-005 | Script adapter (existing) + Google Workspace CLI pattern |
| MCP protocol handler (connect to MCP server, invoke tools) | ADR-005, architecture.md L2 | Claude Agent SDK MCP, OpenClaw skills-over-MCP |
| REST protocol handler (HTTP calls with auth) | ADR-005 | Standard HTTP client patterns |
| **Credential management** | | |
| Credential vault (encrypted storage, isolated from agent runtime) | ADR-005 | Composio brokered credentials pattern |
| Token lifecycle (refresh, rotation, revocation) | ADR-005 | Nango managed auth |
| Per-process, per-agent credential scoping | ADR-005 | Original |
| **Agent tool use** | | |
| Step-level `tools:` field in process definitions | ADR-005, architecture.md L2 | OpenClaw skills pattern |
| Tool resolution from integration registry at harness assembly | ADR-005 | Claude Agent SDK dynamic tool loading |
| Tool authorisation via agent permissions | architecture.md (Governance) | Schema fields from Phase 1 |
| **Process I/O** | | |
| External input sources in process definitions | ADR-005, architecture.md L1 | Process definition source/trigger fields (existing) |
| Webhook trigger handler | ADR-005 | Standard webhook patterns |
| Output delivery to external destinations | ADR-005 | Nango actions pattern |
| **Harness integration** | | |
| External calls traverse harness pipeline (trust gate, audit) | ADR-005 | Harness pipeline (existing) |
| Integration call logging in activity table | ADR-005 | Feedback recorder (existing) |
| ADR-005 formalised | — | — |

### Phase 7: Layer 4 — Awareness

**Re-entry condition:** 2+ processes running and producing outputs

| Capability | Source doc | Build from |
|-----------|-----------|------------|
| Process dependency graph | architecture.md L4 | Schema exists (`processDependencies` table) |
| Event propagation on output | architecture.md L4 | Original |
| Impact propagation ("if I change X, these processes affected") | architecture.md L4 | Original |
| Remaining 2 trust downgrade triggers (downstream reports, input changes) | architecture.md L3 | Requires L4 |

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
| Output Viewer (6 output types) | human-layer.md | Original design |
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
| **Composition principles (ADR-009)** | | |
| Trust-aware UI density (supervised=full, autonomous=exceptions) | ADR-009 | Original |
| No ViewSpec protocol — standard React conditional rendering | ADR-009 | Standard React |
| Output Viewer as key composability primitive (6 output types) | human-layer.md, ADR-009 | Original |
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
| System detects repeated ad-hoc work patterns | ADR-010, Insight-027 | Original to Agent OS |
| System proposes new process creation from observed patterns | ADR-010 | Original to Agent OS |
| User confirms/refines proposed process → activates supervised | ADR-010, Insight-016 | Original |
| **Evidence-informed discovery** | | |
| Capability Catalog (guided discovery, not app store) | human-layer.md | APQC/ITIL base knowledge |
| Evidence-informed discovery from connected org data | ADR-006, Insight-016, research report | Informed by PKAI + ClearWork + Original |
| Organizational data analysis (7 source types) | ADR-006, research report | Informed by ClearWork + Original |
| APQC/ITIL pattern classification for discovery | architecture.md (industry standards) | Original |
| Process candidate scoring and presentation | ADR-006, research report | Informed by ClearWork + Original |
| Continuous process gap detection | ADR-006, architecture.md (Self-Improvement) | Extension of self-improvement meta-process |

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
| — "Edit @ desk" mobile-to-desktop handoff | mobile-remote-experience-ux.md, Insight-012 | Original to Agent OS |
| — Push notification design (6 types, 4 priority levels) | mobile-remote-experience-ux.md | Informed by iOS/Android patterns |
| — Voice interaction (voice-in + voice-out) | mobile-remote-experience-ux.md persona validation | Native only (Siri App Intents, Android App Actions) |
| — Team attribution + team health for multi-person governors | mobile-remote-experience-ux.md persona validation (Nadia) | Original |
| — Offline approve/reject with conflict resolution | mobile-remote-experience-ux.md | Original |
| — Capture → Classify → Route pipeline with AI classifier | mobile-remote-experience-ux.md, input-type-taxonomies.md | Original |
| — PWA vs native decision | mobile-interfaces-for-agent-platforms.md | Architect decides based on voice constraint |
| — Formal view composition protocol (re-evaluate A2UI adoption) | ADR-009, runtime-composable-ui.md | A2UI (Google, Apache 2.0) or custom — deferred from Phase 10 |
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
| Progressive streaming UI rendering | OpenUI | Phase 10: dynamic UI (ADR-010, evaluate) |
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

## What's Original to Agent OS

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
12. **Process-scoped integration permissions** — credentials scoped per-process, per-agent
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
28. **Structure as the product** — the eight things raw chat is missing (loose structure, guidance, standards, goal orientation, quality control, informed autonomy, interconnectedness, abstraction). Agent OS IS the scaffolding that makes AI useful for non-technical users (Insight-030)
29. **Process-declared context shape** — process definitions declare their context profile (memory/tools/history weighting). No system lets the process definition control context assembly shape (ADR-012)
30. **Trust-modulated model routing** — as trust is earned, system recommends downgrading to cheaper models. Same mechanism as trust tier upgrades. No system ties model selection to earned trust (ADR-012)
31. **Outcome-budget-attention triangle** — user sets importance, budget, and attention. System optimises model, context, and review pattern within those constraints. No system treats budget as a goal for meta-process optimisation (ADR-012)
32. **Cost-per-outcome as feedback signal** — fourth feedback signal alongside output quality, process efficiency, and outcome impact. No system tracks cost-per-outcome or compounds trust + model + context + cache optimisations (ADR-012)
33. **Cognitive mode on process steps** — process definitions declare what kind of human thinking review demands (analytical vs creative). Review framing, feedback capture, and learning adapt accordingly. No AI platform adapts review UX to cognitive mode (ADR-013)
34. **Tacit knowledge capture via enriched feedback** — structured rejection vocabulary (tagged rejection, gut rejection) captures pre-articulate expertise. System detects patterns in vague signals and surfaces hypotheses. No agent platform captures pre-articulate knowledge (ADR-013)
35. **Insight escalation ladder** — learning layer actively climbs from corrections → patterns → structural insights → strategic proposals. Four abstraction levels with human gating at each level. No platform models abstraction levels in its learning pipeline (ADR-013)
