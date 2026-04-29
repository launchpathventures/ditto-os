# Insight-201: User-facing data seams default to filesystem-like legibility

**Date:** 2026-04-20
**Trigger:** Follow-on from the `hilash/cabinet` triage (2026-04-20 `/dev-architect` scout of three external repos). Cabinet itself passed adoption triage — it is a competing product shape, not an extractable library. But the user named the specific design property that drew them to it: *"the file system like approach — makes it easy and transparent for a user to dive into things."* That property is load-bearing for trust and ownership in Ditto, not a cabinet-specific quirk, and the insight generalises beyond that one repo.
**Layers affected:** L5 Learning (memories are a primary target), L6 Human (the inspection surface), L3 Harness (DB schema sits upstream of whatever projection is built)
**Status:** active

## The Insight

At **user-facing** data seams, the default representation is filesystem-like — markdown (or other legible text) on disk, grep-able, inspectable, and ideally git-trackable. DB-opacity is the exception that must justify itself, not the default to accept.

Ditto already follows this at the architectural surfaces that worked out well: briefs, ADRs, insights, process definitions (YAML), the dictionary, the changelog. These are files the user can open, grep, diff, and edit. Architecture.md §Layer 5 #6 (brief lifecycle sync — file-as-primary, DB-as-index) is the precedent: the pattern is proven in Ditto, just not yet generalised. The places where Ditto currently fails the property fall into two buckets with very different implementation costs:

- **User-facing runtime state** (`memories`, `activities`, `feedback`, `improvements`, `work_items`, `process_versions`, briefing outputs) — the data lives in SQLite tables and is opaque to the user. Projection is sufficient; no canonicalisation prerequisite.
- **"What Ditto did on my behalf"** — the **outbound communications** it sent (emails, DMs, posts), the **inbound communications** it received and processed, and the **generated artefacts** it produced (quotes, invoices, reports, content drafts). These are the highest persona-pain surface — Rob's *"did you actually send that?"* anxiety, Lisa's *"what went out this week?"*, Jordan's audit-trail demand, Nadia's team-output review. But here the gap is deeper than projection: **these artefacts are not currently canonicalised as retrievable discrete things**. Outbound content summaries live in `outbound_actions`; full bodies are scattered across `step_runs` output JSON blobs and integration-broker logs. Generated artefacts are composed as ContentBlocks in-flight and not persisted. Inbound comms are strewn across `activities` and broker archives. Before any of this can be projected to files, it must first be canonicalised — and that is net-new architectural work, not just a projection pass.

This two-bucket distinction is load-bearing for scoping: a brief applying this insight to Category 4 (internal state) is small; a brief applying it to Categories 1–3 (outbound / inbound / generated) owns an artefact-canonicalisation prerequisite and is substantially larger. See §Implications #4 for the full category breakdown.

The distinction that matters is **user-facing vs. harness-internal**. `process_runs`, `step_runs`, `schedules`, `harness_decisions`, `delayed_runs`, `outbound_actions`, and the `credentials` store are harness internals — DB-opacity is appropriate there (and for credentials, required). The principle in this insight applies only to surfaces the user has reason to inspect, own, or take offline. "Could a reasonable user want to grep this?" is the test. The `trust_changes` and `trust_suggestions` tables are borderline: the raw log is harness-internal, but the user-facing trust history (Rob's trust arc per `docs/personas.md`; Trust Control per `docs/human-layer.md` §Layer 6) likely warrants a projection — decided per-brief, not foreclosed here.

This insight is **not** Insight-200 (named-trigger parking). Insight-200 defers a capability-gating decision behind observable triggers. This insight elevates a **principle** that should be consulted whenever a brief touches a user-facing data seam — each application is its own decision moment, but the default posture is known.

## Implications

**For Architects designing any brief that introduces, modifies, or exposes user-facing state:**

1. **Default to file-backed or file-projected.** If the brief proposes DB-only storage for a user-facing surface, it must contain an explicit paragraph arguing why — not the other way around.
2. **Three implementation patterns in increasing conviction:**
   - **Read-only filesystem projection** — DB remains authoritative; a periodic or per-write export materialises markdown on disk (cabinet-style git auto-commit is the archetype). Low risk. Most briefs should ship this first.
   - **Bi-directional sync** — user edits on disk reconcile back into the DB. Medium risk. Requires conflict resolution and a stance on whether the file or the DB wins during divergence.
   - **File-as-primary-store** — the markdown on disk IS the source of truth; the DB is an index or cache. High conviction, matches how briefs/ADRs/insights already work. Ship this only when the DB gives up little (e.g., no cross-table joins, no transactional invariants).
3. **Tradeoffs that must be named in any applying brief** (not hand-waved):
   - **Trust-tier enforcement integrity.** A file edit that bypasses the DB write path bypasses three downstream mechanisms that depend on the write-path hook: (i) ADR-019 trust-tier gates at the write boundary, (ii) content-block trust severity classification, (iii) knowledge-extraction / feedback capture per `docs/architecture.md` §Layer 5 #7 (significant corrections fire feedback events). Either all three move to an FS-watch layer or the pattern is wrong for that seam — do not hand-wave.
   - Typed queries, joins, transactional integrity — if the read path needs structured queries across tables, projection-only (not file-as-primary) is the right shape.
   - **Secret / PII leakage — MUST NOT.** Tier 2+ credentials, OAuth tokens, access keys, session cookies, refresh tokens, and per-recipient PII (email addresses, phone numbers, names tied to specific individuals other than the workspace owner) **MUST NOT** be included in any filesystem projection under any circumstance. Encryption-at-rest is not a valid escape hatch — file-level projection creates exfiltration paths that DB-level access controls do not. Projection logic must filter or exclude these fields at the projection boundary; an applying brief that cannot guarantee the filter is correct must choose DB-only for that seam. Insight-127 (trust signals, not activity traces) names the adjacent principle on the UX side: what's projected is distinct from what's displayed; Insight-111 (explicit-vs-implicit signal separation) is the cited companion on the signal-hygiene dimension.
   - Two sources of truth — if git and Ditto both want to track change history, decide which one is canonical for the user and which is observational; don't let them compete silently.
   - **Engine-core boundary (`@ditto/core`).** The candidate seams live in core schema (`packages/core/src/db/schema.ts`), but projection logic (paths, frontmatter shape, markdown rendering, taxonomy) is product-layer opinion. Projection code lives in `src/engine/` or `packages/web/` — **never** in `@ditto/core`. Core exposes typed read APIs; the projection consumes them. This keeps ProcessOS and other future `@ditto/core` consumers free to choose their own legibility strategy per CLAUDE.md rule 4.
4. **Candidate seams — four categories.** The legibility surface is larger than internal state. Group seams by **"what did Ditto do on my behalf"** vs **"what does Ditto remember about me,"** because the persona pain and the implementation prerequisites differ sharply between the two.

   **Category 1 — Outbound communications** (highest persona value; Rob's *"did you actually send that email?"* anxiety). Emails sent, DMs sent, LinkedIn/Slack/SMS posts published, any side-effecting outbound. **Current Ditto storage reality:** the `outbound_actions` table holds **only content summaries** (`contentSummary` field, packages/core/src/db/schema.ts:703); the full sent body lives inside `step_runs` output JSON blobs and integration-broker logs, **not canonicalised as a retrievable artefact**. **Prerequisite for any brief applying this insight to Category 1:** artefact canonicalisation — outbound content must be persisted as a first-class artefact before it can be projected. This is net-new architectural work, not a simple projection.

   **Category 2 — Inbound communications** (customer emails received and processed, voicemails transcribed, forms submitted, triggered-process inputs). **Current storage reality:** scattered across `activities` event log + integration-broker archives + inbound-specific integrations. Same canonicalisation prerequisite as Category 1.

   **Category 3 — Generated artefacts** (quotes, invoices, reports, content drafts, briefings — the business deliverables processes produce). **Current storage reality:** no dedicated table; artefacts are rendered as `ContentBlocks` in step-run output and composed in-flight; **not persisted as retrievable artefact files**. Same canonicalisation prerequisite.

   **Category 4 — Internal state** (what Ditto remembers about the user and the work). Seams already have clean table-level storage; projection is the only work needed — no canonicalisation prerequisite.
   - `memories` — the self-model; inspect for trust calibration.
   - `improvements` — user-authored-adjacent; already renders in Decide mode.
   - `work_items` — user-owned tasks, explicitly user-language.
   - `process_versions` — change history of authored processes; git is already the right tool.
   - `feedback` — user-owned judgments.
   - `activities` — event log; high volume, so projection cadence matters.

   **Implication for sizing:** Categories 1–3 each carry an artefact-canonicalisation prerequisite that Category 4 does not. A parent brief applying this insight covers all four categories as a coherent design; sub-briefs build per category, and **Category 4 sub-briefs are the cheapest pilot** because they skip the prerequisite. The highest-persona-value sub-briefs are in Category 1.

5. **What explicitly stays DB-only** (hot-path harness state, never user-facing): `process_runs`, `step_runs`, `schedules`, `harness_decisions`, `delayed_runs`, `credentials`, plus any heartbeat / in-memory bookkeeping the harness maintains outside the schema entirely. Borderline cases decided per-brief: `trust_changes` / `trust_suggestions` (raw log stays DB-only; user-facing trust history may project); `outbound_actions` (the **metadata** table stays DB-only as a harness audit log, but the **outbound content** itself — Category 1 above — must be canonicalised and projected).

## Where It Should Land

**Architecture spec (`docs/architecture.md` §Layer 6):** once two independent briefs have applied this principle and shipped, add a §Legibility subsection that names the pattern, the three implementation conviction levels, and the tradeoff checklist. Before then, the insight lives here and is consulted per-brief.

**Related existing material to cross-reference when absorbing:**
- `docs/architecture.md` §Layer 5 #6 (brief lifecycle sync) — existing precedent in Ditto for file-as-primary, DB-as-index; cite as proof the pattern already works before generalising.
- `docs/personas.md` — Rob's trust arc and Lisa's ownership needs likely name this property in emotional terms; the insight gives it a technical shape.
- `docs/human-layer.md` — the 16 UI primitives may need a new one for "inspection surface" or the existing primitives may cover it; Designer will settle this.
- Insight-111 (explicit-vs-implicit signal separation) — companion on the signal-hygiene dimension: signals meant to stay implicit must not leak into an explicit file projection.
- Insight-127 (trust signals, not activity traces) — companion on the UX-surface dimension: what is projected for legibility is distinct from what is shown as the primary user signal; legibility is inspection, not display.
- Insight-200 (interface-seam plus named-trigger) — structurally adjacent but different moment: 200 parks implementation selection behind triggers; 201 pre-commits the posture at the principle level.
- ADR-019 trust tiers — the integrity constraint that the tradeoff checklist must honour.

**Absorption criterion:** this insight stays `active` until (a) at least one brief applies it end-to-end and ships a user-facing filesystem projection, AND (b) a second independent brief at a different seam re-applies it — at which point the pattern is proven and the Architect folds it into `docs/architecture.md` §Layer 6 as a first-class legibility subsection.

**Status as of 2026-04-28:** condition (a) satisfied — Brief 228 (Project Retrofitter, shipped 2026-04-28) ships `.ditto/` substrate writes into the target repo's working tree (a real user-facing filesystem projection sibling to `.git/`, `.github/`, `.claude/`, `.catalyst/`; ADR-043 finalises the directory shape + the Catalyst-coexistence stance). Condition (b) pending Brief 199 (memory projection, still in `docs/briefs/`, not `complete/`). When Brief 199 ships, the Documenter at that closeout discharges the absorption gate, folds the principle into architecture.md §Layer 6, and archives this insight.

**Do NOT pre-reserve brief numbers for applications of this insight** (per Insight-200's hygiene rule). Seam-by-seam briefs claim numbers at scheduling time.
