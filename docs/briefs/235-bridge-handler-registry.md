# Brief 235: Bridge Handler Registry + Capability Advertisement

**Date:** 2026-05-01
**Status:** draft
**Depends on:** Brief 212 (Workspace Local Bridge — complete), ADR-044 (Local Client Capability Surface), Brief 234 (Bridge Capability Layer Phase — parent)
**Unlocks:** Briefs 236, 237, 238 (all depend on this substrate)

## Goal

- **Roadmap phase:** Phase 9 — Bridge Capability Layer (sub-brief #1 of Brief 234)
- **Capabilities:** Pluggable handler registry on the daemon side; capability advertisement on the wire; cloud-side per-device capability tracking; backward-compatible fallback for legacy daemons

## Context

Brief 212's daemon dispatches incoming JSON-RPC frames via a hardcoded if/else-if chain in `packages/bridge-cli/src/daemon.ts` `handleFrame()`. This is fine for two handlers (`exec`, `tmux.send`); it does not scale to the 8+ handlers ADR-044 envisions across the capability layer phase. There is no capability discovery — the cloud assumes every paired device can do `exec` and `tmux.send`, which is true today only because those are the only two handlers shipped.

To unlock Briefs 236-238 (and any future capability handler), the daemon needs:
1. A handler registry with explicit registration semantics, so handlers can be added without modifying the dispatch loop
2. A capability advertisement frame on connect, so the cloud knows what each paired device supports

The cloud needs:
1. A persistent record of per-device capabilities (`bridge_devices.capabilities` JSON column)
2. A small in-memory mirror updated on connect/disconnect for fast lookup by the dispatcher
3. Backward compatibility: legacy daemons (without capability advertisement) must still work, treated as `["exec", "tmux.send"]`

## Objective

Refactor the daemon's dispatch path to a typed handler registry, define a `bridge.capabilities` advertisement frame, persist per-device capability lists in the cloud, and ensure both old daemons and old cloud code paths continue to function during the transition.

## Non-Goals

- **No new handler implementations.** Only `exec` and `tmux.send` exist after this brief — they're just registered through the new registry interface instead of hardcoded. New handlers come in Briefs 237 / 238.
- **No UI surfacing of capabilities.** Brief 236 owns capability-gating UI. This brief stops at "capability list is in the DB and queryable".
- **No protocol-version major bump.** Capability advertisement is additive (an optional new frame); old daemons continue to pair successfully and dispatch the same handlers they always did. Major bumps are reserved for breaking wire changes.
- **No mid-connection capability changes.** Capabilities are negotiated once on connect. Re-advertising requires a reconnect.
- **No daemon-side handler hot-reload.** Handlers are registered at daemon startup; changes require a daemon restart. This matches the current model.
- **No changes to `bridgeJobs` schema.** Job rows already carry `kind` (which becomes the registered handler method name); no further schema change needed for jobs.
- **No cross-device capability comparison or selection logic.** When multiple devices are paired and online, the dispatcher's existing single-device or fallback-list selection (Brief 212) is unchanged. Future work.

## Inputs

1. `docs/adrs/044-local-client-capability-surface.md` — the architectural decision; specifically §3 (capability surface) and §6 (capability advertisement)
2. `docs/briefs/234-bridge-capability-layer-phase.md` — parent phase brief; non-goals and constraints inherited
3. `packages/bridge-cli/src/daemon.ts` lines 50-141 — the current `handleFrame()` dispatch (the surface to refactor)
4. `packages/bridge-cli/src/handlers/exec.ts`, `packages/bridge-cli/src/handlers/tmux.ts` — current handler shapes; the `hooks` injection pattern
5. `packages/core/src/bridge/types.ts` — current frame types; will gain capability advertisement type
6. `src/engine/bridge-server.ts` lines 303-360 — connection lifecycle on cloud side; where capability frame will be received and persisted
7. `packages/web/app/api/v1/bridge/devices/route.ts` — devices listing route; will surface `capabilities` field
8. `drizzle/` — current migration state for adding the `capabilities` column
9. LSP `initialize` / `initialized` reference (`microsoft.github.io/language-server-protocol`) — pattern source for capability advertisement
10. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — invocation guard requirement (applies to any new cloud-side function that writes to `bridge_devices.capabilities` from a step context)

## Constraints

- **No new external dependencies in this brief.** Refactor uses only existing libraries (`ws`, `jsonrpc-lite`, drizzle). Adding chokidar, etc., happens in subsequent briefs.
- **Backward compatibility is non-negotiable.** A daemon at the previous protocol version (1.0.0, no capability advertisement) MUST still pair, dispatch `exec`, dispatch `tmux.send`. The cloud MUST NOT reject connections from such daemons. The cloud's in-memory capability mirror treats absent advertisement as `["exec", "tmux.send"]`.
- **Engine-product split** (ADR-044 §5): the handler-registry interface (`BridgeHandler`, `HandlerRegistry`) lives in `@ditto/core/src/bridge/handler-registry.ts` — ProcessOS could host the same daemon. The daemon implementation (`packages/bridge-cli/src/registry.ts`) consumes the interface.
- **Capability schema is in `@ditto/core/src/bridge/capabilities.ts`** — both daemon and cloud consume the same type. Schema changes propagate to both.
- **No side-effecting functions in this brief beyond what already exists.** No `stepRunId` guards needed for the refactor itself. The cloud-side function that writes `bridge_devices.capabilities` is invoked from the WebSocket connection handler (not a step context), so Insight-180 doesn't apply (it operates on harness pipeline calls, not transport handshake).
- **Handler signatures stay backward-compatible.** Existing `exec` and `tmux.send` handlers must continue to function with the same `hooks` injection. The registry just wraps them.
- **No additional logging of credentials.** Existing scrubbing behavior unchanged. Capability frame contents are not credential-bearing (method names + flags), so they may be logged in clear.
- **Handler registration is at daemon startup** — synchronous, before the dialler connects. No registration races.
- **Capability frame size cap: 4 KB.** Realistic upper bound on the capability set (~10 entries × ~200B each). Sanity check, not a security boundary; the `ws` library's framework-level message limits are the real bound. (Reduced from initial 64 KB per Reviewer IMP-6 — unwarranted headroom.)
- **Drizzle migration index reservation:** this brief reserves idx `0019` (next free after `0018_careful_felicia_hardy` per state.md). Per Insight-216, if a parallel session has already claimed 0019 by the time the Builder picks this up, resequence to next free; per Insight-190, verify SQL file exists for every journal entry before commit. Brief 237 has no schema change. Brief 238 (deferred) has none.
- **Migration must not block startup.** If the `capabilities` column doesn't exist yet (drizzle migration not run), cloud must degrade gracefully (treat capability frame as logged-only). This is defensive — the migration is part of this brief, but parallel sessions could leave the cloud running ahead of its schema.
- **Side-effect invocation guard (Insight-180) reminder:** if any new function added in this brief produces external side effects (none planned — this brief is pure plumbing), require `stepRunId`. The advertisement-persist path is internal-only (DB write from a transport handler), not subject to Insight-180.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Capability advertisement on connection | LSP — Language Server Protocol initialize/initialized handshake (`microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/`) | pattern | LSP servers advertise capabilities on `initialize`; clients gate features off advertised set. Same shape, applied to bridge handlers. Implementing our own — we don't need an LSP library, just the conceptual handshake |
| Handler registry pattern | Express router / Hono router (`expressjs/express` `lib/router/index.js`, `honojs/hono` router) | pattern | Standard handler registration: map of method-name → handler with optional middleware. Implementing our own — protocol surface is small (~10 handlers max), no need for a full router framework |
| Backward-compat default capability set | Original to Ditto | original | "Treat absent advertisement as exec+tmux.send" is a Ditto-specific bridging decision driven by Brief 212's existing surface |
| Capability schema (method name + version + trust class + metadata) | LSP `ServerCapabilities` shape (`vscode-languageserver-protocol` types) | pattern | Same handshake-with-typed-shape pattern; trust class is a Ditto addition |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/bridge/handler-registry.ts` | **Create**: `BridgeHandler<P, R>` interface (name, method, schema, execute, optional cancel); `HandlerRegistry` class (register, getHandler, listHandlers); pure logic, no IO |
| `packages/core/src/bridge/capabilities.ts` | **Create**: `BridgeCapability` type (`{ method: string; version: string; trustTier: TrustClass; metadata?: Record<string, unknown> }`); `BridgeCapabilitiesFrame` type (`{ kind: "capabilities"; deviceId: string; capabilities: BridgeCapability[]; protocolMinor: string }`); `TrustClass` re-exported from existing `@ditto/core/src/trust/constants.ts` |
| `packages/core/src/bridge/index.ts` | **Modify**: barrel-export new types and registry |
| `packages/core/src/bridge/types.ts` | **Modify**: add `BridgeCapabilitiesFrame` to the discriminated `BridgeFrame` union (with the `kind: "capabilities"` discriminator) |
| `packages/bridge-cli/src/registry.ts` | **Create**: daemon-side registry instance + initialization helper (`createDaemonRegistry()`); registers existing `exec` and `tmux.send` handlers via the new interface |
| `packages/bridge-cli/src/handlers/exec.ts` | **Modify**: implement `BridgeHandler<BridgeExecPayload, void>` interface; behavior unchanged; expose `name = "exec"`, `method = "exec"`, `trustTier = "supervised"` (default — existing behavior) |
| `packages/bridge-cli/src/handlers/tmux.ts` | **Modify**: implement `BridgeHandler<BridgeTmuxSendPayload, void>` interface; behavior unchanged; `name = "tmux.send"`, `method = "tmux.send"`, `trustTier = "supervised"` |
| `packages/bridge-cli/src/daemon.ts` | **Modify**: replace if/else-if dispatch in `handleFrame()` with `registry.getHandler(method).execute(...)`; on connect (after JWT validated), send `bridge.capabilities` notification with `registry.listHandlers()` shape |
| `packages/bridge-cli/src/dialler.ts` | **Modify**: expose `onConnected` hook so daemon can flush capability frame after upgrade |
| `packages/bridge-cli/src/registry.test.ts` | **Create**: unit tests for `createDaemonRegistry()` (registers expected handlers, dispatch routes correctly, unknown method returns null) |
| `packages/core/src/bridge/handler-registry.test.ts` | **Create**: unit tests for `HandlerRegistry` (register/getHandler/listHandlers; duplicate registration throws) |
| `packages/core/src/bridge/capabilities.test.ts` | **Create**: unit tests for capability frame parsing + validation |
| `drizzle/NNNN_bridge_capabilities.sql` | **Create**: `ALTER TABLE bridge_devices ADD COLUMN capabilities TEXT;` — JSON-encoded `BridgeCapability[]`, nullable (defaults null for legacy devices) |
| `drizzle/meta/NNNN_snapshot.json` + `drizzle/meta/_journal.json` | **Create / Modify**: per Insight-216 + Insight-190; check journal for next free idx; on collision, resequence per Insight-216 prefix-collision recovery pattern |
| `packages/core/src/db/schema.ts` (or `src/db/schema/engine.ts` re-exported) | **Modify**: add `capabilities: text("capabilities", { mode: "json" }).$type<BridgeCapability[] \| null>()` on `bridgeDevices` |
| `src/engine/bridge-server.ts` | **Modify**: add inbound frame handler for `capabilities` notification; `persistDeviceCapabilities(deviceId, capabilities)` writes to `bridge_devices.capabilities` and updates an in-memory `Map<deviceId, BridgeCapability[]>` mirror; `getDeviceCapabilities(deviceId)` reads from the mirror with DB fallback |
| `src/engine/bridge-server.test.ts` | **Modify**: add tests for capability frame ingestion (persists + mirrors), backward compat (no advertisement → mirror returns `["exec", "tmux.send"]` defaults) |
| `packages/web/app/api/v1/bridge/devices/route.ts` | **Modify**: GET response includes `capabilities` field on each device row |
| `packages/web/app/api/v1/bridge/devices/__tests__/route.test.ts` | **Modify**: assert capability field present on response |
| `packages/core/src/bridge/PROTOCOL.md` | **Create or Modify**: protocol reference doc (if it doesn't exist, create); add "Capabilities Advertisement" section describing the frame shape, when it's emitted, fallback behavior |
| `docs/architecture.md` | **Modify** at line 432 — extend the bridge paragraph to mention capability advertisement and cite ADR-044; add a sentence about the registry pattern |
| `docs/dictionary.md` | **Modify**: add entries for "Bridge Handler", "Capability Advertisement", "Trust Tier (per-handler)" |

## User Experience

- **Jobs affected:** None directly. This brief is plumbing — no new user-facing surface. Brief 236 builds on this to deliver UI gating.
- **Primitives involved:** None. UI work is in Brief 236.
- **Process-owner perspective:** Existing experience is unchanged. After this brief ships, paired devices show a `capabilities` field in API responses (visible to operators / debuggers, not end users).
- **Interaction states:** N/A
- **Designer input:** Not invoked — pure plumbing brief, no user-facing surface.

## Acceptance Criteria

1. [ ] `BridgeHandler<P, R>` interface and `HandlerRegistry` class exist in `packages/core/src/bridge/handler-registry.ts`; both exported from `@ditto/core/bridge` barrel
2. [ ] `BridgeCapability`, `BridgeCapabilitiesFrame`, `TrustClass` types exist in `packages/core/src/bridge/capabilities.ts`; both exported from `@ditto/core/bridge` barrel
3. [ ] `packages/bridge-cli/src/registry.ts` exposes `createDaemonRegistry()` returning a `HandlerRegistry` with `exec` and `tmux.send` handlers registered; daemon's `handleFrame()` dispatches via the registry (not via if/else-if)
4. [ ] Existing `exec` and `tmux.send` end-to-end behavior is unchanged: a `runner=local-mac-mini` work item still dispatches and executes correctly (verified by `pnpm test` of existing bridge integration tests, which must pass without modification)
5. [ ] On WebSocket connection upgrade, the daemon emits a `bridge.capabilities` notification within 100ms of receiving the cloud's `bridge.hello`. The notification's `capabilities` array is the result of `registry.listHandlers()`, with each entry containing at minimum `{ method, version, trustTier }`
6. [ ] Capability frame size is rejected at >64 KB at the daemon emit site (logged warn, frame dropped); cloud-side parser also enforces the cap (returns 4400-class WebSocket close on oversized frame)
7. [ ] `bridge_devices.capabilities` column added via Drizzle migration; column is nullable; `_journal.json` and snapshot files generated; no prefix collisions per Insight-216
8. [ ] Cloud's `bridge-server.ts` handles inbound `capabilities` notification: parses, validates, writes to `bridge_devices.capabilities`, updates in-memory `deviceCapabilitiesMirror: Map<string, BridgeCapability[]>`
9. [ ] `getDeviceCapabilities(deviceId)` returns: (a) the in-memory mirror entry if present; (b) the DB row's `capabilities` field if mirror is cold but row exists; (c) the default `["exec", "tmux.send"]` shape if both are absent (legacy daemon fallback)
10. [ ] A simulated legacy daemon (a test fixture in `src/engine/bridge-server.test.ts` that opens a WebSocket with a valid JWT and never emits `bridge.capabilities`) successfully completes the connection lifecycle: cloud accepts the connection, persists no capabilities row, `getDeviceCapabilities(deviceId)` returns the legacy default `["exec", "tmux.send"]`, and an `exec` dispatch over that connection succeeds. **No `git stash` / rebuild ritual** — this is a fully automated integration test using the existing test infrastructure (Reviewer CRIT-7)
11. [ ] `GET /api/v1/bridge/devices` response includes `capabilities` field on each device row; null when absent (legacy device; UI must handle null)
12. [ ] `pnpm run type-check` passes at root; no new TypeScript errors
13. [ ] `pnpm test` passes — both new tests (registry, capabilities, server ingestion) and existing tests (Brief 212's bridge tests must pass unchanged)
14. [ ] `docs/architecture.md` line 432 paragraph updated to mention the registry + capability advertisement, citing ADR-044
15. [ ] `docs/dictionary.md` has entries for Bridge Handler, Capability Advertisement, Trust Tier (per-handler)
16. [ ] `packages/core/src/bridge/PROTOCOL.md` exists and documents the capability frame shape, emission timing, and backward-compat fallback

## Review Process

1. Spawn review agent with: this brief, ADR-044, parent Brief 234, `docs/architecture.md`, `docs/review-checklist.md`
2. Review agent specifically checks:
   - Handler-registry abstraction does not leak product-specific concerns into `@ditto/core/bridge/`
   - Backward compatibility test (AC #10) genuinely validates the legacy daemon path, not just an in-memory simulation
   - The capability frame schema is forward-compatible — new fields can be added without breaking older cloud parsers
   - Drizzle migration is sequenced cleanly (Insight-190 / Insight-216 compliance)
   - No side-effecting functions added without `stepRunId` guard (Insight-180 — none expected here, but verify)
   - Engine vs. product split per ADR-044 §5
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type-check + unit tests
pnpm run type-check
pnpm vitest run packages/core/src/bridge/handler-registry.test.ts
pnpm vitest run packages/core/src/bridge/capabilities.test.ts
pnpm vitest run packages/bridge-cli/src/registry.test.ts
pnpm vitest run src/engine/bridge-server.test.ts

# Integration smoke (requires a running cloud + a buildable daemon)
# Terminal 1: cloud
pnpm dev

# Terminal 2: daemon
cd packages/bridge-cli && pnpm build
node dist/index.js pair <code> http://localhost:3000
node dist/index.js start

# Cloud logs (Terminal 1) should show within ~5s of daemon connecting:
#   [bridge-server] received capabilities from <deviceId>: ["exec", "tmux.send"]
#   [bridge-server] persisted capabilities for <deviceId>

# Verify via API:
curl http://localhost:3000/api/v1/bridge/devices | jq '.[] | {id, deviceName, capabilities}'
# Expect: capabilities: [{ method: "exec", version: "1.0.0", trustTier: "supervised" },
#                         { method: "tmux.send", version: "1.0.0", trustTier: "supervised" }]

# Backward compat: stash the changes, rebuild old daemon, repeat:
git stash
cd packages/bridge-cli && pnpm build
node dist/index.js pair <code> http://localhost:3000
node dist/index.js start
# Cloud logs (no capabilities frame) — but pair succeeds.
# Dispatch an exec job (via existing test harness or work-item flow) — must succeed.
# Verify capabilities API returns null for that device, but getDeviceCapabilities() returns
#   the legacy default in the dispatcher path.
git stash pop
```

## After Completion

1. Update `docs/state.md` — Brief 235 shipped, parent Brief 234 progress: 1/4 sub-briefs complete; Briefs 236-238 unblocked
2. Move `docs/briefs/235-bridge-handler-registry.md` → `docs/briefs/complete/`
3. Run brief retrospective:
   - Did the registry abstraction land cleanly, or did it leak handler-specific concerns?
   - Was the backward-compatibility validation genuinely end-to-end, or did it gloss over?
   - Did Insight-216 (Drizzle prefix collision) bite?
4. Phase update: parent Brief 234 row shows "1/4 sub-briefs complete"; flag Briefs 236-238 as ready for build
