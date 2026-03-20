# Brief: Phase 4c — Meta-Processes + Confidence

**Date:** 2026-03-20
**Status:** draft
**Depends on:** Brief 012 (Phase 4a), Brief 013 (Phase 4b)
**Unlocks:** Phase 5 (work evolution verification)

## Goal

- **Roadmap phase:** Phase 4: Workspace Foundation
- **Capabilities:** Intake-classifier, router, orchestrator, trust-evaluator system agents. Per-output confidence metadata (ADR-011). `aos capture` auto-classification and auto-routing.

## Context

With 4a+4b complete, work items exist, the CLI works, human steps suspend/resume, and capture creates work items with manual classification. Phase 4c replaces manual classification with system agents — the system classifies, routes, and decomposes work automatically. It also introduces per-output confidence metadata (ADR-011's Phase 4 scope) and the trust-evaluator as the first system agent pattern.

This is where the system starts feeling alive. `aos capture "Henderson wants a bathroom quote"` → system classifies as task → routes to quoting process → process runs → output appears in review queue. No manual type/process selection needed.

## Objective

Four system agents running through the harness pipeline. `aos capture` auto-classifies and auto-routes. Per-output confidence appears on step runs. The trust-evaluator system agent replaces the current function-based trust evaluation. The system demonstrates self-referential meta-process governance.

## Non-Goals

- Improvement-scanner system agent (Phase 9)
- Brief-synthesizer system agent (Phase 10)
- Process-analyst, onboarding-guide, process-discoverer system agents (Phase 11)
- Governance-monitor system agent (Phase 12)
- Goal decomposition into multiple sub-tasks across multiple processes (Phase 5 verifies this works E2E; 4c implements the orchestrator but with simple single-process delegation)
- Process importance classification (ADR-011 defers to Phase 10+)

## Inputs

1. `docs/briefs/011-phase-4-workspace-foundation.md` — parent brief
2. `docs/adrs/008-system-agents-and-process-templates.md` — system agent categories, trust-evaluator role
3. `docs/adrs/010-workspace-interaction-model.md` — intake-classifier, router, orchestrator specs
4. `docs/adrs/011-attention-model.md` — per-output confidence (three-level categorical)
5. `docs/research/phase-4-composition-sweep.md` — routing patterns (Inngest AgentKit three-mode, Mastra schema-driven)
6. `src/engine/trust-evaluator.ts` — existing trust evaluation code (to be wrapped as system agent)
7. `src/engine/harness.ts` — harness pipeline (system agents go through it)
8. `src/adapters/claude.ts` — Claude adapter (needs confidence extraction instruction)

## Constraints

- System agents are `category: system` in the agents table (ADR-008). They cannot be deleted by users.
- System agents go through the same harness pipeline as domain agents. They start supervised. (ADR-008/010). Exception: the trust-evaluator starts at `spot_checked` because it wraps already-validated code from Phase 3 and runs after every feedback record — starting supervised would double the review burden without adding value. The other three system agents (intake-classifier, router, orchestrator) start supervised as specified.
- The intake-classifier uses code-based routing initially (deterministic rules matching keywords/patterns to work item types). LLM-based routing is available but starts supervised. This is the Inngest three-mode pattern applied to trust progression.
- The router uses LLM-based routing (it receives available process descriptions as context and selects the best match). Starts supervised — every routing decision is reviewable.
- The orchestrator starts as a simple pass-through (single task → single process assignment). Full goal decomposition into multiple sub-tasks is Phase 5. The orchestrator exists in 4c to establish the pattern.
- Per-output confidence is a three-level categorical signal: `high`, `medium`, `low`. Stored on `stepRuns`. The trust gate uses `low` → item review regardless of trust tier.
- The Claude adapter system prompt gains a confidence self-assessment instruction.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Code-based routing (deterministic) | Inngest AgentKit `FnRouter` | Fast, no LLM calls, fully predictable. First routing mode. |
| LLM-based routing (flexible) | Inngest AgentKit `RoutingAgent` + Mastra Networks | LLM receives process schemas, selects best match. Second routing mode. |
| System agent category | ADR-008 | `category: system`, `systemRole` field. Shipped with platform. |
| Three-level confidence | ADR-011 | Content moderation three-band model adapted to categorical (high/medium/low). |
| Trust-evaluator as system agent | ADR-008 | First system agent. Trust evaluation code already exists — wrapping as agent. |
| Orchestrator-worker | Anthropic multi-agent research | Lead agent decomposes. Simple pass-through in 4c; full decomposition in Phase 5. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `category` field to agents table (`system` | `domain`, default `domain`). Add `systemRole` field (nullable text). Add `confidence` field to stepRuns (`high` | `medium` | `low`, nullable). Add `confidenceLevelValues` type union. Note: the existing `processOutputs.confidenceScore` (numeric real) remains for backward compatibility — it's the raw score. The new `stepRuns.confidence` (categorical) is the ADR-011 three-level signal that drives trust gate escalation. The trust gate reads from `stepRuns.confidence`, not `processOutputs.confidenceScore`. |
| `src/engine/system-agents/intake-classifier.ts` | Create: System agent that classifies work items. Code-based mode: keyword/pattern matching → type assignment. LLM-based mode: Claude classifies type + urgency from content. Returns `{ type, urgency, reasoning }`. |
| `src/engine/system-agents/router.ts` | Create: System agent that matches work items to processes. Receives active process descriptions as context. Returns `{ processSlug, confidence, reasoning }`. LLM-based (Claude). |
| `src/engine/system-agents/orchestrator.ts` | Create: System agent that manages goal lifecycle. Phase 4c: simple pass-through (assigns incoming task to router-selected process). Phase 5: full decomposition. |
| `src/engine/system-agents/trust-evaluator.ts` | Create: System agent wrapping existing `src/engine/trust-evaluator.ts`. Runs as a system process after every feedback record. Goes through harness pipeline (starts supervised). |
| `processes/intake-classifier.yaml` | Create: Process definition for intake classification meta-process. |
| `processes/router.yaml` | Create: Process definition for work routing meta-process. |
| `processes/orchestrator.yaml` | Create: Process definition for orchestration meta-process. |
| `processes/trust-evaluation.yaml` | Create: Process definition for trust evaluation meta-process. |
| `src/cli/commands/capture.ts` | Modify: Replace manual type/process selection with auto-classification pipeline: capture → intake-classifier → router → create work item with assigned process. Falls back to manual selection if classification confidence is low or no matching process found. |
| `src/adapters/claude.ts` | Modify: Add confidence self-assessment instruction to system prompt. Extract confidence level from agent response metadata. |
| `src/engine/harness-handlers/trust-gate.ts` | Modify: Read `confidence` from step run. If `low` → set `trustAction` to `pause` regardless of trust tier (ADR-011 escalation). |
| `src/engine/heartbeat.ts` | Modify: System agent process runs are triggered programmatically (not via CLI start). Intake-classifier runs on capture. Router runs after classification. Trust-evaluator runs after feedback. |

## User Experience

- **Jobs affected:** Capture (`aos capture` becomes auto-classifying), Orient (confidence visible on review items)
- **Primitives involved:** Quick Capture (P12 — enhanced with auto-classification)
- **Designer input:** `docs/research/phase-4-workspace-cli-ux.md` — Scenario 3 (capture interaction states). Confidence escalation state.

**Auto-classification example (from Designer spec):**
```
$ aos capture "Henderson also wants HW quote, Rinnai system, access is tight"

✓ Captured as task
  Classified: quote request (quoting process)
  Routed to: quoting
  Work item: #44

The quoting process will draft this. You'll see it in your review queue.
```

**With supervised intake-classifier:**
```
$ aos capture "Henderson also wants HW quote, Rinnai system, access is tight"

✓ Captured as task
  Classified: quote request → routed to quoting
  Work item: #44
  (Classification is supervised — you'll build confidence in routing over time.)
```

## Acceptance Criteria

1. [ ] `agents` table has `category` (`system`|`domain`) and `systemRole` (nullable) fields
2. [ ] `stepRuns` table has `confidence` field (`high`|`medium`|`low`, nullable)
3. [ ] Four system agent process definitions exist in `processes/` and sync via `pnpm cli sync`
4. [ ] System agents are created with `category: system` and cannot be deleted via CLI
5. [ ] `aos capture` auto-classifies work item type via intake-classifier system agent
6. [ ] `aos capture` auto-routes to a process via router (LLM selects from active process descriptions)
7. [ ] When classification confidence is low or no matching process found, `aos capture` falls back to manual selection (interactive prompt)
8. [ ] Trust-evaluator system agent runs after every feedback record (wrapping existing trust evaluation logic)
9. [ ] Per-output confidence level is stored on `stepRuns` records after Claude adapter extracts it from agent responses
10. [ ] Trust gate escalates `low` confidence outputs to item review regardless of trust tier (ADR-011)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: system agents go through harness pipeline, trust-evaluator wraps (not duplicates) existing logic, confidence routing matches ADR-011, capture auto-classification works E2E

## Smoke Test

```bash
# Sync system agent processes
pnpm cli sync
pnpm cli status
# Expected: system agent processes visible (or hidden — Architect decides)

# Auto-classification via capture
pnpm cli capture "I need a quote for replacing the hot water system at 42 Oak Ave"
# Expected: auto-classified as task, routed to quoting process, work item created

# Confidence on review items
pnpm cli status
# Expected: review items show confidence level (high/medium/low)

# Low confidence escalation
# (Trigger a process run where agent outputs low confidence)
pnpm cli status
# Expected: low-confidence item from autonomous process appears in NEEDS YOUR ATTENTION

# Trust-evaluator
pnpm cli approve <id>
pnpm cli trust <process>
# Expected: trust state updated (trust-evaluator ran after approval)

# Full E2E: capture → classify → route → execute → review → approve → trust update
pnpm cli capture "Need a follow-up email for the Henderson bathroom quote"
# Wait for heartbeat
pnpm cli status
# Expected: review item from follow-up process appears
pnpm cli approve <id>
# Expected: approved, trust data updated
```

## After Completion

1. Update `docs/state.md` with Phase 4 complete
2. Update `docs/roadmap.md` — Phase 4 status → done
3. Move all Phase 4 briefs (011-014) to `docs/briefs/complete/`
4. Write ADR-009 (citty + @clack/prompts)
5. Phase 4 retrospective
6. Proceed to Phase 5 (work evolution verification)
