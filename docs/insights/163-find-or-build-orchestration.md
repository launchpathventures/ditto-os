# Insight-163: Find-or-Build Orchestration — The Orchestrator's Gap Response Is a Build Signal, Not a Failure

**Date:** 2026-04-08
**Trigger:** Strategic conversation exploring whether Alex could handle entrepreneurial-grade goals ("find a way to make money from my skills, build a website, market my services"). Analysis revealed that the existing meta-processes (Build, Proactive Guidance, Feedback & Evolution) ARE the entrepreneurial capability — they just aren't wired into the orchestrator's gap-handling path. Currently, when the orchestrator can't find a process for a sub-goal (confidence < 0.6), it escalates to the user (`waiting_human`). But in Ditto's architecture, "no process exists" is a build signal, not a failure state.
**Layers affected:** L1 Process (goal decomposition), L2 Agent (orchestrator evolution), L3 Harness (action boundaries, build-on-gap), L4 Awareness (cross-process output threading), L5 Learning (Process Model Library as cost/quality floor), L6 Human (unified path, consultative clarity, goal-level trust)
**Status:** active

## The Core Insight

Alex doesn't need pre-built capabilities for every domain. Alex needs the meta-capability to **find or build** what's needed dynamically. The existing infrastructure — `web-search`, `generate_process`, `generate-integration`, dev roles, trust gates — already provides the Build meta-process. The orchestrator just doesn't know it can ask for it.

### The Current Gap

Today's orchestrator (Brief 021/022) works as a **plan executor**, not a **goal seeker**:

1. Takes a goal + a single process slug
2. Decomposes that process's step list into child tasks (1:1 mapping)
3. Routes each task back to... the same process
4. If no process matches (confidence < 0.6): `waiting_human` → stops

### The Correct Model

The orchestrator should **reason about what's needed**, then for each need:

1. **Find** — match to existing process (`matchTaskToProcess`, already works)
2. **Build** — trigger the Build meta-process to create what's missing (new)
3. **Execute** — run the process through the harness (already works)

### One Path, Different Permissions

The same reasoning runs at every relationship stage. The only difference is the **action boundary** — what Alex is authorised to do:

- **Front door** (no workspace): think fully, research freely, show the plan — but don't execute, don't save processes, don't spend money
- **Workspace, no budget**: save processes, execute (supervised), build with approval — but don't spend money
- **Workspace, budgeted**: full find-or-build autonomy within budget, trust-gated

Action boundaries are **system-enforced** (different tool sets per context), not prompt-enforced. This is the harness pattern — capability gating through tool availability.

### Consultative Clarity Before Decomposition

The orchestrator doesn't decompose until its confidence is sufficient. A dimension map guides assessment: Outcome (must be clear), Assets (should be understood), Constraints (can assume defaults), Context (can research), Infrastructure (can discover), Risk tolerance (defaults to supervised). Below threshold → stay conversational. Above → decompose with explicit assumptions.

### Build Depth = 1

The orchestrator can trigger Build. Build cannot trigger Build. If the Build meta-process hits a gap, it uses its existing tools directly (web-search, dev roles) rather than spawning another orchestration cycle. Generated processes aren't "existing capability" until their first supervised run succeeds.

## Black Hat Mitigations (14 risks analysed)

Three load-bearing dependencies identified:

1. **Process Model Library** — cost amortization (build-on-demand is per-user cost; library makes it logarithmic) + decomposition quality floor (LLMs decompose against library patterns, not from blank page) + process consolidation (parameterised models prevent proliferation)
2. **Goal-level trust** — prevents trust gate overload on complex goals (user sets trust for the goal, sub-processes inherit; bundled reviews at phase boundaries)
3. **System-enforced action boundaries** — front door safety + cost control (different tool sets per relationship stage, not prompt instructions)

The Process Model Library needs its own quality pipeline: AI battle-testing agents (adversarial, compliance, efficiency, duplicate detection) → standardisation → Ditto admin review → publication. Battle-testing agents are system agents running through the harness, earning trust.

## Architectural Implications

- **Orchestrator evolves** from plan executor to goal seeker (ADR-010, ADR-015)
- **Build meta-process** (ADR-015) gains a reactive trigger (orchestrator gap) alongside its existing proactive trigger (coverage-agent)
- **Coverage-agent reasoning** (Insight-142) becomes a shared function: proactive (scheduled) and reactive (at decomposition time)
- **Output threading** needed across sub-goals (orchestrator as LLM-powered data broker)
- **Process Model Library** (Insight-099) elevated from "nice-to-have" to load-bearing infrastructure for cost, quality, and scale

## Where It Should Land

- Parent brief + sub-briefs for implementation
- ADR-015 update (Build meta-process gains reactive trigger)
- ADR-008 update (new system agents: process-battle-tester, process-compliance-scanner, process-efficiency-analyzer, process-duplicate-detector)
- architecture.md update (orchestrator evolution, action boundaries, library curation pipeline)
