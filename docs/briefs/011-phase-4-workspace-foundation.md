# Brief: Phase 4 — Workspace Foundation (Parent)

**Date:** 2026-03-20
**Status:** approved
**Depends on:** Phase 3 (trust earning — complete), ADR-010 (workspace model — accepted), ADR-011 (attention model — accepted)
**Unlocks:** Phase 5 (work evolution verification)

## Goal

- **Roadmap phase:** Phase 4: Workspace Foundation
- **Capabilities:** All 21 Phase 4 capabilities across 4 subsystems (work items, meta-processes, human step executor, CLI infrastructure, attention model Phase 4 scope)

## Context

Phase 3 proved trust earning works — the harness captures feedback, computes trust state, suggests upgrades, enforces downgrades. But the system still operates as a process-management tool: the user manually syncs processes, starts runs, and reviews outputs by run ID. There's no concept of "work entering the system" — no work items, no routing, no human steps in processes, no unified view of what needs attention.

ADR-010 redesigned the interaction model: work items enter, meta-processes route them, processes execute with human steps, the system feels alive. Phase 4 makes this real through a CLI workspace. The CLI is the first surface — the web dashboard (Phase 10) extends it.

The composition sweep (`docs/research/phase-4-composition-sweep.md`) extracted implementation patterns from 7 projects. The Designer's interaction spec (`docs/research/phase-4-workspace-cli-ux.md`) defines how the CLI should feel for all four personas. This parent brief synthesises both into a buildable design.

## Objective

Prove the workspace interaction model works. A user can: enter work via `aos capture`, see it classified and routed, review outputs via `aos review`, complete human steps via `aos complete`, and see everything that needs attention via `aos status`. The system feels alive — it routes, executes, pauses for humans, and resumes.

## Non-Goals

- **Process graph visualisation** — Phase 10 (needs canvas)
- **AI-synthesised Daily Brief** — Phase 10 (needs brief-synthesizer system agent)
- **Conversation as pervasive layer** — Phase 10 (Phase 4 is command-based)
- **Streaming generative UI** — Phase 10
- **Team portfolio view** — Phase 10 (Nadia inspects one process at a time in Phase 4)
- **Conversational process building** — Phase 10 (Phase 4 uses YAML + `aos sync`)
- **Full "Teach this" → permanent learning** — Phase 8 (Phase 4 captures diffs; pattern surfacing is minimal)
- **Improvement Cards / health alerts** — Phase 8 (ADR-011 places these later)
- **Process importance classification** — Phase 10+ (ADR-011 defers this)
- **The trust-evaluator system agent** — folded into Phase 4c (first system agent alongside intake-classifier, router, orchestrator)

## Inputs

1. `docs/adrs/010-workspace-interaction-model.md` — work items, meta-processes, human steps, conversation layer
2. `docs/adrs/011-attention-model.md` — three attention modes, per-output confidence, silence principle
3. `docs/research/phase-4-composition-sweep.md` — implementation patterns from 7 projects
4. `docs/research/phase-4-workspace-cli-ux.md` — Designer's interaction spec (5 scenarios, 6 jobs mapped)
5. `docs/architecture.md` — six-layer spec, borrowing strategy, agent harness assembly
6. `docs/personas.md` — Rob, Lisa, Jordan, Nadia
7. `src/db/schema.ts` — existing schema (processes, processRuns, stepRuns, processOutputs, feedback, memories, harnessDecisions, trustChanges, trustSuggestions)
8. `src/cli.ts` — existing CLI (switch-based, needs rewrite to citty)
9. `src/engine/harness.ts` — existing harness pipeline (5 handlers)
10. `src/engine/heartbeat.ts` — existing heartbeat with dependency resolution

## Constraints

- Existing tests and functionality must continue working after CLI rewrite
- `pnpm cli sync` and `pnpm cli start` must remain functional (aliased to new `aos` commands)
- Work items are stored in SQLite via Drizzle — no external infrastructure
- System agents go through the same harness pipeline as domain processes (ADR-008/010)
- All human decisions (approve/edit/reject/complete) must be recorded as feedback for Layer 5
- CLI must support `--json` on all listing commands and `--quiet` for scripting
- CLI must be TTY-aware — interactive prompts when TTY, machine-readable when piped
- Implementation terms never appear in user-facing output (Designer spec: no "work item", "intake-classifier", "router", "harness pipeline", "trust gate")

## Sub-Phasing

Phase 4 has ~36 acceptance criteria across 4 subsystems. Per Insight-004, this splits into three sub-briefs:

| Sub-brief | Scope | AC count | Depends on | Unlocks |
|-----------|-------|----------|------------|---------|
| **4a: Foundation** | `workItems` table, CLI rewrite (citty + clack), `aos status`/`review`/`approve`/`edit`/`reject`/`sync`/`start`/`trust` | 14 | Phase 3 | 4b, 4c |
| **4b: Human Steps + Capture** | `human` executor with suspend/resume, `aos complete`, `aos capture` (manual classification), unified task surface, minimal pattern-detection notification | 12 | 4a | 4c |
| **4c: Meta-Processes + Confidence** | Intake-classifier, router, orchestrator system agents, trust-evaluator system agent, per-output confidence metadata (ADR-011), `aos capture` auto-classification | 10 | 4a, 4b | Phase 5 |

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Work item schema with goal ancestry | Paperclip `packages/db/src/schema/goals.ts`, `issues.ts` | Proven ticket + goal model. ADR-010 adopted this. |
| CLI routing | citty `unjs/citty` | TypeScript-first, ESM, minimal. Landscape.md recommendation. |
| CLI interactive UX | @clack/prompts `bombshell-dev/clack` | Beautiful prompts, composable primitives. Landscape.md recommendation. |
| CLI aggregation dashboard | GitHub CLI `cli/cli pkg/cmd/status/status.go` | Parallel load of heterogeneous items → unified display. Composition sweep. |
| CLI factory injection | GitHub CLI `cli/cli pkg/cmd/factory/default.go` | Dependency injection for testability. Composition sweep. |
| Path-based suspend/resume | Mastra `mastra-ai/mastra packages/core/src/workflows/default.ts` | Serialize suspended step paths + results. Resume skips completed. Composition sweep. |
| Three-mode routing | Inngest AgentKit `inngest/agent-kit packages/agent-kit/src/network.ts` | Code-based (deterministic) + LLM-based (flexible) + hybrid. Composition sweep. |
| Multi-source tool gathering | Mastra `packages/core/src/agent/agent.ts` | 7 tool sources merged at invocation. Composition sweep. |
| Orchestrator-worker decomposition | Anthropic multi-agent research | Lead agent decomposes, subagents execute. ADR-010 adopted this. |
| Lifecycle hooks | Inngest AgentKit `packages/agent-kit/src/agent.ts` | onStart/onResponse/onFinish for injection. Composition sweep. |
| Work item taxonomy (5 types) | Original to Agent OS | No project has question/task/goal/insight/outcome with lifecycle rules. |
| Meta-processes through own harness | Original to Agent OS | No project governs its own routing through trust pipeline. |
| Unified task surface (3 types) | Original to Agent OS | No product unifies review + action + goal tasks. |
| Trust-governed routing | Original to Agent OS | Routing decisions earning trust is not implemented anywhere. |

## User Experience

- **Jobs affected:** All six — Orient, Review, Define, Delegate, Capture, Decide
- **Primitives involved:** Daily Brief (P1, text-based), Process Card (P2, via `aos status --process`), Review Queue (P5, via `aos review`), Output Viewer (P6, via `aos review <id>`), Feedback Widget (P7, via approve/edit/reject), Trust Control (P11, via `aos trust`), Quick Capture (P12, via `aos capture`)
- **Process-owner perspective:** See Designer's interaction spec at `docs/research/phase-4-workspace-cli-ux.md` — 5 persona scenarios, interaction states for all commands, output formatting principles
- **Interaction states:** Comprehensive tables in Designer spec covering normal, empty, error, first-run, confidence-escalation, ambiguous-classification, timeout-approaching states
- **Designer input:** `docs/research/phase-4-workspace-cli-ux.md` (reviewed, PASS WITH NOTES, findings addressed)

**Architect decisions on Designer questions:**
1. **"Teach this" pattern detection (Week 2-3 emotional arc):** Include a MINIMAL notification in 4b. After `aos edit`, if the same field has been corrected 3+ times for a process, show: "You've corrected [field] 3 times. This pattern is being tracked — the system will learn from it." This is a read-only notification from existing data (feedback + diff records). The full "Teach this" → create memory → enforce in harness is Phase 8. But the notification fills the emotional gap cheaply.
2. **Trust-evaluator system agent:** Fold into 4c alongside the other three system agents. It's the simplest system agent and establishes the pattern.

## Security Implications

- **Work item content:** Work items store user-provided natural language content. No credential fields. The `--note` flag on `aos complete` stores user notes as plain text — the Designer spec noted a gate code example (#43). This is acceptable for CLI dogfood; the web dashboard should mask sensitive fields.
- **System agent permissions:** System agents (intake-classifier, router, orchestrator) need read access to process definitions and work items. They do NOT need write access to process definitions or trust tiers. Scoped via agent permissions field.
- **Suspend payloads:** Per ADR-010, suspend payloads must not contain raw credentials — only references. The `human` executor must validate this constraint.

## Review Process

1. Each sub-brief is reviewed independently after build
2. Phase 4 complete when all three sub-briefs pass + E2E smoke test passes
3. Final review: spawn reviewer with architecture.md + review-checklist.md + all three sub-brief outputs

## After Completion

1. Update `docs/state.md` with Phase 4 completion
2. Update `docs/roadmap.md` — Phase 4 status → done
3. Move completed sub-briefs to `docs/briefs/complete/`
4. Write ADR-009 (citty + @clack/prompts for CLI) — planned decision now formalised
5. Phase retrospective: what worked, what surprised, what to change
