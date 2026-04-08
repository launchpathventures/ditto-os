# Brief 101: Find-or-Build Orchestration — Goal-Seeking Orchestrator

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Brief 098 (continuous operation), Insight-142 (coverage-agent), Insight-099 (Process Model Library), Insight-163 (find-or-build orchestration)
**Unlocks:** Entrepreneurial-grade goal decomposition, dynamic capability building, unified front-door-to-workspace reasoning

## Goal

- **Roadmap phase:** Phase 11+ (Process Model Foundation + Orchestrator Evolution)
- **Capabilities:** Goal-level reasoning, find-or-build routing, output threading, action boundaries, goal-level trust, library curation

## Context

The orchestrator (Brief 021/022) currently works as a **plan executor**: it takes a goal + a single process slug, maps 1:1 to that process's step list, and escalates to the user when no process matches. This prevents Alex from handling complex, multi-process goals like "build me a freelance consulting business" — goals that require processes that don't exist yet.

The infrastructure to build processes dynamically already exists: `web-search` (Perplexity), `generate_process`, `generate-integration --spec`, dev roles, trust gates. The orchestrator just doesn't know it can trigger the Build meta-process when it hits a gap.

Strategic conversation (2026-04-07/08) established: one reasoning path for all contexts (front door, workspace, budgeted workspace), with system-enforced action boundaries determining what Alex can do at each stage. Black-hat analysis identified 14 risks, all mitigated. Three load-bearing dependencies: Process Model Library, goal-level trust, system-enforced action boundaries.

## Objective

Transform the orchestrator from a plan executor into a goal seeker that reasons about what's needed, finds existing processes or builds missing ones, threads outputs across sub-goals, and operates within system-enforced action boundaries — all through the same reasoning path regardless of relationship stage.

## Non-Goals

- **Process Model Library content creation** — this brief designs the infrastructure, not the initial library of models (that's a separate content effort)
- **Cross-instance community intelligence** — the multi-tenant learning flywheel (Insight-142 §3) is Phase 13+
- **Voice interaction** — hands-free approval and goal capture
- **Physical product fulfilment** — supply chain, shipping, inventory management
- **Financial services integration** — payment processing, invoicing (separate integration briefs)
- **LLM routing Mode 2** — the existing substring routing within processes; this brief addresses goal-level reasoning, not step-level routing

## Inputs

1. `.context/goal-seeking-orchestration-design.md` — design conversation conclusions (session-specific context file; key decisions are captured in Insight-163 and this brief for persistence)
2. `docs/insights/163-find-or-build-orchestration.md` — core insight
3. `docs/insights/142-coverage-agent-proactive-gap-detection.md` — coverage-agent design (gap reasoning)
4. `docs/insights/099-process-model-library-with-app-binding.md` — Process Model Library design
5. `src/engine/system-agents/orchestrator.ts` — current decomposition and routing
6. `src/engine/system-agents/router.ts` — matchTaskToProcess
7. `src/engine/heartbeat.ts` — goalHeartbeatLoop, orchestratorHeartbeat
8. `src/engine/self-tools/generate-process.ts` — process generation
9. `src/engine/web-search.ts` — Perplexity search
10. `src/engine/industry-patterns.ts` — existing industry patterns
11. `docs/architecture.md` — meta-process architecture, system agents
12. `docs/adrs/015-meta-process-architecture.md` — meta-process constraints
13. `docs/adrs/008-system-agents-and-process-templates.md` — system agent constraints
14. `docs/adrs/010-workspace-interaction-model.md` — workspace interaction model

## Constraints

- The existing 1:1 decomposition path (goal maps directly to one process) MUST continue to work unchanged — it's the fast path for simple goals
- Build depth = 1: the orchestrator can trigger Build, Build cannot trigger Build
- First-run gate: generated processes must succeed their first supervised run before the orchestrator treats them as existing capability
- Action boundaries MUST be system-enforced (tool availability per context), not prompt-enforced
- Front-door research MUST be capped (per-conversation limit on web-search calls)
- Process Model Library MUST be checked before build-from-scratch (cost amortization)
- Goal-level trust can only RELAX sub-process trust, never tighten beyond the process's own tier (consistent with session trust in Brief 053)
- All new system agents go through the harness pipeline (ADR-008 constraint)
- Cognitive Framework governs all reasoning (ADR-015 constraint)
- Breaking changes to processes/meta-processes require human approval (ADR-015 constraint)
- ADR-015 Section 7 states "no new system agents introduced" — this is stale and must be updated alongside ADR-008 when Brief 104 ships
- The orchestrator's new clarity assessment (dimension map) is Goal Framing work. The Self drives the consultative conversation; the orchestrator receives the dimension map as input. ADR-015's agent-to-meta-process mapping must note that the orchestrator participates in Goal Framing (via the Self) as well as Execution

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Goal decomposition into sub-goals | LangGraph plan-and-execute | pattern | Goal-level reasoning (not step-level) matches plan-and-execute's approach |
| Route-around on blocked tasks | Temporal Selectors | pattern | Already proven in orchestratorHeartbeat; extends to cross-process goals |
| Build-on-gap routing | Original to Ditto | — | No existing system routes unmatched goals to dynamic process creation |
| Action boundaries per context | Capability-based security | pattern | Tool availability as permission boundary, not prompt instructions |
| Goal-level trust inheritance | Session trust (Brief 053) | pattern | Extends existing session trust to goal scope |
| Process Model Library as first check | Package manager pattern (npm, apt) | pattern | Check registry before building from source |
| Library curation pipeline | App store review model | pattern | AI pre-screening + human review gate |
| Dimension map for clarity | Consultative selling (MEDDIC/BANT-inspired) | pattern | Structured qualification before commitment — adapted from sales qualification to goal clarity assessment |
| Output threading via LLM | Original to Ditto, inspired by multi-agent handoff patterns (AutoGen, Mastra) | — | LLM contextually maps outputs between autonomous process stages |

## What Changes (Work Products) — Parent Brief

This parent brief defines the overall design. Implementation is split into three sub-briefs:

| Sub-Brief | Scope | Depends on |
|-----------|-------|-----------|
| **Brief 102: Goal-Level Reasoning & Action Boundaries** | LLM-powered goal decomposition, dimension map, action boundary enforcement | None (first) |
| **Brief 103: Find-or-Build Routing** | Build-on-gap behaviour, Process Model Library check, first-run gate, goal-level trust | Brief 102 |
| **Brief 104: Library Curation Pipeline** | Unified process-validator agent, standardisation, admin review, publication | Brief 103 |

### Architectural Design

#### The Unified Reasoning Path

```
User states goal (any context: front door, workspace, budgeted)
  │
  ▼
┌─────────────────────────────────────┐
│  CLARITY ASSESSMENT (dimension map) │
│  Outcome, Assets, Constraints,      │
│  Context, Infrastructure, Risk      │
│                                     │
│  confidence < threshold?            │
│  YES → stay conversational          │
│  NO  → proceed to decomposition     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  GOAL-LEVEL DECOMPOSITION (LLM)    │
│                                     │
│  Inputs:                            │
│  - Goal + dimension map context     │
│  - Existing process inventory       │
│  - Process Model Library            │
│  - Industry patterns                │
│  - Web-search (if needed)           │
│  - Explicit assumptions list        │
│                                     │
│  Output:                            │
│  - Sub-goals (not process steps)    │
│  - Each tagged: find | build        │
│  - Dependencies between sub-goals   │
│  - Estimated effort per sub-goal    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  ACTION BOUNDARY CHECK              │
│                                     │
│  Front door?                        │
│  → Present plan, stop               │
│                                     │
│  Workspace, no budget?              │
│  → Execute find-path sub-goals      │
│  → Build with user approval         │
│                                     │
│  Workspace, budgeted?               │
│  → Full find-or-build execution     │
│  → Budget allocation + tracking     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  FIND-OR-BUILD ROUTING (per sub-goal)│
│                                     │
│  1. Check Process Model Library     │
│     → match? Adopt + bind (cheap)   │
│  2. matchTaskToProcess (existing)   │
│     → match ≥0.6? Route (free)      │
│  3. Trigger Build meta-process      │
│     → research → design → generate  │
│     → first-run gate                │
│                                     │
│  Build depth = 1 (no recursion)     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  GOAL HEARTBEAT LOOP (extended)     │
│                                     │
│  - Execute sub-goals with deps      │
│  - Route-around blocked sub-goals   │
│  - Thread outputs between sub-goals │
│  - Bundled reviews at checkpoints   │
│  - Goal-level trust inheritance     │
│  - Re-evaluate on feedback          │
└─────────────────────────────────────┘
```

#### Key Types (New/Extended)

```typescript
/** Goal decomposition — replaces process-step decomposition for goals */
interface GoalDecomposition {
  goalId: string;
  subGoals: SubGoal[];
  assumptions: string[];         // explicit assumptions for user review
  dimensionClarity: DimensionMap; // clarity assessment snapshot
  confidence: "high" | "medium" | "low";
}

interface SubGoal {
  id: string;
  description: string;
  routeType: "find" | "build";   // orchestrator's assessment
  processSlug: string | null;     // if find: matched process
  modelSlug: string | null;       // if build: matched Process Model template
  dependsOn: string[];            // sub-goal IDs
  estimatedEffort: "light" | "medium" | "heavy";
  status: "pending" | "building" | "ready" | "in_progress" | "completed" | "paused" | "failed";
  outputs: Record<string, unknown> | null; // for threading to dependents
}

interface DimensionMap {
  outcome: { clarity: "clear" | "vague" | "unknown"; summary: string };
  assets: { clarity: "clear" | "vague" | "unknown"; summary: string };
  constraints: { clarity: "clear" | "vague" | "unknown"; summary: string };
  context: { clarity: "clear" | "vague" | "unknown"; summary: string };
  infrastructure: { clarity: "clear" | "vague" | "unknown"; summary: string };
  riskTolerance: { clarity: "clear" | "vague" | "unknown"; summary: string };
}

/** Action boundary — determines what the orchestrator can do */
type ActionBoundary = "front_door" | "workspace" | "workspace_budgeted";

/** Goal-level trust — sub-processes inherit this unless their own tier is more restrictive */
interface GoalTrust {
  tier: TrustTier;
  reviewMode: "individual" | "bundled"; // bundled = checkpoint-based reviews
}
```

#### `@ditto/core` Boundary

`GoalDecomposition`, `SubGoal`, and `DimensionMap` types are engine primitives — they answer "how does the harness decompose goals?" and could be used by ProcessOS. These go in `packages/core/`.

`ActionBoundary` and `GoalTrust` are Ditto product layer — they reference workspace/relationship concepts specific to Ditto. These stay in `src/engine/`.

The `processModels` table schema (Brief 104) goes in `packages/core/src/db/` as it's a library management primitive.

#### Coverage-Agent as Shared Reasoning Engine

The coverage-agent's gap-detection logic becomes a shared function callable by both:
- **Proactive trigger** (scheduled, daily): "scan all user context, find gaps, produce suggestions"
- **Reactive trigger** (orchestrator, at decomposition time): "for this specific goal, find capability gaps"

Same reasoning engine, same knowledge sources (Process Model Library, industry patterns, user model, web-search), different context. Dismissal tracking is context-aware: a proactive dismissal doesn't block a goal-requirement.

## User Experience

- **Jobs affected:** Orient (goal decomposition visibility), Review (bundled reviews), Delegate (goal with budget), Decide (action boundary awareness)
- **Primitives involved:** StatusCardBlock (sub-goal progress), ProcessProposalBlock (build proposals), ReviewCardBlock (bundled reviews)
- **Process-owner perspective:** The user states a goal. Alex assesses clarity, asks focused questions if needed, then presents a decomposition with explicit assumptions. The user sees sub-goals, which ones exist vs need building, and estimated effort. At the front door, this IS the sales pitch. In the workspace, execution begins after approval. The user reviews at natural checkpoints (phase boundaries), not per-step.
- **Interaction states:** Clarity assessment (conversational), decomposition preview (plan view), execution (progress tracking with bundled reviews), completion (goal summary)
- **Designer input:** Not invoked — lightweight UX section. Full UX design needed before build.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: consistency with ADR-015 (meta-process constraints), ADR-008 (system agent patterns), ADR-010 (workspace interaction model), existing orchestrator interfaces, trust system constraints
3. Present work + review findings to human for approval

## After Completion

1. Update `docs/state.md` with parent brief + sub-briefs created
2. Update `docs/roadmap.md` — add Goal-Seeking Orchestration as Phase 11+ milestone
3. Update `docs/architecture.md` — orchestrator evolution, action boundaries
4. Update ADR-015 — Build meta-process reactive trigger
5. Update ADR-008 — new system agent (`process-validator`), update Section 7 "no new system agents" statement
6. Update architecture.md system agent count (currently says "Thirteen")
