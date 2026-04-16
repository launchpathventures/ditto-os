# Brief 168: Library & Today Personalization

**Date:** 2026-04-16
**Status:** draft
**Depends on:** Brief 167 (Capability Matcher + Self Context)
**Unlocks:** None

## Goal

- **Roadmap phase:** Cross-cutting (L6 Human)
- **Capabilities:** Personalised Library view, Today view capability recommendations, context-aware empty states

## Context

Brief 167 builds the capability matcher and wires it into Self context so Alex can suggest capabilities in conversation. This brief uses that same matcher to personalise the passive discovery surfaces — Library and Today views — so users who explore the workspace also discover relevant capabilities without needing to ask.

Currently the Library is a flat catalog grouped by category. The Today view shows active work and briefing content but no capability recommendations. Empty states are generic ("Ask me what I can help with").

## Objective

Personalise Library and Today views so unactivated capabilities ranked by relevance appear prominently, with the user's own context as match reasoning. Users who browse discover capabilities matched to THEIR business without asking.

## Non-Goals

- Self context or conversational suggestions (Brief 167)
- New content block types (compose from existing RecordBlock + TextBlock)
- Work/Projects/Routines/Growth composition changes
- Mobile-specific layouts (Phase 12)

## Inputs

1. `docs/research/capability-awareness-ux.md` — UX spec triggers #6 (Library) and #7 (Today view)
2. `src/engine/capability-matcher.ts` — matcher from Brief 167 (prerequisite)
3. `src/engine/process-data.ts` — `getProcessCapabilities()` (to extend with relevance scoring)
4. `packages/web/lib/compositions/library.ts` — current Library composition
5. `packages/web/lib/compositions/today.ts` — current Today composition
6. `packages/web/lib/composition-empty-states.ts` — current empty states
7. `packages/web/lib/composition-context.ts` — CompositionContext type

## Constraints

- Matcher scoring is server-side. Compositions receive pre-sorted data — no client-side ranking logic.
- Library "Recommended" section appears only when matcher returns matches with relevanceScore > 0.5. Hidden otherwise.
- Today "Recommended" strip shows max 1 capability. Hidden when user has 5+ active processes.
- Empty states must degrade gracefully when no user model exists (show full catalog, no recommendations).
- No new API routes — Library already fetches capabilities via `/api/capabilities`, Today already has composition context. Extend existing data shapes.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Personalised ranking in passive view | Spotify "Made for you" sections | pattern | Contextual recommendations mixed into browsing |
| Match reason as subtitle | Notion template suggestions | pattern | Context-sensitive reasoning shown inline |
| Recommended section at top of catalog | App Store "Suggested for You" | pattern | Relevance-first, then browse-by-category |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/process-data.ts` | **Modify:** `getProcessCapabilities()` gains optional `userId` parameter. When provided, calls `matchCapabilities()` and annotates each `ProcessCapability` with `relevanceScore` and `matchReason`. Returned array gains a `recommended` subset (score > 0.5, max 3). |
| `packages/web/app/api/capabilities/route.ts` | **Modify:** Pass authenticated userId to `getProcessCapabilities()` so scoring is user-contextual. |
| `packages/web/lib/compositions/library.ts` | **Modify:** Add "Recommended for your business" section at top when `capabilities.recommended` is non-empty. Each recommended capability renders as RecordBlock with accent="vivid", status="Recommended", and matchReason as subtitle. "Active" section follows. "All Capabilities" section last (existing category grouping). Recommended section hidden when empty. |
| `packages/web/lib/compositions/today.ts` | **Modify:** Add recommended strip between attention items and running-smoothly items. Shows top 1 recommended capability as a compact RecordBlock with "Set this up" action. Hidden when: no recommendations, 5+ active processes, or all dismissed. |
| `packages/web/lib/composition-empty-states.ts` | **Modify:** `emptyLibrary()` becomes context-aware: when user model exists, shows "Based on what I know about your [business type], here's what would help most" with top 3 matched capabilities. When no user model, shows current generic message. `emptyToday()` adds matched capability to suggestions when available. |
| `packages/web/lib/compositions/types.ts` | **Modify:** Extend `ProcessCapability` type with optional `relevanceScore?: number` and `matchReason?: string`. Add `recommended?: ProcessCapability[]` to CompositionContext. |

## User Experience

- **Jobs affected:** Orient (Today — "what could be happening"), Define (Library — "what to set up")
- **Primitives involved:** RecordBlock (capability cards), TextBlock (section headers), ActionBlock (set up actions)
- **Process-owner perspective:**
  - **Library:** User clicks "Capabilities" → sees "Recommended for your business" at top with 1-3 capabilities showing their own words as match reasons. Below: active processes, then full catalog by category. Feels personalised, not generic.
  - **Today:** Between pending reviews and running-smoothly, a single recommended capability strip. Unobtrusive. Tapable. Disappears once portfolio is built.
  - **Empty Library:** New user with no processes but a user model sees contextual recommendations instead of generic "ask Alex."
- **Interaction states:**
  - Recommendations loading → skeleton placeholder for recommended section
  - No user model → full catalog without recommended section, generic empty state
  - User model, matches exist → recommended section visible
  - User model, no matches → recommended section hidden, catalog shows
  - 5+ processes → recommended section hidden in both Library and Today
  - All recommendations dismissed → recommended section hidden
  - API error → graceful degradation, catalog without recommendations, no error shown
- **Designer input:** `docs/research/capability-awareness-ux.md` — triggers #6 and #7

## Acceptance Criteria

1. [ ] **`getProcessCapabilities(userId?)` returns scored capabilities.** When `userId` provided, each capability has `relevanceScore` (0-1) and `matchReason` (string or undefined). Results include `recommended` subset (score > 0.5, max 3, sorted by score descending).

2. [ ] **Capabilities API passes userId.** `/api/capabilities` route passes authenticated user's ID to `getProcessCapabilities()`. Unauthenticated requests return unsorted capabilities (no recommendations).

3. [ ] **Library "Recommended" section.** When recommended capabilities exist, Library composition renders a "Recommended for your business" TextBlock header followed by RecordBlocks with accent="vivid" and matchReason as subtitle. Section appears above "Active" and "All Capabilities" sections.

4. [ ] **Library "Recommended" hidden when appropriate.** Section not rendered when: no recommended capabilities, user has 5+ active processes, or no user model exists.

5. [ ] **Today recommended strip.** Today composition renders 1 recommended capability as a compact RecordBlock with "Set this up" action, positioned between attention items and running-smoothly section. Hidden when: no recommendations, 5+ active processes, or recommendation dismissed.

6. [ ] **Context-aware empty states.** `emptyLibrary()` checks for user model and matched capabilities. When available: "Based on what I know about your [business type], here's what would help most" + top 3 RecordBlocks. When no user model: current generic message preserved.

7. [ ] **Graceful degradation.** If matcher throws or returns empty, Library renders full catalog without recommended section. Today omits recommended strip. No error shown to user.

8. [ ] **Type-check clean.** `pnpm run type-check` passes at root. `ProcessCapability` type extended with optional `relevanceScore` and `matchReason` fields.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: composition functions remain pure/synchronous, no new API routes, RecordBlock usage consistent with existing Library patterns, graceful degradation verified, empty state backward compatible
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run type-check
pnpm run type-check

# 2. Manual: Start web app with a user who has described their business
# Navigate to Capabilities → verify "Recommended for your business" section at top
# Verify match reasons show user's own words
# Verify "Active" section shows running processes
# Verify "All Capabilities" shows remaining by category

# 3. Manual: Navigate to Today → verify recommended strip appears
# Verify it shows 1 capability with "Set this up" action
# Create 5+ processes → verify recommended sections disappear

# 4. Manual: Clear user model → navigate to Capabilities
# Verify generic empty state (no recommended section)
```

## After Completion

1. Update `docs/state.md` with what changed
2. Brief 166 (parent) fully complete
3. Retrospective: did RecordBlock composition work well for recommendations, or should a dedicated block type be considered for v2?
