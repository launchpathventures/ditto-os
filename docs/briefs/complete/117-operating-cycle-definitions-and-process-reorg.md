# Brief 117: Operating Cycle — Cycle Definitions + Process Reorganisation

**Date:** 2026-04-09
**Status:** draft
**Depends on:** Brief 116 (shared infrastructure)
**Unlocks:** Brief 118 (self-tools & front door)

## Goal

- **Roadmap phase:** Phase 3: Network Agent & Continuous Operation
- **Capabilities:** Three core Operating Cycle definitions (Sales & Marketing, Network Connecting, Relationship Nurture), sub-process invocation, and reorganisation of 25 existing templates as callable sub-processes

## Context

Brief 116 delivers the harness infrastructure (handlers, schema, context fields). This brief uses that infrastructure to define the three core cycles as YAML process definitions and reorganise existing templates into a two-tier model (cycles call sub-processes through the harness).

The Operating Cycle Archetype (Insight-168) defines seven phases: SENSE → ASSESS → ACT → GATE → LAND → LEARN → BRIEF. Not every cycle uses every phase. Each phase is a coarse step where Alex applies cognitive judgment — the process provides cadence and quality gates, not micro-instructions.

## Objective

Create three cycle YAML definitions, extend the process loader to support sub-process invocation and cycle directories, add `callable_as: sub-process` metadata to existing templates, and document the two-tier model.

## Non-Goals

- New harness handlers — Brief 116 (already done when this runs)
- Self-tools for cycle activation — Brief 118
- Front door prompt changes — Brief 118
- Scheduler changes — Brief 118
- Cross-cycle coordination (L4 dependency graph triggers) — future brief
- Channel integration adapters — future briefs

## Inputs

1. `docs/briefs/115-operating-cycle-archetype.md` — parent brief
2. `docs/briefs/116-operating-cycle-shared-infrastructure.md` — infrastructure brief (dependency)
3. `docs/insights/168-operating-cycle-archetype.md` — archetype phases and components
4. `docs/insights/169-alex-capability-surface-as-concurrent-cycles.md` — cycle map
5. `docs/insights/166-connection-first-commerce-follows.md` — connecting cycle litmus tests
6. `docs/insights/167-broadcast-supervised-direct-autonomous.md` — trust model for cycle steps
7. `packages/core/src/harness/harness.ts` — ProcessDefinition, StepDefinition (as extended by Brief 116)
8. `src/engine/process-loader.ts` — current loader (to extend)
9. `processes/templates/*.yaml` — 25 existing templates (to reorganise)
10. `src/engine/heartbeat.ts` — current execution engine (to extend for sub-process invocation)

## Constraints

- **Existing templates are not deleted.** They get `callable_as: sub-process` metadata added. They continue to load and execute as standalone processes.
- **Cycle definitions are YAML.** Same format as existing process definitions — they go through the same loader, same harness pipeline.
- **Sub-process invocation uses the existing harness.** A cycle step with `executor: sub-process` and `config.process_id` triggers a child process run through `startProcessRun()` + `fullHeartbeat()`. No special-case execution paths.
- **Cycle YAML files are concise.** Each phase is one step with a description, not a verbose prompt. The cognitive mode extension (Brief 114) provides judgment calibration. The cycle provides cadence.
- **Token budget.** A cycle definition loaded into agent context should be under 400 tokens. Phase labels (SENSE, ASSESS, etc.) are structural — the agent's judgment fills in the content.
- **Process-loader reads from `processes/cycles/` in addition to existing directories.** Same validation, same registration.
- **Type-check must pass.** `pnpm run type-check` at root.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Operating Cycle phases | Ditto Insight-168 | pattern | Original — SENSE → ASSESS → ACT → GATE → LAND → LEARN → BRIEF |
| YAML process definitions | Existing Ditto pattern | pattern | Already established — cycles are just coarser process definitions |
| Sub-process invocation | Ditto architecture (process chaining) | pattern | Extension of existing chain pattern — parent step invokes child process through harness |
| BDR operating model | Sales operations practice | pattern | Sales cycle mirrors BDR pipeline: prospect → qualify → hand off |

## What Changes (Work Products)

### New Files

| File | Action |
|------|--------|
| `processes/cycles/sales-marketing.yaml` | Create: Sales & Marketing Operating Cycle. 7 steps following the archetype. SENSE: pipeline review, inbound signals. ASSESS: qualify leads, prioritise outreach. ACT: draft outreach, respond to conversations (executor: ai-agent, mode: selling). GATE: quality gate (trust: critical for broadcast content, step-category autonomous for direct DMs). LAND: execute sends (executor: sub-process, config.process_id: selling-outreach or social-publishing). LEARN: retrospective, metrics. BRIEF: user digest. Operator: alex-or-mira. Default identity: agent-of-user. Trust: supervised initial, upgrade path per step-category. |
| `processes/cycles/network-connecting.yaml` | Create: Network Connection Cycle. SENSE: relationship scan, match opportunities. ASSESS: evaluate fit using three litmus tests (Insight-166). ACT: draft introductions (executor: ai-agent, mode: connecting). GATE: quality gate (trust: critical — Alex's institutional reputation). LAND: send introductions (executor: sub-process, config.process_id: connecting-introduction). LEARN: outcome tracking, reciprocity. BRIEF: connection report. Operator: alex-or-mira. Default identity: principal. Trust: supervised initial. |
| `processes/cycles/relationship-nurture.yaml` | Create: Relationship Nurture Cycle. SENSE: relationship health scan, silence detection. ASSESS: value-add opportunities, who needs attention. ACT: nurture execution — check-ins, value shares, introductions (executor: ai-agent, mode: nurturing). GATE: silence > noise check (would this add value or just noise?). LAND: send touches (executor: sub-process, config.process_id: network-nurture or follow-up-sequences). LEARN: reciprocity tracking, relationship trajectory. BRIEF: relationship health report. Operator: alex-or-mira. Default identity: principal (intros) or ghost (check-ins). Trust: autonomous initial for internal steps, supervised for external. |
| `processes/cycles/README.md` | Create: documents the two-tier model (cycles + sub-processes), the archetype phases, and which sub-processes map to which cycle phases. |

### Modified Files

| File | Action |
|------|--------|
| `processes/templates/*.yaml` (25 files) | Modify: add `callable_as: sub-process` to metadata section. Add `inputs` and `outputs` declarations where missing to ensure compatibility with parent cycle invocation. No step changes — templates continue to work standalone. |
| `src/engine/process-loader.ts` | Modify: (1) Read from `processes/cycles/` directory in addition to `processes/` and `processes/templates/`. (2) Support `executor: sub-process` step type — validate that `config.process_id` references a valid process slug. (3) Parse `callable_as` metadata field. (4) Parse `trustOverride` on step definitions (maps to StepDefinition.trustOverride from Brief 116). |
| `src/engine/heartbeat.ts` | Modify: in the step executor dispatch, add `sub-process` case. When `executor === 'sub-process'`: (1) resolve target process from `config.process_id`, (2) call `startProcessRun()` with parent context inputs + step-specific inputs, (3) set `parentCycleRunId` on the child run, (4) call `fullHeartbeat()` on the child run, (5) collect child run output as step result. The child run goes through the full harness pipeline — same handlers, same trust gates. |

## User Experience

- **Jobs affected:** None directly — cycle definitions are infrastructure. Users interact with cycles via Self-tools (Brief 118).
- **Primitives involved:** Process run (cycles appear as process runs with `cycleType` set)
- **Process-owner perspective:** No visible change yet. The cycle definitions exist but aren't activatable until Brief 118 adds the self-tools.
- **Interaction states:** N/A
- **Designer input:** Not invoked — infrastructure + data definitions

## Acceptance Criteria

1. [ ] Three operating cycle definitions exist in `processes/cycles/` and parse without errors via process-loader
2. [ ] Each cycle definition follows the archetype phases (SENSE → ASSESS → ACT → GATE → LAND → LEARN → BRIEF — phases can be omitted but order is preserved)
3. [ ] Sales cycle has at least one `executor: sub-process` step referencing `selling-outreach` or `social-publishing`
4. [ ] Network connecting cycle has `defaultIdentity: principal` and `trustOverride: critical` on its GATE step
5. [ ] A cycle step with `executor: sub-process` and `config.process_id: selling-outreach` successfully invokes selling-outreach.yaml through the harness and returns its output as the step result
6. [ ] Child process run created by sub-process invocation has `parentCycleRunId` set to the parent cycle's run ID
7. [ ] All 25 existing process templates have `callable_as: sub-process` metadata and still load and execute as standalone processes (backward compatible)
8. [ ] Process-loader reads from `processes/cycles/` directory and registers cycle processes in the database
9. [ ] Process-loader validates `executor: sub-process` steps — rejects if `config.process_id` references a non-existent process slug
10. [ ] `processes/cycles/README.md` documents the two-tier model with a mapping table
11. [ ] Each cycle definition is under 400 tokens when loaded as text
12. [ ] `pnpm run type-check` passes at root
13. [ ] All existing tests pass (no regressions)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/insights/168-operating-cycle-archetype.md`
2. Review agent checks:
   - Do cycle definitions follow the archetype faithfully?
   - Is sub-process invocation through the harness (not a special-case path)?
   - Are existing templates backward compatible after adding `callable_as` metadata?
   - Are cycle definitions concise (under 400 tokens)?
   - Does the connecting cycle encode the three litmus tests from Insight-166 (in quality criteria or step description)?
   - Is the trust model correct: broadcast steps as critical, direct steps with step-category trust graduation?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type-check passes
pnpm run type-check

# 2. Cycle definitions load
pnpm run test -- --grep "cycle.*load\|process.*loader.*cycle"

# 3. Sub-process invocation
pnpm run test -- --grep "sub.*process.*invocation\|executor.*sub-process"

# 4. Existing templates still load
pnpm run test -- --grep "template.*load\|callable.*sub"

# 5. All existing tests still pass
pnpm run test
```

## After Completion

1. Update `docs/state.md` with: Brief 117 complete — 3 cycle definitions, sub-process invocation, 25 templates reorganised
2. Proceed to Brief 118 (self-tools & front door)
