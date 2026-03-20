# Brief: Debt Tracking — First-Class Capture of Known Compromises

**Date:** 2026-03-19
**Status:** complete
**Depends on:** none
**Unlocks:** Phase 4, Phase 9

## Goal

- **Roadmap phase:** Cross-cutting (touches L1 Process, L3 Harness, L5 Learning)
- **Capabilities:** Debt capture, debt lifecycle, debt surfacing in status

## Context

Insight-006 identified that technical and process debt currently lands in fragile, non-queryable places: `docs/state.md` "Known Issues" (manual, drifts), inline `// TODO` comments (invisible to the system), and reviewer notes that get acknowledged then forgotten.

This was triggered directly during Phase 2b: the reviewer flagged real issues, the builder dismissed them as "acceptable at dogfood scale", and the human challenged why we'd carry debt forward silently.

### Information Architecture Principle

Agent OS already has a clear split between two knowledge systems:

| System | What | Examples | Why |
|--------|------|----------|-----|
| **Git-tracked markdown** | Human-authored design knowledge with lifecycle | ADRs, insights, briefs, research | Version history, human-readable, reviewed in PRs |
| **SQLite tables** | Runtime state generated during execution | feedback, memories, activities, harness decisions | High-volume, programmatic, queried by the engine |

Debt is human-authored design knowledge. It's created during reviews and retros, not during process execution. It benefits from git history (who deferred what, when, and why). It's part of the project's self-knowledge — exactly like insights and ADRs. **Debt belongs in `docs/debts/` as markdown files, not in the database.**

## Objective

After this work: every conscious compromise has a markdown file in `docs/debts/` with frontmatter capturing what was deferred, why, and when to revisit. The CLI `debt` command reads the folder and surfaces unresolved debt. The dev process captures debt at the point of creation.

## Non-Goals

- **Automated debt detection** — no scanning for TODO comments or code smells. Debt is captured by humans and agents making conscious decisions.
- **Debt prioritisation or scoring** — severity is recorded but no algorithm ranks debt.
- **Harness integration** — the engine does not create debt files. Debt comes from the development process (reviews, retros), not from runtime execution.
- **Debt visualisation** — Phase 9 (dashboard). CLI surfacing is sufficient for now.
- **Debt-to-improvement pipeline** — resolving debt by converting it to an improvement proposal is a future workflow.

## Inputs

1. `docs/insights/006-debt-needs-first-class-capture.md` — the triggering insight
2. `docs/adrs/000-template.md` — ADR template (debt template follows same conventions)
3. `docs/insights/000-template.md` — insight template (same frontmatter pattern)
4. `src/cli.ts` — current CLI (add debt command)
5. `docs/state.md` — current "Known Issues" section (migrate existing items)

## Constraints

- **Markdown files, not database** — follows the git-tracked knowledge pattern established by ADRs, insights, briefs, and research. The database is for runtime state.
- **Frontmatter for structure** — same pattern as insights (name, description, status in YAML frontmatter). Enables CLI to parse and display without a database.
- **No new dependencies** — standard file system + YAML parsing (already in use).
- **Existing CLI commands must keep working** — debt commands are additive.
- **Migrate existing state.md "Known Issues"** — current known issues become debt files. state.md Known Issues section becomes a pointer.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Markdown with frontmatter lifecycle | Agent OS insights system (`docs/insights/`) | Proven pattern in this project — numbered files, YAML frontmatter, status tracking |
| Numbered file convention | Agent OS ADRs (`docs/adrs/`) | `NNN-slug.md` naming already established |
| Re-entry conditions | Roadmap's "Re-entry condition" pattern for deferred phases | Agent OS already uses this pattern for deferred infrastructure |
| CLI folder scanning | Agent OS process loader (`src/engine/process-loader.ts`) | Reads a folder, parses YAML, reports status — same pattern |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/debts/000-template.md` | **Create**: Debt template with frontmatter schema |
| `docs/debts/001-*.md` through `docs/debts/00N-*.md` | **Create**: Migrated known issues from state.md |
| `src/cli.ts` | **Modify**: Add `debt` command (reads `docs/debts/`, displays grouped by severity) |
| `docs/state.md` | **Modify**: Replace Known Issues with pointer to `docs/debts/` |

## Design

### Debt File Format

```markdown
---
title: Budget accounting excludes section headers
severity: low | medium | high
status: deferred | resolved
scope: src/engine/harness-handlers/memory-assembly.ts
source: review | build | retro | manual
reentry: "When memory count per scope exceeds 500"
created: 2026-03-19
resolved: null
---

## What

[Description of the specific compromise or gap]

## Why Deferred

[The conscious trade-off — not "dogfood scale" but the specific reasoning]

## Re-entry Condition

[Concrete, testable condition for when this should be revisited]

## Resolution

[Filled in when resolved — what was done, by whom, in which commit/brief]
```

**Why this format:**

- **Frontmatter** enables CLI parsing. Same pattern as insights and ADRs.
- **Severity in frontmatter** enables grouping and filtering without reading the full file.
- **Status** is two-state: `deferred` (actively tracked) and `resolved` (done). Capturing debt IS acknowledging it — if you can't articulate the reason and re-entry condition, you haven't made a conscious trade-off.
- **Scope** is free-text: file paths, layers, process slugs, "system". Enables filtering.
- **Source** tracks where this was identified: review findings, build surprises, retro observations, or manual entry.
- **Body sections** provide the narrative that frontmatter can't capture. The "Why Deferred" section is the key differentiator from a TODO comment.

### Naming Convention

`docs/debts/NNN-slug.md` — same as ADRs and insights. Sequential numbering. Slug is a short identifier.

### CLI Command

```
pnpm cli debt              # List all deferred debt, grouped by severity (high first)
```

The CLI reads `docs/debts/*.md`, parses frontmatter, filters by `status: deferred`, groups by severity, and displays title + scope + re-entry condition. No database involved.

The `status` command gains a debt summary line: `DEBT: 3 high, 5 medium, 2 low`.

**No `debt add` command.** Debt files are created by the developer/agent during the session, same as insights and ADRs. The template provides the structure. Creating debt through the CLI would add indirection without value — the content requires thought, not a form.

**No `debt resolve` command.** Resolution is editing the file: set `status: resolved`, `resolved: date`, fill in the Resolution section. Git tracks the change.

### Dev Process Integration

Process change, not code change. After this brief is built:

1. **Builder role**: when the reviewer flags an issue and the human decides not to fix it now, the builder creates a debt file. Required fields force articulation of the trade-off.
2. **Documenter role**: during retrospective, any "what surprised us" items that represent known compromises become debt files.
3. **State.md**: the "Known Issues" section becomes `See docs/debts/ for tracked debt items.`

### Migration of Existing Known Issues

The current `docs/state.md` Known Issues section has items. The builder migrates each as a debt file with proper reasoning and re-entry conditions — not a mechanical copy, but a conscious articulation of each trade-off.

## Acceptance Criteria

1. [ ] `docs/debts/000-template.md` exists with frontmatter schema matching this brief's design
2. [ ] All current state.md Known Issues migrated to `docs/debts/` files with reasons and re-entry conditions
3. [ ] `pnpm cli debt` lists all deferred debt grouped by severity (high first)
4. [ ] `pnpm cli status` shows a debt summary line (count by severity)
5. [ ] state.md Known Issues section replaced with pointer to `docs/debts/`
6. [ ] `pnpm run type-check` passes with zero errors
7. [ ] Debt files follow the same frontmatter pattern as insights (parseable YAML)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Focus areas: consistency with insights/ADR pattern, completeness of migration, CLI correctness
3. Present work + review findings to human

## After Completion

1. Update `docs/state.md` — debt system live, Known Issues migrated
2. Update `docs/roadmap.md` — add debt tracking as a cross-cutting capability
3. Update `docs/insights/006-debt-needs-first-class-capture.md` status to `absorbed into debt-tracking brief`
4. Update dev role skills (builder, documenter) to reference debt capture
