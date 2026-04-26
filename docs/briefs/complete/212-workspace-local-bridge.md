# Brief 212: Workspace Local Bridge — Cloud → Laptop Dispatch

**Date:** 2026-04-25
**Status:** complete (2026-04-26 — 14 commits on `launchpathventures/local-bridge-question`; 54 bridge unit tests + 3 spike tests + 2 Playwright e2e tests passing; all 18 ACs covered, AC #16 with documented deviation flagged for Architect)
**Depends on:** none (functionally standalone; cross-references Brief 200 for the `ditto.you` URL topology but does not block on it)
**Unlocks:** `runner=local-mac-mini` for the user's agent-crm pipeline + every future Ditto capability that requires execution on the user's hardware (local Claude Code CLI, locally-installed dev tools, machine-specific scripts, on-prem data access). Companion to Brief 200 (file projection one-way) by adding execution dispatch (two-way).

## Goal

- **Roadmap phase:** Phase 9+ (substrate — runner distribution). Sits alongside Brief 200's git server as the second piece of cloud-hosted-Ditto-reaches-user-machine infrastructure.
- **Capabilities delivered:**
  - A `ditto-bridge` daemon installed on the user's laptop / Mac mini that dials *out* to a cloud-hosted Ditto workspace and stays connected — no port-forwarding, no Tailscale, no DNS configuration on the user's side. **Local-dev invocation:** `pnpm --filter ditto-bridge exec ditto-bridge <subcommand>` (the package is in the workspace; published-to-npm `npx ditto-bridge` is a follow-on, see §Non-Goals). **Production invocation when published:** `npx ditto-bridge <subcommand>`.
  - A pairing flow that turns a short-lived code into a durable per-device JWT (revocable, audit-logged).
  - JSON-RPC 2.0 over WebSocket as the wire format; method `exec` (run a command), `tmux.send` (compose `tmux send-keys`), with line-buffered streaming results.
  - Cloud-side queue persistence: jobs survive daemon-offline; replay in order on reconnect.
  - Mid-job disconnect resume: subprocess continues running on the laptop while the WebSocket reconnects; output buffered and replayed.
  - A new built-in tool `bridge.dispatch` callable from process YAML (with Insight-180 `stepRunId` guard).
  - A sibling adapter `src/adapters/bridge-cli.ts` so any process declaring `runner=local-mac-mini` routes its CLI step over the bridge instead of spawning locally.
  - Mobile-friendly approval surface: `/review/[token]` renders "this command will run on your `<deviceName>`" with the literal command preview.

## Context

Cloud Ditto runs in a single Railway Node container with SQLite on a mounted volume (Dockerfile, `docker-entrypoint.sh`, ADR-018 §Track-A). The CLI adapter at `src/adapters/cli.ts:162` calls `execFileAsync("claude", args, ...)` — local-only by construction; archived Insight-062 named this as architectural debt: "cli-agent is fundamentally local-only — it can't exist in a managed cloud deployment."

The user's broader pipeline spec (`.context/attachments/pasted_text_2026-04-25_20-19-53.txt:11-13, 75-78`) introduces a `runner` field on the projects table with values `claude-code-routine | local-mac-mini | github-action`. The `local-mac-mini` runner explicitly requires "SSH to the configured host and tmux send-keys a claude command into a named session" — a pattern that, today, the cloud Ditto cannot support because it has no path to the user's machine.

Three near-term shapes need this primitive:
1. **Driving local Claude Code** — the user wants to run heavy Claude Code sessions on their Mac mini (subscription billing, faster local files, tmux-managed session) but trigger from the cloud-hosted Ditto.
2. **Local-only tooling** — running scripts that require a logged-in browser session, a USB device, on-prem databases, or other resources that don't exist in a Railway container.
3. **Verification before deploy** — quick `pnpm test` or `pnpm build` on the user's laptop before approving a PR for merge.

Researcher pass at `docs/research/local-bridge.md` (2026-04-25) surveyed 9 building blocks across 3 categories; chose outbound-dial daemon over WebSocket as the topology because it works behind any NAT, requires no vendor account beyond Ditto, and avoids forcing the user to install Tailscale/Cloudflare-Tunnel as a prerequisite. The pattern is GitHub Actions Runner Listener (long-poll) + Inngest Connect (WebSocket auth) — neither adopted as code, both as patterns.

Reviewer pass on the research surfaced four resilience gaps that this brief promotes to first-class ACs: cloud-side queue persistence when the daemon is offline, mid-job disconnect resume semantics, every dispatched job traversing the harness pipeline with a `stepRunId` (Insight-180), and token rotation + offline revocation.

## Objective

Ship the smallest authenticated, durable, audit-logged primitive that lets a cloud-hosted Ditto workspace dispatch shell commands to a paired laptop daemon and stream results back — with first-class trust integration, queue persistence across daemon downtime, and mid-job disconnect resume — so that the user's `runner=local-mac-mini` pipeline works from a phone.

## Non-Goals

- **No live PTY streaming in the web UI.** asciicast v2 is reserved as the future wire format for `pty.frame` notifications, but this brief ships only line-buffered stdout/stderr. Live xterm.js view in `/review` is a follow-on brief.
- **No Tailscale / Cloudflare Tunnel integration.** Both work as user-installed escape-hatches today (the user can run any local service and tunnel it themselves), but Ditto does not depend on them. A future brief may add a `bridge.tunnel.expose` method on top of this primitive.
- **No mid-job failover, no automatic policy-based failover.** A workspace can pair multiple devices (e.g., laptop + Mac mini), and the dispatch payload supports an opt-in `fallbackDeviceIds` ordered list — the cloud-side dispatcher routes to the first online device at dispatch time (Constraints §). What is OUT of scope: (a) mid-job failover (if the primary fails subprocess execution mid-flight, the job does NOT retry on a fallback — too risky given env/file/tool-install differences); (b) automatic policy-based routing (round-robin, least-loaded, etc.) — caller specifies primary + fallback explicitly. These are later additions if they prove needed.
- **No direct-SSH variant bypassing the bridge.** Tailscale-SSH+tmux as a standalone adapter is a separate later brief if the user wants it. The bridge's `tmux.send` method covers the same end-to-end need without a second auth model.
- **No file transfer beyond `exec` payloads.** Brief 200's git server handles bulk file movement (≤MB). The bridge's `exec` method captures stdout/stderr up to a configurable cap (default 4 MB); larger output truncates with a marker. Streaming arbitrary blobs over the bridge is out of scope.
- **No daemon-side LLM calls or self-hosted models.** The daemon is a transport, not an agent. All LLM decisions happen in the cloud workspace.
- **No bridge.dispatch from non-cloud workspaces.** Track B (self-hosted) workspaces don't need a bridge — the engine already runs where the files are. The bridge is a Track A concern.
- **No authentication via OAuth / SSO at MVP.** Pairing-code → JWT is the only flow. SSO integration deferred.
- **No bridging across users.** The bridge is workspace-scoped (one user, n devices). Multi-user team-scope dispatch is a separate brief once Ditto multi-user surfaces exist.
- **No npm publish of `ditto-bridge` at MVP.** This brief ships the `packages/bridge-cli/` workspace package; the daemon is invoked locally via `pnpm --filter ditto-bridge exec ditto-bridge <subcommand>` (or via a `pnpm link --global` for convenience). Publishing to the public npm registry so end-users get `npx ditto-bridge` is a follow-on operations brief — it requires a release/versioning policy decision (semver of the wire protocol vs the package), a publish step in CI, and ownership of the npm package name. Documented in `packages/bridge-cli/README.md`.

## Inputs

1. `docs/research/local-bridge.md` — research report; the recommendation in §"one path; alternatives below" is binding for this brief unless a contrary architectural finding emerges
2. `docs/landscape.md` §"Workspace Local Bridge — cloud → laptop dispatch (2026-04-25)" — candidate building-block evaluations
3. `docs/adrs/018-runtime-deployment.md` — Two-Track deployment context; this brief is a Track-A capability
4. `docs/adrs/007-trust-earning.md` — four-tier trust model; the bridge `dispatch` writes a `harness_decisions` row (`trust_tier`, `trust_action`)
5. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every bridge dispatch is a side-effecting function and MUST require a `stepRunId` parameter
6. `docs/insights/062-ditto-owns-execution-layer.md` (archived) — context on why the CLI adapter is local-only and the architectural direction
7. `docs/briefs/200-workspace-git-server.md` — adjacent already-ready brief; URL topology (`https://<workspace>.ditto.you/...`) and credential-storage shape (bcrypt, separate from session cookies) are reused patterns
8. `src/adapters/cli.ts:114-220` — current local CLI adapter; `bridge-cli.ts` is its sibling, NOT a replacement
9. `src/engine/tool-resolver.ts:72-1024` — `builtInTools` map; new entry `bridge.dispatch` lands here. `isBuiltInTool()` at line 1023 is the gate the process loader uses
10. `packages/core/src/db/schema.ts:495-522` — `harnessDecisions` table already has `stepRunId` + `trustTier` foreign keys; bridge dispatch logs into this table, no new audit table needed
11. `drizzle/meta/_journal.json` — next available idx is 10 (last entry idx=9, tag `0010_thread_titles`); next migration tag prefix will be `0011_*`. Insight-190 discipline applies if new tables are introduced.
12. `packages/web/app/review/` — existing review token surface; bridge approval renders here
13. `packages/web/app/api/` — REST API conventions; bridge admin endpoints (`bridge.list`, `bridge.revoke`) follow the pattern
14. `packages/web/middleware.ts` — `ditto_workspace_session` cookie middleware; the `/api/v1/bridge/_dial` WebSocket upgrade route MUST be exempted from session-cookie enforcement (devices use bearer JWT, not cookies — same exemption pattern Brief 200 uses for `/ws.git/*`)
15. `.context/attachments/pasted_text_2026-04-25_20-19-53.txt:11-13, 75-78, 100-105` — user's pipeline-spec context; the smoke test in §10 of the spec is the integration target this brief unblocks
16. Anthropic Claude Code SDK headless docs (https://code.claude.com/docs/en/headless) — `--bare` flag is recommended for scripted/SDK calls; the bridge default for Claude Code dispatch uses it

## Constraints

- **Engine-first per CLAUDE.md.** Wire-type definitions, JSON-RPC method shapes, the `LocalBridge` interface, and the persisted-job state machine live in `packages/core/src/bridge/` (new directory). The cloud-side dispatcher (Ditto product layer) lives in `src/engine/harness-handlers/bridge-dispatch.ts`. The daemon binary is a new package `packages/bridge-cli/` that consumes `@ditto/core`. Ask: "could ProcessOS use this?" — yes for `packages/core/src/bridge/`, no for `src/engine/harness-handlers/bridge-dispatch.ts` or `packages/bridge-cli/`.

- **No Ditto opinions in core.** `packages/core/src/bridge/` must NOT import Ditto-specific concepts (Self, personas, Network, workspace-Slug semantics). It defines: wire types, JSON-RPC method tables, `LocalBridge` interface, the durable-queue state machine. The product layer wires it to the harness, the trust system, and the UI.

- **DB injection (CLAUDE.md core rule 5).** `packages/core/src/bridge/` does NOT create database connections. The cloud-side dispatcher passes the existing `db` from the workspace at boundary call sites.

- **Side-effecting function guard (Insight-180) — MANDATORY.** Every cloud-side function that emits a `BridgeJob` must require a `stepRunId` parameter. The dispatcher rejects calls without it (except in `DITTO_TEST_MODE`). The audit row in `harness_decisions` is keyed on `stepRunId`. There is no "convenience API" that bypasses the guard.

- **Trust integration via existing `trust-gate.ts` handler — explicit per-tier semantics for bridge dispatch.** The bridge does NOT make trust decisions; `trust-gate.ts` produces a `TrustAction` BEFORE `dispatchBridgeJob()` is called and the dispatcher honours it. `TrustAction` enum is `"pause" | "advance" | "sample_pause" | "sample_advance"` per `packages/core/src/db/schema.ts:110-116`. Mapping for bridge dispatch:
  - `supervised` → `trustAction = "pause"`. Job persists in `bridge_jobs` state `queued`; the cloud-side dispatcher does NOT forward over the wire until the human approves at `/review/[token]`. On approve, `bridge_jobs` advances to `dispatched` and the wire send happens.
  - `spot_checked` sampled-in → `trustAction = "sample_pause"`. Same wait-for-approval behaviour as supervised; the `samplingHash` column on the `harness_decisions` row records the sampling decision per ADR-007.
  - `spot_checked` sampled-out → `trustAction = "sample_advance"`. Wire send happens immediately; no pre-approval gate.
  - `autonomous` → `trustAction = "advance"`. Wire send happens immediately. The result row may surface in the post-hoc review feed if the trust-gate's quality signal flags it (downgrade rule per ADR-007 §Asymmetric — auto-downgrade on rejection or correction-rate>30%).
  - `critical` → `bridge.dispatch` is **not callable** from a critical-tier step. The tool resolver rejects BEFORE any DB write (verified by AC #4's DB-spy assertion). No `harness_decisions` row is written; no `bridge_jobs` row is written.
  - **Orphan signaling:** does NOT introduce a new `TrustAction` enum value. Orphaned jobs write `trustAction = "pause"` + `reviewDetails.bridge.orphaned = true` (verified by AC #10). The `pause` signal correctly tells the harness this needs human attention; the `orphaned: true` flag tells the review surface what kind of attention.

- **Mobile-first per ADR-018 §UX-Constraint-Mapping (Constraints 1-3).** Approval surface for bridge jobs MUST work on a phone (touch targets, no horizontal scroll on long commands, command-preview wraps cleanly). Generation of pairing codes MAY require desktop (the user runs `pnpm --filter ditto-bridge exec ditto-bridge pair <code>` — or `npx ditto-bridge pair <code>` post-publish — in Terminal; that's a desktop action by definition).

- **No external-service dependency.** Pairing, JWT signing, queue persistence, audit — all in Ditto's existing SQLite + the workspace container. No Tailscale account, no Cloudflare account, no ngrok. (Users may layer Tailscale on top voluntarily; Ditto ships nothing that depends on it.)

- **Pairing code TTL is 15 minutes.** The cloud generates a single-use 6-character base32 code (≥30 bits entropy), stored hashed (bcrypt cost 12), expires after 15 min, and is consumed atomically (reading the code marks it used; double-redemption fails). Codes are surfaced once in the UI with a copy-to-clipboard affordance and the "you'll only see this once" warning (PAT pattern, same as Brief 200's clone credentials).

- **Device JWT lifetime is unbounded but rotatable.** Issued device JWTs do not expire by default. Rotation: cloud `bridge.rotate(deviceId)` issues a new JWT and atomically marks the prior one revoked-on-rotation; the daemon's next dial uses the new JWT. Revocation: `bridge.revoke(deviceId)` invalidates the JWT immediately; the next dial fails with HTTP 401 and the daemon logs the revocation reason and exits cleanly.

- **`harness_decisions` is the canonical audit destination.** Every dispatched bridge job results in a row in `harness_decisions` (existing table, schema.ts:495) with `processRunId`, `stepRunId`, `trustTier`, `trustAction`, plus `reviewDetails` containing `{ deviceId, command (scrubbed), exitCode, durationMs, stdoutBytes, stderrBytes }`. Command scrubbing reuses `src/engine/integration-handlers/scrub.ts` to strip credential-shaped values.

- **Schema migration discipline (Insight-190).** This brief introduces two new tables: `bridge_devices` and `bridge_jobs`. They land in `packages/core/src/db/schema.ts`, generated via `drizzle-kit generate` against the next-free idx (10), with tag `0011_local_bridge` (or whatever drizzle-kit chooses). Verify journal idx parity (`drizzle/meta/_journal.json` entry must match the SQL filename). On merge conflicts, resequence idx values; do not skip indices.

- **Claude Code subprocess dispatch defaults to `--bare`.** When the bridge dispatches a `claude -p ...` invocation (the agent-crm runner case), the cloud-side composer adds `--bare` per Anthropic SDK guidance — skips auto-discovery of hooks, skills, plugins, MCP servers, auto-memory, CLAUDE.md, so behaviour is reproducible regardless of what's in the user's `~/.claude`. The current local CLI adapter (`src/adapters/cli.ts:137-142`) does NOT pass `--bare` and is OUT OF SCOPE for this brief — fixing it is a follow-on (one-line change, separate brief).

- **Output cap is 4 MB per stream.** Stdout and stderr are each capped at 4 MB; truncation appends a marker `[ditto-bridge: stream truncated at 4 MB]` and the daemon stops buffering further output for that stream. Subprocess continues; exit code is captured normally.

- **Job timeout default is 10 minutes.** Matches existing CLI adapter behaviour (`src/adapters/cli.ts:164`). Configurable per-job via the `timeoutMs` field on the `BridgeJob`. Subprocess receives SIGTERM, then SIGKILL after 5s.

- **Reconnect backoff is capped at 60 seconds.** Daemon uses exponential backoff with jitter, starting at 1s and capping at 60s. After 30 minutes of consecutive reconnect failures the daemon writes a structured-log line and continues retrying (does not exit) — matches the always-on assumption.

- **No Ditto code runs on the laptop other than the bridge daemon.** The daemon is the only Ditto-shipped binary on user hardware. It does not pull and execute remote scripts; it only runs commands the cloud explicitly dispatched (which the user pre-approved per trust tier). This is the trust-boundary contract.

- **Fail-loud on unwired tools (Insight-180 derivative).** Add an AC that verifies `bridge.dispatch` is registered in `builtInTools` map at `src/engine/tool-resolver.ts:72`. A YAML reference to `bridge.dispatch` without the resolver entry is a silent failure (the LLM can't call the tool, the step executes without it).

- **Operating system support.** Daemon supports macOS 14+ (primary — user's Mac mini target) and Ubuntu 22.04 LTS (test target). Windows support deferred; document as a known gap in `packages/bridge-cli/README.md`.

- **Daemon process model — foreground first, supervisor wrappers documented.** `npx ditto-bridge start` runs in the foreground (logs to stdout). The README ships two recipes for running the daemon as a managed service: (1) **macOS launchd** — a `~/Library/LaunchAgents/you.ditto.bridge.plist` template (`KeepAlive=true`, `RunAtLoad=true`, log paths under `~/Library/Logs/ditto-bridge/`); (2) **Linux systemd user service** — `~/.config/systemd/user/ditto-bridge.service` template with `Restart=on-failure`. No menu-bar app, no tray icon at MVP — that's a separate brief if needed. Daemon flags: `--log-file <path>` (defaults to stdout), `--log-format json|pretty` (defaults to pretty in TTY, json otherwise), `--quiet` (suppresses non-error output).

- **Tmux session lifecycle — daemon does NOT auto-create.** When a `tmux.send` job arrives, the daemon shells `tmux has-session -t <session>` first; if the session does not exist, it returns an error frame with the message `"tmux session '<name>' does not exist on this device — create it manually with: tmux new -s <name>"`. The daemon does not auto-create sessions because the user's intended shell, working directory, and environment are unknowable. The daemon also runs `which tmux` at startup and emits a structured-log warning if tmux is not installed; `tmux.send` jobs return a clear `"tmux is not installed on this device"` error in that case.

- **One concurrent `running` job per device at MVP.** If a job is `running` for a device and another arrives, the second job sits in `queued` and waits. (Sequential dispatch is the user's likely expected behaviour — `runner=local-mac-mini` implies one Claude Code session at a time.) Future enhancement: per-device concurrency cap configurable via the device record. Documented as a known limitation.

- **Opt-in device fallback routing (redundancy for primary-device-offline).** The dispatch payload accepts an optional `fallbackDeviceIds: string[]` ordered list. The cloud-side dispatcher's routing rule at dispatch time:
  1. If `deviceId` is set: check whether that device is currently online (WebSocket connected OR `lastDialAt` within the last 5 minutes). If online → dispatch to it.
  2. If primary `deviceId` is offline AND `fallbackDeviceIds` is non-empty: try each fallback in order; the first online fallback receives the dispatch.
  3. If primary is offline AND no online fallback (or no fallback list): the job sits in `queued` for the primary `deviceId`; queue-persistence (AC #8a) replays it on primary reconnect.
  4. The `harness_decisions` row records `reviewDetails.bridge.deviceId` of whichever device actually ran the job (not the original primary), AND `reviewDetails.bridge.routedAs: 'primary' | 'fallback' | 'queued_for_primary'`.
  5. **No auto-failover on errors.** If the primary is online but the subprocess fails or the WebSocket drops mid-job, fallbacks are NOT consulted — that path goes through queue-persistence (AC #8a) and mid-job-resume (AC #9), which keeps execution semantics on the same device. Switching machines mid-job-failure is risky (different env, different files, different installed tools); the user can manually retry against another device if they want.
  6. **No daemon-side caffeinate.** The user's primary Mac mini is configured awake at the OS level; the daemon does not call `caffeinate(8)`. If the user wants caffeinate they wrap the daemon: `caffeinate -is pnpm --filter ditto-bridge exec ditto-bridge start` (local-dev) or `caffeinate -is npx ditto-bridge start` (post-publish). Documented in `packages/bridge-cli/README.md`.

- **Subprocess defaults on the daemon side:**
  - **Working directory:** the daemon's `cwd` (typically `~`) unless the job payload specifies `cwd: <path>`. The daemon validates that the requested cwd exists; if not, returns an error frame.
  - **Environment:** inherits the daemon's environment by default. If the job payload includes `env: Record<string,string>`, those keys are merged on top (additive only — the daemon does NOT scrub its own env first). Sensitive env vars on the laptop (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) are visible to dispatched commands by design — this is the user's machine, the user controls the env.
  - **Subprocess termination:** SIGTERM at the configured `timeoutMs` (default 10 min); if the subprocess does not exit within 5s, SIGKILL.
  - **Stdin:** `/dev/null` — bridge `exec` is non-interactive. Future PTY brief replaces this for interactive sessions.

- **Protocol versioning.** Both the daemon JWT and the cloud-side dispatcher carry a `protocolVersion` claim (semantic-version string, starting at `"1.0.0"`). The cloud rejects daemon dials whose major version differs from the cloud's expected major (HTTP 426 Upgrade Required). Minor/patch differences proceed; the cloud may emit a warning frame to the daemon recommending an upgrade. **Mid-flight cloud upgrade with active daemons:** on a major-version bump while daemons are connected, the cloud-side server emits a WebSocket close frame with code `4426` and reason `protocol_upgrade_required`; daemons log and exit cleanly with non-zero status; reconnect attempts then fail HTTP 426 as documented (operator must update the daemon binary and re-pair if the JWT's `protocolVersion` no longer matches).

- **Bridge job state machine — transition triggers.** The 8 states (`queued | dispatched | running | succeeded | failed | orphaned | cancelled | revoked`) have these triggers:
  - `queued → dispatched`: cloud-side dispatcher writes the JSON-RPC request to the WebSocket (only happens when daemon connected AND trust gate has approved/auto-advanced).
  - `dispatched → running`: daemon's first `exec.stream` (or for tmux, `tmux.send-ack`) frame arrives.
  - `running → succeeded`: `exec.result` frame arrives with `exitCode: 0`.
  - `running → failed`: `exec.result` frame arrives with non-zero `exitCode`, or the daemon explicitly emits an error frame (e.g., tmux session not found, cwd not found).
  - `running → orphaned`: cloud-side staleness sweeper detects `lastHeartbeatAt` > 10 min.
  - `running → cancelled`: human-initiated abort via UI (`POST /api/v1/bridge/jobs/[id]/cancel`); cloud sends a JSON-RPC `cancel` notification to the daemon, which signals the subprocess and returns an ack.
  - `* → revoked`: device JWT revoked while job is in any non-terminal state.
  - Illegal transitions (notably `revoked → succeeded`, `cancelled → succeeded`, `orphaned → succeeded`) are rejected by `transition()` even if a stale frame arrives in a tight race; the late frame is logged but not applied.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| Outbound-dial worker register-poll-execute-renew pattern | `actions/runner` C# 6k★ MIT (https://depot.dev/blog/github-actions-runner-architecture-part-1-the-listener) | pattern | Gold-standard listener architecture — JIT config, JWT-signed bearer, session model, 50s long-poll, `acquirejob` within 2 min, `renewjob` heartbeat every 60s. Ditto adapts to WebSocket but inherits the lifecycle. |
| WebSocket worker authentication shape | Inngest Connect (https://www.inngest.com/docs/setup/connect) | pattern | Confirms WebSocket as the right wire for a Node bridge daemon with two-key auth (signing + event). Pattern only — Ditto does not depend on Inngest. |
| JSON-RPC 2.0 wire format | JSON-RPC 2.0 spec (https://www.jsonrpc.org/specification) | pattern | Standard, debuggable, library-friendly bidirectional RPC over a single transport. |
| Pairing-code-then-long-lived-token UX | GitHub PAT pattern, GitHub Actions self-hosted-runner registration token | pattern | Established UX for separating short-lived bootstrap from long-lived machine credentials. Brief 200 already uses the same shape. |
| Token storage as bcrypt-hashed | Brief 200 §Constraints | pattern (self-reuse) | Match Ditto's existing credential-storage convention; token never stored plaintext, never logged. |
| `harnessDecisions` audit row per dispatch | `packages/core/src/db/schema.ts:495` (existing table) | depend (existing) | Reuses the table the harness already writes for trust-gate decisions; no new audit table. |
| `ws` (Node WebSocket library) | github.com/websockets/ws — MIT, ~21k★, mature, zero-config in Node, used by virtually every TypeScript WebSocket implementation | depend | Standard library; Next.js Edge runtime supports it via Node API; daemon side uses it directly. |
| `jsonrpc-lite` | github.com/teambition/jsonrpc-lite — MIT, lightweight (~150 LOC), TypeScript-friendly, validates message shapes | depend | Spec-correct JSON-RPC 2.0 with minimal API. Alternative considered: writing 30 lines ourselves; depend chosen because the spec edge cases (notification vs request, batch handling, error codes) are easy to get wrong. |
| `node-pty` (deferred — future PTY brief) | github.com/microsoft/node-pty — MIT, native deps, ~6k★ | depend (future) | NOT used in this brief. Reserved name for the follow-on PTY-streaming brief; called out so the planned dependency is not a surprise later. |
| `bore` (rejected as adopt) | github.com/ekzhang/bore | pattern only | Cool minimal Rust TCP tunnel. NOT adopted because Rust would introduce a sidecar binary into a Node engine. Wire-protocol reference if Ditto ever ships its own tunnel server (Track B users) — that's a separate brief. |
| `actions/runner` lock-renewal cadence (60s) | depot.dev writeup linked above | pattern | Direct adoption of the 60s heartbeat as the cloud-side "is this device still alive?" cadence. |
| asciicast v2 wire format (deferred — future PTY brief) | https://docs.asciinema.org/manual/asciicast/v2/ | pattern (future) | Reserved as the wire shape for `pty.frame` JSON-RPC notifications when the live-PTY view in the web UI is built. NOT used in this brief. |
| Brief 200 path-based URL topology (`https://ditto.you/<workspace-slug>/...`) | `docs/briefs/200-workspace-git-server.md:62` (explicit "per-workspace sub-domains are NOT assumed because that DNS topology is not currently deployed") | pattern (self-reuse) | Path-based, not sub-domain-based — matches Brief 200's deployed topology exactly. Bridge dial endpoint is `wss://ditto.you/<workspace-slug>/api/v1/bridge/_dial`. |
| Bcrypt cost 12 + scrub.ts for command sanitisation | Brief 200, `src/engine/integration-handlers/scrub.ts` | depend (self-reuse) | Existing Ditto convention; do not invent a parallel sanitiser. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/bridge/types.ts` | **Create:** `BridgeJob`, `BridgeJobKind` (`'exec' \| 'tmux.send'` MVP), `BridgeFrame` (result/stream/done shapes), `RegisteredDevice`, `LocalBridge` interface (with method signatures only — no implementation), JSON-RPC method-name constants. Framework-agnostic; no DB, no Express, no Ditto opinions. |
| `packages/core/src/bridge/wire.ts` | **Create:** JSON-RPC 2.0 envelope helpers — `request()`, `notify()`, `response()`, `errorResponse()`. Validates shape via narrow type guards. ~80 LOC; could write inline but `jsonrpc-lite` chosen for spec-correctness. |
| `packages/core/src/bridge/state-machine.ts` | **Create:** `BridgeJobState` enum (`queued | dispatched | running | succeeded | failed | orphaned | cancelled | revoked`) and the legal-transition table. Pure function `transition(from, event) → to | error`. No DB calls. |
| `packages/core/src/bridge/index.ts` | **Create:** Module barrel; exports types + wire helpers + state machine. Hooked into `packages/core/src/index.ts` exports map. |
| `packages/core/src/db/schema.ts` | **Modify:** Add two tables — `bridgeDevices` (id, workspaceId, deviceName, jwtTokenHash, pairedAt, lastDialAt, lastIp, status: `active|revoked|rotated`, revokedAt, revokedReason) and `bridgeJobs` (id, deviceId, processRunId, stepRunId, kind, payload JSON, state per state-machine, queuedAt, dispatchedAt, completedAt, exitCode, stdoutBytes, stderrBytes, lastHeartbeatAt). Both with appropriate indices. Run `drizzle-kit generate` against next-free idx=10. |
| `drizzle/0011_local_bridge.sql` | **Generated:** by `drizzle-kit generate`. Idx and tag match journal entry. Verify SQL file exists for every journal entry per Insight-190. |
| `drizzle/meta/_journal.json` | **Modify (generated):** new entry idx=10. |
| `drizzle/meta/0011_snapshot.json` | **Generated.** |
| `src/engine/harness-handlers/bridge-dispatch.ts` | **Create:** Cloud-side handler. `dispatchBridgeJob(deviceId, kind, payload, stepRunId, trustTier, trustAction)` — Insight-180 guard at function entry. Persists `bridge_jobs` row in state `queued`. If a WebSocket session for the device is connected, sends the job over the wire and transitions to `dispatched` then `running`. If not, leaves in `queued` for connect-time replay. Spawns the `renewjob` heartbeat timer (60s cadence) once `running`. Writes `harness_decisions` row keyed on `stepRunId`. |
| `src/engine/harness-handlers/bridge-dispatch.test.ts` | **Create:** Unit tests for: stepRunId guard rejection, queued→dispatched on connect, dispatched→running on first frame, running→succeeded on done frame, running→orphaned after max-staleness, queued→revoked on device revoke. |
| `src/engine/bridge-server.ts` | **Create:** WebSocket server. Mounted at the `/api/v1/bridge/_dial` route handler. Accepts `Authorization: Bearer <jwt>` upgrade headers; validates the JWT against `bridgeDevices.jwtTokenHash`. On accept, registers the connection in an in-process `Map<deviceId, WebSocket>`. Drains the queue for that device. Handles inbound JSON-RPC frames (`exec.result`, `exec.stream`, `pong`). On disconnect, sets `lastDialAt` and removes from map (jobs in flight stay in `running` state and the heartbeat timer continues — the daemon will replay on reconnect). |
| `src/engine/bridge-server.test.ts` | **Create:** Integration test: simulate a daemon WebSocket connection with a valid JWT, dispatch a queued job, verify it streams over the wire, verify result rows update correctly, verify revocation closes the socket immediately. |
| `packages/web/app/api/v1/bridge/_dial/route.ts` | **Create:** Next.js 15 Route Handler that performs the WebSocket upgrade and forwards to `src/engine/bridge-server.ts`. Note: Next.js Route Handlers do not natively support WebSocket upgrade — implementation may need to attach the `ws` server to the underlying Node HTTP server (custom-server.ts). Verify the existing custom-server pattern at workspace startup; if no custom server, attach via Next.js `instrumentation.ts` hook or a sibling Express endpoint. **Builder must verify the Next.js + WebSocket integration approach during the spike (AC #16) before wiring full server logic.** |
| `packages/web/app/api/v1/bridge/devices/route.ts` | **Create:** `GET` lists devices for the current workspace; `POST` issues a pairing code (response: `{ code, expiresAt }`). |
| `packages/web/app/api/v1/bridge/devices/[id]/route.ts` | **Create:** `DELETE` revokes a device; `PATCH` rotates the JWT. |
| `packages/web/app/api/v1/bridge/pair/route.ts` | **Create:** `POST { code, deviceName, deviceFingerprint }` — daemon-facing endpoint; consumes the pairing code atomically, issues a JWT, returns `{ deviceId, jwt, dialUrl }`. |
| `packages/web/middleware.ts` | **Modify:** Exempt `/api/v1/bridge/_dial` from `ditto_workspace_session` cookie check (devices use bearer JWT, not cookies). Same exemption pattern Brief 200 introduces for `/ws.git/*`. |
| `packages/web/app/bridge/devices/page.tsx` | **Create:** UI affordance — "Devices" page mounted at `/bridge/devices`. Lists paired devices (deviceName, lastDialAt, status: online/idle/revoked), "Pair a new device" button (returns the 6-char code with copy affordance + the local-dev install command `pnpm --filter ditto-bridge exec ditto-bridge pair <code> https://ditto.you/<workspace-slug>`; the UI shows the `npx ditto-bridge` form as well, marked "post-publish"), revoke + rotate per-device buttons. Mobile-friendly. Linked from the existing `/admin` page (top-level admin section); the link block is added to `packages/web/app/admin/page.tsx` as a new card "Local devices" alongside whatever cards already exist there. |
| `packages/web/app/review/[token]/page.tsx` | **Modify:** When the work-item is gated on a bridge `exec` job, render an additional block: "this command will run on your `<deviceName>`" + the literal command (scrubbed for credential-shape values) + the working directory + estimated duration. The Approve/Reject/Tweak buttons function unchanged. |
| `src/engine/tool-resolver.ts` | **Modify:** Register `bridge.dispatch` in the `builtInTools` map at line 72. Schema is a **discriminated union by `kind`**: <br>**`kind: 'exec'`** → `{ deviceId?: string, kind: 'exec', command: string, args?: string[], cwd?: string, env?: Record<string,string>, timeoutMs?: number }` <br>**`kind: 'tmux.send'`** → `{ deviceId?: string, kind: 'tmux.send', tmuxSession: string, keys: string }` <br>If `deviceId` is omitted: dispatch routes to the workspace's only `active` device; if multiple devices are active, the call returns an error asking for explicit `deviceId`. The execute function calls `dispatchBridgeJob(...)` with the `stepRunId` from `ToolExecutionContext`. Guard rejects calls without `stepRunId` (matches Insight-180). Tool is **rejected** when called from a `critical`-tier step (additional precondition check before `dispatchBridgeJob`). |
| `src/adapters/bridge-cli.ts` | **Create:** Sibling to `src/adapters/cli.ts`. Same `cliAdapter`-shaped interface (`execute`, `status`, `cancel`). Instead of `execFileAsync(cli, args, ...)`, calls `dispatchBridgeJob(...)` with `kind='exec'`, awaits the result frame, returns `StepExecutionResult` in the same shape. The Claude Code command composition uses `--bare` by default (one-line difference from `cli.ts:137-142`). |
| ~~`src/engine/adapter-selection.ts`~~ | **DEFERRED — out of scope for Brief 212.** No `projects` table with a `runner` field exists today; adapter routing currently lives in `src/engine/step-executor.ts:48` (switch on `step.executor`). Wiring `runner=local-mac-mini` → `bridge-cli` belongs in a future projects-table brief that introduces the `projects` schema (see user's broader vision spec, `.context/attachments/pasted_text_2026-04-25_20-19-53.txt:3-19`). Brief 212 ships the bridge primitive + the `bridgeCliAdapter` itself; the adapter is callable directly via the `bridge.dispatch` built-in tool from any process YAML, which is sufficient to validate the primitive end-to-end. |
| `packages/bridge-cli/package.json` | **Create:** New package; `name: "ditto-bridge"`, `bin: { "ditto-bridge": "./dist/index.js" }`, `dependencies: { ws, jsonrpc-lite, @ditto/core }`. Minimum Node version: 20 (matches Ditto root). **Local-dev invocation:** `pnpm --filter ditto-bridge exec ditto-bridge <subcommand>` (or `pnpm --filter ditto-bridge build && pnpm link --global --dir packages/bridge-cli` for a system-wide `ditto-bridge` shim). **Published-package invocation:** `npx ditto-bridge` — DEFERRED to a follow-on operations brief (see §Non-Goals). |
| `packages/bridge-cli/src/index.ts` | **Create:** CLI entrypoint. Subcommands: `pair <code> <workspace-url>` (exchanges code for JWT, persists `~/.ditto/bridge.json` mode 0600), `start` (dials and stays connected), `revoke` (logs out cleanly). **Uses `citty` for command routing + `@clack/prompts` for interactive UX** — both already evaluated in `docs/landscape.md:294-303` as Ditto's CLI stack. Match existing `package.json` versions (`citty ^0.2.1`, `@clack/prompts ^1.1.0`). |
| `packages/bridge-cli/src/dialler.ts` | **Create:** WebSocket client; reconnect-with-backoff; ping/pong every 30s; dispatches inbound frames to handlers. |
| `packages/bridge-cli/src/handlers/exec.ts` | **Create:** `exec` handler: spawn subprocess via `child_process.spawn`, stream stdout/stderr line-buffered into `exec.stream` notifications, send `exec.result` on close. Captures up to 4 MB per stream; truncates with marker. Honours `timeoutMs` with SIGTERM-then-SIGKILL. |
| `packages/bridge-cli/src/handlers/tmux.ts` | **Create:** `tmux.send` handler: shells `tmux send-keys -t <session> <keys> Enter`. Returns `{ ok: true }` or stderr on failure. |
| `packages/bridge-cli/src/state.ts` | **Create:** Persists daemon state at `~/.ditto/bridge.json` (jwt, deviceId, dialUrl, version) mode 0600. |
| `packages/bridge-cli/README.md` | **Create:** Install + usage docs; explicit "this is a transport, not an agent" trust boundary statement. |
| `packages/bridge-cli/src/index.test.ts` | **Create:** Smoke test for the CLI subcommands (parsing, error-message text, file mode bits on `~/.ditto/bridge.json`). |
| `src/engine/bridge-server.spike.test.ts` | **Create:** Insight-180-style spike test — ONE real WebSocket roundtrip between a test daemon and the cloud server with a real JWT; verifies the wire format works end-to-end before the rest of the brief builds. **Run BEFORE wiring the route per Insight-180 spike pattern.** |
| `docs/dictionary.md` | **Modify:** Add entries — "Bridge Daemon", "Bridge Pairing Code", "Device JWT", "Bridge Dispatch", "Bridge Job", "Orphaned Job". |
| `docs/architecture.md` | **Modify:** Add a one-paragraph note in §L3 Harness referencing the bridge as a harness extension for cross-machine dispatch; reference this brief and Insight-180. |
| `.env.example` | **Modify:** Document `BRIDGE_JWT_SIGNING_KEY` (32+ random bytes, base64-encoded; never committed) and `BRIDGE_DIAL_PUBLIC_URL` (defaults to `https://ditto.you/<workspace-slug>/api/v1/bridge/_dial` — path-based topology per Brief 200; sub-domain shapes are NOT assumed). |

## User Experience

- **Jobs affected:** Delegate (primary — the user is delegating execution to their own machine), Decide (the approval surface for bridge jobs), Capture (bridge results become content blocks in the conversation). Curate is unchanged (Brief 200's projection is the curate substrate).
- **Primitives involved:** A new "Devices" admin page (lightweight — list view + action buttons; same shape as Brief 200's clone-credentials page). The `/review/[token]` surface gains a "Will run on" block (text + monospace command preview). Bridge results render as existing `ContentBlock` types (specifically `code-execution-output` if it exists; otherwise plain text wrapped in monospace).
- **Process-owner perspective:**
  - **Rob** (SMB trades): never pairs a device; the bridge does not appear unless he creates a project with `runner=local-mac-mini`. Confirms the "no penalty for non-adopters" property.
  - **Lisa**: opens the Devices page once (on her warehouse Mac), clicks "Pair", copies the install command, runs it in Terminal, daemon comes online. After that the bridge is invisible — work items just work whether she's at the warehouse or at home.
  - **Jordan**: native user. Pairs his MacBook + Mac mini + a Linux VPS; sets per-project `runner` declaratively. Approves bridge jobs from his phone via `/review/[token]`.
  - **Nadia**: same as Lisa; the team's runner is a single Mac mini that all team-scoped processes target. (Multi-user team-scope is out of scope for this brief; documented as a future extension.)
- **Interaction states:**
  - **No devices paired yet** → "Pair your first device" prompt with explanation ("Lets Ditto run commands on your laptop / Mac mini — used by `runner=local-mac-mini` projects").
  - **Pairing in progress** → "Open Terminal on the device you want to pair, then run: `pnpm --filter ditto-bridge exec ditto-bridge pair <CODE> <URL>` (local-dev) or `npx ditto-bridge pair <CODE> <URL>` (post-publish). Code expires in 15 min." Shows a "Waiting for device..." spinner that flips to success when the daemon dials in.
  - **Devices listed** → list with deviceName + lastDialAt (e.g., "Mac mini · online" or "MacBook Air · last seen 3 hours ago"); per-device Revoke + Rotate buttons.
  - **Device offline mid-job** → `/review/[token]` renders "Mac mini is offline — this command will run when it reconnects" + "Run on a different device" affordance (lists online devices).
  - **Dispatch failed (non-zero exit)** → result block renders with the exit code, stdout/stderr tail (last 50 lines), durationMs, and a "Retry" button that re-dispatches.
  - **Job orphaned (max-staleness exceeded)** → result block renders "Lost contact with Mac mini after 10 min; the command may or may not have completed. Check the device manually." + a "Mark resolved" affordance.
  - **Revoked credential mid-flight** → daemon logs the revocation reason and exits cleanly; in-flight job transitions to `revoked`; UI surfaces "Device was revoked while running this command."
  - **Rate-limit hit (cloud-side, future)** → not in MVP; flagged in After-Completion as a follow-on if abuse patterns emerge.
- **Designer input:** not invoked directly. The Devices page is a standard PAT-style list-with-actions surface (same shape as Brief 200's clone-credentials page). The `/review/[token]` extension is a single new block (text + monospace command preview) and inherits the existing review-surface design system. If the human asks for a Designer pass, the candidate surface is the "device offline mid-job" state — the language and CTA placement deserve editorial attention.

## Acceptance Criteria

ACs consolidated to 17 per Insight-004 (8-17 range). Each AC may verify multiple related properties on a shared test surface; the AC body lists every property the test must cover. AC #1 (spike test) is **ordered FIRST** — committed in its own commit before any other AC's code lands.

1. [ ] **Spike test gate (Insight-180 spike pattern) — ORDERED FIRST.** `src/engine/bridge-server.spike.test.ts` exists, is committed in its own commit, and passes BEFORE any other AC's code lands. Performs ONE real WebSocket roundtrip with a real JWT through the actual Next.js server stack (no mocks beyond test fixtures) — verifies the Next.js + WebSocket integration works end-to-end. **Pivot path on failure:** attach `ws` to the underlying Node HTTP server via Next.js's `instrumentation.ts` hook (NOT a parallel Express server — Brief 200 chose Next.js Route Handlers as the canonical HTTP framework, line 60); if `instrumentation.ts` also fails, the brief blocks pending architect re-review. Pivot documented in the brief retrospective.

2. [ ] **Engine-core boundary.** `packages/core/src/bridge/types.ts` exports `BridgeJob`, `BridgeFrame`, `RegisteredDevice`, `LocalBridge` interface, JSON-RPC method-name constants. `packages/core/src/bridge/state-machine.ts` exports the `BridgeJobState` enum (`queued | dispatched | running | succeeded | failed | orphaned | cancelled | revoked`) and a pure `transition()` function whose legal-transition table is exhaustive. The `transition()` function rejects illegal transitions (including the `revoked → succeeded` race). All compile with zero Ditto-specific imports — verified by `grep -rEn 'from "(\.\./)+(src|app|engine)/|from "@ditto/(?!core)' packages/core/src/bridge/` returning empty. `git diff --stat main..HEAD -- packages/core/` shows only changes under `packages/core/src/bridge/`, `packages/core/src/db/schema.ts`, and `packages/core/src/index.ts`.

3. [ ] **Insight-180 stepRunId guard at function entry.** The `stepRunId` check is the **first executable statement** in `dispatchBridgeJob()` in `src/engine/harness-handlers/bridge-dispatch.ts` (verifiable by reading the function — no DB lookups, no network calls, no logging precede it). Rejects calls without `stepRunId` by throwing, except in `DITTO_TEST_MODE`. Verified by (a) a unit test that calls without `stepRunId`, asserts the throw, AND uses a `db` spy to confirm zero DB calls happened before the throw; (b) a separate `DITTO_TEST_MODE` test that does NOT throw and proceeds normally.

4. [ ] **Tool resolver wiring with discriminated-union JSON Schema + fallback routing.** `bridge.dispatch` appears in `builtInTools` at `src/engine/tool-resolver.ts:72`. JSON Schema uses `oneOf` with a const-discriminator on `kind`. Both shapes accept the optional `fallbackDeviceIds: string[]`:
   ```json
   {
     "oneOf": [
       { "type": "object", "required": ["kind", "command"],
         "properties": { "kind": {"const": "exec"}, "deviceId": {"type": "string"},
                         "fallbackDeviceIds": {"type": "array", "items": {"type": "string"}},
                         "command": {"type": "string"}, "args": {"type": "array", "items": {"type": "string"}},
                         "cwd": {"type": "string"}, "env": {"type": "object", "additionalProperties": {"type": "string"}},
                         "timeoutMs": {"type": "integer", "minimum": 1000, "maximum": 3600000} } },
       { "type": "object", "required": ["kind", "tmuxSession", "keys"],
         "properties": { "kind": {"const": "tmux.send"}, "deviceId": {"type": "string"},
                         "fallbackDeviceIds": {"type": "array", "items": {"type": "string"}},
                         "tmuxSession": {"type": "string"}, "keys": {"type": "string"} } }
     ]
   }
   ```
   `isBuiltInTool("bridge.dispatch")` returns `true`. YAML process file declaring `tools: [bridge.dispatch]` resolves without "missing tool" error. **Routing rules verified by integration test:** (a) `deviceId` omission routes to the workspace's only `active` device; multiple active devices without explicit `deviceId` returns the documented "explicit deviceId required" error. (b) **Fallback routing:** primary device offline AND `fallbackDeviceIds` non-empty → first online fallback receives the dispatch; `harness_decisions.reviewDetails.bridge.deviceId` records the actual executor (not the original primary) AND `reviewDetails.bridge.routedAs ∈ {'primary','fallback','queued_for_primary'}` reflects the routing decision. (c) Primary offline AND no online fallback → job sits in `queued` for the primary; queue-persistence (AC #8a) replays on reconnect. (d) Primary online → fallbacks NOT consulted (no auto-failover on subprocess errors mid-flight). **Critical-tier callers** receive the documented "bridge.dispatch is not callable from a critical-tier step" error verified by DB spy: zero writes to `bridge_jobs` OR `harness_decisions` between tool invocation and rejection (mirrors AC #3's discipline).

5. [ ] **Pairing flow end-to-end.** `POST /api/v1/bridge/devices` issues a 6-char base32 code (≥30 bits entropy) bcrypt-hashed cost 12, 15-min TTL, single-use. `POST /api/v1/bridge/pair` consumes the code atomically, issues a JWT (signed by `BRIDGE_JWT_SIGNING_KEY` env, carries `protocolVersion: "1.0.0"`), returns `{ deviceId, jwt, dialUrl }`. Daemon `npx ditto-bridge pair <code> <workspace-url>` persists `~/.ditto/bridge.json` with mode `0o600` (verified by stat in test). Double-redemption fails. macOS 14+ and Ubuntu 22.04 LTS verified.

6. [ ] **WebSocket dial + reconnect.** Daemon `npx ditto-bridge start` opens a `wss://` connection to `wss://ditto.you/<workspace-slug>/api/v1/bridge/_dial`, sends `Authorization: Bearer <jwt>` upgrade headers; cloud accepts. `packages/web/middleware.ts` exempts the dial path from session-cookie enforcement. Reconnect-with-backoff: kill the server, daemon retries with exponential backoff capped at 60s; restart server, daemon reconnects without re-pairing. Protocol-version handshake: a JWT with mismatched major version is rejected HTTP 426; same major, different minor accepted with a warning frame.

7. [ ] **End-to-end smoke (binds to user's actual workflow).** Pair a daemon on a local laptop, then from a YAML process step `tools: [bridge.dispatch]`, dispatch a `claude -p "say hello"` job. Verify (a) cloud-side composer auto-adds `--bare` to the args array, (b) daemon executes `claude --bare -p "say hello"`, (c) stdout streams back as `exec.stream` notifications, (d) `exec.result` frame contains `exitCode: 0` and response text, (e) the job surfaces in `/review/[token]` with "this command will run on your `<deviceName>`" preview, (f) the surface renders cleanly on iPhone Safari at 390×844 (no horizontal scroll, ≥44pt touch targets) — Playwright snapshot test reuses Brief 211's e2e wiring at `packages/web/e2e/`.

8. [ ] **Queue persistence + per-device concurrency cap.** Two integration scenarios sharing the cloud-side dispatcher state surface: <br>**(a) Queue persistence across daemon offline.** Stop the daemon. Cloud-side, dispatch 3 bridge jobs sequentially. Restart the daemon. All 3 dispatch in `queuedAt` order on reconnect; state transitions `queued → dispatched → running → succeeded` for each. <br>**(b) One concurrent `running` job per device.** With the daemon online, dispatch 3 jobs back-to-back. Assert they execute strictly in `queuedAt` order with non-overlapping `dispatchedAt`/`completedAt` timestamps per device — second job stays in `queued` until first reaches a terminal state.

9. [ ] **Mid-job disconnect resume.** Dispatch a 30-second `exec` job (e.g., `sleep 30 && echo done`). After 5s, kill the WebSocket. Verify (a) daemon's subprocess continues running, (b) daemon buffers stdout in memory, (c) on reconnect buffered output streams to cloud, (d) `exec.result` frame arrives with correct exit code. `running` state never transitions to `orphaned` if reconnect happens within `maxStalenessMs` (10 min default).

10. [ ] **Orphan detection + heartbeat cadence.** `running` job whose `lastHeartbeatAt` exceeds 10 min transitions to `orphaned` and emits a `harness_decisions` row with `trustAction='escalate'` and `reviewDetails.bridge.orphaned=true`. While a job is `running`, the cloud-side dispatcher updates `bridgeJobs.lastHeartbeatAt` every 60s from the daemon's `pong` frames (cadence pattern from `actions/runner`). Verified by integration test that asserts ≥2 heartbeat updates over a 130s job, plus a unit test that backdates `lastHeartbeatAt` and runs the staleness sweeper.

11. [ ] **Credential lifecycle (revoke + rotate).** `DELETE /api/v1/bridge/devices/[id]` revokes a device: WebSocket closes immediately with HTTP 401 on next interaction; in-flight jobs transition to `revoked`; queued jobs transition to `revoked`; future dial attempts with the stale JWT fail HTTP 401. `PATCH /api/v1/bridge/devices/[id]` with action `rotate` issues a new JWT and atomically marks the prior one revoked-on-rotation. **MVP rotation = revoke + re-pair** (the daemon must be re-paired on the laptop with a new code; in-band rotation deferred to a follow-on brief — documented as a known limitation in the brief and `packages/bridge-cli/README.md`).

12. [ ] **Trust-tier semantics enforced (4 tiers).** Integration tests cover all four ADR-007 tiers — (a) `supervised`: dispatch enters `queued` with `trustAction='await_approval'`, advances to `dispatched` only after `/review/[token]` Approve; (b) `spot_checked`: deterministic sampling per ADR-007 — sampled-out advance immediately, sampled-in wait for approval; (c) `autonomous`: dispatch advances immediately, no pre-approval; (d) `critical`: rejected at tool-resolver before any dispatcher call. Each tier produces a `harness_decisions` row with matching `trustTier` and `trustAction`.

13. [ ] **Audit trail with precise `reviewDetails` schema.** Every dispatched job → exactly one `harness_decisions` row, written at dispatch and updated on completion. `reviewPattern` includes the literal string `"bridge_dispatch"`. `trustTier` and `trustAction` use real enum values from `packages/core/src/db/schema.ts:110-116` (`pause | advance | sample_pause | sample_advance`) — invented values like `"escalate"` or `"await_approval"` are NOT used (orphan signal: `trustAction="pause"` + `reviewDetails.bridge.orphaned=true`). <br>`reviewDetails.bridge` is: <br>`{ deviceId: string (the actual executor), deviceName: string, requestedDeviceId?: string (the originally-requested primary if fallback routing kicked in), routedAs: 'primary' \| 'fallback' \| 'queued_for_primary', kind: 'exec' \| 'tmux.send', command?: string (scrubbed via src/engine/integration-handlers/scrub.ts; only for kind='exec'), tmuxSession?: string (only for kind='tmux.send'), exitCode: number \| null, durationMs: number, stdoutBytes: number, stderrBytes: number, stdoutTail: string (last ~4 KB of stdout, scrubbed; empty string if no output), stderrTail: string (last ~4 KB of stderr, scrubbed; empty string if no output), truncated: boolean, terminationSignal?: 'SIGTERM' \| 'SIGKILL', orphaned: boolean }`. <br>The `stdoutTail`/`stderrTail` fields are what `/review/[token]` renders for the human — the User Experience section's "stdout/stderr tail (last 50 lines)" promise lands here. Verified by integration test that dispatches one job producing >4 KB output, awaits completion, queries `harness_decisions`, asserts every key is present with the correct shape AND that `stdoutTail` contains the **last** ~4 KB (not the first), AND that any value matching `scrub.ts`'s credential patterns has been masked.

14. [ ] **Daemon-side handler semantics (`exec` + `tmux.send`).** Two integration test files: `packages/bridge-cli/src/handlers/exec.test.ts` and `packages/bridge-cli/src/handlers/tmux.test.ts`. <br>**(a) Subprocess defaults (exec):** `cwd` defaults to `~`; payload-supplied `cwd` honoured; non-existent `cwd` returns error frame. Payload `env` merged additively (daemon env preserved; payload keys override on collision). `timeoutMs` triggers SIGTERM, then SIGKILL after 5s. Stdin = `/dev/null`. Stdout/stderr capped at 4 MB each; truncation marker appended; `truncated=true` on the result frame. <br>**(b) Tmux pre-flight (tmux.send):** non-existent session returns the documented verbatim error `"tmux session 'X' does not exist on this device — create it manually with: tmux new -s X"`. `tmux` missing from `$PATH` returns `"tmux is not installed on this device"`. Daemon emits structured-log warning at startup if tmux missing. <br>**(c) Tmux Enter semantics:** the daemon shells `tmux send-keys -t <session> -- <keys> Enter` — the trailing `Enter` keystroke is appended automatically. Pass literal `keys` without trailing newline. Multi-line input via embedded `\n` in `keys` is undefined v1 (test asserts the documented behaviour for a single-line `keys` payload).

15. [ ] **Mobile approval surface (Playwright snapshot).** Restored as a discrete AC — `/review/[token]` for a bridge `exec` job renders on iPhone Safari at viewport 390×844 with: device name, command preview wrapping cleanly (no horizontal scroll), Approve/Reject/Tweak buttons with ≥44pt touch targets, and the `stdoutTail`/`stderrTail` content from AC #13 visible in a collapsed-by-default monospace block (expand-on-tap). Verified by Playwright snapshot test in `packages/web/e2e/bridge-approval.spec.ts` reusing Brief 211's e2e wiring shape.

16. [ ] **`harness_decisions` table is the only audit destination.** No new audit table created (reuses existing `packages/core/src/db/schema.ts:495`). New tables limited to `bridgeDevices` and `bridgeJobs`. Verified by `grep -rn "sqliteTable" packages/core/src/db/schema.ts` showing the schema diff is exactly two new tables.

17. [ ] **Schema migration discipline (Insight-190 + CLAUDE.md schema-migrations rule).** `drizzle/0011_local_bridge.sql` exists (or next-free tag if idx=10 has been claimed by a parallel brief at PR-open); `drizzle/meta/_journal.json` has a matching entry; `drizzle/meta/<NNNN>_snapshot.json` exists; `pnpm db:migrate` applies cleanly on a fresh DB. **Resequence procedure if idx=10 is taken at PR-open:** (1) increment to next-free idx, (2) re-run `drizzle-kit generate` so SQL + snapshot regenerate, (3) verify journal idx parity, (4) update this AC's referenced idx + tag inline. Do NOT skip indices; do NOT manually edit the journal.

18. [ ] **Type-check + tests pass; no regression in existing CLI adapter.** `pnpm run type-check` passes at root with zero errors. `pnpm test` passes with zero regressions. `src/adapters/cli.ts` is **not modified** by this brief — the `--bare` fix for the in-cloud Claude CLI invocation (cli.ts:137-142) is explicitly out of scope and a separate one-line follow-on brief.

(18 ACs — at Insight-004's upper bound, intentionally. ACs #1 (spike), #3 (stepRunId guard), #8 (queue + concurrency), #9 (mid-job resume), #10 (orphan + heartbeat), #12 (trust tiers) are non-negotiable. AC #14 is consolidated on the daemon-handler test surface (one test file per handler, three sub-properties testing the same handler); AC #11 is consolidated on the credential-lifecycle surface. The remaining ACs are one-seam-each per Insight-004's spirit.)

## Review Process

1. Spawn fresh-context Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, this brief, `docs/research/local-bridge.md`, ADR-018, ADR-007, Insight-180.
2. Reviewer verifies, with extra scrutiny on:
   - **Trust integration (AC #12):** Does the bridge dispatch traverse `trust-gate.ts` BEFORE dispatching, not after? Are all four tiers' semantics implemented per the table in Constraints §? Is `trustTier` recorded on the `harness_decisions` row in every dispatch path?
   - **stepRunId guard (AC #3):** Is the guard the FIRST executable statement of `dispatchBridgeJob`, not buried in a sub-call? Does the unit test's DB-spy assertion actually fail if a query happens before the throw?
   - **Engine-core boundary (AC #2):** Does `packages/core/src/bridge/` contain zero Ditto opinions and zero DB-connection creation? Does the broadened grep catch `from "@ditto/*"` non-core aliases?
   - **State machine completeness (AC #2):** Are all 8 states reachable? Are illegal transitions rejected by `transition()`? Specific edge case the reviewer must walk: can a `revoked` job ever transition to `succeeded` if the result frame arrives in a tight race after revocation? (Answer must be: no — `transition('revoked', 'succeeded')` returns an error.)
   - **Queue ordering (AC #8) + concurrency cap (AC #14c):** When the daemon reconnects after offline, are queued jobs dispatched in `queuedAt` order? While a job is `running` for a device, do additional dispatches wait?
   - **JWT lifecycle (AC #5, #11):** Is the JWT signed with `BRIDGE_JWT_SIGNING_KEY` from env (not committed)? Is the hash stored, not plaintext? Does revocation propagate atomically? Is the protocol-version handshake correctly implemented?
   - **WebSocket-to-Next.js integration (AC #1):** Most fragile dependency. The spike is the gate. Reviewer confirms the spike AC is committed in its own commit and passes BEFORE any other AC's code lands.
   - **Mobile UX (AC #7):** Does the approval surface fit at 390×844 without horizontal scroll? Are touch targets ≥44pt? Does the Playwright snapshot test exist?
   - **No external-service dependency:** `grep -rn "tailscale\|cloudflare\|ngrok\|frp" src/engine/ packages/core/src/bridge/ packages/bridge-cli/src/` returns only matches in comments/docs.
   - **Schema discipline (AC #16):** Is the next-free idx still 10 at build time? Has a parallel brief claimed it? Resequence procedure followed if so?
   - **Daemon execution semantics (AC #14):** Are subprocess defaults, tmux pre-flight, and concurrency all tested as documented? (This is the consolidated AC; reviewer must walk all four sub-properties.)
3. **Spike-test gate:** AC #1 must pass BEFORE ACs #2-#17 are considered. If the spike reveals Next.js cannot upgrade WebSockets, brief pivots to attaching `ws` via Next.js `instrumentation.ts` hook (NOT a parallel Express server, per Brief 200's framework choice); pivot is documented in the retrospective.
4. Present work + review findings to the human.

## Smoke Test

```bash
# 0. Pre-flight: verify the spike test passed
pnpm vitest run src/engine/bridge-server.spike.test.ts
# Expected: 3 tests passing — JWT-authed WebSocket roundtrip + 2 auth-rejection cases

# 1. Boot the workspace; apply migrations
pnpm db:migrate
pnpm dev  # Starts Ditto workspace at localhost:3000

# 2. Build + pair a daemon on the developer's local laptop
# In a separate terminal:
pnpm --filter ditto-bridge build
# Local-dev invocation (this brief — `npx ditto-bridge` is post-publish, see §Non-Goals):
pnpm --filter ditto-bridge exec ditto-bridge pair  # Will prompt for CODE and URL
# (Or one-shot: pnpm --filter ditto-bridge exec ditto-bridge pair ABC123 https://<workspace>.ditto.you)
# Then:
pnpm --filter ditto-bridge exec ditto-bridge start  # Daemon dials and stays connected
# Expected: log line "connected to <workspace>.ditto.you, deviceId=<uuid>"
#
# Convenience: `pnpm link --global --dir packages/bridge-cli` once, then use bare `ditto-bridge` everywhere.

# 3. Verify pairing artefact on disk (daemon credential file lives in $HOME on the device)
ls -l ~/.ditto/bridge.json
# Expected: -rw------- (mode 0600), JSON contents include jwt + deviceId

# 4. Dispatch a Claude Code job from the cloud workspace
# Via the Ditto chat: "Run claude -p 'Say hi' on my Mac mini"
# (Or directly: from a YAML process step with `tools: [bridge.dispatch]`)
# Expected: /review/[token] surfaces with "this command will run on your <deviceName>"
#           + the literal command (with --bare auto-added)
#           + Approve/Reject/Tweak buttons

# 5. Approve from a phone
# Open the review URL on iPhone; tap Approve
# Expected on the laptop: subprocess runs; output streams back; result block in chat

# 6. Verify audit trail
# Cloud-side Ditto SQLite path resolves via src/paths.ts: $DATABASE_PATH if set
# (Railway/Fly mounted volume — typically /data/ditto.db); else <repo>/data/ditto.db.
DB="${DATABASE_PATH:-data/ditto.db}"
sqlite3 "$DB" "SELECT step_run_id, trust_tier, json_extract(review_details, '$.bridge.deviceId') FROM harness_decisions WHERE json_extract(review_details, '$.bridge.command') IS NOT NULL ORDER BY created_at DESC LIMIT 1;"
# Expected: 1 row with stepRunId, trustTier, deviceId — confirms Insight-180 + audit chain

# 7. Queue persistence test (AC #8)
# Stop the daemon (Ctrl-C in its terminal)
# In Ditto chat, dispatch 3 bridge jobs back-to-back
# Restart the daemon
pnpm --filter ditto-bridge exec ditto-bridge start
# Expected: 3 jobs execute in order (verify by stdout timestamps)

# 8. Mid-job disconnect test (AC #9)
# Dispatch: claude -p "wait 30 seconds then say hi"  (or sleep 30 && echo done)
# 5 seconds in, kill the daemon's WebSocket: pkill -f "ditto-bridge start"
# Restart immediately:
pnpm --filter ditto-bridge exec ditto-bridge start
# Expected: subprocess kept running on the laptop; output streams in on reconnect; result frame arrives with exit code 0

# 9. Revocation under load (AC #11)
# Dispatch a long sleep (sleep 60); while it's running, in Ditto UI Devices page click Revoke on the device
# Expected: daemon exits cleanly with "device revoked" log; in-flight job marked revoked in DB; new dial attempt with stale jwt fails HTTP 401

# 10. Tool wiring (AC #4)
node --input-type=module -e "import('./src/engine/tool-resolver.js').then(m => console.log(m.isBuiltInTool('bridge.dispatch')))"
# Expected: true
# (Falls back to: pnpm exec tsx -e "import('./src/engine/tool-resolver').then(m => console.log(m.isBuiltInTool('bridge.dispatch')))")

# 11. Engine-core boundary (AC #2)
git diff --stat origin/main..HEAD -- packages/core/
# Expected: only packages/core/src/bridge/* and schema.ts touched in core
grep -rEn 'from "(\.\./)+(src|app|engine)/|from "@ditto/(?!core)' packages/core/src/bridge/ || echo "OK: no Ditto imports"
# Expected: OK

# 12. No external-service dependency
grep -rn "tailscale\|cloudflare\|ngrok\|frp" src/engine/harness-handlers/bridge-dispatch.ts packages/bridge-cli/src/ packages/core/src/bridge/ || echo "OK: no external tunnel deps"
# Expected: OK (any matches are in comments/docs)

# 13. Type-check + tests
pnpm run type-check && pnpm test
# Expected: 0 errors; 0 regressions; all bridge tests pass
```

## After Completion

0. **Brief 215 wiring obligation (added 2026-04-25, RESOLVED 2026-04-26):** Brief 215 originally registered a `local-mac-mini` `RunnerAdapter` shim with `bridge: null` (see `packages/web/instrumentation.ts`). Now that Brief 212 is complete, `src/engine/local-bridge.ts` composes Brief 212's primitives (`dispatchBridgeJob`, `sendBridgeFrame`, `revokeDeviceConnection`, `isDeviceConnected`, `bridgeDevices` query) into a concrete `LocalBridge` instance. Engine boot calls `createLocalBridge()` and passes the result into the adapter — local-mac-mini dispatches now reach the bridge-server. **Known follow-up:** `LocalBridge.cancel()` currently throws "not yet wired" because Brief 212 didn't ship a free function for in-flight job cancellation (the state machine has the transition; only the explicit invocation API is missing). Sub-brief 221 (mobile UX) or a dedicated polish brief should expose it.

1. **Update `docs/state.md`** with: bridge MVP shipped, daemon installable, `runner=local-mac-mini` route enabled. Note any pivots from the spike (esp. WebSocket integration approach).
2. **Update `docs/roadmap.md`:** mark "Local bridge" capability complete; surface follow-ons (PTY streaming brief, multi-device failover, rotation-without-re-pair, Windows support, OAuth pairing).
3. **Update `docs/architecture.md`** §L3 Harness with the bridge-as-harness-extension paragraph.
4. **Update `docs/landscape.md`:** if the spike forced a pivot (e.g., adopting an additional library), add the entry.
5. **Update `docs/dictionary.md`:** "Bridge Daemon", "Bridge Pairing Code", "Device JWT", "Bridge Dispatch", "Bridge Job", "Orphaned Job".
6. **Phase retrospective:**
   - Did outbound-dial-WebSocket pan out, or did the Next.js integration force a pivot?
   - Was the resilience trio (queue persistence + mid-job resume + orphan detection) properly testable as a unit, or did it deserve to be split?
   - Did `--bare` cause any surprises in real Claude Code sessions?
   - Is the `dispatchBridgeJob` Insight-180 guard pattern reusable, or did it need ad-hoc adaptation? (Candidate for promotion to a `withStepRunId(...)` HOF if reusable.)
7. **Write ADR if a significant decision was made during build.** Likely candidates: (a) WebSocket vs SSE+POST if the spike forced it, (b) multi-device dispatch ordering policy if the simple single-target shape proves insufficient, (c) JWT-rotation semantics if the v1 "revoke + re-pair" UX is too painful.
8. **Insight candidates to capture:**
   - If the spike-first pattern paid off again, that's evidence for promoting Insight-180 spike discipline into the brief template.
   - If the resilience trio (queue persistence + mid-job resume + orphan detection) revealed a generalisable pattern (e.g., "every async dispatch needs these three properties together"), that's an Insight candidate.

---

**Reference docs updated:** `docs/research/local-bridge.md` (no drift; report is the input), `docs/landscape.md` §"Workspace Local Bridge" (added during research pass), `docs/research/README.md` (index row added during research pass). This brief itself is the new artefact.

**Reference docs that will need to be updated post-build:** `docs/state.md`, `docs/roadmap.md`, `docs/architecture.md` §L3, `docs/dictionary.md`. The brief's After-Completion section is the contract.
