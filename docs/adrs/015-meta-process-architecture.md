# ADR-015: Meta Process Architecture — The Platform Backbone

**Date:** 2026-03-22
**Status:** proposed

## Context

### The Problem

The architecture describes Ditto as a living workspace where "the system runs ON itself" (architecture.md). ADR-008 formalizes ten system agents. ADR-010 defines work items and meta-processes. ADR-014 defines the cognitive architecture. But the architecture lacks an organizing principle above system agents — something that explains *what the platform IS* at the structural level.

System agents are implementation details. They answer "what specific functions exist?" They don't answer: "What are the fundamental processes through which the platform operates, creates, evolves, and reasons?"

Simultaneously, the creator's experience building Ditto has surfaced a critical insight: the dev pipeline — the process used to build Ditto itself — is the most important validation of Ditto's own thesis. The creator is the first outcome owner. Their dev process is the first meta process. And the quality of that process determines the quality of everything the platform can create.

### Forces

1. **System agents are implementations, not concepts.** The ten system agents (ADR-008) serve specific functions, but they don't describe the higher-order processes they participate in. An intake-classifier is part of a larger "goal framing" process. An improvement-scanner is part of a larger "feedback & evolution" process. Without the meta process concept, the architecture describes organs without describing the body.

2. **The build process is the generative core.** Every process, agent, and skill in the system — meta or domain — is created by the build process. If the build process is weak, everything it creates is weak. If it's excellent, excellence compounds. This makes it the single highest-leverage investment in the platform (Insight-055).

3. **Goal framing is the universal entry point.** Users don't arrive with crisp requirements. They arrive with vague goals, frustrations, and "I need..." statements. The platform's most critical job is helping them articulate what they actually want — through consultative conversation, not forms or 20-question checklists (Insight-053). This is a process in its own right, not a feature of the router.

4. **The cognitive framework is executive function, not configuration.** ADR-014 defines a three-layer cognitive architecture (infrastructure + toolkit + context). But the creator's insight goes further: the cognitive framework is the pervasive executive function that ALL thinking passes through — it's how the platform *thinks*, not just how agents are prompted (Insight-055).

5. **The feedback loop must feed the build process directly.** External research (repos, papers, patterns), internal corrections, and learning aren't just for improving existing processes — they are the primary fuel for how the build process improves itself. The research-extract-evolve cycle (Insight-031) is baked into the build process's DNA.

6. **Meta processes vs domain processes is a real distinction.** Meta processes create, manage, and evolve the platform. Domain processes handle user work (quoting, reconciliation, content review). Meta processes have higher trust requirements, broader permissions, and can modify the platform itself. They're the backbone; domain processes are the muscles.

### Research Inputs

- `docs/insights/052-creator-is-first-outcome-owner.md` — validate on this repo first
- `docs/insights/053-pm-consultative-framing.md` — PM's job is framing, not routing
- `docs/insights/054-meta-processes-are-the-platform.md` — meta processes ARE the platform
- `docs/insights/055-complete-meta-process-map.md` — the five meta processes and their hierarchy
- `docs/insights/031-research-extract-evolve-is-the-meta-process.md` — external research as continuous input
- `docs/insights/042-knowledge-management-is-a-meta-process.md` — knowledge lifecycle through harness
- `docs/adrs/008-system-agents-and-process-templates.md` — existing system agent definitions
- `docs/adrs/010-workspace-interaction-model.md` — workspace model, work items, meta-processes
- `docs/adrs/014-agent-cognitive-architecture.md` — cognitive architecture, executive function

## Decision

### 1. Define five meta processes as first-class architectural concepts

Meta processes are the processes through which the platform operates, creates, evolves, and reasons. They are not system agents (those are implementations). They are not domain processes (those handle user work). They are the platform's backbone — the fundamental capabilities that make everything else possible.

| Meta Process | Purpose | Existing Building Blocks |
|---|---|---|
| **Goal Framing** | Transform vague human intent into confirmed, actionable briefs through consultative conversation | intake-classifier, router (ADR-008); capture pipeline (Brief 014b) |
| **Build** | Create all processes, agents, and skills — including meta processes and itself | process-analyst, onboarding-guide (ADR-008 Phase 11); dev pipeline (Brief 016c) |
| **Process Execution** | Orchestrate roles/agents through defined processes to deliver outcomes | orchestrator, heartbeat, harness pipeline (existing); trust gate (Phase 2) |
| **Feedback & Evolution** | Observe, research, learn, and propose improvements to everything | improvement-scanner (ADR-008 Phase 9); trust-evaluator (Phase 3); L5 Learning Layer |
| **Cognitive Framework** | The executive function and filter that ALL thinking passes through | ADR-014 cognitive architecture; ADR-013 cognitive model |

### 2. Establish the meta process hierarchy

The five meta processes are not peers. They have a structural hierarchy:

```
┌─────────────────────────────────────────────────────────────────┐
│  COGNITIVE FRAMEWORK (pervasive executive function)             │
│  Shapes how all thinking happens — not a step in the pipeline  │
│  but the operating context for all cognition.                   │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ GOAL FRAMING │───→│    BUILD     │───→│  EXECUTION   │     │
│  │              │    │              │    │              │     │
│  │ Vague intent │    │ Generative   │    │ Runs what    │     │
│  │ → confirmed  │    │ core.Creates │    │ was built.   │     │
│  │   brief      │    │ everything.  │    │ Interrupts   │     │
│  │              │    │ Self-referent │    │ human at     │     │
│  │ Calibrates   │    │ -ial.        │    │ trust gates. │     │
│  │ depth to     │    │              │    │              │     │
│  │ complexity.  │    │              │    │              │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                              ▲                                  │
│                              │                                  │
│                    ┌──────────────────┐                         │
│                    │ FEEDBACK &       │                         │
│                    │ EVOLUTION        │                         │
│                    │                  │                         │
│                    │ Learns. Researches│                        │
│                    │ externally.       │                        │
│                    │ Primary consumer: │                        │
│                    │ Build process.    │                        │
│                    │ Can modify the    │                        │
│                    │ Cognitive         │                        │
│                    │ Framework itself. │                        │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

**Key relationships:**
- **Cognitive Framework** is pervasive — not a step but the operating context. Every meta process and domain process operates within it.
- **Goal Framing** is the universal entry point — every interaction starts with framing.
- **Build** is the generative core — creates all processes, agents, skills. The only self-referential meta process (it can build and modify itself).
- **Process Execution** runs what Build created — with trust-gated human interrupts.
- **Feedback & Evolution** feeds back into everything — but its primary consumer is Build. The learning loop must directly improve how Build operates.
- **Feedback & Evolution** is the only meta process that can modify the Cognitive Framework itself (with human approval at the highest trust gate).

### 3. Define Goal Framing as a consultative process

Goal Framing is not routing or classification. It is a **consultative conversation** that transforms vague human intent into a confirmed brief that the Build or Execution process can act on.

**The shape of the conversation:**

1. **Listen** — accept the goal however the human states it (vague is fine, that's the starting point)
2. **Assess clarity** — calibrate: is this a "just do it" task or a "let's explore what you mean" goal?
3. **Ask targeted questions** — not a form, not 20 questions. The 1-3 questions that actually sharpen intent. Different goals need different depths of clarification.
4. **Reflect back** — state the framed goal so the human can confirm or redirect
5. **Hand off** — produce a confirmed brief and route to Build (if something needs to be created) or Execution (if a process already exists)

**Clarity assessment heuristic:**

| Signal | Low clarity (deep framing) | High clarity (light framing) |
|---|---|---|
| Goal specificity | "I want better onboarding" | "Fix the typo on line 42" |
| Existing process | No matching process exists | Process already handles this type |
| Domain familiarity | New domain for the system | System has memory/context for this |
| Scope | Multi-step, cross-cutting | Single step, localized |
| Ambiguity markers | "maybe", "something like", "I'm not sure" | Specific file, function, or outcome named |

**Output:** A confirmed brief — a goal statement the human has explicitly approved. The brief includes: what success looks like, what constraints apply, and what the human cares about (not just what they said).

**Trust:** Goal Framing starts supervised (every brief is confirmed by the human). As the system learns the human's patterns, it may suggest briefs with higher confidence — but the human always confirms the brief before Build or Execution proceeds.

**Implementation:** The existing intake-classifier and router become the first two steps of Goal Framing. But Goal Framing adds the consultative conversation layer above them — the part that currently doesn't exist.

### 4. Define Build as the generative core

The Build process creates all processes, agents, and skills — including other meta processes and itself. It is the single highest-leverage meta process.

**What Build creates:**
- Domain processes (quoting, reconciliation, content review)
- Meta processes (improvements to Goal Framing, Execution, Feedback, itself)
- Agents (new system agents, domain agents)
- Skills (new capabilities)
- Process definitions, agent configurations, cognitive toolkit entries

**Build quality requirements:**
- **Research-driven from day one.** The research-extract-evolve cycle (Insight-031) is baked into Build's operation. Before creating anything, Build scouts external sources for patterns and prior art. This is not optional — it's a mandatory step.
- **Directly fed by Feedback & Evolution.** Every pattern discovered externally, every correction captured internally, every improvement identified flows into how Build operates. Build is the primary consumer of the learning loop.
- **Self-referential.** Build can modify itself. When Feedback & Evolution identifies a better way to create processes, Build absorbs the improvement. This is how the platform improves its own creation capability over time.
- **Tested on this repo first.** The dev pipeline (Brief 016c) IS Build running on itself. Every session that creates briefs, writes code, and reviews work validates and improves Build.

**Implementation:** The existing dev pipeline (processes/dev-pipeline.yaml) is the first Build process. The process-analyst system agent (ADR-008, Phase 11) becomes a Build capability. The dev roles (/dev-pm, /dev-researcher, /dev-architect, /dev-builder, /dev-reviewer, /dev-documenter) are Build's agents.

**Trust:** Build starts supervised — the human approves every creation. As trust is earned, Build may create routine extensions autonomously (e.g., adding a step to an existing process) while structural changes (new processes, new agents) always require human approval.

### 5. Elevate the Cognitive Framework to pervasive executive function

ADR-014 defines a three-layer cognitive architecture for agents. This ADR extends it: the Cognitive Framework is not just how agents are prompted — it's the pervasive executive function for the entire platform.

**What the Cognitive Framework governs:**
- How problems are approached (mental models, reasoning strategies)
- What gets prioritized in ambiguous situations (values, trade-offs)
- How trade-offs are evaluated (what "good" looks like)
- How the platform reasons about itself (metacognition, self-assessment)
- What the platform notices (intuition, pattern sensing)

**Implementation:** The Cognitive Framework is the union of:
- ADR-014's three-layer cognitive architecture (infrastructure + toolkit + context)
- The platform's accumulated values and principles (currently encoded in CLAUDE.md, architecture.md, insights)
- Domain-specific knowledge learned through operation (process memory, correction patterns)

**What changes from ADR-014:** Nothing is contradicted. ADR-014 defines how cognitive capabilities are assembled for individual agent invocations. This ADR elevates the concept: the Cognitive Framework is the meta-level executive function that informs how ADR-014's layers are composed, which toolkit entries are relevant, and what metacognitive monitoring should watch for. ADR-014 is the mechanism; the Cognitive Framework is the governing intelligence.

**Evolution:** The Cognitive Framework evolves through Feedback & Evolution — the only meta process that can modify it. Modifying the Cognitive Framework is the highest-trust operation in the system because it changes how everything thinks. Every modification requires human approval.

### 6. Define the meta-to-domain relationship

| Property | Meta Processes | Domain Processes |
|---|---|---|
| **Created by** | Build (self-referentially) | Build |
| **Purpose** | Platform operation, creation, evolution | User work |
| **Trust baseline** | Higher (platform-level operations) | Standard (user-configured) |
| **Permission scope** | Cross-process, can modify platform | Scoped to assigned data/tools |
| **Examples** | Goal Framing, Build, Execution, Feedback, Cognitive | Quoting, reconciliation, content review |
| **Modified by** | Build + Feedback (with human approval) | Build (with human approval) |
| **Can create new...** | Processes, agents, skills, meta processes | Work items, outputs |
| **Cognitive Framework** | Full executive function active | Subset relevant to domain |
| **System agent mapping** | Each meta process orchestrates relevant system agents | Domain agents only |

### 7. Map system agents to meta processes

The existing ten system agents (ADR-008) are implementations of meta process functions:

| System Agent | Meta Process | Role Within |
|---|---|---|
| intake-classifier | Goal Framing | Classifies incoming work items as first triage |
| router | Goal Framing → Execution | Matches framed goals to existing processes |
| process-analyst | Build | Guides process articulation and creation |
| onboarding-guide | Build (+ Goal Framing) | First-run process creation |
| process-discoverer | Build (+ Feedback) | Finds processes from organizational data |
| orchestrator | Execution | Decomposes goals, tracks progress, routes |
| trust-evaluator | Execution (+ Feedback) | Manages trust lifecycle |
| brief-synthesizer | Execution (+ Goal Framing) | Produces Daily Brief |
| improvement-scanner | Feedback & Evolution | Detects degradation, proposes improvements |
| governance-monitor | Feedback & Evolution | Watches for governance violations |

No new system agents are introduced. The meta process architecture organizes and elevates the existing agents into coherent higher-order processes.

### 8. Define the validation path: this repo first

The first validation of the meta process architecture is the dev pipeline on this repository (Insight-052):

| Meta Process | Validation on This Repo |
|---|---|
| **Goal Framing** | Creator states a goal → PM engages in consultative framing → confirmed brief produced |
| **Build** | Dev pipeline executes: Researcher → Architect → Builder → Reviewer → Documenter |
| **Execution** | Harness orchestrates the dev pipeline steps with trust gates and human review |
| **Feedback & Evolution** | External research feeds into Build; corrections improve roles; insights evolve the pipeline |
| **Cognitive Framework** | CLAUDE.md + architecture.md + insights shape how every role thinks and operates |

**What must work end-to-end:**
1. Creator says "I want X" (however vague)
2. Goal Framing process converses to clarify, produces a confirmed brief
3. Build/Execution process runs the dev pipeline on the confirmed brief
4. Human is interrupted at trust gates (architecture approval, code review)
5. Feedback loop captures what worked and feeds it back into Build
6. The Cognitive Framework shapes all thinking throughout

**The current gap:** Goal Framing doesn't exist as a process yet — the creator currently invokes /dev-pm manually and the PM does triage, not consultative framing. Building Goal Framing is the first brief that emerges from this ADR.

## Provenance

- **Meta process concept:** Original — no existing framework distinguishes meta processes from domain processes in this way. Closest is Paperclip's distinction between system goals and user goals, but Paperclip doesn't model goal framing or build as separate processes.
- **Goal framing as consultative conversation:** Original — informed by the insight that AI tools either rush to execute or plan in isolation (Insight-053). The pattern of "listen → assess clarity → ask targeted questions → reflect back → hand off" is adapted from management consulting engagement models.
- **Build as generative core:** Original — the self-referential property (build creates build) is inspired by bootstrapping compilers (a compiler that can compile itself). The insight that build quality determines platform quality is from lean manufacturing (Toyota Production System: the production process is the product).
- **Cognitive Framework as executive function:** Extends ADR-014. The metaphor of executive function comes from cognitive neuroscience (Miyake et al., 2000) — the governing capability that selects, monitors, and shifts cognitive processes.
- **Hierarchy (not peer) relationship:** Original — no framework we've surveyed models meta processes in a hierarchy where build is the generative core fed by a learning loop.

## Consequences

### What becomes easier

- **Explaining what Ditto is.** "Five meta processes that create, run, evolve, and reason about user work" is clearer than "ten system agents and a harness."
- **Prioritizing work.** Build process quality is the highest-leverage investment — this gives clear sequencing guidance.
- **Self-improvement.** The feedback loop has a clear primary consumer (Build) rather than feeding into a vague "learning layer."
- **New capability creation.** When a goal doesn't map to an existing process, the response is clear: Build creates what's missing.

### What becomes harder

- **Nothing becomes structurally harder.** This ADR organizes existing concepts — it doesn't introduce new infrastructure.
- **Discipline in Goal Framing.** The consultative conversation requires restraint — not rushing to execute, not over-questioning. This is a design challenge, not a structural one.

### New constraints

- **Goal Framing must precede Build and Execution.** No process creation or execution starts without a confirmed brief from Goal Framing (unless the task is trivially clear).
- **Build must be research-driven.** The research-extract-evolve cycle is mandatory, not optional.
- **Cognitive Framework modifications require highest trust.** Any change to how the platform thinks must be human-approved.
- **Feedback & Evolution has a primary consumer.** The learning loop feeds Build first, then everything else.

### Follow-up decisions needed

1. **Brief: Goal Framing process definition** — Define the Goal Framing process as a YAML process with the consultative conversation pattern. This is the first build target.
2. **Brief: PM skill redesign** — Rewrite `/dev-pm` to embody consultative framing for the dev pipeline specifically (the first Goal Framing implementation).
3. **architecture.md update** — Add meta process layer above system agents. Update the "System Runs ON Itself" section.
4. **ADR-008 update** — Add meta process mapping column to the system agent table.
5. **Roadmap update** — Insert meta process maturity milestones.
