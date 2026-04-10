# Brief: Workspace Lite — Persistent Chat via Magic Link

**Date:** 2026-04-10
**Status:** complete
**Depends on:** Brief 121 (email_thread primitive for cross-surface threading)
**Unlocks:** Brief 124 (Ghost Mode — magic link auth reused for voice model consent)

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Persistent authenticated chat, cross-device conversation continuity, email↔chat fluid transition

## Context

After the front door conversation, pushing users to email feels like a downgrade — from real-time interaction to checking an inbox. But building a full workspace is premature. The infrastructure is 60% there: sessions are DB-backed (7-day TTL), the `networkUsers` table has `workspaceId`, and the `/review/[token]` route proves token-based access.

The user already gave their email. Magic link is the natural auth: Alex emails a link, user clicks, they're in their persistent chat. No passwords, no signup. Every email Alex sends becomes a door back into chat. Email and chat aren't separate surfaces — they're two views of the same conversation.

## Objective

A user who gave their email can click a magic link in any Alex email and land in a persistent chat at `/chat` with their full conversation history, continue chatting, and return anytime via a new magic link or session cookie.

## Non-Goals

- Full workspace provisioning (workspace creation, team management, billing)
- Real-time cross-tab sync via SSE/WebSocket (single-tab is fine)
- Chat-initiated actions (the chat is conversational, not a command interface)
- Conversation export or deletion
- OAuth / social login

## Inputs

1. `packages/web/app/welcome/ditto-conversation.tsx` — Existing chat component to adapt
2. `packages/web/app/review/[token]/page.tsx` — Token-based route pattern to follow
3. `src/engine/network-chat.ts` — Session management (loadOrCreateSession, saveSession)
4. `src/engine/self-tools/network-tools.ts` — Email sending (where magic links are included)
5. `src/engine/channel.ts` — `sendAndRecord()` where magic link footer is added
6. `src/db/schema.ts` — `chatSessions` and `networkUsers` tables
7. `packages/core/src/db/schema.ts` — For any core schema additions

## Constraints

- Magic link tokens must be cryptographically random (nanoid(32) minimum)
- Magic link expires after 24 hours (the link itself, not the session)
- Session cookie lasts 30 days, rolling (refreshed on each visit)
- Session TTL extends on activity (rolling 30-day window)
- Magic link is single-use: after first click, only the session cookie works
- No Ditto branding required on `/chat` page beyond minimal nav
- Must work on mobile (responsive, same component)
- httpOnly secure cookie — no token in localStorage for `/chat`
- Rate limit magic link generation (max 5 per email per hour)
- `/chat/auth` endpoint must use POST (not GET) to prevent CSRF — the magic link email contains a form that auto-submits on click, or a POST redirect page
- "Enter email" form on `/chat` must return the same success message regardless of whether the email exists (prevent enumeration)
- Session revocation: if user replies "stop" or opts out, invalidate their session cookie
- 30-day rolling TTL applies only to authenticated `/chat` sessions. Anonymous `/welcome` sessions keep the existing 7-day fixed TTL

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Magic link auth | Slack magic link pattern | pattern | Widely understood UX, no password friction. Custom implementation (not next-auth) because: (1) we only need magic link, not OAuth/credentials, (2) next-auth adds session management complexity we don't need, (3) our auth is email-only with session cookies — simpler than a full auth framework |
| Token-based route | `packages/web/app/review/[token]/page.tsx` | adopt | Same codebase, proven pattern |
| Session cookie auth | Next.js middleware + cookies() API | depend | Framework-native, secure defaults |
| Rolling TTL | Redis session pattern | pattern | Standard session extension on activity |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: add `magicLinks` table (id, email, token, sessionId, expiresAt, usedAt, createdAt). Add `accessToken` column on `chatSessions` for session↔magic link association |
| `src/engine/magic-link.ts` | Create: `createMagicLink(email, sessionId)`, `validateMagicLink(token)`, `consumeMagicLink(token)`. Token generation, validation, single-use consumption |
| `src/engine/network-chat.ts` | Modify: generate magic link at ACTIVATE, pass URL to email functions. Extend session TTL on activity (rolling 30-day) |
| `src/engine/self-tools/network-tools.ts` | Modify: include magic link URL in action email, intro email |
| `src/engine/channel.ts` | Modify: add magic link footer to all Alex-to-user emails: "Continue in chat: [link]" |
| `packages/web/app/chat/page.tsx` | Create: authenticated chat page. Reads session cookie, loads conversation + process run data from DB. Renders status strip (persistent header) + conversation using `ai-elements/message.tsx` with BlockRegistry. If no cookie, shows "enter email for magic link" form |
| `packages/web/app/chat/auth/route.ts` | Create: POST `/chat/auth`. Validates magic link, sets httpOnly session cookie, redirects to `/chat` |
| `packages/web/app/chat/components/status-strip.tsx` | Create: persistent header component. Compact metrics (contacted, replied, meetings) + next scheduled action. Tappable → navigates to `/chat/activity`. Real-time updates via SSE |
| `packages/web/app/chat/components/chat-conversation.tsx` | Create: shared conversation component for `/chat`. Uses `ai-elements/message.tsx` for message rendering (vivid dot, streaming, block dispatch). Uses BlockRegistry for inline structured content. Accepts full message history, sessionId, authenticatedEmail props |
| `packages/web/app/welcome/ditto-conversation.tsx` | Modify: keep as-is for anonymous front door (simple ChatMessage renderer). The `/chat` page uses its own conversation component with the advanced message renderer |
| `packages/web/app/api/v1/chat/session/route.ts` | Create: GET endpoint that reads session cookie, returns session data (messages, metadata, active process runs) for the chat page |

## User Experience

- **Jobs affected:** Orient (status strip + activity page), Review (inline block actions), Capture (continue via chat)
- **Primitives involved:** Conversation (persistent chat), BlockRegistry (structured inline content), Magic Link (email-as-auth)

### UI Design: Blending Homepage + Workspace

The workspace lite keeps the homepage's clean single-column centered layout (max-640px, no sidebar, no panels) but upgrades message rendering to use the workspace's `ai-elements/message.tsx` component with full BlockRegistry dispatch. This means Alex's messages can contain structured blocks inline — progress bars, review cards, metrics, alerts, suggestions — all actionable.

**Three surfaces:**

#### 1. `/chat` — Persistent Conversation (primary)

```
┌──────────────────────────────────────┐
│  ditto            [Status Strip ▸]   │
├──────────────────────────────────────┤
│  ┌── Status Strip (persistent) ────┐ │
│  │ 5 contacted · 2 replied · ···   │ │
│  │ Next: follow-ups in 3 days      │ │
│  └─────────────────────────────────┘ │
│                                      │
│  [Conversation — full history]       │
│                                      │
│  Alex (vivid dot, streaming cursor): │
│  "Here's who I reached out to:"     │
│  ┌─ ProgressBlock ────────────────┐  │
│  │ ● Sarah @ Meridian — replied   │  │
│  │ ○ James @ Clearview — pending  │  │
│  │ ○ Wei @ Summit — sent          │  │
│  └────────────────────────────────┘  │
│                                      │
│  Alex:                               │
│  "Sarah's interested. Here's the     │
│   intro I'd send:"                   │
│  ┌─ ReviewCard ───────────────────┐  │
│  │ Draft intro to Sarah...        │  │
│  │ [Approve] [Edit] [Reject]      │  │
│  └────────────────────────────────┘  │
│                                      │
│  You: "Looks good, send it"          │
│                                      │
│  Alex:                               │
│  ┌─ AlertBlock (positive) ────────┐  │
│  │ ✓ Intro sent to Sarah          │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌──────────────────────────┐ [Send] │
│  │ Message Alex...          │        │
│  └──────────────────────────┘        │
│  [Quick-reply pills if suggestions]  │
└──────────────────────────────────────┘
```

**Key decisions:**
- Messages render via `ai-elements/message.tsx` (not homepage's simple `ChatMessage`)
- Blocks render inline via BlockRegistry — review cards, progress, metrics, alerts, suggestions
- Block actions work inline (approve/edit/reject buttons on review cards, dismiss on suggestions)
- Quick-reply pills appear below input when Alex provides suggestions
- Status strip is persistent at top — tappable to open activity page

#### 2. Status Strip (persistent header)

Compact, always-visible summary above the conversation:
- Left: key metrics (contacted · replied · meetings)
- Right: next scheduled action ("Follow-ups in 3 days")
- Auto-updates on page load (queries active process runs + interactions)
- Collapses to single line on mobile
- No dedicated activity page — if the user wants more detail, they ask Alex in the chat ("What are you working on?") and Alex responds with structured blocks

### What stays the same as the homepage
- Single-column centered layout (640px max)
- Clean input area with quick-reply pills
- Warm conversational feel (not a dashboard)
- No sidebar, no panels, no complexity

### What upgrades from the workspace
- `ai-elements/message.tsx` replaces `ChatMessage` (vivid dot, streaming, blocks)
- BlockRegistry for structured inline content (22 block types)
- Inline block actions (approve, reject, dismiss — same as full workspace)
- Hover actions on messages (copy, retry)

- **Interaction states:**
  - Magic link click → brief loading → chat with full history + status strip (success)
  - Expired magic link → "This link has expired. Enter your email for a new one." (expired)
  - No session cookie → "Enter your email to continue" form (unauthenticated)
  - Session loaded, no new messages → status strip + history + "What's on your mind?" input
- **Designer input:** Not formally invoked. Design blends homepage centered layout with workspace block system. Follow homepage visual language (sparse, breathing room) not workspace density.

## Acceptance Criteria

1. [ ] `createMagicLink(email, sessionId)` generates a 32-char nanoid token with 24h expiry
2. [ ] `validateMagicLink(token)` returns `{ email, sessionId }` for valid, unexpired, unused tokens
3. [ ] `consumeMagicLink(token)` marks the token as used (sets `usedAt`) — subsequent validations fail
4. [ ] POST `/chat/auth` with valid token sets httpOnly session cookie and redirects to `/chat`
5. [ ] POST `/chat/auth` with expired/used token redirects to `/chat` with error parameter
15. [ ] "Enter email" form returns identical success message regardless of whether email exists in system
16. [ ] Session cookie is invalidated when user opts out or cancels (via inbound-email cancellation flow)
17. [ ] 30-day rolling TTL applies only to `/chat` authenticated sessions; `/welcome` anonymous sessions keep 7-day fixed TTL
6. [ ] `/chat` page with valid session cookie loads full message history from DB and renders via `ai-elements/message.tsx` with BlockRegistry
7. [ ] `/chat` page without session cookie shows "enter email" form
8. [ ] Sending a message on `/chat` uses the same `handleChatTurnStreaming` as the front door
18. [ ] Status strip renders above conversation with key metrics (contacted, replied, meetings) and next scheduled action
19. [ ] Status strip updates on page load from active process runs + interaction data
20. [ ] Alex's messages on `/chat` can contain inline blocks (ProgressBlock, ReviewCard, AlertBlock, MetricBlock, SuggestionBlock) rendered via BlockRegistry
21. [ ] Inline block actions (approve/edit/reject on ReviewCard, dismiss on SuggestionBlock) work on `/chat` — same as full workspace
9. [ ] Every `sendActionEmail`, `sendCosActionEmail`, and user-nurture email includes a magic link footer
10. [ ] Magic link rate limiting: >5 requests per email per hour returns error
11. [ ] Session TTL extends to 30 days from last activity (not fixed from creation)
12. [ ] Chat component works in both anonymous mode (`/welcome`) and authenticated mode (`/chat`)
13. [ ] Mobile responsive: `/chat` page usable on phone screen
14. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Security (httpOnly cookie, token entropy, single-use, rate limiting), Layer alignment (L6 Human Layer), simplicity (minimal new infrastructure)
3. Present work + review to human

## Smoke Test

```bash
# Type check
pnpm run type-check

# Magic link unit tests
pnpm vitest run src/engine/magic-link.test.ts

# Manual: trigger ACTIVATE in test mode, check action email for magic link URL
# Click the URL → verify redirect to /chat with session cookie set
# Verify conversation history loads
# Send a message → verify it appears and Alex responds
# Close tab, reopen /chat → verify session persists via cookie
```

## After Completion

1. Update `docs/state.md`: "Workspace lite: magic link auth + persistent /chat route"
2. Write ADR for magic link authentication pattern (reusable across surfaces)
3. Update `docs/architecture.md` Layer 6: add Magic Link as authentication primitive
4. Retrospective: is the email↔chat transition smooth? Do users actually click the link?
