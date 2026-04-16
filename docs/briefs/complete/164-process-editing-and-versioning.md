# Brief 164: Process Editing — Permanent Edits, Version History, Scope Confirmation

**Date:** 2026-04-14
**Status:** draft
**Depends on:** none
**Unlocks:** User-driven process evolution through conversation

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-9.1 + MP-9.2 + MP-9.3)
- **Capabilities:** Permanent process edits via conversation, version history with rollback, scope confirmation UX

## Context

Currently `adapt_process` is run-scoped only (Brief 044) and `generate_process` creates new processes but can't edit existing ones. Users have no way to say "change this process permanently" through conversation. No version history exists for rollback.

## Objective

1. **MP-9.1:** Create `edit_process` tool (or extend `generate_process`) for permanent process definition updates.
2. **MP-9.2:** Store previous definitions on edit, support rollback to any prior version.
3. **MP-9.3:** Self asks "just this run, or all future runs?" and routes accordingly.

## Non-Goals

- Process migration (existing runs always use their original definition)
- Multi-user collaborative editing
- Visual process editor (conversation-driven only)

## Inputs

1. `src/engine/self-tools/generate-process.ts` — process creation
2. `src/engine/self-delegation.ts` — `adapt_process` tool
3. `src/db/schema/engine.ts` — processes table, `version` field
4. `docs/meta-process-roadmap.md` — MP-9.1, MP-9.2, MP-9.3 specs

## Constraints

- Running processes must be unaffected by edits (new runs only)
- Version history must be queryable (not just a counter)
- Scope confirmation must happen before any edit is applied

## Provenance

- `src/engine/self-tools/generate-process.ts` — existing process creation tool
- `src/engine/self-delegation.ts` — existing `adapt_process` run-scoped override
- Temporal workflow versioning — pattern for immutable version history with rollback
- Git version history — pattern for storing diffs/snapshots with metadata

## What Changes

| Path | Action | What |
|------|--------|------|
| `src/engine/self-tools/generate-process.ts` or new `edit-process.ts` | Create/Modify | Permanent edit tool for process definitions |
| `src/db/schema/engine.ts` | Modify | `process_versions` table or version history storage |
| `src/engine/self-delegation.ts` | Modify | Scope confirmation routing ("this run or all future?") |
| `src/engine/self.ts` | Modify | Disambiguation prompt and routing logic |

## User Experience

- **Jobs:** Define (edit process permanently), Decide (scope: this run vs all future)
- **Primitives:** conversation (edit via chat)
- **Scenario:** Process-owner says "Skip the follow-up step in my quoting process" → Self asks "Just this run, or all future runs?" → edit applied to chosen scope
- **Interaction states:** edit requested → scope confirmed → edit applied → version history viewable
- **Designer input:** Not invoked — conversational interaction only

## Engine Scope

Both — version history storage could be core; conversational edit routing is product

## Acceptance Criteria

### MP-9.1 — Permanent Process Edit
1. [ ] `edit_process` tool accepts process slug + changes (add/remove/modify steps, update quality criteria, change trust config)
2. [ ] Updates stored in `processes` table, `version` incremented
3. [ ] Edit summary shown to user: "Updated quoting v2 → v3: removed follow-up step"

### MP-9.2 — Version History
4. [ ] Previous definitions stored on edit (process_versions table or JSON array)
5. [ ] `process_history` queryable: list versions with timestamps and change summaries
6. [ ] Rollback supported: restore any prior version as current

### MP-9.3 — Scope Confirmation
7. [ ] Self asks "just this run, or all future runs?" before applying
8. [ ] "This run" → routes to existing `adapt_process` (run-scoped override)
9. [ ] "All future runs" → routes to `edit_process` (permanent)
10. [ ] Running processes unaffected by permanent edits

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "edit-process\|process.*version"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with completion status
2. Update `docs/roadmap.md` — MP-9.1, MP-9.2, MP-9.3 status
3. Run `/dev-documenter` for session wrap-up
