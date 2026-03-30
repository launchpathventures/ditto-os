# Brief 052: Planning Workflow — Self-Guided Planning Conversations

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 050 (ArtifactBlock + Markdown Rendering — TextBlock renders markdown, artifact mode renders BlockList)
**Unlocks:** Brief 053 (Execution Pipeline + Visualization — pipeline can flow through UI with planning outputs as inputs)

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (Composable Workspace Architecture, ADR-024)
- **Capabilities:** Planning as first-class workflow, Self-guided intent detection, lightweight role consultation for planning, structured planning outputs through ContentBlocks

## Context

The dev process has two fundamentally different modes:

1. **Planning** — collaborative, back-and-forth, produces documents (briefs, ADRs, roadmap updates, architecture revisions, task definitions, vision/strategy updates)
2. **Execution** — delegated, pipeline-driven, produces code and artifacts

Currently, both flow through the same `start_dev_role` tool — a full process run that spawns a standalone role. This works for execution but is wrong for planning because:

- Planning conversations are iterative — the user and Self go back and forth refining scope, intent, and approach
- A full delegation is expensive (~1-5 min) and one-shot — it produces output and returns, breaking the collaborative flow
- The Self has no way to ask "Are you describing a new feature, updating an existing plan, or refining scope?" and then adapt its approach based on the answer
- Planning outputs vary widely: a conversation might produce a task, a brief, a roadmap update, an ADR, or nothing at all (just clarity)
- The Self currently cannot read or write project documents (roadmap.md, briefs, ADRs) — it must delegate to roles that can

The `consult_role` tool is close to what planning needs — it's a quick, cheap perspective check. But it's too limited: single question/answer, no document access, no structured output. Planning needs a middle ground between consultation (10 sec, no output) and delegation (1-5 min, full harness run).

### What Planning Conversations Look Like

| User says | Self should intuit | Outcome |
|-----------|-------------------|---------|
| "I want to add dark mode" | New feature → needs scoping | Task or brief, depending on size |
| "The auth approach isn't working" | Architecture revision | Updated ADR or new brief |
| "What should we work on next?" | Roadmap/priority discussion | Updated roadmap or triage recommendation |
| "I had an idea about the onboarding flow" | Design exploration | Captured insight, possibly a brief |
| "Let's revisit the trust model" | Architecture deep-dive | Updated architecture doc or ADR |
| "Can we ship X by Friday?" | Scope/feasibility check | Revised plan or reality check |

The Self must intuit intent from context — not force the user through a form.

## Objective

Give the Self a planning mode where it can guide collaborative conversations that produce structured outputs — without forcing every planning interaction through a rigid pipeline. The Self balances between process structure (standards for good project development) and autonomy to guide the best outcome.

## Non-Goals

- Replacing `start_dev_role` for execution — planning mode is for documents, not code
- Automated pipeline orchestration — that's Brief 053
- Process creation UI (generate_process already handles this)
- New block types — planning outputs use existing blocks (TextBlock for documents, ArtifactBlock for briefs, ChecklistBlock for plans)
- Per-session trust overrides — will be addressed in Brief 053 with session trust profiles

## Inputs

1. `cognitive/self.md` — Self's cognitive framework, consultative framing protocol
2. `src/engine/self-delegation.ts` — current tool definitions (start_dev_role, consult_role)
3. `src/engine/self.ts` — assembleSelfContext, delegation guidance
4. `src/engine/self-stream.ts` — streaming conversation loop, toolResultToContentBlocks
5. `.claude/commands/dev-pm.md` — PM role contract (triage, sequencing)
6. `.claude/commands/dev-architect.md` — Architect role contract (briefs, ADRs)
7. `src/engine/tools.ts` — codebase tools (read_file, write_file, search_files, list_files)
8. `src/engine/content-blocks.ts` — existing block types (TextBlock, ArtifactBlock, ChecklistBlock)
9. `docs/insights/` — existing insights (for planning conversations that produce insights)

## Constraints

- **The Self guides, not a pipeline.** Planning conversations are freeform with the Self asking clarifying questions, consulting roles for perspective, and producing structured artifacts when the user is ready. No mandatory step sequence.
- **Planning roles only: PM, Researcher, Designer, Architect.** Planning conversations stop before Builder. If the outcome is "this needs building," the output is a brief — execution is a separate action.
- **`consult_role` is the primary planning tool.** Planning extends consultation, not delegation. The Self asks focused questions of roles inline in the conversation, synthesizes their perspectives, and presents structured output.
- **Document read via codebase tools, write via confirmation.** All planning roles get read-only codebase tools. Architect additionally proposes writes (restricted to `docs/` paths) — but proposed content returns to the Self, which presents it to the user for approval before persisting. This matches the `generate_process` confirmation pattern and ensures the harness records human decisions on planning outputs.
- **PM stays read-only.** PM analyzes and recommends; the Self or Architect writes. This is consistent with the existing permission model (`dev-pm-standalone.yaml`: `tools: read-only`). No role-permission splits across invocation paths.
- **Planning decisions recorded.** Every `plan_with_role` call records a decision event via `recordSelfDecision()` with type `planning`. When the user approves/edits/rejects a proposed document, the feedback is captured. The learning layer observes planning quality the same way it observes delegation quality.
- **Outputs flow through ContentBlocks.** Planning outputs render as ArtifactBlock (for briefs, ADRs), TextBlock (for inline summaries), ChecklistBlock (for action items).
- **The Self must intuit intent.** The delegation guidance in the system prompt gets a planning section that teaches the Self to recognize planning conversations and adapt its approach.
- **MAX_TOOL_TURNS stays at 10.** Planning conversations are multi-turn (user ↔ Self), not multi-tool-call in a single turn. The 10-turn limit is per user message, which is sufficient.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Consultative framing | `cognitive/self.md` | pattern | Self's existing conversation shape — listen, assess, ask, reflect, hand off |
| Role consultation | `consult_role` in `self-delegation.ts` | pattern | Extending the existing lightweight consultation pattern |
| Codebase tools | `src/engine/tools.ts` | pattern | Existing read/write/search tools for document access |
| Planning artifact output | Claude Artifacts (Anthropic) | pattern | Long-form output as a reviewable artifact, not inline dump |
| Intent detection | Ditto consultative framing protocol | pattern | Self already calibrates framing depth by input type |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-delegation.ts` | Modify: Add `plan_with_role` tool definition. Takes `role` (pm/researcher/designer/architect only), `objective` (what the planning conversation should achieve), `context` (optional string), and `documents` (optional string array of file paths to read). Runs the role with read-only codebase tools (read_file, search_files, list_files) for all planning roles. Architect role additionally gets write_file restricted to `docs/` paths only. PM stays read-only (consistent with existing permission model). Returns proposed content to the Self for user confirmation before any writes persist. |
| `src/engine/self-delegation.ts` | Modify: Add `plan_with_role` handler. Loads role contract, assembles planning-specific system prompt (role contract + read-only codebase tools + planning framing), calls createCompletion with tool_use for codebase tools, handles tool calls in a loop (up to 5 tool turns for document reading). For architect write operations: validates path is within `docs/` directory, returns proposed file content in output metadata as `proposedWrites: { path, content }[]` — the Self presents these to the user and writes only after confirmation (same pattern as `generate_process` save=false → save=true). Records a planning decision event via `recordSelfDecision()` for learning layer visibility. |
| `src/engine/self.ts` | Modify: Extend `<delegation_guidance>` section with planning intent detection guidance. Self learns to recognize planning conversations (scope discussions, architecture questions, roadmap reviews, "what should we..." questions) and use `plan_with_role` + `consult_role` instead of `start_dev_role`. Self guides: "Are you describing a new feature, updating an existing plan, or refining scope?" when intent is ambiguous. |
| `src/engine/self-stream.ts` | Modify: Add `plan_with_role` to `toolResultToContentBlocks()`. When output includes a file path (brief, ADR, insight), emit ArtifactBlock with document type. When output is inline analysis, emit TextBlock. When output includes action items, emit ChecklistBlock. |
| `cognitive/self.md` | Modify: Add "Planning Conversations" section to Dev Pipeline Domain Context. Describes the planning workflow shape: intuit intent → ask clarifying questions → consult roles → produce structured output. Lists the output types (task, brief, ADR, roadmap update, architecture revision, insight, or just clarity). Emphasizes that planning is collaborative — the Self earns trust through good questions and structured thinking, not just executing a pipeline. |

## User Experience

- **Jobs affected:** Define (primary — shaping what gets built), Orient (understanding project state before planning), Decide (approving planning outputs)
- **Primitives involved:** Conversation Stream (Primitive 1), Artifact Viewer (Primitive 10 — for viewing briefs/ADRs produced), Review Interface (Primitive 3 — for approving outputs)
- **Process-owner perspective:** The user opens a conversation and says "I want to add dark mode" or "Let's revisit the roadmap." The Self recognizes this as a planning conversation and engages collaboratively — asking clarifying questions, reading relevant docs, consulting role perspectives, and eventually producing a structured output (a brief, a task, a roadmap update). The output appears as an ArtifactBlock that the user can open and review. The conversation stays conversational — no pipeline progress bars, no "delegating to PM..." status messages. It feels like talking to a competent project manager who takes notes and produces documents.
- **Interaction states:**
  - **Intent detection:** Self responds with a clarifying question or reflects back what it heard — "It sounds like you're describing a new feature. Let me check the roadmap to see where this fits."
  - **Role consultation:** Subtle status — "Let me check with the Architect on this..." (uses consult_role, fast, inline). No full delegation status.
  - **Document reading:** Self reads relevant docs via plan_with_role — transparent to user, Self references what it found: "Looking at the current roadmap, this would fit in Phase 11."
  - **Output production:** ArtifactBlock appears in conversation stream when Self produces a brief/ADR/insight. User can open it in artifact mode.
  - **No output needed:** Some planning conversations just produce clarity — Self confirms understanding, user moves on. No forced document production.
- **Designer input:** Not invoked — planning workflow is conversational, not visual. The UI surface is the existing conversation stream + artifact mode.

## Acceptance Criteria

1. [ ] `plan_with_role` tool defined in `self-delegation.ts` with `role` (enum: pm, researcher, designer, architect), `objective` (string), `context` (optional string), and `documents` (optional string array of file paths to read) parameters.
2. [ ] `plan_with_role` handler loads role contract, provides read-only codebase tools (read_file, search_files, list_files) to all four planning roles. PM, Researcher, and Designer are strictly read-only. Architect additionally gets write_file restricted to `docs/` paths only.
3. [ ] `plan_with_role` handler runs a tool-use loop (up to 5 tool turns) allowing the role to read documents and (for architect) propose writes, then returns structured output.
4. [ ] `plan_with_role` rejects builder, reviewer, and documenter roles with a clear error message ("Planning uses PM, Researcher, Designer, and Architect roles. For execution, use start_dev_role.").
5. [ ] Architect write operations in `plan_with_role` are path-restricted: `write_file` calls validate that the target path is within `docs/` directory. Paths outside `docs/` are rejected with an error message.
6. [ ] Architect write operations return proposed content to the Self as `proposedWrites: { path: string, content: string }[]` in result metadata. The Self presents proposals to the user. Files are persisted only after explicit user confirmation (matching the `generate_process` save=false → save=true pattern).
7. [ ] Every `plan_with_role` invocation records a decision event via `recordSelfDecision({ decisionType: "planning", details: { role, objective, outputType } })`. When the user approves/edits/rejects a proposed document, a feedback event is recorded.
8. [ ] Delegation guidance in `self.ts` updated with planning intent detection section: Self recognizes planning patterns (scope discussions, architecture questions, roadmap reviews, idea exploration) and routes to `plan_with_role` / `consult_role` instead of `start_dev_role`.
9. [ ] Delegation guidance includes specific examples of planning vs execution routing: "I want to add X" → planning (scope first), "Build Brief 050" → execution (brief exists, ready to build).
10. [ ] `toolResultToContentBlocks()` handles `plan_with_role` results: proposed files → ArtifactBlock with "Pending Approval" status, inline analysis → TextBlock, action items → ChecklistBlock.
11. [ ] `cognitive/self.md` updated with Planning Conversations section describing the workflow shape and output types.
12. [ ] `plan_with_role` output includes structured metadata: `{ proposedWrites: { path, content }[], filesRead: string[], outputType: "brief" | "adr" | "insight" | "task" | "update" | "analysis" }`.
13. [ ] Self can read existing project documents (roadmap.md, architecture.md, briefs) through `plan_with_role` — role reads the docs and summarizes/references them in its output.
14. [ ] `pnpm run type-check` passes with 0 errors.
15. [ ] Existing `consult_role` and `start_dev_role` tools continue to work unchanged (no regression).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - **Composability**: Planning outputs flow through ContentBlocks (ArtifactBlock, TextBlock, ChecklistBlock). No bespoke planning UI.
   - **Engine integration**: `plan_with_role` follows existing tool patterns. Codebase tool access uses existing `executeTool()` path.
   - **Security**: Write access limited to architect role only, restricted to `docs/` paths. PM/Researcher/Designer are strictly read-only (consistent with existing permission model). Proposed writes require user confirmation. Path validation on codebase tools prevents traversal. No shell execution in planning mode.
   - **Self coherence**: Delegation guidance additions are consistent with cognitive framework's consultative framing protocol.
   - No regressions to existing tools or conversation flow.
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run existing tests to verify no regression
cd /Users/thg/conductor/workspaces/agent-os/paris
pnpm test

# 2. Type-check
pnpm run type-check

# 3. Start web app
pnpm dev

# 4. Test planning conversation:
#    User: "I want to add a dark mode toggle"
#    Self should: ask clarifying questions, NOT immediately delegate to start_dev_role
#    Self should: consult architect perspective, read relevant docs
#    Self should: produce a brief or task depending on scope
#    Output should: appear as ArtifactBlock (if brief) or StatusCardBlock (if task)

# 5. Test execution distinction:
#    User: "Build Brief 050"
#    Self should: use start_dev_role (execution, not planning)

# 6. Test document reading:
#    User: "What's on the roadmap for Phase 11?"
#    Self should: use plan_with_role to read docs/roadmap.md, respond with summary

# 7. Verify: plan_with_role rejects builder role
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark "Planning Workflow" as done
3. Update `docs/architecture.md` — document `plan_with_role` tool and planning vs execution distinction
4. Phase retrospective: Did the Self correctly distinguish planning from execution? Was the consultation model sufficient or did planning need full delegation for some cases?
5. Next: Brief 053 (Execution Pipeline + Visualization) — pipeline orchestration through the UI
