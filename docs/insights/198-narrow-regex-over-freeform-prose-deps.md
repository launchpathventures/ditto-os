# Insight-198: Narrow Regex Over Freeform Prose as a Safe-by-Default Ignore Policy

**Date:** 2026-04-18
**Trigger:** Brief 188 (cross-brief autopilot) — needed to enforce the `**Depends on:**` field of Ditto briefs as machine-readable dependency declarations. The field is freeform prose and mixes brief references (`Brief 092`), ADRs (`ADR-005`), phase mentions (`Phase 14 Network Agent complete`), infrastructure callouts (`credentials table`), and parenthetical descriptions. A best-effort parser would be brittle: false-positives (skipping briefs that should ship) and false-negatives (claiming briefs that aren't actually unblocked).
**Layers affected:** Meta (dev-process); generalizable to any L1 (Process) field that mixes structured and unstructured signals in human-authored content.
**Status:** active

## The Insight

**When a field is human-authored freeform prose that mixes structured and unstructured references, parse only the strict subset the machine can validate reliably and treat everything else as informational. Pair this with a human gate that confirms non-machine-enforced blockers are actually resolved.**

The autopilot extracts dependencies via the regex `\bBrief\s+(\d+)\b` (case-insensitive) from the `**Depends on:**` line. Only those references are enforced as blockers. ADRs, phases, infrastructure references, and parenthetical descriptions are intentionally ignored. The `**Status:** ready` flip remains the human gate confirming non-brief blockers are actually resolved.

This is the opposite of the usual "parse as much as possible" instinct. The instinct fails because freeform prose has no schema to validate against — every parser hits ambiguity sooner or later. The narrow-by-default policy says: machines enforce only what they can prove they understand; humans cover the gap.

## Implications

- **Documentation discipline is unchanged.** Brief authors keep writing `**Depends on:**` as natural prose. The narrow regex doesn't constrain how humans write the field; it constrains only what the machine treats as a blocker.
- **Authors who want machine-enforced cross-brief dependencies must use `Brief NNN` syntax explicitly.** Saying "depends on the credentials migration" is informational only. This is intentional — vague references are not machine-actionable.
- **The human gate becomes load-bearing.** The autopilot trusts that anything marked `**Status:** ready` has had its non-brief blockers resolved by the human. Reviewers approving briefs for `ready` are the safety net. (See Insight-199 / ADR-035 doctrine 2 for the trust-boundary framing.)
- **Generalizable to any "rich text with embedded references" pattern.** Future tools that parse user-authored content for machine-actionable signals (e.g. linking briefs to insights, detecting cross-references in prose, extracting blockers from issue descriptions) should default to narrow extraction over generous parsing.

## Where It Should Land

- **ADR-035** (`docs/adrs/035-brief-state-doctrine.md`) doctrine 3 documents this for the autopilot's specific application.
- **Promote to a general principle in `docs/dev-process.md`** or `architecture.md` once a second application emerges. Until then, the autopilot is the only consumer.
- **Brief template** (`docs/briefs/000-template.md`) could optionally annotate the `**Depends on:**` line with a machine-readable marker convention (e.g., "list `Brief NNN` references first, prose context after"), but this is not required — authors keep writing prose, the regex finds what it finds.
