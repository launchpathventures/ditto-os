# Agent OS — AI Agent Instructions

## What This Project Is

Agent OS is a harness creator for human-agent collaboration. It creates the evolving, orchestrating harness within which agents operate. Process is the primitive. The harness is the product. See `docs/vision.md` for the full picture.

## Start Here

1. Read `CLAUDE.md` for persistent project instructions
2. Read `docs/state.md` for what's working, blocked, and in progress
3. Read `docs/roadmap.md` for the full capability map and current phase
4. If there's a brief for your task in `docs/briefs/`, read it before starting

## Architecture

Read `docs/architecture.md` for the six-layer spec. Read `docs/human-layer.md` for Layer 6 detail. Read `docs/landscape.md` for building blocks and component decisions. See `docs/dictionary.md` for the canonical glossary of all terms.

## Key Concepts

- **Process** — the atomic unit. Inputs → steps → outputs, with quality criteria and feedback loops.
- **Harness** — review patterns where agents check each other's work. The core differentiator.
- **Trust tier** — per-process autonomy level (supervised → spot-checked → autonomous → critical), earned through track record.
- **Feedback** — implicit capture. Edits ARE feedback. Every human decision is recorded.
- **Composition** — build from proven open-source projects. Only write what's genuinely unique.

## Conventions

- `pnpm` for package management
- TypeScript strict mode
- Every pattern must have provenance (source project) or be marked as "Original to Agent OS"
- ADRs in `docs/adrs/` for significant decisions

## Project Structure

```
docs/
  architecture.md     # Six-layer architecture spec (source of truth)
  human-layer.md      # Layer 6 detailed design (16 primitives, wireframes)
  landscape.md        # Building blocks — what to adopt vs build
  vision.md           # Why Agent OS exists
  roadmap.md          # Full capability map with phase tracking
  state.md            # Current state of play
  dictionary.md       # Canonical glossary (95+ entries)
  review-checklist.md # 8-item architecture review checklist
  adrs/               # Architecture Decision Records
  briefs/             # Task briefs for each phase
  research/           # Deep research with source file provenance
processes/            # Process definitions (YAML)
src/
  engine/             # Heartbeat, harness, trust, process-loader
  adapters/           # Agent runtime adapters (Claude, script)
  db/                 # Database schema and connection
```

## How Work Gets Done

### The Loop

Every piece of work follows: **Research → Design → Build → Review**

### Briefing System

Task briefs in `docs/briefs/` follow this structure:
- **Context** — why this work exists
- **Objective** — what success looks like
- **Inputs** — what to read first
- **Constraints** — boundaries and things NOT to do
- **Provenance** — source projects for each pattern
- **Acceptance criteria** — how to verify completion
- **Review process** — how to validate the work

**Provenance:** Briefing pattern combines antfarm's three-file model (AGENTS.md + SOUL.md + IDENTITY.md), Paperclip's SKILL.md structure, and Claude Code's CLAUDE.md convention.

### Review Process (mandatory)

After completing work:
1. Spawn a separate review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent challenges work against the architecture spec (12-point checklist)
3. Present both work AND review findings to human
4. Human decides: approve, reject, or revise

After approval:
1. Update `docs/state.md`
2. Update `docs/roadmap.md` status
3. Phase retrospective: what worked, what surprised, what to change

## First Implementation

Agentic coding team — see `docs/architecture.md` "First Implementation" section. The coding team is the testbed for the framework, not the goal.
