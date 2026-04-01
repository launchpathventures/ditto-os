# Insight-133: One Loop, Not Special Cases

**Date:** 2026-04-01
**Trigger:** PM triage — user pointed out the dev process is fundamentally the same as any work: raise → clarify → plan → do → review → iterate → complete/reuse. Building separate "dev pipeline UI" or "goal management UI" is the wrong abstraction.
**Layers affected:** L1 Process, L3 Harness, L6 Human
**Status:** active

## The Insight

There is one universal work loop in Ditto:

1. **Raise** — user brings something (question, task, goal, idea)
2. **Clarify** — Self interprets intent, asks questions, gets clear on what's needed
3. **Plan** — decompose into steps, identify process, create or reuse a process definition
4. **Do** — execute steps (produce artifact, build code, run analysis, take human action)
5. **Review** — check quality, get approval at trust gates
6. **Iterate** — refine based on feedback
7. **Complete or Reuse** — done, or the pattern becomes a reusable process

This loop is the SAME whether the work is:
- Building a Ditto engine feature (dev pipeline)
- Producing a document (artifact)
- Running a client onboarding (business process)
- Researching a topic (knowledge work)
- Building out another project entirely

The dev pipeline (`dev-pm → dev-researcher → dev-designer → dev-architect → dev-builder → dev-reviewer → dev-documenter`) is just ONE process definition that fits this universal loop. It is not architecturally special.

**CORRECTION (battle-tested against all 24 ADRs, engine code, architecture spec, and insights 120-131):**

The universal loop is confirmed — ADR-010, ADR-015, ADR-008 all support it explicitly. But the original claim that "no opinionated UI layers are needed" was wrong. The architecture IS opinionated about workspace structure (three-panel layout, composition intents, artifact mode, spatial consistency). What's adaptive is content rendering (ContentBlocks), not structure.

The real gap is threefold:
1. **Engine:** orchestratorHeartbeat exists but isn't auto-triggered. Goal decomposition creates child items but doesn't auto-route them. No pipeline chaining.
2. **Self:** responds with text, not blocks. 22 ContentBlock types exist but Self never emits them in conversation (Insights 130-131).
3. **Composition intents:** sidebar items (Today, Projects, Work, Routines, Roadmap) are empty containers with no action affordances — user doesn't know what to do (Insight-134).

Conversations happen inside contexts. Each composition intent needs empty/active/rich states with clear action affordances (buttons, suggested prompts) that route through conversation with Self. "Start a project" doesn't open a form — it starts a contextual conversation where Self does goal framing.

## Implications

1. **Universal loop confirmed, but UI needs contextual scaffolding.** Composition intents provide structure (where am I, what exists, what can I do). Conversation with Self provides intelligence (goal framing, planning, execution). Blocks render the results. Three layers, not one.
2. **Engine orchestrator wiring is the critical path.** Without auto-triggering orchestratorHeartbeat, auto-routing decomposed tasks, and goal-level trust controls, "set a goal and walk away" is impossible regardless of UI quality.
3. **Block emission (069/070) is necessary but insufficient.** Self must emit blocks AND the orchestrator must chain runs AND composition intents must provide action affordances. All three are needed.
4. **Dev process is a template, not a special case.** Confirmed by ADR-008, ADR-015, architecture.md. `processes/dev-pipeline.yaml` is one process definition among many, using the same harness as all others.
5. **No bespoke CRUD screens.** Actions route through conversation with Self. But composition intents DO need designed states (empty, active, rich) — these are block compositions, not separate page designs.

## Where It Should Land

- Architecture spec: clarify universal work loop + composition intent states
- Engine briefs: orchestrator auto-wiring (heartbeat queue-scanning, auto-routing, goal-level trust)
- UI briefs: composition intent action affordances (empty/active/rich states per intent)
- Block emission briefs (069/070): reframed as "how the universal loop becomes visible"
- human-layer.md: update composition intent specs with state definitions
- Insight-132 partially superseded: engine gap is real, "Goal-to-Pipeline UI" brief is not — actions route through Self in context
