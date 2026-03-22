# Insight-054: Meta Processes Are the Platform

**Date:** 2026-03-22
**Trigger:** Creator direction: "The goal framing process and dev process are examples of ditto meta processes. These are the heart of the platform. They are the backbone we will build ditto on and end users will use to create their processes, agents and get things done."
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L6 Human
**Status:** active

## The Insight

Goal framing and the dev pipeline are not internal tooling or special cases. They are **examples of meta processes** — the class of processes that create, manage, and orchestrate other processes. Meta processes are the platform itself.

The hierarchy:

1. **Goal Framing** — meta process that turns vague human intent into actionable, confirmed briefs through consultative conversation
2. **Process Execution** (e.g. Dev Pipeline) — meta process that orchestrates roles/agents to deliver outcomes from confirmed briefs
3. **Process Creation** — meta process that builds new processes when a goal demands capabilities that don't exist yet
4. **Agent/Skill Creation** — meta process that fills capability gaps discovered during process creation or execution

End users don't configure Ditto. They interact with meta processes that build the harness around them. A trades business owner doesn't manually set up a "quoting workflow" — they tell the framing process "I need to get quotes out faster" and the meta layer determines what processes, agents, and skills are needed, creating them if they don't exist.

This is "process is the primitive" (Principle 4) taken to its full conclusion: even creating processes is a process. The platform bootstraps itself through its own primitives.

The implication for building Ditto itself: we build Ditto using Ditto's meta processes. The dev pipeline is both a meta process we're building AND the meta process we use to build. This is the deepest form of dogfooding — the product builds itself.

## Implications

- Meta processes are a first-class concept in the architecture, not an implementation detail
- The architecture must distinguish between meta processes (platform backbone) and domain processes (user-created, domain-specific)
- Meta processes have higher trust requirements — they create and modify the harness itself
- The framing process is the universal entry point: every interaction starts with framing, regardless of what domain process ultimately executes
- Process creation is not a configuration UI — it's a meta process that converses with the human to understand what's needed and builds it
- Ditto's own development (dev pipeline) is the first and most important validation of the meta process pattern
- The "create what's missing" capability (Insight-053) is itself a meta process, not a special escape hatch

## Where It Should Land

- **architecture.md** — meta process as a first-class architectural concept, distinct from domain processes
- **ADR** — meta process definition, trust model, relationship to domain processes
- **roadmap.md** — meta processes as the foundation layer that everything else builds on
- **Brief for architect** — design the meta process architecture: framing, execution, creation, and self-extension
