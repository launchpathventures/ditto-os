# Brief: Phase 10h — Workspace Transitions

**Date:** 2026-03-25
**Status:** draft
**Depends on:** Brief 045 (Component Protocol — complete), Brief 042 (Navigation & Detail — complete). Brief 045 provides AI SDK v6 (`UIMessage.parts` for tool result detection), the 16-type block registry (for artifact + onboarding rendering), parts-based message component, and action callback infrastructure.
**Unlocks:** All future Self-driven UI composition (Insight-086). Enhances Briefs 043 (Proactive Engine) and 044 (Onboarding) which are already built — their content blocks now render in the workspace context, not just conversation-only mode.

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard — The Living Workspace
- **Capabilities:** Self-driven workspace mode transitions, conversation coexisting with feed, right panel adaptive modes, artifact review surface, process builder surface

## Context

The workspace has a gap: the chat input exists at the bottom of the centre column (AC3 from workspace redesign), but **conversation messages aren't rendered in the workspace.** The `useChat` hook is wired up in `workspace.tsx` (input, sendMessage, chatLoading), but there's no message list. When the user types, nothing visible happens.

More fundamentally, the Self has no way to change what the workspace shows. It can respond with text and content blocks, but it cannot:
- Make conversation messages appear in the centre column
- Switch the right panel from contextual intelligence to a Process Builder
- Show an artifact for review in the right panel
- Trigger a workspace transition (conversation-only → workspace) when the first process is created

This brief connects the Self's tool usage to workspace layout changes, using the same pattern already proven by `credential-request`: the frontend detects tool results and reacts with UI changes.

### Intentional architecture drift

`docs/architecture.md` defines Explore mode as "Conversation + Process Builder (dual pane)" in the centre canvas. This brief puts the Process Builder in the **right panel** instead, keeping the centre as a pure conversation surface. This is the Designer's recommended layout (validated in `self-driven-workspace-transitions-ux.md`) — the three-panel workspace naturally maps the "dual pane" across centre (conversation) + right (builder) rather than splitting the centre. Architecture.md will be updated in the After Completion step.

### Why this is Phase 10, not later

Brief 043 (Proactive Engine) needs the Self to render briefings and suggestions in the workspace. Brief 044 (Onboarding) needs the Self's conversation to coexist with workspace content. Both are blocked without conversation rendering in the workspace.

## Objective

When the user talks to the Self in workspace mode, conversation messages appear in the centre column (coexisting with feed). When the Self calls specific tools, the right panel adapts to show the relevant context: Process Builder during process creation, artifact viewer during output review, trust evidence during process inspection.

## Non-Goals

- `context-shift` as a formal streaming protocol event type — deferred to Phase 11 when we add a second surface (Telegram). Phase 10 uses the simpler approach: frontend detects tool names in existing `tool-call-result` events.
- Full composable UI where the Self dynamically composes the centre canvas from a component catalog (Insight-086) — this brief is the stepping stone, not the destination.
- Process Builder as a full structured editor — this brief renders YAML structure in the right panel (read-only preview with progress badge). Interactive editing is Phase 12+.
- Artifact viewer with inline editing — this brief renders process outputs for review (approve/reject). Inline editing is Phase 12+.
- Tabbed conversations (Melty pattern) — power-user feature, Phase 12+.
- Right-column conversation (copilot pattern) — evaluated and deferred. Content-primary workflows use compact conversation at bottom of centre, not a conversation panel on the right.
- `adapt_process` panel transition — could show updated process structure after runtime adaptation. Deferred — the onboarding flow renders adaptation results inline via `ProcessProposalBlock`. Revisit when non-onboarding processes use adaptation.
- Process Builder mobile rendering (inline summary card) — deferred. Process creation is a desktop-first workflow. Mobile users see the Self's text responses only.

## Inputs

1. `docs/research/self-driven-workspace-transitions-ux.md` — the Designer's full interaction spec (6 scenarios, transition rules, mobile adaptation)
2. `docs/research/output-as-artifact-ux.md` — artifact panel model, right panel states, persona stress tests
3. `docs/research/workspace-layout-redesign-ux.md` — the three-panel layout spec (foundation for this brief)
4. `packages/web/components/layout/workspace.tsx` — current workspace: has `useChat` wired but no message rendering
5. `packages/web/components/layout/right-panel.tsx` — current right panel: `PanelContext = feed | process | empty`
6. `packages/web/app/entry-point.tsx` — progressive reveal: `switchToWorkspace()` exists but only triggered by button click
7. `packages/web/components/self/message.tsx` — parts-based message component (Brief 045 — renders `UIMessage.parts` via block registry, 7-state tool lifecycle)
8. `packages/web/components/self/typing-indicator.tsx` — existing typing indicator (reuse in workspace)
9. `packages/web/components/blocks/block-registry.tsx` — unified component registry (Brief 045 — 16 block types including 3 onboarding types from Brief 044)
10. `src/engine/content-blocks.ts` — 16 ContentBlock types (Brief 045 + 044)
11. `src/engine/briefing-assembler.ts` — briefing assembly (Brief 043 — produces briefing data for `get_briefing` tool)
12. `src/engine/self-tools/get-briefing.ts` — briefing tool (Brief 043 — tool result structure for transition map)

## Constraints

- MUST reuse Brief 045's parts-based message rendering (`message.tsx` with `UIMessage.parts` iteration and `BlockRenderer`) and `TypingIndicator` — no new message rendering. Workspace messages use the same component as conversation-only mode.
- MUST NOT break existing right panel behaviour — feed context and process context continue to work
- MUST preserve existing responsive breakpoints: >=1280px full, 1024-1279px collapsed sidebar, <1024px hamburger+overlay
- MUST NOT introduce new streaming event types — consume AI SDK v6 `UIMessage.parts` (tool-invocation parts with 7-state lifecycle from Brief 045). Packages: `ai@^6.0.138`, `@ai-sdk/react@^3.0.140`.
- MUST use a single constant map (`TRANSITION_TOOL_MAP`) for tool-name-to-panel-context mapping — no string matching scattered across components
- MUST NOT modify engine files (`self-stream.ts`, `self-delegation.ts`, `self.ts`) — this is purely frontend work building on Brief 045's streaming infrastructure
- Security: right panel content driven by tool results must come from the server-side tool execution, not from client-side data. The `PanelContext` extension carries identifiers (processId, runId), not data payloads — components fetch their own data via existing React Query hooks.
- Mobile: context-shifts that would show a right panel must degrade to inline cards or bottom sheets on <1024px viewports

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Conversation + artifact split-pane | Melty IDE, v0-clone | pattern | Studied from screenshots + reference code. Centre=conversation, right=structured output. Validated in Designer spec. |
| Tool-result-driven UI state | Existing `credential-request` flow (Ditto) | extend | Already proven: Self calls tool → streaming layer emits event → frontend renders different UI. This brief extends the pattern to layout transitions. |
| Collapsible work summaries | Melty IDE | pattern | "13 tool calls, 7 messages" collapsed blocks between messages. Applied to Self tool calls in conversation. |
| Output lifecycle badge | Melty IDE "PR #1432 → Ready to merge" | pattern | Artifact state badge at top of right panel. Maps to process run status. |
| Bottom sheet for mobile artifacts | iOS/Android convention | pattern | Standard mobile pattern for modal content that overlays the primary view. |

## What Changes (Work Products)

### Centre Column: Conversation + Feed Coexistence

| File | Action |
|------|--------|
| `packages/web/components/layout/workspace.tsx` | Modify: Destructure `messages` from `useChat` (AI SDK v6 `UIMessage[]`). Render messages inside the existing `<div className="flex-1 overflow-y-auto">` scrollable container, AFTER the `<Feed />` component. Feed cards are above, conversation messages are below (closest to the input bar). The `border-t` input bar stays outside the scrollable area (fixed at bottom). Add `messagesEndRef` for auto-scroll to latest message. Render each message using Brief 045's parts-based `Message` component (the same component used in conversation-only mode). Track `messages` — when non-empty, render message list after Feed. |

### Right Panel: Adaptive Modes

| File | Action |
|------|--------|
| `packages/web/components/layout/right-panel.tsx` | Modify: Extend `PanelContext` with 3 new modes: `{ type: "process-builder"; yaml: string; slug?: string }`, `{ type: "artifact-review"; runId: string; processId: string }`, `{ type: "briefing"; data: BriefingData }`. Add components for each new mode. Add `panelOverride` prop that takes priority over centre-view-reactive context (tool-driven context overrides default). |
| `packages/web/components/layout/process-builder-panel.tsx` | Create: Right panel variant for process creation. Renders: process name + "Drafting" badge, discovered inputs (checklist), steps (numbered list with executor type badges), quality criteria (when defined), outputs (when defined). All data parsed from YAML string prop. Read-only — the conversation drives changes, not this panel. |
| `packages/web/components/layout/artifact-viewer-panel.tsx` | Create: Right panel variant for output review. Renders: artifact name + lifecycle badge (Under Review / Approved / Rejected), the output content via Brief 045's `BlockRegistry` component (process output `ContentBlock[]` from the feed assembler — `DataBlock` for structured data, `ReviewCardBlock` for review items, `AlertBlock` for errors), review actions (Approve / Edit / Reject buttons calling existing `/api/feed` POST), provenance strip using `KnowledgeCitationBlock`. Fetches data via existing `getProcessRunDetail()` React Query hook. |

### Tool-Result → Panel Transition

| File | Action |
|------|--------|
| `packages/web/lib/transition-map.ts` | Create: `TRANSITION_TOOL_MAP` constant mapping tool names to panel context factories. `generate_process` (save=false) → `process-builder` context. `generate_process` (save=true) → `process` context (navigate to process detail). `get_process_detail` → `process` context. `get_briefing` → `briefing` context (briefing data rendered in right panel — from Brief 043's proactive engine). Export `resolveTransition(toolName: string, result: unknown): PanelContext | null`. Single source of truth — Phase 11 migration to `context-shift` protocol events replaces this one file. |
| `packages/web/components/layout/workspace.tsx` | Modify: After rendering messages, scan `messages` (AI SDK v6 `UIMessage[]`) for tool-invocation parts where `part.type === "tool-invocation"` and `part.state === "result"`. Extract `toolName` and `result` from the most recent completed tool part. Pass through `resolveTransition()` from `transition-map.ts`. When a match is found, set `panelOverride` state. Pass `panelOverride` to `RightPanel`. Clear override when user navigates via sidebar or clicks Home. |

### Self-Driven Mode Switching

| File | Action |
|------|--------|
| `packages/web/app/entry-point.tsx` | Modify: Watch for `generate_process(save=true)` tool results via a shared hook or event. When the first process is created via conversation, auto-switch from conversation-only to workspace mode. This replaces the manual "See your workspace →" button for the Self-initiated case. |

### Mobile Bottom Sheet

| File | Action |
|------|--------|
| `packages/web/components/layout/artifact-sheet.tsx` | Create: Bottom sheet component for mobile (<1024px) artifact review. Slides up from bottom, swipe-to-dismiss. Renders the same artifact viewer content as the right panel variant. Triggered by a "View [artifact] →" affordance in conversation messages when on mobile. Uses existing shadcn Dialog or Sheet primitive. |
| `packages/web/components/layout/workspace.tsx` | Modify: On <1024px, when a tool result triggers an artifact-review transition, show the bottom sheet instead of modifying the (non-existent) right panel. |

## User Experience

- **Jobs affected:** Orient (conversation + feed coexistence), Review (artifact viewer), Define (Process Builder), Delegate (trust evidence in artifact viewer provenance), Capture (quick messages in workspace), Decide (trust evidence during process inspection)
- **Primitives involved:** Conversation Thread (P8), Process Builder (P9), Output Viewer (P6), Activity Feed (P3)
- **Process-owner perspective:** The workspace comes alive. When Rob types "how's Henderson going?" he sees the answer appear in the centre column, right where he typed. When Lisa says "I spend hours writing listings," the Process Builder appears in the right panel showing her process taking shape. When Jordan's dev pipeline finishes, the right panel shows code changes for review. The workspace responds to conversation — it's not two disconnected surfaces anymore.
- **Interaction states:**
  - *No conversation:* Feed fills the centre. Right panel shows contextual intelligence. Current behaviour, unchanged.
  - *Active conversation:* Messages appear below feed, above input. Right panel may adapt based on tool results.
  - *Process Builder active:* Right panel shows emerging process structure. Updates on each `generate_process` preview.
  - *Artifact review active:* Right panel shows full output with review controls and provenance.
  - *Mobile artifact:* Bottom sheet slides up with artifact content. Swipe to dismiss.
  - *Panel override cleared:* User clicks Home or sidebar item → right panel returns to default context.
  - *Loading:* Right panel shows skeleton while data loads for new context.
  - *Error:* Right panel shows error message with retry affordance.
- **Designer input:** `docs/research/self-driven-workspace-transitions-ux.md` (6 scenarios, transition rules, session boundaries, mobile adaptation), `docs/research/output-as-artifact-ux.md` (artifact panel model, persona stress tests)

## Acceptance Criteria

1. [ ] Conversation messages from `useChat` render in the workspace centre column, between feed and input. Messages appear above the prompt input. Feed is above messages (scrollable).
2. [ ] When no messages exist, the centre column shows only the feed + input (current behaviour, unchanged).
3. [ ] `TypingIndicator` appears in the workspace centre column when the Self is responding (chatLoading state).
4. [ ] `PanelContext` type extended with `process-builder`, `artifact-review`, and `briefing` modes. Right panel renders appropriate component for each mode.
5. [ ] `TRANSITION_TOOL_MAP` in `transition-map.ts` maps tool names to panel context factories. Single source of truth for all tool→panel mappings.
6. [ ] When `generate_process(save=false)` tool result appears in messages, right panel switches to Process Builder showing the emerging YAML structure.
7. [ ] When `generate_process(save=true)` tool result appears, centre view navigates to the new process detail, and right panel shows process trust context.
8. [ ] Process Builder panel renders: name, "Drafting" badge, inputs checklist, steps list, quality criteria (when defined). All from YAML.
9. [ ] Artifact Viewer panel renders: name, lifecycle badge, output content, review actions (Approve/Edit/Reject), provenance strip. Data fetched via React Query.
10. [ ] Clicking Approve/Edit/Reject in artifact viewer calls existing review action endpoints (`/api/feed` POST). Same flow as feed card inline review.
11. [ ] Panel override clears when user navigates via sidebar click or Home button. Right panel returns to default context.
12. [ ] On <1024px viewport, artifact-review transitions show a bottom sheet instead of right panel. Sheet slides up, swipe to dismiss.
13. [ ] `entry-point.tsx` auto-switches from conversation-only to workspace mode when `generate_process(save=true)` tool result is detected (first process created via Self). No manual "See your workspace" button needed for this case.
14. [ ] 0 new type errors (`pnpm run type-check` in packages/web). 0 new test failures (`pnpm test`).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + the three Designer UX specs
2. Review checks: conversation messages visible in workspace, right panel adapts to tool results, Process Builder renders YAML, Artifact Viewer has review actions, mobile bottom sheet works, panel override clears on navigation, no visual regressions, type safety throughout
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the app
pnpm dev

# 2. Navigate to workspace mode (or have existing processes)
# Expected: Feed visible, chat input at bottom, right panel shows contextual intelligence

# 3. Type "what's happening?" in the workspace chat input
# Expected: Self responds. Messages appear in centre column BETWEEN feed and input.
# Expected: Feed is scrollable above the messages.

# 4. Type "create a process for invoice follow-up"
# Expected: Self asks questions, then calls generate_process(save=false)
# Expected: Right panel switches to Process Builder showing emerging YAML
# Expected: Process Builder shows name, inputs, steps as they're discovered

# 5. Confirm "save it"
# Expected: Self calls generate_process(save=true)
# Expected: Centre navigates to process detail view
# Expected: Right panel shows trust context ("Supervised — new process")

# 6. Navigate back to Home
# Expected: Right panel returns to contextual intelligence (default)
# Expected: Feed visible again

# 7. Resize browser to <1024px
# Expected: Right panel hidden (as before)
# Type a message that would trigger artifact-review
# Expected: Bottom sheet slides up with artifact content

# 8. Deterministic transition map verification
# In React DevTools or a test component, manually inject a message with
# a tool result where toolName='generate_process' and result includes save=false + YAML.
# Expected: Right panel switches to Process Builder showing the YAML structure.
# This verifies the transition map works independently of the Self's tool selection.

# 9. Check types and tests
cd packages/web && pnpm run type-check  # 0 errors
pnpm test  # 330+ pass
```

## After Completion

1. Update `docs/state.md` — workspace transitions shipped, conversation visible in workspace, right panel adaptive modes
2. Update `docs/architecture.md` — update Explore mode description: "Conversation in centre column + Process Builder in right panel" (resolves the drift flagged by Designer)
3. Update `docs/human-layer.md` — update Primitive 8 (Conversation Thread) to reflect conversation coexisting with feed in centre column, not a dedicated dual-pane
4. Verify Briefs 043 (Proactive Engine) and 044 (Onboarding) content blocks render correctly in workspace mode — their onboarding cards (`GatheringIndicatorBlock`, `KnowledgeSynthesisBlock`, `ProcessProposalBlock`) and briefing data should work in the workspace context without changes
