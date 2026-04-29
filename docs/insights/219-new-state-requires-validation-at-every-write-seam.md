# Insight-219: New states in a multi-write-seam state machine require validation at every write seam, not just the new one

**Date:** 2026-04-28
**Trigger:** Brief 220 (Deploy Gate). The brief introduced three new `briefState` values (`deploying`, `deployed`, `deploy_failed`) and shipped `transitionBriefState()` as a pure-function state-machine validator. The Reviewer flagged (M4) that the status route `POST /api/v1/work-items/:id/status` writes `briefState` directly with only Zod enum-membership validation — bypassing the state machine. The first Builder pass deferred this as a "Brief 223 carryover" because the cloud-runner-fallback handler (the brief's primary write path) DID validate correctly. The user steer ("fix all") forced wiring `transitionBriefState()` into the route — and that's where the actual leverage lay: a runner posting `state: "deployed"` against a `backlog`-state work item could leapfrog the entire pipeline, silently bypassing the new state machine.
**Layers affected:** L3 Harness (state-machine discipline), L1 Process (work-item lifecycle integrity)
**Status:** active

## The Insight

When a state-machine column is read at multiple write seams (a webhook handler, a route handler, an internal system, a CLI tool), adding new states to the machine is **not** complete until validation has been wired at every seam. The pure-function validator is necessary but not sufficient — it only enforces the rules where it's CALLED.

The seam-local justification ("the runner doesn't currently post these new values") is a Chesterton's-fence trap: today's caller-set is not tomorrow's. A new runner adapter, a recovery script, a third-party integration, or a future brief that re-uses the same route can silently leapfrog the state machine because the validator is locked behind a different code path.

The integrity isn't ABOUT what callers do today — it's about what the state machine PROMISES. If the state machine says `backlog` cannot transition to `deployed`, and a write seam doesn't enforce that promise, the state machine is a suggestion, not a guard.

## Implications

- **Architect discipline:** when a brief introduces new states to an enum that's already written by multiple code paths, the brief MUST enumerate every write seam in §What Changes and require validation at each. "Validation is added at the new code path" is insufficient. The grep is `git grep "set.*<column>"` or `git grep "update.*<column>"` against the existing codebase.

- **Builder discipline:** when implementing a brief that adds states to a multi-write-seam enum, before declaring done, run `git grep` for every write to the column. If any write seam does not flow through the state-machine validator, either wire it or document the gap explicitly with a follow-up-brief reference. "Pre-existing carryover" is a deferral, not a fix — the deferral is acceptable only if the new states do not widen the gap. New post-shipped states ALWAYS widen the gap (they create new illegal-transition combinatorics that didn't exist before).

- **Reviewer discipline:** for any brief introducing new state-machine values, the §Review Process check should explicitly include "(N) Verify the state-machine validator is invoked at every write seam — not just the new code path." The grep evidence belongs in the review report.

- **Test discipline:** the route-side validation closes the leapfrog gap with 409 Conflict responses. Tests that previously wrote unrealistic state combinations (e.g., `backlog → review` to test the bounded-waiver path) must seed legal precondition states — the test was relying on the route's no-validation policy, which was a defect, not a feature.

- **Boundary semantics:** state-machine enforcement at the route is a 409 (Conflict) — distinguished from 400 (validation failure on payload shape), 401 (auth), and 404 (resource missing). The semantic distinction matters for runner adapters that retry on 5xx but not 4xx — 409 is "the request was understood, but the state doesn't allow it" — runner should NOT retry blindly.

## Where It Should Land

- **Builder skill (`.claude/commands/dev-builder.md`):** add a clause under "Self-review before spawning Reviewer" — "When adding new states to a state-machine column, grep every write seam (`git grep "set.*<column>" "update.*<column>"`) and verify each invokes the state-machine validator. Untouched write seams are silent leapfrog vectors."

- **Architect skill (`.claude/commands/dev-architect.md`):** add a clause under "When designing state-machine extensions" — "§What Changes must enumerate every write seam to the column being extended. New states without per-seam validation requirements are a partial design, not a complete one."

- **Reviewer skill (`.claude/commands/dev-reviewer.md`):** add a clause under "State-machine validation parity" — "For any brief extending a state-machine enum, verify validator invocation at every write seam, not just the seam introduced by the brief. Per-seam coverage is mandatory; uncovered seams are HIGH-severity defects."

- **Once a 3rd state-machine extension brief lands using this discipline,** absorb into `docs/architecture.md` §L3 ("State-machine extension protocol") as a binding contract for any future briefs touching `briefState`, `runner_dispatches.status`, `processRuns.status`, etc.

## Related insights

- **Insight-180** (stepRunId guard for side-effecting functions): the same shape — a single function (the guard) is invoked at every dispatch site. Insight-219 generalises this: any cross-cutting validator must be invoked at every relevant call site, not just the new one introduced by the latest brief.
- **Insight-218** (Builder must grep sibling peers for each input/dependency): the dual — when adding the Nth member of a multi-peer family, grep each sibling for parity. Insight-219 is the multi-write-seam version: when adding new states/values to a shared schema column, grep each write seam for validator-invocation parity.
- **Insight-043** (architect owns reference-doc accuracy): the same principle — the docs (architecture.md, dictionary.md) describing the state machine must be updated when its contract changes. Insight-219 is the implementation-side counterpart: the validator's invocation surface must follow the contract change.
