# Brief: Phase 4b — Human Steps + Capture + Unified Task Surface

**Date:** 2026-03-20
**Status:** draft
**Depends on:** Brief 012 (Phase 4a — work items + CLI)
**Unlocks:** Brief 014 (Phase 4c — meta-processes)

## Goal

- **Roadmap phase:** Phase 4: Workspace Foundation
- **Capabilities:** `human` executor type with suspend/resume, `aos complete`, `aos capture` (manual classification), unified task surface (review + action + goal tasks together), minimal pattern-detection notification

## Context

With 4a complete, we have work items, the CLI framework, and review workflows. But work can only enter via `pnpm cli start` (developer-initiated) and the only task type is review. Phase 4b adds:

1. **Human steps** — processes can pause for human action and resume with human input
2. **Capture** — users enter work via `aos capture` (with manual classification until meta-processes arrive in 4c)
3. **Unified task surface** — `aos status` shows review tasks + action tasks + goal tasks together
4. **Pattern notification** — minimal "this correction is being tracked" message after repeated edits

## Objective

A process can include a `human` executor step that pauses, surfaces as an action task, and resumes when the user completes it via `aos complete`. Users can enter work via `aos capture`. The unified task surface in `aos status` shows all three task types. The emotional journey's Week 2-3 gap is filled with a pattern-detection notification.

## Non-Goals

- Auto-classification of captures (4c — requires intake-classifier system agent)
- Auto-routing of captures to processes (4c — requires router system agent)
- Goal decomposition (4c — requires orchestrator system agent)
- Full "Teach this" → create memory → enforce in harness (Phase 8)
- The pattern notification is read-only — it does not create memories or change behavior

## Inputs

1. `docs/briefs/011-phase-4-workspace-foundation.md` — parent brief
2. `docs/briefs/012-phase-4a-foundation.md` — 4a brief (prerequisite)
3. `docs/research/phase-4-workspace-cli-ux.md` — Scenarios 3 (capture) and 4 (human step)
4. `docs/research/phase-4-composition-sweep.md` — suspend/resume patterns (Mastra, LangGraph)
5. `docs/adrs/010-workspace-interaction-model.md` — human step executor spec (Section 4)
6. `src/engine/step-executor.ts` — existing step executor to extend
7. `src/engine/heartbeat.ts` — existing heartbeat to extend with suspend/resume

## Constraints

- Human step suspend state must persist across heartbeats (serialized to SQLite)
- `aos complete` input fields are driven by the process definition's human step `input_fields` — not hardcoded
- Capture creates a work item but does NOT auto-classify or auto-route (that's 4c). In 4b, the user selects the process manually via interactive prompt.
- Pattern notification fires only when the same correction field appears 3+ times for a process. It's a read-only message, not a command.
- No new system agents in 4b — all agents are existing domain agents

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Path-based suspend/resume | Mastra `packages/core/src/workflows/default.ts` | Serialize suspended step paths + results. Resume skips completed steps. |
| Structured suspend payload | ADR-010 Section 4 | Instructions, context, input_fields, timeout. Original to Agent OS. |
| Interactive step completion | @clack/prompts `packages/prompts/src/group.ts` | Multi-step workflows with result propagation. |
| Capture → classify (manual) | Original to Agent OS | No CLI does capture → classify → route from free text. |
| Unified task surface | Original to Agent OS | No product unifies review + action + goal tasks. |
| Pattern-detection notification | Original to Agent OS (lightweight) | Count corrections per field from existing feedback data. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/step-executor.ts` | Modify: Add `human` executor handler. On encounter: create work item (type: action), serialize suspend state (step path, step results, suspend payload), set run status to `waiting_human`. |
| `src/engine/heartbeat.ts` | Modify: `findNextWork()` skips runs in `waiting_human` status. On `aos complete`, resume run from suspend point (deserialize state, inject human input, continue execution). |
| `src/db/schema.ts` | Modify: Add `runStatusValues` entry `waiting_human`. Add `suspendState` column on `processRuns` (JSON — serialized execution path + step results). |
| `src/cli/commands/complete.ts` | Create: `aos complete <id>`. Reads suspend payload's `input_fields` → generates @clack/prompts dynamically (select, text, date based on field type). Supports `--data '{"field":"value"}'` for piped/scripted use. On submit: inject human input into run, trigger heartbeat resume. |
| `src/cli/commands/capture.ts` | Create: `aos capture "<text>"`. Creates work item. Interactive: prompt for work item type (task/question/goal/insight) and process assignment (select from active processes). Supports `--type` and `--process` flags for non-interactive. |
| `src/cli/commands/status.ts` | Modify: Show action tasks (human steps waiting) alongside review tasks in NEEDS YOUR ATTENTION. Action items include instructions from suspend payload. |
| `src/cli/commands/approve.ts` | Modify: After `aos edit` (approve with edits), check feedback table for repeated corrections on the same field. If 3+, append: "You've corrected [field] 3 times for this process. This pattern is being tracked." |
| `src/engine/process-loader.ts` | Modify: Parse `human` executor steps from YAML process definitions, including `input_fields` schema. |

## User Experience

- **Jobs affected:** Capture (`aos capture`), Decide (`aos complete`), Orient (unified task surface in `status`)
- **Primitives involved:** Quick Capture (P12), Feedback Widget (P7 — pattern notification)
- **Designer input:** `docs/research/phase-4-workspace-cli-ux.md` — Scenarios 3 (capture) and 4 (human step completion). Interaction states for `aos capture` and `aos complete`.

**Pattern notification example:**
```
$ aos approve 42 --edit
[opens $EDITOR, user corrects margin calculation, saves]
✓ Approved with edits. Diff captured as feedback.
  Note: You've corrected margin calculations 3 times for quoting.
  This pattern is being tracked — the system will learn from it.
```

## Acceptance Criteria

1. [ ] Process YAML with `executor: human` steps parses and syncs correctly
2. [ ] When heartbeat reaches a `human` step, the process run enters `waiting_human` status
3. [ ] A work item of type `action` is created with instructions, context, and input_fields from the suspend payload
4. [ ] `aos status` shows action tasks alongside review tasks in NEEDS YOUR ATTENTION, with instructions visible
5. [ ] `aos complete <id>` generates interactive prompts from the step's `input_fields` (select for enum types, text for string, date for date)
6. [ ] `aos complete <id> --data '{"field":"value"}'` works for piped/scripted use
7. [ ] After `aos complete`, the process run resumes from the suspended step (not from the beginning)
8. [ ] The resumed run has access to the human's input data in the step's output
9. [ ] `aos capture "<text>"` creates a work item with user-selected type and process
10. [ ] `aos capture` with `--type task --process quoting` works non-interactively
11. [ ] After `aos edit` (approve with edits), if the `correctionPattern` field in the feedback table has 3+ records with the same value for the same process, a pattern notification is printed (matching is by exact `correctionPattern` string equality). Note: `correctionPattern` must be populated by `recordEditFeedback` — derive it from the structured diff's top-level changed field name (e.g., "margin_calculation", "labour_estimate"). This is a simple extraction, not ML pattern recognition.
12. [ ] `pnpm run type-check` passes with zero errors

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: human step matches ADR-010 Section 4, suspend/resume state serialization is correct, unified task surface shows all task types, pattern notification is read-only

## Smoke Test

```bash
# Create a process with a human step
# (add a human step to an existing process YAML, e.g., code-review with a "confirm deployment target" step)
pnpm cli sync

# Start a run that will hit the human step
pnpm cli start code-review
# Run heartbeat until it reaches the human step
pnpm cli heartbeat <runId>
# Expected: run enters waiting_human status

# Check status
pnpm cli status
# Expected: action task appears in NEEDS YOUR ATTENTION with instructions

# Complete the human step
pnpm cli complete <workItemId>
# Expected: interactive prompts from input_fields → process resumes

# Capture
pnpm cli capture "Need to review pricing for new supplier"
# Expected: interactive type/process selection → work item created

# Pattern notification (requires 3+ prior corrections on same field)
# After 3 edits correcting the same field:
pnpm cli approve <id> --edit
# Expected: "You've corrected [field] 3 times..." message
```

## After Completion

1. Update `docs/state.md` with 4b completion
2. Proceed to Brief 014 (Phase 4c)
