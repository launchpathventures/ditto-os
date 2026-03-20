# Brief: Phase 4c-b — Auto-Classification Pipeline

**Date:** 2026-03-21
**Status:** ready (approved 2026-03-21)
**Depends on:** Brief 014a (system agent infrastructure + trust-evaluator)
**Unlocks:** Phase 5 (work evolution verification)

## Goal

- **Roadmap phase:** Phase 4: Workspace Foundation
- **Capabilities:** Intake-classifier, router, orchestrator system agents. Auto-classification and auto-routing in `aos capture`.

## Context

014a established the system agent pattern: schema support, sync, trust-evaluator running through the harness. This brief builds the three system agents that make the system self-routing: intake-classifier (what type of work is this?), router (which process handles it?), and orchestrator (manage goal lifecycle). It also rewrites `aos capture` to use the auto-classification pipeline instead of manual interactive selection.

After this brief, a user can type `aos capture "Henderson wants a bathroom quote"` and the system classifies, routes, and creates the work item automatically — with supervised oversight on every classification decision until the system earns trust.

## Objective

Three system agents running through the harness pipeline. `aos capture` auto-classifies work item type and auto-routes to a process. Fallback to manual selection when classification confidence is low or no matching process exists.

## Non-Goals

- LLM-based intake classification (code-based keyword matching is Mode 1 — LLM mode deferred until trust earned)
- Full goal decomposition (orchestrator is pass-through in 4c; multi-task decomposition is Phase 5)
- Process importance classification (ADR-011 defers to Phase 10+)
- Cognitive mode field on process definitions (ADR-013)

## Inputs

1. `docs/briefs/014a-system-agent-infrastructure.md` — system agent pattern (must be complete)
2. `docs/adrs/010-workspace-interaction-model.md` — intake-classifier, router, orchestrator specs
3. `docs/research/phase-4-composition-sweep.md` — Inngest AgentKit three-mode routing, Mastra Networks
4. `docs/research/phase-4-workspace-cli-ux.md` — Scenario 3 (capture interaction states)
5. `src/cli/commands/capture.ts` — current manual capture command
6. `src/engine/heartbeat.ts` — `startSystemAgentRun()` from 014a

## Constraints

- **Intake-classifier uses code-based routing (Mode 1).** Deterministic keyword/pattern matching → work item type. No LLM calls. This is the Inngest AgentKit three-mode pattern applied to trust progression: start deterministic, graduate to LLM when the code-based mode proves insufficient. The `script` executor type keeps it fast and free.
- **Router uses the Claude adapter (LLM-based).** It receives all active (non-system) process descriptions as context and selects the best match. This is Mode 2 — LLM routing. It starts supervised: every routing decision appears in the review queue for human verification.
- **Orchestrator is a pass-through.** In 4c, it simply accepts a classified+routed work item and triggers the assigned process. No decomposition. The orchestrator exists to establish the pattern — Phase 5 adds goal → task decomposition.
- **Fallback to manual selection.** If the intake-classifier can't classify (no keyword match) or the router can't find a matching process, `aos capture` falls back to the existing interactive @clack/prompts flow. The user always has an escape hatch.
- **System agents start supervised** (except trust-evaluator per 014a). Every classification and routing decision is reviewable until the system earns trust.
- **Router does not see system processes.** When assembling context for the router, filter to `category: domain` processes only. System processes are infrastructure, not routing targets.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Code-based classification (keyword matching) | Inngest AgentKit `FnRouter` | Deterministic, fast, no LLM cost. Mode 1 of three-mode routing. |
| LLM-based routing (process selection) | Inngest AgentKit `RoutingAgent` + Mastra Networks schema-driven routing | LLM receives process schemas, evaluates fit. Mode 2. |
| Orchestrator-worker pattern | Anthropic multi-agent research | Lead agent manages lifecycle. Pass-through in 4c. |
| Fallback to manual selection | Original | No surveyed system degrades gracefully from AI classification to manual. |
| Auto-classification from free text | Original to Agent OS | No CLI does capture → classify → route from free text input. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/system-agents/intake-classifier.ts` | Create: Code-based classifier. Maps keyword patterns to work item types. Returns `{ type, confidence, reasoning }`. Keywords: question words → question, action verbs → task, "goal"/"achieve"/"target" → goal, "learned"/"realized"/"insight" → insight, "by [date]"/"deadline" → outcome. Default: task (most common). |
| `src/engine/system-agents/router.ts` | Create: LLM-based router. Loads active domain process descriptions as context. Constructs a prompt asking Claude to select the best-matching process. Returns `{ processSlug, confidence, reasoning }`. Uses Claude adapter. |
| `src/engine/system-agents/orchestrator.ts` | Create: Pass-through orchestrator. Receives classified+routed work item, triggers `startProcessRun()` on the assigned process. Returns `{ processRunId, action: "started" }`. Phase 5 adds decomposition. |
| `processes/intake-classifier.yaml` | Create: System process definition. Single step, `script` executor. `system: true`. Starts supervised. |
| `processes/router.yaml` | Create: System process definition. Single step, `ai-agent` executor (Claude adapter). `system: true`. Starts supervised. |
| `processes/orchestrator.yaml` | Create: System process definition. Single step, `script` executor. `system: true`. Starts supervised. |
| `src/cli/commands/capture.ts` | Rewrite: Replace manual interactive classification with auto-classification pipeline. Flow: (1) create work item in `intake` status, (2) run intake-classifier → set type, (3) run router → set assignedProcess, (4) run orchestrator → trigger process run. If any step returns low confidence or fails, fall back to interactive @clack/prompts selection. Non-interactive mode (`--type --process`) unchanged. |
| `src/engine/heartbeat.ts` | Modify: `startSystemAgentRun()` (from 014a) may need adjustment to support passing work item context as process run inputs. |

## User Experience

- **Jobs affected:** Capture (`aos capture` becomes auto-classifying), Orient (classification visible in status)
- **Primitives involved:** Quick Capture (P12)
- **Process-owner perspective:** Typing `aos capture "Henderson wants a bathroom quote"` just works — classified as task, routed to quoting, work item created. If the system can't figure it out, falls back to the familiar interactive selection (no dead end).
- **Interaction states:**
  - **Success:** `✓ Captured #abc123 as Task → routed to quoting`
  - **Low confidence fallback:** `⚠ Couldn't confidently classify this. Let's do it manually:` → interactive prompts
  - **No matching process:** `✓ Captured #abc123 as Task (no matching process — left unassigned)`
  - **Supervised notice:** `(Classification is supervised — you'll build confidence in routing over time.)`

**Auto-classification example:**
```
$ aos capture "Henderson also wants HW quote, Rinnai system, access is tight"

✓ Captured #abc123 as Task
  Classified: task (keyword: "wants")
  Routed to: quoting
  Work item: #abc123
  (Classification is supervised — reviewing builds routing confidence.)
```

**Fallback example:**
```
$ aos capture "something about the Henderson thing"

⚠ Couldn't confidently classify this.
  Let's do it manually:

◆ What kind of work is this?
│ ○ Task — something to do
│ ● Question — something to answer
│ ○ Goal — something to achieve
│ ...
```

- **Designer input:** `docs/research/phase-4-workspace-cli-ux.md` — Scenario 3 capture interaction states (referenced, not re-invoked)

## Acceptance Criteria

1. [ ] Intake-classifier system agent classifies work item types via keyword pattern matching (code-based, no LLM)
2. [ ] Router system agent selects a process from active domain processes using Claude adapter (LLM-based)
3. [ ] Orchestrator system agent triggers `startProcessRun()` on the assigned process (pass-through, no decomposition)
4. [ ] Three system agent process definitions exist in `processes/` with `system: true` and sync via `pnpm cli sync`
5. [ ] `aos capture <text>` auto-classifies type and auto-routes to a process without interactive prompts
6. [ ] When classification confidence is low or keyword matching fails, `aos capture` falls back to interactive @clack/prompts selection
7. [ ] When no matching process is found by the router, the work item is created as unassigned (status: `intake`, not `routed`)
8. [ ] All three system agents go through the harness pipeline (trust gate, feedback recording, activity logging)
9. [ ] Router context excludes system processes (only domain processes are routing targets)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: all agents go through harness pipeline, router doesn't see system processes, fallback works gracefully, no trust bypass, classification keywords are sensible for the personas (Rob's "Henderson wants a quote" → task, Lisa's "why are sales down?" → question)

## Smoke Test

```bash
# Sync all system agent processes
pnpm cli sync
pnpm cli status
# Expected: intake-classifier, router, orchestrator visible as [system]

# Auto-classification — task
pnpm cli capture "Henderson wants a bathroom renovation quote"
# Expected: Classified as task, routed to a matching process (if one exists)

# Auto-classification — question
pnpm cli capture "Why are our quotes taking so long?"
# Expected: Classified as question

# Auto-classification — goal
pnpm cli capture "Achieve quote turnaround under 24 hours"
# Expected: Classified as goal

# Fallback — ambiguous input
pnpm cli capture "Henderson thing"
# Expected: Falls back to interactive selection (low confidence)

# Non-interactive mode unchanged
pnpm cli capture "Fix the tap" --type task --process plumbing
# Expected: Works as before, bypasses auto-classification

# Verify harness pipeline for system agents
# (Check activity log for intake-classifier and router runs)
pnpm cli status --json
# Expected: Activity entries for system agent runs

# Run tests
pnpm test
# Expected: all tests pass
```

## After Completion

1. Update `docs/state.md`: Phase 4c complete — all four system agents running
2. Update `docs/roadmap.md`: Phase 4 meta-process capabilities → done
3. Move briefs 011, 014, 014a, 014b to `docs/briefs/complete/`
4. Phase 4c retrospective
5. Proceed to Phase 5 (work evolution verification)
