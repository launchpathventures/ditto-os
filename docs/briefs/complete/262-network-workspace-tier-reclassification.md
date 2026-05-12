# Brief 262: Network/Workspace Tier Reclassification — `reviewPages`, `documents`, `documentContent`

**Date:** 2026-05-08
**Status:** draft
**Depends on:** ADR-048 (Network Tier Postgres Migration — Execution) accepted; ADR-036 §3 file-split prescription.
**Unlocks:** Brief 263 (Network Tier Postgres Migration). Brief 263 cannot ship until 262 reduces the network-tier surface from 11 tables to 8.
**Build position:** First sub-brief in the parent Brief 254 chain. Build order becomes: **262 → 263 → 255 → 256 ∥ 258 → 257 → 259 → 260 → 261**.

## Goal

- **Roadmap phase:** Phase 14 — Network Agent (infrastructure foundation; precedes Brief 263 and all other Phase 14 work)
- **Capability:** One integration seam — the schema barrel. Three workspace-tier tables (`reviewPages`, `documents`, `documentContent`) currently live in `src/db/schema/network.ts` by historical accident. Move them into the workspace-tier schema files where they semantically belong, and update all importers.

## Context

`src/db/schema/network.ts` declares 11 `sqliteTable` exports. Eight are genuinely network-tier (cross-tenant relationship graph, `networkUsers`, admin oversight, managed-workspace upgrade tracking). Three are workspace-tier and were placed in `network.ts` by accident:

- **`reviewPages`** (line 346) — tokenized review surfaces produced by the workspace harness for human review of agent output. Used by `src/engine/review-pages.test.ts`, `src/engine/harness-handlers/runner-pause.test.ts`, and `packages/web/app/api/test/seed-runner-pause/route.ts`. Every importer is workspace-side.
- **`documents`** (line 370) — knowledge-base document tracking (ingest source coordinates, content hash, format). Used by `src/engine/knowledge/ingest.ts` and `packages/web/app/api/knowledge/document/route.ts`. Every importer is workspace-side.
- **`documentContent`** (line 388) — parsed-markdown body for ingested documents. Used by the same workspace knowledge-base subsystem.

If these stay in `network.ts`, Brief 263 (Network Tier Postgres Migration) will sweep them into Postgres along with the genuine network tables. Migrating them to Postgres would corrupt the workspace harness: `review-pages` is a workspace harness primitive that lives in the same SQLite file as `processRuns`, and the knowledge base is a per-workspace store that depends on workspace-side processes. Postgres migration of these tables is wrong-shaped.

Reclassifying first preserves the workspace tier's terminal-SQLite invariant (ADR-036 §1), reduces Brief 263's scope to the genuine 8-table network subset, and prevents a class of runtime errors where a workspace harness operation tries to read a workspace-product table that is now in a remote Postgres DB.

## Objective

After Brief 262 ships:

- `src/db/schema/network.ts` declares **8 tables** (`people`, `interactions`, `networkUsers`, `adminFeedback`, `networkTokens`, `managedWorkspaces`, `upgradeHistory`, `upgradeWorkspaceResults`). It no longer declares `reviewPages`, `documents`, or `documentContent`.
- `reviewPages` is declared in a workspace-tier schema file (default: extend `src/db/schema/engine.ts` since `reviewPages` is a workspace harness primitive; implementer may choose `frontdoor.ts` or a new `harness.ts` if a stronger semantic case applies and is documented in the PR).
- `documents` and `documentContent` are declared in a workspace-tier schema file (default: a new `src/db/schema/knowledge.ts` since they are a self-contained knowledge-base cluster; implementer may choose `engine.ts` if collapse-into-engine is preferred — single file move, fewer barrel touches).
- All importers in `src/`, `packages/web/`, and `packages/core/` (if any) read the moved symbols from their new home. No importer imports from a stale path.
- `src/db/schema/index.ts` re-exports the moved symbols from their new home so that `import { reviewPages } from "@/db/schema"` (or equivalent path) continues to type-check.
- The `pnpm drizzle-kit generate` migration journal records **no schema change** for these three tables — column shapes and table names are byte-identical. The journal entry produced by the move is either zero migrations (if `drizzle-kit` correctly detects file-only moves) or a no-op migration that the implementer verifies adds and drops nothing.
- All affected tests (`review-pages.test.ts`, `runner-pause.test.ts`, `knowledge.test.ts`, `seed-runner-pause/route.ts`, etc.) pass without modification beyond import-path updates.
- Type-check passes.

## Non-Goals

- **No Postgres migration.** This brief stays entirely in SQLite. Brief 263 handles the dialect swap on the now-clean 8-table network subset.
- **No file split to `packages/core/`.** This brief reclassifies tables among workspace-tier schema files. The split of network schema into `packages/core/src/db/network/` happens in Brief 263.
- **No column-shape changes.** Tables move verbatim. NOT NULLs, defaults, indexes, FKs all preserved exactly. If `drizzle-kit generate` produces any non-trivial diff, treat it as a defect and reset.
- **No new abstractions.** No "knowledge service" wrapper, no review-pages service. The schema files are the only thing that changes; everything else is import-path adjustment.
- **No semantic redesign.** `reviewPages.userId` (text, no FK to `users` because workspace-tier has no users table — it's a single-user-per-workspace assumption) stays as it is. We do not fix legacy soft references in this brief.

## Inputs

1. `docs/adrs/036-database-tier-strategy.md` — defines the workspace-tier vs network-tier distinction this brief enforces.
2. `docs/adrs/048-network-postgres-migration-supabase.md` — explains why this reclassification must precede the Postgres migration.
3. `src/db/schema/network.ts` — current home of the three mis-tiered tables (lines 346, 370, 388).
4. `src/db/schema/engine.ts` — workspace harness primitives schema; potential new home for `reviewPages`.
5. `src/db/schema/index.ts` — schema barrel; needs re-export adjustment.
6. `src/engine/review-pages.test.ts` — exercises `reviewPages` directly; verifies move.
7. `src/engine/harness-handlers/runner-pause.test.ts` — uses `reviewPages` via mocked DB; verifies move.
8. `src/engine/knowledge/ingest.ts` — primary `documents`/`documentContent` writer.
9. `src/engine/knowledge/search.ts` — primary reader; cited but does not directly use Drizzle `from(documents)` (search uses FTS5; verify during implementation).
10. `packages/web/app/api/knowledge/document/route.ts` — reader; uses `schema.documents` and `schema.documentContent`.
11. `packages/web/app/api/test/seed-runner-pause/route.ts` — uses `schema.reviewPages`.
12. `docs/insights/190-migration-journal-concurrency.md` — Drizzle journal hygiene; applies to verification.

## Constraints

- **Single PR.** Schema move + import updates land together. A half-applied state is broken.
- **No column-shape drift.** `drizzle-kit generate` after the move must produce a no-op diff (zero changed columns / indexes). If it produces a non-zero diff, the move is wrong and must be redone.
- **Importers cut over completely.** Every `from "../db/schema/network"` (or equivalent) that referenced one of the three moved symbols must be updated. Verification grep at AC #6.
- **Schema barrel stays stable.** Code that imports via the schema barrel (`import { reviewPages } from "@/db/schema"`) continues to compile after the move because the barrel re-exports from the new home. Code that imports directly from `network.ts` for these three symbols must update its import path.
- **No Drizzle migration generated.** Moving a table declaration between schema files (when the table name and column shapes are unchanged) should produce zero migrations. If `drizzle-kit generate` records a migration, the implementer investigates: probably a column-type drift was introduced unintentionally; reset and try again. If a no-op migration is unavoidable due to journal-state quirks (Insight-190), the implementer accepts the no-op migration and notes it in the PR.
- **No new tests added.** This brief is structural cleanup; existing tests are sufficient to verify the move did not break behavior.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Workspace/network tier semantics | ADR-036 | Original | Parent ADR; this brief enforces §1 by removing workspace tables from network.ts |
| Pre-trigger Postgres execution rationale | ADR-048 | Original | Explains why reclassification must precede 263 |
| Schema-barrel re-export pattern | Existing `src/db/schema/index.ts` | Pattern | Consistency with the codebase's existing schema-barrel approach |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema/network.ts` | Modify: delete `reviewPages` (line 346), `documents` (line 370), `documentContent` (line 388) declarations and any associated `*Status` enum value tuples or type aliases that are exclusively used by the moved tables (`ReviewPageStatus`, `DocumentSource`, etc.; verify usage). The remaining file declares 8 tables. |
| `src/db/schema/engine.ts` (default for `reviewPages`) | Modify: add `reviewPages` declaration (verbatim from `network.ts`) plus its `reviewPageStatusValues` tuple and `ReviewPageStatus` type alias. Implementer may choose a different workspace-tier file with a documented rationale. |
| `src/db/schema/knowledge.ts` (new file, default for `documents` + `documentContent`) | Create: declares `documents`, `documentContent`, and any associated value tuples / type aliases (`DocumentSource`, etc.). Header comment documents the workspace-tier classification. Alternatively, implementer may collapse these into `engine.ts` with a rationale (one file, fewer barrel touches). |
| `src/db/schema/index.ts` | Modify: barrel re-exports the moved symbols from their new homes. The existing `export * from "./network"` (or analogous) shrinks to 8 symbols; new `export * from "./knowledge"` (if knowledge.ts created) is added. |
| `src/engine/knowledge/ingest.ts` | Modify (if needed): import path updates if the file imports from the network schema directly rather than via the barrel. Default import is via `schema.documents` (barrel); no change needed if so. |
| `src/engine/knowledge/search.ts` | Modify (if needed): same as ingest.ts. |
| `src/engine/review-pages.ts` (and any related runtime files) | Modify (if needed): import path updates as above. |
| `src/engine/review-pages.test.ts` | Modify (if needed): import path updates. |
| `src/engine/harness-handlers/runner-pause.test.ts` | Modify (if needed): import path updates (line 38 currently imports `reviewPages`; verify and update). |
| `packages/web/app/api/knowledge/document/route.ts` | Modify (if needed): import path updates if it imports directly from the network schema. |
| `packages/web/app/api/test/seed-runner-pause/route.ts` | Modify (if needed): import path updates. |
| `docs/state.md` | Updated by `/dev-documenter` post-approval; Architect's pre-build state.md update covers this brief's existence. |

## User Experience

This brief is below the user-visible surface. No UX work; no Layer 6 surfaces affected.

- **Jobs affected:** None. Indirectly: the workspace harness's review-pages flow and the workspace knowledge base continue to function identically — only their schema-file home moves.
- **Primitives involved:** None.
- **Process-owner perspective:** Tim does not see this; if the move corrupts a query, the user-visible failure is a workspace boot or a harness operation throwing — caught by tests.
- **Designer input:** Not required.

## Acceptance Criteria

1. [ ] **`network.ts` reduced to 8 tables.** `src/db/schema/network.ts` contains exactly 8 `sqliteTable` declarations: `people`, `interactions`, `networkUsers`, `adminFeedback`, `networkTokens`, `managedWorkspaces`, `upgradeHistory`, `upgradeWorkspaceResults`. Verification grep: `pnpm exec rg "^export const \\w+ = sqliteTable" src/db/schema/network.ts | wc -l` returns `8`.
2. [ ] **`reviewPages` lives in a workspace-tier file.** `pnpm exec rg "^export const reviewPages = sqliteTable" src/db/schema` returns exactly one match, in `engine.ts` (or another workspace-tier file the implementer chose). Zero matches in `network.ts`.
3. [ ] **`documents` and `documentContent` live in a workspace-tier file.** Same grep verification: each appears exactly once, in a workspace-tier file (default: `knowledge.ts`). Zero matches in `network.ts`.
4. [ ] **Schema barrel re-exports the moved symbols.** `src/db/schema/index.ts` exports `reviewPages`, `documents`, `documentContent` (transitively or directly) such that `import { reviewPages } from "@/db/schema"` (or the codebase's actual barrel path) continues to resolve.
5. [ ] **No column-shape drift.** `pnpm drizzle-kit generate` produces zero new migrations OR a single no-op migration with no `ALTER TABLE` / `CREATE TABLE` / `DROP TABLE` statements (only journal-state housekeeping). If a non-trivial migration is produced, the implementer treats it as a defect and re-does the move.
6. [ ] **All importers cut over.** `pnpm exec rg "from .*db/schema/network.*(reviewPages|documents|documentContent)" src packages` returns zero matches. The same grep against the new home file (e.g., `engine` or `knowledge`) returns the expected importer set.
7. [ ] **All affected tests pass.** `pnpm test src/engine/review-pages.test.ts src/engine/harness-handlers/runner-pause.test.ts` is green. `pnpm test` (full suite) is green.
8. [ ] **Type-check passes.** `pnpm run type-check` exits zero across the monorepo.
9. [ ] **`pnpm dev` boots cleanly.** Both `DITTO_DEPLOYMENT=public` and workspace-mode boots succeed. The workspace harness can read `reviewPages` and `documents` from the SQLite file.
10. [ ] **PR description documents the move and importer-update sweep.** Lists the new home(s) chosen, the rationale (if non-default), and the grep results for AC #2, #3, #6.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + ADR-036 + ADR-048 + this brief.
2. Review agent checks:
   - Tier classification: are the new homes semantically correct? (`reviewPages` to `engine.ts` is reasonable; `documents`+`documentContent` to a new `knowledge.ts` is clean.)
   - Move atomicity: every importer updated, no half-state.
   - No column drift: `drizzle-kit generate` produces no schema diff (or a documented no-op).
   - No new abstractions: this is a structural move, not a design change.
   - Workspace tier integrity: the moved tables are still SQLite, still in workspace-tier files, still part of the workspace `db` instance.
3. Present sub-brief + review findings to human.

## Smoke Test

```bash
pnpm install
pnpm run type-check                                    # PASS

# Verification: 8 tables in network.ts
pnpm exec rg "^export const \\w+ = sqliteTable" src/db/schema/network.ts | wc -l
# EXPECTED: 8

# Verification: moved symbols in workspace-tier files
pnpm exec rg "^export const reviewPages = sqliteTable" src/db/schema/
# EXPECTED: one match in engine.ts (or chosen workspace file)
pnpm exec rg "^export const documents = sqliteTable" src/db/schema/
# EXPECTED: one match in knowledge.ts (or chosen workspace file)
pnpm exec rg "^export const documentContent = sqliteTable" src/db/schema/
# EXPECTED: one match in same file as documents

# Verification: importers cut over
pnpm exec rg "from .*db/schema/network.*(reviewPages|documents|documentContent)" src packages
# EXPECTED: zero matches

# Schema diff: no migration produced
pnpm drizzle-kit generate
# EXPECTED: "No schema changes, nothing to migrate." OR a single no-op migration
ls drizzle/  # check that no new 00NN_*.sql with ALTER/CREATE/DROP appears

# Tests
pnpm test src/engine/review-pages.test.ts                 # PASS
pnpm test src/engine/harness-handlers/runner-pause.test.ts # PASS
pnpm test src/engine/knowledge/                            # PASS
pnpm test                                                   # PASS

# Boots
pnpm dev                            # workspace mode — workspace harness boots
DITTO_DEPLOYMENT=public pnpm dev    # public mode — front door boots
# Both boot without "table reviewPages does not exist" or "documents not found" errors

pnpm run type-check                # PASS
```

## After Completion

1. Update `docs/state.md` — Brief 262 complete; network tier surface reduced to 8 tables; Brief 263 unblocked.
2. The 8-table network surface is now ready for Brief 263's dialect swap. No further reclassification needed before Postgres migration.
3. Capture insight if the move surfaces a generalizable principle (likely candidate: "schema-file location is a tier declaration; treat it as load-bearing, not cosmetic" — defer until Brief 262 ships).

## Follow-up Considerations

- **Soft FK on `reviewPages.userId` and `reviewPages.personId`.** These are plain `text` columns with no FK constraint. They should reference `users` (workspace) and `people` (network) respectively, but the cross-tier reference to `people` is now a network-Postgres reference (post-263). This is fine — the constraint is application-layer per ADR-036 §3 — but the implementer should add a header comment in the new `reviewPages` declaration noting that `personId` is a soft cross-tier reference once 263 ships.
- **Knowledge base on workspace tier permanently?** Yes — knowledge is per-workspace data per ADR-036 §1's terminal-SQLite stance. If a future "shared knowledge" capability emerges, it lands as a separate network-tier table; the per-workspace `documents` table stays.
- **Insight-180 (stepRunId guard).** This brief introduces no new side-effecting functions; the constraint does not apply.
