# Brief 148: Frontdoor-to-Workspace Memory Bridge

**Date:** 2026-04-14
**Status:** complete
**Depends on:** none (sequencing preference: builds better after Brief 145 ships, but no hard build dependency)
**Unlocks:** MP-2.3 (onboarding-to-creation handoff), MP-2.4 (first-run streaming)

## Goal

- **Roadmap phase:** Meta-Process Robustness (sub-roadmap MP-2)
- **Capabilities:** MP-2.1 (memory bridge audit — complete, findings inform this brief), MP-2.2 (frontdoor context injection on magic link consumption)

## Context

Research (MP-2.1 audit) identified three critical gaps in the frontdoor-to-workspace transition:

### Gap 1: Frontdoor learned context is ephemeral
The frontdoor chat builds a rich user model in `chatSessions.learned` (`src/db/schema/frontdoor.ts:36`) — a JSON column storing `{ name, business, role, industry, location, target, problem, channel, phone }`. This is updated every turn via `network-chat.ts:663-665` by merging LLM-extracted fields. But it's session-scoped JSON, not durable memory. When the session ends, the context is stranded in the chat session table.

### Gap 2: Magic link transfers only email
`consumeMagicLink()` at `magic-link.ts:103-123` returns `{ email, sessionId }`. The auth handler at `packages/web/app/login/auth/route.ts:65-102` sets a cookie with the email and redirects. No frontdoor context is carried over.

### Gap 3: `assembleSelfContext()` doesn't load person-scoped memories
`loadSelfMemories()` at `self-context.ts:117-156` queries only `scopeType: "self"` memories. Person-scoped memories (where frontdoor context would naturally live) are only loaded during harness agent execution in `memory-assembly.ts:153-185`, not in the conversational Self.

**The result:** user has a rich, personalised frontdoor conversation where Alex learns their name, business, problems, and goals. They click the magic link. Alex says "Welcome to Ditto" with zero context. The emotional journey breaks at the most critical transition point.

### Timing guarantee
Person record creation must precede magic link generation. The current flow guarantees this: frontdoor creates person records during the ACTIVATE stage (via the network pipeline), and `createWorkspaceMagicLink()` is called after ACTIVATE completes. If the person record somehow doesn't exist (edge case), `persistLearnedContext` logs a warning and returns gracefully (AC #9).

## Objective

When a user transitions from frontdoor to workspace via magic link, Alex greets them with full context from the frontdoor conversation: "Hey Sarah, glad you're here. I remember you're running a plumbing business in Melbourne and looking to streamline your quoting."

## Non-Goals

- Changing the frontdoor conversation flow or what it collects
- Modifying the magic link auth mechanism (Brief 123 — works fine)
- Onboarding-to-process-creation handoff (MP-2.3 — depends on MP-1.1)
- First-run streaming or progress (MP-2.4 — depends on MP-1.4)
- Migrating existing chat sessions retroactively (only new transitions)
- Adding new UI components — the greeting is conversational (Self's first message)

## Inputs

1. `src/engine/network-chat.ts` — frontdoor session management, `learned` context extraction and accumulation (lines 482-594, 663-665). The `LearnedContext` interface (lines 36-46) defines: `name, business, role, industry, location, target, problem, channel, phone`
2. `src/db/schema/frontdoor.ts` — `chatSessions` table with `learned` JSON column (line 36)
3. `src/engine/magic-link.ts` — `consumeMagicLink()` returns `{ email, sessionId }` (lines 103-123), `createWorkspaceMagicLink(email)` (lines 130-166)
4. `src/engine/self-context.ts` — `loadSelfMemories(userId, tokenBudget)` queries only self-scoped memories (lines 117-156)
5. `src/engine/self.ts` — `assembleSelfContext()` builds Self's full context (lines 83-350)
6. `src/engine/people.ts` — `getPersonByEmail()`, `getPersonMemories(personId)` (lines 347-362)
7. `packages/web/app/login/auth/route.ts` — magic link auth handler, sets cookie and redirects (lines 65-102)
8. `packages/core/src/db/schema.ts` — memories table schema, `memoryScopeTypeValues`, `memoryTypeValues`
9. `docs/meta-process-roadmap.md` — MP-2 section

## Constraints

- Memory persistence must happen at magic link generation (not on every chat turn — avoids write amplification). One write per transition.
- Each learned field creates a separate memory for fine-grained retrieval and deduplication
- Memory content must be human-readable, not raw JSON — Self reads these as context strings
- `loadSelfMemories` modification must not increase token budget beyond the existing 1000-token default. Frontdoor context for a typical user is ~8 fields × ~15 tokens = ~120 tokens. Well within budget.
- No changes to `@ditto/core` — memory schema already supports person-scoped memories with `type: "user_model"`
- Magic link auth route must remain fast — memory loading can happen in the Self context assembly path, not in the auth route itself

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Session-to-memory persistence | Existing `createMemoryFromFeedback()` pattern in `feedback-recorder.ts` | pattern | Same codebase — convert ephemeral data to durable memories using the same table and dedup logic |
| Person-scoped memory loading | Existing `memory-assembly.ts:153-185` person memory queries | adopt | Same codebase — reuse the query pattern in Self context |
| Context injection on auth transition | OAuth callback enrichment patterns (HubSpot, Auth0 post-login actions) | pattern | Common in SaaS — enrich user context at transition boundary |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/network-chat.ts` | Modify: Add `persistLearnedContext(sessionId)` function. Extracts `learned` from chat session. For each non-null field, creates a person-scoped memory: `scopeType: "person"`, `scopeId: personId` (looked up via email from session), `type: "user_model"`, `source: "conversation"`. Content formatted as "Business: Sarah's Plumbing", "Role: Owner", etc. Deduplicates by checking existing person-scoped memories with same content prefix (e.g., "Business:") — updates if changed, skips if identical |
| `src/engine/magic-link.ts` | Modify: `createWorkspaceMagicLink()` calls `persistLearnedContext(sessionId)` before generating the link token. The sessionId is already available from the frontdoor chat context. If persist fails, log warning and continue (magic link generation must not be blocked by memory persistence) |
| `src/engine/self-context.ts` | Modify: `loadSelfMemories(userId)` extended to also query person-scoped memories where the person's email matches the authenticated user's email. Uses `getPersonByEmail()` to resolve the person record. Person memories rendered under a "From your earlier conversation:" header, compact format: one line per field. If no person found, skip gracefully |
| `src/engine/network-chat.test.ts` | Modify: Add test for `persistLearnedContext()` — creates person-scoped memories from learned context |
| `src/engine/self-context.test.ts` | Create or modify: Add test for person-scoped memory loading in Self context |

## User Experience

- **Jobs affected:** Orient (first workspace session is contextual, not cold)
- **Primitives involved:** Greeting message (conversational — Self's first message in workspace)
- **Process-owner perspective:**
  1. **Frontdoor:** User chats with Alex about their plumbing business, quoting headaches, Melbourne location
  2. **Transition:** User clicks magic link in email → lands in workspace
  3. **Workspace greeting:** Alex says "Hey Sarah, glad you're here. I remember you're running a plumbing business in Melbourne and looking to streamline your quoting process. Let's set that up."
  4. **Fallback:** If no frontdoor context found (direct signup, failed persistence), standard "Welcome to Ditto" greeting — no error state, graceful degradation
- **Interaction states:**
  - Rich greeting: Self has frontdoor memories → contextual first message
  - Fallback greeting: No frontdoor memories → standard welcome (existing behavior)
  - No error state possible — memory loading failures are silent
- **Designer input:** Not invoked — conversational interaction only, Self generates the greeting from its context

## Acceptance Criteria

1. [ ] `persistLearnedContext(sessionId)` extracts `learned` fields from the chat session record
2. [ ] Each non-null learned field creates a separate memory with `scopeType: "person"`, `scopeId: personId`, `type: "user_model"`, `source: "conversation"`
3. [ ] Memory content is human-readable: "Business: Sarah's Plumbing", "Role: Owner", "Looking for: quoting automation", "Location: Melbourne", etc.
4. [ ] Deduplication: if a person already has a "Business:" memory, it's updated (not duplicated). If content is identical, skip the write entirely
5. [ ] `createWorkspaceMagicLink()` calls `persistLearnedContext()` before generating the link
6. [ ] If `persistLearnedContext` fails (no person record, DB error), magic link generation continues normally — failure is logged, not thrown
7. [ ] `loadSelfMemories(userId)` includes person-scoped memories where the person's email matches the workspace user's email
8. [ ] Person-scoped memories in Self context are rendered under "From your earlier conversation:" header
9. [ ] Person memory rendering is compact: all fields in ~120 tokens (well within 1000-token budget)
10. [ ] If no person record exists for the email, `loadSelfMemories` skips person memory loading gracefully (no crash, no error)
11. [ ] If no frontdoor session exists (direct signup), workspace greeting falls back to standard welcome
12. [ ] Memory bridge scoping: user A's frontdoor context is only visible to user A's workspace. Query uses exact email match on the authenticated user's email, not broad person search
13. [ ] New test: `persistLearnedContext` creates person-scoped memories from learned context (one per field)
14. [ ] New test: `persistLearnedContext` called twice with same data → no duplicate memories
15. [ ] New test: `persistLearnedContext` called with updated data → memory content updated, not duplicated
16. [ ] New test: `loadSelfMemories` returns person-scoped memories for matching email
17. [ ] New test: `loadSelfMemories` returns empty person memories when no person record exists (graceful)
18. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: memory scoping is correct (person-scoped, not self-scoped — person memories are reusable if the same person appears in multiple contexts), no cross-user leakage (exact email match), graceful fallbacks on all failure paths, token budget respected, magic link auth route not slowed down
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type-check
pnpm run type-check

# Run network-chat tests
pnpm vitest run src/engine/network-chat.test.ts

# Run self-context tests
pnpm vitest run src/engine/self-context.test.ts

# Verify memory creation
grep -n "persistLearnedContext" src/engine/network-chat.ts
grep -n "person" src/engine/self-context.ts | head -10

# Verify magic-link integration
grep -n "persistLearnedContext" src/engine/magic-link.ts
```

## After Completion

1. Update `docs/state.md` with MP-2.1 (audit complete) and MP-2.2 (bridge complete)
2. Update `docs/meta-process-roadmap.md` — mark MP-2.1 and MP-2.2 as done
3. Phase retrospective: does the greeting feel natural? Is the context sufficient? Do we need to also carry over the full conversation transcript (not just learned fields)?
