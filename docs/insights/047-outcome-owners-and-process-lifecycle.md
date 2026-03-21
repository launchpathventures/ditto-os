# Insight-047: Outcome Owners Need a Process Lifecycle, Not Just Process Definitions

**Date:** 2026-03-21
**Trigger:** Strategic reframe — users are "outcome owners" not "process owners." They may not have a process yet. The system must help define, refine, and improve processes over time. AI should not reinvent its approach each time — processes are durable. But pure prescription kills intelligence. The core design tension: declarative process vs intuitive metacognition.
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L5 Learning, L6 Human
**Status:** active

## The Insight

The architecture has two gaps when checked against the "outcome owner" reframe and the "declarative vs metacognitive" tension:

### Gap 1: The journey from "no process" to "governed process" is designed but not connected

The architecture describes three process creation paths (architecture.md:247):
1. **Manual definition** — conversation via Explore mode
2. **Template selection** — industry standards (APQC)
3. **Data-driven discovery** — from connected organizational data

And it has three system agents designed to support this:
- **process-analyst** (Phase 11) — helps users articulate processes via conversation
- **onboarding-guide** (Phase 11) — walks through first process setup
- **process-discoverer** (Phase 11) — discovers processes from org data

The design exists. But it's all Phase 11 — the last phase. Today's engine has no path from "I know what good looks like" to a process definition. The outcome owner must write YAML. This is the gap: the architecture correctly models the destination but the road to get there is deferred past all other work.

This matters because the "outcome owner" reframe means the target user is someone who **may not know they have a process.** They know the outcome they want. The system's job is to help them discover the process is there — in their corrections, in their patterns, in their description of "what good looks like."

Four mechanisms already in the architecture partially address this:
- **Router-to-process-analyst trigger** (ADR-010 section 3): the router's inability to find a matching process can trigger the process-analyst to suggest creating one. This is a designed escalation path — the scaffolding exists, but the process-analyst it fires into is not yet built.
- **Reactive-to-repetitive lifecycle** (ADR-010, L5): the system watches for recurring ad-hoc work and proposes formalizing it as a process. This is process discovery from usage patterns.
- **Template library** (ADR-008): pre-built processes the user can adopt and customize. But templates are still YAML — they need a conversation layer.
- **Correction-to-process improvement** (L5 Learning): the system detects correction patterns and proposes improvements. This refines processes but doesn't create them.

What's missing is the **active process articulation path**: the system agent that sits with the outcome owner and says "you've described what good looks like for your quotes — let me show you the process I've inferred from that. Adjust what doesn't match." This is the process-analyst system agent, but it's Phase 11.

### Gap 2: The declarative-metacognitive balance is present but not named

The architecture already contains both sides of the tension:

**Declarative side (structured, governed, repeatable):**
- Process definitions in YAML (L1)
- Review patterns (L3)
- Trust tiers (L3)
- Quality criteria (L1)
- Feedback capture (L5)

**Metacognitive side (adaptive, context-aware, intuitive):**
- Cognitive mode on process steps (ADR-013) — not yet built
- Per-output confidence scoring (ADR-011) — agents self-assess
- Memory assembly (L2) — context priming before execution
- Conditional routing (L1) — process adapts based on output
- Insight-046 cognitive architecture — seven layers including metacognition and executive function

The architecture has both sides. But the **governing relationship** between them isn't explicit. The question "when should the agent follow the process exactly, and when should it exercise judgment?" has no answer in the current architecture. This is the reinvention problem in reverse: if you make processes too rigid, agents can't adapt to genuine context shifts. If you make them too flexible, you lose the durability that prevents reinvention.

The current design has an implicit answer: the process is the structure, the agent brings judgment within each step, and the harness evaluates the output. But this isn't articulated as a principle, and it doesn't address:
- Can an agent propose skipping a step it judges irrelevant?
- Can an agent flag that the process itself needs rethinking (not just the output)?
- Does the orchestrator have the freedom to recompose the task decomposition if the approach isn't converging?

Insight-046 (executive function) addresses these at the orchestrator level but hasn't been connected to the process definition model.

## What the Architecture Gets Right

1. **The three process creation paths exist in the design** (manual, template, discovery) — the gap is sequencing, not concept.
2. **The reactive-to-repetitive lifecycle** (ADR-010) is genuinely novel — no surveyed system proposes processes from usage patterns.
3. **The process-is-internal framing** (ADR-010: "processes are the system's learned skills, like organs in a body") correctly positions processes as something the system manages, not something the user manages.
4. **Industry standards as base knowledge** (APQC, architecture.md:134-136) provides the "standards available" that outcome owners can build from without needing to invent process structures.
5. **ADR-013's cognitive mode** provides the declarative-side mechanism for metacognitive framing (even though it's only for human review, not agent execution yet).
6. **Per-output confidence** (ADR-011) is the existing metacognitive signal — agents already self-assess.

## What Needs to Change

### Recommendation 1: Name the principle

The declarative-metacognitive balance should be an explicit architectural principle, not an emergent property. Proposed formulation:

> **Processes declare structure. Agents bring judgment. The harness evaluates outcomes.** A process definition governs what happens and in what order. The agent within each step has freedom to exercise judgment about how. The harness evaluates whether the output meets quality criteria — it doesn't prescribe how the agent got there. This ensures consistency (same process, same governance) without rigidity (agents can adapt to context).

This should be added to the Core Thesis in architecture.md.

### Recommendation 2: Elevate process articulation earlier in the roadmap

The process-analyst and onboarding-guide system agents are Phase 11. The outcome owner reframe means these are not late-stage features — they're core to the value proposition. Users who can write YAML are not the target market.

Options (for PM to triage):
- **Pull process-analyst to Phase 7-8** — after external integrations but before the full UI. The CLI can support guided process creation via the same `claude -p` adapter.
- **Add a lightweight "describe → YAML" flow to the CLI now** — a simpler version that generates process YAML from a natural language description, without the full system agent infrastructure. This bridges the gap without the full Phase 11 investment.

**Critical design constraint:** Process creation is never just a conversation and never just an editor. It is an **intelligently guided hybrid** — the process-analyst meta-agent reasons alongside the outcome owner (classifying against industry standards, surfacing templates, inferring structure from descriptions) while the Process Builder shows the emerging process definition in real time. The dual pane (Conversation Thread + Process Builder) is the design — neither pane is primary. The meta-agent brings judgment about how to structure the process (drawing on APQC, templates, existing org processes), not just a blank form or a transcript-to-YAML converter.

### Recommendation 3: Connect Insight-046 executive function to the process model

When ADR-014 (cognitive architecture) is designed, it should explicitly address:
- **Step-level judgment**: the agent's freedom to adapt within a step, constrained by quality criteria
- **Process-level judgment**: the orchestrator's freedom to recompose decomposition when the approach isn't converging
- **Process evolution judgment**: the learning layer's ability to propose structural process changes (not just parameter tweaks)

This connects the metacognitive side to the declarative side through a clear hierarchy: human governs process structure → orchestrator governs execution strategy → agent governs step approach → harness evaluates everything.

## Implications

- The architecture is conceptually sound for outcome owners — the gaps are in sequencing (process creation tools deferred too far) and explicitness (the declarative-metacognitive balance is present but unnamed)
- No structural rework needed — the six layers accommodate both insights
- PM should consider whether process articulation tools should move earlier in the roadmap
- ADR-014 (cognitive architecture) should address the judgment hierarchy: when to follow process, when to exercise judgment, how the harness distinguishes between adaptation and reinvention
- The "reinvention problem" — AI producing different outputs from the same task — is solved by process durability (same process, same governance, same quality criteria) + memory (accumulated corrections and preferences). The architecture already has both mechanisms. The gap is that outcome owners can't access them without writing YAML.

## Where It Should Land

- **architecture.md Core Thesis** — add the "Processes declare structure, agents bring judgment, harness evaluates outcomes" principle
- **Roadmap** — PM triages whether process articulation tools move earlier
- **ADR-014** — include the judgment hierarchy (human → orchestrator → agent → harness)
- **ADR-008** — update to reflect the outcome owner framing for process-analyst and onboarding-guide descriptions

## Reference docs checked

- architecture.md — updated: Core Thesis "Process Is the Internal Primitive" now includes outcome owner language, governing principle, and judgment hierarchy
- ADR-010 — checked, consistent. Router-to-process-analyst trigger acknowledged
- ADR-008 — needs update (process-analyst and onboarding-guide descriptions)
- ADR-013 — checked, consistent. Complementary to ADR-014
- ADR-014 — accepted, includes judgment hierarchy per Recommendation 3
- roadmap.md — updated with cognitive architecture phases (A1-D) and PM triage item for process articulation timing
