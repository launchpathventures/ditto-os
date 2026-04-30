# ADR-044: Local Client as Capability Surface, Not Independent Workspace

**Date:** 2026-05-01
**Status:** proposed

## Context

Ditto's workspace currently runs as a single-instance Next.js + SQLite deployment (Railway, per ADR-018 Track A1; same shape on self-hosted). The Workspace Local Bridge (Brief 212) added an outbound-dial WebSocket daemon (`packages/bridge-cli/`) that lets cloud-hosted Ditto run shell commands on a paired user device — initially scoped narrowly to `exec` and `tmux.send` for the `runner=local-mac-mini` use case.

Two adjacent forces are now reshaping how this should evolve:

1. **Anthropic banned third-party use of Max-subscription OAuth tokens (Feb 2026, enforced Apr 2026; Insight-158).** Cloud Ditto cannot use a user's Max subscription for LLM calls — it needs an Anthropic API key. The user's Max subscription is only addressable by code running on their authenticated local device.

2. **Multi-client UX is on the horizon.** Browser is the only client today. A native macOS app (and eventually mobile) is on the implicit roadmap as the "Ditto in your menu bar" surface that gives operators native capability (file IO, native LLM via Max-authenticated Claude CLI, file watchers, OS notifications) the browser cannot.

The naive thick-client design — install a "local Ditto" with its own engine and SQLite, sync state with cloud — would import the well-known multi-master CRDT/sync tax (the failure mode that consumes teams at Linear, Notion, Figma) and contradicts the established single-source-of-truth principle (ADR-018 Track A1). It would also fragment the development surface (two Ditto codebases to keep coherent).

The alternative, sketched in conversation with the creator (2026-05-01): **the local app is a thin client to the cloud workspace.** It hosts a webview pointed at the workspace URL plus the bridge daemon, and exposes native capabilities to cloud Ditto through the bridge protocol. No second engine. No second DB. The bridge is the load-bearing seam.

### Forces

| Force | Pulls toward |
|-------|-------------|
| Anthropic Max-OAuth ban (Insight-158) | Local execution path for Max-backed LLM calls |
| Native capability gap in browser (file IO, OS hooks) | Local capability surface |
| Multi-client coherence (browser + native + future mobile) | Single source of truth in cloud |
| Operational simplicity (one DB, no sync hell) | Cloud as source of truth, clients as thin renderings |
| Existing investment (Brief 212 bridge daemon already built) | Evolve bridge, don't fork a new "local Ditto" |
| Single-tenant workspace identity (ADR-018, ADR-030) | Workspace = the cloud DB; clients are devices, not workspaces |
| Future Tauri-shelled native app | Native shell = webview + bridge daemon (no embedded engine) |
| Engine reusability (`@ditto/core`, ProcessOS consumers) | Capability-surface contract belongs in core |

### Research Inputs

- `docs/research/local-bridge.md` — the original Brief 212 research (cited in `docs/landscape.md` line 632)
- ADR-018 — two-track deployment, single-source-of-truth principle
- ADR-025 — centralized Network Service vs. per-user workspace topology
- Insight-158 — Ditto provides the LLM; CLI subscription is dogfooding only
- Brief 212 (complete) — the founding bridge brief; established daemon as transport-only
- Brief 215 (complete) — runner registry; established `local-mac-mini` as a runner kind

## Decision

### 1. Local clients are thin clients to the cloud workspace

There is **one workspace**, in the cloud. Clients are renderings + capability surfaces, not workspaces in their own right.

| Client | Hosts | Source-of-truth role |
|--------|-------|----------------------|
| **Browser** | Workspace UI (cloud-rendered) | Pure rendering — no native capability |
| **Native app (future)** | Webview pointed at workspace URL + bridge daemon | Rendering + native capability surface |
| **Mobile (future)** | Workspace UI (cloud-rendered) + mobile-specific capability surface | Rendering + limited native capability |
| **CLI (future)** | Capability surface only — no UI | Capability surface only |

A "client" is identified by its paired-device row in `bridge_devices`. A user may have multiple paired devices (multiple Macs, mobile in addition to desktop). Each pair is a transport identity, not a workspace identity.

### 2. No local database under any client

Clients do not persist workspace state. The workspace's DB lives in the cloud (the Railway service, or self-hosted equivalent). All workspace reads/writes go through the cloud's HTTP/WebSocket API using the user's session cookie (browser) or paired-device JWT (daemon-fronted clients).

The only persistent local state is:
- The paired-device credential at `~/.ditto/bridge.json` (mode 0600) — already shipped in Brief 212.
- Future: optional local cache of UI assets (Tauri shell). Not authoritative; invalidated freely.

This is non-negotiable. Multi-master sync is the failure mode this ADR exists to prevent.

### 3. The bridge protocol IS the capability surface

The bridge daemon (Brief 212's `packages/bridge-cli/`) was scoped narrowly to `exec` and `tmux.send` because the founding use case was `runner=local-mac-mini`. The protocol is structurally extensible: JSON-RPC 2.0 over WebSocket, payload methods are pluggable, the daemon dispatches by method name.

This ADR formalizes the bridge's role: **the bridge is the load-bearing capability surface for thick-client functionality.** Future native capabilities (file IO, watchers, native LLM compute via Claude CLI, system notifications, OS-integrated file dialogs, sandboxed app launches) are exposed by adding handlers to the bridge protocol, not by adding code paths inside a local Ditto engine.

The implication is bidirectional:
- **Daemon-side:** the if/else dispatch in `packages/bridge-cli/src/daemon.ts` is replaced with a handler registry. Each new capability is a new handler.
- **Cloud-side:** the dispatcher (`src/engine/harness-handlers/bridge-dispatch.ts`) is extended to know which capabilities each paired device advertises. The cloud surfaces capability availability in the UI (buttons gated by "is a paired device with this capability online?").

The phase design is in Brief 234. The substrate sub-briefs are 235 (Handler Registry + Capability Advertisement) and 236 (Paired-Device Awareness + UI Capability Gating).

### 4. The native app is a webview + the bridge daemon, in one binary

When (not if) Ditto ships a native macOS / Windows / Linux desktop app, its architecture is:

```
┌─────────────────────────────────────────────┐
│  Ditto.app (Tauri or equivalent)            │
│  ┌─────────────────────────┐                │
│  │  Webview                │                │
│  │  → loads workspace URL  │                │
│  │  → renders cloud UI     │                │
│  └─────────────────────────┘                │
│  ┌─────────────────────────┐                │
│  │  Bridge daemon          │                │
│  │  (packages/bridge-cli)  │                │
│  │  → outbound WebSocket   │                │
│  │  → executes capability  │                │
│  │     handlers            │                │
│  └─────────────────────────┘                │
└─────────────────────────────────────────────┘
```

Both pieces ship in one installer. Pairing happens once on first launch (browser device flow opens to the workspace's `/devices/pair` page). After that the daemon stays connected; the webview is the user's primary interface.

There is no embedded Ditto engine. There is no local DB. The Tauri shell is approximately a launcher + native-host wrapper.

This ADR does not commit to Tauri vs alternatives — that's a separate ADR/brief. It commits to the architecture: webview + daemon, no embedded engine.

### 5. Engine vs. product split for the capability layer

| Concern | Lives in | Rationale |
|---------|----------|-----------|
| Bridge wire protocol types (frames, payloads, capability schema) | `@ditto/core/bridge/` | Protocol contract is reusable substrate; ProcessOS could host the same daemon |
| Daemon handler registry interface | `@ditto/core/bridge/` | Handler shape is generic; product-specific handlers register against it |
| Daemon handler implementations | `packages/bridge-cli/src/handlers/` | Specific capabilities (exec, file ops, claude-cli) are bridge-cli concerns |
| Cloud-side capability tracker (per-device capability set) | `packages/core/src/bridge/` (extension of existing module) | Tracker is pure logic; consumers inject the DB |
| Cloud-side dispatcher and trust integration | `src/engine/harness-handlers/bridge-dispatch.ts` | Already product (couples to harness, trust gate, audit) |
| UI capability-gating primitive | `packages/web/components/bridge/` | Pure product (UI-layer rendering) |

The rule, restated from CLAUDE.md: **engine = the harness substrate ProcessOS could reuse; product = Ditto-specific opinions.** Capability-advertisement schema is engine. "Run via local Claude CLI" button is product.

### 6. Capability advertisement is the handshake

The bridge protocol gains a daemon-emitted **capability advertisement** in the connection handshake. On connect, the daemon's first frame (after the existing `bridge.hello` from cloud) is `bridge.capabilities` — a list of method names the daemon supports, with optional metadata (version, feature flags, working-directory roots for file-scoped handlers).

The cloud persists this on the `bridge_devices` row (`capabilities` JSON column) and surfaces it in two places:
- Programmatically, to the dispatcher: "device X supports `file.read`? if not, fall back / refuse / queue".
- To the UI, via the existing devices feed: "Open in Finder" button enabled when a paired device is online AND advertises `file.open`.

Capability negotiation is one-shot per connection. Re-advertise on protocol upgrade (existing close code 4426 path) or on explicit re-pair. Versioning piggybacks on the existing `protocolVersion` field — minor versions can add capabilities; major versions break the wire.

### 7. Authority / governance unchanged

Nothing in this ADR loosens existing trust, audit, or security guarantees. Specifically:

- **Trust gate:** every capability dispatch traverses the trust gate (Brief 212, ADR-007). New handlers must declare their trust profile (the `capability.trustTier` field on the advertisement schema).
- **Insight-180 stepRunId guard:** every capability dispatch requires `stepRunId`. The dispatcher enforces this before any DB write.
- **Credential scrubbing:** the existing pattern-based + vault-based scrubber in `bridge-dispatch.ts` applies to all capability payloads, not just `exec`.
- **Insight-017 security boundary:** capabilities cannot bypass the harness pipeline. There is no "ad-hoc capability call" surface that skips the dispatcher.

## Provenance

| Pattern | Source | What we adapted |
|---------|--------|----------------|
| Thick client + cloud DB, no local persistence | Linear (linear.app) | Native app is a webview + sync layer; data lives in cloud DB. Linear's web client and native app render the same workspace |
| Webview-shelled native client | Cursor (cursor.com), VS Code (code.visualstudio.com), 1Password 8 | Native binary hosts a webview + native helpers; the "app" is mostly the cloud experience with native superpowers |
| Tauri as the native shell | Tauri (tauri.app) | Small (5MB) Rust+webview shell; suitable for "launcher + native-host" pattern; alternative to Electron's 100MB |
| Capability advertisement on connect | LSP (Language Server Protocol — microsoft.github.io/language-server-protocol) | LSP servers advertise capabilities on `initialize`; clients gate UI features off advertised capability set. Same handshake shape, applied to bridge handlers |
| Outbound-dial daemon as capability surface | Original to Ditto (extends Brief 212's `actions/runner` adopt) | The bridge as load-bearing capability layer (vs. narrow runner-only) is original. No surveyed framework treats a "remote runner daemon" as the substrate for thick-client functionality |

## Consequences

**What becomes easier:**
- One source of truth for workspace state — no sync hell, no CRDT debt, no "which version of my notes is right."
- Onboarding multiple clients is mechanical: install the native app (or open a browser), pair to the workspace, done. Same pattern for Mac, Windows, Linux, mobile.
- Adding a new native capability is one new handler — daemon-side implementation + cloud-side dispatcher case + UI button. No engine fork.
- The Anthropic Max gap (Insight-158) becomes addressable: a `claude-cli-session` handler streams Max-billed completions through the bridge.
- The architecture survives Anthropic policy changes: if Max OAuth is ever re-permitted for third-party tools, the bridge protocol can absorb that as a new handler too.
- Capability degradation is graceful: native app offline → UI still works in browser, just with capability-gated buttons disabled.

**What becomes harder:**
- The bridge becomes load-bearing. Outages or protocol incompatibilities affect every thick-client capability, not just the original `runner=local-mac-mini` use case. Versioning discipline (the existing 4426 protocol-upgrade-required mechanism) becomes more important.
- Capability advertisement schema is a contract. Adding fields is easy; renaming or restructuring requires the protocol-upgrade dance.
- Cloud-side dispatcher must handle capability-not-available cases gracefully (fall back, queue, refuse, or downgrade — depends on capability).
- The implicit "future native app" expectation now has architectural weight. The choice of native shell (Tauri vs. Electron vs. Wails vs. webview-only-helper) becomes load-bearing because it's the surface users install.

**New constraints:**
- Every new bridge capability must declare its trust tier (`supervised` / `spot_checked` / `autonomous`-eligible / `critical`-only) on the advertisement schema. Trust enforcement applies uniformly.
- Every new capability must traverse `dispatchBridgeJob` (or its equivalent for new handler classes). No side-band channels that skip the harness.
- Every new external dependency added to support a capability (chokidar for file watching, etc.) requires a `docs/landscape.md` entry per Insight-043 / Insight-068 composition discipline.
- Native app distribution (brew, signed installer, auto-update) is a separate phase but its design must respect the "no embedded engine" rule. A "Ditto Local" project that smuggles in a local DB violates this ADR and must be rejected at design time.

**Follow-up decisions needed:**
- **Native shell choice:** Tauri vs. Electron vs. Wails vs. webview-only-helper. Separate ADR when native app phase begins; do not force a choice now.
- **Mobile capability surface:** iOS/Android can't run the bridge daemon as a long-running background process. What capability subset do they expose? Separate ADR when mobile phase begins.
- **Capability-call routing for LLM:** when a `claude-cli-session` handler exists AND the cloud has its own `ANTHROPIC_API_KEY`, what's the routing heuristic? Configurable per-call hint? Per-process? Per-trust-tier? Resolved in Brief 238.
- **Cross-device capability ranking:** if multiple paired devices advertise `file.read`, which is preferred? Last-active? Explicit "primary device" flag? Separate decision; out of scope for this ADR.
- **Capability revocation:** can a user disable a specific capability per-device (e.g. "this Mac shouldn't expose claude-cli")? Out of scope; future device-management UI work.

**What this ADR explicitly does NOT decide:**
- Whether the native app exists or when. It commits to its architecture *if* it exists.
- Whether/when offline-mode (some local read cache) is added. The architecture admits a non-authoritative cache; this ADR doesn't introduce one.
- The full handler taxonomy. New handlers will be added incrementally; this ADR establishes the registration pattern, not the catalog.

**Updates required to existing reference docs:**
- `docs/architecture.md` §Layer 3 (Workspace Local Bridge paragraph, line 432) — extend to note bridge's evolved role as capability surface; cite this ADR.
- `docs/landscape.md` — add entries for any new dependencies introduced in implementing sub-briefs (chokidar for file watching in Brief 237, etc.); the bridge runtime stack (`ws`, `jsonrpc-lite`) is already evaluated.
- `docs/dictionary.md` — add entries for "Capability Advertisement", "Bridge Handler", "Paired Device Capability".
- ADR-018 — does not change; this ADR sits inside Track A1's single-source-of-truth principle.
- ADR-025 — does not change; Network Service vs. workspace topology is orthogonal.
- ADR-030 — does not change; deployment mode flag still controls public vs. workspace surfaces.
