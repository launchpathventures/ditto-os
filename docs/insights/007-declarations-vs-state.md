# Insight-007: Declarations vs State

**Date:** 2026-03-19
**Trigger:** Debt tracking design — evolved through three rounds of challenge: "why not markdown?" → "the distinction is dev vs product" → "what about end users who need git-tracked files?"
**Layers affected:** All layers (cross-cutting information architecture principle)
**Status:** active

## The Insight

Agent OS manages two fundamentally different kinds of data:

| | Declarations | State |
|---|---|---|
| **What** | How the system *should* work | What the system *is doing* or *has done* |
| **Authored by** | Humans (intentionally) | The engine (during execution) |
| **Lifecycle** | Reviewed, versioned, evolved | Generated, accumulated, queried |
| **Examples** | Process definitions, quality criteria, trust policies, agent configs, debt records | Runs, outputs, feedback, memories, harness decisions, activities |

**Git vs SQLite is an interface choice, not an architectural one.** Declarations can live in git-tracked files (when the interface is CLI/repo) or in database tables with version tracking (when the interface is a web dashboard). The `processes` table already demonstrates this bridge: YAML files authored by humans, synced to SQLite for the engine.

The test for new concepts: **Is this something a human authors with intent, or something the system generates during execution?**

- Debt tracking → declaration (human articulates a conscious trade-off) → files for us now, product table for dashboard users later
- Harness decisions → state (generated per step execution) → always a table
- Process definitions → declaration → files synced to tables (the bridge pattern)
- Memories → state (extracted from feedback during execution) → always a table

## Implications

- New concepts should be classified as declaration or state before choosing storage
- The bridge pattern (files synced to tables) applies when declarations need to be consumed by the engine at runtime
- The product should eventually support both interfaces for declarations: file-based (git repos, CLI) and UI-based (dashboard, SQLite)
- Version tracking in SQLite tables (`version` field, audit trail) is the product equivalent of git history

## Where It Should Land

Architecture spec — as a foundational principle in the data model section. Every new table or file format should declare whether it holds declarations or state, and which interface patterns apply.
