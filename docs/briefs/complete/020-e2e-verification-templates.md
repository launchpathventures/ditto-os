# Brief 020: E2E Verification + Process Templates

**Date:** 2026-03-21
**Status:** complete
**Depends on:** Brief 022 (Orchestrator CLI) — which depends on 021 (Orchestrator Engine)
**Unlocks:** Phase 6 (External Integrations — re-entry condition: dogfood proven E2E)

## Goal

- **Roadmap phase:** Phase 5: Work Evolution Verification
- **Capabilities:** Full work evolution cycle verified, meta-process trust earning verified, all 6 layers proven working, process template library (2-3 non-coding templates)

## Context

Brief 019 delivers the goal-directed orchestrator. This brief proves it works end-to-end and ships the first non-coding process templates. This is primarily a verification phase — proving that the engine pieces compose correctly — with the template library as the only new build.

## Objective

Run the full work evolution cycle (capture → classify → route → orchestrate → execute → human step → resume → review → trust update → learning captured) and verify every layer participates. Ship 2-3 non-coding process templates with governance declarations. Verify that meta-process trust earning works (intake-classifier corrections improve routing accuracy).

## Non-Goals

- **New engine capabilities** — this brief proves what exists, it doesn't build new features
- **Template marketplace or sharing** — templates are local YAML files in `templates/`
- **Template customisation wizard** — the UX spec's conversational customisation is Phase 10 (web dashboard) scope. Phase 5 templates are adopted by copying YAML and editing manually.
- **Automated E2E testing** — verification is manual with documented steps. Automated E2E tests are a future brief.

## Inputs

1. Brief 019 output — goal-directed orchestrator running
2. `docs/research/phase-5-orchestrator-ux.md` — section 5 (template UX, adapted for CLI)
3. `docs/adrs/008-system-agents-and-process-templates.md` — template design with governance declarations
4. `docs/architecture.md` — six layers to verify
5. Existing process definitions in `processes/` — pattern for template YAML

## Constraints

- Templates follow the exact same YAML format as existing process definitions. No new schema for templates.
- Templates live in `templates/` directory (not `processes/`). `aos sync` loads from both but marks templates with `status: draft` (not active until explicitly adopted). Adoption changes status to `active`.
- Templates include governance declarations: `trust.initial_tier`, `quality_criteria`, `feedback.metrics`. Not just workflow steps.
- Verification must exercise every architecture layer: L1 (process), L2 (agent), L3 (harness), L4 (awareness — process dependency), L5 (learning — feedback capture), L6 (human — CLI interaction).

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Template format | n8n template library + Zapier templates | Standard template pattern: pre-built definitions users can adopt |
| Governance declarations in templates | Original to Agent OS (ADR-008) | No surveyed template system includes trust config, quality criteria, and feedback loops |
| Template adoption flow | ADR-008 cold-start pattern | AI-guided adoption rather than passive browsing |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `templates/invoice-follow-up.yaml` | Create: invoice follow-up process template with governance declarations |
| `templates/content-review.yaml` | Create: content review process template with governance declarations |
| `templates/incident-response.yaml` | Create: incident response process template with human steps and governance |
| `src/engine/process-loader.ts` | Modify: load from `templates/` directory in addition to `processes/` |
| `src/cli/commands/sync.ts` | Modify: sync templates alongside process definitions |
| `docs/verification/phase-5-e2e.md` | Create: E2E verification report documenting each layer's participation |

## User Experience

- **Jobs affected:** Define (template adoption), Orient (E2E cycle produces visible outputs)
- **Primitives involved:** Quick Capture (trigger the cycle), Review Queue (review outputs), Process Builder (templates as starting point)
- **Designer input:** `docs/research/phase-5-orchestrator-ux.md` section 5
- **Process-owner perspective:** The user can `aos sync` to load templates. They can `aos capture` a task that matches a template's domain and see it routed through the template process. The full cycle — from capture to trust update — works. Templates include trust configuration and quality criteria, so the user knows what oversight looks like from day one.
- **Interaction states:** N/A — this brief is primarily verification. Template loading is a sync operation.

## Acceptance Criteria

### E2E Cycle Verification
1. [ ] A work item entered via `aos capture` flows through: intake-classifier → router → orchestrator → process execution → human step (if present) → resume → review → trust update
2. [ ] Each architecture layer participates: L1 (process definition loaded), L2 (agent executes step), L3 (harness pipeline runs: memory, execution, review, routing, trust, feedback), L4 (work item status tracked in goal hierarchy, process dependency visible), L5 (correction feedback recorded for system agents — intake-classifier and router corrections update learning data), L6 (CLI shows status and review queue)
3. [ ] The verification is documented in `docs/verification/phase-5-e2e.md` with timestamps and evidence

### Meta-Process Trust Earning
4. [ ] Intake-classifier receives corrections (human reclassifies a work item) and the correction is recorded as feedback
5. [ ] Router receives corrections (human re-routes a work item) and the correction is recorded as feedback
6. [ ] Trust data for intake-classifier and router system agents accumulates from corrections

### Process Templates
7. [ ] 3 non-coding process templates exist in `templates/` with valid YAML matching the process definition schema
8. [ ] Each template includes governance declarations: `trust.initial_tier`, `quality_criteria`, `feedback.metrics`
9. [ ] At least 1 template includes a `human` executor step (proving templates can define human-in-the-loop processes)
10. [ ] `aos sync` loads templates from `templates/` directory alongside `processes/`
11. [ ] A template-based process can be started via `aos start <template-slug>` after sync

### Regression
12. [ ] All existing tests pass (pnpm test)
13. [ ] All existing CLI commands work unchanged

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Does the E2E verification cover all 6 layers? Do templates match ADR-008 governance declarations? Is the template format consistent with existing process definitions?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Sync (loads templates)
pnpm cli sync
# Expect: templates loaded alongside processes

# 2. Start a template process
pnpm cli start invoice-follow-up --input task="Follow up on overdue invoices"
# Expect: process run created

# 3. Run heartbeat
pnpm cli heartbeat <run-id>
# Expect: steps execute, human step pauses

# 4. Complete human step
pnpm cli complete <work-item-id> --input response="Contacted vendor, payment promised by Friday"
# Expect: process resumes

# 5. Check trust data
pnpm cli trust invoice-follow-up
# Expect: trust data shows run count, approval rate

# 6. Full E2E via capture
pnpm cli capture "Review the Q1 marketing content"
# Expect: classified → routed → orchestrated → executing
```

## After Completion

1. Update `docs/state.md` — Phase 5 complete
2. Update `docs/roadmap.md` — Phase 5 items marked done, deferred items noted
3. Phase 5 retrospective: what worked, what surprised, what to change
4. Verify Phase 6 re-entry condition: "dogfood processes proven end-to-end"
