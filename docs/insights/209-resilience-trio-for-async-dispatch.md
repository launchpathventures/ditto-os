# Insight-209: The resilience trio — queue persistence + mid-job resume + orphan detection — is one pattern, not three

**Date:** 2026-04-26
**Trigger:** Brief 212 (Workspace Local Bridge) Reviewer P0 round identified queue persistence (AC #8), mid-job disconnect resume (AC #9), and orphan detection (AC #10) as separate ACs each. During implementation it became clear they are the **same pattern** — every async cross-process dispatch needs all three properties together, or it has a hidden failure mode.
**Layers affected:** L3 Harness, L1 Process (any long-running step), L4 Awareness (oncall / observability)
**Status:** active

## The Insight

When a cloud workspace dispatches work to an async target (laptop daemon, cloud routine, GitHub Action, sandbox), three resilience properties co-occur. Implementing only two leaves a real-world gap:

| Property | Without it | With it |
|---|---|---|
| **Queue persistence** | Work dispatched while target offline is silently lost. | Target replays work in queuedAt order on reconnect. |
| **Mid-job resume** | Disconnect mid-execution kills the subprocess (or orphans the result). | Subprocess continues; output buffers; replays on reconnect. |
| **Orphan detection** | A "running" job whose target died is forever stuck. | Heartbeat exceeded → state=orphaned + human review row. |

The Brief 212 dispatcher wires all three into one connection lifecycle: `drainQueueForDevice` runs on connect (queue persistence); the daemon-side dialler's outbound buffer + the subprocess running on the laptop covers mid-job resume; `sweepStaleJobs` + per-device 60s heartbeat covers orphan detection.

## Implications

1. **Treat the trio as one capability** in any new async-dispatch primitive. A brief that lists only one or two will surface as "incomplete" in review (Brief 212 originally did — Reviewer caught it).
2. **The trio composes from a small number of moving parts:** an in-memory connection map, a state machine with `lastHeartbeatAt` plus a per-device queue ordering, and a sweeper. Future runner adapters (Brief 216 Routines, Brief 217 Managed Agents, Brief 218 GitHub Actions) should map their target-specific liveness signal onto this same shape.
3. **Heartbeat cadence + staleness window are paired.** Bridge: 60s ping / 10 min staleness. The 10× ratio gives room for a few missed pings without false orphans. Other adapters should keep that ratio (e.g., GitHub Actions logs poll every 30s → orphan at ~5 min of silence).

## Where It Should Land

- Architecture spec, §L3 Harness: short subsection on "Async dispatch resilience" naming the trio + the ratio rule.
- Brief template (`docs/briefs/000-template.md` if it exists): when an AC list mentions any of the three, prompt the architect to confirm the other two are addressed.
- ADR if a runner adapter argues for skipping one: e.g., Brief 217 Managed Agents may genuinely not need queue persistence (Anthropic's API queues for us). That deviation deserves an ADR.

## Cross-link

- Brief 212 ACs #8 (queue persistence), #9 (mid-job resume), #10 (orphan + heartbeat).
- Brief 215 runner-dispatcher.ts already inherits the audit-row + state-machine shape; the cloud sub-briefs (216/217/218) should adopt the trio-coupled view.
