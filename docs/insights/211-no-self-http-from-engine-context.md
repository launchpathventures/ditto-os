# Insight-211: No self-HTTP roundtrips from server-side engine context

**Date:** 2026-04-27
**Trigger:** Brief 225 Reviewer C1 — `surface-actions.ts:handleGithubProjectConnect` POSTed to its own `/api/v1/projects` route via `fetch()`, which loses the workspace-session cookie and 401s in any deployment with `WORKSPACE_OWNER_EMAIL` set.
**Layers affected:** L3 Harness, L6 Human (form-submit dispatcher seam)
**Status:** active

## The Insight

When the engine's server-side code (form-submit dispatcher, harness handlers, surface-action handlers) needs to perform an operation that's also exposed as an authenticated HTTP route, **never call the route via `fetch()`** — extract the operation into a callable helper and invoke it in-process.

Self-HTTP roundtrips inside the same process feel convenient ("the route already exists, just POST to it") but break in any deployment with cookie-based auth: the server-side engine has no cookies to forward, so the auth middleware rejects the call. The bug is invisible in local dev (where `WORKSPACE_OWNER_EMAIL` is unset and auth is disabled) and manifests only in production.

## Implications

- For every Next.js API route that performs a meaningful operation, factor the operation into a pure callable in `src/engine/` (e.g., `createOnboardingProject`, `confirmProjectOnboarding`, `cancelProjectOnboarding`).
- The route handler becomes a thin adapter: parse body → check auth → call the engine helper → translate the result to a `NextResponse`.
- Server-side engine code (form-submit dispatchers, harness handlers, system-agent steps) imports the helper directly. No fetch.
- Auth happens at the HTTP boundary, not inside the helper. The helper trusts its caller.
- Trace: any new server-side `fetch(/api/...)` call from inside the engine is a code smell. Grep `fetch.*api.*v1` periodically.

## Where It Should Land

- ADR candidate when the pattern shows up in 2-3 more places (currently: Brief 225's `createOnboardingProject` is the first deliberate extraction; Brief 223's POST handler still has its inline logic the route is the only caller of).
- Architecture spec L3 §"API surface vs engine helpers" — document the layering: routes are thin, engine helpers are thick, engine-internal callers always use the helpers.
- Reviewer checklist item: "Does any server-side code `fetch()` an in-process API route?" → factor out.
