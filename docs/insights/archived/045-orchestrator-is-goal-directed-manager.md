# Insight-045: Orchestrator Stopping Condition Is Confidence, Not Gate Pauses

**Date:** 2026-03-21
**Trigger:** PM triage session — planning overnight autonomous pipeline run exposed that the current heartbeat stops the whole process when a trust gate pauses a single step. ADR-010 already defines the orchestrator as goal-directed with persistent decomposition — the missing piece is the stopping condition.
**Layers affected:** L2 Agent, L3 Harness
**Status:** absorbed into Brief 021 (orchestratorConfidence field, orchestratorHeartbeat, confidence-based stopping)

## The Insight

ADR-010 already defines the orchestrator as a goal-directed manager that "makes complex, persistent decisions about how to break goals into tasks over time." The architecture is clear. What's missing is the explicit stopping condition: the orchestrator should stop the process not when a step hits a trust gate, but when its own confidence about what to do next drops too low — meaning the remaining work genuinely requires human judgment to proceed.

Trust gate pauses on individual work items should be work-item-level events, not process-level halts. The orchestrator routes around them to independent unblocked work, exactly as ADR-010's "spawns tasks across multiple processes" implies.

This connects ADR-010's orchestrator design to ADR-011's confidence model: orchestrator uncertainty is the process-level analogue of step-level confidence.

## Implications

- The heartbeat needs work-queue awareness: when a step pauses, check for unblocked independent work
- Orchestrator confidence becomes the process-level stopping condition (extends ADR-011)
- Phase 5 brief should treat orchestrator goal-directed scheduling as the primary deliverable

## Where It Should Land

- ADR-011: add orchestrator confidence as process-level stopping condition
- Phase 5 brief: orchestrator implementation is the core build, not just verification
