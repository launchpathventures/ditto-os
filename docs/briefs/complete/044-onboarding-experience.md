# Brief: Phase 10f — Onboarding Experience

**Date:** 2026-03-25
**Status:** draft
**Depends on:** Brief 040 (Self Extensions — tools, user model, confirmation)
**Unlocks:** First real user onboarding. Validates conversation-first model end-to-end.

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard
- **Capabilities:** Onboarding as native system process, runtime process adaptation (`adapt_process`), knowledge synthesis card, process-proposal-card, AI coaching behavioural layer

## Context

Brief 040 delivers the Self's tools (work creation, process definition, trust, capture, detail, integration auth) and the 9-dimension user model. This brief uses those tools to deliver the actual onboarding experience — the three-act arc where Ditto gets to know the user, produces their first process, and demonstrates value in a single session.

The onboarding is a native engine process (`processes/onboarding.yaml`, `system: true`) that the Self adapts at runtime based on what it learns (Insight-091). This is the first process to use runtime adaptation — a new engine capability that enables the Self to add, remove, or modify steps mid-flight.

### Design inputs

- `docs/research/onboarding-interaction-spec-ux.md` — Designer's full interaction spec (three acts, persona stress tests, coaching patterns, conversation components)
- `docs/research/onboarding-intake-coaching-patterns.md` — Researcher's external patterns (14 patterns, 5 gaps)
- Insights 074 (Self as Guide), 079 (Gathering→Proposing→Working), 080 (Artefact-primary), 081 (Guided Canvas / battleships model), 090 (Deep intake), 091 (Mutable processes)

## Objective

A new user opens Ditto, has a conversation with the Self, and within 15-20 minutes has: (1) their business understood and reflected back to them, (2) a first process created from conversation, and (3) real work submitted to that process. The onboarding runs through the engine harness with trust, quality, and feedback governance — same as every other process.

## Non-Goals

- Guided canvas with structured input types (Insight-081 — selectors, sliders, tag pickers). MVP uses conversation + knowledge synthesis card. Guided canvas is Phase 10+1.
- Voice input during onboarding (future phase)
- Multi-user/team onboarding (Phase 13 — Nadia onboards herself, team delegation comes later)
- Full adaptive process execution for arbitrary processes. This brief delivers `adapt_process` but scopes usage to system processes initially.
- Onboarding analytics dashboard (value metrics tracked in DB but no UI yet)

## Inputs

1. `docs/research/onboarding-interaction-spec-ux.md` — Designer's interaction spec (FULL — this is the primary design reference)
2. `docs/briefs/038-phase-10-mvp-architecture.md` — parent architecture
3. `docs/briefs/040-self-extensions.md` — Self tools this brief depends on
4. `src/engine/self.ts` + `self-delegation.ts` — existing Self
5. `src/engine/heartbeat.ts` — step execution (verify re-read behaviour)
6. `src/engine/process-loader.ts` — YAML validation
7. `processes/intake-classifier.yaml` — pattern for system process YAML

## Constraints

- MUST implement onboarding as a native YAML system process — not a hardcoded UI flow
- MUST use `adapt_process` tool for runtime YAML modification — the Self adapts the onboarding steps based on what it learns about the user
- MUST produce a knowledge synthesis card that the user can see and edit — corrections captured as feedback
- MUST produce a process-proposal-card when the Self has enough context — plain language steps, not system vocabulary
- MUST deliver value (first process + first work item) within a single session (<20 min)
- MUST NOT use system vocabulary in any user-facing output (Insight-073): no "process," "agent," "trust tier," "YAML," "harness"
- MUST scope `adapt_process` to system processes in this brief — user process adaptation is a future extension
- MUST log every process adaptation as an activity with before/after and reasoning
- AI coaching MUST be woven into conversation naturally — never blocking, never a separate mode, intermittent (not after every correction)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Onboarding as system process YAML | Existing `intake-classifier.yaml`, `trust-evaluation.yaml` | extend | Proven pattern for system processes |
| `adapt_process` (runtime YAML mutation) | Insight-091, Original to Ditto | original | No surveyed product adapts process definitions at runtime from conversation |
| Knowledge synthesis card | `docs/research/self-meta-processes-ux.md` section 1 | original | Designed in Designer session, no external source |
| Process-proposal-card | Insight-079 | original | Transition from gathering to structured work |
| Three-act onboarding arc | Superhuman white-glove + SPIN framework | pattern | Superhuman's "prove value in session" + SPIN's Situation→Problem→Implication→Need-payoff |
| Progressive profiling | HubSpot, Typeform | pattern | Multi-session deepening with value exchange |
| AI coaching embedded in workflow | Wise Prompt Coach + Duolingo adaptive | pattern | Coach through doing, not lecturing |
| "Self speaks first" / blank prompt problem | Research: 60% of users never send a first message to a blank input | pattern | Self must initiate, not wait |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `processes/onboarding.yaml` | Create: system onboarding process (gather-basics → identify-first-pain → reflect-understanding → propose-first-process → first-real-work) |
| `src/engine/self-tools/adapt-process.ts` | Create: `adapt_process` tool — writes run-scoped definition override on `processRuns` (not canonical `processes.definition`). Template stays durable, run instance gets the adapted version. Validates adapted YAML via `process-loader` schema before writing. Guards: cannot remove/reorder steps that are `running` or `waiting_review`. Scoped to system processes via DB check on `system: true`. Logs adaptations as activities. |
| `src/engine/self-delegation.ts` | Modify: register `adapt_process` tool |
| `src/db/schema.ts` | Modify: add `definitionOverride` (nullable JSON) and `definitionOverrideVersion` (integer, default 0) columns to `processRuns` table. Optimistic locking on version for concurrent adaptation safety (ADR-020). |
| `src/engine/heartbeat.ts` | Modify: read `processRuns.definitionOverride` if present, fall back to `processes.definition`. Re-read at each step boundary. |
| `packages/web/components/self/knowledge-synthesis.tsx` | Create: knowledge synthesis card — shows what the Self has learned, categorised, with completeness indicators. Editable. Corrections captured as feedback. |
| `packages/web/components/self/process-proposal.tsx` | Create: process-proposal-card — plain language steps with status (✓/→/○), approve/adjust actions |
| `packages/web/components/self/gathering-indicator.tsx` | Create: subtle progress indicator during gathering phase ("Getting to know your business...") |
| `cognitive/self.md` | Modify: add onboarding conversation guidelines (open questions, user talks more, industry-adaptive) and AI coaching principles (coach through work, never block, celebrate specificity, honest about limitations) |
| `packages/web/app/api/chat/route.ts` | Modify: handle knowledge-synthesis and process-proposal content blocks in streaming |

## User Experience

- **Jobs affected:** Define (understanding user's world, creating first process), Orient (what's possible), Capture (gathering context), Review (knowledge synthesis confirmation)
- **Primitives involved:** Conversation Thread (primary), Knowledge Synthesis Card (new — extends catalog), Process Proposal Card (new — extends catalog)
- **Process-owner perspective:** See Designer interaction spec sections 1.1-1.6 (Act 1). Rob opens Ditto → Self greets → 12-minute conversation → knowledge synthesis appears → process proposed → Henderson quote submitted → value delivered. Under 20 minutes.
- **Interaction states (from Designer spec):**
  - *Brand new:* Full-screen conversation. Self speaks first.
  - *Gathering:* Adaptive questions + "Getting to know your business..." indicator
  - *Knowledge checkpoint:* Knowledge synthesis card inline. [This looks right] / [Let me fix something]
  - *Proposing:* Process-proposal-card inline. [Looks good] / [I'd change something]
  - *First work — waiting:* "Working on your Henderson quote..." pulsing indicator
  - *First output:* Presented conversationally with approve/edit actions
  - *Correction:* Inline edit. Self acknowledges + intermittent coaching aside.
  - *Session ending:* "Your quoting is set up. See you tomorrow."
  - *Returning user:* Self briefs on what happened, continues relationship.
- **Designer input:** `docs/research/onboarding-interaction-spec-ux.md` — full three-act spec with persona stress tests

## Acceptance Criteria

1. [ ] `processes/onboarding.yaml` exists as a `system: true` process with 5 steps: gather-basics, identify-first-pain, reflect-understanding, propose-first-process, first-real-work
2. [ ] `adapt_process` tool: writes adapted definition to `processRuns.definitionOverride` (run-scoped copy, not canonical `processes.definition`). Template stays durable. Can add, remove, reorder, or modify steps. Changes take effect on next heartbeat iteration.
3. [ ] `adapt_process` validates adapted definition against process-loader schema before writing — rejects invalid adaptations (bad executor type, missing depends_on targets, etc.)
4. [ ] `adapt_process` guards: cannot remove or reorder steps that are currently `running` or `waiting_review`. Cannot remove steps already `approved` from the definition.
5. [ ] `adapt_process` logs every adaptation as an activity (process_id, run_id, step changes with before/after, reasoning, triggered_by)
6. [ ] `adapt_process` scope enforcement in code: checks `system: true` on target process record in DB, rejects non-system processes. In this brief, only `onboarding` process is expected to be adapted.
7. [ ] `processRuns.definitionOverride` column exists (nullable JSON). Heartbeat reads override if present, falls back to canonical definition. Re-reads at each step boundary.
8. [ ] Knowledge synthesis card renders in conversation: categorised knowledge areas, completeness indicators, editable. Corrections captured as feedback via existing `feedback-recorder.ts`.
9. [ ] Process-proposal-card renders in conversation: plain language step list with ✓/→/○ status, [Looks good] / [I'd change something] actions
10. [ ] Gathering indicator appears during onboarding conversation: "Getting to know your business..." (subtle, not a progress bar)
11. [ ] Self speaks first for new users — never a blank input waiting for the user. The 60% blank-prompt-problem is eliminated.
12. [ ] Self adapts onboarding run definition after learning business type: adds industry-specific steps, removes irrelevant ones (verified: Rob gets trades questions, Libby gets content/brand questions). Template YAML unchanged.
13. [ ] Onboarding completes with first process created AND first work item submitted within one session
14. [ ] AI coaching: Self provides at least one coaching moment during the first review cycle ("when you tell me *why*, I learn faster" or similar). Coaching never blocks work.
15. [ ] `cognitive/self.md` updated with onboarding conversation guidelines and AI coaching principles
16. [ ] No system vocabulary in any user-facing onboarding output — verified: zero instances of "process," "agent," "trust tier," "YAML," or "harness" in rendered conversation

## Review Process

1. Spawn review agent with architecture.md + review-checklist.md + this brief + onboarding interaction spec
2. Review checks: onboarding runs through harness pipeline (trust, memory, feedback), `adapt_process` is properly scoped, no system vocabulary leaks, knowledge synthesis corrections are captured as feedback, heartbeat re-read verified
3. Present + review to human

## Smoke Test

```bash
# 1. Start app as new user
# Expected: Self greets: "Hi — I'm Ditto..."

# 2. Answer: "I run a plumbing company, 12 staff"
# Expected: Gathering indicator visible. Self asks about pain points.
# Check DB: onboarding.yaml adapted (trades-specific steps added)

# 3. Answer: "Quoting takes too long. I spend every evening at the kitchen table."
# Expected: Self asks about quoting process specifics.

# 4. Describe quoting process (materials, labour, margin)
# Expected: Knowledge synthesis card appears showing what Self learned.
# Click "This looks right" → acknowledged.

# 5. Self proposes quoting process
# Expected: Process-proposal-card with plain language steps.
# Click "Looks good — let's try it" → process created.
# Check DB: new process YAML exists, validated by process-loader.

# 6. Describe Henderson bathroom reno
# Expected: Self creates work item, routes to quoting process.
# Process runs → output presented for review.

# 7. Edit the output (bump labour to 22 hours)
# Expected: Self acknowledges edit. Coaching aside: "that's useful —
# when you tell me the hours are wrong and why, I learn faster."
# Check DB: edit diff captured in activities.

# 8. Verify no system vocabulary
# Grep rendered conversation for: "process", "agent", "trust", "YAML", "harness"
# Expected: zero matches
```

## Pre-Build Requirement

**ADR-020 (Runtime Process Adaptation) must be written and accepted before build begins.** This ADR must address:
- Template durability vs run-scoped overrides (decision: `processRuns.definitionOverride`)
- Concurrency guards (cannot modify steps in `running` or `waiting_review`)
- Schema validation on adapted definitions
- Scope control (system processes only initially)
- Reconciliation with "processes are durable" principle (architecture.md line 62)

This is a fundamental extension to the process model and needs architectural ratification, not just an insight.

## After Completion

1. Update `docs/state.md` — onboarding experience shipped
2. ADR-020 already accepted (pre-build). Update ADR-016 — Self can adapt process runs; `adapt_process` tool added.
3. Update `docs/architecture.md` — Layer 1: process runs support definition overrides (Insight-091). Layer 2: Self as process adapter. Template definitions remain durable.
4. Phase 10 integration test: run full onboarding → first process → first output → review → briefing next day (chain across briefs 039→040→044→043)
