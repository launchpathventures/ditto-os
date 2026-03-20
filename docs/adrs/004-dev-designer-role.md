# ADR-004: Dev Designer as a Dedicated Development Role

**Date:** 2026-03-19
**Status:** accepted

## Context

Agent OS has six development roles, all engineering-oriented: PM, Researcher, Architect, Builder, Reviewer, Documenter. No role is explicitly constrained to think from the end-user's perspective — the non-technical person who will define, monitor, review, and improve processes.

The Architect currently owns "what interfaces look like" as a subordinate clause, but this makes UX a secondary concern within a technical design role. Research (see `docs/research/ux-process-design-role.md`) found that:

1. **Professional practice separates design and engineering** as distinct cognitive modes (Insight-010). Design starts with user desirability; engineering starts with technical feasibility. When blended, engineering dominates.
2. **gstack** (our strongest design-aware source project) has four dedicated design skills that gate engineering work.
3. **Dual-Track Agile** (industry gold standard) runs discovery (design) and delivery (engineering) as parallel tracks, not sequential phases.
4. **Agent OS's core value proposition is heavily design-dependent**: 16 UI primitives, Explore → Operate transition, implicit feedback capture, progressive trust visibility. These are design problems.

The gap has two dimensions:
- **Process Architecture (L1):** Does the process definition serve the user's mental model?
- **UI/Interaction Design (L6):** Does the interface serve the six human jobs?

Both are "user-first" concerns that benefit from the same cognitive orientation.

## Decision

Add a **Dev Designer** role as a seventh development role, implemented as the `/dev-designer` skill.

### What It Does

The Designer operates as a **dual-track parallel** to the Researcher:

```
PM → Dev Designer (UX research + interaction spec) ──┐
         ↓ (parallel with)                            ├→ Dev Architect → Builder → Reviewer
     Dev Researcher (technical research) ──────────────┘
```

The Designer:
1. **Researches** UX/process patterns — "How should this feel for the end user? What's the gold standard interaction pattern?"
2. **Produces** interaction specs, process-architecture recommendations, and UX requirements that the Architect must address in the brief
3. **Reviews against** `docs/human-layer.md` (the design system) and the six human jobs framework

The Designer does NOT:
- Make technical design decisions (that's the Architect)
- Write implementation code (that's the Builder)
- Evaluate technical trade-offs (that's the Architect's synthesis job)

### Activation Decision

The **Dev PM** recommends whether the Designer should be invoked as part of work triage, based on the phase table below. The human can override (invoke when PM didn't recommend, or skip when PM did). When in doubt, invoke — the Designer can quickly determine "no user-facing changes" and exit.

### Conditional Activation (Option E modifier)

Not every task needs the Designer. Activation is phase-aware:

| Phase | UX relevance | Designer activation |
|-------|-------------|-------------------|
| Phase 2-3 (engine) | Process definitions are being designed | Light: process architecture only, invoke when L1 definitions change |
| Phase 4 (CLI) | CLI IS a user interface | Medium: CLI interaction design |
| Phase 5 (E2E) | Full flow includes UX | Light: UX acceptance criteria |
| Phase 9 (Dashboard) | Entire phase is UX | Full: every task |
| Phase 10 (Explore → Operate) | Core UX innovation | Full: every task |

When the Designer is NOT invoked, the brief template's mandatory UX section (see below) provides a lightweight alternative.

### Brief Template Update

Add a mandatory **User Experience** section to `docs/briefs/000-template.md`:

```markdown
## User Experience

Which of the six human jobs does this work affect? (Orient, Review, Define, Delegate, Capture, Decide)
- **Jobs affected:** {list, or "None — no user-facing changes"}
- **Primitives involved:** {which of the 16 primitives, or "None"}
- **Process-owner perspective:** {how does the person using Agent OS experience this change?}
- **Interaction states:** {loading, empty, error, success, partial — for any UI-touching work}
- **Designer input:** {reference to Designer's interaction spec, or "Not invoked — lightweight UX section only"}
```

This section is populated by the Designer when invoked. When the Designer is not invoked, the Architect fills it as a lightweight check. The Reviewer verifies it's populated either way.

### Session Flow Update

**Pattern A (full flow) becomes:**
```
Human: "Let's pick up the next piece of work"
  → Dev PM: reads state.md + roadmap.md, recommends work
  → Dev Designer: UX/process research + interaction spec (if triggered)
  → Dev Researcher: scouts existing technical solutions (if research needed)
  → Dev Architect: designs solution incorporating both inputs, writes brief
  → Human: reviews and approves brief
  → Dev Builder: implements the brief
  → Automated checks: type-check, acceptance criteria
  → Dev Reviewer: challenges against architecture (fresh context)
  → Human: approve / reject / revise
  → Dev Documenter: updates state.md, roadmap.md, runs retro
```

Designer and Researcher can run **in parallel** since they're independent tracks.

**Pattern C (exploratory design) becomes:**
```
Human: "I want to think about X"
  → Dev Designer: explores UX patterns and process architecture
  → Dev Researcher: explores what exists technically
  → Dev Architect: designs the approach incorporating both
  → Dev Reviewer: challenges the design
  → Human: approves, refines, or parks it
```

### Separation Guidance Update

**Must be genuinely separated:**
- Builder and Reviewer (existing — maker-checker)
- Researcher and Architect (existing — neutrality)
- **Designer and Architect (new — cognitive mode separation).** The Designer thinks user-first; the Architect thinks feasibility-first. If blended, feasibility dominates (Insight-010).

**The Designer is NOT a reviewer of the Architect's work.** It is a producer that feeds the Architect. The Architect synthesises UX specs + technical research into a coherent brief. The existing Reviewer checks whether the brief honoured both inputs.

## Provenance

| Pattern | Source | Why this source |
|---------|--------|----------------|
| Dedicated design skills | gstack `/design-consultation`, `/plan-design-review`, `/design-review` | Proven separation of design and engineering in agent-dev context |
| Dual-track parallel (discovery + delivery) | Dual-Track Agile (Patton/Cagan) | Industry gold standard for design-engineering integration |
| Design as cognitive mode separation | NN/g research, Insight-010 | Professional evidence that design and engineering are different orientations |
| Conditional activation by phase | Original to Agent OS | No source project has phase-aware role activation |
| Mandatory UX section in briefs | Original to Agent OS, inspired by gstack's interaction state requirements | Mechanical enforcement when Designer isn't invoked |

## Consequences

- **Easier:** UX concerns get first-class treatment. The non-technical process-owner's perspective is represented in every design decision that warrants it.
- **Easier:** The Architect receives structured UX input alongside technical research — better briefs.
- **Easier:** The platform's own dev process models the pattern the platform will enforce (separate design and engineering governance).
- **Harder:** Seven roles is more to manage than six. Mitigated by conditional activation — many tasks won't invoke the Designer.
- **Harder:** The Architect must now synthesise two inputs (Designer + Researcher) instead of one. But this is the Architect's job — synthesis is what it does.
- **New constraint:** Brief template gains a mandatory UX section. Every brief must address user experience, even if the answer is "no user-facing changes."
- **Follow-up (blocking before ADR moves to accepted):**
  1. `.claude/commands/dev-designer.md` — **Done** (created alongside this ADR)
  2. `.claude/commands/dev-architect.md` — Add Designer output to Required Inputs. Add constraint: "MUST address the Designer's interaction spec in the brief's User Experience section (if Designer was invoked)"
  3. `.claude/commands/dev-pm.md` — Add activation recommendation to PM's triage output: "Recommend whether Dev Designer should be invoked based on the phase table in ADR-004"
  4. `docs/dev-process.md` — Update from six to seven roles, update session flow patterns, add Designer/Architect to separation guidance
  5. `docs/briefs/000-template.md` — Add mandatory User Experience section
  6. `CLAUDE.md` — Update role table from 6 to 7 roles, add `/dev-designer` to skills table
  7. `docs/roadmap.md` — Check and update any references to six-role process
  8. `docs/review-checklist.md` — Consider adding 9th point: "If a Designer interaction spec exists, does the brief/implementation honour it?"
