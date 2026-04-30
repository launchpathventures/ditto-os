# Brief 234: Bridge Capability Layer — Phase Design

**Date:** 2026-05-01
**Status:** draft
**Depends on:** Brief 212 (Workspace Local Bridge — complete), ADR-044 (Local Client Capability Surface)
**Unlocks:** Future native-shell phase (Tauri/Electron decision); future capability handlers (sandboxed app launch, OS notifications, file dialogs); reduced LLM cost via Max-billed local Claude CLI

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation (capability infrastructure for thick-client clients) — see `docs/roadmap.md`
- **Capabilities:** Bridge as load-bearing capability surface; cloud-side paired-device awareness; first two high-value handlers (file IO, Claude CLI session) so the substrate is exercised end-to-end

## Context

The Workspace Local Bridge (Brief 212, complete) ships an outbound-dial WebSocket daemon (`packages/bridge-cli/`) with two handlers — `exec` and `tmux.send` — designed for the narrow `runner=local-mac-mini` use case. The handler dispatch is hardcoded if/else in `packages/bridge-cli/src/daemon.ts`. The cloud has no per-device capability tracking; the dispatcher (`src/engine/harness-handlers/bridge-dispatch.ts`) assumes every paired device can do exec and tmux.

Two pressures now reframe the bridge's role:

1. **Anthropic's Max-OAuth ban (Insight-158)** means cloud Ditto cannot use a user's Max subscription. The only path to addressable Max-billed compute is code running on the user's authenticated local machine — which is exactly where the bridge daemon runs.

2. **Multi-client UX** (browser today, native macOS app on the implicit roadmap, mobile later) needs a capability layer the browser can't provide: file IO scoped to the user's machine, native LLM compute via locally-authenticated Claude CLI, file watchers, eventually OS notifications and file dialogs.

ADR-044 formalizes the architectural response: **the bridge is the load-bearing capability surface for thick-client functionality.** Local clients are thin clients to the cloud workspace (no local DB, ever); native capabilities come through the bridge.

This phase delivers the substrate.

## Objective

Evolve the bridge from a narrow shell-executor into a structured capability surface, with cloud-side paired-device awareness and UI capability gating, plus the two highest-value handlers (file IO and Claude CLI session) so the substrate is exercised end-to-end and proves out the architecture before further handler proliferation.

## Non-Goals

- **Native shell (Tauri / Electron / Wails) is not in this phase.** The capability surface lands first; the native installer wrapping it is a separate phase. Browser remains the only "client" UI through this work.
- **Distribution polish (Homebrew, curl-installer, browser-based device-flow pairing) is not in this phase.** Pairing remains the existing 6-char-code flow. Distribution is a parallel phase that can ship independently.
- **No local DB.** ADR-044 is unconditional on this. Any sub-brief that drifts toward local persistence (beyond the existing `~/.ditto/bridge.json` credential file) is rejected at design time.
- **No multi-master sync, no CRDTs, no offline mode.** The cloud is the single source of truth. The native app, when it ships, fails gracefully when offline (UI shows a connection-lost state, capability buttons disabled).
- **No new handlers beyond file IO and Claude CLI session in this phase.** The substrate is generic; future briefs add specific handlers (sandboxed app launch, OS notifications, file dialogs, system metrics) as use cases justify them.
- **No mobile capability surface.** iOS/Android cannot run the bridge daemon as a long-running background process; their capability story is a separate phase.
- **No changes to the existing pairing flow.** Brief 212's 6-char-code → JWT exchange remains; only the post-pairing protocol gains capability advertisement.
- **No changes to cloud-side trust model, credential vault, or harness pipeline.** Every new handler traverses the existing `dispatchBridgeJob` path.

## Inputs

1. `docs/adrs/044-local-client-capability-surface.md` — the architectural decision this phase implements
2. `docs/briefs/complete/212-workspace-local-bridge.md` — the founding bridge brief; constraints and original scope
3. `docs/briefs/complete/215-projects-and-runner-registry.md` — runner registry pattern; how `runner=local-mac-mini` is wired
4. `packages/bridge-cli/src/daemon.ts` — current daemon dispatch (the if/else to refactor)
5. `packages/core/src/bridge/types.ts` + `packages/core/src/bridge/state-machine.ts` — current wire types and state machine
6. `src/engine/harness-handlers/bridge-dispatch.ts` — cloud-side dispatcher; trust-gate integration
7. `src/engine/bridge-server.ts` — WebSocket server, frame handlers, queue drain, sweeper
8. `packages/web/app/api/v1/bridge/devices/route.ts` — devices list endpoint (capability surfacing extension point)
9. `docs/insights/158-ditto-provides-the-llm.md` — the Max-OAuth ban context
10. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — invocation guard requirement
11. `docs/insights/017-security-is-architectural-not-a-role.md` — security as architecture, not afterthought
12. `docs/architecture.md` §Layer 3 (Harness) — current bridge paragraph (line 432) to be extended

## Sub-Briefs

This phase splits into three sub-briefs (post-Reviewer-CRIT-6: Brief 238 deferred — see below) along natural dependency seams. Each is independently testable and shippable in its own build cycle. Brief 235 forms the foundational substrate; Brief 236 adds cloud-side awareness; Brief 237 is the first capability handler family exercising the substrate end-to-end.

```
   ┌──────────────────────────┐
   │ 235: Handler Registry +  │  Foundational substrate
   │ Capability Advertisement │
   └─────────────┬────────────┘
                 │
                 ▼
   ┌──────────────────────────┐
   │ 236: Paired-Device       │  Cloud-side awareness
   │ Awareness + UI Gating    │  + UI capability surface
   └─────────────┬────────────┘
                 │
                 ▼
   ┌───────────────────────┐
   │ 237: File Operations  │  First handler family
   │ Handler               │
   └───────────────────────┘

   ┌─ DEFERRED ──────────────────────┐
   │ 238: Claude CLI Session Handler │  Deferred pending
   │     (Anthropic ToS clarification)│  Anthropic ToS posture
   └─────────────────────────────────┘
```

| # | Brief | Owns | Depends on | Trust tier (per-handler) |
|---|-------|------|------------|--------------------------|
| 235 | [Bridge Handler Registry + Capability Advertisement](235-bridge-handler-registry.md) | Daemon dispatch refactor; protocol extension for `bridge.capabilities` frame; cloud-side capability persistence | Brief 212 | none new (refactor only) |
| 236 | [Paired-Device Awareness + UI Capability Gating](236-paired-device-awareness.md) | Device-online tracker; bridge-events emitter (NOT shared with `harnessEvents` per Reviewer CRIT-4); SSE forwarding; UI primitive for capability-aware buttons; devices view extension at `/bridge/devices` | Brief 235 | none new (UI surface) |
| 237 | [File Operations Handler](237-file-operations-handler.md) | `file.read` / `file.write` / `file.glob` / `file.grep` / `file.watch` daemon handlers + cloud dispatcher cases + scrubber `switch` exhaustiveness fix (Reviewer CRIT-5) + UI buttons | Brief 235; **soft-prefers** Brief 236 (UI gating is convenience, not hard requirement — file-ops dispatch through existing `dispatchBridgeJob` either way) | `supervised` default; `file.read` may relax to `spot_checked` per project |
| ~~238~~ | [~~Claude CLI Session Handler~~](238-claude-cli-session-handler.md) | **DEFERRED** — Anthropic Max ToS interpretation pending (Reviewer CRIT-6); brief preserved for re-entry | — | — |

Build order: 235 must ship first (foundational). 236 ships next (substrate completion). 237 ships after 235 (236 is preferred but not required). Brief 238 stays in `docs/briefs/` as a deferred design until ToS posture is resolved; the phase is complete without it.

## Constraints

This phase honors all constraints inherited from Brief 212 and the Ditto architecture; the additional / amplified constraints are:

- **No local database under any circumstance.** This includes "tiny SQLite cache for offline reads" — rejected. The only persistent local state remains `~/.ditto/bridge.json` (credentials).
- **Every new capability dispatch must traverse `dispatchBridgeJob` (or its successor).** No side-band channels.
- **Every new handler in any sub-brief must declare its trust tier** on the capability advertisement schema. The cloud-side capability tracker stores the trust tier; the dispatcher uses it.
- **Side-effecting functions in any sub-brief must require `stepRunId`** per Insight-180. This includes: any new cloud-side function that initiates a bridge dispatch, any cloud-side function that mutates `bridge_devices.capabilities`, and (where applicable) the `LocalClaudeProvider` LLM call.
- **Engine-product split per ADR-044 §5:** wire-protocol types and the handler-registry interface go in `@ditto/core/bridge/`; specific handler implementations and cloud-side dispatcher cases stay in `packages/bridge-cli/` and `src/engine/`.
- **Capability negotiation is one-shot per connection.** No mid-connection capability changes. Re-advertise on protocol-upgrade close-code 4426 or on explicit re-pair.
- **Backward compatibility:** existing `exec` and `tmux.send` handlers must remain functional after Brief 235's refactor. Old daemons (without capability advertisement) must still pair and dispatch — the cloud must treat absent capabilities as "exec + tmux.send only" and not break.
- **Credential scrubbing extends to all payloads.** The existing `dispatchBridgeJob` scrubber is exec-shaped (looks at `command`, `args`, `env`); each new handler's payload must be reviewed for credential-shaped fields and added to the scrubber's whitelist.
- **Path-traversal prevention is mandatory in any file-touching handler** (Brief 237 specifically): all file paths resolve within an explicit allow-list of working-directory roots advertised by the daemon. No absolute-path escapes; no `..` traversal that exits the allow-listed roots.
- **No daemon-side state persistence beyond credentials** — handlers may hold in-memory state for in-flight work (subprocess handles, watcher subscriptions) but that state is ephemeral. Daemon restart = clean slate; cloud must replay or re-establish.
- **Protocol versioning piggybacks on the existing `protocolVersion` field.** Minor versions add capabilities (cloud tolerates capabilities it doesn't understand); major versions break the wire (existing close-code 4426 path applies).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Capability advertisement on connect | LSP — Language Server Protocol (`microsoft.github.io/language-server-protocol`, `lsp.types.ts` initialize/initialized handshake) | pattern | Decade-proven pattern: server advertises capabilities on `initialize`, clients gate features off advertised set. Same handshake shape applied to bridge handlers. Implementing our own (not consuming an LSP library) — only the conceptual model transfers |
| Handler registry pattern | Express middleware (`expressjs/express` `lib/router/index.js` use/handle), Hono (`honojs/hono` router) | pattern | Standard handler registration; map of method-name → handler. Implementing our own — protocol surface is small (~10 handlers eventually), no need for a full router framework |
| Outbound-dial daemon as capability surface (extension of Brief 212's `actions/runner` adopt) | Original to Ditto | original | No surveyed framework treats a "remote runner daemon" as the substrate for thick-client functionality; the elevation from runner-only to general capability surface is original |
| Native LLM via local CLI subprocess | Continue (`continuedev/continue`) — `core/llm/llms/Ollama.ts` subprocess pattern | pattern | Continue's local-Ollama adapter is the closest precedent for "local subprocess as LLM provider"; we adopt the streaming-stdout-as-tokens pattern but route through bridge dispatch instead of direct subprocess |
| File watcher with subscription model | chokidar (`paulmillr/chokidar`) | depend | Industry-standard Node file watcher; ~3M weekly downloads; the only sane choice for cross-platform watching. Used inside Brief 237's `file.watch` handler |
| Path-traversal prevention | Node.js `path.resolve` + explicit allow-list check | pattern | Standard idiom for safe-path operations; no library needed |
| Real-time UI updates from cloud (paired-device online status) | Existing Ditto `/api/events` SSE pipeline (Brief 122 Server-Sent Events) | adopt | Already in production for chat streaming; extending to bridge events is the natural pattern; no new transport |

## Architecture Impact (by layer)

**Layer 3 (Harness):** This phase extends the bridge paragraph in `docs/architecture.md` line 432. The bridge moves from "a harness extension that lets cloud-hosted Ditto dispatch shell commands" to "the load-bearing capability surface for thick-client functionality." The trust gate, audit, and Insight-180 guard semantics are preserved unchanged; new handlers slot into the existing `dispatchBridgeJob` path.

**Layer 6 (Human):** Brief 236 introduces a UI primitive — capability-aware buttons that gate off paired-device + capability availability. This is a new primitive (additive to the 16 listed in `docs/human-layer.md`); update `docs/human-layer.md` accordingly. The Devices view is extended to show per-device capability lists.

**Cross-cutting (External Integrations):** Local Claude CLI, exposed via Brief 238, is a new integration. It enters via the bridge (not a network channel), so it doesn't fit the existing "external API" pattern in ADR-005 — it's a *local* integration mediated by a paired transport. Document this distinction in `docs/architecture.md` Cross-Cutting: External Integrations section if a "local-via-bridge" sub-pattern emerges.

**Layer 4 (Awareness):** No direct changes. Capability availability is a transient signal (device online/offline + advertisement), not a persistent dependency-graph relation.

**Layer 5 (Learning):** No direct changes. Capability dispatches feed the existing harness_decisions audit trail; correction patterns from local-vs-cloud LLM routing (Brief 238) may surface as future learning signals but are out of scope here.

**Layer 1 (Process):** No direct changes. Process YAML continues to declare runner kinds; new handlers are not new runner kinds (they are capability dispatches inside an existing runner kind, e.g. `runner=local-mac-mini`).

**Layer 2 (Agent):** No direct changes. The `bridge-cli` adapter (`src/adapters/bridge-cli.ts`) extends with new payload kinds but the adapter contract is unchanged.

## What Changes (Work Products) — Phase Summary

This is the phase-level rollup. Each sub-brief specifies its own file-level work products.

| Domain | Files affected | Action summary |
|--------|---------------|----------------|
| Wire protocol | `packages/core/src/bridge/types.ts`, `packages/core/src/bridge/state-machine.ts`, new `packages/core/src/bridge/handler-registry.ts`, new `packages/core/src/bridge/capabilities.ts` | Extend with capability frame + handler registry interface (Brief 235) |
| Daemon dispatch | `packages/bridge-cli/src/daemon.ts`, `packages/bridge-cli/src/handlers/*` | Refactor to handler registry; add new handlers (Briefs 235, 237, 238) |
| Cloud dispatcher | `src/engine/harness-handlers/bridge-dispatch.ts`, `src/engine/bridge-server.ts` | Capability tracker integration; new dispatch payload kinds (Briefs 235, 237, 238) |
| Schema | `drizzle/NNNN_*.sql`, `packages/core/src/db/schema.ts` (`bridgeDevices.capabilities` column) | Add `capabilities JSON` column on `bridge_devices` (Brief 235) |
| Cloud APIs | `packages/web/app/api/v1/bridge/devices/route.ts`, new `/api/v1/bridge/events` SSE route | Capability surfacing in devices list; new SSE for online/offline + capability changes (Brief 236) |
| LLM provider | `src/engine/llm.ts`, new `src/engine/llm-providers/local-claude-via-bridge.ts` | New provider implementation, routing heuristic (Brief 238) |
| UI | `packages/web/components/bridge/CapabilityGatedButton.tsx`, `packages/web/app/devices/page.tsx` | Capability-aware button primitive; devices view extension (Brief 236) |
| Reference docs | `docs/architecture.md`, `docs/dictionary.md`, `docs/human-layer.md`, `docs/landscape.md` | Per-brief updates folded in; phase-level Documenter pass at end |

## User Experience

- **Jobs affected:** Orient (devices view shows paired-device status + capabilities); Delegate (cloud Self can route work via local capabilities transparently); Decide (capability-gated buttons make available actions explicit)
- **Primitives involved:** Status Strip (existing), Devices View (existing, extended), **CapabilityGatedButton (new — adds to the 16 primitives in `docs/human-layer.md`)**, ContentBlocks (existing — capability-call results render via existing block types)
- **Process-owner perspective:** When a paired device is online and supports a capability, the relevant UI buttons are enabled (e.g., "Open in Finder", "Run via local Claude"). When offline or unsupported, those buttons are disabled with a tooltip explaining why ("No paired device with file.open capability"). The user understands at a glance which superpowers are currently available.
- **Interaction states (per primitive):**
  - CapabilityGatedButton — `enabled` (paired device online + capability supported), `disabled-offline` (device known but offline), `disabled-unsupported` (online but no such capability), `loading` (dispatch in flight), `error` (dispatch failed — same patterns as existing dispatch failures)
- **Designer input:** Not formally invoked. The CapabilityGatedButton is a small additive primitive following existing button patterns + tooltip conventions. If post-build review reveals this is a richer surface than expected (e.g., capability discovery deserves a panel of its own), follow-on Designer work to be flagged in the After Completion retrospective.

## Acceptance Criteria (phase-level)

The phase is complete when sub-briefs 235, 236, 237 are shipped, reviewed, and ACs passed (Brief 238 deferred per Reviewer CRIT-6). Phase-level criteria:

1. [ ] Sub-briefs 235, 236, 237 shipped and individually reviewed; Brief 238 explicitly deferred with re-entry conditions documented
2. [ ] `docs/architecture.md` §Layer 3 bridge paragraph updated to describe capability-surface role; cites ADR-044
3. [ ] `docs/human-layer.md` updated with CapabilityGatedButton primitive (17th primitive)
4. [ ] `docs/dictionary.md` updated with: Capability Advertisement, Bridge Handler, Paired Device Capability
5. [ ] `docs/landscape.md` updated with chokidar entry (added by Brief 237)
6. [ ] End-to-end phase smoke test passes: pair a device → daemon advertises capabilities → cloud devices view (`/bridge/devices`) shows `file.read` available → cloud Self dispatches a `file.read` of a project file → result renders in chat → daemon disconnects → button updates to disabled within ≤10s with offline tooltip → daemon reconnects → button re-enables
7. [ ] Legacy daemons (pre-Brief 235, without capability advertisement) still pair and dispatch `exec` / `tmux.send`. Cloud treats them as `capabilities = ["exec", "tmux.send"]` by default — verified by automated test (NOT by `git stash` ritual; Reviewer CRIT-7)
8. [ ] No new SQL tables (this phase adds one column on existing `bridge_devices` — Drizzle idx 0019 reserved by Brief 235); no new long-running processes; no local DB introduced anywhere
9. [ ] `bridgeEvents` emitter is parallel to `harnessEvents` (NOT a typed-union extension); both flow into `/api/events` SSE; no consumer of `harnessEvents` is forced to handle bridge events (Reviewer CRIT-4)
10. [ ] `bridge-dispatch.ts:179` `if/else` is converted to exhaustive `switch (payload.kind)` with TS exhaustiveness check; new file payload kinds get explicit cases (Reviewer CRIT-5)

## Review Process

1. **Per-sub-brief Reviewer pass** — each sub-brief is reviewed individually (separate-context Reviewer agent) before its build session
2. **Phase-end Reviewer pass** — after all four sub-briefs ship, a separate-context Reviewer agent reviews the *integration* against this parent brief and ADR-044 (specifically: did capability advertisement actually plumb through to UI gating? Did the LLM router actually fall back when the device went offline? Was the no-local-DB constraint preserved?)
3. **Manual smoke test** — phase AC #6 walked through end-to-end by the human

## Smoke Test (phase-level)

```bash
# Sequenced after all four sub-briefs ship.
# Assumes a Railway workspace deployment + a paired Mac running ditto-bridge.

# 1. Daemon advertises capabilities on connect
ditto-bridge start &
# Cloud logs (workspace logs):
#   bridge.hello received from <deviceId>
#   bridge.capabilities received: ["exec", "tmux.send", "file.read", "file.write",
#     "file.glob", "file.grep", "file.watch", "claude-cli.session"]

# 2. Devices view shows capabilities
# Visit /devices in the workspace UI
# Expect: device row shows "online" + capability list rendered as chips

# 3. CapabilityGatedButton works
# In a chat with Self: "Open the README of the ditto project in Finder"
# Expect: Self dispatches `file.open`-equivalent (or, in this phase, file.glob → file.read
#         to display contents). Button rendered in chat is enabled.
# Stop the daemon. Refresh.
# Expect: same button now disabled with tooltip "No paired device online with file.read"

# 4. LLM routing
# Restart daemon. In chat: "Summarize this paragraph: <text>"
# With ROUTE_LLM_VIA_BRIDGE=true (Brief 238 hint): cloud routes through bridge.
# Logs:
#   LocalClaudeProvider.createCompletion via bridge dispatch <jobId>
#   Streamed N tokens; result frame received; completion returned
# Without the hint or with daemon offline: cloud falls back to ANTHROPIC_API_KEY path.

# 5. End-to-end fingerprint test
pnpm vitest run src/engine/bridge-capability-e2e.test.ts
# Expect: 1 file, ~5 tests, all pass
```

## After Completion

1. Update `docs/state.md` — phase complete, sub-briefs moved to `docs/briefs/complete/`
2. Update `docs/roadmap.md` — Phase 9 row marked complete or partial; cite this phase brief
3. Run phase retrospective: did the handler-registry abstraction actually pay off (vs. continuing the if/else dispatch)? Did capability advertisement scale cleanly across two handler families (file IO vs. LLM)? Were there capability-gating UX surprises that warrant Designer follow-up?
4. Capture insights — likely candidates:
   - Capability advertisement UX patterns (when to show "no device available" vs. silently degrade)
   - LLM routing heuristics (what's the right default — local-when-available, or explicit per-call hint?)
5. Decide next phase: native shell (Tauri/Electron) is the natural follow-on now that the capability surface is real; alternatively, distribution polish (brew/curl/device-flow) can ship in parallel
6. ADR follow-ups required:
   - **Native shell choice ADR** — when the native-app phase begins
   - **LLM routing-heuristic ADR** if Brief 238's heuristic ossifies into a load-bearing pattern

## Reference Docs Touched (this brief)

This is the *parent* brief. Reference-doc updates are folded into sub-briefs at point of contact (Insight-043). Phase-end Documenter pass verifies completeness.

- ADR-044 (this phase implements it) — created in same session
- `docs/architecture.md` §Layer 3 line 432 (bridge paragraph update — Brief 235 owns)
- `docs/human-layer.md` (CapabilityGatedButton primitive — Brief 236 owns)
- `docs/dictionary.md` (4 new entries — distributed across sub-briefs)
- `docs/landscape.md` (chokidar entry — Brief 237 owns)
