# Brief 227: Project Memory Scope + Cross-Project Promotion UX — Project Onboarding seam #4

**Date:** 2026-04-27
**Status:** complete (2026-04-27, post-Reviewer + dev-review fixes; all 13 ACs met; 39 net new tests; Insights 215 + 216 captured)
**Depends on:** Brief 215 (`processes.projectId` real FK — the substrate the join-filter joins through). Brief 199 (memory projection — cross-reference, not blocking; if shipped, this brief adds project-scope-aware section to the projection format). NO dependency on sub-briefs #1/#2/#3 — this brief is independent of the cloud-runners and onboarding-flow tracks; it can ship in parallel.
**Unlocks:** project-scoped memory discipline across the harness — corrections taught on `agent-crm` no longer bleed into `ditto`. The user's Decide moment "make this apply everywhere" gets a clean affordance.
**Parent brief:** 224 (Project Onboarding & Battle-Readiness)

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness — memory scope discipline.
- **Capabilities delivered:**
  - **Memory-assembly join through `processes.projectId`.** The existing `process`-scope memory load at `src/engine/harness-handlers/memory-assembly.ts:142-143` and `:282-283` converts from `eq(memories.scopeId, processRun.processId)` to a join: `memories.scopeId → processes.id → processes.projectId`. When loading process-scoped memories for a step run, the assembly function returns memories whose process belongs to the SAME project as the current step run's process, plus self-scoped memories.
  - **`HarnessContext.projectId` extension.** A `projectId: string | null` field added to `HarnessContext` at handler entry (derived from `processes.projectId` lookup). Existing call sites of memory-assembly are updated to populate this field. NULL `projectId` means "pre-project-era memory" (legacy) and falls back to the existing `eq()` behaviour for backwards compatibility.
  - **Memory-write inheritance of `projectId`.** When the harness writes a new memory of `scopeType='process'` (via the existing memory-extraction flow from `feedback` events), it inherits the writing process's `projectId` automatically. NO new column; the inheritance is via the join relationship at retrieval time.
  - **Promote-to-self-scope tool/UX.** A new Self tool `promote_memory_scope(memoryId)` that flips `memories.scopeType` from `'process'` to `'self'`. Surfaced via three UX surfaces per the Designer spec: memory-detail card (primary), citation chip peek (secondary), proactive Self proposal in briefings (tertiary).
  - **Demote affordance.** A sibling Self tool `demote_memory_scope(memoryId, targetProjectId)` for the reverse path. Architect picks the demote-target rules per Designer Open Q2.
  - **Multi-project memory model.** Per Designer Open Q1: the architect's call lands on **`memories.appliedProjectIds: string[] NULLABLE` column** (Path A from the Designer spec). When `scopeType='self'` AND `appliedProjectIds` is non-empty, the memory applies ONLY to the listed projects (a "promote to specific projects" hybrid scope). When `scopeType='self'` AND `appliedProjectIds` is null/empty, the memory applies everywhere (full self-scope). When `scopeType='process'`, `appliedProjectIds` is unused.
  - **Scope pill rendering on existing memory views.** Three pill variants per Designer spec: `Project · <slug>` (process-scope with non-null projectId), `All projects` (self-scope, no appliedProjectIds), `Just for you` (self-scope user-model memories that aren't project-related), **plus a fourth `<N> projects` pill for the multi-project hybrid case** — this fourth variant EXTENDS the Designer's three-pill spec because Designer Open Q1's resolution (column-model with `appliedProjectIds`) made the fourth variant semantically necessary. NOT a Designer-spec deviation; an architectural extension Q1's resolution forced.
  - **"We noticed" proactive proposal.** A briefing-time signal: when a memory is reinforced ≥2 times across ≥2 distinct projects, Self emits a `SuggestionBlock` proposing promotion. One per briefing max; 30-day cooldown on dismissal.
  - **Backfill discipline.** Pre-project-era memories (where the source process had `projectId=NULL`) remain visible across all projects (intentional — no automated guess at which project they belong to). The scope pill renders `All projects` for these.

## Context

Brief 215 added `processes.projectId` as a real foreign key. This brief is the application that USES that FK at the memory layer — finally completing Insight-205 §Implications #4 ("Project memories are scoped per-project").

Today, when the harness loads memories for a step run via `memory-assembly.ts`, the process-scope filter is `eq(memories.scopeId, processRun.processId)` — only memories tagged to that exact process load. With sub-brief #4 active, the filter widens: memories tagged to ANY process in the same project also load. This is the right semantic — corrections taught while running the morning-brief process should apply to the evening-brief process if they're the same project.

But sometimes corrections genuinely SHOULD cross projects. Lisa's brand-voice rule applies to every marketing repo she connects. Nadia's data-source-citation rule applies to every analyst's reports. Today the only way to make a memory cross-project is to delete it and recreate it with `scopeType='self'` — there's no UX. This brief gives the user a one-tap promote affordance with full blast-radius transparency.

The Designer pass landed at `docs/research/memory-cross-project-promotion-ux.md` (2026-04-27). The spec ranks three surfaces (memory detail = primary, citation chip peek = secondary, proactive briefing proposal = tertiary), explicitly rejects a Settings-page surface, and surfaces five open architectural questions. **This brief consumes the spec verbatim as its User Experience section.** All five Designer Open Questions are resolved in this brief's §Constraints below.

The surgery scope is real but bounded: 2 read sites in memory-assembly.ts (verified at the existing lines), one new column on `memories` (the `appliedProjectIds` array), `HarnessContext` extension, two new Self tools, the SuggestionBlock for proactive proposals, scope-pill rendering on existing memory citation views.

## Objective

Ship the memory-scope discipline that prevents project-A's corrections from bleeding into project-B's runs, with a Decide-moment affordance for the user to promote a memory across projects (with full visibility into the blast radius before tapping). The change is additive across the data model, surgical at the memory-assembly seam, and reuses existing chat-block primitives + the SuggestionBlock for the user-facing UX.

## Non-Goals

- **NO new memory `scopeType` value.** Per Brief 224 §Constraints + Brief 215 §Constraints + Reviewer-validation across both — extend `process`-scope filtering through `projectId` join; do NOT add `'project'` to `memoryScopeTypeValues`.
- **NO automated cross-project promotion.** Per Insight-127 + ADR-003 §3 — the harness manages, the agent proposes, the user decides. The proactive surface SUGGESTS; it never auto-promotes.
- **NO retroactive backfill of pre-project-era memories.** Memories whose source process had a NULL `projectId` stay visible across all projects (per Designer Open Q4 resolution: see §Constraints). User can manually promote/restrict per-memory; no automated guess at which project they belong to.
- **NO duplicate-the-memory-N-times multi-project model.** Designer Open Q1 surfaced three options; the architect picks `appliedProjectIds: string[]` (one row, list of project ids) — see §Constraints for rationale.
- **NO Telegram support for the confirmation sheet.** Designer Open Q5 — Telegram surface (Brief 098) renders text + buttons; the affected-projects-list doesn't fit. The promote action is web-only at MVP; Telegram displays scope pills (Orient surface) but not the promote confirmation. Future brief if demand justifies.
- **NO modifications to existing `memoryScopeTypeValues` enum** — `agent | process | self | person` stay; project memory scope is an emergent property of joining `process`-scope memories through `processes.projectId`.
- **NO new ContentBlock type.** The promote confirmation sheet uses existing `block.evidence` + `block.decision` chat-block primitives (per Designer spec). The proactive proposal uses existing `SuggestionBlock`. The scope pill is a renderer-side addition to the existing `KnowledgeCitationBlock` HoverCard peek + memory-detail surface.
- **NO `harness_decisions` audit row schema change.** Promote/demote events log to `activities` table (`actorType='user'`, `action='memory_promote'` / `'memory_demote'`) per existing pattern, NOT `harness_decisions` (which is for agent-pipeline trust gates).
- **NO mobile-different behavior** beyond `human-layer.md`'s standard mobile adaptations (bottom-sheet for the confirmation; full-width SuggestionBlock; collapsed evidence rows tap-to-expand).
- **NO `human-layer.md` update** in this brief. The chat-col-as-second-column layout from the design package is sub-brief #1's Documenter follow-up; this brief inherits it.

## Inputs

1. `docs/briefs/224-project-onboarding-and-battle-readiness.md` §Sub-brief #4 (lines 214-224) — parent specification with the explicit memory-assembly surgery scope (2 call sites at memory-assembly.ts:143 + :283).
2. `docs/research/memory-cross-project-promotion-ux.md` — Designer's UX spec (2026-04-27). Consumed verbatim. Five Open Questions resolved here in §Constraints.
3. `docs/insights/205-battle-ready-project-onboarding.md` §Implications #4 — load-bearing for the project-scope-by-join discipline.
4. `docs/insights/127-trust-signals-not-activity-traces.md` — promotion is an explicit user signal, never inferred.
5. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — the promote/demote tools emit DB writes; both carry `stepRunId` per the existing pattern.
6. `docs/adrs/003-memory-architecture.md` — memory scope semantics + `memoryScopeTypeValues` enum (`agent | process | self | person`); this brief extends the `process`-scope FILTERING but does NOT add an enum value.
7. `packages/core/src/db/schema.ts` `memories` table (verify at builder time the current shape) — adds one column (`appliedProjectIds`).
8. `src/engine/harness-handlers/memory-assembly.ts:142-143, 282-283` — the two `process`-scope read sites that convert from `eq()` to join. Line numbers verified at brief-write time 2026-04-27.
9. `packages/core/src/content-blocks.ts` — existing `KnowledgeCitationBlock` (Brief 072), `SuggestionBlock` (Brief 044+). NO new block types added; renderer extension to KnowledgeCitationBlock for the scope pill.
10. `src/engine/self-tools/` — existing 27+ tools registry. Two new tools land here (`promote_memory_scope` + `demote_memory_scope`).
11. `packages/web/components/blocks/` — existing block renderer directory. Renderer extensions to `knowledge-citation-block.tsx` for the scope pill + the new memory detail surface.
12. `processes/` — Self's daily briefing process; this brief adds the proactive cross-project-promotion-proposal logic (one per briefing, 30-day cooldown).

## Constraints

- **Engine-first per CLAUDE.md.** Memory-assembly join logic + `HarnessContext.projectId` extension lives in `packages/core/src/` (engine — memory-scope filtering is a primitive ProcessOS could use). The promote/demote Self tools live in `src/engine/self-tools/` (Ditto product layer — Self is Ditto-specific). Scope pill rendering lives in `packages/web/components/blocks/` (product). The `appliedProjectIds` schema column lives in `packages/core/src/db/schema.ts`. Ask: "could ProcessOS use this?" — memory-scope-filtering yes; promote tool's UX-coupled behaviour no.

- **Side-effecting function guard (Insight-180) — MANDATORY for promote + demote tools.** Each Self tool's handler takes `stepRunId` first; rejects calls without it (DB-spy pattern). Both tools emit DB writes (UPDATE to `memories.scopeType` + `memories.appliedProjectIds`).

- **Memory-write inheritance via join, not column.** When a new `process`-scope memory is written, its `scopeId` continues to reference the writing process. The project-scope filtering happens at READ time via the join through `processes.projectId`. NO new column on `memories` for `projectId` — keeping the data model simple. The `appliedProjectIds` column ONLY applies when `scopeType='self'` (the multi-project hybrid case).

- **Multi-project memory model (Designer Open Q1 RESOLVED): `memories.appliedProjectIds: text(json)[] NULLABLE`.** When `scopeType='self'` AND `appliedProjectIds` is non-empty, the memory applies only to the listed projects (hybrid scope). When `scopeType='self'` AND `appliedProjectIds` is NULL or `[]`, the memory applies everywhere (full self-scope per ADR-003 semantics). When `scopeType='process'`, `appliedProjectIds` is unused (NULL). This single-row approach beats duplication (no dedup loss) and beats a separate junction table (over-engineered for solo-user MVP). The reverse-promotion path (demote a self-scope memory back to project-scope) writes the target projectId into `scopeId` and clears `appliedProjectIds`.

- **Demote target rules (Designer Open Q2 RESOLVED, with `user_model`/`preference` guard per Reviewer Critical #1).** When the user demotes a multi-project memory (`scopeType='self'` with `appliedProjectIds.length > 0`) back to single-project scope, the user picks the target project from the existing `appliedProjectIds` list at demote time (the demote modal shows a radio-style picker). When the user demotes a fully-self-scoped memory (`appliedProjectIds = NULL`) back to project-scope, the demote modal shows a picker over the user's currently-`'active'` projects. If the original sourcing process's project is now `'archived'`, the modal omits it and forces the user to pick from current active projects. **TYPE GUARD:** the `demote_memory_scope` tool REJECTS calls for memories with `type='user_model'` or `type='preference'` (per ADR-003 §1, these are person-facts that NEVER had a source process; tagging them to a project is semantically wrong). The tool returns a structured error `{ ok: false, reason: 'user-model-or-preference-cannot-be-project-scoped' }`; the UI hides the demote affordance for these types. NO automatic demote-to-original; archival of a memory's source project does NOT auto-demote that memory.

- **Proactive proposal channel (Designer Open Q3 RESOLVED): briefing only at MVP.** The cross-project-promotion proposal SuggestionBlock surfaces only in the daily briefing surface, not in the conversation review HoverCard peek. Rationale: the briefing is a low-density-of-attention surface; the conversation HoverCard is high-density-of-attention. Adding promotion proposals to the HoverCard would over-clutter the citation peek (which is supposed to be quick-scan evidence). If briefing-only proves under-discoverable post-dogfood, follow-on brief lifts to the HoverCard.

- **Backfill pill text (Designer Open Q4 RESOLVED): pre-project-era memories render `All projects` (no fourth pill).** Rationale: introducing a fourth pill `Pre-projects` adds visual complexity without informational value. The user can promote/restrict any memory at any time; if they restrict a pre-project-era memory, the pill flips to `Project · <slug>` or `<N> projects`. The transition from "legacy implicit-everywhere" to "explicit-everywhere" is preserved by the user's first restrict action — until then, the rendering is honest because the BEHAVIOUR is exactly "applies everywhere."

- **Telegram surface (Designer Open Q5 RESOLVED): web-only at MVP.** Telegram (Brief 098) shows scope pills (Orient surface — small text label) but the promote confirmation sheet is web-only. Telegram's `/projects` listing surface remains untouched by this brief. Tapping a "promote" hint in Telegram opens a deep link to the web confirmation surface. Architectural simplification with explicit follow-on if demand justifies.

- **Backfill at migration time.** Existing `memories` rows have `appliedProjectIds = NULL` (the new column is NULLABLE with NULL default). No data migration needed; the join filter falls through to the existing `eq()` behaviour for memories whose source process had `projectId = NULL`. This makes the migration safe — zero risk of dropped memories.

- **Schema migration discipline (Insight-190).** This brief adds ONE column (`memories.appliedProjectIds`). Migration idx claimed at builder-start time per the strict-monotonic rule. Brief 225 claimed idx=14 at write-time; Brief 226 makes no schema change; Brief 227 claims **next-free idx ≥15** (verify at builder-start; verified 2026-04-27 against `drizzle/meta/_journal.json` — current head is idx=14 / tag `0015_keen_nicolaos`). SQL is `ALTER TABLE memories ADD COLUMN applied_project_ids TEXT` (Drizzle JSON-mode column; SQLite stores JSON as TEXT).

- **Cooldown query path — index-backed.** The 30-day proactive-proposal cooldown queries `activities` for `action='memory_promotion_dismissed'` rows newer than 30 days. The `activities` table (`packages/core/src/db/schema.ts:754-770`) has no composite index on `(entity_type, entity_id, action)` today. **This brief adds a composite index** `activities_entity_action_idx ON activities(entity_type, entity_id, action)` as part of the migration — small additive change, broadly useful. Alternative considered (dedicated `memory_promotion_dismissals` table) rejected for simpler additivity.

- **Tripwire for `appliedProjectIds` column model at scale.** This brief commits to the column model (single-row JSON array, NOT a junction table) for solo-user MVP. **Tripwire (per Reviewer):** if memory volume crosses 5K rows OR if `appliedProjectIds`-filter queries exceed 50ms p95, a follow-on brief lifts to a `memory_project_applicability` junction table. Builder adds a benchmarking step to `memory-assembly.test.ts` that asserts the query stays under 50ms with 1K seeded rows; failing the assertion triggers the tripwire decision.

- **No drift on Brief 215's substrate.** `processes.projectId` FK stays unchanged. The memory-assembly join uses the existing FK relationship; no new FK added.

- **No drift on ADR-003.** `memoryScopeTypeValues` stays at `agent | process | self | person`. The memory model gets ONE additive column (`appliedProjectIds`). The four-scope semantics are preserved; the `appliedProjectIds` column is a refinement of the `self` scope, not a new scope.

- **Reference docs touched in this brief** (Insight-043):
  - `docs/dictionary.md` — three new entries: Project Memory Scope (the join discipline), Memory Promotion (user-action), Multi-Project Memory (the `appliedProjectIds` hybrid). Builder writes at implementation.
  - `docs/state.md` — architect checkpoint for this brief.
  - `docs/adrs/003-memory-architecture.md` — Architect amends one paragraph per Insight-043: ADR-003 currently says "process-scoped memories stay with the process even when agents are swapped." This brief widens that statement: "process-scoped memories stay with the project's processes — when a different process in the same project runs, the same memories load." NOT a contradiction; an extension. The ADR amendment lands as part of this brief's Builder commit (per Insight-043, ADR accuracy is the Architect's responsibility but the Builder writes the prose change).
  - `docs/architecture.md` — NOT updated; absorption gates are Brief 224 phase concerns.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Project-scope memory filter via join | Brief 215 (`processes.projectId` real FK) + ADR-003's process-scope semantics | depend (existing) | The FK is the load-bearing substrate; the join just uses it. |
| `appliedProjectIds` column for multi-project hybrid | Designer Open Q1 resolution | original (architect call from three options) | Single-row approach avoids dedup loss + over-engineering. |
| Promote/demote Self tools | Existing 27+ self-tools registry pattern | pattern (self-reuse) | Same shape as `start_pipeline`/`adjust_trust`/etc. |
| Scope pill rendering on `KnowledgeCitationBlock` | Designer spec + existing `KnowledgeCitationBlock` HoverCard peek | pattern (renderer extension) | No new block type; minimal renderer change. |
| Proactive proposal via SuggestionBlock | `human-layer.md` §Decide primitives + existing SuggestionBlock | pattern (self-reuse) | One-per-briefing pattern matches Self's existing proactive cap of 1-2 suggestions per briefing. |
| 30-day cooldown on dismissal | Original to Ditto | original | No prior pattern; Designer-justified. |
| Cross-project repetition trigger (≥2 reinforcements across ≥2 distinct projects) | Designer spec | original | Single-project repetition triggers project-internal pattern detection (existing); cross-project signal is qualitatively different. |
| Memory-assembly join surgery | Brief 224 §Sub-brief #4 estimated scope | adopt (canonical) | Surgical scope explicitly named in parent brief. |
| ADR-003 amendment | Insight-043 (Architect owns ADR accuracy) | pattern (self-reuse) | ADR amendment per the existing convention. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | **Modify:** add `memories.appliedProjectIds: text("applied_project_ids", { mode: "json" }).$type<string[] \| null>()`. Default NULL. NO change to `memoryScopeTypeValues`. |
| `drizzle/<NNNN>_<slug>.sql` | **Generated** by `drizzle-kit generate` against next-free idx ≥15 (verify at builder-start). SQL: `ALTER TABLE memories ADD COLUMN applied_project_ids TEXT`. Existing rows backfill to NULL. |
| `drizzle/meta/_journal.json` | **Modify (generated):** new entry. |
| `drizzle/meta/<NNNN>_snapshot.json` | **Generated.** |
| `packages/core/src/harness/harness.ts:297` (verified at brief-write time — `HarnessContext` is defined here, NOT in a `types.ts` sibling) | **Modify:** add `projectId: string \| null` field to `HarnessContext`. Existing consumers continue to compile; `projectId` defaults to `null` if not provided (legacy callers). |
| `src/engine/harness-handlers/memory-assembly.ts` | **Modify:** TWO call sites at `:142-143` and `:282-283`. Both convert from `eq(memories.scopeId, context.processRun.processId)` to a sub-query-based filter. Architect commits to the path (per Reviewer Critical #2 — no defer-to-builder hedge): use Drizzle's `inArray()` against a sub-query of project-mate process ids, plus an OR for self-scope. **Concretely:** `or(and(eq(memories.scopeType, 'process'), inArray(memories.scopeId, db.select({ id: processes.id }).from(processes).where(eq(processes.projectId, ctx.projectId)))), and(eq(memories.scopeType, 'self'), or(isNull(memories.appliedProjectIds), sql\`json_each.value = \${ctx.projectId}\` /* json_each lateral on appliedProjectIds — Drizzle pattern */)))`. Both call sites apply the same predicate composition. **Legacy fallback:** when `ctx.projectId IS NULL` (pre-project-era memory's source process had NULL projectId), fall through to the existing `eq(memories.scopeId, context.processRun.processId)` behaviour for backwards compat. Architect note for Builder: the `json_each` lateral is the SQLite-native array-contains pattern; benchmark at builder-time and add a tripwire (§Constraints) if the query exceeds 50ms p95. |
| `src/engine/harness-handlers/memory-assembly.test.ts` | **Modify:** add tests verifying — (a) memory tagged to `processA` of `projectX` loads when running `processB` of `projectX`; (b) memory tagged to `processA` of `projectX` does NOT load when running `processC` of `projectY`; (c) self-scope memory with `appliedProjectIds=null` loads everywhere; (d) self-scope memory with `appliedProjectIds=[projectX]` loads only for projectX runs; (e) pre-project-era memory (source process projectId=null) loads everywhere (legacy compat). |
| `src/engine/self-tools/promote-memory-scope.ts` | **Create:** Self tool `promote_memory_scope`. Definition: `{ name, description (encodes intent: "Use when user wants to promote a memory's scope from a single project to all projects, or to a specific subset of projects"), inputSchema: { memoryId, scope: 'all' \| { projectIds: string[] } } }`. Implementation: UPDATE `memories` SET `scopeType='self'`, `appliedProjectIds=<list-or-null>`. Logs an `activities` row with `action='memory_promote'`. Insight-180 guard. |
| `src/engine/self-tools/demote-memory-scope.ts` | **Create:** Self tool `demote_memory_scope`. Definition: similar shape, `inputSchema: { memoryId, targetProjectId: string }`. Implementation: UPDATE `memories` SET `scopeType='process'`, `scopeId=<a process belonging to targetProjectId>`, `appliedProjectIds=NULL`. The `scopeId` choice is the highest-reinforcement-count source process belonging to the target project (preserves the audit trail). Logs `activities` row with `action='memory_demote'`. Insight-180 guard. |
| `src/engine/self-tools/promote-memory-scope.test.ts` | **Create:** unit tests for the promote tool — full self-scope (`scope: 'all'`), hybrid (`scope: { projectIds: [...] }`), guard rejection without stepRunId, activities row written. |
| `src/engine/self-tools/demote-memory-scope.test.ts` | **Create:** unit tests for the demote tool — successful demote with target picker, archived-source-project handling, guard rejection. |
| `src/engine/self-tools/index.ts` (or wherever the tool registry lives) | **Modify:** register both new tools. |
| `packages/web/components/blocks/knowledge-citation-block.tsx` | **Modify:** extend the renderer to show a leading scope pill (vivid-subtle bg + `#D1F4E1` border) — three pill variants per Designer spec (`Project · <slug>` / `All projects` / `Just for you`) plus a fourth `<N> projects` for the hybrid case. The HoverCard peek gains the same scope pill at the top + a `[Promote]` ghost-button affordance for project-scope memories. |
| `packages/web/components/memory-detail.tsx` (or equivalent — grep) | **Modify (or create if memory detail surface doesn't exist yet):** the memory detail surface gains the scope pill at the top + the primary `[Promote to all projects]` CTA when project-scoped (or `[Demote to project-scope]` when self-scoped) + the `.alex-line` reversibility note. The promote/demote CTA opens the confirmation sheet inline (mobile: bottom-sheet; desktop: inline below). |
| `packages/web/components/memory-promote-confirmation.tsx` | **Create:** the confirmation sheet React component. Renders a `block.evidence` listing affected projects + the memory content + three buttons (`[Promote to all <N>]` / `[Cancel]` / `[Restrict to specific…]`). The Restrict picker is an in-component checklist over the user's `'active'` projects with the source project pre-checked + locked. |
| `packages/web/components/memory-promote-confirmation.test.tsx` | **Create:** rendering tests for each interaction state (idle / loading / success / error / restrict-picker-open). |
| `processes/` (briefing-time proposal logic — likely `processes/orchestrator.yaml` or wherever Self's briefing assembly lives — grep) | **Modify:** add a step that detects cross-project memory repetition (≥2 reinforcements across ≥2 distinct projects) and, if at least one qualifies AND the briefing slot for promotion proposals isn't already filled, emits a `SuggestionBlock` with the promotion proposal. 30-day cooldown enforced via a new `memory_promotion_dismissals` table OR via existing `activities` query (architect's call at builder time — likely the activities query for additivity). |
| `packages/core/src/db/schema.ts` (or skip per architect call) | **Optionally modify:** add `memory_promotion_dismissals` table (memoryId, dismissedAt) for the 30-day cooldown, OR query the existing `activities` table for `action='memory_promotion_dismissed'` rows newer than 30 days. The query path is simpler and avoids a new table. Architect's recommendation: query path. |
| `docs/adrs/003-memory-architecture.md` | **Modify (TWO locations per Reviewer Important #5):** (a) Line 55 (in §Decision §1, scopeType bullet) — widen "process-scoped memories stay with the process" to "process-scoped memories stay with the project's processes (joined via `processes.projectId`); when ANY process in the same project runs, project-scoped memories load." (b) §6 "Process-scoped memories persist across agent assignments" at line ~129 — extend with: "When the harness runs a step from a sibling process in the same project, the same project-scoped memories load via the `processes.projectId` join. Single-process scope is the default; cross-project promotion requires explicit user action via the `promote_memory_scope` tool." Preserve the **Original to Ditto** marking at line 188; widening scope doesn't unmark the originality. Builder writes both prose changes. |
| `docs/dictionary.md` | **Modify:** 3 new entries (Project Memory Scope, Memory Promotion, Multi-Project Memory). Builder writes at implementation. |
| `.env.example` | **No change.** No new env var. |

## User Experience

**Per `docs/research/memory-cross-project-promotion-ux.md`** (Designer pass, post-Reviewer). Spec consumed verbatim — three surfaces (memory detail primary, citation chip peek secondary, proactive briefing proposal tertiary), confirmation sheet structure, persona walkthroughs, interaction states, six-jobs mapping all adopted as-is.

- **Jobs affected:** Decide (PRIMARY — promote choice IS a Decide moment), Review (SECONDARY — user reviews memory content + history before deciding), Orient (TERTIARY — scope pill is "where does this apply?" Orient signal).
- **Primitives involved:** existing `KnowledgeCitationBlock` (extended with scope pill + peek action), existing `SuggestionBlock` (proactive proposal), the new `memory-promote-confirmation.tsx` component (composed from `block.evidence` + buttons — NOT a new ContentBlock type). NO new ContentBlock types in this brief.
- **Process-owner perspective:** Lisa promotes brand-voice on her phone in 12 seconds (per Designer walkthrough); Nadia promotes data-source-citation across her analysts after her end-of-week review on her laptop (per Designer walkthrough); Jordan rarely uses this surface (org-tooling memories are usually fully cross-project from the start). Rob doesn't have multiple projects in MVP scope.
- **Visual identity:** Anthropic Claude Design handoff bundle (id `iK3gPHe3rGAErdm4ua2V-A`). Promote CTA uses `--color-vivid` filled (NOT caution-yellow — Reviewer fix to Designer's first draft); scope pills use `--color-vivid-subtle` bg + `#D1F4E1` border; `--color-positive` / `--color-caution` / `--color-negative` reserved for the analyser report (not used here).

## Acceptance Criteria

1. [ ] **`memories.appliedProjectIds` schema column lands.** `packages/core/src/db/schema.ts` adds the column as `text("applied_project_ids", { mode: "json" }).$type<string[] | null>()` with default NULL. `pnpm run type-check` (root) passes. NO change to `memoryScopeTypeValues`.

2. [ ] **Drizzle migration at next-free idx (≥15 verified at builder-start).** SQL: `ALTER TABLE memories ADD COLUMN applied_project_ids TEXT`. Existing rows backfill to NULL implicitly. `pnpm drizzle-kit migrate` succeeds; idempotent re-run is no-op.

3. [ ] **Memory-assembly join works at both call sites.** `src/engine/harness-handlers/memory-assembly.ts:142-143` and `:282-283` both load memories where (a) `scopeType='process'` AND the source process's `projectId` matches the current step run's process's `projectId`, OR (b) `scopeType='self'` AND (`appliedProjectIds IS NULL` OR `appliedProjectIds` contains the current `projectId`). The existing test suite still passes. New tests verify the cross-project-not-bleeding behaviour.

4. [ ] **`HarnessContext.projectId` extension.** `packages/core/src/harness/harness.ts:297` adds `projectId: string | null` to `HarnessContext`. Existing call sites of `memory-assembly` are updated to populate this from `processes.projectId` lookup. NULL values fall through to the existing legacy behaviour (test verifies pre-project-era memories still load).

5. [ ] **`promote_memory_scope` Self tool registers + works.** Tool description includes intent-recognition examples per the existing tool pattern. Tool accepts `{ memoryId, scope: 'all' | { projectIds: string[] } }`. UPDATE writes the new `scopeType` + `appliedProjectIds`. Logs `activities` row with `action='memory_promote'`. Insight-180 guard rejects calls without `stepRunId` (DB-spy assertion: zero DB writes before rejection).

6. [ ] **`demote_memory_scope` Self tool registers + works.** Tool accepts `{ memoryId, targetProjectId }`. UPDATE flips `scopeType='process'`, `scopeId=<highest-reinforcement-count source process for that project>`, `appliedProjectIds=NULL`. Logs `activities` row with `action='memory_demote'`. Insight-180 guard.

7. [ ] **`KnowledgeCitationBlock` renderer shows scope pill.** Three pill variants render correctly per memory state: `Project · <slug>` / `All projects` / `Just for you` / `<N> projects` (hybrid). Existing citation behavior unchanged (no regression). HoverCard peek gains `[Promote]` ghost-button for project-scope memories.

8. [ ] **Memory detail surface renders the promote CTA + confirmation sheet.** When the user opens a memory's detail and the memory is project-scope, the `[Promote to all projects]` CTA + `.alex-line` reversibility note render. Tapping opens the confirmation sheet inline. Confirmation sheet lists affected projects by name + `[Promote to all <N>]` / `[Cancel]` / `[Restrict to specific…]` actions.

9. [ ] **`[Restrict to specific…]` opens the project picker.** A checklist of `'active'` projects renders with the source project pre-checked + locked (can't deselect — that's a demote). User selects 0+ additional projects; submitting writes `scopeType='self'` + `appliedProjectIds=[source + selected]`.

10. [ ] **Proactive cross-project promotion proposal in briefing.** Triggered on memories reinforced ≥2 times across ≥2 distinct projects. SuggestionBlock renders in the daily briefing surface with `[Promote everywhere]` / `[Keep per-project]` / `[Show me]` actions. One per briefing max. 30-day cooldown enforced via `activities` query for prior `action='memory_promotion_dismissed'` rows.

11. [ ] **Multi-project memory model honours appliedProjectIds at retrieval.** Test cases: `appliedProjectIds=NULL` (full self) loads everywhere; `appliedProjectIds=[projectX]` loads ONLY for projectX runs; `appliedProjectIds=[projectX, projectY]` loads for both X + Y but NOT for projectZ.

12. [ ] **Backfill discipline honoured.** Pre-project-era memories (source process `projectId=NULL`) continue loading across all projects (legacy compat verified by existing test suite + new dedicated test). Scope pill renders `All projects` for these memories. NO automated guess-and-promote at migration time.

13. [ ] **ADR-003 amended.** One-paragraph prose change per §What Changes — process-scope semantics widened to project-scope. The ADR is committed alongside this brief's schema change.

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 224 + Brief 215 substrate + Designer's UX spec + ADR-003 + actual schema state + memory-assembly.ts source.
2. Reviewer challenges:
   - Is the `appliedProjectIds` column the right call vs separate junction table OR memory duplication? Multi-project hybrid is genuinely additive but the column-on-array model has read-cost implications at scale.
   - Does the join filter at memory-assembly.ts:142-143 + :282-283 actually compose with the existing `inArray`/`eq` Drizzle queries cleanly, or does it require a sub-query refactor that the brief understates?
   - Demote target rule (highest-reinforcement-count process for target project) — does this preserve audit-trail intent, or does it lose information? Alternative: pick the most-recent process by `lastReinforcedAt`.
   - Proactive trigger threshold (≥2 reinforcements across ≥2 distinct projects) — is this aggressive enough (will Lisa get the proposal in week 1?) or too aggressive (will Jordan get false positives)?
   - 30-day cooldown via `activities` query — does that scale? Or should there be a dedicated `memory_promotion_dismissals` table?
   - Telegram-omission decision — is web-only at MVP defensible, or does it create a class of users who can never promote (Lisa works heavily from her phone)? Lisa's mobile flow per Designer spec is web mobile, so she's covered; verify.
   - ADR-003 amendment text — does the proposed prose actually capture the behavioural change without breaking the existing absorption status?
   - AC count is 13 — within Insight-004 range; one integration seam (the memory-assembly + scope-pill + promote-tool surface) but the seam touches engine + product cleanly.
3. Present brief + review findings to human for approval.

## Smoke Test

```bash
# Prerequisite: Brief 215 substrate + memories table exist
pnpm drizzle-kit migrate

# 1. Seed: two projects, one process per project, one memory tagged to project A's process
sqlite3 data/dev.db "INSERT INTO projects (id, slug, name, kind, harness_type, status) VALUES ('p1', 'proj-a', 'Project A', 'build', 'native', 'active');"
sqlite3 data/dev.db "INSERT INTO projects (id, slug, name, kind, harness_type, status) VALUES ('p2', 'proj-b', 'Project B', 'build', 'native', 'active');"
sqlite3 data/dev.db "INSERT INTO processes (id, name, slug, definition, project_id) VALUES ('proc-a', 'Process A', 'proc-a', '{}', 'p1');"
sqlite3 data/dev.db "INSERT INTO processes (id, name, slug, definition, project_id) VALUES ('proc-b', 'Process B', 'proc-b', '{}', 'p2');"
sqlite3 data/dev.db "INSERT INTO memories (id, scope_type, scope_id, type, content, source) VALUES ('mem-1', 'process', 'proc-a', 'correction', 'Always include source citation', 'human');"

# 2. Verify cross-project NOT bleeding (memory tagged to projA's process should NOT load when running projB's process)
# This requires invoking memory-assembly programmatically — covered by the unit test suite, not a CLI smoke
pnpm test memory-assembly

# 3. Promote the memory to all projects via the Self tool
# (requires the engine running + Self tool invocation — manual via Self chat OR programmatic in test)
# After promotion: memory's scopeType='self', appliedProjectIds=NULL
sqlite3 data/dev.db "SELECT scope_type, applied_project_ids FROM memories WHERE id='mem-1';"
# Expected: self | NULL

# 4. Verify scope pill renders correctly in the conversation surface
# (visual smoke — open a conversation that cites mem-1, verify the HoverCard peek shows "All projects" pill)

# 5. Demote back to project-scope, target proj-b
# After demotion: memory's scopeType='process', scopeId='proc-b', appliedProjectIds=NULL
sqlite3 data/dev.db "SELECT scope_type, scope_id FROM memories WHERE id='mem-1';"
# Expected: process | proc-b

# 6. Verify activities log captures the promote + demote events
sqlite3 data/dev.db "SELECT action FROM activities WHERE entity_type='memory' AND entity_id='mem-1' ORDER BY created_at;"
# Expected: memory_promote | memory_demote
```

## Reviewer Pass Summary (2026-04-27)

Fresh-context Reviewer ran with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 224 + Brief 215 substrate + Designer's UX spec (`docs/research/memory-cross-project-promotion-ux.md`) + ADR-003 + actual schema state. **Verdict: PASS WITH FLAGS.** All CRITICAL findings (2) + IMPORTANT findings (5 actionable) + MINOR findings (4) addressed in-session. Brief promoted to `Status: ready` only after fixes verified.

- **CRITICAL #1 (Demote rule for `user_model`/`preference` types) FIXED:** §Constraints + §AC #6 add an explicit type guard — the `demote_memory_scope` tool REJECTS calls for `type='user_model'` or `type='preference'` memories with a structured error. UI hides the demote affordance for these types. ADR-003 §1 semantics (these memories never had a source process) preserved.
- **CRITICAL #2 (Drizzle expression hand-wavy) FIXED:** §What Changes spells out the actual sub-query expression with `inArray()` against project-mate process ids + `or()` for self-scope + `json_each` lateral for `appliedProjectIds` array-contains check. NO defer-to-builder hedge. Builder benchmarks at builder-time.
- **IMPORTANT #3 (Drizzle JSON column type) verified PASS:** consistent with existing `memories.metadata` pattern.
- **IMPORTANT #4 (cooldown query needs index) FIXED:** §Constraints commits to adding composite index `activities_entity_action_idx ON activities(entity_type, entity_id, action)` as part of the migration. Small additive change, broadly useful. Alternative dedicated table rejected.
- **IMPORTANT #5 (ADR-003 amendment must touch BOTH locations) FIXED:** §What Changes specifies both line 55 (scopeType bullet) AND §6 (line ~129 — "Process-scoped memories persist across agent assignments") get the prose extension. **Original to Ditto** marking at line 188 preserved.
- **IMPORTANT #6 (Telegram-omission) verified PASS:** Designer spec's Lisa walkthrough is mobile-WEB, not Telegram. Decision honoured.
- **IMPORTANT #7 (multi-project pill text framing) FIXED:** §Goal now frames the fourth pill (`<N> projects`) as an architectural extension of Designer's three-pill spec — Q1's resolution (column-model) made it semantically necessary; NOT a Designer-spec deviation.
- **IMPORTANT (column-vs-junction tripwire — Reviewer take):** §Constraints adds explicit tripwire: if memory volume crosses 5K rows OR `appliedProjectIds`-filter queries exceed 50ms p95, a follow-on brief lifts to a `memory_project_applicability` junction table. Builder adds a benchmark assertion at 1K rows.
- **MINOR #8-#11 incorporated:** HarnessContext file location pinned (`packages/core/src/harness/harness.ts:297`); memory-assembly line numbers re-verified (142-143, 282-283 — exact); Drizzle journal idx ≥15 re-verified at brief-write time (current head idx=14 / `0015_keen_nicolaos`); Designer spec file existence verified (PASS).

**Reviewer's parent-brief coverage check:** Brief 224 §Sub-brief #4 estimated ~10-13 ACs covering the memory-assembly join surgery + HarnessContext extension + promote/demote tool + memory-write inheritance + backfill discipline. Brief 227 lands at 13 ACs with all five Designer Open Questions resolved + ADR-003 amendment included + web-only-MVP Telegram decision aligned with Lisa's mobile-web walkthrough. **Coverage 10/10. AC count appropriate; one integration seam (memory-assembly join + scope-pill + promote-tool surface); no split needed.**

## After Completion

1. Update `docs/state.md` with what changed (memory-scope discipline + promote/demote tools + scope pill + proactive briefing proposal).
2. Update `docs/roadmap.md` Project Onboarding & Battle-Readiness phase row — sub-brief #4 marked complete.
3. Phase retrospective: did the `appliedProjectIds` array model prove maintainable, or did multi-project memories want a junction table? Did the proactive briefing proposal cadence feel right (frequent enough to be useful, sparse enough not to annoy)?
4. **Insight-205 absorption progress:** if sub-brief #2 has shipped (or ships before this), Insight-205 is already absorbed (per Brief 224 §AC #8: Insight-205 stays `active` until at least sub-brief #2 OR #3 ships; #2 discharges first). This brief contributes additional evidence but doesn't change the absorption status.
5. **ADR-003 amendment** is part of this brief's commit — ADR's process-scope semantics now widened to project-scope per §What Changes.
6. ADR check: no NEW ADR required for this brief; ADR-003 is amended in-place. ADR-043 (`.ditto/`) is sub-brief #3 territory.
