# Brief 087: Workspace Provisioning Pipeline (Parent)

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 086 (Network Service deployed), ADR-025 (Centralized Network Service), ADR-016 (Conversational Self)
**Unlocks:** Layer 2 → Layer 3 graduation, self-hosted workspace connection, full Ditto experience

## Goal

- **Roadmap phase:** Phase 14: Network Agent — workspace provisioning
- **Capabilities:** Network API (versioned at `/api/v1/network/`), workspace seed, SSE event stream, auth middleware, token management, workspace registration, Self continuity after seed

## Context

ADR-025 defines the Network ↔ Workspace API surface and the workspace seed flow. This parent brief designs the full pipeline. Split into two sub-briefs along the natural seam: server-side API (088) and client-side bridge (089).

## Non-Goals

- **Managed cloud workspace auto-provisioning (Track A).** Self-hosted connection only for now.
- **Turso embedded replicas.** API-based sync only.
- **Multi-workspace per user.** One workspace per user.

## Architecture

### Seed JSON Schema (stable contract)

```json
{
  "version": "1",
  "userId": "string",
  "personaAssignment": "alex" | "mira",
  "memories": [
    { "scopeType": "self", "type": "string", "content": "string", "confidence": 0.0-1.0, "shared": false }
  ],
  "people": [
    { "id": "string", "name": "string", "email": "string?", "organization": "string?",
      "role": "string?", "visibility": "internal"|"connection", "trustLevel": "cold"|"familiar"|"trusted",
      "personaAssignment": "alex"|"mira" }
  ],
  "interactionSummaries": [
    { "personId": "string", "type": "string", "mode": "string", "summary": "string?",
      "outcome": "string?", "createdAt": "ISO8601" }
  ],
  "plans": [
    { "mode": "selling"|"connecting", "goal": "string", "status": "active"|"complete", "createdAt": "ISO8601" }
  ],
  "trustSettings": {
    "sellingOutreach": "supervised"|"spot_checked"|"autonomous",
    "connectingIntroduction": "critical"
  }
}
```

### SSE Reconnection Model

SSE events carry a monotonically increasing `id` field. On reconnection, the client sends `Last-Event-ID` header. The Network buffers the last 100 events per user (in-memory ring buffer). On reconnect, events after the last ID are replayed. If the gap exceeds the buffer, the client receives a `sync_required` event and should call `GET /network/seed` for a full refresh.

### Token Management

Network issues API tokens via CLI: `pnpm cli network token create --user-id <id>`. Tokens are stored hashed in a `network_tokens` table. Validation is constant-time hash comparison. Tokens do not expire for MVP (rotation via revoke + re-issue). The CLI command is part of sub-brief 088.

## What Changes (Work Products)

Split into two sub-briefs:

| Sub-brief | Scope | Depends on | Unlocks |
|-----------|-------|------------|---------|
| **088: Network API + Auth** | All `/api/v1/network/*` route handlers (13 endpoints), auth middleware, token CLI, `PATCH /network/people/:id` | Brief 086 (deployed) | Sub-brief 089 |
| **089: Workspace Seed + SSE Bridge** | Seed export/import, SSE event emitter with reconnection, workspace first-boot detection, Self continuity | Sub-brief 088 | Full workspace provisioning |

### Dependency Graph

```
086 (Network deployed)
 └── 088 (Network API + Auth)
      └── 089 (Workspace Seed + SSE Bridge)
```

## Acceptance Criteria (Parent — end state)

1. [ ] All 13 ADR-025 Network API endpoints exist at `/api/v1/network/*` with correct auth.
2. [ ] Workspace auto-imports seed on first boot when `DITTO_NETWORK_URL` is set. Self already knows the user.
3. [ ] SSE stream delivers events in real-time with reconnection support.
4. [ ] Workspace without `DITTO_NETWORK_URL` works as standalone (backward compatible).
5. [ ] End-to-end: Layer 2 user → provisions workspace → seed imports → Self references prior Alex interactions.

## After Completion

1. Test the full Layer 2 → Layer 3 graduation flow
2. Document workspace connection setup
3. Update `docs/state.md`
4. Phase retrospective
