# Insight-220: Process YAML's `trust.initial_tier` must be the LEAST restrictive tier when the process is invoked with `parentTrustTier`

**Date:** 2026-04-28
**Trigger:** Brief 228 (Project Retrofitter) Reviewer CRIT-1 — the YAML originally set `trust.initial_tier: supervised` (the conventional safe default); the harness's `moreRestrictiveTrust` discipline (`src/engine/heartbeat.ts:1742-1753`) silently downgraded user-picked autonomous + spot_checked tiers to supervised, breaking 2 of 4 trust-tier paths end-to-end. The unit tests passed (they bypassed the gate); the integration would have failed. Caught by the Reviewer reading the heartbeat source line by line.
**Layers affected:** L1 Process (process YAML conventions), L3 Harness (trust-tier inheritance discipline)
**Status:** active

## The Insight

When a process is invoked via `startProcessRun(slug, inputs, triggeredBy, { parentTrustTier })`, the harness's existing inheritance discipline computes `effectiveTier = moreRestrictiveTrust(parentTrustTier, yamlInitialTier)` — the MORE restrictive of the two. If the YAML's `trust.initial_tier` is more restrictive than the user-picked tier, the user's pick is **silently downgraded** to the YAML default. The trust-gate then enforces the downgraded tier; downstream branches that depend on the user-picked tier are unreachable.

The trap: `supervised` looks like a safe default. For a process where the YAML default is the source of truth (e.g., a recurring system process triggered by a cron), `supervised` IS the right default. But for a process where the user EXPLICITLY picks a tier (project retrofit, deployment approval, hire-a-specialist invocation), the YAML default is the floor — it should be the LEAST restrictive tier so any user pick flows through verbatim.

The discipline is: the YAML's `initial_tier` is a CEILING when the process is system-driven (no user pick), and a FLOOR when the process is user-delegated (user picks the tier). The harness can't tell which is which from the process definition alone — the architect must encode the right default per process.

## Implications

1. **Every process YAML's `trust.initial_tier` choice is a deliberate architectural call**, not a copy-paste from a sibling process. The architect must answer: "is this process user-delegated (user picks tier) or system-driven (YAML defines tier)?" The answer determines whether the YAML should be `autonomous` (user-delegated; let any pick through) or a more restrictive default (system-driven; cap the tier).

2. **For user-delegated processes, set `initial_tier: autonomous` and document why.** Brief 228's `processes/project-retrofit.yaml` carries an inline comment block explaining the rationale + a "NEVER set this to supervised — it breaks autonomous + spot_checked tier flow end-to-end" warning. Future user-delegated processes should follow the same pattern.

3. **Critical-tier rejection still works.** Even with `initial_tier: autonomous`, a user picking `critical` flows through (`moreRestrictiveTrust(critical, autonomous) = critical`); the trust-gate emits `pause + canAutoAdvance=false`, and the process handler rejects. Critical is the ceiling regardless of YAML default.

4. **Supervised as the user's pick still works** (and is honoured): `moreRestrictiveTrust(supervised, autonomous) = supervised` — the trust-gate emits `pause`, the handler renders the supervised path. Only when the YAML is MORE restrictive than the user's pick does the silent downgrade fire.

5. **Unit tests can't catch this** without exercising the trust-gate via `processRuns.trustTierOverride` end-to-end. Brief 228's `computeDispatchOutcome` unit tests passed all 5 tier branches by passing the decision row directly. The CRIT-1 bug only manifests when the trust-gate runs against a real `processRun` whose `trustTierOverride` was set by `parentTrustTier`. Future Reviewers should specifically inspect the YAML default × parentTrustTier interaction for any user-delegated process.

## Where It Should Land

**Near-term:** Add a one-paragraph note in `docs/architecture.md` §Layer 3 (Harness — Trust integration) clarifying the YAML-default-vs-parent-tier semantics. The text should warn architects writing user-delegated process YAMLs to set `initial_tier: autonomous`.

**Medium-term:** Consider whether the YAML schema should grow an explicit `trust.delegation_mode: 'system' | 'user'` field that makes the architect's choice visible — instead of relying on a comment to communicate intent. If `delegation_mode='user'`, lint the YAML to require `initial_tier: autonomous`. Out of scope for any current brief; capture as a future infrastructure improvement.

**Long-term:** As more user-delegated processes ship (e.g., scheduled retrofit re-runs, hire-a-specialist invocations, deployment approvals), this insight should absorb into a §Layer 1 (Process) subsection on "Process trust-tier modes" — system-driven vs user-delegated — naming the YAML conventions for each.

**Status until absorbed:** active. Will become absorbed when (a) the architecture.md note lands AND (b) a second user-delegated process YAML adopts the `initial_tier: autonomous` + warning-comment pattern. Brief 228 is the first; the second will trigger the absorption pass.
