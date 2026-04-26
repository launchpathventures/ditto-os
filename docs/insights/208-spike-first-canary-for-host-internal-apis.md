# Insight-208: Spike-first canary tests for host-internal API dependencies

**Date:** 2026-04-26
**Trigger:** Brief 212 (Workspace Local Bridge) AC #1 — the `instrumentation.ts` hook that attaches a `ws` server to Next.js's underlying HTTP server has to use `process._getActiveHandles()`, a Node-internal undocumented API. Next.js's prototype-listen patch alone fired too late under `next dev`. Reviewer flagged the fragility.
**Layers affected:** L3 Harness (deployment-shape integration), L5 Learning (self-improvement signal)
**Status:** active

## The Insight

When an integration depends on a **host-internal undocumented API** (Node's `_getActiveHandles`, a framework's reflection trick, a private-class-field accessor), ship a **spike test that exercises the integration end-to-end through the real host** — and treat the spike test as the canary. If the host changes its internal contract, the canary fails loudly; without it, the integration silently breaks and the symptom shows up far from the cause.

In Brief 212 the spike (`bridge-server.spike.test.ts`) actually boots `next dev` as a child process, dials a real WebSocket through the real upgrade path, and asserts a JSON-RPC roundtrip succeeds. It's slow (~10s) and unusual for vitest, but it's the *only* test that catches a regression in the `_getActiveHandles` discovery hook — every other test stubs the connection map.

## Implications

1. **"Use the real host stack" is sometimes worth the runtime cost.** Mocking is the wrong default when the seam under test IS the host integration. The spike's value is precisely that it doesn't mock.
2. **Spike tests deserve a dedicated naming convention** (`*.spike.test.ts`) so reviewers know they're not regular fast unit tests and shouldn't be deleted "for performance."
3. **Document the failure mode + pivot path inline.** Brief 212's spike comment names the fragility and the architect-approved pivot ("custom Next.js server wrapping http.createServer + getRequestHandler"). When the test fails, the reader knows what to do next.
4. **Pair host-internal API use with a comment quoting Node's stability disclaimer.** The discovery code in `bridge-server.ts` does this; it makes the brittleness obvious to future maintainers.

## Where It Should Land

- Architecture spec, §L3 Harness or §Building Blocks: short paragraph on "spike-first for host-internal seams" as a discipline.
- `docs/dev-process.md` Builder contract: add "if you're touching a Node-internal or framework-private API, ship a `*.spike.test.ts` that boots the real host."
- Adoption signal: when Brief 217 / 218 / future runner adapters land, see if they ship similar spikes; if yes, this pattern's been validated and can move into the architecture spec.
