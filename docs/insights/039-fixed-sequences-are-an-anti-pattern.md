# Insight-039: Fixed Sequences Are an Anti-Pattern — Processes Must Support Conditional Flow

**Date:** 2026-03-20
**Trigger:** Dev pipeline orchestrator hardcoded PM → Researcher → Designer → Architect → Builder → Reviewer → Documenter as a fixed 7-step sequence. In practice, the PM's first output often recommends skipping 2-3 roles. The pipeline forced the human through every step anyway — identical to the "noisy approval queue" anti-pattern Agent OS exists to solve.
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L6 Human
**Status:** active

## The Insight

A process definition that specifies steps in a fixed sequence is a workflow, not a process. Real work has conditional flow — the output of one step determines which step comes next. The dev pipeline proved this immediately: the PM role frequently recommends "brief exists, skip to builder" or "no designer needed for infrastructure work." A fixed sequence ignores these recommendations and forces unnecessary work.

This matters for Agent OS at every level:

1. **Process definitions (L1)** — YAML step sequences currently imply linear execution. They need conditional routing: "if PM recommends skipping researcher, go to architect." The `depends_on` mechanism handles parallel groups but not conditional skipping.

2. **Orchestrator meta-process (L2)** — The orchestrator system agent (ADR-010) must route based on prior step output, not just advance to the next index. This is exactly the three-mode routing from Inngest AgentKit: code-based for known skip patterns, LLM-based for novel routing decisions.

3. **Harness layer (L3)** — Review gates should present the human with the routing decision, not just approve/reject. "PM recommends skipping to builder — agree?" The human confirms the route, not just the output.

4. **Human layer (L6)** — The unified task surface should never show work that the system already knows is unnecessary. Forcing humans through steps "just in case" is the noisy approval queue that ADR-011's attention model explicitly rejects.

## Implications

- Phase 4's process model must support conditional step execution, not just `depends_on` for parallel groups
- The intake-classifier → router → orchestrator chain (ADR-010) is inherently conditional routing — the fixed-sequence pipeline was a regression from the architecture's own design
- Process YAML should support `skip_if` or `route_to` declarations alongside `depends_on`
- The dev pipeline orchestrator's skip-to feature (added to fix this) is a prototype of this pattern

## Where It Should Land

- `docs/architecture.md` L1 (Process Layer) — add conditional routing to process definition structure
- Phase 4 briefs (011-014) — ensure the work item routing model supports conditional flow, not just sequential
- `docs/dev-process.md` — the conditional handoff rules already exist in prose; the orchestrator now implements them
