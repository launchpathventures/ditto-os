# Brief: Phase 10g — Component Protocol

**Date:** 2026-03-25
**Status:** complete
**Depends on:** Brief 042 (Navigation & Detail), ADR-021 (Surface Protocol), ADR-009 (Process Output Architecture)
**Unlocks:** Brief 046 (Workspace Transitions), all future rich content rendering. (Briefs 043 and 044 were built in parallel during this phase.)

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard — The Living Workspace
- **Capabilities:** Surface protocol implementation (ADR-021), AI SDK v5 parts-based rendering, unified component registry, process output catalog→registry→renderer (ADR-009), action callback infrastructure

## Context

Briefs 039-042 shipped the web app with pragmatic implementations: hand-rolled AI SDK data stream protocol, flat `message.content` string rendering, ad-hoc `useChat.data` parsing, shape-detection structured data, and raw JSON for process outputs. This was correct for MVP velocity — but it produced **three disconnected rendering systems** that will compound as we add features:

1. **Conversation:** `SelfStreamEvent` → ad-hoc `2:` data frames → `useChat.data` → shape detection in `StructuredData`
2. **Feed:** `FeedItem` discriminated union → `item-registry.tsx` switch → 6 card components
3. **Process output:** raw JSON string → `JSON.stringify` monospace dump

ADR-021 designed a unified surface protocol (13 typed `ContentBlock` types). ADR-009 designed catalog→registry→renderer for process outputs. Neither is implemented in code.

Meanwhile, AI SDK has evolved to v5 with a **parts-based message system** that is essentially our ContentBlock protocol with SDK support: typed tool results as React components, 4-state tool lifecycle, human-in-the-loop approval, custom data parts, and step boundary markers. We are on v4.3 using only `useChat`, the `Message` type, and manual stream encoding.

### The audit finding

Every future brief (043: proactive briefings, 044: onboarding cards, and everything in Phase 11+) needs to render rich content in conversation. Without this protocol layer, each brief will invent its own rendering pattern, deepening the divergence. Building the protocol once means all subsequent briefs compose on it for free.

### Why this is also cleanup

This brief doesn't just add infrastructure — it migrates every existing component to the new system. The 6 feed card components become registry entries. The inline data components become content block renderers. The conversation message component switches from flat content to parts-based rendering. Nothing is thrown away; everything is unified.

## Objective

A single component protocol where: (1) the Self emits typed content blocks, (2) AI SDK v5 streams them as message parts, (3) one component registry renders them in both conversation and feed contexts, and (4) process outputs render through a catalog-constrained pipeline instead of raw JSON.

## Non-Goals

- Full ADR-021 `handleSurfaceAction()` router — this brief implements `handleSurfaceAction()` for the web surface with session-scoped action validation (emitted action IDs tracked per session, rejected if not in registry). The cross-surface generalisation (Telegram/CLI renderers + surface dispatch) is deferred to the brief that adds the second surface.
- Telegram or CLI renderer updates — web only in this brief
- Process output Zod catalog authoring per process — this brief implements the rendering infrastructure; process-specific catalogs are defined when process templates declare output schemas
- Full composable UI where Self dynamically composes layouts (Insight-086, Phase 11+)
- `useObject` for streaming structured objects — deferred to Brief 043 which has the first use case (briefing assembly)
- AI SDK v5 `@ai-sdk/anthropic` and `@ai-sdk/openai` provider upgrades — only the `ai` core package upgrades; provider SDKs remain on current versions. **Pre-build verification required:** confirm current provider SDK versions work with `ai@5.x` before starting. If provider SDKs require upgrade, scope expands — escalate to PM.

## Inputs

1. `docs/adrs/021-surface-protocol.md` — the 13 content block types, action callback model, security constraints. This is the type contract.
2. `docs/adrs/009-runtime-composable-ui.md` — catalog→registry→renderer pattern, trust-governed richness, process output types
3. `docs/research/rendered-output-architectures.md` — json-render extraction, Zod as triple-duty contract
4. `packages/web/package.json` — current deps: `ai: ^4.3.0`
5. `packages/web/components/self/conversation.tsx` — current conversation implementation (will migrate)
6. `packages/web/components/self/message.tsx` — current message rendering (will migrate)
7. `packages/web/components/self/inline-data.tsx` — current structured data rendering (will migrate)
8. `packages/web/components/feed/item-registry.tsx` — current feed registry (will absorb into unified registry)
9. `packages/web/components/feed/*.tsx` — 6 existing feed card components (will become registry entries)
10. `packages/web/app/api/chat/route.ts` — current hand-rolled stream protocol (will replace)
11. `src/engine/self-stream.ts` — current `SelfStreamEvent` types (will extend with content blocks)

## Constraints

- MUST upgrade `ai` package from v4.3 to v5. The `Message` → `UIMessage` type migration is a breaking change — all `useChat` consumers must update.
- MUST implement content block types from ADR-021 as TypeScript types in a shared location importable by both engine and web
- MUST NOT break existing feed card rendering — feed items continue to work but are now backed by content blocks
- MUST map each ADR-021 block type to an AI SDK v5 rendering strategy (tool part, custom data part, or native part)
- MUST replace hand-rolled `0:/2:/d:` stream encoding with AI SDK v5's native streaming (`streamText` or `createDataStreamResponse`)
- MUST replace shape-detection in `StructuredData` with schema-driven rendering — each tool declares its output type, the registry maps type → component
- MUST preserve all existing visual design (design tokens, spacing, typography) — this is a protocol change, not a visual redesign
- MUST maintain 0 new type errors (run `pnpm run type-check` in packages/web)
- MUST NOT introduce any new npm dependencies beyond the AI SDK v5 upgrade — the component registry is standard React
- Security: action callbacks from content blocks MUST implement session-scoped action validation per ADR-021 Section 8: emitted action IDs are tracked per session (in-memory Map, TTL = session duration), rejected if not in the registry. This prevents replay attacks even on a single surface. Entity existence is also validated (processRunId/stepRunId checked against DB).
- **Phasing:** The AI SDK v5 migration should complete and type-check before component registry work begins. If the SDK upgrade hits unexpected issues, the registry work is blocked. Builder should treat this as two sequential phases within one brief: (1) SDK migration + stream protocol, (2) component registry + feed migration.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| AI SDK v5 parts-based messages | Vercel AI SDK v5 `UIMessage.parts` | depend | Mature SDK (v5), active maintenance, streaming-first, typed tool rendering. Eliminates our hand-rolled protocol. |
| Content block type system | ADR-021 (Ditto original) | — | Our architecture spec. 13 purpose-built block types for an AI agent that converses, delegates, reviews, teaches. |
| Catalog → registry → renderer | json-render (Vercel Labs) `packages/core/src/schema.ts` | pattern | The triple-duty contract concept (Zod validates, generates prompts, produces JSON Schema). We implement our own; json-render is too immature to depend on (v0.x, Insight-068). |
| Discriminated union component registry | Existing `item-registry.tsx` | extend | Already in our codebase. Proven pattern. Extended to handle content blocks + feed items. |
| Tool-to-component mapping | Vercel AI SDK v5 `tool-{toolName}` parts | depend | Native SDK pattern. Tool results render as typed React components. |
| Action callback model | Slack `action_id` + Telegram `callback_data` | pattern | Namespaced IDs with payload round-trip. ADR-021 specifies this. |
| Adaptive Cards fallback | Microsoft Adaptive Cards `fallbackText` | pattern | Every block has a text serialization. Unknown blocks degrade gracefully. |

## What Changes (Work Products)

### Shared Types (new)

| File | Action |
|------|--------|
| `src/engine/content-blocks.ts` | Create: TypeScript types for all 13 ADR-021 ContentBlock types + `ActionDef` + `InputFieldDef`. Discriminated union on `type` field. `renderBlockToText()` fallback function. This is the single source of truth for the block vocabulary. Lives in the engine so the web package imports from engine (one-way dependency per ADR-021 Section 5). |

### AI SDK v5 Migration

| File | Action |
|------|--------|
| `packages/web/package.json` | Modify: upgrade `ai` from `^4.3.0` to `^5.x`. No other dep changes. |
| `packages/web/app/api/chat/route.ts` | Rewrite: Replace hand-rolled `ReadableStream` + `0:/2:/d:` encoding with AI SDK v5 native streaming. Self tool results emit as typed tool parts. Custom data events (`structured-data`, `credential-request`, `status`) emit as `data-*` custom parts. Content blocks flow through natively. |
| `packages/web/components/self/conversation.tsx` | Rewrite: Replace `useChat.data` parsing (the `useEffect` that checks `lastData.type`) with AI SDK v5 `message.parts` iteration. Structured data, credential requests, and status messages become parts in the message — not separate `useState` arrays. |
| `packages/web/components/self/message.tsx` | Rewrite: Replace flat `message.content` + `toolInvocations` rendering with parts-based rendering. Each `message.parts` entry renders via the component registry. Tool parts show 4-state lifecycle (streaming → ready → complete → error), not binary working/result. |

### Unified Component Registry

| File | Action |
|------|--------|
| `packages/web/components/blocks/block-registry.tsx` | Create: Unified component registry. Maps `ContentBlock.type` → React component via switch. Handles all 13 block types. Unknown types render via `renderBlockToText()` fallback. Each block component is a separate file in this directory. |
| `packages/web/components/blocks/text-block.tsx` | Create: Renders markdown text. Extracted from current `message.tsx` content rendering. |
| `packages/web/components/blocks/review-card-block.tsx` | Create: Review card with output text, confidence badge, approve/edit/reject actions, provenance strip. Absorbs logic from `feed/review-item.tsx` — same visual, backed by `ReviewCardBlock` type instead of `ReviewItem`. |
| `packages/web/components/blocks/status-card-block.tsx` | Create: Process/work item status card. Key-value details, status indicator. |
| `packages/web/components/blocks/action-block.tsx` | Create: Button group from `ActionDef[]`. Calls back via action handler. |
| `packages/web/components/blocks/input-request-block.tsx` | Create: Form from `InputFieldDef[]`. Text, textarea, select, confirm fields. Replaces ad-hoc masked credential input pattern for general structured input. |
| `packages/web/components/blocks/knowledge-citation-block.tsx` | Create: Collapsible "Based on" provenance strip (Insight-083). Source names, types, optional excerpts. |
| `packages/web/components/blocks/progress-block.tsx` | Create: Step progress indicator. Current step, total, completed count, status. |
| `packages/web/components/blocks/data-block.tsx` | Create: Renders key-value, table, or list format. Absorbs and replaces `inline-data.tsx`'s `InlineTable` and `StructuredData` components — same visuals, schema-driven instead of shape-detected. |
| `packages/web/components/blocks/image-block.tsx` | Create: Image with alt text, caption, click-to-expand. |
| `packages/web/components/blocks/code-block.tsx` | Create: Syntax-highlighted code block with copy button. Diff mode when `diff: true`. |
| `packages/web/components/blocks/reasoning-trace-block.tsx` | Create: Expandable reasoning chain. Steps with labels + details, conclusion, confidence badge. |
| `packages/web/components/blocks/suggestion-block.tsx` | Create: Suggestion card with content, optional reasoning, accept/dismiss actions. |
| `packages/web/components/blocks/alert-block.tsx` | Create: Severity-colored alert (info/warning/error) with title, content, optional actions. |

### Feed Migration

| File | Action |
|------|--------|
| `packages/web/lib/feed-types.ts` | Modify: Each `FeedItem` data payload gains an optional `blocks: ContentBlock[]` field. Feed assembler can provide pre-rendered block sequences. Existing typed fields remain for backward compatibility during migration. |
| `packages/web/components/feed/item-registry.tsx` | Modify: When `item.data.blocks` is present, render via `BlockRegistry` instead of type-specific card. Existing card components remain as fallbacks for items without blocks. |
| `packages/web/components/feed/process-output.tsx` | Rewrite: Replace `JSON.stringify` dump with `BlockRegistry` rendering. Process outputs render their `blocks` through the unified registry. This is the first place where ADR-009's catalog→registry→renderer is visible. |
| `src/engine/feed-assembler.ts` | Modify: Enrich feed items with content blocks where applicable. ReviewItem produces `ReviewCardBlock`. ExceptionItem produces `AlertBlock`. ProcessOutputItem produces `DataBlock` (or richer blocks when process catalogs are defined). |

### Engine Streaming

| File | Action |
|------|--------|
| `src/engine/self-stream.ts` | Modify: Add `ContentBlock` to `SelfStreamEvent` — new event type `{ type: "content-block"; block: ContentBlock }`. Tool execution results emit typed content blocks (e.g., `get_process_detail` → `StatusCardBlock`, `approve_review` → `ReviewCardBlock`). Text deltas unchanged. |
| `src/engine/self-delegation.ts` | Modify: Each Self tool declares its output block type. `executeDelegation()` returns `ContentBlock[]` alongside the existing string result. This is how tool results become typed components. |
| `src/engine/self.ts` | Modify: `selfConverse()` return type is NOT changed in this brief — it remains `{ response: string; ... }`. The streaming path (`selfConverseStream`) emits content blocks; the non-streaming path continues to work for Telegram bot. Full `selfConverse()` → `ContentBlock[]` migration happens when Telegram adopts surface renderers. |

### Cleanup (absorbed into migration)

| File | Action |
|------|--------|
| `packages/web/components/self/inline-data.tsx` | Delete: `InlineTable`, `ProgressIndicator`, `TrendArrow`, `StructuredData` absorbed into `data-block.tsx` and `progress-block.tsx` in the blocks directory. Same visual output, schema-driven. |
| `packages/web/components/self/masked-input.tsx` | Modify: Becomes the renderer for `InputRequestBlock` with `type: "credential"` field type, rather than a standalone component driven by ad-hoc data events. |

## User Experience

- **Jobs affected:** All six — the rendering layer touches every surface interaction
- **Primitives involved:** All primitives that render in conversation or feed — Review Queue, Activity Feed, Output Viewer, Feedback Widget, Trust Control, Quick Capture
- **Process-owner perspective:** Invisible to the user. Same visuals, same interactions. The change is structural — what was ad-hoc becomes composable. The user notices when future features (briefings, onboarding cards, process proposals) render as rich inline components rather than text dumps.
- **Interaction states:**
  - *Tool executing:* 4-state lifecycle visible (streaming args → ready → result component → or error). Currently binary.
  - *Review in conversation:* ReviewCardBlock renders inline with approve/edit/reject. Currently only in feed.
  - *Process output:* Renders as typed component (table, status card, etc.) instead of JSON dump.
  - *Unknown block type:* Graceful fallback to text rendering — never crashes.
- **Designer input:** Not invoked — this is a protocol/infrastructure change. Visual output unchanged. The workspace layout redesign (`docs/research/workspace-layout-redesign-ux.md`) is a separate concern that benefits from this protocol layer.

## Acceptance Criteria

1. [ ] `ai` package upgraded to v5. `UIMessage` type used everywhere (replaces `Message`). `useChat` works with v5 protocol. Zero type errors.
2. [ ] `src/engine/content-blocks.ts` exports all 13 ADR-021 `ContentBlock` types as a discriminated union + `ActionDef` + `InputFieldDef` + `renderBlockToText()`.
3. [ ] `/api/chat/route.ts` uses AI SDK v5 native streaming — no hand-rolled `0:/2:/d:` encoding. Self tool results stream as typed tool parts. Custom data (status, credentials) streams as `data-*` parts.
4. [ ] `message.tsx` renders via `message.parts` iteration — each part dispatches to the block registry or native rendering (text, tool, reasoning). No flat `message.content` rendering for assistant messages.
5. [ ] Tool parts show 4-state lifecycle: input-streaming (optional), input-available ("Working: {name}"), output-available (rendered component), output-error (error display). Not binary.
6. [ ] Block registry (`block-registry.tsx`) renders all 13 block types via discriminated union switch. Unknown types fall back to `renderBlockToText()` — verified: adding a fake block type renders text, does not crash.
7. [ ] `review-card-block.tsx` renders ReviewCardBlock with approve/edit/reject actions inline. Actions call back to existing `/api/feed` POST endpoint (or new action endpoint). Same visual as current `review-item.tsx`.
8. [ ] `data-block.tsx` renders DataBlock in key-value, table, and list formats. Same visual quality as current `InlineTable`. No shape detection — format is declared on the block.
9. [ ] `process-output.tsx` renders process outputs via block registry instead of `JSON.stringify`. Verified: a process output with structured data renders as a typed component.
10. [ ] Feed assembler produces `ContentBlock[]` on feed items. ReviewItem includes `ReviewCardBlock`. ExceptionItem includes `AlertBlock`. Feed registry renders blocks when present, falls back to existing card components when not.
11. [ ] `inline-data.tsx` deleted. All visual elements (tables, progress bars, trend arrows) re-implemented in block components with identical styling.
12. [ ] Self tool results in `self-delegation.ts` produce typed `ContentBlock[]` — `get_process_detail` → `StatusCardBlock`, approve/edit/reject → `ReviewCardBlock` update, `create_work_item` → `StatusCardBlock`.
13. [ ] `self-stream.ts` emits `content-block` events. Route handler maps them to AI SDK v5 tool result parts or custom data parts.
14. [ ] Action callbacks implement session-scoped validation: emitted action IDs tracked in-memory per session, `handleSurfaceAction()` rejects action IDs not in the registry. Entity existence also validated (processRunId/stepRunId checked against DB).
15. [ ] Block registry switch is exhaustive — TypeScript `never` check ensures new block types cause compile errors if unhandled (same pattern as existing `item-registry.tsx`).
16. [ ] 0 new type errors (`pnpm run type-check` in packages/web). 0 new test failures (`pnpm test`).
17. [ ] Existing conversation visuals preserved: Self indicator dot, user message styling, typing indicator, auto-scroll, error states — all unchanged.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + ADR-021 + ADR-009
2. Review checks: all 13 block types implemented, AI SDK v5 migration complete (no v4 imports remaining), feed items can render via blocks, process outputs no longer JSON.stringify, action callbacks validate entity existence, no visual regressions, type safety throughout
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the app
pnpm dev

# 2. Open conversation, send "what's happening with my work?"
# Expected: Self responds with text + tool execution visible as 4-state lifecycle
#   (not "Working: get_process_detail... Completed: get_process_detail")
# Expected: Process detail renders as StatusCardBlock component (not text)

# 3. If there are review items, send "show me what needs review"
# Expected: ReviewCardBlock renders inline in conversation with approve/edit/reject
# Expected: Clicking approve calls the action endpoint successfully

# 4. Check feed view
# Expected: Feed cards render identically to before
# Expected: Process output cards render structured content (not JSON dump)

# 5. Check type safety
cd packages/web && pnpm run type-check
# Expected: 0 errors

# 6. Check engine tests
pnpm test
# Expected: 330+ tests pass, 0 failures

# 7. Verify graceful degradation
# In block-registry.tsx, temporarily add a block with unknown type to a message
# Expected: Renders as text fallback, no crash

# 8. Verify no v4 imports remain
grep -r "from 'ai'" packages/web/  # Should show v5 imports only
grep -r '"Message"' packages/web/  # Should find UIMessage, not Message
```

## After Completion

1. Update `docs/state.md` — component protocol shipped, AI SDK v5, unified block registry, feed items backed by content blocks
2. Update `docs/roadmap.md` — mark Surface Protocol (ADR-021) implementation items as done for web surface
3. Update ADR-021 — note that follow-up item "Implementation brief" is complete; web renderer implemented. Note that `selfConverse()` return type change is deferred to the brief that adds Telegram surface renderers.
4. Update ADR-009 — note that renderer infrastructure is in place (block registry renders typed components); catalog and Zod schema constraint layers are the next step (landed when process templates declare output schemas)
5. Update ADR-016 — Self tools now produce `ContentBlock[]`, not strings
6. Brief 046 (Workspace Transitions) is now unblocked — depends on AI SDK v5 `UIMessage.parts` for tool result detection, block registry for artifact rendering, and parts-based message component for workspace message rendering
7. Brief 043 (Proactive Engine) and 044 (Onboarding) are now unblocked to build on this foundation — verify their briefs reference the block types they'll use
