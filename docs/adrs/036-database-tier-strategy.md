# ADR-036: Database Tier Strategy — SQLite-per-Workspace + Named Network→Postgres Threshold

**Date:** 2026-04-20
**Status:** proposed
**Extends:** ADR-001 (SQLite via Drizzle ORM for Storage) — does not supersede
**Related:** ADR-025 (Centralized Network Service), ADR-030 (Deployment Mode Flag)

## Context

ADR-001 chose SQLite for Ditto as the zero-setup dogfood substrate. That decision was right for the single-deployment Ditto-as-one-user-workspace era. The architecture has since evolved into a two-tier deployment:

- **Network tier** (centralized, serving many users) — shared relationship graph, Alex/Mira's inbox, nurture scheduler, `networkUsers`, admin routes, cross-tenancy RSI (ADR-033)
- **Workspace tier** (per-user) — Self, processes, memories, agents, work items; *"The Self is singular per user/workspace"* (architecture.md:744); **one user can have multiple workspaces** sharing one reputation score (Brief 193)

Both tiers currently co-inhabit a single SQLite file via a shared `src/db/schema/` tree. The open question logged at `architecture.md:1205` ("Multi-tenancy from day one? — Phase 10+ — Open") becomes acute when:

1. The Network tier grows past a handful of concurrent active users
2. ADR-033 multi-tenant RSI analytics (k-anonymity across tenants) runs real queries at scale
3. Users begin switching between multiple workspaces (Brief 193 assumes N-workspaces-per-user)

Paperclip (paperclipai/paperclip) ships multi-tenancy by putting *every* entity in one Postgres with row-level `company_id` scoping. This is the wrong shape for Ditto: it centralizes what we want portable and breaks filesystem-legibility.

## Decision

**Three sub-decisions, one coherent strategy.**

### 1. Workspace tier: SQLite-per-workspace. Permanent.

Each workspace is its own independent SQLite file in its own directory. Switching workspaces = selecting a different path. A workspace is a portable unit — `cp -r` is a backup; `rm -rf` is a tear-down. This preserves the filesystem-legibility principle (Insight-201: user-facing data layers default to filesystem legibility) and matches ADR-001's dogfood-era intent extended to per-workspace deployments.

- **Structure:** `~/.ditto/workspaces/<workspace-id>/ditto.db` (local) or a Railway volume subdirectory (hosted). Each workspace has its own Drizzle migration state.
- **Switching:** UI workspace switcher selects a file path. No row-filter; no tenant context leakage risk.
- **Scale model:** One human + their Self = single-writer. WAL mode handles the concurrent read load.
- **No migration path to Postgres for this tier.** This is the terminal shape.

### 2. Network tier: SQLite today. Postgres at a named threshold.

The Network tier is structurally multi-writer and multi-tenant. SQLite is correct while the deployment serves a small population; it stops being correct before the population reaches scale.

**Migration trigger — migrate Network to Postgres when ANY of these are true:**

1. `networkUsers` with `status='active'` reaches **≥ 50** rows on a single Network Service deployment, OR
2. Cross-tenancy RSI analytics (ADR-033 §2) begin executing against the Network DB in production (not scaffold), OR
3. Write-contention latency on the Network DB's primary write paths (`networkUsers`, activity, feedback) exceeds a p95 of **50ms** sustained over 24 hours

These are boolean-observable. The first to trip is the forcing function. Builder does not migrate speculatively; the ADR provides the blanket pre-authorization once any trigger fires.

**Named-trigger hygiene (Insight-200):**
- **Decision owner on trigger-fire:** Architect (same role that owns this ADR). Any human can observe the triggers; any human may flag; only the Architect may greenlight migration.
- **Decision artefact on trigger-fire:** a new ADR (ADR-NNN "Network Tier Postgres Migration — Execution") that *supersedes this ADR's §2 only* and specifies: (a) concrete Postgres host (self-hosted vs Neon vs Supabase), (b) FTS5 → tsvector migration plan, (c) cutover plan with zero-downtime posture, (d) rollback trigger. Does not re-open §1 or §3.
- **Observation cadence:** counted at each Dev-PM triage session. Trigger #1 is a single SQL query. Trigger #2 is observable via the RSI analytics ADR-033 production-ship gate. Trigger #3 requires basic DB-latency telemetry (which is itself worth standing up before Network user count reaches 10; note as a precondition).

**Migration shape when triggered:**
- Drizzle dialect swap (sqlite → pg). Schema already Drizzle-native.
- SQLite `FTS5` → Postgres `tsvector`/`tsquery` (concrete work; estimate ~1 sub-brief).
- Connection pool (pg-pool or Neon/Supabase serverless driver).
- SQLite-specific pragmas removed; replace with Postgres equivalents.
- Workspace tier is **not touched**.

### 3. Split the two tiers at the file level now, even before any migration.

Today the Network and Workspace schemas cohabit `src/db/schema/*.ts` and share one `better-sqlite3` connection. **Separate them now**, while both are still SQLite:

- Network tier → its own DB file (`./data/ditto-network.db`) with its own Drizzle migration tree (`drizzle/network/`)
- Workspace tier → `./data/ditto.db` (today's file) stays as workspace tier
- Two separate `Database(...)` instances, two separate migration runners
- Schema files move: `src/db/schema/network.ts` + related → `packages/core/src/db/network/` (or analogous); workspace schema stays in `src/db/schema/`

**Why now, pre-trigger:** when the Postgres migration fires, it should be a bounded, mechanical operation touching only the Network tier. Co-tenanted schemas would force a risky cross-tier migration under time pressure. Separating now costs ~1 sub-brief; separating later is a war-time migration.

**Build ownership:** this split is scoped into **Brief 202** (Hired-Agent Primitive: Schema + YAML + DB Mirror) as a co-travelling work item, because Brief 202 is already touching the workspace schema root and the natural cleave happens at the same commit. If the split grows beyond a single build session, spin it out as a dedicated Brief 207 with its own acceptance criteria. Not a standalone follow-up behind a trigger — this happens in the hire-agents phase.

## Provenance

- **Source project:** antfarm (https://github.com/snarktank/antfarm) via ADR-001 — SQLite + WAL + auto-create pattern
- **Source project:** Paperclip (https://github.com/paperclipai/paperclip) — studied as the reference two-tier system; their choice of Postgres-with-row-level-tenancy is explicitly rejected for Ditto
- **Named-threshold pattern:** Insight-200 (interface-seam-plus-named-trigger)
- **Filesystem-legibility principle:** Insight-201 (user-facing data layers default to filesystem legibility)
- **What's original to Ditto:** the SQLite-per-workspace-file model as a first-class tenancy primitive, and the separation of substrate (file-per-tenant) from application-layer tenancy logic. Paperclip puts tenancy in the data (FK on every row). Ditto puts tenancy in the filesystem (separate file per tenant).

## Consequences

### What becomes easier

- Workspace backup = copy a directory. Workspace transfer = ship a directory. Workspace deletion = `rm -rf`. All user-inspectable.
- Multi-workspace-per-user (Brief 193) requires no schema change — just a workspace switcher in the UI pointing at a different file.
- Network tier migration to Postgres, when it happens, is a single-tier surgical operation instead of a cross-tier minefield.
- The open architectural question at `architecture.md:1205` is closed with a concrete, observable, boolean trigger instead of remaining "Phase 10+ / Open."

### What becomes harder

- Writing code that joins Network and Workspace data now requires explicit cross-DB fetch (no SQL joins across DBs). This is a feature, not a bug — it enforces the deployment boundary (ADR-025) at the storage layer.
- Migrations run twice (once per DB) on local dev. Acceptable cost.

### New constraints

- No queries may join across the Network/Workspace boundary. Any logic that needs both sides must fetch each and combine in application code.
- Any new schema addition must be explicitly labeled "network" or "workspace" at file creation time. No ambiguous-tier tables.
- Every workspace-tier schema change must migrate cleanly on all existing workspace DBs on startup (not just the dev DB). Workspace-upgrader (`src/engine/workspace-upgrader.ts`) extends to cover multi-workspace scenarios.

### Follow-up decisions needed

- **Workspace switcher UX** — which composition intent owns it? (Designer question.)
- **Hosted-deployment workspace isolation** — how are multi-workspace users served on a single Railway instance? Directory-per-workspace under a user-scoped volume root is the natural answer; confirm during the hire-agents phase build.
- **When Postgres trigger fires** — write ADR-NNN as a supersedes of this ADR's §2 with the concrete Postgres choice (self-hosted vs Neon vs Supabase). Don't pre-decide.

### Explicitly rejected alternatives

- **PGlite everywhere** (Paperclip's local-dev fallback). Young project (2024), less battle-tested than SQLite for single-file workloads. Revisit in 2027 if maturity catches up.
- **Postgres everywhere now** (Paperclip's shape). Breaks filesystem-legibility. Imposes ops burden before it earns its keep. Wrong shape for Workspace tier permanently.
- **Single DB with logical separation via schema prefixes** (e.g., `network_*` and `workspace_*` tables in one file). Doesn't actually decouple the tiers; when Network needs Postgres, Workspace gets dragged along. Rejected.

## Relation to ADR-001

ADR-001 remains in force for the Workspace tier — same SQLite + WAL + Drizzle + auto-create pattern. This ADR **extends** it by:
- Introducing the Network tier as a separate DB file
- Naming the threshold at which Network migrates off SQLite
- Reframing SQLite's role from "dogfood choice with Postgres scale-out" to "permanent workspace substrate + temporary network substrate with defined migration trigger"

ADR-001's line *"PostgreSQL (scale) … remains the scale-out path"* is now specifically about the Network tier and is gated by the triggers in §2 above.
