# Brief: Phase 10a — Web Foundation

**Date:** 2026-03-24
**Status:** draft
**Depends on:** Brief 038 (Phase 10 Architecture — parent brief)
**Unlocks:** Brief 040 (Self Extensions), Brief 041 (Feed & Review)

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard
- **Capabilities:** Next.js app scaffold, Self streaming to browser, conversation UI, entry point routing, real-time event stream

## Context

This is the skeleton. It gets the app running with the Self as the primary surface — a user can open the browser, see the Self greet them, and have a conversation. No feed, no sidebar, no workspace yet. Just the conversation.

## Objective

A working Next.js application where the user opens `localhost:3000`, the Self greets them, and they can have a full streaming conversation — including the Self delegating to processes and presenting outputs inline.

## Non-Goals

- Feed / workspace views (Brief 041)
- New Self tools (Brief 040) — uses existing 5 tools
- Process detail views (Brief 042)
- Proactive briefing / risk detection (Brief 043)
- Authentication (future phase)
- Monorepo restructure (deferred — import from `../../src/engine/` initially)

## Inputs

1. `docs/briefs/038-phase-10-mvp-architecture.md` — parent brief architecture
2. `docs/research/phase-10-mvp-dashboard-ux.md` — UX spec (sections 1, 2, 5)
3. `docs/research/phase-10-dashboard-workspace.md` — AI SDK Elements research
4. `src/engine/self.ts` — existing Self implementation
5. `src/engine/events.ts` — existing harness event emitter

## Constraints

- MUST use Next.js 15 App Router (not Pages Router)
- MUST use Vercel AI SDK v5 `useChat` for conversation streaming
- MUST use shadcn/ui for all UI primitives
- MUST use Tailwind CSS v4
- MUST NOT modify existing engine code beyond adding thin streaming adapters
- MUST NOT introduce authentication — single-user MVP
- MUST NOT create a separate API server — use Next.js Server Actions and Route Handlers
- MUST default to conversation-only layout for new users
- MUST thread a `userId` parameter (default: `"default"`) to not preclude future auth

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Next.js 15 App Router | Vercel | depend | Industry standard |
| shadcn/ui | shadcn | depend | Composable, unstyled |
| Tailwind CSS v4 | Tailwind Labs | depend | Required by shadcn |
| Vercel AI SDK v5 | Vercel | depend | `useChat`, streaming |
| TanStack Query v5 | TanStack | depend | Data fetching, SSE |
| Conversation UI | AI SDK Elements (Conversation, Message, PromptInput) | adopt | Source-adopt ~3 components |
| SSE pattern | Paperclip | pattern | Event stream for real-time updates |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/` | Create: entire Next.js project |
| `packages/web/package.json` | Create: dependencies (next, react, shadcn, ai, tanstack-query) |
| `packages/web/app/layout.tsx` | Create: root layout with providers (QueryClient, theme) |
| `packages/web/app/page.tsx` | Create: entry point with state-based routing |
| `packages/web/app/api/chat/route.ts` | Create: Route Handler for Self conversation streaming |
| `packages/web/app/api/events/route.ts` | Create: SSE Route Handler for harness events |
| `packages/web/components/self/conversation.tsx` | Create: conversation surface (adopted from AI Elements) |
| `packages/web/components/self/message.tsx` | Create: message component (adopted from AI Elements) |
| `packages/web/components/self/prompt-input.tsx` | Create: input with text + attach (adopted from AI Elements) |
| `packages/web/components/ui/` | Create: shadcn/ui primitives (card, button, dialog, etc.) |
| `packages/web/lib/engine.ts` | Create: thin import layer for engine functions |
| `src/engine/self.ts` | Modify: add `selfConverseStream()` adapter that yields tokens |
| `pnpm-workspace.yaml` | Create: workspace config for monorepo |
| `package.json` (root) | Modify: add workspace script for web dev |

## User Experience

- **Jobs affected:** Define (conversation), Capture (quick input), Orient (Self greeting)
- **Primitives involved:** Conversation Thread, Quick Capture (unified input), PromptInput
- **Process-owner perspective:** Open the app → Self greets warmly → have a conversation → Self responds with streaming text → Self can delegate to processes and report back. This is Rob's day-1 experience.
- **Interaction states:**
  - *Brand new user:* Self greets with onboarding opener (full-screen conversation)
  - *Returning user:* Self greets with brief status (or "all quiet")
  - *Self processing:* Typing indicator with "Working on it..."
  - *Self error:* "I ran into a problem. Here's what happened: [explanation]."
  - *Connection lost:* "Connection interrupted. Reconnecting..." with auto-retry
- **Designer input:** UX spec sections 1.5 (onboarding states), 2.1-2.6 (conversation surface), 5 (entry point logic)

## Acceptance Criteria

1. [ ] `packages/web/` exists as a Next.js 15 App Router project with working `pnpm dev`
2. [ ] shadcn/ui initialized with Card, Button, Dialog, Input, Tabs, ScrollArea primitives
3. [ ] Tailwind CSS v4 configured and working
4. [ ] `selfConverseStream()` adapter exists in engine that yields streaming tokens compatible with Vercel AI SDK
5. [ ] Route Handler at `/api/chat` connects `useChat` to `selfConverseStream()` — messages stream to the browser
6. [ ] Conversation UI renders: message list (scrollable), prompt input (text + attach button), typing indicator
7. [ ] Self's tool calls (existing 5 tools) execute server-side and results render in conversation
8. [ ] SSE Route Handler at `/api/events` emits harness events (step-complete, gate-pause, gate-advance, run-complete)
9. [ ] Entry point page routes: new user → full-screen conversation; returning user → conversation (workspace deferred to Brief 042)
10. [ ] `userId` parameter defaults to `"default"` and threads through Self and engine calls
11. [ ] Engine credentials and internals never reach the browser — all engine calls are server-side
12. [ ] `pnpm-workspace.yaml` configures monorepo, `pnpm dev` from root starts the web app

## Review Process

1. Spawn review agent with architecture.md + review-checklist.md + this brief
2. Review checks: streaming works end-to-end, no engine internals leak to client, shadcn/ui correctly initialized, entry point routing is state-based
3. Present + review to human

## Smoke Test

```bash
# 1. Install and start
cd packages/web && pnpm install && pnpm dev

# 2. Open http://localhost:3000
# Expected: Full-screen conversation. Self greets: "Hi, I'm your Self..."

# 3. Type: "Hello, what can you help me with?"
# Expected: Self responds with streaming text explaining capabilities

# 4. Type: "Start a dev researcher session on X"
# Expected: Self calls start_dev_role tool, result streams back

# 5. Check browser DevTools Network tab
# Expected: No engine credentials, no raw SQL, no internal types in responses
```

## After Completion

1. Update `docs/state.md` — web foundation shipped
2. Briefs 040 and 041 are unblocked for parallel build
