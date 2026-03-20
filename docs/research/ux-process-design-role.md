# Research: UX & Process Design Role in the Dev Flow

**Date:** 2026-03-19
**Question:** Does Agent OS need a dedicated UX/Process Design role in its development flow? Where would it sit?
**Status:** Complete — reviewed and revised

---

## The Gap

Agent OS has six dev roles, all engineering-oriented:

| Role | Thinks about |
|------|-------------|
| Dev PM | What to work on next |
| Dev Researcher | What exists to build from (technical) |
| Dev Architect | How to build it (technical design) |
| Dev Builder | Write the code |
| Dev Reviewer | Does it match the architecture? |
| Dev Documenter | Track state changes |

**What's missing:** No role is explicitly constrained to think from the **end-user's perspective** — the non-technical person who will define, monitor, review, and improve processes. The Architect currently owns "what interfaces look like" (per its skill definition), but this is a secondary concern folded into technical design, not a primary lens.

Agent OS's core value proposition is heavily UX/process-design-dependent:
- 16 universal UI primitives (human-layer.md)
- Explore → Operate transition (conversation crystallising into process)
- "Everyone will be a manager and delegator" (design for non-managers)
- Six human jobs framework (Orient, Review, Define, Delegate, Capture, Decide)
- Progressive trust visibility
- Implicit feedback capture (edits ARE feedback)

These are design problems, not engineering problems. The architecture docs describe WHAT these should do. But no role is responsible for HOW they feel, whether the interaction patterns work, or whether a process-owner's mental model is served.

### Two Distinct Concerns Within the Gap

The gap is not one thing — it splits into two:

**1. Process Architecture (L1)** — Does the process definition itself serve the user's mental model? Is it decomposed well? Does a non-technical person understand what this process does, what it consumes, what it produces? This is about the *structure* of processes — the foundation that everything else renders.

**2. UI/Interaction Design (L6)** — Does the interface serve the six human jobs? Are interaction patterns coherent? Does progressive disclosure work? Do the 16 primitives compose correctly for each view?

These are related but distinct. Process architecture concerns apply in **every phase** (even Phase 1-5 engine work produces process definitions that eventually surface to users). UI/interaction design concerns apply most heavily in **Phase 9+** (dashboard/UI) but also in Phase 4 (CLI UX).

A process schema designed without the user's mental model in mind creates a L1 problem that no amount of L6 UI polish can fix. Conversely, a well-structured process rendered through a poor interface wastes the structural work.

---

## What Exists: Design Roles in Source Projects

### gstack (strongest agent-dev reference)

gstack separates design and engineering into **distinct specialised roles** with different evaluation criteria:

| Skill | Purpose | When it runs |
|-------|---------|-------------|
| `/design-consultation` | Create design systems from scratch (aesthetic, typography, colour, spacing, motion) | New projects or major redesigns |
| `/plan-design-review` | Design critique on plans BEFORE implementation — 7 design passes including information architecture, interaction states, user journey, emotional arc, accessibility | After planning, before engineering review |
| `/design-review` | Live visual QA — 10-category audit with letter grades, AI slop detection, before/after screenshots | After implementation, before shipping |
| `/design-system` | Brand guidelines and design tokens as `DESIGN.md` | Design foundation |

**Key pattern:** gstack runs `/plan-design-review` BEFORE `/plan-eng-review`. Design gates engineering, not the other way around. Both run before building.

**Notable:** gstack's design review evaluates "user emotional arc" across 5-second, 5-minute, and 5-year time horizons. Interaction states (loading, empty, error, success, partial) must be specified for every UI feature before engineering begins.

### Other source projects

Paperclip, antfarm, ralph, and compound-product have no explicit design/UX roles. However:
- **Paperclip** has a tightly-coupled React UI with its own design patterns — UX decisions are embedded in the UI code rather than governed by a role
- **antfarm** defines agent "personalities" (SOUL.md) which shape how agents communicate with users — a form of interaction design, though not governed by a design role
- **compound-product**'s self-improvement cycle includes user-facing improvement proposals — the UX of these proposals affects adoption, but no design role evaluates them

None of these projects have formal design governance — they handle UX ad hoc.

---

## What Exists: Design-Engineering Patterns in Professional Product Development

Beyond agent-dev source projects, professional product teams have established patterns for integrating design and engineering:

### Pattern 1: Dual-Track Agile (Patton / Cagan) — considered the gold standard

Two parallel tracks run continuously: a **discovery track** (generating and validating product ideas) and a **delivery track** (building validated ideas into software). Designers and engineers participate in both tracks. There is no single handoff moment — design review happens continuously. Discovery feeds the delivery backlog; delivery feedback loops back into discovery.

**Relevance to Agent OS:** This maps naturally to parallel research tracks (Option B below). The discovery track is UX/process research; the delivery track is technical research → architecture → build.

### Pattern 2: Design Ahead (one-sprint lead)

Designers work one sprint ahead of developers. Design for Sprint N+1 is finalised during Sprint N. Design review happens at sprint boundaries.

**Relevance to Agent OS:** Less applicable — Agent OS doesn't use sprints. But the principle of "design decisions are settled before engineering begins" matches gstack's ordering.

### Pattern 3: Design Critique Rituals (Spotify model)

Weekly cross-disciplinary design syncs where the entire team reviews UX direction. Not a phase-gate but a continuous ritual layered on top of whatever methodology the team uses. Shopify uses a similar pattern with WIP pull requests for early directional feedback.

**Relevance to Agent OS:** Could map to a lightweight design gate that runs periodically or on significant changes, rather than on every task.

### Pattern 4: Design Systems as Codified Decisions

Design systems (Material Design, Apple HIG, Atlassian) function as **pre-made design decisions** that reduce the need for per-feature design review. They establish constraints upfront (spacing, typography, component behaviour) so engineers can make design-consistent choices without designer involvement on every ticket. Design review then focuses on **novel interactions and strategic UX questions** rather than visual consistency.

**Relevance to Agent OS:** `human-layer.md` + the 16 primitives function as Agent OS's design system. If the design system is sufficiently detailed, many design decisions are pre-made — the design role only needs to activate for novel interactions, not every ticket.

### Key Finding from Professional Practice

Design thinking and engineering thinking are **genuinely different cognitive orientations**:
- Design thinking starts with **user desirability** and works toward technical feasibility
- Engineering thinking starts with **technical feasibility** and works toward desirability

Professional teams overwhelmingly separate these as distinct roles, but emphasise **close collaboration between specialists** rather than isolated handoffs. The most dysfunctional pattern is design input happening only before engineering ("throw it over the wall"). The most functional pattern is continuous involvement across problem-framing, spec, and review stages.

---

## Assessment: Is human-layer.md Sufficient as a UX Reference Standard?

The design role (whatever form it takes) needs a reference to review against. `docs/human-layer.md` is the candidate.

**What human-layer.md provides:**
- Design philosophy (six human jobs, "everyone will be a manager", progressive disclosure)
- All 16 primitives with ASCII wireframes, key design decisions, and interaction patterns
- View compositions (which primitives compose into which views)
- Experience narrative (a full user journey from first morning to scaling)
- Interaction patterns (approve/edit/reject, auto-approve, teach-this, batch operations)
- Mobile considerations and responsive principles

**What human-layer.md lacks:**
- **Interaction state specifications** — the wireframes show happy-path states. Loading, empty, error, and partial states are not specified per primitive (gstack requires these explicitly)
- **Accessibility requirements** — no WCAG targets or accessibility-specific design decisions
- **Process-owner mental model** — the doc describes what the system shows, not how the process owner thinks about their work. A "mental model map" (what concepts does the user hold, what transitions do they make?) would strengthen the reference
- **CLI-specific UX patterns** — Phase 4 CLI is not covered in human-layer.md; it's a separate design surface
- **Design tokens / spacing / typography** — no systematic design system (this is appropriate for current phase but will be needed before Phase 9)

**Verdict:** human-layer.md is **sufficient for Phase 2-5** (engine work) as a conceptual reference — it establishes the principles and primitives. It is **insufficient for Phase 9+** (dashboard/UI) as an implementation-ready design spec. The gaps (interaction states, accessibility, design tokens) will need to be filled before the UI build begins, and a design role would be the natural owner of that work.

---

## Where UX/Design Thinking Currently Lives in Agent OS

| Location | What it covers | Gap |
|----------|---------------|-----|
| `docs/human-layer.md` | 16 primitives, wireframes, interaction patterns, UX philosophy | No role enforces these during building; missing interaction states, accessibility |
| `docs/architecture.md` | Six human jobs framework, Explore/Operate modes | Referenced but not gated |
| Dev Architect skill | "what interfaces look like" (one line) | UX is a secondary concern, not the primary lens |
| `docs/research/trust-visibility-ux.md` | 18 UX patterns for trust display | Research exists but no role owned the UX perspective |

The UX design thinking exists in the docs. The gap is enforcement — no role is constrained to evaluate work through the user experience lens.

---

## Options

### Option A: New role — Dev Designer (dedicated skill)

Add a `/dev-designer` skill as a seventh role dedicated to UX and process architecture. This is a full agent role with its own skill contract, constraints, and handoff protocol — same status as Dev Researcher or Dev Architect.

**What it does:**
- Evaluates every design from the end-user's perspective (the non-technical process owner)
- Ensures process definitions serve the six human jobs
- Reviews interaction patterns, information architecture, progressive disclosure
- Validates that the Explore → Operate transition is coherent
- Checks that UI primitives compose correctly for each view
- Produces UX requirements or interaction specs that feed the Architect

**Where it sits in the flow:**
```
PM → Designer → Researcher → Architect → Builder → Reviewer
         ↑ (process/UX research)  ↑ (technical research)
```

Or alternatively, after the Architect:
```
PM → Researcher → Architect → Designer (review gate) → Builder → Reviewer
```

**Pros:**
- Explicit separation of UX thinking from technical thinking (same logic as Builder/Reviewer separation)
- Forces the user perspective into every piece of work
- Mirrors gstack's proven pattern of separate design gates
- Consistent with professional practice (separate design and engineering roles)
- The skill contract constrains the agent to think from the user's perspective — it cannot drift into technical concerns

**Cons:**
- Adds a seventh step to every flow (heavier process)
- Not every task needs UX thinking (infrastructure, schema changes) — though see Option E for mitigation
- Solo-founder context — more hats to switch
- Risk of the Designer and Architect producing conflicting designs that need reconciliation

**Mitigation for "heavier process":** Combine with Option E (conditional trigger) — only invoke when work touches user-facing concerns.

### Option B: Two research tracks feeding the Architect

Split research into parallel tracks that both feed into the Architect:

```
         ┌→ Dev Researcher (technical) ──────┐
PM →     │                                    ├→ Dev Architect → Builder → Reviewer
         └→ Dev UX Researcher (experiential) ─┘
```

**What UX Research does:**
- "How should this feel for the end user?"
- "What's the gold standard interaction pattern for this type of action?"
- "Does this align with the six human jobs?"
- "What does the process-owner's mental model look like for this capability?"
- Sources: human-layer.md, UX patterns in other products, process-owner mental models

**Pros:**
- Research stays neutral (both tracks present options, Architect decides)
- Maintains the Researcher/Architect separation — both research tracks scout without recommending
- The Architect gets both technical AND experiential inputs before designing
- Can run in parallel (faster than sequential)
- Maps to the Dual-Track Agile gold standard (discovery + delivery in parallel)

**Cons:**
- Still relies on the Architect to synthesise UX and technical concerns — if the Architect deprioritises UX, the research gets ignored
- Two research steps for every task feels heavy (though see Option E for mitigation)
- UX research without design authority — the UX researcher presents findings, but nobody gates whether the Architect actually honoured them

**Mitigation for "Architect ignores UX":** Add a UX section to the brief template that the Architect MUST fill in, citing the UX research. The Reviewer can then check: "did the brief address the UX research findings?"

### Option A+B Hybrid: Dev Designer as a skill that does UX research AND design

**This is what the user is asking about.** Instead of a pure researcher, add a `/dev-designer` skill that:
1. **Researches** UX/process patterns (like the Researcher, but through a user lens)
2. **Produces** UX requirements, interaction specs, or process-architecture recommendations (like the Architect, but constrained to the user perspective)

```
PM → Dev Designer (UX research + interaction spec) ──┐
         ↓ (can run parallel with)                    ├→ Dev Architect → Builder → Reviewer
     Dev Researcher (technical research) ─────────────┘
```

**What it produces:**
- UX research findings (what patterns exist, what the gold standard is)
- Interaction requirements ("this flow needs these states, this primitive composition, this progressive disclosure pattern")
- Process-architecture recommendations ("the process definition should be structured this way for the user's mental model")
- Reference to human-layer.md primitives that apply

**What it does NOT do:**
- Technical design (that's the Architect)
- Implementation (that's the Builder)
- Evaluation of trade-offs between UX and technical constraints (that's the Architect's synthesis job)

**Pros:**
- Clean separation: Designer thinks from user's perspective, Researcher thinks from technical perspective, Architect synthesises both
- The Designer has authority to produce design artifacts (not just research) — interaction specs, state diagrams, process-flow descriptions
- Maps to Dual-Track Agile: Designer is the discovery track, Researcher + Architect + Builder is the delivery track
- Consistent with gstack's model (design-specific skills with design-specific outputs)
- Skill contract prevents drift — the agent MUST think as the user, not as the engineer

**Cons:**
- Blurs the Researcher/Designer boundary — is it research or design? (Answer: both, which is how design actually works — you research to design)
- Requires the Architect to take the Designer's output seriously. Without a gate, the Designer's interaction spec could be ignored
- In Phase 2-5 (engine work), the Designer may have little to contribute beyond "this process definition should be user-readable"

**Key difference from pure Option B:** The Designer doesn't just present neutral findings — it produces actionable UX artifacts (interaction specs, state requirements) that the Architect must address in the brief. This gives UX thinking more weight than pure research.

### Option C: Expand the Architect to dual-lens

Keep six roles, but add explicit UX constraints to the Architect skill. The Architect must evaluate every design through BOTH a technical lens and a UX/process lens.

**Additions to Architect skill:**
- MUST evaluate designs against the six human jobs framework
- MUST specify interaction states for any UI-touching work
- MUST check human-layer.md for relevant primitives and patterns
- MUST describe the process-owner's experience, not just the technical design
- MUST include a "User Experience" section in every brief that addresses: which human job this serves, which primitives are involved, what the process-owner sees and does, what interaction states exist

**Mechanical enforcement:** Add a mandatory UX section to the brief template (`docs/briefs/000-template.md`). The Reviewer then checks: "does this brief have a populated UX section?" This mechanically prevents skipping.

**Pros:**
- No new role, simplest flow
- UX and technical design stay integrated (one coherent brief, no synthesis problem)
- Less hat-switching
- The brief template mechanically enforces UX thinking
- Works well when UX and technical concerns are tightly coupled (which they often are)

**Cons:**
- Blurs the separation — same cognitive orientation doing both user-first and feasibility-first thinking
- UX section may become a checkbox ("N/A — no user-facing changes") too easily
- No independent UX challenge — the Architect reviews its own UX thinking
- Professional practice suggests design and engineering are genuinely different cognitive modes that benefit from separation
- In Phase 9+ (UI build), the UX surface area may be too large for the Architect to handle alongside technical design

**When this works best:** Phase 2-5 (engine work) where UX concerns are real but lightweight. The mechanical enforcement (mandatory brief section) is a reasonable substitute for a separate role when the design surface is small.

### Option D: Design gate after Architect (review-style)

Add a UX review gate that runs after the Architect produces a brief, similar to how the Dev Reviewer runs after the Builder.

```
PM → Researcher → Architect → UX Review (fresh context) → Builder → Code Review
```

**What it does:**
- Separate agent (fresh context) reviews the brief from a UX/process-design perspective
- Checks: Does this serve the six human jobs? Is the interaction coherent? Would a non-technical user understand this? Are interaction states specified?
- Returns findings alongside the Architect's brief for human approval
- Can use a scoring system (like gstack's 0-10 per dimension) for structured feedback

**Pros:**
- Maker-checker pattern applied to design (consistent with project principles)
- Fresh context prevents the Architect's technical assumptions from biasing UX review
- Can be lightweight for non-UI tasks ("N/A — no user-facing changes")
- Doesn't require the Architect to be a UX expert — it checks the Architect's work
- Analogous to Spotify's design critique rituals — a review layer, not a production layer

**Cons:**
- Review after design may be too late to reshape fundamentally — if the Architect's technical design doesn't accommodate UX needs, the UX review can flag but not fix
- Adds latency between design and build
- Doesn't bring UX thinking into the research phase — the Architect designs without UX input, then gets critiqued
- The reviewer can say "this doesn't serve the user" but can't say "here's what would" (because it's a review role, not a design role)

**When this works best:** As a complement to another option — e.g., Option C (Architect with UX section) + Option D (UX review gate) gives both integrated design and independent challenge.

### Option E: Conditional trigger — phase-aware activation

Not a standalone option — this is a **modifier** applied to any of Options A-D. Only invoke the UX/Design role when work meets trigger conditions.

**Trigger conditions:**
- Any work touching L6 (Human Layer) or L1 process definitions
- Any UI primitive work (Phase 9+)
- CLI UX design (Phase 4)
- Process definition schema changes (any phase)
- Interaction pattern design
- The Explore → Operate transition

**For non-triggered work:** Current six roles unchanged.

**Mapping to roadmap phases:**

| Phase | UX/Design relevance | Recommended activation |
|-------|--------------------|-----------------------|
| Phase 2 (current) | Process definitions are being designed — L1 concern | Light: process architecture only |
| Phase 3 (Trust Earning) | Trust visibility is a core UX concern (Insight-009) | Medium: trust UX research + interaction spec |
| Phase 4 (CLI) | CLI IS a user interface — every command is an interaction | Medium: CLI interaction design |
| Phase 5 (E2E Verification) | Verifying the full flow includes verifying the UX | Light: UX acceptance criteria |
| Phase 9 (Web Dashboard) | The entire phase is UX | Full: every task needs design input |
| Phase 10 (Explore → Operate) | Core UX innovation — conversation crystallising into process | Full: this IS design work |

**Pros:**
- No overhead for pure infrastructure/engine work
- Scales design involvement with design surface area
- Prevents the "design role with nothing to do" problem in early phases

**Cons:**
- Risk of missing UX implications in "non-triggered" work
- Process definitions (L1) are always user-facing even when the work is "engine" — the boundary between "needs design" and "doesn't" is blurry
- Requires judgment about when to trigger — which itself is a design decision

---

## Professional Practice Summary

| Pattern | When design input happens | Agent OS analogue |
|---------|--------------------------|-------------------|
| **Dual-Track Agile** (gold standard) | Continuously — discovery and delivery in parallel | Option A+B Hybrid or Option B |
| **Design Ahead** | One phase ahead of engineering | Option A (Designer before Architect) |
| **Design Critique** (Spotify) | Periodic review ritual | Option D (UX review gate) |
| **Design System** (Material, Apple HIG) | Pre-made decisions reduce per-feature review | human-layer.md as reference standard |
| **Double Diamond** | Before specs (problem framing) + after specs (solution validation) | Option A+B (research) + Option D (validation) |

---

## Additional Considerations

### Designer and Documenter Interaction

If a Designer produces UX artifacts (interaction specs, process-flow descriptions), these are design documents that affect project state. The Documenter's job is to track state changes. Two approaches:

1. **Designer does a minimum state checkpoint** (like other producing roles — Researcher, Architect, Builder) updating `docs/state.md` with what was produced and where it lives. The Documenter verifies and enriches at session end.
2. **Documenter owns all state updates** and the Designer only produces artifacts. Simpler for the Designer, but creates a dependency.

The current pattern (producing roles do minimum checkpoint, Documenter does full wrap-up) suggests approach 1 for consistency.

### CLI vs Web: Different Design Surfaces

The design role applies differently depending on the interface surface:

| Surface | Design concerns | Phase |
|---------|----------------|-------|
| **Process definitions** (YAML/schema) | User mental model, readability, decomposition, naming | Any phase |
| **CLI** | Command naming, argument patterns, interactive prompts, output formatting, progressive disclosure via @clack/prompts | Phase 4 |
| **Web dashboard** | Full UI/UX: 16 primitives, view compositions, interaction states, responsive, accessibility, design tokens | Phase 9+ |
| **Mobile** | Capture-first UX, glanceable status, touch targets, offline support | Phase 12 |

A `/dev-designer` skill should be aware of which surface it's designing for. The evaluation criteria differ: CLI design prioritises discoverability and efficiency; web design prioritises visual hierarchy and progressive disclosure; process definition design prioritises mental model alignment.

---

## Open Questions for the Architect

1. Should the UX/process perspective be a **separate role** (cleaner separation) or an **expansion of existing roles** (simpler flow)?
2. If separate, should it sit **before the Architect** (shaping requirements) or **after** (reviewing designs), or **both** (research input + review gate)?
3. The hybrid A+B option gives the Designer both research and design authority. Does this violate the Researcher/Architect separation principle, or is it acceptable because the separation is along a different axis (user perspective vs technical perspective)?
4. Should Option E (conditional trigger) be the default, with the understanding that Phase 9+ will need the full design role while Phase 2-5 can be lighter?
5. Does Agent OS's dev process need to mirror the pattern it's building — i.e., if the platform has separate design and engineering governance, should the dev process that builds it also separate them?
6. Is human-layer.md sufficient for current phases, or does it need to be expanded (interaction states, accessibility, CLI UX) before a design role can review against it?

---

## Provenance

| Finding | Source |
|---------|--------|
| gstack design roles (4 skills) | gstack `SKILL.md`, `/design-consultation/SKILL.md`, `/plan-design-review/SKILL.md`, `/design-review/SKILL.md` |
| Design gates engineering pattern | gstack flow: `/plan-design-review` → `/plan-eng-review` → build |
| Dual-Track Agile (gold standard) | Jeff Patton, Marty Cagan — `jpattonassociates.com/dual-track-development/` |
| Design Ahead pattern | Caroli.org — `caroli.org/en/design-ahead/` |
| Design Critique rituals | Spotify Design — `spotify.design/article/collaboration-secrets-design-x-engineering` |
| Design systems as codified decisions | Material Design, Apple HIG, Atlassian Design System |
| Double Diamond (discover → define → develop → deliver) | British Design Council — `designcouncil.org.uk/our-resources/the-double-diamond/` |
| Design vs engineering cognitive orientation | NN/g — `nngroup.com/articles/developer-designer-relationship/` |
| Current Architect owns "interfaces" | `.claude/commands/dev-architect.md` line 7 |
| Six human jobs framework | `docs/human-layer.md` |
| human-layer.md assessment | Direct review of `docs/human-layer.md` content |
| No design roles in other source projects | Paperclip, antfarm, ralph, compound-product — engineering only (ad hoc UX embedded in code/config) |
