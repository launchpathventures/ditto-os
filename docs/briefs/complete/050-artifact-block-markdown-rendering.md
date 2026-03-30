# Brief 050: ArtifactBlock + Markdown Rendering + Engine-Connected Artifact Mode

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 048 (Artifact Mode Layout — layout shell, artifact host, artifact-layout.tsx, artifact-context-panel.tsx)
**Unlocks:** Dev pipeline visible through web UI, all future artifact types rendered through BlockList, Brief 051+ (shell execution, pipeline bridge)

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (Composable Workspace Architecture, ADR-024)
- **Capabilities:** ArtifactBlock in engine type system, markdown rendering in TextBlock, engine-connected artifact mode (content fetched from API, rendered through BlockList)

## Context

Brief 048 shipped the artifact mode layout shell — three-column scaffold with conversation (300px) | artifact host (flex) | context panel (320px). The artifact host currently shows a placeholder per viewer type.

The user's immediate goal: drive the dev pipeline from the web UI. Set a goal/task, let Ditto orchestrate through PM → Researcher → Designer → Architect → Builder → Reviewer → Documenter, reviewing each step's output along the way.

The Self already has `start_dev_role` which runs a standalone role process through the engine and returns text output. What's missing:

1. **No ArtifactBlock type** — ADR-023 defined it, but it's not in `content-blocks.ts`
2. **TextBlock doesn't render markdown** — JSDoc says "Markdown text content" but the renderer uses `whitespace-pre-wrap`. No headings, no code highlighting, no tables.
3. **`start_dev_role` produces no blocks** — `toolResultToContentBlocks()` returns `[]` for this tool. Role outputs are invisible to the block system.
4. **Artifact host is a placeholder** — doesn't render anything. Should render `BlockList` from content fetched via API.
5. **Content not engine-connected** — no API route to fetch process output content as `ContentBlock[]`.

The dev pipeline produces: recommendations (text), research reports (markdown), interaction specs (markdown), briefs (markdown), code changes (text/code), review verdicts (text), state updates (text). ~5 of 7 step types produce substantial markdown documents.

### Architectural Principle

**All rendering flows through the ContentBlock system (ADR-021).** No bespoke viewer components. The block registry IS the viewer. Artifact mode's centre column renders `BlockList` — the same component used in canvas, conversation, and feed. This ensures universal composability: any surface that renders blocks gets every capability for free.

## Objective

Make dev pipeline outputs visible and reviewable through the web UI by: (1) adding ArtifactBlock to the engine type system, (2) making TextBlock actually render markdown, (3) wiring artifact mode to fetch content from the engine and render through BlockList, (4) making `start_dev_role` outputs flow through the block system.

## Non-Goals

- Bespoke viewer components (DocumentViewer, SpreadsheetViewer, etc.) — the block registry handles all rendering
- Artifact persistence/storage layer — step run outputs are the content (already in DB)
- Version history UI — context panel placeholder is sufficient for now
- Conversational refinement protocol (ADR-023 Section 5) — future brief
- Full autonomous pipeline orchestration — current Self-driven chaining is sufficient for dogfooding
- Code syntax highlighting within markdown code blocks — enhancement, not MVP (plain `<pre>` is acceptable)
- `cli-agent` executor on web — standalone role processes use `ai-agent` which works via API

## Inputs

1. `docs/adrs/023-artifact-interaction-model.md` — ArtifactBlock spec, viewer taxonomy, artifact lifecycle
2. `docs/adrs/021-surface-protocol.md` — ContentBlock vocabulary, surface rendering contract
3. `docs/adrs/024-composable-workspace-architecture.md` — three-tier model, scaffold layer
4. `packages/web/components/layout/artifact-host.tsx` — placeholder viewer container (to replace with BlockList)
5. `packages/web/components/layout/artifact-layout.tsx` — artifact mode layout (Brief 048)
6. `packages/web/lib/transition-map.ts` — tool-result → transition resolver (to extend)
7. `src/engine/content-blocks.ts` — ContentBlock union type (to extend with ArtifactBlock)
8. `src/engine/self-stream.ts` — streaming adapter, `toolResultToContentBlocks()` (to extend)
9. `packages/web/components/blocks/block-registry.tsx` — block renderer (to extend with artifact case)
10. `packages/web/components/blocks/text-block.tsx` — TextBlock renderer (to upgrade to markdown)
11. `.impeccable.md` — design spec (typography, colours, max-width)

## Constraints

- Must not break existing workspace mode, feed, or conversation
- ArtifactBlock must follow ADR-023 Section 1 interface (simplified for MVP)
- **No bespoke viewer components** — artifact host renders BlockList, same as every other surface
- Content fetched from engine API, not passed through React state — artifact views are engine-connected
- TextBlock markdown rendering must be SSR-safe (`react-markdown` is SSR-compatible)
- Must preserve existing feed review cards for short outputs — only substantial outputs (>500 chars) promote to artifacts
- Markdown rendering in TextBlock applies universally (canvas, conversation, feed, artifact mode) — test for regressions in existing block usage. Existing compositions already use intentional markdown (`**bold**`), so upgrade is a net improvement. Builder must specifically test shift report content and any echoed tool output for accidental markdown characters.
- Max-width 720px for TextBlock content in artifact mode centre column (via artifact host container styling, not the block itself)
- Do NOT add `rehype-raw` or `rehype-sanitize` plugins to react-markdown. Default sanitization is sufficient — raw HTML in markdown must be escaped, not rendered.
- API handler for run output must construct ContentBlock[] from raw output text — do not pass raw JSON or unstructured agent output directly as block content.
- Streaming markdown: during text streaming, partial markdown may cause minor render flicker (e.g., `**bol` before `d**` completes). This is acceptable for MVP — final render is correct once streaming completes.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| ArtifactBlock interface | ADR-023 Section 1 | pattern | Our own spec — using the defined interface shape |
| Markdown rendering | `react-markdown` + `remark-gfm` | depend | Mature (v9+, MIT, widely used), SSR-compatible, GFM tables/strikethrough |
| Block-based artifact rendering | ADR-021 Surface Protocol | pattern | Our own spec — BlockList is the universal rendering primitive |
| Transition map extension | Brief 046/048 (transition-map.ts) | pattern | Extending our existing tool→transition pattern |
| Content-from-API pattern | Existing `/api/processes` route | pattern | Extending our existing API pattern for engine data access |
| Implementing ArtifactBlock = ADR-023 acceptance | Original | — | De facto acceptance — update ADR status |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/content-blocks.ts` | Modify: Add ArtifactBlock interface + add to ContentBlock union (22 types). Update file header comment (21 → 22). Implementing ArtifactBlock constitutes de facto acceptance of ADR-023 — update ADR status to "accepted". |
| `packages/web/components/blocks/artifact-block.tsx` | Create: Compact ArtifactBlock renderer — title, status badge (variant-coloured), summary text, "Open" action button. Clicking "Open" dispatches action `open-artifact-{artifactId}`. |
| `packages/web/components/blocks/text-block.tsx` | Modify: Replace `whitespace-pre-wrap` with `react-markdown` + `remark-gfm` rendering. Style with design system typography tokens. Markdown elements: headings, paragraphs, lists, code blocks (monospace pre), tables, bold/italic, links, blockquotes. |
| `packages/web/components/blocks/block-registry.tsx` | Modify: Add `artifact` case to BlockRenderer switch (22 cases). |
| `packages/web/components/layout/artifact-host.tsx` | Modify: Replace placeholder with engine-connected BlockList rendering. Fetch content via `useProcessRunOutput(runId)` hook → render `BlockList`. Loading skeleton while fetching. Error state with "Back to workspace" action. Max-width 720px container for the block content. |
| `packages/web/app/api/processes/route.ts` | Modify: Add `action=getRunOutput` handler that returns process run step output as `ContentBlock[]` (TextBlock wrapping the markdown content, plus any CodeBlocks for code outputs). |
| `packages/web/lib/process-query.ts` | Modify: Add `useProcessRunOutput(runId)` React Query hook that fetches step output content as `ContentBlock[]`. |
| `packages/web/lib/transition-map.ts` | Modify: Add `start_dev_role` entry — outputs >500 chars produce artifact mode center transition with `runId` for API fetch. Short outputs → null (stay in conversation). |
| `src/engine/self-stream.ts` | Modify: Add `start_dev_role` case to `toolResultToContentBlocks()`. Outputs >500 chars → ArtifactBlock (artifactId from runId, title from role name, summary first 200 chars). Outputs ≤500 chars → TextBlock (rendered inline in conversation). |
| `packages/web/package.json` | Modify: Add `react-markdown`, `remark-gfm` dependencies. |
| `docs/adrs/023-artifact-interaction-model.md` | Modify: Update status from "proposed" to "accepted" in header. |

## User Experience

- **Jobs affected:** Review (primary — reading and approving dev pipeline outputs), Orient (seeing what Ditto produced)
- **Primitives involved:** Output Viewer (first real implementation via BlockList), Conversation Thread (artifact reference cards), Review Queue (artifact-backed review)
- **Process-owner perspective:** The user tells Ditto "implement feature X". The Self runs PM triage, shows the recommendation. If it's a quick answer, it renders as markdown inline (TextBlock now renders headings, lists, etc.). If it's a substantial document (brief, research report), a compact ArtifactBlock reference card appears in conversation with "Open" button. Clicking "Open" transitions to artifact mode — the content is fetched from the engine API and rendered as a BlockList in the centre column (same blocks, bigger canvas). Conversation narrows to the left for follow-up. Context panel shows process info and review actions. The user reads, approves, and the Self continues to the next role.
- **Interaction states:**
  - **Loading:** Artifact host shows skeleton (pulse animation on text line placeholders) while fetching from API
  - **Empty:** Should not occur (artifact mode only activates when content exists)
  - **Error:** Artifact host shows AlertBlock with error message + "Back to workspace" action
  - **Success:** BlockList renders content blocks (TextBlock with markdown, CodeBlock for code) with approve/edit/reject in context panel
  - **Partial:** N/A (full content fetched in one request)
- **Designer input:** Not invoked — P36 prototype is the reference. Lightweight UX section only.

## Acceptance Criteria

1. [ ] `ArtifactBlock` interface added to `content-blocks.ts` matching ADR-023 Section 1 (simplified for MVP: `type`, `artifactId`, `title`, `artifactType`, `status: { label, variant }`, `summary`, `changed`, `version`, `actions`). Optional fields deferred: `subtitle`, `confidence`, `destination`.
2. [ ] `ArtifactBlock` included in `ContentBlock` union (22 types total). `renderBlockToText` case added (serialise as: `"[{artifactType}] {title} — {status.label}\n{summary}"`). `BlockRenderer` exhaustiveness check passes.
3. [ ] `ArtifactBlockComponent` in block registry renders compact reference card: title, status badge (variant-coloured), summary text, "Open" action button that dispatches `open-artifact-{artifactId}`.
4. [ ] `TextBlockComponent` renders markdown via `react-markdown` + `remark-gfm`: headings (h1-h6), paragraphs, ordered/unordered lists, fenced code blocks (monospace `<pre>`), tables, bold/italic/strikethrough, links (open in new tab), blockquotes. Styled with design system typography tokens.
5. [ ] TextBlock markdown rendering works in all surfaces: canvas compositions, conversation messages, feed blocks, artifact mode — no regressions in existing TextBlock usage.
6. [ ] `artifact-host.tsx` fetches content via `useProcessRunOutput(runId)` and renders through `BlockList`. No bespoke viewer components. Max-width 720px container.
7. [ ] API route handles `action=getRunOutput&runId={id}` — returns step output content as `ContentBlock[]` (TextBlock wrapping markdown, CodeBlock for code file outputs).
8. [ ] `ArtifactCenterView` uses `runId` for API fetch (not `content?: string`). Content is engine-connected, survives page refresh if runId is in URL state.
9. [ ] `transition-map.ts` handles `start_dev_role` results: outputs >500 chars → artifact mode center transition with runId; outputs ≤500 chars → null (stay in conversation).
10. [ ] `toolResultToContentBlocks` in `self-stream.ts` produces ArtifactBlock for `start_dev_role` outputs >500 chars (artifactId from runId, title from role name, summary first 200 chars). Produces TextBlock for outputs ≤500 chars.
11. [ ] Short `start_dev_role` outputs (≤500 chars) render as inline markdown in conversation (via TextBlock).
12. [ ] Approve/Edit/Reject actions in artifact context panel work (connected to existing review-actions). Actions persist as feedback events through existing pipeline.
13. [ ] `pnpm run type-check` passes with 0 errors.
14. [ ] Existing workspace mode, feed, and conversation unaffected (no regression).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - **Composability**: No bespoke viewer components. Artifact host renders BlockList. TextBlock renders markdown. All content flows through the block system.
   - **Engine-connected**: Content fetched from API, not passed through React state. Verify with: refresh page in artifact mode → content reloads.
   - ArtifactBlock type matches ADR-023 spec
   - TextBlock markdown rendering works across all surfaces (check canvas, conversation, feed)
   - Transition from conversation → artifact mode → back works without losing conversation state
   - Content flow: Self tool result → ArtifactBlock in conversation → "Open" → artifact mode → API fetch → BlockList renders
   - No security issues (react-markdown sanitises by default)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the web app
cd /Users/thg/conductor/workspaces/agent-os/paris
pnpm dev

# 2. Open http://localhost:3000
# 3. In the conversation, type: "Run the PM to triage what we should work on next"
# 4. Self invokes start_dev_role("pm", ...)
# 5. If output is substantial (>500 chars):
#    - A compact ArtifactBlock card appears in conversation with "Open" button
#    - Click "Open" → artifact mode activates
#    - Centre column fetches content from API → renders as BlockList
#    - TextBlock content shows with markdown formatting (headings, lists, etc.)
#    - Context panel shows process info + approve/reject buttons
#    - Click "Back to workspace" → returns to conversation
# 6. If output is short (≤500 chars):
#    - TextBlock renders inline with markdown formatting (headings, bold, etc.)
# 7. Navigate to Today canvas → verify TextBlocks in compositions render markdown correctly
# 8. Check feed → verify TextBlocks in feed items render markdown correctly
# 9. Verify: pnpm run type-check passes
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark "ArtifactBlock + Markdown Rendering" as done in Phase 10
3. Phase retrospective: Does BlockList-based artifact rendering feel right? Any cases where a bespoke viewer would genuinely be needed (spreadsheet, PDF)?
4. Next: Brief 051 (Shell Execution) or Brief 052 (Pipeline Bridge) — depends on which gap is most painful during dogfooding.
