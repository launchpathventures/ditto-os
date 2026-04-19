# src/engine/legibility/

Infrastructure for the user-facing legibility phase (Brief 197). Today this directory
hosts a single helper, `write-memory.ts` — the chokepoint for memory-table mutations.

## `write-memory.ts` — memory write chokepoint (Brief 198)

Every non-test writer of `schema.memories` in `src/engine/` goes through this module:

- `writeMemory(db, input, options?)` — insert, returns the inserted row
- `updateMemory(db, id, patch, options?)` — patch fields; stamps `updatedAt` by default
- `deactivateMemory(db, id, options?)` — soft delete (sets `active: false`)
- `deleteMemory(db, id, options?)` — hard delete

### Why the chokepoint exists

Before Brief 198, 21 call-sites in 8 non-test engine files wrote to `schema.memories`
directly via `db.insert` / `db.update`. Any future feature that wants to observe,
instrument, or gate memory writes (Brief 199 projection, telemetry, feedback
emission, stricter trust enforcement) would have had to modify all 21 call-sites
and remember to extend every future call-site too.

After Brief 198, that attachment surface is one file. New hooks land inside these
helpers; callers keep their current shape.

### Hook-surface convention

The final parameter of every helper is `options?: WriteMemoryOptions`. Brief 198
ignores it — the helpers are pure pass-throughs. Brief 199 will populate the first
flag (`skipProjection`) to suppress projection for internal bookkeeping writes.

Future hooks should:

1. Extend `WriteMemoryOptions` with the new flag, default `false` (opt-in).
2. Implement the hook **after** the DB mutation returns, so a failed hook
   doesn't roll back the write unless explicitly intended.
3. Document the flag here so the attachment contract stays discoverable.

### Test-file exemption

Test files under `src/engine/**/*.test.ts` keep their raw `db.insert(schema.memories)`
calls. They are testing at the DB layer by design — setup fixtures, seeded
reinforcement counts, explicit confidence boundaries — and routing those through
the chokepoint would couple test setup to whichever projection / observability
hook is active. Brief 199's projection hook is expected to be a no-op in tests
that don't configure it, but the exemption keeps tests honest about what layer
they are exercising.

The exemption is grep-verifiable:

```bash
grep -rn "db\.insert(schema\.memories\|\.update(schema\.memories\|\.delete(schema\.memories)" \
  src/engine/ --include='*.ts' --exclude='*.test.ts'
# Expect: no matches
```

### Insight-180 exemption

The helpers wrap DB operations only — no network, no filesystem, no external
process — so the `stepRunId` invocation guard Insight-180 mandates for
side-effecting functions does not apply. The file header documents this
exemption inline so a future reviewer doesn't have to re-derive it.
