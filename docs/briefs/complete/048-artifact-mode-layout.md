# Brief: Artifact Mode Layout

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 047 (Composition Engine — composition intents, sidebar nav, workspace layout state)
**Unlocks:** Brief 049 (Live Preview Viewer), all six viewer implementations, artifact-mode context panel enrichments

## Goal

- **Roadmap phase:** Composable Workspace Architecture (ADR-024)
- **Capabilities:** Tier 1 Scaffold — Artifact Mode layout, the second of two workspace layout patterns

## Context

ADR-024 defines two scaffold layout patterns:

1. **Workspace mode** (shipped, Brief 047): Sidebar (240px) | Centre canvas (flex) | Right panel (320px)
2. **Artifact mode** (this brief): Conversation (300px) | Artifact (flex, min 480px) | Context panel (320px)

Artifact mode is the layout the user sees when reviewing, editing, or interacting with a process output — a document, spreadsheet, image, email, PDF, or live preview. The artifact is the centre of attention; conversation narrows to a left column for instructions and refinement; the context panel shows provenance, versions, and actions.

Currently, artifacts are shown in the right panel via `ArtifactViewerPanel` (Brief 046). This works for small previews but cannot serve as the primary artifact interaction surface — the right panel is 320px wide, far too narrow for document editing, spreadsheet manipulation, or live preview interaction.

P36 (Document Viewer v3) is the reference prototype. All six viewer prototypes (P36-P41) use the same layout shell.

## Objective

Deliver the artifact mode layout shell — the three-column scaffold that hosts any viewer in its centre column. The shell handles the layout transition, sidebar collapse, responsive breakpoints, and mobile behavior. Individual viewers are separate briefs; this brief delivers the container they render into.

## Non-Goals

- Individual viewer implementations (Document, Spreadsheet, Image, Live Preview, Email, PDF) — those are Brief 049+
- Artifact storage or persistence — engine already handles process outputs
- Version history UI — context panel enrichment, separate work
- Self-driven artifact composition — Phase 11+
- Diff highlighting within artifacts — viewer-specific, not layout

## Inputs

1. `docs/adrs/024-composable-workspace-architecture.md` — three-tier model, artifact mode defined as Tier 1 scaffold
2. `docs/adrs/023-artifact-interaction-model.md` — ArtifactBlock type, viewer taxonomy, artifact mode layout spec, security model
3. `.impeccable.md` — authoritative design spec, layout section, responsive breakpoints
4. `docs/prototypes/36-document-artifact.html` — reference prototype for artifact layout
5. `packages/web/components/layout/workspace.tsx` — current workspace layout with CenterView state machine
6. `packages/web/components/layout/right-panel.tsx` — current right panel (context panel in artifact mode)
7. `packages/web/lib/transition-map.ts` — tool-result → panel transition map (will extend for artifact mode)
8. `packages/web/components/layout/artifact-viewer-panel.tsx` — current right-panel artifact viewer (to be replaced by centre-column rendering)

## Constraints

- Conversation position must not change between modes — it's always below the composed content OR in the left column. The transition must feel spatial, not jarring (Insight feedback: layout violations — chat position and context panel).
- Context panel must never disappear on desktop — it stays visible in both modes (only collapses by user choice).
- The layout must support all six viewer types without viewer-specific layout code — the artifact host is a generic container.
- Sidebar collapse in artifact mode must be reversible — clicking a nav item exits artifact mode and restores the sidebar.
- Must not break existing workspace mode, process detail, or settings layouts.
- Must handle SSR (Next.js App Router) — no `window` access during server render.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Three-column artifact layout | P36 prototype, .impeccable.md | pattern | Our own design spec — the layout is fully defined |
| Layout state machine extension | Brief 047 CenterView type | pattern | Extending the existing workspace state model |
| Sidebar collapse pattern | P36 responsive CSS | pattern | Reference prototype proves the interaction |
| Artifact host container | Claude Artifacts (Anthropic) | pattern | Sandboxed content area pattern for arbitrary rendered output |
| Responsive breakpoints | .impeccable.md + P36 media queries | pattern | Design system defines the exact breakpoints |
| Swipe gesture (mobile) | `artifact-sheet.tsx` (Brief 046) | adopt | Existing touch handling code in the codebase |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/layout/workspace.tsx` | Modify: Add `artifact` variant to CenterView type. Conditionally render artifact mode layout when artifact is active. Sidebar hides/collapses in artifact mode. |
| `packages/web/components/layout/artifact-layout.tsx` | Create: Three-column artifact mode component — conversation column (300px), artifact host (flex, min 480px), context panel (320px). Responsive breakpoints. |
| `packages/web/components/layout/artifact-host.tsx` | Create: Generic container for viewer rendering. Receives artifact type + data, renders placeholder until viewers are implemented. Toolbar area (top) for viewer-specific controls. |
| `packages/web/lib/transition-map.ts` | Modify: Extend to produce artifact-mode transitions (CenterView change, not just panel override) for review actions on artifact-bearing outputs. |
| `packages/web/components/layout/right-panel.tsx` | Modify: Add `artifact-context` panel context type for artifact mode — shows provenance, version bar placeholder, and review actions. |
| `packages/web/components/layout/artifact-sheet.tsx` | Modify: Extend mobile bottom sheet to handle full artifact mode (not just right-panel preview). |

## User Experience

- **Jobs affected:** Review, Decide — artifact mode is where the user inspects, refines, and approves outputs
- **Primitives involved:** Artifact Viewer (Primitive 10), Review Interface (Primitive 3), Provenance Display (Primitive 8)
- **Process-owner perspective:** When Ditto produces a document, spreadsheet, or other artifact, the workspace transforms to put the artifact front and centre. The user sees their output large and clear, with conversation alongside for refinement ("make the contingency 10%") and context showing what Ditto based it on. Approving or navigating away returns to normal workspace.
- **Interaction states:**
  - **Entering artifact mode:** Smooth transition — sidebar slides out, conversation narrows, artifact appears centre. Triggered by: Self tool result (e.g., `generate_document`), feed review action, or direct link.
  - **Active artifact mode:** Three-column layout. Conversation scrollable. Artifact takes focus. Context panel shows provenance + actions.
  - **Exiting artifact mode:** Sidebar nav click, explicit "Back" action, or approving/rejecting the artifact. Restores previous workspace state.
  - **Loading:** Artifact host shows skeleton loader while viewer content loads.
  - **Empty/Error:** Artifact host shows "Could not load this output" with retry action.
  - **Mobile (<1024px):** Full-screen artifact. Swipe-left reveals conversation. Swipe-right reveals context. Bottom action bar for review.
- **Designer input:** Not invoked — layout spec is fully defined in .impeccable.md and P36 prototype. This is pure scaffold implementation.

## Acceptance Criteria

1. [ ] `CenterView` type in `workspace.tsx` includes an `artifact` variant with `artifactType` (matching ArtifactBlock field name from ADR-023 Section 1 — not `viewerType` from the engine Artifact interface), `artifactId`, `processId`, and optional `runId` fields.
2. [ ] When `CenterView` is `artifact`, the workspace renders the three-column artifact layout: conversation (300px fixed) | artifact host (flex, min-width 480px) | context panel (320px).
3. [ ] Sidebar collapse follows .impeccable.md artifact mode table: at ≥1440px, sidebar collapses to icon rail (56px); at 1280-1439px, sidebar hides completely. Sidebar nav click (from icon rail or hamburger) exits artifact mode and restores full sidebar.
4. [ ] Conversation column in artifact mode renders the same `messages` from `useChat`, scrollable, with the prompt input at the bottom of the conversation column (not the full-width bottom bar).
5. [ ] Artifact host renders a placeholder viewer container that accepts `artifactType` and displays a type-appropriate placeholder (e.g., "Document viewer — Brief 049" for `document` type).
6. [ ] Context panel in artifact mode shows: artifact title, lifecycle badge (reuse from `ArtifactViewerPanel`), review actions (Approve/Edit/Reject), and a "provenance placeholder" section.
7. [ ] Transition into artifact mode is triggered by extending `resolveTransition` — return type becomes a discriminated union (`{ target: "panel"; context: PanelContext } | { target: "center"; view: CenterView } | null`) so artifact tool results produce CenterView transitions, not panel overrides. Workspace.tsx handles both target types.
8. [ ] Transition out of artifact mode occurs on: sidebar nav click, explicit "Back to workspace" button in the artifact layout, or completing a review action (approve/reject).
9. [ ] Responsive breakpoints match .impeccable.md: at 1024-1279px, conversation narrows to 280px and context panel narrows to 280px. At <1024px, full-screen artifact with swipe gestures for conversation/context (extend existing `ArtifactSheet` pattern).
10. [ ] `pnpm run type-check` passes with 0 errors.
11. [ ] No regressions — existing workspace mode (canvas compositions, process detail, settings) renders identically when not in artifact mode.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Layout matches ADR-024 scaffold specification (three-column, exact widths)
   - Sidebar collapse/restore works correctly
   - Conversation position doesn't change modes (layout violation check)
   - Context panel never disappears on desktop
   - Responsive breakpoints match .impeccable.md
   - No type errors, no regressions to existing layout
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type-check
cd /Users/thg/conductor/workspaces/agent-os/pangyo && pnpm run type-check

# Visual verification (manual):
# 1. pnpm dev — open workspace in browser
# 2. Navigate to Today/Inbox/Work — normal workspace layout visible
# 3. Trigger artifact mode (via code or browser console: set CenterView to artifact)
# 4. Verify: sidebar hidden, three-column layout visible (conversation | artifact placeholder | context)
# 5. Click sidebar nav item — artifact mode exits, normal layout restores
# 6. Resize browser to <1024px — artifact goes full-screen
# 7. Existing workspace pages still render correctly
```

## After Completion

1. Update `docs/state.md` with artifact mode layout shipped
2. Update `docs/roadmap.md` — add artifact mode layout row to ADR-024 section
3. Phase retrospective: was the P36 prototype sufficient as spec? Any design gaps found?
4. Next brief: Brief 049 (Live Preview Viewer) — first viewer to implement in the artifact host
