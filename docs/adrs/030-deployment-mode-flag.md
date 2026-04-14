# ADR-030: Deployment mode flag for public vs workspace surfaces

**Date:** 2026-04-14
**Status:** accepted

## Context

Ditto runs in two distinct deployment shapes:

1. **Public** — the marketing/demo site (e.g. `ditto.so`). The root path
   serves a "front door" (`<WelcomePage />`), `/welcome` is publicly routable,
   and `/admin` exposes the network-level admin dashboard.
2. **Workspace (client install)** — a single-tenant Ditto running for one
   person/business (e.g. on Railway). There is no front door (no marketing
   visitors) and no admin (no network operator). The root should land
   authenticated users in their workspace and bounce unauthenticated visitors
   to `/login`.

The workspace auth middleware (Brief 143, commit `1b6b63e`) introduced
session gating but did not distinguish between these deployments. Two
problems followed:

- On Railway (workspace deployment), visiting `/` redirected to
  `/login?redirect=/` because `/` was not in `PUBLIC_PREFIXES`. The
  `app/page.tsx` "front door" branch never executed. This was *accidentally*
  the right behavior for a workspace install but wrong by intent — it was a
  side effect of route gating, not a deployment decision.
- `/welcome` and `/admin` were `PUBLIC_PREFIXES`, so they would render on a
  Railway deploy if anyone navigated there — exposing surfaces that aren't
  meant to ship to clients.

We considered three flag designs:

- Per-surface flags (`ENABLE_FRONT_DOOR`, `ENABLE_ADMIN`, `ENABLE_CHAT`) —
  rejected. Three booleans = 8 combinations, most nonsensical. The surfaces
  co-vary in practice.
- A single deployment mode flag — chosen.
- Build-time exclusion via separate Next.js builds — rejected. Adds CI
  complexity for a runtime decision that's a small surface.

## Decision

Introduce a single deployment mode flag:

```
DITTO_DEPLOYMENT = "public" | "workspace"
```

Default: `"workspace"` — the safer default. A stray Railway env that forgets
to set the flag does not accidentally expose the front door or admin.

Two enforcement points:

1. **Middleware** (`packages/web/middleware.ts`) — affirmatively returns 404
   for `/welcome` and `/admin` prefixes in workspace mode (hard block at the
   edge), and adds `pathname === "/"` to the public list in public mode so
   the front door can render to unauthenticated visitors.
2. **Route layouts** (`app/welcome/layout.tsx`, `app/admin/layout.tsx`) —
   server-component layouts call `notFound()` in workspace mode as a
   belt-and-braces guard. This also covers the local-dev case where
   `WORKSPACE_OWNER_EMAIL` is unset and middleware bypasses auth.

`app/page.tsx` branches on `isPublicDeployment()` so the `<WelcomePage />`
fallback only appears in public mode. In workspace mode, unauthenticated
visitors never reach the page (middleware redirects to `/login`); authed
visitors see `<EntryPoint />`.

The flag lives in `packages/web/lib/deployment.ts` as a tiny Edge-runtime
compatible module: only reads `process.env.DITTO_DEPLOYMENT`, no node imports.

## Provenance

Pattern adopted from 12-factor app config (env-based runtime selection) and
SaaS template repos that gate "marketing" vs "app" surfaces off a single
mode flag (e.g. Rails `RAILS_ENV` shaping which controllers mount, Next.js
templates that branch on a `NEXT_PUBLIC_*` tenant flag). The general idea —
one env var governing which surfaces ship — is widespread.

What's specific to Ditto is the surface contract: which prefixes belong to
each mode, and the defense-in-depth split between middleware-level hard
404s and server-component layout guards.

## Consequences

What becomes easier:

- One flag answers "what is this deployment?" — easier to reason about than
  three independent toggles.
- Adding a new public-only surface = add it to one list in middleware and
  add a layout guard. No combinatoric thinking.
- Client deployments are affirmatively safe by default — forgetting the env
  doesn't leak admin.

What becomes harder:

- We can't have weird hybrids ("public minus admin", "workspace plus front
  door") without growing the contract. If product needs that, we'll need
  per-surface flags. Today: nobody wants that.

What new constraints does this introduce:

- Any new public-only surface must be added to `PUBLIC_MODE_PREFIXES` and
  `WORKSPACE_MODE_BLOCKED_PREFIXES` in middleware, and must have a layout
  guard.
- The default-to-workspace contract is load-bearing for safety. If a future
  deployment platform ships an env shape that defaults to a marketing site,
  we'll need to revisit.

Follow-up decisions:

- Should `/chat` (currently public in both modes) become mode-conditional?
  Today it's used for both magic-link sessions (workspace) and demo (public).
  Defer until a concrete client install needs to drop it.
- Should there be an env validator at boot that warns on unknown
  `DITTO_DEPLOYMENT` values? The current code silently falls back to
  `workspace` (safe). A startup log line would help operators catch typos.
