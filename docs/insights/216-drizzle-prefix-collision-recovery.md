# Insight-216: Drizzle Migration Prefix Collision — Rename, Don't Renumber

**Date:** 2026-04-27
**Trigger:** Brief 227 schema migration step — drizzle-kit generated `0015_broad_onslaught.sql` even though Brief 225's `0015_keen_nicolaos.sql` already existed at journal idx=14. drizzle-kit names new files using `journal.length` (off-by-one with `idx` after the journal had been renumbered earlier in the project).
**Layers affected:** L1 Process (migration tooling)
**Status:** active (extends Insight-190)

## The Insight

Insight-190 documents that `drizzle/meta/_journal.json` is a concurrency bottleneck and that conflicting `idx` values must be resequenced on merge. It does NOT cover the case where parallel sessions produce **filename-prefix collisions** even when `idx` values are unique:

- Journal idx=14 → tag `0015_keen_nicolaos` (Brief 225, already untracked)
- Builder runs `drizzle-kit generate` → creates idx=15 with auto-generated tag `0015_broad_onslaught` (drizzle-kit picks the prefix from `journal.length` — 15 entries → prefix 0015 — without checking existing tag prefixes)

The journal is internally consistent (idx values 14 and 15 are unique). But TWO files share the `0015_*.sql` prefix, and drizzle-kit's snapshot generator overwrote `0015_snapshot.json` (Brief 225's idx=14 snapshot) with the new cumulative state.

**The fix that ships in Brief 227:** rename the new SQL file + snapshot to use the next non-colliding prefix (`0016_broad_onslaught.sql` + `0016_snapshot.json`), update the journal entry's `tag` field to match, accept the orphan'd snapshot for idx=14 (drizzle-kit reads only the latest snapshot for diff generation, so future generates work correctly).

## Implications

- **Don't renumber `idx` to fix prefix collisions.** Insight-190 says "resequence idx on merge conflicts" — that's for `idx` collisions specifically. For prefix collisions where `idx` values are already unique, **rename only the filename + tag**, leave `idx` alone.
- **Recovery procedure:**
  1. `mv drizzle/<COLLIDING>.sql drizzle/<NEXT-FREE-PREFIX>.sql`
  2. `mv drizzle/meta/<COLLIDING>_snapshot.json drizzle/meta/<NEXT-FREE-PREFIX>_snapshot.json`
  3. Edit `drizzle/meta/_journal.json` — change the `tag` field of your entry to the new filename (without `.sql`)
  4. Accept that the snapshot for the prior-conflicting `idx` is orphaned (the file at the conflicting prefix used to belong to it). Future drizzle-kit generates use the latest snapshot; the orphan is cosmetic.
- **Detection signal:** after `drizzle-kit generate`, `ls drizzle/<NNNN>_*.sql | wc -l` should show exactly one file per prefix. If two files share a prefix, recovery is required.
- **Why drizzle-kit produces this:** drizzle-kit names new SQL files by counting existing journal entries (`prefix = pad(journal.length)`) — not by inspecting the highest existing tag prefix. This breaks down whenever the journal's `idx` and the file-prefix counters drift out of alignment (which they did in this repo around idx=11-14 — see existing journal entries: idx=0 → tag `0000_*`, idx=1 → tag `0002_*`, etc.).

## Where It Should Land

Two candidate destinations:

1. **Insight-190 amendment** — extend the existing migration-journal-as-concurrency-bottleneck insight with the prefix-collision-recovery procedure.
2. **`docs/dev-process.md` migration discipline section** — practical recipe for builders.

Architect's call on which form lands. Until then, Brief 227's recovery is the canonical example: see `drizzle/_journal.json` idx=15 + `drizzle/0016_broad_onslaught.sql` (the rename target).
