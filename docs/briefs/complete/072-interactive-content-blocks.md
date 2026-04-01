# Brief: Interactive ContentBlocks — Editable Blocks and Action Protocol

**Date:** 2026-04-01
**Status:** draft
**Depends on:** Brief 069 (Rich Block Emission — block types must be emitted before they can be interactive)
**Unlocks:** Brief 073 (Composition Intent Activation — create flows need editable blocks)

## Goal

- **Roadmap phase:** Phase 12: Conversation Surface Evolution
- **Capabilities:** Form-conversation interleave, editable process proposals, inline work item creation

## Context

Insight-135 established that forms and conversation must interleave — not "no CRUD" but editable blocks inside conversation. When Self proposes a process, the user needs to directly edit fields (name, trigger, steps), not describe changes in words. When creating a work item, the user needs a structured form, not a free-text conversation.

ADR-021 defines `handleSurfaceAction()` for simple actions (approve/reject). This brief extends it to support field editing, form submission, and OAuth flows within blocks. The Paperclip.ai pattern (structured creation + AI expansion) is the reference model.

## Objective

Self emits editable blocks (ProcessProposalBlock, WorkItemFormBlock, ConnectionSetupBlock) that the user edits inline and submits — all within the conversation flow. Forms for known structure, conversation for judgment.

## Non-Goals

- Drag-and-drop step reordering (click-to-reorder is sufficient for v1)
- Rich text editing within block fields
- Block persistence / edit history / versioning
- Custom block types created by users
- Mobile-specific touch interactions for form fields
- Undo/redo for block edits

## Inputs

1. `docs/adrs/021-surface-protocol.md` — handleSurfaceAction() pattern, block types
2. `docs/adrs/024-composable-workspace-architecture.md` — Canvas tier, block composition
3. `docs/insights/135-forms-and-conversation-interleave.md` — design principle
4. `src/engine/content-blocks.ts` — existing 21 block types
5. `src/engine/self-stream.ts` — toolResultToContentBlocks() for emission
6. `packages/web/app/api/chat/route.ts` — existing action handling
7. `docs/prototypes/30-json-render-composability.md` — block gallery reference

## Constraints

- MUST extend existing ContentBlock union type, not replace it
- MUST use handleSurfaceAction() routing, not new API endpoints
- MUST degrade gracefully on non-web surfaces (render as read-only with "edit in web" fallback)
- MUST NOT require LLM call for field edits (client-side state until submit)
- MUST preserve block immutability in engine — edits create new block instances on submit
- MUST validate submitted form data server-side before creating entities
- MUST NOT store credentials in block fields — ConnectionSetupBlock triggers OAuth, doesn't hold secrets
- All existing tests pass (453+ unit, 14 e2e)
- `pnpm run type-check` passes
- Design tokens from `.impeccable.md`

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Inline editing in blocks | Notion block editor | pattern | Proven UX for structured inline editing |
| Form + chat hybrid | Paperclip.ai process creation | pattern | Validates interleave model for AI workspace |
| Action callback protocol | ADR-021 `handleSurfaceAction()` | extend | Existing architecture, proven pattern |
| Block type union | `content-blocks.ts` | extend | Must be compatible with existing 21 types |
| OAuth integration flow | ADR-005 integration architecture | extend | Credential vault pattern already designed |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/content-blocks.ts` | Modify: add `InteractiveField` type, add `interactive` flag to ProcessProposalBlock, add `WorkItemFormBlock` and `ConnectionSetupBlock` types, add `FormSubmitAction` to action types |
| `src/engine/self-stream.ts` | Modify: update `toolResultToContentBlocks` — `generate_process` emits editable ProcessProposalBlock, `create_work_item` emits WorkItemFormBlock, `connect_service` emits ConnectionSetupBlock |
| `packages/web/components/blocks/process-proposal-block.tsx` | Create: editable renderer with local state, step list management, submit handler |
| `packages/web/components/blocks/work-item-form-block.tsx` | Create: editable form for work item creation (type, content, goal context) |
| `packages/web/components/blocks/connection-setup-block.tsx` | Create: OAuth flow initiation, status indicators, credential field inputs |
| `packages/web/app/api/chat/route.ts` | Modify: handle "form-submit" action type, route to engine handlers, return updated block |
| `src/engine/self-tools/generate-process.ts` | Modify: accept form submission data, create process from submitted fields |
| `src/engine/self-tools/create-work-item.ts` | Modify: accept form submission data, create work item from submitted fields |

## User Experience

- **Jobs affected:** Define, Capture, Delegate
- **Primitives involved:** Process Builder (as inline block), Quick Capture (as form block), Trust Control (connection setup)
- **Process-owner perspective:** Self proposes structured things (processes, work items, connections) as editable cards in conversation. You edit fields directly — change a name, adjust a trigger, add a step — then click Submit. For judgment calls ("what counts as a match?"), conversation continues naturally.
- **Interaction states:**
  - **Default:** Block renders with editable fields, visual affordance (edit icon, field borders on hover)
  - **Editing:** Field is focused, text input active, other fields remain visible
  - **Submitting:** Submit button shows spinner, fields become read-only
  - **Success:** Block transforms to read-only confirmation with "Created" status
  - **Error:** Error message below the field that failed validation, other fields preserved
  - **Degraded:** On non-web surfaces, renders as read-only text with "Edit in Ditto" prompt
- **Designer input:** Not invoked — lightweight UX section. Paperclip.ai form patterns as reference.

## Acceptance Criteria

1. [ ] `InteractiveField` type defined in content-blocks.ts with `text`, `select`, `number`, `toggle` variants
2. [ ] `ProcessProposalBlock` extended with `interactive: true` flag and `fields: InteractiveField[]` for name, trigger, description
3. [ ] `ProcessProposalBlock` includes `steps` array with add/remove capability in renderer
4. [ ] `WorkItemFormBlock` type added with interactive fields for type (select), content (text), goalContext (text)
5. [ ] `ConnectionSetupBlock` type added with service name, connection status, and auth trigger
6. [ ] `FormSubmitAction` type added to action types with `blockType` and `values` payload
7. [ ] Process proposal renderer allows inline field editing without server round-trip (local React state)
8. [ ] Process proposal "Create" button triggers `handleSurfaceAction("form-submit")` with edited values
9. [ ] Work item form renders type selector + content field + submit button, submits correctly
10. [ ] Connection setup block shows service status (connected/disconnected) and triggers OAuth flow
11. [ ] `handleSurfaceAction` routes "form-submit" to correct engine handler based on blockType
12. [ ] `generate_process` tool emits editable ProcessProposalBlock (not text description)
13. [ ] Non-interactive surfaces render all three block types as read-only (graceful degradation test)
14. [ ] Existing non-interactive ProcessProposalBlock emission (onboarding flow) continues to work unchanged — renderer handles both interactive and non-interactive modes
15. [ ] New block types added to `renderBlockToText()` exhaustive switch and block registry
16. [ ] All existing tests pass (453+ unit, 14 e2e), `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review checks: Does this extend ADR-021 correctly? Is the block action protocol consistent? Are form submissions validated server-side? Does graceful degradation work? Is credential handling secure (no secrets in blocks)?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the app
pnpm --filter web dev

# 2. In conversation, say: "Create a process for weekly account reconciliation"
# 3. Verify: Self responds with an editable ProcessProposalBlock (not text)
# 4. Edit the process name inline — verify no server call on keystroke
# 5. Click "Add step" — verify new step row appears
# 6. Click "Create" — verify process appears in DB
# 7. Verify conversation continues naturally after submission
# 8. Say: "I need to connect my Gmail" — verify ConnectionSetupBlock appears
```

## After Completion

1. Update `docs/state.md` — Interactive ContentBlocks complete
2. Update ADR-021 — add interactive block capability documentation
3. Unlocks Brief 073 (composition intents need editable blocks for create flows)
4. Pattern available for future interactive block types (SettingsBlock, ScheduleBlock, etc.)
