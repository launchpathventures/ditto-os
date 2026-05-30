# Brief 281: Workspace Artifact Recall and Archive

**Date:** 2026-05-16
**Status:** draft
**Depends on:** Brief 280 (Workspace Conversational Front Door), ADR-016, ADR-021, ADR-024, Insight-180, Insight-183, Insight-211, Insight-232
**Unlocks:** later integration-action briefs, richer workspace proactivity, workspace memory curation polish

## Goal

- **Roadmap phase:** Workspace UX
- **Capability:** Once `/chat` is the authenticated workspace home, make existing workspace artifacts easy to recall, browse, filter, and reopen from the conversation. Projects, processes, memories, work items, reviews, and recent activity remain durable engine records, but the user asks Mira or opens a lightweight archive drawer instead of navigating primitive-first tabs.

## Context

Brief 280 fixes the foundation: `/chat` becomes workspace Self, existing `ContentBlock` types render inline process/work/briefing artifacts, and legacy pages become drill-downs.

That still leaves a second user pain: "Where did that thing go?" If the filing cabinet stops being the home screen, users still need a strong recall layer. The existing app already has much of the substrate:

- `/projects` and `/projects/[slug]` list and show projects.
- `/process/[id]` shows process detail.
- `/memories/[id]` shows memory detail, scope, reinforcement, promote/demote affordances.
- `/api/v1/projects` and `/api/v1/projects/[id]` already support authenticated project listing/detail.
- `/api/v1/memories/[id]` already supports authenticated memory detail.
- `search_knowledge` already returns knowledge citation blocks with document/memory provenance.
- `InteractiveTableBlock`, `RecordBlock`, `KnowledgeCitationBlock`, `MetricBlock`, and `StatusCardBlock` already cover the rendering shapes needed for archive/retrieval lists.

The missing layer is not another page. It is a shared recall primitive that both Self and the chat UI can use.

## Objective

After this brief lands, a workspace user can type "show me my projects", "find the memory about Q3 planning", "what processes touch inbox work?", or "what is waiting for review?" in `/chat` and receive inline, filterable results with real drill links. The chat header also exposes a compact Archive drawer/search command that uses the same retrieval helper. Users can browse without losing chat context, then drill into full pages only when they want detail.

## Non-Goals

- No new external integrations.
- No Composio/Nango/provider work. Integration-action briefs come later.
- No new `ContentBlock` variants by default. Use `InteractiveTableBlock`, `RecordBlock`, `KnowledgeCitationBlock`, `MetricBlock`, `StatusCardBlock`, `AlertBlock`, and `SuggestionBlock`.
- No replacement of `/projects`, `/projects/[slug]`, `/process/[id]`, `/memories/[id]`, `/review`, `/setup`, or `/admin`.
- No mutation-heavy archive management. Creating/running processes stays Brief 280. Memory promote/demote stays on the memory detail surface. Project archive/unarchive stays existing admin/detail behavior.
- No semantic vector index unless a current local helper already exists. Use DB queries plus existing `search_knowledge` first.
- No engine self-HTTP. Self and routes share a helper; Self does not fetch the app's API route.

## Inputs

1. `docs/briefs/280-workspace-conversational-front-door-ia-inversion.md` - foundation route/session/Self work.
2. `docs/architecture.md` - layers and harness boundaries.
3. `docs/human-layer.md` - Orient, Review, Define, Delegate, Capture, Decide jobs.
4. `docs/dictionary.md` - canonical project/process/memory/work item terminology.
5. `packages/web/app/chat/page.tsx` and `packages/web/app/chat/components/chat-conversation.tsx` - chat shell after Brief 280.
6. `packages/web/app/projects/page.tsx` - current projects archive page.
7. `packages/web/app/projects/[slug]/page.tsx` - project drill route.
8. `packages/web/app/process/[id]/page.tsx` - process drill route.
9. `packages/web/app/memories/[id]/page.tsx` - memory drill route.
10. `packages/web/app/api/v1/projects/route.ts` and `packages/web/app/api/v1/projects/[id]/route.ts` - project list/detail contracts.
11. `packages/web/app/api/v1/memories/[id]/route.ts` - memory detail contract.
12. `src/engine/self-delegation.ts` - Self tool registry.
13. `src/engine/self-stream.ts` - tool result to `ContentBlock` mapping.
14. `src/engine/self-tools/search-knowledge.ts` - existing knowledge/memory citation behavior.
15. `packages/core/src/content-blocks.ts` - existing table/record/citation/status block contracts.
16. `packages/web/components/blocks/interactive-table-block.tsx` and `record-block.tsx` - likely renderers for result lists.

## Constraints

- This brief depends on Brief 280 being built. Do not implement this on top of the current Network front-door `/chat` stream.
- The Archive drawer is an escape hatch, not a replacement home screen. `/chat` remains the default surface.
- Use one shared product-layer retrieval helper, for example `src/engine/workspace-recall.ts`, consumed by both Self and any read-only web route. Do not duplicate query logic in React and Self.
- Any read-only HTTP route, for example `/api/v1/workspace/archive`, must use workspace-session auth and must not mutate state.
- Self retrieval must be a read-only tool, for example `search_workspace`, with filters for query, artifact kind, project, status, includeArchived, and limit.
- Treat current chat history, durable workspace records, and curated memory/knowledge as distinct recall sources. Do not make the archive drawer a transcript search only.
- The drawer is not the system of record. The shared helper and existing DB-backed artifacts are the source of truth; the drawer and Self tool are two surfaces over the same recall layer.
- Retrieval results must use real route shapes: `/projects/[slug]`, `/process/[id]`, `/memories/[id]`, `/review/[token]` where a token route exists. Do not invent `/projects/[id]` links for user-facing project pages.
- Result rendering uses existing blocks. `InteractiveTableBlock` is the default for multi-result lists; `RecordBlock` is the default for focused entity summaries; `KnowledgeCitationBlock` remains the default for memory/knowledge evidence.
- Keep primitive labels human-facing: "Projects", "Processes", "Memories", "Work", "Reviews", not schema/table names.
- Large result sets must be capped and paged or cursor-filtered. Default result count should be small enough for chat.
- Archived entities are hidden by default but discoverable when the user asks for archived items or turns on an archive filter.
- No side-effecting archive actions in this brief. Opening a drill link is allowed. Mutating buttons must either be absent or routed through already-audited flows from earlier briefs.
- Reduced motion and mobile touch targets are required for the drawer/search UI.
- Update Self guidance per Insight-183 so Mira knows to use recall/search before telling the user to navigate.

## Provenance

| What | Source | Level | Why |
| --- | --- | --- | --- |
| Chat remains the workspace home | Brief 280 | adopt | The archive layer must reinforce, not undo, the Self-first IA. |
| Surface adapters route through Self | ADR-016 | adopt | Conversational recall belongs in Self, not a separate agent chat. |
| ContentBlocks as render protocol | ADR-021, ADR-024 | adopt | Results render through existing table/record/citation blocks. |
| Project archive/detail pages | Briefs 215/223, current `/projects` routes | adopt | Keep existing drill surfaces; expose them through recall. |
| Memory detail/scope surface | Brief 227, current `/memories/[id]` route | adopt | Memory detail already solves promote/demote; do not duplicate it in chat. |
| Command/search drawer pattern | Linear/Cursor/Slack-style command palettes | pattern | Fast retrieval belongs in a compact overlay that does not take over the app. |
| Durable state exposed through agent tools | Hermes Agent memory, session search, and Kanban toolsets | pattern | Hermes separates curated memory from session search and exposes task-board state through structured tools backed by durable storage. Ditto should expose projects/processes/work/reviews through `search_workspace`, not primitive tabs or transcript-only search. |
| Knowledge citation provenance | Existing `search_knowledge` and `KnowledgeCitationBlock` | adopt | Memory/knowledge recall must preserve source and scope evidence. |

## Work Products

| File | Action |
| --- | --- |
| `src/engine/workspace-recall.ts` | Create shared read-only helper for searching/listing projects, processes, memories, work items, reviews, and recent activity. Returns normalized result records with kind, title, subtitle, status, updatedAt, projectSlug, route, and evidence/provenance fields where available. |
| `src/engine/self-delegation.ts` | Add read-only `search_workspace` Self tool. Inputs: `query`, `kinds`, `projectSlug`, `status`, `includeArchived`, `limit`. It calls the shared helper directly, not HTTP. |
| `src/engine/self-stream.ts` | Map `search_workspace` results to existing blocks: `InteractiveTableBlock` for lists, `RecordBlock` for focused summaries, `KnowledgeCitationBlock` for memory/knowledge evidence, and `AlertBlock` for no-match/error states. |
| `src/engine/self.ts` | Update relevant workspace guidance so Mira uses `search_workspace` for recall/browse questions and only suggests full pages as drill-downs. Apply Insight-183 branch parity. |
| `packages/web/app/api/v1/workspace/archive/route.ts` | Create read-only authenticated route for the Archive drawer. It uses the same helper as Self. No mutation. |
| `packages/web/app/chat/page.tsx` or extracted `chat-nav.tsx` | Add a compact Archive affordance to the chat header. It should not become a primitive sidebar. |
| `packages/web/app/chat/components/archive-drawer.tsx` | Create responsive drawer/command palette with search input, kind filters, archived toggle, result list, and drill links. |
| `packages/web/components/blocks/interactive-table-block.tsx` | Polish only if required so row links/actions are accessible and mobile-safe. Do not create a new archive-specific block type. |
| `packages/web/e2e/workspace-artifact-recall.spec.ts` | Add deterministic Playwright coverage for drawer search and conversational recall with mocked Self/tool results. |
| Tests | Add focused unit tests for the helper, Self tool schema/dispatch, stream block mapping, route auth, and drawer rendering. |

## User Experience

- **Primary use:** "I know we created something; help me find it."
- **Conversation path:** User asks Mira. Mira calls `search_workspace` and returns inline results, grouped or filtered only as needed.
- **Drawer path:** User opens Archive from the chat header, searches/filters, opens a result, then returns to chat with context preserved.
- **Result shape:** Each row has a type, title, status, project/context, updated time, and a clear "Open" drill link.
- **No-match state:** Mira says what was searched and offers two next filters, not a dead-end.
- **Mobile:** Drawer is a bottom sheet or full-height overlay with 44px targets and no horizontal tables.

## Acceptance Criteria

1. [ ] `/chat` has a compact Archive affordance after Brief 280; it does not restore a process/project/memory sidebar as the default IA.
2. [ ] Archive drawer search can list projects, processes, memories, work items, reviews, and recent activity from one UI.
3. [ ] Archive drawer uses a read-only authenticated route backed by a shared helper; it does not duplicate DB query logic in React.
4. [ ] Self has a read-only `search_workspace` tool with filters for query, artifact kind, project, status, archived inclusion, and limit.
5. [ ] Self calls the helper directly and does not self-HTTP to `/api/v1/workspace/archive`.
6. [ ] `search_workspace` searches durable workspace records and existing knowledge/memory sources; it is not limited to current chat transcript search.
7. [ ] "Show me my projects" in chat returns inline project results with `/projects/[slug]` drill links.
8. [ ] "Find the memory about Q3 planning" returns inline memory/knowledge results with provenance and `/memories/[id]` drill links where memory ids exist.
9. [ ] "What processes touch inbox work?" returns inline process results with status/trust fields and `/process/[id]` drill links.
10. [ ] "What is waiting for review?" returns review/work results without inventing unsupported routes.
11. [ ] Multi-result responses use `InteractiveTableBlock` or existing list-capable blocks; focused summaries use `RecordBlock`; memory evidence uses `KnowledgeCitationBlock`. No new block variant is introduced.
12. [ ] Archived projects/processes are hidden by default and appear only when requested by query/filter.
13. [ ] Result caps prevent chat flooding; the UI exposes "show more" or a filter refinement path instead of dumping large lists.
14. [ ] Drawer and inline results preserve chat context when a drill page is opened and the user goes back.
15. [ ] Reduced-motion and mobile accessibility checks pass for the drawer and result rows.
16. [ ] Verification passes: root/web type-check, focused helper/tool/route/component tests, and deterministic Playwright smoke for drawer search plus conversational recall.

## Review Process

1. Fresh-context review should use `docs/architecture.md`, `docs/review-checklist.md`, Brief 280, and this brief.
2. Reviewer must check 281 does not undo 280 by making primitive pages the home surface again.
3. Reviewer must check no new `ContentBlock` variants were added without strong justification.
4. Reviewer must check route shapes are real, especially `/projects/[slug]`.
5. Reviewer must check Self does not call local HTTP routes.
6. Reviewer must check archive/retrieval actions are read-only unless routed through existing guarded flows.
7. Reviewer must check memory/knowledge results preserve provenance and scope evidence.
8. Reviewer must check recall covers durable workspace records and knowledge/memory sources, not only chat transcript search.
9. Reviewer must check deterministic Playwright smoke exists and does not depend on live LLM behavior.

## Smoke Test

```bash
pnpm run type-check
pnpm --filter @ditto/web type-check
pnpm vitest run src/engine/workspace-recall.test.ts src/engine/self-stream.test.ts packages/web/app/api/v1/workspace/archive/route.test.ts
pnpm exec playwright test packages/web/e2e/workspace-artifact-recall.spec.ts
```

Manual flow:

1. Open `/chat` as an authenticated workspace user after Day Zero.
2. Open Archive from the chat header.
3. Search for a known project; confirm `/projects/[slug]` link appears.
4. Filter to memories; search for a known phrase; confirm provenance/scope is visible and memory drill link works.
5. Return to chat; confirm scroll/context is preserved.
6. Ask Mira: `show me my projects`.
7. Confirm inline results render through existing blocks.
8. Ask Mira: `what is waiting for review?`
9. Confirm review/work results render without redirecting.
10. Toggle reduced motion and repeat drawer open/close.

## After Completion

1. Update `docs/state.md` with a concise checkpoint.
2. Update `docs/roadmap.md` Phase 10 row for Brief 281.
3. Capture an insight only if the build reveals a reusable retrieval/IA rule not already covered by ADR-016/021/024.
