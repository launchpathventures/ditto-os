# Insight-232: Audited HTTP-Route Wrapper Step Run for `stepRunId`-Guarded Engine Tools

**Date:** 2026-05-12
**Trigger:** Brief 258 build. The `/api/v1/network/scout` route had to invoke `scout_off_network`, which is `stepRunId`-guarded (Insight-180). The route could not legitimately `fetch()` itself to acquire one (Insight-211), and a route-level bypass would defeat the guard. The route instead synthesises a network-lane wrapper step run, records it as audited, then calls the guarded tool with that id.
**Layers affected:** L2 Agent, L3 Harness, L6 Human
**Status:** active

## The Insight

Side-effecting engine tools require a `stepRunId` so every invocation is anchored to an audited run (Insight-180). Engine code must never call itself over HTTP to manufacture one (Insight-211). That leaves HTTP entry seams — public or session-authenticated routes that legitimately need to drive a guarded tool — without a way to satisfy the guard unless they fabricate it or are exempted.

The resolution is a third primitive: an audited wrapper step run created by the route itself, in the same trust tier as the entry seam. The route validates input, enforces session / Turnstile / rate limit, opens a wrapper step run on the lane it belongs to (network lane for `/api/v1/network/*`), passes that id to the tool, and closes the wrapper with the outcome. Bypass `stepRunId` values supplied by the client must be rejected; only the route may mint one. `DITTO_TEST_MODE=true` continues to be the only path that skips the guard, and only inside engine tests.

This pattern is the third leg of a triangle: Insight-180 (guard) + Insight-211 (no self-HTTP) + Insight-232 (wrapper run at the HTTP seam). With all three in place, every guarded-tool invocation has a real audit trail whether it originated from an agent step, a scheduler, or an HTTP request.

## Implications

1. Any HTTP route that needs to invoke a `stepRunId`-guarded engine tool must create a lane-appropriate wrapper step run before the call and close it after. The wrapper is the route's own step, not a borrowed one.
2. Routes must reject `stepRunId` values from the request body — the wrapper id is route-minted. A test for "client-supplied stepRunId is ignored / 4xx" belongs in every such route's spec.
3. Reviewer checklists for new HTTP routes touching guarded tools should require: (a) wrapper creation point, (b) close-on-error path, (c) bypass-rejection test, (d) lane match between wrapper and tool.
4. The wrapper primitive (used in Brief 258 via `src/engine/network-step-run.ts`) should be reused, not re-implemented per route. New lanes (workspace, public visitor) need their own wrapper helpers in the same shape.

## Where It Should Land

- `docs/architecture.md` L3 Harness section, alongside the `stepRunId` guard description from Insight-180.
- ADR-025 centralized Network Service, near the route → engine tool contract for network-lane endpoints.
- Future brief acceptance criteria template: when a brief adds an HTTP route that invokes a guarded tool, the AC list must include "creates audited wrapper step run, rejects bypass `stepRunId`, closes wrapper on success and error."
