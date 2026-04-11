# Brief: Staged Outbound Tools — Per-Action Quality Gating

**Date:** 2026-04-11
**Status:** draft
**Depends on:** ADR-027 (accepted)
**Unlocks:** Brief 130 (Thin Process Templates)

## Goal

- **Roadmap phase:** Phase 10: Cognitive Autonomy
- **Capabilities:** Per-action quality gating for outbound tool calls during step execution

## Context

ADR-027 establishes that process steps will become broader — a single "work the lead" step may send multiple emails. The current quality gate runs once per step (post-execution handler). If the agent sends 5 emails during one step, the gate can't intercept individual sends. This is a safety failure.

**Solution:** Outbound tool calls (`crm.send_email`, `crm.send_sms`, etc.) don't dispatch immediately during step execution. They queue drafts. After step execution completes, the outbound quality gate handler iterates the queue, checking each draft independently. Approved drafts dispatch. Rejected drafts are flagged for review.

This makes the quality gate STRONGER than the current model: per-action instead of per-step.

## Objective

Every outbound action produced during step execution passes through the quality gate individually, regardless of how many actions the agent produces in a single step.

## Non-Goals

- Changing the quality gate rules themselves (those stay as-is)
- Changing the trust gate (still per-step)
- Changing how non-outbound tools work (web-search, record-interaction are immediate)
- Changing the harness handler order (outbound quality gate stays in its current position)
- Building thin process templates (that's Brief 130, after this is in place)

## Inputs

1. `packages/core/src/harness/handlers/outbound-quality-gate.ts` — current quality gate handler
2. `packages/core/src/harness/harness.ts` — HarnessContext type
3. `src/engine/channel.ts` — `sendAndRecord()` current dispatch function
4. `src/engine/tool-resolver.ts` — how tools are resolved for steps
5. `docs/adrs/027-cognitive-orchestration.md` — architectural decision

## Constraints

- Must be backward compatible — existing processes with narrow steps work unchanged
- The staged pattern only applies to tools marked as "outbound" — not all tools
- Tool calls must return a "queued" confirmation to the agent so it knows the email hasn't sent yet
- If the quality gate rejects a draft, the agent's step still completes (the rejection is recorded, not thrown)
- The draft queue must be inspectable by the trust gate (if the step is supervised, the human reviews the queue)
- No additional LLM calls in the staging/dispatch path — pure logic
- Engine-first: the staged tool pattern belongs in `@ditto/core` (any harness consumer benefits). The tool-specific wiring (which tools are staged) is Ditto product layer.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Staged dispatch | Database transaction outbox pattern | pattern | Same idea: write to outbox during business logic, dispatch after commit |
| Per-action quality gate | ADR-027 (Ditto) | adopt | This brief implements the staged tool mechanism from the ADR |
| Tool call interception | Vercel AI SDK middleware | pattern | Tool execution middleware that wraps calls before dispatch |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/harness/harness.ts` | Modify: Add `stagedOutboundActions: StagedOutboundAction[]` to HarnessContext. Type: `{ toolName: string, args: Record<string, unknown>, draftId: string }` |
| `packages/core/src/harness/handlers/outbound-quality-gate.ts` | Modify: Instead of checking single `context.outboundAction`, iterate `context.stagedOutboundActions`. Check each draft against house rules. Set `approved: boolean` on each. Record all actions (approved + rejected) via callback. |
| `src/engine/tool-resolver.ts` | Modify: Mark outbound tools (`crm.send_email`, `crm.send_sms`, etc.) with `staged: true` in their resolution. When a staged tool is called during execution, queue the call in context instead of dispatching. Return `{ status: "queued", draftId }` to the agent. |
| `src/engine/harness-handlers/step-execution.ts` or equivalent | Modify: After step execution completes, check `context.stagedOutboundActions`. For each approved action, dispatch via `sendAndRecord()`. For each rejected action, record as flagged activity. |
| `src/engine/channel.ts` | No changes — `sendAndRecord()` is called by the dispatch phase, not during execution |

## User Experience

- **Jobs affected:** Review (trust gate now shows individual drafts in the staged queue for supervised steps)
- **Primitives involved:** Review Queue (staged drafts surface here for supervised/critical tiers)
- **Process-owner perspective:** Invisible improvement. Quality gate now catches problems per-email instead of per-step. If one email is bad and four are good, only the bad one is flagged.
- **Designer input:** Not invoked — infrastructure change

## Acceptance Criteria

1. [ ] `HarnessContext` has `stagedOutboundActions: StagedOutboundAction[]` field in `@ditto/core`
2. [ ] `StagedOutboundAction` type includes: toolName, args, draftId, approved (boolean, set by gate)
3. [ ] Tools marked as `staged: true` in tool resolver queue to `context.stagedOutboundActions` instead of dispatching
4. [ ] The agent receives `{ status: "queued", draftId }` when calling a staged tool (not a "sent" confirmation)
5. [ ] Outbound quality gate handler iterates all staged actions, checking each independently
6. [ ] A rejected draft does NOT dispatch — it is recorded as a flagged activity
7. [ ] An approved draft dispatches via `sendAndRecord()` after the quality gate completes
8. [ ] Non-staged tools (web-search, record-interaction, etc.) execute immediately as before
9. [ ] Existing processes with narrow steps work unchanged (backward compat — empty staged queue is a no-op)
10. [ ] Trust gate can inspect the staged queue (for supervised steps, human reviews individual drafts)
11. [ ] `pnpm run type-check` passes at root and core
12. [ ] Unit tests cover: staging, gate approval, gate rejection, dispatch, backward compat

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Trust model (staged queue visible to trust gate), security (no draft dispatches without gate approval), backward compat (empty queue = no-op), engine-first (core types, product wiring)
3. Present work + review to human

## Smoke Test

```bash
pnpm run type-check
pnpm vitest run packages/core/src/harness/handlers/outbound-quality-gate.test.ts
pnpm vitest run src/engine/tool-resolver.test.ts

# Manual: run a process step that calls crm.send_email twice
# Verify: both calls queued, both checked by gate, both dispatched only after gate approval
```

## After Completion

1. Update `docs/state.md`: "Staged outbound tools: per-action quality gating"
2. Unblocks Brief 130 (Thin Process Templates)
3. Retrospective: is the staging latency noticeable? Any tools that should NOT be staged?
