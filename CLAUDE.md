# Agent OS — Claude Code Instructions

## What This Project Is

Agent OS is a harness creator for human-agent collaboration. It creates the evolving, orchestrating harness within which agents operate — not the agents themselves. Process is the primitive. The harness is the product.

## Before You Do Anything

1. Read `docs/state.md` — what's working, what's in progress, what's blocked
2. Read `docs/roadmap.md` — the full capability map and current phase
3. If there's a brief for your task in `docs/briefs/`, read it

## Design Documents (read when relevant, not every session)

- `docs/personas.md` — Who we're building for: three personas, five problems, jobs-to-be-done, emotional journey. Primary lens for Designer and Architect.
- `docs/vision.md` — Why Agent OS exists, the insight, the principles. Independent of architecture.
- `docs/architecture.md` — Source of truth: six-layer spec, process primitive, trust tiers, harness patterns
- `docs/human-layer.md` — Layer 6 detailed design: 16 primitives, 8 views, wireframes, interaction patterns
- `docs/landscape.md` — Building blocks: what to adopt vs build, framework evaluations
- `docs/dictionary.md` — Canonical glossary of all Agent OS terms
- `docs/dev-process.md` — How Agent OS gets built: role contracts, session flows, quality check layering
- `docs/insights/` — Design discoveries that emerge during building. One file per insight. Capture here; absorb into architecture.md or ADRs when mature.

## Principles

1. **Composition over invention** — build from existing projects. First question: "what can we build FROM?" not "what can we build?"
2. **Research before design** — scout the gold standard before every significant decision
3. **Plan before build** — define the framework thoroughly before building agents
4. **Process as primitive** — the atomic unit is a process, not a task or agent
5. **The harness is the product** — agents are pluggable, processes are durable, the harness is unique value

## How Work Gets Done

Every piece of work follows: **Research → Design → Build → Review**

Roles can also be invoked standalone (e.g., strategic research, architecture evaluation, priority triage) — the skill determines next steps based on what it produced, not a hardcoded pipeline. See `docs/dev-process.md` for invocation modes.

Seven development roles govern how work proceeds. Each role is a skill (slash command) that constrains what the AI does in that role. Full contracts live in `.claude/commands/dev-*.md`. Reference doc: `docs/dev-process.md`.

| Role | Skill | Purpose |
|------|-------|---------|
| Dev PM | `/dev-pm` | Triage and sequence — what to work on next |
| Dev Designer | `/dev-designer` | UX research + interaction specs — how should this feel? |
| Dev Researcher | `/dev-researcher` | Find existing solutions before design |
| Dev Architect | `/dev-architect` | Design the solution, produce briefs/ADRs |
| Dev Builder | `/dev-builder` | Implement the approved plan as code |
| Dev Reviewer | `/dev-reviewer` | Challenge work against architecture (fresh context) |
| Dev Documenter | `/dev-documenter` | Update state, roadmap, run retrospective |

**Critical separation:** Builder and Reviewer must be genuinely separated (maker-checker). The Reviewer is spawned as a separate agent with fresh context.

### Quality Check Layering

1. **Automated checks first** — `pnpm run type-check`, acceptance criteria from the brief
2. **Structured review second** — Dev Reviewer checks against the 8-point architecture checklist
3. **Human judgment last** — only on what passed everything else

### Review Process (mandatory)

After producing work for any phase or task:
1. Spawn a separate review agent with `docs/architecture.md` + `docs/review-checklist.md` as context
2. The review agent challenges the work against the architecture spec
3. Present both the work AND the review findings to the human
4. The human decides — approve, reject, or revise

This is the manual precursor to the automated harness. We dogfood the pattern we're building.

### Briefing System

Task briefs live in `docs/briefs/`. Each brief follows this structure:
- Context — why this work exists
- Objective — what success looks like
- Inputs — what to read first
- Constraints — boundaries
- Acceptance criteria — how to verify
- Output format — what to produce
- Review process — how to validate

### Design Insights

When a design discovery emerges during work, capture it in `docs/insights/` using the template at `docs/insights/000-template.md`. Insights are provisional principles — they stage here until mature enough to absorb into the architecture spec or become an ADR.

### After Completing Work

Each producing role (Designer, Researcher, Architect, Builder) does a **minimum state checkpoint** — updating `docs/state.md` with what was produced and where it lives. This is built into each skill.

The **full wrap-up** is the Documenter's job. Invoke `/dev-documenter` at the end of any session that changed project state — not just after building. This includes sessions that only produced research, ADRs, or insights.

The Documenter handles:
1. Update `docs/state.md` with what changed (verify the producing role's checkpoint)
2. Update `docs/roadmap.md` status if a milestone was reached
3. Update `docs/landscape.md` if research revealed stale evaluations
4. Capture any design insights that emerged (→ `docs/insights/`)
5. Run phase retrospective: what worked, what surprised us, what to change

**Rule: if `docs/state.md` changed during the session, the Documenter should run before the session ends.**

## Conventions

- pnpm for package management
- TypeScript strict mode
- ADRs in `docs/adrs/` for significant decisions (use `docs/adrs/000-template.md`)
- Provenance required: every pattern must trace to a source project or be marked as original
