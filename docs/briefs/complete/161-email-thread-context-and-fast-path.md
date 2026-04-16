# Brief 161: Email Thread Context + Question Fast-Path

**Date:** 2026-04-14
**Status:** complete
**Depends on:** Brief 146 (MP-6.1 reply classification — complete)
**Unlocks:** Faster, more contextual email responses

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-6.2 + MP-6.5)
- **Capabilities:** Reply responses maintain conversational thread context; direct questions get fast responses

## Context

Inbound email classification (Brief 146) now handles 5 categories. Two gaps remain:

1. **MP-6.2 Thread context injection:** When processing a reply, the response should reference the original outreach naturally. Currently each reply may start fresh without thread awareness.
2. **MP-6.5 Question fast-path:** When reply is a direct question ("What's your pricing?"), it should route to Self with thread context for conversational response — skipping the full process pipeline for speed.

## Objective

1. Load original outreach content and prior thread as context for reply response generation.
2. Route direct questions to Self for fast conversational response (< 5 min target).

## Non-Goals

- Changing classification logic (Brief 146 handles that)
- Building a full email client UI

## Inputs

1. `src/engine/inbound-email.ts` — reply handling, classification
2. `src/engine/channel.ts` — email threading via `email_thread` metadata
3. `src/engine/self.ts` — `selfConverse()` for conversational responses
4. `docs/meta-process-roadmap.md` — MP-6.2, MP-6.5 specs

## Constraints

- Thread context must be loaded from existing `email_thread` metadata and interaction history
- Question fast-path must still go through outbound quality gate
- Thread context injection must not exceed reasonable token budgets

## Provenance

- `src/engine/inbound-email.ts` — existing reply handling and classification
- `src/engine/channel.ts` — existing email threading via `email_thread` metadata
- `src/engine/self.ts` — existing `selfConverse()` for conversational responses
- Outbound quality gate — existing send path

## What Changes

| File | Action | What |
|------|--------|------|
| `src/engine/inbound-email.ts` | Modify | Thread context loading on reply, question routing to Self |
| `src/engine/channel.ts` | Modify | Thread history query for prior messages |
| `src/engine/self.ts` | Modify | Accept thread context for fast-path responses |

## User Experience

- **Jobs:** None directly user-facing (improves email recipient experience)
- **Process-owner:** Replies to Alex's emails get contextual, fast responses
- **Designer input:** Not invoked — email content, not UI

## Engine Scope

Product (email handling is Ditto-specific)

## Acceptance Criteria

### MP-6.2 — Thread Context Injection
1. [ ] When processing a reply, original outreach content loaded from interaction history
2. [ ] Prior thread messages loaded and included in response generation context
3. [ ] Response references the original outreach naturally (Alex doesn't repeat the intro)
4. [ ] Token budget enforced on thread context (configurable, reasonable default)

### MP-6.5 — Question Fast-Path
5. [ ] Replies classified as "question" route to Self with thread context
6. [ ] Self generates conversational response (skips full process pipeline)
7. [ ] Response goes through outbound quality gate before sending
8. [ ] Response latency significantly lower than full pipeline path
9. [ ] Thread context included so response is contextually aware

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "inbound-email\|thread-context"
pnpm run type-check
```

## After Completion

1. Run `/dev-documenter` to update `docs/state.md` and `docs/roadmap.md`
2. Mark MP-6.2 and MP-6.5 complete in `docs/meta-process-roadmap.md`
