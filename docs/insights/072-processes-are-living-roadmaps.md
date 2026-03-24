# Insight-072: Every Piece of Work Gets a Process — Generated Processes Are Living Roadmaps

**Date:** 2026-03-23
**Trigger:** User reconciling task/goal/project tracking with the process primitive: "Think of these types of processes as living roadmaps for how the work will get done"
**Layers affected:** L1 Process, L2 Agent, L6 Human, Conversational Self (ADR-016)
**Status:** active

## The Insight

There is no "ad-hoc work without a process." Everything gets a process — the distinction is between pre-defined domain processes and processes generated on-the-fly as living roadmaps for specific work.

### Two Types of Process

| Type | How created | Lifecycle | Example |
|------|------------|-----------|---------|
| **Domain process** | Pre-defined (YAML), refined through use | Durable, repeatable, trust-earning | Invoice reconciliation, morning supplier update, weekly podcast scripts |
| **Generated process** | Created on-demand by meta-process or Self + skills for specific work | Adaptive, lives as long as the work needs it | "Prepare Henderson proposal", "Research CRM options", "Hire a new plumber by April" |

### Generated Processes as Living Roadmaps

When a user says "prepare the Henderson proposal by Friday," a meta-process (or the Self combined with existing skills) creates a process — a visible, trackable plan with clear steps:

1. Gather Henderson's requirements from email thread
2. Pull pricing from latest rate card
3. Draft proposal using proposal template
4. Review against quality criteria
5. Send to Henderson

This process is not static. It adapts based on feedback: "skip step 2, Henderson already agreed on pricing — just focus on the scope section." Steps can be reordered, added, removed, or refined as the work progresses. The process is the living roadmap.

### The Maturity Lifecycle

Generated processes may be one-off or may evolve:

```
User intent → Meta-process generates a living roadmap
                  │
                  ├── Work completes → process archived, learning captured
                  │
                  └── System detects pattern ("4 similar proposals this month")
                          │
                          └── Proposes templating as domain process
                                  │
                                  └── User approves → domain process (repeatable, trust-earning)
```

This is the reactive-to-repetitive lifecycle (ADR-010) made concrete. The bridge between "I need this done once" and "I want this done every time" is the generated process that proves the pattern.

### Generated Processes Are Still YAML

There is no reason generated processes should be a different format. The Self generates a process definition — steps, executors, inputs, outputs, quality criteria — and it's YAML just like any domain process. A sufficiently detailed spec IS the executable artifact. Whether it was hand-crafted over weeks or generated in seconds by the Self, it's the same primitive, the same schema, the same harness. The only differences are metadata: `origin: "generated"` and `lifecycle: "generated"` vs `"durable"`.

### The User Thinks in Work, Not Processes

**Critical:** "Process is the primitive" is the system's organising principle, not the user's mental model. The user thinks in goals, tasks, problems, and outcomes. They see:

- "Prepare Henderson proposal" — their work
- "Get quotes under 24 hours" — their outcome
- "Weekly podcast scripts" — their recurring need

The process is behind the work, not in front of it. The user only looks at the process when:

1. **They want to see HOW** — "show me the plan for the Henderson proposal" → they see the steps, the progress, the current state
2. **They want to refine HOW** — "the weekly podcast process skips the intro — fix that" → they see and edit the process definition

Otherwise, the process is invisible. The feed shows "Henderson proposal: draft ready for review" — not "process henderson-proposal step 4 complete." The work surface is organised around work items (goals, tasks, outcomes), not around processes. Processes are the execution layer that powers the work — visible on demand, not by default.

### What This Resolves

**Work items are the user-facing primitive. Processes are the execution primitive.** Every work item that requires execution gets a process — either by matching an existing domain process or by the Self generating a living roadmap. But the user tracks their work, not their processes.

This means:
- The work surface shows goals, tasks, outcomes — with status, progress, deadlines
- Drilling into a work item reveals the process powering it — the steps, who's doing what, where it's up to
- Domain processes (repeatable) are visible as "my recurring work" — invoice reconciliation, podcast scripts
- Generated processes are visible as "the plan for this specific work" — Henderson proposal steps
- No separate project management layer — but also no forcing the user to think in process terms

## Implications

- **Process creation must be fast and conversational.** Generating a 5-step living roadmap from "prepare the Henderson proposal" should take seconds, not minutes. This is the Self + meta-process working together. The output is a real YAML process definition — same format, same schema, same harness.
- **Generated processes may start with lighter governance.** They're still YAML, still go through the harness, but they might default to supervised trust (the user is actively involved) and skip formal review patterns. Governance deepens if the process becomes repeatable.
- **The process primitive gets richer.** Need to distinguish: `origin: "defined" | "generated"`. Generated processes carry `parentWorkItem` linking them to the goal/task that spawned them.
- **The UI surfaces both types equally.** The user's view is "my work and how it's progressing" — whether the underlying process is a domain process running for the 47th time or a generated roadmap created 5 minutes ago.
- **This makes Ditto NOT a project management tool** (feedback: disaster = feeling like Monday.com). The process IS the project. There's no meta-layer of "projects containing tasks" — there's work that flows through processes. The structure comes from the process graph, not from a project hierarchy.
- **Generated processes feed learning.** Even one-off processes produce feedback data: which steps worked, which were skipped, what was modified. This learning improves future generated processes — the meta-process gets better at planning.
- **Schema implication:** Process definitions need a `lifecycle: "durable" | "generated"` field. Generated processes are created for specific work and archived on completion. Durable processes are domain processes that persist and earn trust.
- **Generated processes are never thrown away.** They are archived and become learning data. Three levels of reuse:
  - **Level 1: Memory** — completed processes inform future generation. The Self recalls "last time we did this in 5 steps, step 2 was skipped." No explicit template — the Self just gets smarter.
  - **Level 2: Pattern recognition** — after 3-4 similar generated processes, the system clusters them and detects the common structure. Proposes: "you keep doing this — want to formalize it?"
  - **Level 3: Domain process promotion** — user approves the pattern, and it becomes a durable domain process. The process wasn't designed from scratch — it was distilled from actual work with real-world provenance.
- **The process library is emergent, not curated.** Users never browse a template library. The Self generates better roadmaps over time because it has a growing corpus. Domain processes emerge from proven patterns, not from someone writing YAML. This is the reactive-to-repetitive lifecycle (ADR-010) with a concrete mechanism.

## Where It Should Land

- **architecture.md** — extend the process primitive definition with domain vs. generated distinction
- **Phase 10 MVP brief** — the work surface shows both domain and generated processes. No separate task/project management.
- **Self tools** — add `generate_process` tool that creates a living roadmap from intent
- **ADR-010** — update reactive-to-repetitive lifecycle to explicitly include the generated → domain promotion path
- **dictionary.md** — add "Generated Process" and "Living Roadmap" terms
