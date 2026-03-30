# Insight-109: Async Pipeline Trigger — Fire-and-Forget with SSE Progress

**Date:** 2026-03-30
**Trigger:** Brief 053 build — wiring the dev pipeline for end-to-end web UI execution
**Layers affected:** L2 Agent, L3 Harness, L6 Human
**Status:** active

## The Insight

When a pipeline has multiple long-running steps (each potentially minutes), the trigger tool must return immediately and let the pipeline run in the background. The Self cannot block waiting for a 7-step pipeline to complete — it needs to respond to the user and handle other requests while the pipeline executes.

The pattern: `startProcessRun()` creates the run, then `fullHeartbeat()` is kicked off via `setImmediate()` (non-blocking). The tool returns a `runId` immediately. Progress flows back to the user via SSE events → React Query invalidation → composition re-render. This is fundamentally different from `start_dev_role`, which blocks on `fullHeartbeat` because a single-role run completes in one conversation turn.

Session-scoped trust overrides emerged as the natural mechanism for "auto-approve these roles" — temporary, additive, safety-constrained. The key constraint: overrides can only *relax* trust, never tighten it, and maker-checker roles (builder/reviewer) are always protected.

## Implications

Any future multi-step orchestration tool should follow this pattern: synchronous trigger → async execution → SSE progress → composition rendering. The user's conversation remains responsive. The pipeline is independent.

Session trust overrides may generalize beyond pipelines. Any run that the user explicitly initiates with "I trust this category of work" could use the same mechanism. But the safety constraints (no builder/reviewer relaxation, cap at spot_checked) should remain non-negotiable.

## Where It Should Land

Architecture.md Layer 3 (Harness) should document session trust overrides as an extension to the trust model. Architecture.md Layer 6 (Human) should document the async pipeline trigger → SSE → composition pattern.
