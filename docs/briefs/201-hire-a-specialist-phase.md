# Brief 201: Hire a Specialist — Phase Plan (Parent Brief)

**Date:** 2026-04-20
**Status:** draft
**Depends on:** ADR-036 (Database Tier Strategy), ADR-037 (Hired Agents Primitive), ADR-038 (Self-Supervised Agent Dialogue), Insight-203
**Unlocks:** Briefs 202–206 (sub-briefs), future workspace-multi-user work, Nadia persona activation

## Goal

- **Roadmap phase:** User-Facing Legibility (extension) — activate the L2 Agent primitive as a user-facing, persistent, hirable specialist
- **Capabilities delivered:**
  - Hired Agents table + YAML-primary storage (ADR-037)
  - Conversational hire flow ("*I need someone to handle X*" → proposed agent spec → approval → hired)
  - Agent Card UI primitive (#10 from `human-layer.md`) — shippable at last
  - Agent Detail page (simplified from Paperclip's 6-tab layout)
  - Self-supervised agent dialogue — three-voice conversation surface (ADR-038)
  - Delegation protocol — Self → Agent handoff, Agent → Self escalation

## Context

Ditto's architecture has carried an L2 Agent primitive and a spec'd Agent Card UI since the earliest design docs, but it has never been activated as a user-facing concept. Persona Nadia (*"Team Manager Supporting Specialists with Agents,"* personas.md:170) has been effectively unserved — her core JTBD has no corresponding primitive in the shipped product.

Paperclip's evolution into a mature ticket-system control plane has provided a concrete reference implementation of the hire mechanic. Deep research at `.context/paperclip-deep-dive.md` and `.context/paperclip-ux-deep-dive.md` identified the adaptable patterns and the ones to reject.

Three architectural decisions settle the substrate for implementation:
- **ADR-036** — SQLite-per-workspace; hired agents live in the workspace tier; switching workspaces swaps the roster
- **ADR-037** — the Hired Agent primitive, YAML-primary storage, conversational hire as the default path
- **ADR-038** — Self manages the agents; direct user↔agent dialogue with always-watching Self and the five-verb interjection model

This brief is the **phase plan** that sequences the build. It does not itself build anything — it defines sub-briefs along dependency seams and declares the build order.

## Objective

A user can converse with Self, say *"I need someone to handle my weekly marketing report,"* complete a brief conversational hire, and have a persistent *Marketing Manager* agent hired to their workspace — with a visible Agent Card, a simplified detail page, the ability to address that agent directly in conversation, and Self observing and able to interject per the five-verb model at a trust-tier-appropriate rate.

## Non-Goals

- **Multi-user workspace access.** Nadia's fully-delegated-access use case (inviting her assistant to her workspace) is out of scope. Covered by a later brief once workspace-multi-user is specified.
- **Agent-to-agent delegation.** Agents do not talk to each other in this phase. Only user↔agent and Self↔agent.
- **OrgChart / harness-legibility view.** Deferred to a separate brief; activates the reconsidered anti-candidate from the Paperclip evaluation.
- **Integrations-management surface.** Deferred; uses the agent primitive but is independent.
- **Postgres migration of the Network tier.** ADR-036 specifies the trigger; this phase does not move the needle on it.
- **Automatic process scaffolding in hire.** Self may *propose* a starter process during hire, but the process-generation pipeline is not modified in this phase. Existing process-generation is reused as-is.
- **Agent-authored configuration drift.** Agents cannot edit their own YAML. User + Self only. An agent that wants a capability change must request it via Self's proposal flow.

## Inputs

1. `docs/adrs/036-database-tier-strategy.md` — substrate for hired-agents storage
2. `docs/adrs/037-hired-agents-primitive.md` — primitive definition, schema shape, YAML layout
3. `docs/adrs/038-self-supervised-agent-dialogue.md` — three-voice conversation, five interjection verbs, observation topology
4. `docs/insights/203-self-supervised-agent-dialogue.md` — origin principle
5. `docs/personas.md` §Persona 4 (Nadia) — primary persona driver
6. `docs/human-layer.md` — UI primitive #10 (Agent Card) spec; workspace composition model
7. `docs/architecture.md` — L2 (Agent) layer, Self (ADR-016), trust tiers (ADR-007), attention model (ADR-011), memory scopes (ADR-003)
8. `.context/paperclip-deep-dive.md` — schema + adapter reference
9. `.context/paperclip-ux-deep-dive.md` — Agent Card / AgentDetail / EntityRow / ApprovalCard / RunTranscriptView reference UX
10. Existing Ditto code: `src/engine/self.ts`, `src/engine/self-context.ts`, `src/engine/self-delegation.ts`, `src/engine/harness-handlers/metacognitive-check.ts`, `src/engine/harness-handlers/review-pattern.ts`, `packages/core/src/harness/`, `packages/web/app/welcome/ditto-conversation.tsx`

## Constraints

- **Engine-first discipline** (CLAUDE.md Engine Core §). Hired-agent types (schema definitions, YAML parser, agent-registry interfaces) go to `packages/core/`. Ditto-product-specific hire-conversation logic, persona-aware intake, UI wiring stay in `src/` or `packages/web/`. Ask *"could ProcessOS use this?"* — if yes, it's core.
- **Filesystem-legibility** (Insight-201). Agent config YAML is the source of truth. The DB mirror is derived state. A user hand-edit of YAML on restart must produce a valid DB state.
- **Conversational hire is the default path.** The form-based editor is a fallback for power users, not the primary entry point. UX reviews must enforce this.
- **Five interjection verbs — closed enumeration** (ADR-038). No new verbs may appear in implementation. Each UI affordance and each back-end path must map to exactly one of: Ask, Flag, Pause, Escalate, Propose.
- **Transparent observation.** Agent's context includes Self's observations as they happen. No side-channel that hides Self's notes from the agent.
- **Trust-tier-driven observation rate.** Tier 1 = every turn, Tier 5 = async digest. Implementation must not short-circuit this — e.g., no "always observe regardless of tier" or "never observe regardless of tier" in code paths reachable in production.
- **User speaks last.** No auto-execution of a contested agent action after Self has Paused.
- **`stepRunId` invocation guard** (Insight-180). Any agent-initiated function with external side effects (send email, create calendar event, post content, make payment) must require `stepRunId` at the call boundary.
- **No `reports_to` on the hired-agent schema, ever** (ADR-037). Flat under Self.
- **No `company_id`, `tenant_id`, or similar tenancy FK.** Workspace tenancy is the file path (ADR-036). No row-level tenancy columns.
- **No hidden observation.** UX must visibly render Self's presence when Self is observing. No "silent supervisor" mode.
- **YAML schema is versioned.** First schema version is `v1`. Future changes bump the version; on-disk migration is handled by a workspace-upgrader extension (existing pattern).
- **Terminology lock.** User-facing language: "agent," "hire," "manage," "supervise," "trust level." Forbidden: "employee," "worker," "staff," "reports to," "CEO," "CTO," "company" (when referring to the workspace).
- **Credentials MUST NOT appear in agent YAML, ever.** Agent YAML contains **references** to credentials (credential id, integration name), never credential **values** (OAuth tokens, API keys, secret material). Credential values remain in the existing credential store (ADR-005, ADR-031) and are resolved at runtime. Per Insight-201 hard MUST-NOT on filesystem projection of Tier-2+ credentials. Violations are a shippable-defect stop.
- **Trust tier vocabulary.** This phase uses ADR-007's four-tier model (`supervised` / `spot_checked` / `autonomous` / `critical`) as the canonical trust-tier enum. ADR-038 §3's five-band observation-rate table is an **observation-rate mapping** keyed on trust tier + time-in-tier, not a new tier system. See ADR-038 reconciliation note. Builder must not introduce a numeric 1–5 enum in code; observation rates are looked up from trust tier via a dispatcher.
- **Memory-scope ADR-039 dependency.** ADR-037's `memoryScope` field is a net-new extension of ADR-003 (memory architecture). Brief 202 MUST NOT lock the `memoryScope` schema until ADR-039 (or an ADR-003 amendment) is written and accepted. If ADR-039 is not ready at Brief 202 start, either (a) pause 202 until it's ready, or (b) ship 202 without the `memoryScope` field and add it in a follow-up once ADR-039 lands.

## Provenance

| What | Source | Level | Why this source |
|---|---|---|---|
| Agent schema shape (name, role, adapter, model, runtime, instructions, budget, skills, status) | Paperclip `packages/db/src/schema/agents.ts` | adopt | Mature reference; adapted to drop `reports_to` and `company_id` |
| Agent Detail page IA (multi-tab layout) | Paperclip `ui/src/pages/AgentDetail.tsx` | pattern | 6 tabs → simplified to 5 (Runs subsumed by Activity) |
| Approval-as-inbox-item pattern for Self's Pause affordance | Paperclip `ui/src/components/ApprovalCard.tsx` | pattern | Typed payload + decision note structure; rendered inline, not in separate inbox |
| EntityRow primitive as Agent Card implementation | Paperclip `ui/src/components/EntityRow.tsx` | pattern | Dense row primitive for team roster views |
| RunTranscriptView semantic group normalization | Paperclip `ui/src/components/transcript/RunTranscriptView.tsx` | pattern | Applied to agent conversations (tools / thinking / commands / diffs) |
| Ping dot "Streaming" live-run indicator | Paperclip universal | pattern | Applied to agent cards during active conversation |
| YAML-primary config storage | Ditto processes (`processes/*.yaml`) | extend | Existing Ditto pattern extended to agents |
| Agent Card (UI primitive #10) | Ditto `docs/human-layer.md` | activate | Already spec'd, never built |
| Conversational hire flow | Original to Ditto | — | Departure from Paperclip's form-based hire |
| Three-voice conversation surface | Original to Ditto | — | No prior art in surveyed systems |
| Five interjection verbs | Original to Ditto | — | Codified from user's architectural statement (Insight-203) |
| Trust-tier-driven observation rate | Ditto ADR-007 + ADR-011 | extend | Existing attention model applied to conversation supervision |
| Maker-checker supervisory pattern | Ditto dev-process (`/dev-builder` + `/dev-reviewer`) | extend | Ditto-native pattern generalized from build-time to runtime |

## Sub-Brief Breakdown

Five sub-briefs along natural dependency seams. Each is independently testable and shippable. Build order: 202 → 203 → 204 → 205 → 206, with 205 and 206 buildable in parallel if reviewer bandwidth allows.

### Brief 202 — Hired-Agent Primitive: Schema + YAML + DB Mirror

**Depends on:** ADRs 036, 037
**Unlocks:** 203, 204, 205, 206
**Scope:**
- Drizzle schema for `hiredAgents` in workspace DB (new table per ADR-036's workspace tier)
- YAML schema v1 with validator (Zod) at `packages/core/src/agents/schema.ts`
- Parse / serialize round-trip (YAML ↔ typed struct ↔ DB row)
- `agents/*.yaml` loader that upserts the DB mirror on workspace startup
- Workspace-upgrader extension for future schema version bumps
- `agent_runtime_state` table for lifetime token/cost rollup per agent
- CLI smoke commands: `ditto agent list`, `ditto agent show <role-slug>`
- No UI, no hire flow — just the substrate

**Target acceptance criteria:** ~12
**Engine vs product split:** schema, YAML parser, types → `packages/core/src/agents/`; CLI commands + workspace-upgrader wiring → `src/`
**Pre-start dependency:** ADR-039 (or ADR-003 amendment) defining `hired-agent` memory scope must be written and accepted before the `memoryScope` field is schema-locked. If not ready, ship 202 without `memoryScope` and add it in a follow-up.
**Also includes:** Network/Workspace DB file split per ADR-036 §3 (two separate SQLite files, two separate Drizzle migration trees). This was orphaned in the original sub-brief list; explicitly folded in here. If the split work exceeds one build session, spin out as Brief 207.

### Brief 203 — Conversational Hire Flow + HireProposalBlock

**Depends on:** 202
**Unlocks:** 204, 205
**Scope:**
- New cognitive mode: "hire intent" in Self's intake classifier — triggered by utterances of the shape *"I need someone to..."* / *"who handles my..."* / etc. Detection heuristic + LLM confirmation.
- Hire conversation template: 2–4 clarifying questions (scope, frequency, trust boundaries, examples)
- `HireProposalBlock` content block type — new type in `content-blocks.ts` (engine core) + renderer in `packages/web/`
- On approval: write `agents/<role-slug>.yaml` + DB upsert + return new Agent Card
- Edit-inline support: user can modify the proposed YAML before approval
- "Hire from scratch" form fallback (structured editor writing the same YAML) — power-user path
- Telemetry: hire flows initiated / completed / abandoned

**Target acceptance criteria:** ~14
**Engine vs product split:** content block type + renderer + YAML writer → `packages/core/`; Self intake-classifier extension + hire-conversation template + UI form → `src/` + `packages/web/`

### Brief 204 — Agent Card UI Primitive (#10)

**Depends on:** 202
**Unlocks:** 205
**Scope:**
- `AgentCard` component in `packages/web/components/` — renders name, role, icon, trust tier, observation-state indicator, cost month-to-date vs. budget (with warn at 80%, hard stop at 100%), active-conversation ping dot (pattern adopted from Paperclip), status chip (active/paused/archived)
- Dense EntityRow variant for roster/list contexts
- Full card variant for proposal/detail contexts
- Three render surfaces wired: Team roster (new composition intent section), Self's HireProposalBlock output, Work Item assignment UI
- Accessibility: keyboard-navigable, screen-reader labels, color-blind-safe tier indicators

**Target acceptance criteria:** ~10
**Engine vs product split:** entirely `packages/web/` (UI primitive)

### Brief 205 — Agent Detail Page (Simplified 5-tab)

**Depends on:** 202, 204
**Unlocks:** (none — terminal for this phase's agent-detail surface)
**Scope:**
- Route `/agents/<role-slug>` with five tabs: Overview, Instructions, Processes, Activity, Configuration
- Overview: header (Agent Card full variant) + inline budget/trust summary + recent activity digest
- Instructions: markdown editor on `instructions` YAML field with preview
- Processes: list of processes the agent is permitted to run; link to process detail
- Activity: transcripts of past conversations with this agent; RunTranscriptView pattern applied (normalized into semantic groups, Nice/Raw toggle)
- Configuration: structured YAML editor for agent config with validation; writes back to `agents/<role-slug>.yaml`
- Pause/Resume agent affordance; Archive agent (soft delete — YAML moved to `agents/archived/`)

**Target acceptance criteria:** ~13
**Engine vs product split:** activity transcript normalizer (NDJSON → semantic groups) → `packages/core/`; page + tabs + editors → `packages/web/`

### Brief 206 — Self-Supervised Dialogue + Five Interjection Verbs

**Depends on:** 202, 204 (203 recommended; parallelizable with 205)
**Unlocks:** (none — terminal for this phase's supervisory surface)
**Scope:**
- Agent conversation session topology: shared transcript, three distinct actor contexts (user, agent, Self-observer)
- Self-observer harness handler in `packages/core/src/harness/` — subscribes to agent turn streams, runs observation LLM call per trust-tier-defined sampling
- Five interjection verbs as distinct code paths:
  - **Ask** — emits inline content block, awaits user or agent response
  - **Flag** — emits inline content block, non-blocking, user may continue or respond
  - **Pause** — emits inline gate block with Approve/Reject/Review; blocks the agent's proposed side-effect until resolved; trust-gate invocation (existing harness handler reused)
  - **Escalate** — switches active-speaker focus; agent yields; user's next message targets Self
  - **Propose** — emits inline content block with alternative + reasoning; user chooses
- Three-voice UI in conversation surface: user / agent / Self actor differentiation (alignment + styling + chip)
- Trust-tier observation dispatcher: routes per-turn observation per the ADR-038 §3 table
- Transparent observation: Self's notes-so-far included in agent's next-turn context
- Side-effect guard: agent-initiated side-effecting functions require `stepRunId` (Insight-180); trust-gate Pause fires if trust tier < side-effect threshold
- Observation context compositional strategy: when agent roster > N active conversations, Self's observing-context uses a summarization loop instead of monolithic context (defer concrete N to build; start with N=3)

**Target acceptance criteria:** ~17 (at the upper bound — may split further if needed)
**Engine vs product split:** observer harness handler + interjection verb dispatch + trust-tier observation topology + side-effect guard → `packages/core/`; three-voice UI rendering → `packages/web/`

## What Changes (Work Products) — Parent-Brief View

This is the phase-level view. Each sub-brief's own "What Changes" section will be exhaustive.

| Area | Sub-brief |
|---|---|
| `packages/core/src/agents/` (new) — types, schema, YAML parser | 202 |
| `src/db/schema/` — `hiredAgents`, `agentRuntimeState` | 202 |
| `drizzle/` — migration for the new tables | 202 |
| `src/engine/workspace-upgrader.ts` — extend to load `agents/*.yaml` on startup | 202 |
| `src/cli/` — `ditto agent list`, `ditto agent show` | 202 |
| `packages/core/src/content-blocks.ts` — `HireProposalBlock` type | 203 |
| `packages/web/components/blocks/HireProposalBlock.tsx` (new) | 203 |
| `src/engine/self-intake-classifier.ts` — hire-intent cognitive mode | 203 |
| `packages/web/app/agents/new/page.tsx` (new — form fallback) | 203 |
| `packages/web/components/AgentCard.tsx` (new) | 204 |
| `packages/web/components/AgentCardDense.tsx` (new — EntityRow variant) | 204 |
| `packages/web/app/team/page.tsx` (new — roster composition intent) | 204 |
| Work-item assignment UI — add agent assignment affordance | 204 |
| `packages/web/app/agents/[slug]/page.tsx` (new) — Agent Detail | 205 |
| Tab components: Overview, Instructions, Processes, Activity, Configuration | 205 |
| `packages/core/src/harness/run-transcript-normalizer.ts` (new) | 205 |
| `packages/core/src/harness/self-observer-handler.ts` (new) | 206 |
| `packages/core/src/harness/interjection-verbs.ts` (new) | 206 |
| Three-voice UI in conversation surface (`ditto-conversation.tsx` extension) | 206 |
| `src/engine/trust-gate.ts` or similar — Pause wiring to existing trust-gate | 206 |

## User Experience

- **Jobs affected:** Orient, Delegate, Define, Decide, Review — this phase touches all five of the user-facing jobs. The only job not affected is Capture (agents don't change capture mechanics in this phase).
- **Primitives involved:** #10 Agent Card (activated), #1 Daily Brief (extended with agent activity digest), #5 Composition Intent (new "Team" surface), #13 Content Blocks (new HireProposalBlock + Self interjection blocks), #16 Trust Gate (extended with Pause verb).
- **Process-owner perspective:** The user gains a visible team of specialists. "*Ditto did X*" becomes "*The Marketing Manager drafted X; Self flagged a concern; I approved.*" Accountability becomes named. The user can grow trust per specialist over time, mirroring how trust grows with a real team member.
- **Interaction states:**
  - Empty state (no agents yet): the Team composition intent surface shows Self's suggestion to hire the first specialist based on the user's stated goals; conversation surface remains the primary entry point.
  - Loading: Agent Card shows a skeleton; three-voice transcript shows typing indicators per actor.
  - Error: agent config YAML invalid → workspace startup surfaces a legible error with the offending line number; DB mirror does not update until YAML is fixed.
  - Success: hire completes, Agent Card renders, user can address the agent directly.
  - Partial: Self's observation may complete before or after the agent's turn; UI renders both as they arrive; no blocking wait.
- **Designer input:** This brief does not yet have a dedicated Designer spec. One is required **before Brief 204 starts**, covering Agent Card (#10), Agent Detail page, AND the three-voice conversation surface as a single coherent UX pass. Invoke `/dev-designer` once, producing `docs/research/hire-a-specialist-ux.md`. A piecemeal approach (Designer only for 206) will fail review checklist item #9 for 204 and 205.

## Acceptance Criteria (Phase-Level — Boolean)

These are phase-level; sub-briefs carry their own. Phase is complete when all below pass.

1. [ ] A user can say *"I need someone to handle my weekly marketing report"* in a Self conversation and complete a hire within five conversation turns.
2. [ ] The hired agent persists across workspace restart — YAML on disk, DB mirror rebuilt on startup.
3. [ ] The user can address the agent directly — *"Marketing Manager, what's the status?"* — and receive a response in the three-voice surface.
4. [ ] Self's observing presence is visible in every user↔agent conversation at tier 1–3; sampled/async at tier 4–5.
5. [ ] Each of the five interjection verbs (Ask, Flag, Pause, Escalate, Propose) has a distinct UI affordance and is reachable in an integration test.
6. [ ] Pause blocks a side-effecting agent action until the user resolves; if rejected, the action does not execute.
7. [ ] Trust-tier drift changes Self's observation rate measurably. **Test:** Promote an agent from `supervised` to `autonomous` by approving 10 consecutive Self-Paused actions without revision. In 20 subsequent conversation turns, measure the ratio of turns carrying a Self-observer `stepRun` record. Pass: supervised ratio ≥ 0.95; autonomous ratio ≤ 0.30; ratio difference ≥ 0.50.
8. [ ] Agent Card renders in Team roster, HireProposalBlock, and Work Item assignment surfaces with consistent content and styling.
9. [ ] Agent Detail page loads for any hired agent, all five tabs functional, Configuration tab round-trips YAML edits to disk.
10. [ ] Hand-editing `agents/<role-slug>.yaml` on disk and restarting the workspace surfaces the updated config in the UI.
11. [ ] Agent-initiated side effects without `stepRunId` throw at runtime (invocation-guard per Insight-180).
12. [ ] A hired agent with `status: paused` cannot respond to user messages; UI shows its paused state.
13. [ ] A hired agent with `status: archived` is moved to `agents/archived/`; Team roster excludes it by default with a "Show archived" affordance.
14. [ ] No `reports_to`, `company_id`, `tenant_id` field appears anywhere in the schema, YAML, or UI.
15. [ ] No user-facing copy anywhere uses "employee," "worker," "staff," or "CEO/CTO" in agent contexts.
16. [ ] Hire flow telemetry records initiated / completed / abandoned rates.
17. [ ] Type-check passes cleanly at root (`pnpm run type-check`).
18. [ ] No credential value (OAuth token, API key, secret material) appears in any file under `agents/**/*.yaml` or in any archived YAML. Verified by scanning the workspace tree with a credential-pattern linter at phase smoke test.
19. [ ] `agents/*.yaml` schemas reject any field that looks like an inline credential — parser MUST refuse a YAML file containing `access_token`, `api_key`, `client_secret`, `password`, or matching shapes; must accept `credential_ref` / `integration_id` shapes.

## Review Process

1. After each sub-brief completes, spawn a review agent with `docs/architecture.md` + `docs/review-checklist.md` + the parent brief + the sub-brief
2. Review agent checks:
   - Engine/product boundary respected (schema/types in `packages/core/`, product logic in `src/`)
   - Filesystem-legibility preserved (YAML as source of truth, DB as mirror)
   - Five-verb closed enumeration (no new interjection forms introduced)
   - No forbidden terminology in user-facing copy
   - No `reports_to` / `company_id` added
   - Invocation guard (`stepRunId`) enforced on side-effecting agent actions
   - Trust-tier observation rate respected (no always-observe or never-observe shortcuts)
3. Phase-level review after Brief 206: full reviewer pass against all 17 acceptance criteria + integration test of the end-to-end hire-converse-delegate-supervise flow.

## Smoke Test

After Brief 202: `pnpm ditto agent list` returns an empty roster on a fresh workspace. Create `agents/test-agent.yaml` manually with a valid v1 spec. Restart. `pnpm ditto agent list` now returns the test agent. `pnpm ditto agent show test-agent` prints parsed config.

After Brief 203: open the web UI, start a Self conversation, say *"I need someone to handle my weekly content scheduling"*. Self asks clarifying questions, produces a HireProposalBlock, user approves. Check `agents/` directory on disk — a new YAML file exists matching the proposal.

After Brief 204: Navigate to `/team`. Newly hired agent appears as a card. Click — route to detail page exists.

After Brief 205: On `/agents/<slug>`, all five tabs load. Configuration tab lets the user edit instructions; save; on-disk YAML reflects the edit.

After Brief 206: Open a conversation with the hired agent. Type a message that would trigger a Pause (e.g. agent proposes a side-effecting action while still at trust tier 1). Verify Self's Pause appears inline; Approve/Reject buttons work; rejection prevents execution.

Full phase smoke test (all six briefs complete): 
```bash
pnpm run type-check
pnpm test
# Manual:
# 1. Fresh workspace
# 2. Hire "Marketing Manager" via conversation
# 3. Address Marketing Manager directly, ask for a draft
# 4. Observe Self interjecting at tier 1
# 5. Approve/reject three side-effecting actions; observe Pause verb
# 6. Raise trust tier via several successful interactions
# 7. Observe Self shifting to sampled observation
# 8. Pause the agent; verify it stops responding
# 9. Archive the agent; verify it moves to agents/archived/
```

## After Completion

1. Update `docs/state.md` with what changed — new hiredAgents table, YAML layout, Agent Card primitive shipped, three-voice surface live, hire-conversation flow operational
2. Update `docs/roadmap.md` — mark "User-Facing Legibility" phase capability "Activate L2 Agent primitive" as complete; close the open question at `architecture.md:1205` on tenancy shape (already closed structurally by ADR-036 but confirm)
3. Phase retrospective: what worked, what surprised, what to change
4. Update `docs/dictionary.md` with new entries: *Hired Agent*, *Self-observer*, *Interjection* (with the five verbs), *HireProposalBlock*; distinguish from *System Agent*, *Persona*, *Self*
5. Update `docs/human-layer.md` to reflect Agent Card (#10) as shipped and add the three-voice conversation interaction pattern
6. Update `docs/architecture.md` Self section (L2 interface) to reflect manager-of-specialists role; add three-voice conversation to L6
7. Consider: does the Team composition intent become a primitive in `human-layer.md`? If yes, bump primitive count from 16 to 17. Requires architect sign-off.
8. Archive Insight-203 with "absorbed into ADR-038" status
9. Write ADR if a significant decision emerged mid-build that the planning ADRs didn't anticipate

## Open Questions (Parent-Brief Hygiene — Insight-200 Block)

### Q1: Mobile rendering of three-voice conversation

- **Named trigger for resolution:** before Brief 206's UI work begins
- **Decision owner:** Designer (invoked via `/dev-designer`)
- **Artefact shape:** `docs/research/three-voice-conversation-ux.md` with wireframes for Rob's thumb-swipe mobile context
- **Research input:** Paperclip mobile nav as layout reference; Ditto's existing mobile-first constraints (personas.md)

### Q2: Observation context compositional strategy threshold

- **Named trigger:** when a workspace reaches 3+ hired agents with active conversations in rolling-24h (observable via `agent_runtime_state` last-used timestamps)
- **Decision owner:** Architect
- **Artefact shape:** new ADR-NNN "Self's Observing-Context Compositional Strategy"
- **Research input:** context-efficiency research (Insight-012 style); existing cognitive orchestration (ADR-027)

### Q3: Does hire-flow propose a starter process?

- **Named trigger:** design decision in Brief 203
- **Decision owner:** Architect at start of Brief 203
- **Artefact shape:** constraint in Brief 203 or sub-brief split if scope expands
- **Research input:** existing process-generation pipeline; user persona expectations around first-moment-of-value

### Q4: Team composition intent — primitive or not?

- **Named trigger:** phase-completion review
- **Decision owner:** Architect
- **Artefact shape:** architecture.md update + human-layer.md update
- **Research input:** observed user flow during dogfooding of the full phase

## Sizing Note (Insight-004 Compliance)

The parent brief has 17 phase-level acceptance criteria (at the upper bound per Insight-004). It touches four subsystems: DB schema (workspace tier), engine core (agent primitive + observer handler + content blocks), Self intake + conversation logic, web UI. Per Insight-004, this is split along dependency seams into five sub-briefs (202–206), each with ~10–17 criteria and scoped to one subsystem primary + one secondary. The parent brief remains as the coherent design reference; sub-briefs are the build instructions.
