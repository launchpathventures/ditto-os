# Brief 106: Bespoke Signed Review Pages — Rich Review Surface Between Email and Workspace

**Date:** 2026-04-08
**Status:** draft
**Depends on:** None (technically independent — motivated by Brief 105's consent model, but can be built in parallel)
**Unlocks:** Richer front-door-to-workspace graduation path, goal decomposition presentation (Brief 102), budget proposal presentation (future)

## Goal

- **Roadmap phase:** Phase 14+ (Network Agent — surface expansion)
- **Capabilities:** Authenticated ephemeral review pages where Alex presents rich content and the user can chat with Alex, bridging the gap between email-only and full workspace

## Context

Email-only users (pre-workspace) hit a ceiling when Alex needs to present something richer than email can carry: a proposed outreach approach with example emails, a target shortlist with reasoning, a goal decomposition with sub-goals and dependencies, or a budget allocation plan.

Currently, the options are:
1. **Email** — text-only, no interactivity, can't show process maps or structured data
2. **Workspace** — full commitment, requires provisioning, premature for early relationships

Bespoke signed review pages fill the gap: a lightweight, authenticated page where Alex presents rich content (ContentBlocks) and the user can chat with Alex on the page to ask questions or make refinements. The page is ephemeral — it exists for a specific review moment, not as a permanent surface.

This concept emerged from Insight-164: in the trust-building phase (first 1-2 outreach cycles), Alex shows the user HOW they'll approach things — not for approval, but to build confidence. The review page is where this happens.

## Objective

Build a new route and page type (`/review/[token]`) on the network service that renders authenticated, ephemeral review pages with rich content (ContentBlocks) and an embedded Alex chat for refinement conversation.

## Non-Goals

- **Full workspace features** — no sidebar, no process management, no trust controls, no compositions. This is a single-purpose review surface.
- **Persistent pages** — review pages are ephemeral. They have a TTL (30 days default) and are archived after use.
- **User account creation** — viewing a review page does not create a workspace. It uses magic-link auth for identity, not onboarding.
- **Replacing email** — email remains the primary arms-length surface. Review pages are linked FROM emails for moments that need richer presentation.
- **Mobile-first design** — review pages should work on mobile but are designed for the "user clicks link from email at their desk" use case. Mobile-optimised design is a follow-up.

## Inputs

1. `docs/insights/164-alex-acts-as-professional-not-assistant.md` — core insight defining the review page concept
2. `docs/insights/161-email-workspace-boundary.md` — email limitations that review pages solve
3. `docs/insights/154-value-before-identity.md` — value before identity pattern
4. `packages/web/app/welcome/ditto-conversation.tsx` — existing chat component to reuse
5. `packages/web/app/api/v1/network/chat/stream/route.ts` — existing streaming chat API
6. `packages/web/components/blocks/` — existing ContentBlock renderers (22 types)
7. `src/engine/notify-user.ts` — notification system that will include review page links
8. `packages/web/app/api/v1/network/admin/login/route.ts` — existing auth patterns

## Constraints

- **Magic-link authentication required.** Review pages contain user-specific content (outreach plans, targets, business context). Access MUST be authenticated via signed token, not public. Tokens are single-use or time-limited (not reusable).
- **Token security:** Signed tokens use HMAC-SHA256 (consistent with existing inbound webhook pattern). Token includes: userId, pageId, expiresAt. Tokens expire after 30 days or first use + 24h grace period (whichever is longer — user might revisit).
- **No data leakage:** Review pages render only the content associated with that specific review. No access to other user data, other review pages, or workspace features.
- **Token forwarding risk acknowledged (V1 trade-off).** Like all magic-link auth (Slack, Notion, Linear), a forwarded link grants access. The content is business-sensitive but not critically so (outreach plans, not financial data). Mitigated by: TTL expiry, "Prepared for [name]" banner on page, and 30-day max lifetime. Token forwarding does NOT create a user account or grant workspace access.
- **Chat messages on review pages MUST be persisted** and associated with the review page record. Alex needs memory of what was discussed to incorporate feedback.
- **Chat on review pages uses the existing network-chat infrastructure.** The user's identity is established by the signed token. Chat context includes the review page content so Alex can discuss it.
- **ContentBlock rendering reuses the existing block registry** (`packages/web/components/blocks/`). No new block types needed — the 22 existing types cover all review page content.
- **Ephemeral lifecycle:** Review pages are created when Alex needs to show something rich, archived after the user has engaged (or after TTL). Archived pages show a "this review has been completed" message.
- **Review pages are read-mostly.** The user doesn't edit content directly. They chat with Alex to suggest refinements. Alex updates the underlying data. The page reflects Alex's updates on next load (not live — acceptable for V1).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Signed ephemeral pages | Magic-link auth (various SaaS, Slack invite links) | pattern | Time-limited authenticated access without passwords |
| HMAC token signing | Existing inbound webhook pattern (`/api/v1/network/inbound`) | adopt | Same signing pattern, proven in codebase |
| Rich content rendering | Existing ContentBlock registry | adopt | 22 block types already cover all needed content |
| Embedded chat | Existing DittoConversation component | adopt | Same chat component, different context |
| Ephemeral review surface | Google Docs "anyone with link" + expiry | pattern | Time-limited rich document sharing |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `reviewPages` table — id, userId, personId, token (HMAC-signed), title, contentBlocks (JSON array of ContentBlock[]), status (active/completed/archived/expired), createdAt, expiresAt, completedAt |
| `src/engine/review-pages.ts` | Create: `createReviewPage()` — generates signed token, stores page, returns URL. `getReviewPage()` — validates token, returns page content. `completeReviewPage()` — marks page as completed. `archiveExpiredPages()` — cleanup job. |
| `packages/web/app/review/[token]/page.tsx` | Create: Review page server component — validates token via engine directly (not API fetch), renders ContentBlocks via existing block registry, embeds chat client component |
| `packages/web/app/review/[token]/review-page-client.tsx` | Create: Client component — renders ContentBlocks + embedded chat with Alex |
| `packages/web/app/review/[token]/layout.tsx` | Create: Minimal layout — no sidebar, no workspace chrome. Clean, focused review surface. Ditto branding only. |
| `packages/web/app/api/v1/network/review/[token]/chat/route.ts` | Create: Chat route — direct `createCompletion` with cognitive core + review page context. User identity from token. Rate limited per-token. |
| `src/engine/notify-user.ts` | Modify: Add `reviewPageUrl` optional field to `UserNotification`. When present, email includes a "View details" link to the review page. |
| `src/engine/review-pages.test.ts` | Create: 16 unit tests covering token signing, HMAC forgery rejection, expiry enforcement, page lifecycle (create → get → complete → archive), chat message persistence. No component tests — web package has no test infrastructure; all meaningful logic is in the engine module. |

## User Experience

- **Jobs affected:** Orient (viewing rich proposals), Decide (refining approach via chat), Review (reviewing outreach plans, goal decompositions)
- **Primitives involved:** ContentBlocks (existing 22 types), DittoConversation (adapted for review context)
- **Process-owner perspective:** User receives an email from Alex: "I've put together my approach for the Christchurch property managers. Take a look: [View details →]". User clicks → opens authenticated page showing Alex's approach, example email, target shortlist with reasoning. Alex is available on the page: "Any questions? Anything I should know about these companies?" User types "Henderson PM — I know the owner, mention the referral." Alex acknowledges. User closes the page. Alex incorporates the feedback and proceeds.
- **Interaction states:**
  - **Loading:** Token validation in progress (server-side, fast)
  - **Active:** Review content displayed, chat available
  - **Completed:** User engaged, page marked complete (still accessible for 24h grace)
  - **Expired/Archived:** "This review has been completed" message
  - **Invalid token:** "This link has expired or is invalid" — redirect to front door
- **Designer input:** Not invoked for this brief. The review page layout should be simple: content on top/left, chat on right/bottom. Reuses existing components. Full Designer pass recommended before launch to ensure the trust-building moment feels premium, not utilitarian.

## Acceptance Criteria

1. [ ] `reviewPages` table exists with: id, userId, personId, token, title, contentBlocks (JSON), status (active/completed/archived/expired), createdAt, expiresAt, completedAt
2. [ ] `createReviewPage(userId, personId, title, blocks, ttlDays?)` generates HMAC-SHA256 signed token, stores page, returns full URL (`/review/[token]`)
3. [ ] `getReviewPage(token)` validates HMAC signature AND checks expiry AND checks DB status (reject if archived/expired). Returns page content if valid, null otherwise.
4. [ ] Token includes userId + pageId + expiresAt in the signed payload. Cannot be forged or modified.
5. [ ] `/review/[token]` page renders ContentBlocks via existing block registry — no new block types needed
6. [ ] `/review/[token]` page includes embedded chat component. Full ContentBlock array is serialised as text and injected into the chat system prompt so Alex can reference specific items on the page (e.g., "what do you think about the third target?" requires Alex to have the full target list).
7. [ ] Chat on review pages uses a direct `createCompletion` call with Alex's cognitive core (`getCognitiveCore()`) loaded into the system prompt. Does NOT use `handleChatTurnStreaming` — front-door chat machinery (session mgmt, email detection, funnel events, ACTIVATE flow) doesn't apply to review pages. User identity comes from the signed token.
8. [ ] `notifyUser()` accepts optional `reviewPageUrl` — when present, email includes a styled "View details →" link
9. [ ] Review pages have no sidebar, no workspace navigation, no process management UI. Clean single-purpose surface with Ditto branding. `Referrer-Policy: no-referrer` header set on the page to prevent token leaking via referrer.
10. [ ] `completeReviewPage(token)` marks page completed. Completed pages remain accessible for 24h grace period, then become archived.
11. [ ] `archiveExpiredPages()` cleans up pages past their TTL. Can be called from heartbeat/scheduler.
12. [ ] Invalid/expired tokens show a friendly message: "This link has expired or is invalid" with a link to the front door (not a 404)
13. [ ] No data leakage: review page API returns ONLY the content for that specific page. No cross-user or cross-page data accessible.
14. [ ] Review page displays "Prepared for [name]" banner — mitigates forwarding risk and provides personalisation
15. [ ] Chat messages on review pages are persisted and associated with the review page record (stored in `reviewPages.chatMessages` or linked via session)
16. [ ] Review page chat endpoint has rate limiting (max 30 messages per token per hour, in-memory counter — same pattern as existing IP-based rate limiting in network-chat)
17. [ ] Unit tests cover: token generation + validation, expiry enforcement, HMAC forgery rejection, page lifecycle (create → get → complete → archive), chat context injection with full ContentBlock array, chat message persistence

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: security (token signing, data isolation, expiry enforcement), consistency with existing auth patterns (admin login, inbound webhook), ContentBlock registry reuse, chat infrastructure reuse
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests for review pages
pnpm test -- --grep "review-page"

# Verify schema migration
pnpm cli sync

# Manual: create a review page via test script, open URL, verify content renders
# Manual: verify expired token shows friendly message
# Manual: verify chat works on review page with Alex aware of page content

# Type check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with bespoke review pages implementation
2. Update `docs/architecture.md` — add review pages as a surface type in Layer 6
3. Update `docs/insights/161-email-workspace-boundary.md` — review pages are the middle ground between email and workspace
4. Phase retrospective: do review pages feel premium? Does chat-on-page work naturally? Is the TTL/lifecycle right?

Reference docs updated: `docs/architecture.md` (review pages as Layer 6 surface type), `docs/insights/161-email-workspace-boundary.md` (review pages as middle ground)
