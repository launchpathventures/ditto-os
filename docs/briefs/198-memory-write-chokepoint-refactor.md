# Brief 198: Memory Write Chokepoint Refactor

**Date:** 2026-04-20
**Status:** in_progress
**PR:** https://github.com/launchpathventures/ditto-os/pull/33
**Depends on:** none (pure refactor of existing code)
**Unlocks:** Brief 199 (memories projection + safety filter), plus any future memory-related observability, trust-gate instrumentation, or event-emission work

## Goal

- **Roadmap phase:** Phase 9+ (legibility — infrastructure)
- **Capabilities delivered:**
  - Single chokepoint for all memory writes across the Ditto codebase
  - Future features (projection, observability, event emission, stricter trust enforcement) have exactly one place to attach — no 16-call-site migrations
  - Testability improves: one mock point instead of per-file DB-insert mocking

## Context

Reviewer finding on Brief 199 (the projection work): the current Ditto codebase has **16 files** that touch memory writes directly via `db.insert(schema.memories)`, `.update(memories)`, or `.delete(memories)` — 8 non-test files and 8 tests. Of the 8 non-test files: `src/engine/user-model.ts`, `src/engine/system-agents/knowledge-extractor.ts`, `src/engine/self-context.ts`, `src/engine/people.ts`, `src/engine/network-seed.ts`, `src/engine/memory-bridge.ts`, `src/engine/inbound-email.ts`, `src/engine/harness-handlers/feedback-recorder.ts`.

Brief 199's projection hook needs a single attachment point — hooking into 8 call-sites individually would be fragile, easy to miss in future work, and would force every future feature touching memory writes to remember to trigger projection.

This brief introduces a single `writeMemory()` helper in `src/engine/legibility/` and migrates all non-test call-sites. The test files keep raw DB writes intentionally (they are testing at the DB layer by design). The refactor earns its keep independent of legibility — **any** future work that wants to observe, instrument, or gate memory writes (feedback emission, metacognitive signal capture, audit-trail improvements, multi-provider memory sync) now has exactly one place to hook.

## Objective

Replace every direct `db.insert/update/delete(schema.memories)` call in `src/engine/` (non-test files only) with a call to a new `writeMemory()` helper in `src/engine/legibility/write-memory.ts`. Zero behavior change; all existing tests pass unchanged. The helper is the attachment surface for Brief 199 and future hooks.

## Non-Goals

- **No projection work.** That's Brief 199. This brief adds no filesystem writes, no safety filter, no git.
- **No git server.** That's Brief 200.
- **No schema changes.** `drizzle/meta/_journal.json` unchanged. No new tables, columns, or indexes.
- **No new memory types, scopes, or sources.** Schema enums (lines 126-142 of `packages/core/src/db/schema.ts`) unchanged.
- **No test-file migration.** Test files are exempt — they are testing DB-level behaviour by design. Exemption documented inline.
- **No behaviour change.** This is an identity refactor. Every existing memory test passes unchanged. Any behaviour change is a defect.
- **No new observability in this brief.** The helper is a pass-through; instrumenting it is a follow-on (example future brief: "add memory-write telemetry" which would land in the helper, not the call-sites).

## Inputs

1. `docs/briefs/197-user-facing-legibility-phase.md` — parent brief; this sub-brief inherits shared constraints but most apply to 199 (projection) not this one
2. `packages/core/src/db/schema.ts` lines 126-142 (enums), 432-457 (memories table) — the read contract; unchanged by this brief
3. `src/engine/memory-bridge.ts` — existing memory-write example; frontdoor-specific but shows the standard shape
4. The 8 non-test files listed in Context — understand their memory-write patterns before migrating
5. Insight-004 (brief sizing) — this brief is small on purpose

## Constraints

- **Pure refactor.** No behaviour change. No new memory fields read or written. No re-ordering of fields.
- **Engine-core boundary.** The helper lives in `src/engine/legibility/`, not `packages/core/`. Imports `schema` from core but does not modify core.
- **Test file exemption.** Test files in the 16-file list keep their raw DB writes; the exemption is documented both in `src/engine/legibility/README.md` and as an inline comment in at least one exempted test file as a pattern reference.
- **Insight-180 exemption.** The helper has no external side effects (wraps DB ops only). Inline comment at top of the helper documents: `// stepRunId not required: pure DB wrapper, no external side effects`.
- **Helper surface matches existing shape exactly.** `writeMemory` mirrors `db.insert(schema.memories).values(...)`; `updateMemory` mirrors `db.update(schema.memories).set(...).where(...)`; no hidden magic. Callers should not need to change how they think about memory writes.
- **Forward-compat for Brief 199.** The helper's signature accepts optional hook context (e.g., reserved field for `{ skipProjection?: boolean }`) — but 199 will populate this. 198 ships the helper without hook wiring.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| Chokepoint-helper refactor pattern | Original (Ditto-standard refactor shape; compare existing `src/engine/` patterns for typed query wrappers) | original | Refactoring style is Ditto-native; no external pattern to credit |
| Test-exemption discipline | Ditto test conventions (`src/engine/*.test.ts` conventions) | pattern (self-reuse) | Existing convention: tests may write to DB directly for setup |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/legibility/write-memory.ts` | Create: exports `writeMemory(db, memoryInput)`, `updateMemory(db, id, patch)`, `deactivateMemory(db, id)`, `deleteMemory(db, id)` |
| `src/engine/legibility/write-memory.test.ts` | Create: unit tests covering insert, update, deactivate, delete; verifies the helper preserves all schema semantics |
| `src/engine/legibility/README.md` | Create: explains the chokepoint purpose; lists hook-surface conventions; documents the test-file exemption rationale; cites Brief 198 |
| `src/engine/user-model.ts` | Modify: migrate **4** memory-write call-sites to use `writeMemory` / `updateMemory` / `deactivateMemory` |
| `src/engine/system-agents/knowledge-extractor.ts` | Modify: migrate **5** memory-write call-sites |
| `src/engine/self-context.ts` | Modify: migrate **2** memory-write call-sites |
| `src/engine/people.ts` | Modify: migrate **1** memory-write call-site |
| `src/engine/network-seed.ts` | Modify: migrate **1** memory-write call-site |
| `src/engine/memory-bridge.ts` | Modify: migrate **2** memory-write call-sites |
| `src/engine/inbound-email.ts` | Modify: migrate **1** memory-write call-site |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: migrate **6** memory-write call-sites |

**Total migrations: 22 call-sites across 8 files** (counts as of 2026-04-20 reviewer audit; verify again before build since parallel sessions may have touched these files).

**Test files** (`*.test.ts`) in the 16-file list are **NOT** migrated; they keep raw DB writes by design.

**No changes to `packages/core/`.**

## User Experience

- **Jobs affected:** none. This is an invisible infrastructure refactor.
- **Primitives involved:** none.
- **Process-owner perspective:** zero user-visible change. Every existing feature works identically. The user never observes this brief's effect.
- **Interaction states:** N/A.
- **Designer input:** not invoked — pure infrastructure refactor has no UX surface.

## Acceptance Criteria

1. [ ] `src/engine/legibility/write-memory.ts` exists and exports `writeMemory(db, memoryInput)`, `updateMemory(db, id, patch)`, `deactivateMemory(db, id)`, `deleteMemory(db, id)`.
2. [ ] Helper signatures match the inferred shape of the schema: `writeMemory` accepts the same field set as `db.insert(schema.memories).values(...)` (including optional fields); return type is the inserted memory row.
3. [ ] `grep -rn "db\.insert(schema\.memories\b\|\.update(schema\.memories\b\|\.delete(schema\.memories\b" src/engine/ --include='*.ts' --exclude='*.test.ts'` returns **zero matches**. Patterns are anchored to `schema.memories` specifically so unrelated writes (e.g., `db.update(schema.trust).where(eq(..., memories.id))`) are not false-positives.
4. [ ] All 8 non-test files listed in §Work Products have been migrated; each file's memory-write call-sites use the helper.
5. [ ] `pnpm run type-check` passes at root with zero errors.
6. [ ] Entire test suite (`pnpm test`) passes; no existing memory test regresses. Specifically: `src/engine/*memor*` tests + `src/engine/system-agents/knowledge-extractor.test.ts` + `src/engine/harness-handlers/feedback-recorder.test.ts` all green.
7. [ ] `src/engine/legibility/write-memory.test.ts` contains unit tests covering: insert (new memory), update (patch existing), deactivate (set `active: false`), delete (hard remove).
8. [ ] `src/engine/legibility/README.md` documents (a) the chokepoint purpose, (b) the test-file exemption rationale, (c) the hook-surface convention for Brief 199+ (where future observers attach).
9. [ ] The helper file begins with an inline comment: `// stepRunId not required: pure DB wrapper, no external side effects (Insight-180 exemption)`.
10. [ ] Engine-core boundary check: `git diff --stat main..HEAD | grep packages/core` returns zero hits. No new imports from `src/` into `packages/core/` were added.
11. [ ] `drizzle/meta/_journal.json` unchanged. No schema migration produced by this brief.
12. [ ] The helper signature includes a forward-compat reserved parameter (e.g., `options?: { skipProjection?: boolean }`) with the `skipProjection` default of `false` documented in `write-memory.ts` as Brief 199's hook surface. 198 does NOT wire a projection call; 199 does.

## Review Process

1. Spawn fresh-context Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, parent Brief 197, and this brief
2. Reviewer verifies: (a) pure refactor — zero behaviour change in call-sites; (b) helper signatures match existing call-site shapes; (c) no test regressions; (d) engine-core boundary clean; (e) test-file exemption documented, not just implemented silently; (f) forward-compat reserved parameter for Brief 199 is present but dormant
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run the full test suite — nothing regresses
pnpm test
# Expect: all existing memory tests pass

# 2. Run type-check
pnpm run type-check
# Expect: 0 errors

# 3. Grep confirms zero direct DB writes in non-test files
grep -n "db\.insert.*schema\.memories" src/engine/ -r --include='*.ts' --exclude='*.test.ts'
# Expect: no matches
grep -n "\.update\(.*memories\b\|\.delete\(.*memories\b" src/engine/ -r --include='*.ts' --exclude='*.test.ts'
# Expect: no matches

# 4. Engine-core boundary
git diff --stat main..HEAD | grep 'packages/core'
# Expect: empty

# 5. End-to-end: start Ditto, create a memory via conversation, verify DB row
pnpm dev
# In chat: "Remember that I prefer terse responses"
# Expect: DB row created via the helper; visible in sqlite inspection
```

## After Completion

1. Update `docs/state.md` with: helper created, 8 call-sites migrated, Brief 199 now unblocked
2. No roadmap status change (this is prerequisite infrastructure)
3. No retrospective this session; retro lands with the pilot once 198+199+200 all ship
4. Flag to Builder of Brief 199: the hook point is `options.skipProjection` in `writeMemory`; default false; 199 wires the projection call inside the helper, AFTER the DB write returns and trust gate has cleared
