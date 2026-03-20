# Brief: Phase 4c — Meta-Processes (System Agents)

**Date:** 2026-03-21
**Status:** ready (approved 2026-03-21)
**Depends on:** Brief 012 (Phase 4a), Brief 013 (Phase 4b), Brief 016 (confidence gating + events)
**Unlocks:** Phase 5 (work evolution verification)

## Goal

- **Roadmap phase:** Phase 4: Workspace Foundation
- **Capabilities:** Intake-classifier, router, orchestrator, trust-evaluator system agents. Auto-classification in `aos capture`. System agents going through the harness pipeline.

## Context

With 4a, 4b, and 016 complete, the engine has: work items, CLI, human step suspend/resume, confidence gating on stepRuns (ADR-011), trust gate escalation for low confidence, conditional routing, harness events, and the CLI adapter. Phase 4c introduces the four system agents that make the system self-routing — replacing manual classification in `aos capture` with an automated intake → classify → route pipeline.

This is where the system starts feeling alive. `aos capture "Henderson wants a bathroom quote"` → system classifies as task → routes to quoting process → process runs → output appears in review queue. No manual type/process selection needed.

**What 016 already delivered (removed from this brief):**
- `confidenceLevel` field on `stepRuns` table (categorical high/medium/low)
- Confidence parsing in CLI adapter (`src/adapters/cli.ts`)
- Trust gate escalation: low confidence → pause regardless of tier (`src/engine/harness-handlers/trust-gate.ts`)
- Harness event emitter (`src/engine/events.ts`)
- Confidence self-assessment instruction in Claude adapter system prompt

## Objective

Four system agents running through the harness pipeline. `aos capture` auto-classifies and auto-routes. The trust-evaluator system agent replaces the current function-based trust evaluation. The system demonstrates self-referential meta-process governance.

## Non-Goals

- Improvement-scanner system agent (Phase 9)
- Brief-synthesizer system agent (Phase 10)
- Process-analyst, onboarding-guide, process-discoverer system agents (Phase 11)
- Governance-monitor system agent (Phase 12)
- Full goal decomposition into multiple sub-tasks across multiple processes (Phase 5)
- Cognitive model fields on process definitions (ADR-013 — separate brief if needed)
- Telegram event subscription for system agent runs (deferred from 016)

## Sub-Briefs

This brief is split into two sub-briefs along a natural dependency seam:

| Sub-brief | Scope | AC count |
|-----------|-------|----------|
| **014a** | System agent infrastructure + trust-evaluator | 8 |
| **014b** | Intake-classifier + router + orchestrator + auto-capture pipeline | 9 |

014a validates the system agent pattern with the simplest case (wrapping existing trust evaluation code). 014b uses that validated pattern for the three new agents and the capture rewrite.

## Inputs

1. `docs/adrs/008-system-agents-and-process-templates.md` — system agent categories, schema changes
2. `docs/adrs/010-workspace-interaction-model.md` — intake-classifier, router, orchestrator specs
3. `docs/adrs/011-attention-model.md` — per-output confidence (already implemented by 016)
4. `docs/research/phase-4-composition-sweep.md` — routing patterns (Inngest AgentKit three-mode)
5. `src/engine/trust-evaluator.ts` — existing trust evaluation code (to be wrapped)
6. `src/engine/harness.ts` — harness pipeline (system agents go through it)
7. `src/adapters/cli.ts` — CLI adapter (system agents can use it)
8. `src/adapters/claude.ts` — Claude adapter (system agents can use it)

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Code-based routing (deterministic) | Inngest AgentKit `FnRouter` | Fast, no LLM calls, fully predictable. First routing mode for intake-classifier. |
| LLM-based routing (flexible) | Inngest AgentKit `RoutingAgent` + Mastra Networks | LLM receives process schemas, selects best match. Router agent mode. |
| System agent category | ADR-008 | `category: system`, `systemRole` field. Shipped with platform. |
| Trust-evaluator as system agent | ADR-008 | First system agent. Trust evaluation code already exists — wrapping as agent. |
| Orchestrator-worker | Anthropic multi-agent research | Simple pass-through in 4c; full decomposition in Phase 5. |

## Security Implications

- **System agent permissions:** System agents have broader read access than domain agents. The trust-evaluator reads cross-process feedback data. The router reads all active process descriptions. Each system agent's permissions are scoped in its process YAML — they cannot modify processes or override trust tiers directly.
- **Auto-classification trust:** The intake-classifier starts supervised — every classification decision is reviewable. Users can see and correct misclassifications, building trust in routing accuracy.
- **No credential escalation:** System agents use the same adapter infrastructure as domain agents. No special credential access.

## User Experience

- **Jobs affected:** Capture (`aos capture` becomes auto-classifying), Orient (system agent processes visible in status)
- **Primitives involved:** Quick Capture (P12 — enhanced with auto-classification)
- **Process-owner perspective:** Capture becomes frictionless — describe what you need, system figures out where it goes. System agent processes visible in status but clearly marked as system (not cluttering the user's process list).
- **Designer input:** `docs/research/phase-4-workspace-cli-ux.md` — Scenario 3 (capture interaction states). Not re-invoked for this revision.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: system agents go through harness pipeline, trust-evaluator wraps (not duplicates) existing logic, auto-classification works E2E, reconciliation with 016 deliverables is clean (no duplication)

## After Completion

1. Update `docs/state.md` with Phase 4c complete
2. Update `docs/roadmap.md` — Phase 4 meta-process items → done
3. Move briefs 011, 014, 014a, 014b to `docs/briefs/complete/`
4. Phase 4c retrospective
5. Proceed to Phase 5 (work evolution verification)
