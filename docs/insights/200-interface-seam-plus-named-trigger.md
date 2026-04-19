# Insight-200: Interface-Seam + Named-Trigger Parking for Capability-Gating Decisions

**Date:** 2026-04-19
**Trigger:** Browserbase product-family research (`docs/research/browserbase-product-family.md`) answered the question "when might Ditto adopt Browserbase?" — but the answer was "not now; when X, Y, or Z happens." The Architect's instinct was to pre-write Brief 197 as a skeleton sub-brief under Brief 182. Reflecting on that instinct produced this insight.
**Layers affected:** Meta / dev-process. Applies across all six architecture layers wherever an interface seam exists and a future implementation choice is being deferred.
**Status:** active

## The Insight

When research reveals a capability that **might** be needed but isn't now, and the architecture already has an interface seam where that capability would plug in, the Architect's durable artefact is:

1. **Named triggers** — boolean-testable conditions under which the decision to adopt a specific implementation reopens. Each trigger must be observable from production signal (activity log, heartbeat telemetry, tenant count, user-request volume) rather than subjective feel.
2. **Decision owner** — a specific role (usually Dev PM) responsible for watching for trigger-fire; Architect consulted for the artefact shape at that time.
3. **Decision artefact** — what gets produced when a trigger fires (typically a compact sub-brief under an existing parent, implementing the chosen concrete implementation behind the existing interface). The artefact **shape** is specified now; the **number** is claimed at trigger-fire.
4. **Research input, pre-prepared** — the factual option-space research lives in `docs/research/` now so the trigger-fire turn can act on it without rediscovery. Pricing or vendor facts that will decay MUST carry a dated caveat ("re-verify at trigger-fire").
5. **Cross-reference from the parent brief's Open Questions** — the parking notice lives inside the parent brief, not as a standalone scheduled document.

What the Architect should **not** do:

- **Pre-write a sub-brief** with a claimed brief number and placeholder content. A claimed brief number in the filesystem signals "this is scheduled" to PM and reviewers when it is not. Zombie artefact, maintenance cost, renumbering on conflict, eventual archive — all cost, no value.
- **Pre-write an ADR** for a decision not yet made. ADRs are for decisions taken; speculative ADRs violate ADR hygiene (Insight-043 — Architect owns ADR accuracy).
- **Promote research-surfaced candidates to "depend" or "adopt" in the landscape** before a trigger fires. Research status is evaluation, not commitment.

## Why this pattern, not the usual "just write the brief"

Two existing principles appear to cover this but each misses a piece:

- **"Don't design for hypothetical future requirements"** (CLAUDE.md) — correct but framed as a *prohibition*. It tells the Architect what not to do, not what positive artefact to produce when the human is legitimately asking "what is the path forward?"
- **Insight-050 (Validation before infrastructure)** — correct but at a larger grain (don't build a whole Phase before validating demand). Doesn't speak to the finer-grain case where the interface seam already exists and only the implementation selection is deferred.

The gap this insight fills: **the positive artefact for deferred-implementation decisions.** The interface seam is the architectural commitment (made now, durable). The named-trigger block in Open Questions is the reopening mechanism. Together they are sufficient; nothing more is needed. An unwritten sub-brief is not absence — it is active design hygiene.

## Applicability Test

Use this pattern when **all** of the following hold:

- An interface seam already exists, or is being created in the current brief, that admits multiple future implementations.
- Research has surfaced one or more concrete candidate implementations with factual profiles.
- No current signal proves the capability is needed now.
- The decision cost at trigger-fire is small because the interface holds the structural commitment — only the implementation choice remains.

Do NOT use this pattern (write a brief instead) when:

- The capability is needed now (obviously).
- The interface seam does not exist yet and would need to be designed first — design the seam now, in a brief.
- The triggers cannot be named concretely. If you can't describe what signal would flip the decision, the decision isn't actually deferred; you're avoiding it.

## The Parent Brief's Open-Question block shape

```
**Name of Open Question.** [short context sentence pointing at the seam.]

The [X] implementation is not speculatively pre-briefed. Instead it is parked
behind named triggers — any one of the following flips the decision to reopen:
- Trigger-A (...): [boolean condition observable from signal X].
- Trigger-B (...): [boolean condition observable from signal Y].
- ...

Decision owner: [role]; consulted: [role].
Decision artefact on trigger-fire: [sub-brief / ADR / architecture update —
  specify shape, not number].
Research input already prepared: [research file path + dated pricing/vendor
  caveat if applicable].
```

## Implications

- Parent briefs with substantial interface-seam work (Brief 183's `BrowserRuntime` is the archetypal example; Brief 182 §Open Questions §1 is the first application) become the durable home for their own deferred-implementation decisions. Open Questions is not a junk drawer; it's where the named-trigger contract lives.
- The Researcher and Architect roles stay clean: Researcher produces factual option space, Architect pins triggers + owner. Neither pre-commits to an implementation.
- Reviewers gain a clear test: a brief proposing a pre-written "parked" sub-brief for a deferred implementation should be pushed back on with this insight as the basis.
- Dev PM gains a clear mandate: the named triggers in Open Questions are the surface they monitor. **Dev PM MUST review every parked-trigger block at each phase-boundary retrospective** — a silently-fired trigger is a phase-close audit risk, especially for triggers with security or compliance scope (e.g. Brief 182 Trigger-C, HIPAA BAA). Surface the review in the retro artefact.
- Research inputs prepared for future trigger-fire MUST cite a dated freshness stamp on decay-prone facts (pricing, vendor availability, license terms). The trigger-fire turn is responsible for re-verifying, not for trusting the stamp.

## Where It Should Land

Absorb into `docs/dev-process.md` under the Architect role contract (section on parent-brief authoring + Open Questions hygiene) when **both** of the following hold: (a) at least one parked trigger has fired and been resolved into an executed sub-brief, providing a worked example; AND (b) the pattern has been applied to at least one interface-seam brief distinct from Brief 182 (i.e. a second independent use case, not just another trigger added to the same parent). Until both hold, stays here as an active principle referenced from Brief 182 §Open Questions §1.
