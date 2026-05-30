# Insight-239: Validate Input Shape Before Minting Audited Step Runs

**Date:** 2026-05-19
**Trigger:** Brief 284 `/dev-review` 5-pass + fix-all. The Pass 4 (Security/Validation) lens caught `/api/v1/network/privacy/{export,delete}` calling `createNetworkLaneStepRun({ route: \`network-privacy-export-${action}\` })` *before* validating that `action` was in the allowed set (`["initiate-challenge", "verify-and-export" | "verify-and-delete"]`). The action discriminator flowed straight into the persisted `route` column of the wrapper step-run row, and a malformed `action` only failed downstream at the explicit `invalid_action` HTTP 400 branch — by which point the step-run row was already written.
**Layers affected:** L3 Harness, L6 Human
**Status:** active

## The Insight

The wrapper-run primitive from [[232-audited-http-route-wrapper-step-run-for-guarded-tools]] gives every HTTP entry seam a way to satisfy the [[215-steprun-guard-internal-vs-external-side-effects]] guard for `stepRunId`-protected engine tools. But minting that wrapper is itself a side effect: it writes a row to `step_runs` (or its network-lane peer) with caller-shaped strings (`route`, `sessionId`) interpolated in. If the route validates input *after* the mint — including the `action` discriminator that often flows directly into `route` — every malformed request still produces a persisted artifact. The HTTP 400 rejection becomes a lie: the request was "rejected" but its caller-controlled string is now durable.

The rule: **validate the shape of inputs that flow into the wrapper-run insert before calling `createNetworkLaneStepRun`.** The bare-minimum check is the `action` discriminator (or any other field interpolated into a column the mint writes). Anything that the mint will persist must be validated against an allowed set first; only then does the route open its wrapper.

This is a small but real refinement of 180/232. 180 says "guarded tools require a step-run." 232 says "HTTP routes mint their own wrapper step-run." Neither says "validate the bytes flowing into the mint." When that gap is present, the wrapper-run table becomes a free attacker-controlled string log — not a security hole on its own, but an audit-trail noise source and a missed boundary discipline.

## Implications

1. Audited HTTP routes that use an `action` discriminator (`POST /api/v1/network/privacy/*`, future privacy/admin/abuse seams, anything else that decides between `initiate-*` and `verify-and-*` flows) must declare a `VALID_ACTIONS` set and reject unknown actions with HTTP 400 *before* `createNetworkLaneStepRun`. Same posture as the existing `hasCallerStepRun(body)` rejection (Insight-232/211): cheap, deterministic, runs before any side effect.
2. The same rule applies to any input shape that flows into the wrapper-run insert. `subjectType` already had its `SUBJECT_TYPES` set checked upfront in Brief 284's routes — that's the pattern; `action` was the gap.
3. Reviewer checklist (architecture review §HTTP routes touching guarded tools) should add an item: "are all inputs that flow into the wrapper-run row validated before the mint?" alongside the existing wrapper-creation/close-on-error/bypass-rejection/lane-match items from Insight-232.
4. This is **not** an argument for full input validation before any DB write — only for inputs that the wrapper-mint will persist. Heavier shape validation (well-formed UUIDs, body length caps, etc.) can legitimately run after the wrapper opens, because failures there will still close the wrapper with the recorded outcome.

## Where It Should Land

- `docs/architecture.md` L3 Harness section, alongside the wrapper-run paragraph absorbed from Insight-232 — extend with "validate any input that the mint persists before opening the wrapper."
- `docs/review-checklist.md` — extend the existing HTTP-route-touching-guarded-tools item (item 18-19 family, post-235/236 absorption) with the validate-before-mint sub-clause.
- Future briefs that introduce a new audited HTTP seam: AC list should include "rejects malformed `action` (or other mint-persisted inputs) before wrapper open" alongside the existing "rejects caller-supplied `stepRunId`" AC.
