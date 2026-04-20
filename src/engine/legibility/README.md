# Legibility — `src/engine/legibility/`

Infrastructure for making Ditto's internal state observable, auditable, and
hookable by future features. Brief 198 introduces the first tenant: the
memory write chokepoint.

## Chokepoint purpose

Direct `db.insert(schema.memories)` / `.update(schema.memories)` /
`.delete(schema.memories)` calls used to be spread across ~8 files in
`src/engine/`. That made any cross-cutting concern — projection, observability,
event emission, stricter trust enforcement — fragile to add, because every
new consumer had to remember to update every call-site.

The chokepoint collapses those call-sites into a single module:

- `writeMemory(db, input, options?)` — insert a new memory; returns the inserted row
- `updateMemory(db, id, patch)` — patch an existing memory by id
- `deactivateMemory(db, id)` — soft-deactivate (set `active: false` + bump `updatedAt`)
- `deleteMemory(db, id)` — hard-remove a memory by id

Every non-test memory write in `src/engine/` now goes through this module. New
features that want to observe, instrument, or gate memory writes hook here —
not in the call-sites.

## Hook-surface convention for Brief 199 and beyond

The `writeMemory` helper takes an optional third parameter:

```ts
writeMemory(db, input, { skipProjection: true })
```

Brief 198 defines the surface but does **not** consume it. It is the
forward-compat reservation for Brief 199 (memories projection + safety
filter), which will wire the projection call **inside** `writeMemory` —
after the DB write returns and the trust gate has cleared. Callers that
need to opt out (bulk seed imports, internal migrations, etc.) will pass
`skipProjection: true`.

Future hooks — memory-write telemetry, event emission, multi-provider
sync — should attach to the same chokepoint. The convention is:

1. Add the hook **inside** `write-memory.ts`, not in call-sites.
2. Route opt-outs through the `options` parameter, not via new exported helpers.
3. Preserve the identity refactor property: call-sites never need to change
   when a hook is added.

## Test-file exemption

Test files (`*.test.ts`) are deliberately **exempt** from the chokepoint.

Rationale:

- Tests are asserting at the DB layer by design. A test that exercises the
  memory read path needs to insert fixture rows that bypass any hook wiring
  the chokepoint might acquire (projection, safety filters, event emission).
- Tests own their own setup. Forcing tests through the chokepoint they are
  exercising creates circular dependencies: the test for the projection hook
  cannot itself trigger the projection hook during setup.
- The `*.test.ts` convention is a clear, grep-able boundary. If a test file
  writes via the chokepoint helper, it is because the test is specifically
  exercising the helper (as `write-memory.test.ts` does), not because the
  test needs a fixture.

This exemption is documented inline in at least one exempted test file
(`src/engine/network-seed.test.ts`) as a reference pattern. New test files
that write memory rows should follow that convention.

## Insight-180 exemption

The chokepoint helpers do not accept a `stepRunId` argument, because they
have no external side effects — they are pure DB wrappers. Insight-180
requires the `stepRunId` guard for functions that publish, pay, dispatch
webhooks, or otherwise mutate external systems. This module does none of
those; the inline comment at the top of `write-memory.ts` records the
exemption.

If a future brief wires projection (Brief 199) or event emission into the
chokepoint that _does_ have external side effects, the guard becomes
required — propagate `stepRunId` through `WriteMemoryOptions` at that point.

## Provenance

Brief 198. The chokepoint-helper refactor pattern is original
Ditto-native — no external source captures this shape.
