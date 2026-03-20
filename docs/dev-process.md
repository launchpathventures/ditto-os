# Agent OS — Development Process

**Last updated:** 2026-03-19

This document describes how Agent OS gets built. It formalises the role separation that disciplines each development session — the solo-founder hat-switching problem made explicit.

---

## Why Role Separation

Agent OS is built by a human and a single AI agent. The AI plays every role — PM, researcher, architect, builder, reviewer, documenter. Without explicit separation, roles blur: the builder redesigns mid-implementation, the reviewer softens findings on its own work, the researcher skips to recommending.

Role separation doesn't require multiple agents. It requires conscious hat-switching — like a solo founder who puts on their marketing hat, then their product hat, then their sales hat. The mental frame changes even when the person doesn't.

Each role is implemented as a **skill** (slash command) that loads the role contract into active context. When invoked, the skill constrains what the AI does and doesn't do in that role.

---

## The Seven Development Roles

| Role | Skill | One-line purpose |
|------|-------|-----------------|
| **Dev PM** | `/dev-pm` | Triage and sequence — what to work on next |
| **Dev Designer** | `/dev-designer` | UX research + interaction specs — how should this feel for the user? |
| **Dev Researcher** | `/dev-researcher` | Find existing solutions — what can we build FROM? |
| **Dev Architect** | `/dev-architect` | Design the solution — produce briefs and ADRs |
| **Dev Builder** | `/dev-builder` | Implement the approved plan as code |
| **Dev Reviewer** | `/dev-reviewer` | Challenge the work against the architecture |
| **Dev Documenter** | `/dev-documenter` | Update state, roadmap, run retrospective |

The full contract for each role lives in `.claude/commands/dev-*.md`. This document summarises the system; the skills are the source of truth.

### Automated Pipeline (Primary)

The dev pipeline orchestrator (`pnpm dev-pipeline`) chains roles automatically via `claude -p`, pausing at review gates for human approval. This is the primary invocation method — the human reviews outputs and provides feedback from the terminal or via Telegram.

```
pnpm dev-pipeline "Build Phase 4"     — start a new pipeline
pnpm dev-pipeline --resume             — resume from last checkpoint
pnpm dev-pipeline --status             — show current pipeline status
pnpm dev-bot                           — start Telegram bot for mobile review
```

The orchestrator reads role contracts from `.claude/commands/dev-*.md`, passes context between roles via files in `data/sessions/`, and checkpoints state to `data/dev-session.json`. See Brief 015 and Insight-032.

### Manual Invocation (Alternative)

Roles can still be invoked manually via slash commands in Claude Code when the full pipeline isn't needed (e.g., standalone research, quick fixes, exploratory design).

---

## Session Flow Patterns

### Pattern A: Pick up the next brief (most common)

```
Human: "Let's pick up the next piece of work"
  → Dev PM: reads state.md + roadmap.md, recommends work + Designer activation
  → Dev Designer: UX/process research + interaction spec (if PM recommends)
  → Dev Researcher: scouts existing solutions (if research needed)
     ↑ Designer and Researcher can run in parallel
  → Dev Architect: designs solution incorporating both inputs, writes brief
  → Human: reviews and approves brief
  → Dev Builder: implements the brief
  → Automated checks: type-check, acceptance criteria
  → Dev Reviewer: challenges against architecture (fresh context)
  → Human: approve / reject / revise
  → Dev Documenter: updates state.md, roadmap.md, runs retro
```

### Pattern B: Fix a small issue

```
Human: "Fix this specific problem"
  → Dev Builder: implements the fix
  → Automated checks: type-check
  → Dev Reviewer: checks the fix (can be lighter-weight)
  → Human: approve
  → Dev Documenter: updates state.md if needed
```

### Pattern C: Exploratory design session

```
Human: "I want to think about X"
  → Dev Designer: explores UX patterns and process architecture
  → Dev Researcher: explores what exists technically
     ↑ can run in parallel
  → Dev Architect: designs the approach incorporating both
  → Dev Reviewer: challenges the design
  → Human: approves, refines, or parks it
```

### Pattern D: Documentation only

```
Human: "Update the docs for what we did"
  → Dev Documenter: updates state.md, roadmap.md
  No review needed for pure state tracking.
```

---

## Invocation Modes

Every dev role skill determines its next steps based on what it produced, not from a hardcoded pipeline position. This is a conditional handoff — the skill does its work normally, then suggests appropriate next steps based on output type.

The two most common patterns:

**In-flow** — the skill is part of the Research → Design → Build → Review pipeline. It was invoked after the previous role and hands off to the next. Handoffs follow the pipeline: PM → Designer/Researcher → Architect → Builder → Reviewer → Documenter.

**Standalone** — the skill is invoked independently for its specific capability, outside the pipeline. Examples: Researcher exploring a strategic question, Architect evaluating research against the architecture, PM triaging without initiating a build, Designer exploring UX concepts that feed back into design docs.

These are the common cases, not the only two — partial pipelines (e.g., Pattern B's Builder → Reviewer → Human) also exist. The mechanism handles the spectrum: look at what was produced, suggest what makes sense next.

- **Produced an artifact that feeds the pipeline** (research for a specific design, UX spec for a brief, brief for a build) → hand off to the next pipeline role
- **Produced a self-contained artifact** (strategic research, an ADR, an architecture update, a triage assessment, a design insight) → hand off to Documenter or session end

The state update and review loop apply in both cases. The difference is only in what comes after.

---

## Separation Guidance

### Must be genuinely separated

**Builder and Reviewer.** This is the most critical separation. The architecture's maker-checker pattern requires it. The reviewer must operate with fresh context — spawned as a separate agent. Blending these defeats the purpose. The developer does not mark their own homework.

**Researcher and Architect.** The researcher presents options neutrally. The architect makes decisions. If blended, research gets biased toward the solution you already want to build. The "composition over invention" principle requires honest research that might conclude "there's nothing to borrow here."

**Designer and Architect.** The designer thinks user-first (desirability → feasibility). The architect thinks feasibility-first (feasibility → desirability). These are genuinely different cognitive orientations (Insight-010). If blended, engineering thinking dominates and UX becomes a checklist item. The designer produces interaction specs; the architect synthesises them with technical research into a coherent brief.

### Should be separated but can be lighter-weight

**PM and Architect.** Different questions: what to work on vs how to do it. But in a solo-founder context, the PM role is often 30 seconds of reading state.md. It doesn't need heavyweight separation — just a conscious pause.

**Builder and Documenter.** Different outputs but similar context. Separating them prevents "I'll update the docs later" drift.

### Fine to blend

**PM and Documenter.** Both are about project state awareness. The PM reads state; the Documenter writes state. Same mental frame.

### Pattern E: Standalone role invocation

```
Human: "Explore/evaluate/assess X" or "What's the state of Y?"
  → Role skill: does the work, produces artifact
  → Dev Reviewer: challenges the work (still mandatory for producing roles)
  → Human: approves
  → Dev Documenter: updates state (if state changed)
```

This pattern applies when a role is invoked for its own capability rather than as a step in the build pipeline. The key difference from Patterns A-C: there is no assumption that the work leads to a brief or build. The artifact (research report, ADR, insight, triage assessment) is the deliverable.

---

## Brief Sizing (Insight-004)

A brief is both a design document and a build instruction. These have different size constraints. A phase-level design is valuable for coherence, but a phase-level build instruction creates compounding integration risk.

**Rule:** If a brief has **>17 acceptance criteria** or touches **>3 subsystems**, split it.

**How to split:**
1. Write the **parent brief** first — full phase design showing how pieces fit together
2. Split into **sub-briefs** along dependency seams, each independently testable and shippable
3. Sub-briefs declare **Depends on** and **Unlocks** to make build order explicit
4. The parent brief stays as the design reference; sub-briefs are what the builder implements

**Sizing heuristics for sub-briefs:**
- 8-17 acceptance criteria
- One integration seam (plugs into the system at one point)
- Testable in isolation (can verify without the next sub-brief)
- Shippable (system is better after this sub-brief, even if the phase isn't complete)

**Natural seams for splitting:**
- Skeleton + flesh (interfaces and stubs first, real implementations second)
- Core path + extensions (critical path first, capabilities that plug in second)
- Data + logic (schema first, code that uses it second — though often small enough to combine)

This is enforced in the Dev Architect skill as a mandatory constraint.

---

## Artifact Lifecycle Management

Project artifacts (briefs, insights, debts, research) have lifecycles. Keeping them organized by status prevents stale knowledge from accumulating and makes the active working set immediately visible.

### Briefs (`docs/briefs/`)

| Location | Contains |
|----------|----------|
| `docs/briefs/` | Template (`000-template.md`) + active briefs (in_progress, ready) |
| `docs/briefs/complete/` | Completed briefs — all AC pass, work is done |

When the Builder completes a brief and it's approved, move it to `complete/`. New briefs are created in the root directory.

### Insights (`docs/insights/`)

| Location | Contains |
|----------|----------|
| `docs/insights/` | Template + active insights — principles still informing design decisions |
| `docs/insights/archived/` | Absorbed or superseded insights — fully codified in durable docs (architecture.md, ADRs, dev-process.md) or replaced by newer understanding |

Insight statuses:
- **active** — still informing decisions, not yet fully codified elsewhere
- **absorbed into {doc}** — principle is fully captured in a durable document; the insight is historical context
- **superseded by Insight-{N}** — understanding has changed; the newer insight replaces this one

**The Documenter audits insights** at the end of every session that changes project state:
1. Check active insights against `docs/architecture.md`, `docs/roadmap.md`, and `docs/adrs/`
2. If an insight is now fully codified in a durable doc, mark it absorbed and move to `archived/`
3. If an insight contradicts current understanding, mark it superseded with a pointer to what replaced it
4. Never delete insights — the history of why we changed our mind is valuable

**Numbering:** Each insight gets a unique sequential number. Never reuse numbers, even for archived insights.

### Debts (`docs/debts/`)

Debts stay in the root directory. Status is tracked in YAML frontmatter (`deferred` / `resolved`). No subdirectories needed at current scale.

### Research (`docs/research/`)

Research reports stay in the root directory. They are durable artifacts (ADR-002) and don't have a lifecycle beyond "complete."

---

## Knowledge Maintenance (Insight-043)

Reference docs are maintained by the roles that use them, not by a centralised cleanup pass. The role that discovers drift is the cheapest point to fix it. This is the manual precursor to the product's knowledge lifecycle meta-process (Insight-042).

### Ownership Model

| Doc type | Owner (fixes) | Consumers (flag) |
|----------|---------------|------------------|
| `docs/state.md`, `docs/roadmap.md` | PM | All roles |
| `docs/adrs/*.md`, `docs/architecture.md` | Architect | Builder, Reviewer |
| `docs/landscape.md`, `docs/research/*.md` | Researcher | Architect |
| `docs/personas.md`, `docs/human-layer.md` | Designer | Architect |
| `docs/dev-process.md`, `docs/review-checklist.md` | Architect | PM, Documenter |
| `CLAUDE.md` | Architect | All roles |
| `docs/insights/*.md` lifecycle | Documenter | All roles create |
| `docs/vision.md`, `docs/dictionary.md` | No single owner | Documenter audits |
| `docs/changelog.md` | Documenter | — |
| `docs/debts/*.md` | Builder creates | Documenter audits |

**Flag vs fix:** Roles that own a doc type fix drift directly. Roles that consume a doc flag drift in their output for the owner to address. When parallel roles (Designer + Researcher) encounter shared docs, both flag — the downstream Architect resolves.

**Handoff visibility:** Every producing role's output includes a "Reference docs" line:
- `Reference docs updated: [list of files changed]`
- `Reference docs checked: no drift found`
- `Reference doc drift flagged: [description]`

This makes maintenance visible to the Reviewer (checklist point 12) and auditable by the Documenter.

**The Documenter's shifted role:** Cross-cutting audit of what nobody touched this session. The Documenter still sweeps all docs but producing roles catch most drift earlier, making the sweep faster and focused on gaps.

**Verification:** After 5 sessions under this model, the Documenter reports in the retrospective whether drift was caught by producing roles or by audit. If mostly caught by audit, the constraints need strengthening.

**Provenance:** Insight-043 (point of contact), Insight-042 (meta-process), Insight-022 (active pruning). Original to Agent OS.

---

## Quality Check Layering

Software development has a self-governing quality infrastructure: linters, type checkers, tests, CI/CD. These catch errors mechanically before human review. The agent doesn't need to be perfect — it needs to be testable.

Agent OS development applies this principle directly:

1. **Automated checks run first** — `pnpm run type-check` + `pnpm test` + smoke test from the brief
2. **Structured review second** — Dev Reviewer checks against the 12-point architecture checklist, including verification that the Builder ran tests and smoke test
3. **Human judgment last** — only on what passed everything else

The Builder owns all automated quality gates: type-check, test suite, smoke test execution, and test authoring for new code. The Reviewer verifies these were run (checking for evidence) and challenges the work architecturally. There is no separate QA/Tester role — testing is a quality dimension distributed across Builder (execution) and Reviewer (verification). See Insight-038.

**Re-entry condition:** When a web UI ships (Phase 10), revisit whether a dedicated QA role with browser-based behavioral testing is needed (gstack `/qa` pattern).

This layering is the seed for the harness's general quality infrastructure (see Insight-001: Quality Criteria Are Additive).

---

## Provenance

The seven-role development process is **original to Agent OS**. No existing framework formalises how a single AI agent should switch between constrained roles during a collaborative development session. The closest analogues are:

- **gstack** — defines specialised agent roles (planner, builder, reviewer) but for product work, not meta-development
- **antfarm** — enforces maker-checker separation but through separate agent invocations, not role contracts
- **Rust RFC process** — the brief template draws from RFC structure (context, motivation, design, drawbacks)

The insight system (one file per discovery, template-based, absorbed when mature) is **original** — a staging ground between informal observations and formal ADRs.

## Feedback Capture

In the automated harness, every human decision (approve/edit/reject) is recorded in the feedback table and feeds the learning layer. In the manual dev process, this structured capture doesn't exist yet.

Currently, feedback from the development process is captured through:
- **Conversation** — the human's corrections and observations (ephemeral)
- **State updates** — what changed and retrospective notes (durable but unstructured)
- **Insights** — design discoveries captured in `docs/insights/` (durable and structured)

What's missing: a structured record of *why* work was approved, rejected, or revised. This becomes available when the harness exists — at that point, the dev process's approve/reject decisions flow through the same feedback pipeline as any other process.

For now, the retrospective ("what worked, what surprised, what to change") is the closest substitute. The Dev Documenter skill captures this explicitly.

## From Skills to Harness

These role contracts are the manual precursor to the automated harness. Here's how each element maps:

| Role Contract Element | Future Harness Equivalent |
|----------------------|--------------------------|
| Purpose statement | Agent system prompt |
| Constraints (MUST NOT) | Harness enforcement rules (L3) |
| Required inputs | Process step inputs (L1) |
| Expected outputs | Process step outputs (L1) |
| Handoff protocol | Step sequencing + dependency resolution (L2) |
| "Fresh context" requirement | Session management policy (L2) |
| Automated checks | Executable quality criteria (L3) |

The transition from skills to harness is a trust decision, not an architecture decision. Skills rely on AI discipline + human oversight. The harness enforces mechanically. Convert when you want automated enforcement — when the process is repeatable enough and the quality criteria are mature enough that the system can govern itself.

This follows the project's own core thesis: **conversation crystallises into process definition.**
