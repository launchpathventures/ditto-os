# Research: Workspace Local Bridge — cloud → laptop dispatch

**Date:** 2026-04-25
**Researcher:** Dev Researcher
**Consumers:** Dev Architect (Brief 212), Dev Builder
**Reference docs consulted:** `docs/research/runtime-deployment-models.md` (topology landscape — established 2026-03-20), `docs/adrs/018-runtime-deployment.md` (Two-Track), `docs/research/centralized-network-service-deployment.md` (hub-and-spoke), `docs/landscape.md`, `docs/architecture.md`, `src/adapters/cli.ts` (current local-only CLI adapter)
**Status:** Active

## Research question

What can Ditto build *from* to give a Railway-hosted workspace authenticated, durable command dispatch and result back-channel into a user's local machine — supporting (a) driving the Claude Code CLI on the laptop, (b) SSH+tmux send-keys to a named session, (c) optional public exposure of a local HTTP service, and (d) a future live-PTY view in the web UI?

## Context

Cloud Ditto runs in a single Railway Node container (Dockerfile, mounted SQLite volume, `/healthz`). The CLI adapter at `src/adapters/cli.ts:162` calls `execFile("claude", ...)` — local-only by construction; archived Insight-062 named this as architectural debt. The user's near-term ask (`runner=local-mac-mini` in their pipeline spec) requires SSH+tmux send-keys; the broader primitive must work for laptops behind NAT that sleep. Brief 200 (workspace git server) handles file projection one-way; it does not handle execution.

Prior research (`runtime-deployment-models.md` §1, §3) already establishes the topology archetypes (Home Assistant + Nabu Casa relay, VS Code Remote Tunnels, Temporal worker, Inngest Connect). This report does not repeat that — it adds the bridge-specific building blocks.

---

## Architect-input recommendation (one path; alternatives below)

This section is researcher input, not a decision — the Architect can override any element. Alternatives are surfaced inline so the trade-offs are visible.

**Topology: outbound-dial daemon (default) + Tailscale Funnel (opt-in escape hatch).** A small `ditto-bridge` daemon installed on the laptop dials *out* to the cloud workspace over a single authenticated WebSocket and stays connected. The cloud never needs the laptop's address, port, or DNS. Same shape as GitHub's Actions Runner Listener (long-poll HTTPS) and Inngest Connect (WebSocket). Pair once via short-lived code; thereafter persistent.

- *Why WebSocket over long-poll (Actions Runner pattern)?* Bidirectional by default (cloud can push without waiting for the next poll cycle), Node-native via `ws`, simpler reconnect-with-backoff loop. Long-poll's only edge is HTTP/1.1 friendliness through corporate proxies — not a Ditto constraint.
- *Why not Cloudflare Tunnel or Tailscale Funnel as default?* Both work, but make the user install vendor infra before Ditto can dispatch — adds a second account, second daemon, second auth model. The bridge daemon is one Ditto-owned binary. Tunnel-as-default is fine for users who already run one; thus the opt-in mode.

**Wire format: JSON-RPC 2.0 over WebSocket.** Method calls cloud→local (`exec`, `pty.open`, `tmux.send`), results local→cloud (`exec.result`, `pty.frame`). Standard, debuggable, library-friendly. Use `ws` (Node) on both sides.

**SSH+tmux as a separate adapter on top of the bridge** (vs. inside the JSON-RPC primitive). Cloud sends `tmux.send {session, keys}` over the bridge → daemon shells `tmux send-keys`. Trade-off considered: putting tmux semantics directly into the wire would couple the primitive to one terminal multiplexer. Keeping `exec` as the primitive and letting an adapter compose `tmux send-keys` keeps the bridge tool-agnostic and lets the same primitive serve future `screen`, `zellij`, or direct subprocess use cases. A direct-SSH variant (Tailscale SSH bypassing the bridge) can ship later for users who already manage SSH.

**Driving Claude Code from the daemon: use `--bare`.** Anthropic now recommends `--bare` for scripted/SDK invocations — skips auto-discovery of hooks, skills, plugins, MCP servers, auto-memory, CLAUDE.md. Bridge `exec` jobs that target the Claude Code CLI should default to `claude --bare -p <prompt> --output-format stream-json` so behavior is reproducible regardless of what's in the user's `~/.claude`. Existing `src/adapters/cli.ts:137-142` does NOT use `--bare` today — that's a separate fix.

**PTY streaming (future): asciicast v2 events** multiplexed on the same WebSocket as `pty.frame` JSON-RPC notifications. Browser playback via `xterm.js`. Defer until the bridge MVP ships.

**Composition map:** Pattern-from `actions/runner` (session model + lock-renewal heartbeat) and Inngest Connect (WebSocket auth). `bore` is *pattern-only* — adopting its 400 LOC of Rust would introduce a sidecar binary into a Node engine, which is not honest "adopt." Depend on `ws` + `node-pty`. Tailscale + cloudflared are user-installed infra, not Ditto-shipped code.

---

## Building blocks (factual, neutral)

### A) Outbound-dial worker pattern — primary reference

**GitHub Actions Runner Listener** (`actions/runner`)
- 6k stars · MIT · C# · v2.334.0 (2026-04-21).
- Pattern only (C# is a non-fit for Ditto). The listener: just-in-time config returns Azure Pipeline URL + private RSA key → JWT signs for OAuth bearer → `POST /sessions` returns `sessionId` → `GET /message?sessionId=X` long-polls **up to 50s** → on `RunnerJobRequest` calls `acquirejob` within 2 min → starts a Worker subprocess → `POST /renewjob` heartbeat every 60s. Source: <https://depot.dev/blog/github-actions-runner-architecture-part-1-the-listener>; Go reference at <https://pkg.go.dev/github.com/actions/scaleset/listener>.
- **Fit:** Gold-standard pattern for "register → poll → execute → heartbeat → renew." The session model and lock-renewal cadence are directly transferable.
- **Don't fit:** C# codebase, Azure-DevOps-flavored API surface; pattern only.

**Buildkite Agent** (`buildkite/agent`)
- 972 stars · MIT · Go · v3.123.1 (2026-04-17). Token-auth, polls Buildkite, handles artifact upload/log streaming. Protocol not in README; canonical Go reference for the same pattern.
- **Fit:** Cleaner, simpler than `actions/runner`; if a Go reference is needed it's the better source.
- **Don't fit:** Go, not TypeScript.

**Inngest Connect** (`inngest/inngest-js`)
- WebSocket persistent connection from worker to central. Auth: `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY`. Bidirectional message flow. Already in landscape.md (Inngest entry).
- **Fit:** TypeScript-native and confirms WebSocket as the right wire for a Node bridge.
- **Don't fit:** Inngest is the orchestrator; we'd be reimplementing the worker side, not adopting their server.

### B) Reverse-tunnel / NAT-traversal — escape-hatch infra

**Tailscale Funnel + Tailscale SSH**
- Funnel: managed encrypted TCP proxy through Tailscale relays; ports limited to 443/8443/10000; HTTPS-only; available on all plans incl. free; relays do not decrypt. SSH: replaces SSH key management with WireGuard device identity; `ssh user@magicdns-name` works without keys; free.
- **Fit:** Zero-config solo path; perfect for a user-toggle "make my workspace reachable" mode. Tailscale SSH satisfies the user's `runner=local-mac-mini` SSH+tmux ask without key management.
- **Don't fit:** Vendor dependency for a primitive that should also work without it. Free tier limited to 100 devices, fine for solo.

**Cloudflare Tunnel (cloudflared)**
- 14k stars · Apache-2.0 · Go. Daemon dials outbound to Cloudflare edge; supports HTTP, WebSocket, arbitrary TCP (incl. SSH). Free tier exists. Auth via Cloudflare account.
- **Fit:** Vendor-neutral alternative to Tailscale; supports raw TCP for SSH passthrough.
- **Don't fit:** Requires Cloudflare account ownership of a domain (legacy constraint, per repo README).

**bore** (`ekzhang/bore`)
- 11.1k stars · MIT · Rust · ~400 LOC. Implicit control port 7835. `Hello` → server returns UUID → client opens new TCP stream with `Accept` UUID → server bridges. **No TLS by default.** Self-hostable.
- **Fit:** Pattern-only. Reviewable wire-protocol reference (~400 LOC) for a TS reimplementation if Ditto ever needs its own tunnel server (e.g., self-hosted Track B). Not honest "adopt" — Rust would introduce a sidecar binary into a Node engine.
- **Don't fit:** No TLS; managed offering would need to wrap. Rust runtime mismatch with Node engine. Not needed for MVP.

**ngrok JavaScript Agent SDK** (`ngrok/ngrok-javascript`)
- 127 stars (small wrapper around the larger ngrok-rust agent) · Apache-2.0 + MIT · embeddable: `ngrok.forward({ addr: 8080, authtoken_from_env: true })` returns a listener URL.
- **Fit:** Lets the bridge daemon expose a local port from inside Node with one call; could replace a "user installs cloudflared/Tailscale" step.
- **Don't fit:** ngrok free tier is rate-limited and rotates URLs; not a substitute for the durable bridge.

### C) Live-PTY streaming — future

**asciicast v2** (asciinema.org file format spec)
- Newline-delimited JSON. Header: `{version: 2, width, height, ...}`. Events: `[time, code, data]` where code ∈ `o` (output, UTF-8 string), `i` (input), `m` (marker), `r` (resize `"COLSxROWS"`). Real-time-friendly per spec.
- **Fit:** Open spec, browser-renderable via `asciinema-player` or `xterm.js` adapter. Use as the wire shape for `pty.frame` JSON-RPC notifications.
- **Don't fit:** None for our use — it's a format, not a runtime.

**ttyd** (`tsl0922/ttyd`)
- 11.5k stars · MIT · C · libuv + WebGL2; WebSocket protocol with xterm.js client. Read-only by default; `--writable` enables input. Basic auth or HTTP header auth.
- **Fit:** Pattern reference for a self-contained "share this tty over the web" service if we ever want stand-alone PTY-share without Ditto.
- **Don't fit:** C codebase; we'd reimplement the wire in TypeScript anyway.

**sshx** (`ekzhang/sshx`) — *framework not a fit*
- 7.4k stars · MIT · Rust · e2e Argon2+AES, gRPC. Cool collaborative-cursor UX. **Not self-hostable** by author's stated policy. Pattern reference only; no adoption path.

---

## Proposed primitive interface (input to Architect)

```ts
// packages/core/src/bridge/types.ts
export interface BridgeJob {
  id: string;
  kind: 'exec' | 'tmux.send' | 'pty.open' | 'pty.write' | 'fs.read' | 'fs.write';
  payload: unknown;     // schema-per-kind, validated server-side
  approvedBy: string;   // userId; trust-tier gated upstream
  expiresAt: number;
}

export interface LocalBridge {
  pair(workspaceId: string): Promise<{ pairingCode: string; expiresAt: Date }>;
  dispatch(deviceId: string, job: BridgeJob): Promise<{ jobId: string }>;
  onResult(jobId: string, cb: (frame: BridgeFrame) => void): () => void;  // returns unsubscribe
  list(workspaceId: string): Promise<RegisteredDevice[]>;
  revoke(deviceId: string): Promise<void>;
}

// Wire (JSON-RPC 2.0 over wss://):
//   server → client: {jsonrpc:"2.0", method:"exec", params:{...}, id:"j_..."}
//   client → server: {jsonrpc:"2.0", method:"exec.result", params:{...}, id:"j_..."}
//   client → server (notify, no id): {jsonrpc:"2.0", method:"pty.frame", params:[t,"o","..."]}
```

The daemon ships as `npx ditto-bridge pair <code>` (Node, MIT, single binary via `pkg`). Pairing exchanges the short-lived code for a long-lived signed-JWT device token persisted in `~/.ditto/bridge.json`. After pair, the daemon dials `wss://<workspace>.ditto.you/_bridge` and stays connected with ping/pong + automatic reconnect-with-backoff.

## Gaps (Original to Ditto)

1. **Trust-tier-gated dispatch.** No surveyed project ties per-job approval to a four-tier trust model (ADR-007). Bridge must integrate with existing trust gate.
2. **Workspace-scoped device pairing.** GitHub Actions runners are repo/org-scoped; we want workspace-scoped (one user, many devices, simple revoke). New shape.
3. **Bridge-aware adapter selection.** When `runner=local-mac-mini` is set on a project, the existing CLI adapter (`src/adapters/cli.ts`) needs a sibling `bridge-cli` adapter that emits an `exec` job instead of spawning locally. This is Ditto-original.
4. **Mobile-first approval surface for bridge jobs.** /review/[token] must show "this command will run on your Mac mini" with the diff/command pre-rendered.
5. **Cloud-side queue persistence when daemon is offline.** If the laptop is closed when an `active` work item dispatches, jobs must persist (SQLite, ADR-001) and re-dispatch on reconnect — not vanish. Surveyed projects assume the worker is always running. Brief 212 must specify TTL, max-queue-depth, and surface "your laptop is offline" status to the user.
6. **Mid-job disconnect resume semantics.** The `actions/runner` model uses `renewjob` every 60s as the heartbeat. Bridge needs the equivalent: lock-renewal cadence, what happens to the local subprocess when the WebSocket drops (kill? continue and report on reconnect?), max staleness before the cloud declares the job orphaned. None of the surveyed projects translates cleanly — Ditto's `exec` jobs are longer-running than typical CI tasks.
7. **`stepRunId` guard on every dispatched job (Insight-180).** The bridge dispatches external side-effects (running commands on the user's machine). Per Insight-180, every such function must require a `stepRunId` invocation guard so the harness pipeline can audit, replay, and gate. The bridge cannot be a side channel that bypasses the harness.
8. **Token rotation + offline revocation.** The pairing flow issues a long-lived device JWT. If the laptop is lost or compromised while offline, revocation must propagate the moment the daemon next dials in (or never, if revoked). Spec needed: rotation cadence, key-pinning vs. JWT signing-key rotation, behavior of in-flight jobs on revocation.

## Reference doc updates

Adding a "Workspace Local Bridge" subsection to `docs/landscape.md` capturing: GitHub Actions Runner Listener (pattern), Buildkite Agent (pattern), Inngest Connect (already present, cross-linked), Tailscale Funnel + SSH (escape-hatch infra), Cloudflare Tunnel (alternative escape-hatch), bore (pattern-only — Rust/Node runtime mismatch precludes adoption), asciicast v2 (PTY wire format, future), ttyd (PTY pattern reference), sshx (framework not a fit).

**`docs/research/runtime-deployment-models.md` is not stale** because its scope is whole-engine *deployment* (where does the engine run? cloud, VPS, laptop?), while this report's scope is *cloud→laptop dispatch* (how does a cloud-hosted engine reach the user's machine?). Both can be true: the engine runs in Railway (per ADR-018 Track A), AND it bridges to the user's laptop for local-only execution. They sit at different granularities and are complementary, not overlapping.
