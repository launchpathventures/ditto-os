# ADR-048: Network Tier Postgres Migration — Execution (Supabase Postgres)

**Date:** 2026-05-08
**Status:** proposed
**Supersedes-in-part:** ADR-036 §2 only (does not re-open §1 workspace tier or §3 file split — §3 is *executed* here as a co-traveling work item, not re-decided)
**Related:** ADR-001 (workspace tier SQLite — unaffected), ADR-025 (Centralized Network Service), ADR-033 (Network-scale RSI), ADR-036 (Database Tier Strategy — parent), ADR-030 (Deployment Mode Flag)

## Context

ADR-036 §2 codified a named-threshold migration framework for the Network tier: SQLite today, Postgres "when ANY of these are true" — (1) ≥50 active networkUsers, (2) ADR-033 RSI in production, (3) p95 write-contention >50ms sustained 24h. ADR-036 also explicitly required, on trigger-fire, a follow-up ADR specifying "(a) concrete Postgres host (self-hosted vs Neon vs Supabase), (b) FTS5 → tsvector migration plan, (c) cutover plan with zero-downtime posture, (d) rollback trigger."

This is that ADR.

It is being written **pre-trigger** rather than post-trigger. The decision-owner authority remains the Architect (per ADR-036 §2's "Named-trigger hygiene"); the human (Tim) flagged the migration request on 2026-05-08, in the context of decomposing parent Brief 254 (Network as Two-Sided Conversational Front Door) into seven implementation sub-briefs (255–261), six of which touch the network schema. The Architect's judgment: pre-trigger execution is the rational choice in this specific configuration. The "Why now" section below makes that case in writing rather than leaving it implicit.

## Decision

### (a) Concrete Postgres host: **Supabase Postgres**

Among the candidates ADR-036 §2 named (self-hosted vs Neon vs Supabase), Supabase Postgres is selected on these grounds:

- **Marginal infra cost approaches zero.** `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are already configured in `.env` because Ditto uses Supabase Storage for asset persistence (`src/engine/asset-storage.ts`). The same Supabase project surface, same auth, same dashboard. Adding Postgres is a connection string, not a new vendor.
- **Drizzle ORM has documented Supabase support.** The `drizzle-orm/postgres-js` driver is the official recommendation. No bespoke integration shape.
- **Managed Postgres ergonomics.** Backups, point-in-time recovery, connection pooling (PgBouncer / Supavisor), web SQL editor, monitoring — all included. Self-hosted Postgres on Railway would require us to stand up these capabilities ourselves.
- **Geographically co-located with Storage.** Same region as the asset bucket reduces cross-region latency for any Network code that joins a relational read with an object read.
- **Reversible.** If Supabase pricing or operational posture proves unsuitable, the dialect change is the durable cost; the host migration (Supabase → Neon, Supabase → self-hosted) becomes a connection-string swap plus credential rotation. The expensive part of the journey is the dialect change, which is host-agnostic.

Rejected alternatives:

- **Neon.** Excellent product but no existing wiring; we'd onboard a third managed-services vendor (Anthropic + Supabase + Neon) without a forcing reason.
- **Self-hosted Postgres on Railway.** Adds operational ownership for backups, monitoring, scaling, and pooling. Wrong shape for a small team optimizing for product velocity.
- **PGlite (Paperclip's local-dev fallback).** Already rejected in ADR-036 §3's "Explicitly rejected alternatives." Not revisited here.

### (b) FTS5 → tsvector migration plan: **N/A — zero FTS5 usage**

ADR-036 §2 named FTS5 → tsvector as a known migration cost ("estimate ~1 sub-brief"). Verified empirically on 2026-05-08: zero matches for `FTS5`, `fts5`, `tsvector`, or `virtual table` across `src/`, `packages/`, and `drizzle/` migration SQL. No full-text-search indexes exist in the network schema.

This collapses one of the larger anticipated migration costs. The migration is now a pure dialect swap.

If FTS is later needed in the network tier, it lands directly in Postgres `tsvector`/`tsquery` from the outset — no port required.

### (c) Cutover plan with zero-downtime posture: **Pre-launch empty-tables migration**

ADR-036 §2's "zero-downtime posture" requirement was framed for a post-trigger world where the network DB has live production rows and active users. That framing does not apply here.

The current network tier serves zero production users. `data/ditto.db` contains:

- The author's own workspace data (workspace tier — unchanged)
- Development fixtures and test data in network tables (network tier — discarded)

Cutover is therefore not a cutover at all in the traditional sense. The execution is sequenced into two sub-briefs that share the same integration seam:

1. **Brief 262** (Network/Workspace Tier Reclassification). Reduces the surface from 11 `sqliteTable` declarations in `src/db/schema/network.ts` down to 8 by moving 3 mis-tiered tables (`reviewPages`, `documents`, `documentContent`) into workspace-tier files. Schema-only structural cleanup; no dialect change; SQLite throughout.
2. **Brief 263** (Network Tier Postgres Migration). Lands the schema split (workspace SQLite stays in `src/db/schema/`; network moves to `packages/core/src/db/network/`) + dialect swap (`sqliteTable` → `pgTable`) + `networkDb` connection setup + boot-time `ensureNetworkSchema()` migrator + cutover of all importers as a single deploy.
3. On first deploy with the 263 code, `ensureNetworkSchema()` (wrapping `migrate()` from `drizzle-orm/postgres-js/migrator`) runs the network-tier migration tree against an empty Supabase Postgres database in the existing project.
4. Workspace tier (`data/ditto.db`) is untouched; SQLite stays terminal per ADR-036 §1.
5. Any dev-time network rows in the old `data/ditto.db` are abandoned. No row-level migration is required because no production data exists.
6. Subsequent sub-briefs (255 through 261) write against the new dialect from day one.

The downtime window for this cutover is: zero. There are no users on the old shape to disrupt.

### (d) Rollback trigger

The host-level rollback trigger fires if **any** of these conditions are true within the first 30 days following Brief 262 deploy:

1. **Sustained latency regression.** Supabase Postgres p95 query latency on the network tier's primary write paths (`networkUsers`, activity, feedback) exceeds the SQLite-baseline measurement by >100ms sustained over a 7-day rolling window.
2. **Vendor outage exceeds parity.** A Supabase outage on the project causes >1 hour of network-tier unavailability AND no comparable SQLite-platform outage occurred in the same 7-day window.
3. **Cost surprise.** Supabase Postgres unit costs at observed query volume exceed projected costs by >3x.

If any rollback trigger fires, the rollback path is:

- **Step 1:** Architect writes ADR-049 ("Network Postgres Host Migration — Rollback") naming a replacement (Neon / self-hosted / SQLite-restored). The dialect change is preserved; only the host changes.
- **Step 2:** Implementation sub-brief swaps the connection string and credential rotation. Drizzle migration tree applies against the new host.
- **Step 3:** If reverting to SQLite is selected (network volume turned out to be low), restore via re-running ADR-036 §2 in reverse — keep the schema-split file structure but switch the dialect back.

Rollback cost is bounded because we did not pay the FTS5 → tsvector port (none existed), and because the schema-split structure is host-agnostic.

The rollback trigger does **not** override the original ADR-036 §2 forward-migration triggers. If post-rollback the SQLite tier subsequently hits one of (≥50 active users / RSI in prod / p95 >50ms 24h), the migration runs again — to a different host this time.

## Why Now (Pre-Trigger Execution Rationale)

ADR-036 §2 was written to gate an unbounded operational cost (cross-vendor migration with live data) behind a forcing function (observed scale). The original framing was: "don't pre-decide the host while data shape and load are uncertain." That framing assumed:

1. Migration cost is non-trivial (it would be — schema port + cutover + monitoring + pooling).
2. The deferred decision avoided premature commitment to a host that might not fit.
3. Engineering bandwidth was elsewhere.

Three facts have shifted the trade-off as of 2026-05-08:

1. **Marginal cost has collapsed.** No FTS5 to port. No production data to migrate. Supabase already wired (Storage). The migration is a dialect swap + dual-connection plumbing — substantial but bounded to a single integration seam.
2. **Six of seven sub-briefs in flight (255–261) touch the network schema.** Designing them against SQLite knowing we'll dialect-swap soon is paying the schema-design cost twice. Designing them against Postgres from the outset is design-once.
3. **ADR-036 §3 (file split) was scoped into Brief 202 as a co-traveling work item but was not executed.** The hire-agents phase shipped without it. The split is overdue independent of dialect choice. Executing both §3 and §2 in one sub-brief is more coherent than executing §3 first, then §2 later — they touch the same code paths.

The pre-trigger execution is also defensible against the "what if scale never comes" objection. Even if the network tier serves only a handful of users for the foreseeable future, Supabase Postgres at low volume costs ~$0/month on the free tier and the small monthly cost on paid. The dialect swap is irreversible-at-low-cost, not irreversible-at-high-cost.

If the rollback triggers fire — meaning Supabase didn't pan out — we exit cheaply because the network tier still has no large production data set, and the dialect work was the durable investment.

This ADR therefore fires ADR-036 §2 pre-trigger with eyes open. The decision is sized to the actual cost, not the cost ADR-036 §2 anticipated when written.

## Provenance

- **Trigger framework:** ADR-036 §2 (named-threshold pattern, Insight-200)
- **File-split prescription:** ADR-036 §3 (executed here, originally scoped into Brief 202)
- **Drizzle Postgres dialect via postgres-js:** Drizzle ORM official documentation
- **Supabase project surface and Storage wiring:** ADR-031 (OAuth credential platform — used as deployment-config substrate); `src/engine/asset-storage.ts`
- **Pre-trigger architect-greenlight authority:** ADR-036 §2 "Named-trigger hygiene" — Architect owns the decision; this ADR documents the exercise of that authority

## Consequences

### What becomes easier

- Sub-briefs 255–261 design against final dialect from the outset; no Postgres-shaped retrofit later.
- Network tier and workspace tier are file-separated AND dialect-separated. No accidental cross-tier query (the shape of the API forces an explicit cross-DB fetch).
- ADR-036 §3's overdue file split lands in the same operation, with no second-touch cost.
- Schema-level Postgres features (JSONB, partial indexes, materialized views, advisory locks, LISTEN/NOTIFY) become available to the network tier whenever they earn their keep. Available, not required.
- Backups, point-in-time recovery, and SQL editor for the network tier are first-class via Supabase dashboard.

### What becomes harder

- Local dev now requires a Supabase Postgres connection string (or a local Postgres container per developer). One-time cost; documented in `.env.example`.
- Drizzle migration generation runs twice (once per dialect tree) on schema changes that touch both tiers — but because the file split is enforced, schema changes touch one tier at a time. The friction is real but small.
- The CLAUDE.md "Schema migrations" section (currently SQLite-only Drizzle journal guidance) extends to two journals. Documented in Brief 262 and the Documenter checkpoint.
- Test fixtures that depend on network tables now seed Postgres rather than in-memory SQLite. Either a Postgres test container OR a dev-only network-side SQLite fallback (deferred — not in v1; keep test-time complexity low by using a real test schema in Supabase or running tests against the local Postgres dev database).

### New constraints

- **No queries may join network and workspace tables in SQL.** Already implied by ADR-036 §3; now structurally enforced by dialect difference.
- **Network schema additions land in `packages/core/src/db/network/` only.** Workspace schema additions land in `src/db/schema/` only. Mixing is a typing error (different `pgTable`/`sqliteTable` factories).
- **Insight-190 (Drizzle journal concurrency) now applies to BOTH journals.** Each journal is independently subject to resequence-on-conflict. PR convention: name migrations to make tier obvious (`drizzle/_journal.json` for workspace, `drizzle/network/_journal.json` for network).
- **Connection pool for network tier required.** postgres-js handles pooling; default pool size sized to expected concurrent web request count; tuned in Brief 262.

### Follow-up decisions needed

- **Local-dev Postgres ergonomics.** Local Supabase via Supabase CLI vs developer-local Docker Postgres vs shared dev project. Decide in Brief 262 acceptance criteria.
- **Test-time Postgres.** Real test database vs containerized Postgres vs Postgres-flavored fakes. Decide in Brief 262.
- **Network-tier observability.** Latency telemetry to detect rollback-trigger #1 (p95 latency regression). Light first; instrument when load grows.

### Explicitly rejected alternatives

- **Defer until ADR-036 §2 trigger fires naturally.** Already addressed in §Why Now. The 6-out-of-7 in-flight sub-briefs and the unexecuted §3 file split tip the balance toward executing now.
- **Execute §3 file split now, defer §2 dialect swap.** Doing the split alone leaves us doing a second touch on the same files weeks later. Folding both into one sub-brief is cheaper.
- **Postgres without Supabase (Neon / self-hosted).** Addressed in §Decision (a). Could revisit if rollback trigger fires.

## Relation to ADR-036

ADR-036 §1 (workspace tier SQLite, terminal) — **unchanged.** This ADR does not touch the workspace tier.

ADR-036 §2 (network tier — SQLite today, Postgres at named threshold) — **superseded-in-part by this ADR.** The named-threshold framework is preserved as a pattern (rollback triggers in §(d) above use it); the §2-specific decision to run on SQLite-until-trigger-fires is replaced by "run on Supabase Postgres immediately, with rollback triggers if migration regrets emerge."

ADR-036 §3 (split network from workspace at the file level now) — **execution timing finalized.** ADR-036 §3 said the split happens via Brief 202 co-traveling. That did not happen. This ADR's implementation chain executes the §3 split via Brief 263 as a co-traveling work item to the §2 dialect swap, with Brief 262 first reducing the network-tier surface from 11 tables to 8 by reclassifying mis-tiered tables. §3's design decision is unchanged; only the timing and pre-step are revised.

ADR-036 §3's "build ownership" line is therefore amended to: "executed via Brief 263 (alongside the §2 dialect swap), preceded by Brief 262 (tier reclassification)."

## Acceptance Criteria for ADR Acceptance

This ADR is "accepted" when:

1. [ ] Brief 262 (Network/Workspace Tier Reclassification) is written, fresh-context Reviewed, and human-approved.
2. [ ] Brief 263 (Network Tier Postgres Migration — Schema Split + Supabase Cutover) is written, fresh-context Reviewed, and human-approved.
3. [ ] ADR-036 status header is updated: §2 marked as superseded-in-part by this ADR; §3 marked as executed via Brief 263 (preceded by Brief 262 reclassification).
4. [ ] Sub-briefs 255–261 are spot-checked for any references to the SQLite-only network DB shape (none expected; lightweight pass).
5. [ ] `docs/architecture.md` lines 1133, 1145, and 1215 are updated to reflect dual-tier dialect (executed in Brief 263 AC #14).
6. [ ] This ADR's status is moved from `proposed` to `accepted` in the same commit that ships Brief 263.
