# Brief 088: Network API Routes + Authentication

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 086 (Network Service deployed)
**Unlocks:** Brief 089 (Workspace Seed + SSE Bridge)

## Goal

- **Roadmap phase:** Phase 14: Network Agent
- **Capabilities:** All 13 ADR-025 Network API endpoints, token-based auth middleware, token management CLI

## Context

ADR-025 defines the Network API surface. Brief 086 deploys the server. This brief implements the API routes that workspaces (and eventually other clients) call. All routes live at `/api/v1/network/` (versioned from day one per ADR-025).

## Non-Goals

- **SSE event stream.** That's Brief 089.
- **Seed export/import logic.** That's Brief 089.
- **Workspace-side code.** That's Brief 089.

## Constraints

- **All routes at `/api/v1/network/*`.** Versioned from day one.
- **Public routes** (no auth): `verify`, `intake`, and the parent `healthz` from 086.
- **Protected routes** (Bearer token required): all others.
- **Token validation** is constant-time hash comparison, not plaintext lookup.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Bearer token middleware | Industry standard (Express/Next.js) | pattern | Simple, well-understood |
| Route handlers with lazy engine import | Ditto existing `/api/feed`, `/api/chat` | existing | Same pattern for all API routes |
| Token hash comparison | bcrypt/crypto timing-safe | pattern | Prevents timing attacks |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `networkTokens` table (id, userId, tokenHash, createdAt, revokedAt) |
| `src/test-utils.ts` | Modify: Add `network_tokens` table to createTables |
| `src/engine/network-api-auth.ts` | Create: `validateToken(authHeader)` → returns userId or null. Constant-time hash comparison. |
| `src/cli/commands/network.ts` | Create: `pnpm cli network token create --user-id <id>`, `pnpm cli network token list`, `pnpm cli network token revoke <id>` |
| `packages/web/app/api/v1/network/verify/route.ts` | Create: Moved from `/api/network/verify` — public, no auth |
| `packages/web/app/api/v1/network/intake/route.ts` | Create: Moved from `/api/network/intake` — public, no auth |
| `packages/web/app/api/v1/network/status/route.ts` | Create: Protected — calls `handleNetworkStatus` |
| `packages/web/app/api/v1/network/people/route.ts` | Create: Protected — `GET` lists user's connections |
| `packages/web/app/api/v1/network/people/[id]/route.ts` | Create: Protected — `GET` person detail + memory, `PATCH` update person |
| `packages/web/app/api/v1/network/people/[id]/opt-out/route.ts` | Create: Protected — `POST` opt out |
| `packages/web/app/api/v1/network/plan/route.ts` | Create: Protected — `POST` submit plan |
| `packages/web/app/api/v1/network/approve/route.ts` | Create: Protected — `POST` approve with optional edits |
| `packages/web/app/api/v1/network/reject/route.ts` | Create: Protected — `POST` reject with reason |
| `packages/web/app/api/v1/network/feedback/route.ts` | Create: Protected — `POST` correction signal |
| `packages/web/app/api/v1/network/register/route.ts` | Create: Protected — `POST` workspace registration |

## User Experience

- **Jobs affected:** None directly — this is API infrastructure.
- **Designer input:** Not invoked.

## Acceptance Criteria

1. [ ] `networkTokens` table exists in schema with id, userId, tokenHash, createdAt, revokedAt columns.
2. [ ] `pnpm cli network token create --user-id founder` generates a token and prints it. Token is stored hashed in DB.
3. [ ] `pnpm cli network token list` shows active tokens (without revealing the actual token).
4. [ ] `pnpm cli network token revoke <id>` sets revokedAt, token no longer validates.
5. [ ] `GET /api/v1/network/verify` works without auth (public).
6. [ ] `POST /api/v1/network/intake` works without auth (public).
7. [ ] `GET /api/v1/network/status` returns 401 without token, 200 with valid token.
8. [ ] `GET /api/v1/network/people` returns user's connections list (auth required).
9. [ ] `GET /api/v1/network/people/:id` returns person detail + person memories (auth required).
10. [ ] `PATCH /api/v1/network/people/:id` updates person record fields (auth required).
11. [ ] `POST /api/v1/network/plan` accepts plan JSON and returns success (auth required).
12. [ ] `POST /api/v1/network/approve` accepts approval with optional `edits` field (auth required).
13. [ ] `POST /api/v1/network/reject` accepts rejection with `reason` field (auth required).
14. [ ] Revoked tokens return 401 on all protected routes.

## Smoke Test

```bash
# Create token
pnpm cli network token create --user-id founder
# Expect: Token: dnt_abc123...

# Test public route
curl -X POST http://localhost:3000/api/v1/network/verify \
  -H "Content-Type: application/json" -d '{"email":"test@example.com"}'
# Expect: 200

# Test protected route without token
curl http://localhost:3000/api/v1/network/status
# Expect: 401

# Test protected route with token
curl -H "Authorization: Bearer dnt_abc123..." \
  http://localhost:3000/api/v1/network/status
# Expect: 200 with network status JSON

# Test revocation
pnpm cli network token revoke <token-id>
curl -H "Authorization: Bearer dnt_abc123..." \
  http://localhost:3000/api/v1/network/status
# Expect: 401
```

## After Completion

1. Update `docs/state.md`
2. Proceed to Brief 089 (Workspace Seed + SSE Bridge)
