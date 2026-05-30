# Insight-237: Reviewer-Nit Triage — the Honest Fix Can Be a Documented Non-Change

**Date:** 2026-05-18
**Trigger:** Brief 274 wiring-only re-review returned APPROVE-WITH-NITS with 3 nits; the human said "fix all". Only 1 of the 3 was a legitimate code change — executing the other 2 as written would have breached an existing boundary insight and the brief scope.
**Layers affected:** L6 Human (dev process), cross-cutting (review loop)
**Status:** active

## The Insight

"Fix all" is an instruction to *resolve* every nit, not to *mutate code* for every nit. A reviewer nit comes in (at least) three shapes, and they have different correct resolutions:

1. **Actionable defect/cleanup** → change the code. (Brief 274 nit 1: two adjacent identical-gate sibling render blocks merged into one.)
2. **Conscious-decision confirmation** → the nit is flagging that a choice should be *deliberate, not accidental*. The correct resolution is to confirm and record the rationale — changing the code would be wrong. (Brief 274 nit 2: structural-only `jobRequestCardOrUndefined()` validation is intentional because the engine's private-fact scrub is the real boundary; adding deep field validation at the route seam would duplicate the boundary — the exact anti-pattern [[235-boundary-enforced-by-transport-not-runtime-filter]] warns against.)
3. **Out-of-scope observation** → "fixing" it would be scope creep the brief never authorized, which the Builder contract forbids. The correct resolution is to record why it is deferred and where the affordance already lives. (Brief 274 nit 3: forwarding `reasonText`/`refinementText` would require a free-text reason UI no AC specced; the PATCH route already accepts those fields as optional for a future brief.)

The reviewer often signals the shape themselves ("noted for completeness", "conscious decision", "out of wiring scope") — that signal is part of the finding and must be triaged, not flattened into a code edit.

## Implications

- Under "fix all", the Builder must triage each nit against (a) existing boundary insights/ADRs and (b) the brief's authorized scope **before** editing. A blind edit-everything pass can re-introduce a boundary duplication or commit scope creep — regressing quality while appearing responsive.
- The honest deliverable for a shape-2 or shape-3 nit is a recorded rationale (in the handoff and `docs/state.md`), not a diff. "No code change, and here is precisely why" is a complete, defensible resolution.
- The Documenter should capture the *disposition of every nit* (fixed / conscious no-op / deferred-with-pointer) in the rolling log, so a later session does not re-litigate a settled non-change as if it were an open defect.

## Where It Should Land

`docs/dev-process.md` — Review Loop section, as a Builder rule for handling APPROVE-WITH-NITS under "fix all". Candidate constraint for `.claude/commands/dev-builder.md` ("triage each nit by shape; a conscious-decision or out-of-scope nit is resolved by recorded rationale, not a code change") and `.claude/commands/dev-documenter.md` ("record per-nit disposition in the rolling log").
