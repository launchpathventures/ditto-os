# Brief 236: Paired-Device Awareness + UI Capability Gating

**Date:** 2026-05-01
**Status:** draft
**Depends on:** Brief 235 (Handler Registry + Capability Advertisement)
**Unlocks:** Briefs 237 (File Operations Handler) and 238 (Claude CLI Session Handler) — both rely on the device-online + capability-aware UI primitive this brief introduces

## Goal

- **Roadmap phase:** Phase 9 — Bridge Capability Layer (sub-brief #2 of Brief 234)
- **Capabilities:** Cloud-side device-online tracker; SSE event stream for online/offline + capability changes; `CapabilityGatedButton` UI primitive (17th primitive); devices view extension showing capability chips per device

## Context

Brief 235 lands the substrate — daemon advertises capabilities on connect; cloud persists them and exposes `getDeviceCapabilities(deviceId)` to the dispatcher. But the cloud has no real-time awareness of *which devices are currently online* (the `bridge_devices.lastDialAt` is stale-by-design — updated on dial only, not invalidated on disconnect), and no UI primitive for "show this button only when a paired device is online and supports this capability".

Brief 237 and 238 both need to render UI elements that:
1. Are enabled when *some* paired device is online AND advertises a specific capability (e.g., `file.read` for "Open project file" buttons; `claude-cli.session` for "Use local Claude" toggles)
2. Are disabled with an explanatory tooltip when no such device is available
3. React in real-time when a device connects, disconnects, or updates its capability set

Without this brief, every consumer of bridge capabilities would re-implement device-online tracking + capability-gating UI from scratch — guaranteed inconsistent UX and duplicated bugs.

## Objective

Establish a small, focused cloud-side substrate for real-time paired-device awareness: an in-memory online registry maintained by the WebSocket server, an SSE event stream that broadcasts changes, and a single UI primitive (`CapabilityGatedButton`) that consuming components reuse. Plus a devices-view extension showing per-device capability chips so operators can see what their paired devices can do.

## Non-Goals

- **No new daemon-side handlers.** All capability-bearing handlers come from later briefs (237, 238). This brief stops at "the substrate exists; consuming components can hook in".
- **No actual capability dispatches.** No buttons trigger anything in this brief — `CapabilityGatedButton` accepts an `onClick` from its consumer; the consumer brief wires it to `dispatchBridgeJob` (per Brief 237 / 238).
- **No cross-device selection logic.** When >1 device is online with the same capability, this brief uses the existing dispatcher's selection rule (most-recently-paired or explicit-deviceId). No new "primary device" UX here.
- **No capability-set diffing or version gates in UI.** The button enables on capability presence, not on version match. If a future brief needs version gating, it extends the primitive then.
- **No capability discovery surface.** No "what can my devices do?" guided tour. The Devices view extension is informational, not interactive.
- **No mobile UX considerations.** The CapabilityGatedButton is initially desktop-shaped; mobile capability awareness is a future phase.
- **No persistence of online status.** Online status lives only in memory on the cloud. Restart wipes it; devices re-establish on reconnect. This is correct (online-ness is a transient signal, not durable state).
- **No SSE backpressure or replay-on-reconnect for the event stream.** The existing `/api/events` SSE infrastructure handles drops at the consumer level; bridge events follow the same model. If the client misses an event, it re-fetches device state on reconnect.
- **No admin / operator dashboard for paired-device fleet health.** Single-user operator view in Devices is sufficient for this phase.

## Inputs

1. `docs/briefs/235-bridge-handler-registry.md` — substrate this brief consumes
2. `docs/adrs/044-local-client-capability-surface.md` — §6 capability advertisement, §3 capability surface
3. `docs/briefs/234-bridge-capability-layer-phase.md` — parent phase brief
4. `src/engine/bridge-server.ts` lines 113-165, 303-360 — current online-tracking surface (the `connectedDevices: Map<deviceId, WebSocket>` is the seed of the new tracker)
5. `packages/web/app/api/v1/bridge/devices/route.ts` — devices listing route
6. `packages/web/app/devices/` — current devices view (if exists; verify before brief execution)
7. `packages/web/app/api/events/route.ts` (existing SSE pipeline) — pattern to extend for bridge events; **CRIT-fix note from review:** this route has NO workspace scoping today (single-user broadcast); see updated §Constraints
8. `packages/web/app/bridge/devices/page.tsx` — current devices view (262-line client component, polls every 10s); this brief reconciles SSE-driven updates with existing polling
9. `packages/web/components/` — existing button + tooltip primitives to base `CapabilityGatedButton` on
10. `docs/human-layer.md` — current 16 primitives; this brief adds the 17th
11. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — guard requirement (no new side-effecting functions in this brief; verify)

## Constraints

- **No new external dependencies.** SSE infrastructure already exists; UI primitives extend existing button + tooltip components.
- **In-memory online tracker is single-source.** The `bridge-server.ts` `connectedDevices` Map is the source of truth for online status; this brief promotes it to a public API (`isDeviceOnline(deviceId)`, `listOnlineDevices(workspaceId)`) but doesn't introduce a parallel store.
- **Bridge events use a NEW parallel emitter (`bridgeEvents`), not the existing typed `harnessEvents` union.** Reviewer flagged that the existing `harnessEvents` is a typed discriminated union of process-lifecycle events; adding bridge-device-status to it would force every exhaustive switch to handle the new variants and conflates different conceptual layers. New file: `packages/core/src/bridge/events.ts` with its own `BridgeEvent` discriminated union and `bridgeEvents` emitter.
- **SSE workspace-scoping is single-tenant for this brief.** Reviewer flagged that the existing `/api/events/route.ts` has no workspace scoping or auth filter (single-user broadcast). This brief operates in single-workspace mode (matches today's reality with `WORKSPACE_OWNER_EMAIL`). When the workspace expands to multi-tenant, a precursor sub-brief MUST add workspace-scoped event routing before this brief's bridge events can scope correctly. For this brief: assume single workspace; document the limitation in `PROTOCOL.md`.
- **The existing `/api/events` route is extended with a parallel listener for `bridgeEvents`** (separate from `harnessEvents`); both streams flow into the single SSE response. No type-union extension needed for `harnessEvents`.
- **`CapabilityGatedButton` is a pure-UI primitive** — no business logic. It accepts: `capability` (the method name string), `onClick`, `children`, `unavailableTooltip` (optional override). It internally subscribes to the bridge events stream and queries an existing capability-availability hook.
- **The capability-availability hook (`useCapabilityAvailability(method)`)** is the single source for "is `method` available right now?" — used by the button and by any other UI consumer (e.g., dropdown menus that include capability-gated items).
- **No flicker on initial render.** The hook returns `loading | available | unavailable` (not boolean). UI must handle `loading` state to avoid flash-of-disabled-state.
- **Engine-product split:** the online-tracker primitive (`isDeviceOnline`, `listOnlineDevices`, `subscribeToBridgeEvents`) lives in `packages/core/src/bridge/online-tracker.ts` (ProcessOS could host the same surface). The SSE event integration and UI primitives are pure product (`src/engine/`, `packages/web/`).
- **No side-effecting functions added in this brief.** All cloud-side changes are pure substrate (in-memory tracker, SSE wire-through, GET endpoint extension). Insight-180 doesn't apply.
- **Devices view extension is read-only.** No "revoke from chip" or "test capability" interactions in this brief.
- **Tooltip messaging discipline:** disabled-button tooltips must be specific. "No paired device with file.read capability online" is good. "Bridge unavailable" is bad. The tooltip should help the operator understand whether the issue is "no device paired" vs. "device offline" vs. "device online but capability missing".
- **Real-time but not push-rate-sensitive.** SSE event throttling: max 1 `device.status` event per device per 500ms. Online-flap (rapid connect/disconnect) gets coalesced.
- **Per-workspace event scoping.** A user only receives events for devices in their workspace. The SSE event stream already enforces auth; bridge events use the same path.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| In-memory online tracker promoted to public API | Original to Ditto (extension of Brief 212's `connectedDevices` Map) | original | The online-tracker shape is small enough to not warrant adoption from a framework |
| SSE event stream for real-time UI updates | Existing Ditto `/api/events` SSE pipeline (Brief 122 Server-Sent Events; in production for chat streaming) | adopt | Already in production; extending to bridge events is the natural pattern; no new transport |
| `CapabilityGatedButton` primitive shape | LSP capability-gated commands in VS Code (`vscode/src/vs/workbench/contrib/commands` capability-conditional menu items) | pattern | Direct conceptual analog: "show this menu item only when the LSP server advertises this capability". Same model in our UI |
| Capability-availability React hook | `useState` + `useEffect` + EventSource (standard React patterns) | pattern | No external state library needed; standard React idiom |
| Device-online status with grace window | Tailscale UI device-status (`tailscale.com` admin console) | pattern | Tailscale's "online / online <30s ago / offline" gradient is a good UX precedent; we adopt the binary on/off but keep `lastSeenAt` visible |
| Tooltip messaging conventions | Stripe Dashboard (disabled-action tooltips that explain *why*) | pattern | Stripe's disabled-button tooltips are the gold standard for "explain the gate"; pattern transfers |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/bridge/online-tracker.ts` | **Create**: `OnlineTracker` class with `markOnline(deviceId, workspaceId)`, `markOffline(deviceId)`, `isOnline(deviceId)`, `listOnline(workspaceId)`; in-memory only; emits events via injected event bus interface |
| `packages/core/src/bridge/online-tracker.test.ts` | **Create**: unit tests covering online/offline transitions, list filtering by workspace, event emission |
| `packages/core/src/bridge/index.ts` | **Modify**: barrel-export `OnlineTracker` |
| `src/engine/bridge-server.ts` | **Modify**: instantiate `OnlineTracker` (singleton); wire `connectedDevices.set(...)` and `connectedDevices.delete(...)` calls to also call `tracker.markOnline()` / `tracker.markOffline()`; expose `getBridgeOnlineTracker()` getter for cloud consumers |
| `src/engine/bridge-server.test.ts` | **Modify**: assert tracker is updated on connection lifecycle |
| `packages/core/src/bridge/events.ts` | **Create**: `BridgeEvent` discriminated union (`bridge.device.status` + `bridge.device.capabilities-updated`); `bridgeEvents` EventEmitter exported as singleton; pure logic, no IO |
| `packages/core/src/bridge/events.test.ts` | **Create**: unit tests for emitter; ordering, listener count, event shape |
| `packages/web/app/api/events/route.ts` | **Modify**: add a parallel `bridgeEvents.on(...)` subscription that forwards bridge events into the existing SSE response stream alongside `harnessEvents`; no workspace filter (single-tenant per Constraints) |
| `packages/web/lib/bridge/use-capability-availability.ts` | **Create**: React hook `useCapabilityAvailability(method: string): { state: "loading" \| "available" \| "unavailable"; reason?: string; deviceCount?: number }`; subscribes to bridge events via `EventSource`; initial state from `GET /api/v1/bridge/devices` |
| `packages/web/lib/bridge/use-capability-availability.test.tsx` | **Create**: React Testing Library tests for the hook (loading → available → unavailable transitions on event simulation) |
| `packages/web/components/bridge/CapabilityGatedButton.tsx` | **Create**: pure-UI primitive composing `<Button>` + `<Tooltip>` + `useCapabilityAvailability`; props: `capability: string`, `onClick`, `children`, `unavailableTooltip?`, `loadingTooltip?` |
| `packages/web/components/bridge/CapabilityGatedButton.test.tsx` | **Create**: tests covering all four states (loading, available + click fires, unavailable + tooltip, error fallback) |
| `packages/web/app/bridge/devices/page.tsx` (or equivalent existing devices view) | **Modify**: each device row renders capability chips (existing chip component); online/offline status badge with `lastSeenAt` timestamp; tooltip on each chip explains the trust tier |
| `packages/web/app/bridge/devices/__tests__/page.test.tsx` | **Modify** (or **Create** if absent): assert capability chips render; assert online badge updates on simulated event |
| `packages/web/app/api/v1/bridge/devices/route.ts` | **Modify**: GET response augments each device row with `online: boolean` (from `OnlineTracker.isOnline`) and `lastSeenAt: Date | null` (from `bridge_devices.lastDialAt`) |
| `docs/human-layer.md` | **Modify**: add `CapabilityGatedButton` as the 17th primitive; document its four states and tooltip discipline |
| `docs/dictionary.md` | **Modify**: add entries for "Online Tracker", "Capability-Gated Button", "Paired Device Capability" (the runtime concept, complementing the schema concept added in Brief 235) |
| `packages/core/src/bridge/PROTOCOL.md` | **Modify**: add "Online Tracking & SSE Events" section describing the cloud-side event shape and consumer hook |

## User Experience

- **Jobs affected:** **Orient** (Devices view newly informative — at-a-glance capability inventory per device); **Decide** (UI buttons throughout the workspace gate cleanly off paired-device availability — operators understand at-a-glance which superpowers are accessible right now)
- **Primitives involved:** `CapabilityGatedButton` (NEW — adds 17th primitive to `docs/human-layer.md`); Tooltip (existing); Devices view (existing, extended); SSE event stream (existing, extended)
- **Process-owner perspective:**
  - When a paired Mac is online and supports `file.read`, the "Open project file" button in chat is enabled and clickable. Tooltip on hover (optional): "via [Mac mini] · file.read".
  - When the Mac goes offline (lid closed, network drop, daemon stopped), the same button updates within ~1s to disabled, tooltip: "No paired device with file.read currently online (1 device known, currently offline)".
  - When no Mac has been paired at all, button shows tooltip: "Pair a device to enable file actions" with optional link to Devices view.
  - Devices view shows paired devices as rows; each row has a status badge (green online dot / gray offline dot + lastSeen timestamp) and a row of capability chips (file.read, file.write, file.glob, claude-cli.session, exec, tmux.send, etc.). Hovering a chip shows the trust tier.
- **Interaction states (CapabilityGatedButton primitive):**
  - `loading` (initial render, capability state not yet resolved): button disabled, neutral tooltip "Checking device availability…", does not flash
  - `available` (>=1 paired device online with capability): button enabled, optional tooltip "via [device-name]" (or just default tooltip if consumer overrides)
  - `unavailable-no-device-paired`: button disabled, tooltip "Pair a device to enable [verb]"
  - `unavailable-offline`: button disabled, tooltip "[N device(s) known, currently offline]"
  - `unavailable-capability-missing`: button disabled, tooltip "[device-name] is online but doesn't support [verb]"
  - `error` (SSE connection failed): button disabled, tooltip "Device status unavailable — check workspace connection"
- **Designer input:** Not formally invoked. The CapabilityGatedButton is a small additive primitive following existing button + tooltip patterns. If post-build review reveals capability discovery needs a richer surface (e.g., a "device capabilities" panel in the workspace shell), Designer follow-up flagged in retrospective.

## Acceptance Criteria

1. [ ] `OnlineTracker` class exists in `packages/core/src/bridge/online-tracker.ts` with `markOnline`, `markOffline`, `isOnline`, `listOnline(workspaceId)` methods; pure logic, no IO
2. [ ] `bridge-server.ts` instantiates a singleton `OnlineTracker` and updates it on every WebSocket connection lifecycle event (connect → markOnline with workspaceId from JWT payload; close → markOffline). Verified by integration test
3. [ ] Online-tracker emits events via the new `bridgeEvents` emitter (NOT the typed `harnessEvents` union) on every state transition: `bridge.device.status` with `{ deviceId, workspaceId, online, at }`. Trailing-edge coalesced to max 1 event per device per 500ms quiescent (rapid flap → final-state event after debounce)
4. [ ] When the daemon's `bridge.capabilities` frame is received (per Brief 235), `bridge.device.capabilities-updated` event is emitted via `bridgeEvents`
5. [ ] `/api/events` SSE stream forwards both `harnessEvents` AND `bridgeEvents` into the same response stream; single-tenant deployment (no workspace filter for now — limitation documented in PROTOCOL.md)
6. [ ] `useCapabilityAvailability(method)` React hook exists in `packages/web/lib/bridge/use-capability-availability.ts`; on mount, fetches `GET /api/v1/bridge/devices` and computes initial state; subscribes to the SSE stream for ongoing updates; returns `{ state, reason, deviceCount }`
7. [ ] `CapabilityGatedButton` component renders all four primary states (loading, available, unavailable, error) with appropriate tooltip messaging per "Interaction states" above
8. [ ] `GET /api/v1/bridge/devices` response includes `online: boolean` and `lastSeenAt: Date | null` on each device row, in addition to the `capabilities` field added in Brief 235
9. [ ] Devices view (`/devices` or equivalent) renders each device with: name, online/offline status badge, lastSeenAt (if offline), capability chips, tooltip-on-chip showing trust tier. New tests assert this rendering
10. [ ] When a paired daemon disconnects (kill -9 or graceful close), within ≤2s: cloud SSE emits `bridge.device.status: { online: false }`, `useCapabilityAvailability` hook on subscribed UIs returns `unavailable`, `CapabilityGatedButton` renders disabled with the offline tooltip
11. [ ] When a daemon reconnects: within ≤2s of capability frame ingestion, hook returns `available`, button renders enabled
12. [ ] `docs/human-layer.md` has CapabilityGatedButton documented as the 17th primitive, with its four interaction states; the count "16 primitives" in any reference is updated to 17
13. [ ] `docs/dictionary.md` has entries for Online Tracker, Capability-Gated Button, Paired Device Capability
14. [ ] `pnpm run type-check` passes; `pnpm test` passes (existing + new); no new TS errors
15. [ ] No new side-effecting functions added (verify against Insight-180 — the substrate is reads + transient in-memory writes)

## Review Process

1. Spawn review agent with: this brief, Brief 235 (substrate dependency), ADR-044, parent Brief 234, `docs/architecture.md`, `docs/human-layer.md`, `docs/review-checklist.md`
2. Review agent specifically checks:
   - The four `CapabilityGatedButton` states have distinct tooltip messages — no generic "unavailable" fallback that hides root cause
   - SSE event coalescing prevents flap-storm without losing legitimate state changes
   - The hook handles SSE drops gracefully (consumer doesn't get stuck in loading; falls back to last-known + periodic re-fetch or explicit "error" state)
   - Engine-product split per ADR-044 §5 (online-tracker in core; SSE wire-through and UI primitives in product)
   - `docs/human-layer.md` primitive count is updated everywhere (architecture.md, dictionary, etc.)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type-check + unit tests
pnpm run type-check
pnpm vitest run packages/core/src/bridge/online-tracker.test.ts
pnpm vitest run packages/web/lib/bridge/use-capability-availability.test.tsx
pnpm vitest run packages/web/components/bridge/CapabilityGatedButton.test.tsx
pnpm vitest run packages/web/app/bridge/devices/__tests__/page.test.tsx
pnpm vitest run src/engine/bridge-server.test.ts

# Integration smoke
# Terminal 1:
pnpm dev

# Terminal 2 (build + start daemon — assumes Brief 235 is shipped):
cd packages/bridge-cli && pnpm build
node dist/index.js pair <code> http://localhost:3000
node dist/index.js start

# Browser: visit http://localhost:3000/devices
# Expect: device row showing online badge, capability chips for "exec", "tmux.send"

# Open another browser tab; render a test page with a CapabilityGatedButton for "exec":
# (use a scratch test route or dev tools)
# Expect: button enabled

# Terminal 2: kill the daemon (Ctrl+C)
# Within ≤2s, both browser tabs update:
#   /devices → online badge turns to offline, lastSeenAt timestamp appears
#   test page → button becomes disabled, tooltip: "1 device known, currently offline"

# Restart daemon
# Within ≤2s, both tabs update back to online + enabled

# E2E playwright (if Brief 235 has e2e harness; otherwise smoke):
pnpm run test:e2e -- bridge-online-status
```

## After Completion

1. Update `docs/state.md` — Brief 236 shipped, parent Brief 234 progress: 2/4 sub-briefs complete; Briefs 237 + 238 unblocked
2. Move `docs/briefs/236-paired-device-awareness.md` → `docs/briefs/complete/`
3. Run brief retrospective:
   - Did the SSE coalescing prevent flap-storm cleanly?
   - Did the hook's `loading | available | unavailable` tri-state eliminate flash-of-disabled-state, or did consumers need additional guarding?
   - Was the tooltip messaging matrix sufficient, or did consumers need to override frequently?
4. Phase update: parent Brief 234 row shows "2/4 sub-briefs complete"; Briefs 237 + 238 ready for build (in either order, parallel-safe)
5. Capture insight if it emerges: "Capability-gating UX patterns" — when capability advertisement is one-shot per connection, what's the right user expectation for "I just installed a new daemon version with new capabilities"? (Answer probably: re-pair instructions, surfaced in Devices view.)
