# Brief 089: Workspace Seed + SSE Bridge

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 088 (Network API + Auth)
**Unlocks:** Full workspace provisioning, Layer 2 → Layer 3 graduation, Self continuity

## Goal

- **Roadmap phase:** Phase 14: Network Agent
- **Capabilities:** Seed export endpoint, workspace-side seed import on first boot, SSE event stream with reconnection, Self continuity (no cold start after seed)

## Context

Brief 088 builds the Network API routes. This brief builds the bridge: the seed endpoint that exports everything Alex knows about a user, the workspace-side import that makes Self remember, and the SSE stream for ongoing sync.

## Non-Goals

- **Turso embedded replicas.** API-based sync only.
- **Managed cloud auto-provisioning.** Manual seed trigger via env vars.
- **Bi-directional workspace → Network sync.** Workspace calls Network API endpoints from Brief 088. No reverse push.

## Constraints

- **Seed format must match the schema defined in Brief 087 (parent).** Version field `"1"`. JSON payload.
- **SSE reconnection must use `Last-Event-ID` header.** In-memory ring buffer of 100 events per user. `sync_required` event when gap exceeds buffer.
- **First boot detection:** Workspace checks `DITTO_NETWORK_URL` env var + empty `memories` table (no self-scoped memories = first boot).
- **Backward compatible:** No `DITTO_NETWORK_URL` = standalone workspace, no seed, no SSE.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| SSE with Last-Event-ID reconnection | HTML5 SSE spec, Ditto existing `/api/events` | existing + pattern | Standard reconnection model |
| Ring buffer for event replay | Redis Streams, Kafka consumer groups | pattern | Bounded memory, time-ordered replay |
| Seed export as JSON | Supabase project clone | pattern | One-time full state export |
| First-boot env var detection | 12-factor app methodology | pattern | Config via environment |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/api/v1/network/seed/route.ts` | Create: `GET /network/seed` — exports user model per seed schema from Brief 087 |
| `packages/web/app/api/v1/network/events/route.ts` | Create: `GET /network/events` (SSE) — real-time event stream with Last-Event-ID reconnection |
| `src/engine/network-seed.ts` | Create: `exportSeed(userId)` (Network side) + `importSeed(seedJson)` (Workspace side) |
| `src/engine/network-events.ts` | Create: `NetworkEventEmitter` — in-memory ring buffer, `emit(userId, event)`, SSE writer, reconnection replay |
| `src/engine/network-seed.test.ts` | Create: Tests for seed export (correct schema), seed import (memories + people created), first-boot detection, backward compat |
| `src/engine/network-events.test.ts` | Create: Tests for ring buffer, event replay on reconnect, sync_required on overflow |
| `packages/web/instrumentation.ts` | Modify: On startup, if `DITTO_NETWORK_URL` is set and local DB has no self-scoped memories, trigger seed import |
| `.env.example` | Modify: Add `DITTO_NETWORK_URL`, `DITTO_NETWORK_TOKEN` |

## User Experience

- **Jobs affected:** Orient — Self's first workspace conversation references what Alex learned on the Network.
- **Process-owner perspective:** "Hey Tim, welcome to your workspace. Your sales outreach is running, Priya's introduction went well, and I think we should talk about that hiring need you mentioned." No re-onboarding.
- **Designer input:** Not invoked — continuity comes from seeded memory, not a new UI component.

## Acceptance Criteria

1. [ ] `GET /api/v1/network/seed?userId=X` returns JSON matching the seed schema (version, memories, people, interactionSummaries, plans, trustSettings, personaAssignment).
2. [ ] Seed export includes only the specified user's data (no cross-user leakage).
3. [ ] `importSeed(seedJson)` creates self-scoped memories, people records (with correct visibility), and interaction summaries in the workspace database.
4. [ ] First-boot detection: workspace with `DITTO_NETWORK_URL` + empty self-scoped memories auto-triggers seed import.
5. [ ] Workspace without `DITTO_NETWORK_URL` does not attempt seed import (backward compatible).
6. [ ] SSE stream at `/api/v1/network/events` delivers events in real-time with `id` field.
7. [ ] SSE reconnection: client sends `Last-Event-ID`, server replays buffered events after that ID.
8. [ ] SSE overflow: when gap exceeds 100-event buffer, server sends `sync_required` event.
9. [ ] After seed import, querying self-scoped memories returns the imported user model.
10. [ ] Person records imported during seed preserve `visibility` and `personaAssignment`.

## Smoke Test

```bash
# === Network side ===

# Create token (from Brief 088)
pnpm cli network token create --user-id founder

# Test seed endpoint
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/network/seed?userId=founder
# Expect: JSON with version:"1", memories, people, plans

# Test SSE stream
curl -N -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/network/events?userId=founder"
# Expect: SSE stream opens, :keepalive every 30s

# === Workspace side (fresh database) ===

export DITTO_NETWORK_URL=http://localhost:3000
export DITTO_NETWORK_TOKEN=<token>

pnpm cli sync
# Expect: "Network seed imported: X memories, Y people, Z plans"

pnpm cli memory list --scope self
# Expect: imported user model memories from Network
```

## After Completion

1. Test end-to-end Layer 2 → Layer 3 graduation
2. Update `docs/state.md`
3. Document workspace setup in README
4. Phase retrospective
