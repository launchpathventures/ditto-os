# Insight-219: Validated User Input Must Reach Its Destination

**Date:** 2026-04-28
**Trigger:** Brief 221 dev-review pass found that the `/api/v1/review/[token]/approve` route accepted `selectedKind` from the user's form submission, validated it against the server-stamped eligibility list, and then passed `dispatchWorkItem({...})` WITHOUT setting `workItems.runnerOverride = selectedKind` first. The user's selection was echoed in the response but never affected the dispatch. The dispatcher walked the project's chain, ignoring the user's pick. Type-check passed; tests passed; the bug was a Pass-2 integration gap that the dev-review skill surfaces.
**Layers affected:** L3 Harness (dispatch handlers, routes), L6 Human (any user-driven affordance)
**Status:** active

## The Insight

When an API route or harness handler accepts a user-driven input — a form field, a query param, a body property, an `inputs.X` workflow input — the route must trace that input to **the side-effecting call where it has effect**. Validation is necessary but insufficient. Code that validates an input and then never uses it is a silent UX failure: the affordance looks live, the user picks something, and the system silently does something else.

The Brief 221 case had a clear pattern:

```ts
// Validate (✅ present)
if (!eligibleOptions.includes(body.selectedKind)) return 400;
const { kind: selectedRunnerKind } = parseKindOption(body.selectedKind);

// Dispatch (❌ doesn't use selectedRunnerKind)
const outcome = await dispatchWorkItem({
  stepRunId,
  workItemId,
  processRunId,
  trustTier: ...,
  trustAction: "advance",
});

// Echo (✅ but the echo is a lie — the dispatcher used a different kind)
return { ok: true, dispatchId: outcome.dispatchId, selectedKind: selectedRunnerKind };
```

The fix was a single `db.update(workItems).set({ runnerOverride: selectedRunnerKind })` between the validate and dispatch steps. The dispatcher's chain resolver already prepends `runnerOverride` to the chain (Brief 215 §D4) — the contract was there; the route just didn't wire to it.

**Why type-check + tests didn't catch this:** the dispatch contract didn't *require* selectedKind. The route compiled cleanly. Tests asserted the route returned 200 (it did), the page was archived (it was), and a dispatch row existed (it did). None of them asserted the dispatch was on the user-selected kind.

**Why dev-review caught it:** Pass 2 (Integration & Data Flow) explicitly traces every user input to its actual destination. The reviewer asked "the user picked X — does the dispatcher actually use X?" and the answer was no.

## Implications

- **Routes that accept user-driven values should grep clean: every user-driven param appears at least twice — once at validation, once at the side-effecting destination.** A route where `body.X` appears only in `if (validate(body.X))` and `return { X: body.X }` is suspect — the value isn't reaching anything.
- **Same pattern for harness handlers, system agents, and YAML inputs.** A workflow that declares `inputs.harness_type` and never references it after validation is the same bug class (Insight-218 caught one of these in Brief 218 — the github-action workflow accepted `harness_type` and hardcoded `"catalyst"` in the prompt). Insight-218 and this insight are siblings; this is the route-level generalization.
- **Reviewer test pattern:** for each user-driven input named in the brief, grep the implementation file. If the count is ≤2 (one for input parsing + one for response echo), suspect a missed wiring. Examine each call site for whether the input genuinely reaches the system-state-changing operation.
- **Architect framing:** brief ACs should call out *destinations* explicitly. Brief 221 AC #6 said "validates `selectedKind` against options, sets runner_mode_required if forceCloud, calls dispatchWorkItem" — it didn't say "AND wires selectedKind into the dispatch via runnerOverride." The destination wiring should be a literal AC clause, not implied by the UX intent.
- **One-shot tokens consume on success, not before.** A related but smaller pattern Brief 221 also hit: `completeReviewPage(token)` was called before the `if (!outcome.ok)` check, so transient dispatch failures consumed the token and stranded the user. Pattern: side-effecting consumption (token archive, lock release, notification send) should sit AFTER the success guard, or be wrapped in a try/catch that reverses on failure.

## Where It Should Land

- **`docs/dev-process.md` Reviewer skill amendment** — add a clause to the Pass-2 (Integration) checklist: "Every user-driven param mentioned in a brief must have a 'destination' annotation in the implementation. Grep the route for the param name; expect ≥2 references — one at validation, one at the side-effecting call. A param that only appears at validation + response echo is a silent UX failure."
- **Architect skill (brief-writing) amendment** — when an AC mentions a user-driven input, the AC should also name the destination operation that consumes it (e.g., "validates X AND sets `workItems.runnerOverride = X` before dispatch"). The Reviewer can then check the AC's two halves are both implemented.
- Once a third instance lands (Brief 218 + Brief 221 = two so far), absorb into `docs/architecture.md` §L3 as a binding pipeline constraint.

## Companion: Tokens-Consumed-On-Success

A small, related rule worth surfacing:

> When a route consumes a one-shot resource (token archive, lock release, idempotency-key write), put the consumption AFTER the success guard. A transient failure must not strand the user.

Codified concretely as the second part of Brief 221's `approve/route.ts` fix.
