# Brief: Telegram Bot Engine Bridge

**Date:** 2026-03-21
**Status:** draft
**Depends on:** Brief 016 (CLI adapter, dev-pipeline YAML — complete), Brief 024 (integration foundation — complete)
**Unlocks:** Live dogfooding of the engine via Telegram. Trust earning, memory accumulation, feedback recording on the dev pipeline. Validates engine under sustained real usage (Insight-050).

## Goal

- **Roadmap phase:** Phase 5 (Work Evolution Verification) — extends to live validation
- **Capabilities:** Engine dogfooding via Telegram, compound effect validation, Insight-032 completion

## Context

Two parallel systems currently exist for running the dev pipeline:

1. **The engine** (`src/engine/heartbeat.ts` → harness pipeline → CLI adapter → `claude -p`): Full harness with memory assembly, trust gate, feedback recording, routing. Uses SQLite/Drizzle. This is the real product.

2. **The dev-pipeline orchestrator** (`src/dev-pipeline.ts` + `src/dev-bot.ts`): Standalone script that chains `claude -p` calls with its own session management (`data/dev-session.json`). No memory, no trust, no feedback recording. Bypasses the engine entirely.

The Telegram bot uses system (2). When the human approves a step, no feedback is recorded. No memory accumulates. No trust earns. The compound effect — Ditto's core value proposition — is not exercised.

The nesting problem (`claude -p` can't run inside Claude Code) blocked engine usage from Claude Code sessions. But the Telegram bot runs as a standalone Node.js process — there is no nesting. The bot can spawn `claude -p` through the engine's CLI adapter without issue.

The strategic move: make the Telegram bot route work through the engine instead of its standalone orchestrator. This means every dev session via Telegram exercises memory, trust, and feedback — producing real compound effect data.

## Objective

The Telegram bot uses the engine's harness pipeline for dev pipeline execution instead of the standalone orchestrator. Every step runs through memory assembly → step execution → review pattern → routing → trust gate → feedback recorder. The human reviews outputs via Telegram inline keyboards. Approvals, edits, and rejections are recorded as feedback. Memory accumulates across runs. Trust earns over time.

## Non-Goals

- Changing the engine's harness pipeline, heartbeat, or handler chain
- Changing the CLI adapter (`src/adapters/cli.ts`)
- Changing the `dev-pipeline.yaml` process definition
- Replacing the terminal pipeline runner (`dev-pipeline.ts` CLI mode) — it continues working for terminal use
- Adding trust management UI to the bot (future work)
- Building a new Telegram UI framework — reuse existing bot patterns
- Changing the bot's free-text chat or skill invocation features

## Inputs

1. `src/dev-bot.ts` — Current Telegram bot (653 lines). Understand gate handler pattern, inline keyboards, chat session management
2. `src/dev-pipeline.ts` — Current standalone orchestrator. Understand `runPipeline()`, `runClaude()`, review gate flow
3. `src/dev-session.ts` — Session state management shared by both
4. `src/engine/heartbeat.ts` — Engine functions: `startProcessRun()`, `fullHeartbeat()`, `heartbeat()`
5. `src/cli/commands/approve.ts` — Approve flow: DB operations, feedback recording, heartbeat continuation
6. `src/cli/commands/reject.ts` — Reject flow: feedback recording, run status update
7. `src/engine/harness-handlers/memory-assembly.ts` — Memory assembly handler (needs intra-run context addition)
8. `processes/dev-pipeline.yaml` — Process definition with `cli-agent` steps and conditional routing
9. `docs/architecture.md` — Six-layer architecture, harness pipeline, adapter pattern

## Constraints

- MUST use engine's exported functions directly (import `startProcessRun`, `fullHeartbeat`, etc.) — NOT shell out to `aos` CLI commands. The bot is a Node.js process in the same codebase; direct function calls give typed results and avoid serialization overhead.
- MUST preserve all existing bot features: free-text chat, skill invocation, `/status`, `/help`, `/newchat`, quick actions
- MUST NOT break the terminal pipeline runner (`pnpm dev-pipeline`)
- MUST ensure the DB is initialized before engine calls (guard check or auto-sync)
- MUST handle long-running `claude -p` steps (CLI adapter has 10-minute timeout — the bot should remain responsive to other messages during step execution)
- MUST NOT modify the harness pipeline handler chain or the trust gate algorithm
- MUST require `TELEGRAM_CHAT_ID` in `.env` — the auto-lock-to-first-message pattern is a security risk when the bot routes through the engine with `--dangerously-skip-permissions` (inherited from CLI adapter, not a new risk, but must be mitigated)
- The `--dangerously-skip-permissions` flag is inherited from the CLI adapter and is not introduced by this brief. It is acknowledged as the current permission model for `claude -p` subprocess execution

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Direct engine API import | Ditto CLI commands (`src/cli/commands/start.ts`, `approve.ts`) | Same pattern — CLI commands already import engine functions directly. Bot does the same. |
| Review action extraction | Ditto CLI `approve.ts` `doApprove()` logic | Existing working logic for approve/edit/reject DB operations + feedback recording. Extract to shared utility. |
| Intra-run context passing | Ditto `dev-session.ts` `buildContextPreamble()` concept | The standalone orchestrator passes prior role outputs to subsequent roles. The engine needs equivalent via memory assembly. |
| Telegram inline keyboard review | Existing `dev-bot.ts` gate handler | Keep the proven UX — just change what happens behind the buttons. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/review-actions.ts` | Create: Extract approve/edit/reject logic from CLI commands into shared functions (`approveRun`, `editRun`, `rejectRun`) that both CLI and bot can call |
| `src/cli/commands/approve.ts` | Modify: Use `approveRun()` from review-actions.ts instead of inline logic |
| `src/cli/commands/reject.ts` | Modify: Use `rejectRun()` from review-actions.ts instead of inline logic |
| `src/engine/harness-handlers/memory-assembly.ts` | Modify: Add intra-run context — query completed step outputs from same process run and inject as "Run Context" section alongside agent/process memories |
| `src/dev-bot.ts` | Modify: Replace `runPipeline()` orchestration path with engine heartbeat loop. `/start` → `startProcessRun()` + `fullHeartbeat()`. Gate callbacks → `approveRun()`/`editRun()`/`rejectRun()` + `fullHeartbeat()`. Keep all Telegram UI, chat, skills. |
| `src/engine/harness-handlers/memory-assembly.test.ts` | Modify: Add test for intra-run context injection |

## User Experience

- **Jobs affected:** Orient (see step outputs in Telegram), Review (approve/edit/reject via inline keyboard), Capture (feedback captured as engine feedback, not dev-session JSON)
- **Primitives involved:** Review Queue (mapped to Telegram inline keyboard), Feedback Widget (mapped to Telegram text input)
- **Process-owner perspective:** The human's Telegram experience is nearly identical — same buttons, same flow. The difference is invisible but fundamental: behind the buttons, the engine records feedback, assembles memory, evaluates trust, and routes conditionally. Over time, the human sees the compound effect: memory from prior runs appears in step context, trust data accumulates, correction patterns are detected.
- **Interaction states:** Running (step executing — "⏳ Running architect..."), Waiting review (step output shown with inline keyboard), Error (step failed — retry/skip/quit keyboard), Complete (pipeline done — summary shown)
- **Designer input:** Not invoked — lightweight UX section only. The Telegram UI patterns are already proven from the existing bot.

## Acceptance Criteria

1. [ ] `/start <task>` creates a process run via `startProcessRun("dev-pipeline", { task })` and a work item, then calls `fullHeartbeat()` to begin execution
2. [ ] Each step executes through the full harness pipeline (memory-assembly → step-execution → review-pattern → routing → trust-gate → feedback-recorder)
3. [ ] When heartbeat returns `waiting_review`, the bot shows the step output and inline keyboard (Approve/Edit/Reject) via Telegram
4. [ ] Approve via inline keyboard calls `approveRun()` which records approval feedback, marks step approved, then calls `fullHeartbeat()` to continue
5. [ ] Edit/feedback via inline keyboard captures text from Telegram, calls `editRun()` which records edit feedback with diff, then calls `fullHeartbeat()` to continue
6. [ ] Reject via inline keyboard captures reason text, calls `rejectRun()` which records rejection feedback and pauses the run
7. [ ] Memory assembly handler includes outputs from completed steps in the same process run as a "Run Context" section, rendered AFTER agent/process memories with a separate `RUN_CONTEXT_TOKEN_BUDGET` of 1500 tokens (step outputs truncated to fit). This is ephemeral per-run state, not durable memory — add a code comment explaining the distinction
8. [ ] Routing decisions follow `dev-pipeline.yaml` route_to conditions (e.g., PM outputs "brief exists" → routes to builder, skipping researcher/designer/architect)
9. [ ] `review-actions.ts` exports `approveRun(runId, options?)`, `editRun(runId, feedback, options?)`, `rejectRun(runId, reason)` — pure engine functions that perform DB operations + feedback recording, return typed results, and never call `process.exit()` or interact with TTY. CLI commands (`approve.ts`, `reject.ts`) refactored to use them. Step run status updates target only the specific step that is `waiting_review`, not all step runs for the process run
10. [ ] Existing bot features preserved: free-text chat with Claude, skill invocation via buttons, `/status`, `/help`, `/newchat`, quick actions
11. [ ] Bot checks DB initialization on startup (process exists in DB) and shows clear error if `pnpm cli sync` hasn't been run
12. [ ] Bot remains responsive to messages while a step is executing (async execution, not blocking the message handler)
13. [ ] Bot requires `TELEGRAM_CHAT_ID` to be set in `.env` when running in engine-bridge mode. The auto-lock-to-first-message behaviour is a security risk when the bot has `--dangerously-skip-permissions` execution capability through the CLI adapter
14. [ ] Test: memory assembly handler intra-run context test added (query step outputs from same run, inject into context, respects separate token budget)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Does the bridge use the engine's real harness pipeline (not a bypass)?
   - Is feedback properly recorded via the engine's feedback-recorder handler?
   - Are review actions extracted cleanly (no logic duplication between CLI and bot)?
   - Is intra-run context passing correct (query completed steps, not all steps)?
   - Does the trust gate still function correctly (supervised → all steps pause)?
   - Are existing bot features preserved (regression check)?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Ensure DB is initialized with dev-pipeline process
pnpm cli sync

# 2. Start the Telegram bot
pnpm dev-bot

# 3. In Telegram, send: /start Design the bridge brief
# Expected: Bot creates engine process run, runs PM step through harness,
#   shows PM output with Approve/Edit/Reject keyboard

# 4. Tap Approve
# Expected: Bot records approval in engine, runs next step (researcher or
#   whatever PM's routing decides), shows next output

# 5. Check engine state
pnpm cli review
# Expected: Shows review queue items from the engine DB (not dev-session.json)

pnpm cli status
# Expected: Shows the process run with step statuses

# 6. Check memories were recorded
# After approving 2+ steps, subsequent steps should include
# "Run Context" section with prior step outputs
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark Telegram engine bridge as done
3. Archive Insight-032 (dev process is first workspace dogfood) — this brief completes it
4. Capture any design insights that emerged during build
5. Insight-050 (validation before infrastructure) — this is the first real validation step
6. Update `docs/architecture.md` Layer 2 agent harness assembly to document intra-run context as a third input alongside agent-scoped and process-scoped memories (ephemeral per-run state, distinct from durable memory)
7. Phase retrospective: what worked, what surprised, what to change
