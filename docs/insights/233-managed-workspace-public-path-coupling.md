# Insight-233: When Two Cross-Component Contracts Tighten in the Same Change, Walk Endpoint-by-Endpoint

**Date:** 2026-05-12
**Trigger:** Brief 267 closed two related gaps in the same change — the provisioner now always sets `WORKSPACE_OWNER_EMAIL` on managed workspaces, AND middleware now fails closed on managed workspaces missing owner-auth env. Each move was correct in isolation, but together they exposed an unguarded gap: `/api/healthz` was not in the public allow-list, so the provisioner's deep-health probe started redirecting to `/login` and the saga timed out at the full 300s budget. Brief 267 passed review, the workspace boot succeeded once, and the regression only surfaced when task #18 attempted to reprovision through the hardened path.
**Layers affected:** L3 Harness, L6 Human
**Status:** active

## The Insight

When a single change tightens two contracts that meet at a cross-component seam — here, "provisioner-supplies-owner-env" and "middleware-fails-closed-without-owner-env" — the AND of the two new behaviors must be validated endpoint-by-endpoint, not just at the surfaces each contract was reasoning about. The provisioner author was reasoning about the workspace's UI routes; the middleware author was reasoning about session enforcement. Neither author was reasoning about `/api/healthz`, which is owned by the provisioner's own deep-health probe and consumed by the provisioner itself.

The pattern: a tightened contract that takes a previously-loose precondition (owner-email may be unset) and makes it always-tight (owner-email is always set on managed workspaces) silently changes which middleware codepath runs at runtime. Any endpoint the middleware now treats more strictly needs to be re-classified against the public/private boundary, even if its handler did not change.

## Implications

1. **Reviewers should walk the endpoint matrix when middleware behavior tightens.** For each public-allow-list entry, ask: "does this still reach its handler under the new middleware behavior, on a fully-configured managed deployment?" The fact that an endpoint has its own auth (or has none, like healthz) is not enough — middleware runs first.
2. **Provisioner-consumed endpoints are first-class public surfaces, not implementation details.** `/api/healthz`, future SSE bootstrap probes, and any future endpoint the Network Service calls during the provisioning saga belong in `BASE_PUBLIC_PREFIXES`, with a regression test that exercises the fully-configured managed-workspace env.
3. **Tests for middleware-tightening changes should cover the "fully-configured managed workspace" cell of the matrix, not just the "missing env" failure-closed cell.** The Brief 267 middleware tests covered fail-closed correctly but did not assert that a correctly-configured managed workspace still serves `/api/healthz` without auth.
4. **Brief 267's regression checklist should add an "endpoint walk" line.** Any future brief that touches both the provisioner env contract and middleware should require an explicit endpoint-by-endpoint table in review.

This is the dual of Insight-231 (cross-deployment auth artifacts must validate in the consuming deployment): there, the issue was the *consumer* not having validation material; here, the issue is the *consumer's own provisioner-side probe* being inadvertently auth-gated by a contract tightening that was reasoning about a different audience.

## Where It Should Land

- ADR-025 §6 (managed workspace boundary / provisioning probe contract): add an explicit "public surfaces the provisioner depends on" list, with `/api/healthz` as the seed entry.
- Brief 267 review checklist (in the complete/ folder): add an "endpoint walk on middleware-tightening" line so the next analogous change has explicit coverage.
- `docs/review-checklist.md`: add a checklist item under the auth/middleware section: "When middleware behavior is tightened on managed workspaces, walk the public-allow-list endpoint-by-endpoint against the fully-configured env, not just the failure-closed env."
- Future managed-workspace briefs that touch middleware: state the endpoint matrix as an acceptance criterion.
