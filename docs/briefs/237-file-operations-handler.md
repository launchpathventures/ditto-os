# Brief 237: File Operations Handler

**Date:** 2026-05-01
**Status:** draft
**Depends on:** Brief 235 (Handler Registry + Capability Advertisement), Brief 236 (Paired-Device Awareness + UI Capability Gating)
**Unlocks:** Project-context features in cloud Self (read project files for context); Self-driven file mutations (write generated config, edit source); future "Open in Finder" / "Open in editor" buttons; substrate for any future capability that needs to read or modify files on the user's machine

## Goal

- **Roadmap phase:** Phase 9 — Bridge Capability Layer (sub-brief #3 of Brief 234)
- **Capabilities:** First user-facing capability handler family — `file.read`, `file.write`, `file.glob`, `file.grep`, `file.watch` — exposing the user's local filesystem as an addressable surface for cloud Self, scoped safely to advertised root directories

## Context

After Briefs 235 + 236, the bridge has a handler registry, capability advertisement, online tracking, and UI capability-gating — but only `exec` and `tmux.send` exist as actual handlers, both of which require the cloud to know shell-command syntax to do anything useful. Cloud Self can't read a project file without doing something awkward like `bridge.dispatch({ kind: "exec", command: "cat", args: ["/path/file"] })`, which costs an entire harness pipeline + 4MB-buffered subprocess for what should be a single primitive.

File operations are the first capability family that demonstrates the substrate's value:
- **Cloud Self can read project files for context** — when chatting about a project, Self can `file.read` the relevant file directly instead of asking the user to paste contents
- **Cloud Self can write back** — generated config, refactored code, new files; subject to the existing trust gate (supervised by default; per-project autonomy lifts via existing trust mechanisms)
- **`file.glob` + `file.grep`** let cloud Self do project-wide search without dispatching a giant `exec` job
- **`file.watch`** enables future briefs (e.g., "watch for build artifacts and notify when complete") without bespoke polling loops

Daemon-side this means new handler implementations + path-traversal safety. Cloud-side this means new dispatch payload shapes + harness-decisions audit-shape extensions for non-exec dispatches.

## Objective

Ship the five-handler file operations family on the daemon side, the matching cloud-side dispatcher cases (sharing the existing `dispatchBridgeJob` pipeline), the trust-gate integration (supervised default; relaxable per-project), and one or two example UI consumers (in chat: "Read this file" / "Show recent changes in this folder") so the substrate is exercised end-to-end and we can verify the Brief 235/236 abstractions hold under a non-trivial handler family.

## Non-Goals

- **No `file.delete`, `file.move`, `file.chmod`, `file.symlink`.** Destructive ops require richer trust + UX consideration (per-file-confirm vs. bulk?). Defer to a separate brief once the read/write/search family proves out the substrate.
- **No `file.open` (open in Finder / default app).** Adjacent capability, slightly different shape (returns void; OS-side handling); defer to a small separate brief alongside OS-notifications work.
- **No editor integration.** "Open in VS Code / Cursor" is launcher work, not file IO; separate.
- **No file diff or patch primitives.** `file.write` is whole-file replacement; partial edits go through `exec` (`patch`, `git apply`) until usage patterns justify a richer primitive.
- **No bulk file-transfer / large-file streaming.** 4MB cap (matching the existing exec stream cap) covers the typical project file. Larger files refused at the daemon side with an explicit error frame.
- **No per-file ACL / fine-grained permissions.** The daemon advertises a list of allowed roots (e.g., the user's `~/code/` and `~/Documents/Ditto/`); all file ops must resolve within those roots. Per-file allow/deny lists are out of scope.
- **No watcher subscription multiplexing or aggregation.** Each `file.watch` request creates an independent watcher; no fan-out, no shared subscriptions across cloud consumers. Future optimization.
- **No symlink-following discipline.** Symlinks are followed if they resolve within the allowed roots; refused otherwise. No "always reject symlinks" hard rule.
- **No charset detection or transcoding.** All file reads return UTF-8; binary files return as base64-encoded with `encoding: "base64"` field. No magic mime-type inference.
- **No content scanning / safety filters on read content.** The harness pipeline still applies (the read result enters the cognitive context normally; existing guards like outbound-quality-gate run on outbound actions, not inbound reads).

## Inputs

1. `docs/briefs/235-bridge-handler-registry.md` — handler interface and capability advertisement substrate
2. `docs/briefs/236-paired-device-awareness.md` — UI capability-gating primitive
3. `docs/adrs/044-local-client-capability-surface.md` — capability surface decision
4. `docs/briefs/234-bridge-capability-layer-phase.md` — parent phase brief
5. `packages/bridge-cli/src/handlers/exec.ts` — reference for handler shape, hooks injection, streaming, result frames
6. `packages/core/src/bridge/types.ts` — wire types; will be extended with new payload + result kinds
7. `src/engine/harness-handlers/bridge-dispatch.ts` — dispatcher; will need new payload kinds wired through credential scrubber + audit shape
8. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — `file.write` is a side-effecting function; requires `stepRunId` guard
9. `docs/insights/017-security-is-architectural-not-a-role.md` — security-as-architecture; path-traversal prevention is load-bearing
10. `docs/landscape.md` — to be extended with chokidar entry
11. chokidar docs (`paulmillr/chokidar`) — for `file.watch` implementation

## Constraints

- **Path-traversal prevention is mandatory.** All file paths resolve via `path.resolve(root, requested)` then verified against the allowed root list. Any resolved path that escapes the allowed roots is rejected with an explicit error frame (`error: "path-not-in-allowed-roots"`); never silently degraded or "best-effort" allowed.
- **Allowed roots are advertised on capability frame metadata.** The `file.read` (and family) capability advertisement includes `metadata: { allowedRoots: string[] }`. The cloud surfaces these in Devices view. The daemon refuses any file op outside these roots regardless of how the cloud asks.
- **Default allowed roots come from daemon configuration, not hardcoded.** The daemon reads from `~/.ditto/bridge-roots.json` (mode 0600) on startup. If absent, the daemon refuses to advertise file capabilities. No "auto-discover sensible defaults" — the user must opt in to which directories are exposed.
- **`file.write` requires `stepRunId` per Insight-180.** The cloud-side dispatcher case for `file.write` enforces this before any DB write. `file.read`, `file.glob`, `file.grep`, `file.watch` are read-only and don't trigger Insight-180 (they're internal to the harness pipeline; no external side effect). However, for audit-trail consistency, the dispatcher still records all five in `harness_decisions` keyed on the originating step run.
- **Trust class declaration on each capability:**
  - `file.read`, `file.glob`, `file.grep`, `file.watch` — `supervised` default, `spot_checked`-eligible (read-only; per-project relaxation makes sense as trust earns)
  - `file.write` — `supervised` default, `spot_checked`-eligible only with explicit per-project trust uplift; never `autonomous` without per-call confirmation (writes are destructive even within an allowed root)
- **4MB read cap.** `file.read` of a file >4MB returns `error: "file-too-large"` with the file's size in the result. No partial-read semantics in this brief (operator can `exec` `head` / `tail` if needed).
- **Glob and grep have hit caps.** `file.glob` returns max 1000 paths; `file.grep` returns max 500 matches. Truncation is reported in the result frame (`truncated: true` + `totalCount: number`).
- **Watcher subscription has lifecycle.** `file.watch` returns a `subscriptionId`; a separate `file.watch.cancel` request (or the existing `cancel` JSON-RPC method) tears it down. Watchers don't outlive the WebSocket connection; on disconnect, all watchers for that connection are torn down. Re-subscribe on reconnect is the consumer's responsibility.
- **Watcher event throttling.** Per-watcher: max 10 events per second. Burst > threshold coalesces into "many changes" event with a count.
- **Engine-product split:** payload types and result types in `@ditto/core/src/bridge/file-types.ts`. Daemon handler implementations in `packages/bridge-cli/src/handlers/file-*.ts`. Cloud-side dispatcher cases in `src/engine/harness-handlers/bridge-dispatch.ts` (existing file).
- **Credential scrubbing extends to file paths and content.** A path of `~/.aws/credentials` is suspicious-shaped; log the path but redact in `harness_decisions.reviewDetails.bridge.path`. Read content is opaque (we don't scrub-on-read; we redact-on-audit if patterns match the existing scrubber list).
- **No daemon-side caching of file content.** Each read hits the disk. Watchers maintain in-memory state per chokidar's defaults; no cross-watcher caching.
- **No follow-redirects on file paths.** Symlinks within allowed roots: followed transparently. Outside: rejected. No "if-follow-resolves-inside-allowed-root, allow" — that's a TOCTOU hazard.
- **All file ops record in `harness_decisions`** with `kind: "file.<op>"`, the resolved (canonical) path, and outcome. `file.read` includes `bytesReturned`; `file.write` includes `bytesWritten`. Audit completeness is non-negotiable.
- **Side-effect invocation guard (Insight-180):** the `file.write` dispatcher case must require `stepRunId` and reject without it (except in `DITTO_TEST_MODE`). Read/search/watch operations don't require it but still record under the surrounding step's audit row.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Path-traversal prevention via `path.resolve` + allowed-root check | Node.js stdlib `path` module + standard idiom | pattern | Standard cross-platform safe-path operation; no library needed; the idiom is industry-conventional |
| File watcher implementation | chokidar (`paulmillr/chokidar`) | depend | Industry-standard Node file watcher; ~3M weekly downloads; cross-platform; the only sane choice. Add to landscape.md |
| Glob implementation | `tinyglobby` (`SuperchupuDev/tinyglobby`) — a fast modern glob, MIT, already in some Ditto deps | depend | Modern, fast, drop-in. Verify presence in `pnpm-lock.yaml`; fall back to fast-glob if not |
| Grep implementation | Either ripgrep subprocess (if `rg` available on PATH) OR pure-JS line-by-line scan with regex | pattern | Pure-JS for portability; ripgrep subprocess as optimization if available. Implementation choice: pure-JS first (simpler; we're not optimizing yet) |
| Allowed-roots opt-in pattern | SSH `~/.ssh/authorized_keys` (deny-by-default + explicit allow) | pattern | The mental model — daemon owner explicitly authorizes which directories are exposed — matches SSH's authorized-keys posture |
| Watcher event throttling and coalescing | RxJS / lodash `throttle` patterns; chokidar's own `awaitWriteFinish` option | pattern | Standard event-coalescing; we'll use chokidar's built-in `awaitWriteFinish` plus a custom 10/sec rate limiter |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/bridge/file-types.ts` | **Create**: payload + result types for `file.read`, `file.write`, `file.glob`, `file.grep`, `file.watch`, `file.watch.cancel`. Each typed; payloads are discriminated by method name |
| `packages/core/src/bridge/types.ts` | **Modify**: extend `BridgePayload` discriminated union with the five new file-op kinds |
| `packages/core/src/bridge/index.ts` | **Modify**: barrel-export new types |
| `packages/core/src/bridge/file-types.test.ts` | **Create**: type-level + Zod-style validation tests for payload schemas |
| `packages/bridge-cli/src/handlers/file-read.ts` | **Create**: handler implementation; takes payload, validates path against allowed roots, reads file, returns result frame with content (UTF-8 or base64) |
| `packages/bridge-cli/src/handlers/file-write.ts` | **Create**: handler; same validation; writes file (creates parent dirs if asked); returns bytesWritten |
| `packages/bridge-cli/src/handlers/file-glob.ts` | **Create**: handler; uses tinyglobby; root-scoped; 1000-hit cap |
| `packages/bridge-cli/src/handlers/file-grep.ts` | **Create**: handler; pure-JS line-by-line scan with regex; root-scoped; 500-hit cap |
| `packages/bridge-cli/src/handlers/file-watch.ts` | **Create**: handler; uses chokidar; emits `file.watch.event` notifications; throttled |
| `packages/bridge-cli/src/handlers/file-roots.ts` | **Create**: helper for loading + validating `~/.ditto/bridge-roots.json`; resolveAndValidate(root, requestedPath) function |
| `packages/bridge-cli/src/handlers/file-roots.test.ts` | **Create**: unit tests for path-traversal cases (../, absolute paths, symlinks, valid paths) |
| `packages/bridge-cli/src/handlers/file-read.test.ts` | **Create**: unit tests; positive (in-root), negative (out-of-root rejected), large file (>4MB rejected), binary file (base64 returned) |
| `packages/bridge-cli/src/handlers/file-write.test.ts` | **Create**: unit tests; positive, out-of-root rejected, parent-dir-creation toggle, write failure error frame |
| `packages/bridge-cli/src/handlers/file-glob.test.ts`, `file-grep.test.ts`, `file-watch.test.ts` | **Create**: unit tests per handler |
| `packages/bridge-cli/src/registry.ts` | **Modify**: register the five new handlers (advertise capabilities, including `metadata.allowedRoots`); skip registration entirely if `~/.ditto/bridge-roots.json` is absent (operator hasn't opted in) |
| `packages/bridge-cli/README.md` | **Modify**: add section "Allowed Roots Configuration" explaining `~/.ditto/bridge-roots.json` shape and security model |
| `package.json` (root) | **Modify**: add chokidar (`^4.0.0` or current stable) and tinyglobby (or fast-glob fallback) as dependencies of `packages/bridge-cli/package.json` (NOT root) |
| `packages/bridge-cli/package.json` | **Modify**: add chokidar, tinyglobby dependencies |
| `src/engine/harness-handlers/bridge-dispatch.ts` | **Modify**: add cases in the discriminated payload type switch for the five new kinds; `file.write` case enforces Insight-180 stepRunId guard explicitly (in addition to the function-entry check); credential scrubber extended to handle file paths (path itself + content for write payloads) |
| `src/engine/harness-handlers/bridge-dispatch.test.ts` | **Modify**: tests for each new payload kind dispatching, scrubber redaction on credential-shaped paths, stepRunId-guard-rejects-write |
| `src/engine/bridge-server.ts` | **Modify**: add inbound frame handler for `file.watch.event` notifications; route to consumer's SSE stream if subscribed |
| `packages/web/components/blocks/file-content-block.tsx` | **Create or Modify** (existing if other context provides one): renders a `file.read` result inline in chat (path header + content, with truncation indicator if applicable) |
| `packages/web/components/bridge/OpenFileButton.tsx` | **Create**: example consumer of `CapabilityGatedButton` for `file.read`; takes a path; on click dispatches and renders result via FileContentBlock |
| `docs/architecture.md` | **Modify** at line 432: extend bridge paragraph with one sentence about file capability family (citing this brief). The cross-cutting "External Integrations" section may also gain a "local-via-bridge" sub-pattern note if the reviewer agrees this is significant enough |
| `docs/landscape.md` | **Modify**: add chokidar entry under bridge runtime dependencies (sibling to `ws`, `jsonrpc-lite`); add tinyglobby (or note fast-glob alternative) |
| `docs/dictionary.md` | **Modify**: add entries for "Allowed Roots" (the daemon-side opt-in mechanism) and "File Operation Capability" |
| `drizzle/...` | **No schema changes.** Existing `harness_decisions.reviewDetails.bridge` shape accommodates non-exec payloads with the discriminated kind |

## User Experience

- **Jobs affected:** **Capture** (cloud Self can read project context directly; user no longer pastes file contents into chat); **Define** (Self can write generated config / scaffolding directly to user's filesystem under supervision); **Orient** (workspace surfaces "watching folder X for changes" status when relevant)
- **Primitives involved:** `CapabilityGatedButton` (consumer); `FileContentBlock` (new ContentBlock type — likely 28th → 29th, verify count); existing trust-gate review surface for `file.write` approvals
- **Process-owner perspective:**
  - First time: operator pairs a Mac, edits `~/.ditto/bridge-roots.json` to include `~/code/` and `~/Documents/Ditto/`, restarts the daemon, sees in Devices view: "file.read, file.write, file.glob, file.grep, file.watch — allowed roots: 2"
  - In chat with Self: "Read the README of my ditto project" → Self uses `file.glob` to find it, then `file.read` to load it — under supervised trust, the operator approves once via review queue (quick, low-friction); per-project trust uplift makes future reads autonomous within that project
  - Self proposing a file write: "I'd like to write this updated config to `~/code/myproj/config.yaml`" → renders a review card showing the diff (existing review surface) — operator approves → write happens → confirmation block renders
  - Operator wants to watch a folder: "Tell me when builds complete in `~/code/myproj/build/`" → Self sets up `file.watch`, the running watcher surfaces in Status Strip with a "watching" indicator
- **Interaction states:**
  - File read result: success (FileContentBlock renders); too-large (error block with file size); not-in-roots (error block); read failure (error block with system error)
  - File write: pending review (review-card block); approved (success block with bytes-written); rejected (rejection block with reason)
  - File watch: subscribed (status indicator); event received (toast or chat block, depending on consumer wiring); unsubscribed (silent)
- **Designer input:** Not formally invoked. The new ContentBlock (FileContentBlock) follows existing block patterns. If post-build review reveals file-write review needs richer diff visualization (3-pane diff?), Designer follow-up flagged.

## Acceptance Criteria

1. [ ] `BridgePayload` discriminated union extended with five new kinds in `packages/core/src/bridge/file-types.ts`; each typed; barrel-exported
2. [ ] Five new daemon handlers implement `BridgeHandler<P, R>` interface (per Brief 235); registered in `createDaemonRegistry()` only if `~/.ditto/bridge-roots.json` exists
3. [ ] `file-roots.ts` `resolveAndValidate(root, requestedPath)` rejects: absolute paths outside roots, `..`-traversal escaping roots, symlinks resolving outside roots. Verified by unit tests for each case
4. [ ] `file.read` of a 5MB file returns `error: "file-too-large"` with size; <4MB returns content (UTF-8 by default; base64 if binary detected via null-byte presence in first 8KB)
5. [ ] `file.write` daemon handler creates parent directories if `createParents: true` is set in payload; refuses if `createParents: false` (default) and parent missing
6. [ ] `file.glob` returns ≤1000 paths; sets `truncated: true` if more matches existed; respects allowed-root scoping
7. [ ] `file.grep` returns ≤500 matches with `{ path, line, column, preview }`; sets `truncated: true` + `totalCount` if more existed
8. [ ] `file.watch` returns `subscriptionId`; subsequent `file.watch.event` notifications carry that id + `{ path, event: "added" | "changed" | "removed" }`; events throttled to ≤10/sec/subscription with overflow coalesced into a "many-changes" event
9. [ ] `file.watch.cancel` (or generic `cancel` JSON-RPC method) tears down the watcher; subsequent events for that subscriptionId are not emitted
10. [ ] On WebSocket disconnect, daemon tears down all active watchers for that connection (verified by unit test of daemon close handler)
11. [ ] Cloud-side `bridge-dispatch.ts` `buildReviewDetailsBridge` is converted from `if (payload.kind === "exec") { ... } else { ... }` (line 179) to an exhaustive `switch (payload.kind) { ... }` with TypeScript exhaustiveness check (`const _exhaustive: never = payload`). Each new file kind gets its own case; the existing `tmuxSession` case is moved into a `case "tmux.send"` branch. **This prevents silent miscategorization of new payloads in audit rows** (Reviewer CRIT-5)
12. [ ] Existing dispatcher-level `stepRunId` guard (`bridge-dispatch.ts:212-218`) continues to enforce on every dispatch including `file.write`; no per-handler secondary check (per Reviewer IMP-10 — existing guard is the single chokepoint, secondary checks would drift). A test verifies the dispatcher guard fires for `file.write` payloads specifically
13. [ ] Credential scrubber extended: file paths matching credential-shaped patterns (`/.ssh/`, `/.aws/`, `/.gcp/`, `/credentials`, `/.env`, `/.npmrc`, `/.docker`) are scrubbed in `harness_decisions.reviewDetails.bridge.path`; write payload content is not auto-scrubbed but flagged with a `contentMayContainSecrets: true` heuristic if the same patterns appear
13. [ ] `docs/landscape.md` has a chokidar entry (and tinyglobby or alternative) under bridge runtime dependencies
14. [ ] `docs/architecture.md` line 432 paragraph extended with file-capability sentence; `docs/dictionary.md` has Allowed Roots and File Operation Capability entries
15. [ ] `OpenFileButton` example component exists (consumer of `CapabilityGatedButton` for `file.read`); end-to-end smoke verifies its enable-on-online behavior + dispatch + result rendering
16. [ ] `pnpm run type-check` + `pnpm test` pass (existing tests unchanged; new tests added per the file list)
17. [ ] AC for Insight-180 audit: a unit test confirms `file.write` dispatcher rejects when called without `stepRunId` (except in `DITTO_TEST_MODE`)

## Review Process

1. Spawn review agent with: this brief, Briefs 235 + 236 (substrate), ADR-044, parent Brief 234, `docs/architecture.md`, `docs/insights/017-security-is-architectural-not-a-role.md`, `docs/insights/180-steprun-guard-for-side-effecting-functions.md`, `docs/review-checklist.md`
2. Review agent specifically checks:
   - Path-traversal tests are exhaustive — `..` escaping, absolute paths, symlinks following INTO and OUT of allowed roots, race conditions between resolve and read
   - Allowed-roots opt-in is genuinely opt-in — no fallback to "user's home directory" or "current working directory" if config absent
   - `file.write` Insight-180 guard is enforced at function entry AND at dispatcher entry (defense in depth)
   - Credential scrubber's path-pattern list is comprehensive (covers `.ssh`, `.aws`, `.gcp`, `.env`, `.npmrc`, `.docker`, common cloud creds locations)
   - Watcher cleanup on disconnect is robust against multiple connection drops + reconnects (no zombie watchers, no leaked file descriptors)
   - chokidar entry in `docs/landscape.md` is properly evaluated, not just dropped in
   - The new ContentBlock count update propagates everywhere it's referenced
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type-check + unit tests
pnpm run type-check
pnpm vitest run packages/bridge-cli/src/handlers/file-roots.test.ts
pnpm vitest run packages/bridge-cli/src/handlers/file-read.test.ts
pnpm vitest run packages/bridge-cli/src/handlers/file-write.test.ts
pnpm vitest run packages/bridge-cli/src/handlers/file-glob.test.ts
pnpm vitest run packages/bridge-cli/src/handlers/file-grep.test.ts
pnpm vitest run packages/bridge-cli/src/handlers/file-watch.test.ts
pnpm vitest run src/engine/harness-handlers/bridge-dispatch.test.ts

# Integration smoke (requires Briefs 235 + 236 shipped + a paired daemon)
# 1. Configure roots
cat > ~/.ditto/bridge-roots.json <<'EOF'
{
  "roots": [
    { "path": "/Users/<you>/code", "name": "code" },
    { "path": "/Users/<you>/Documents/Ditto-test", "name": "ditto-test" }
  ]
}
EOF
chmod 600 ~/.ditto/bridge-roots.json

# 2. Start daemon
ditto-bridge start

# 3. Verify capabilities advertised
curl http://localhost:3000/api/v1/bridge/devices | jq '.[] | .capabilities'
# Expect: includes file.read, file.write, file.glob, file.grep, file.watch
#         each with metadata.allowedRoots populated

# 4. End-to-end via chat
# In workspace chat: "Read /Users/<you>/code/ditto/README.md"
# Expect: Self dispatches file.read, review-queue card if supervised
# Approve. File contents render in chat as FileContentBlock.

# 5. Negative: attempt out-of-root read
# In chat: "Read /etc/passwd"
# Expect: dispatcher resolves, daemon rejects with path-not-in-allowed-roots
# error block renders, no read happens

# 6. Watch test
# In chat: "Watch /Users/<you>/code/ditto/test-output for new files"
# Touch a file in that path: touch ~/code/ditto/test-output/foo.txt
# Expect: watch.event arrives within 1s; chat surfaces the new file

# 7. Insight-180 enforcement
pnpm vitest run src/engine/harness-handlers/bridge-dispatch.test.ts -t "file.write rejects without stepRunId"
# Expect: PASS
```

## After Completion

1. Update `docs/state.md` — Brief 237 shipped, parent Brief 234 progress: 3/4 sub-briefs complete
2. Move `docs/briefs/237-file-operations-handler.md` → `docs/briefs/complete/`
3. Run brief retrospective:
   - Did path-traversal tests catch real edge cases, or were they superficial?
   - Did `file.write` find the right friction balance — supervised default felt right, or too noisy?
   - Did chokidar perform acceptably for the `file.watch` case, or are there flap/event-loss issues?
   - Did the `OpenFileButton` example consumer demonstrate `CapabilityGatedButton` reuse cleanly?
4. Phase update: parent Brief 234 row shows "3/4 sub-briefs complete"; Brief 238 may already be in flight (parallel-safe with 237) or up next
5. Future-brief candidates to flag:
   - **Destructive file ops** (`file.delete`, `file.move`) — separate brief once read/write/search is shaken out
   - **`file.open` (open in Finder / default app)** — adjacent capability with different shape
   - **Editor integration** ("Open in VS Code / Cursor") — launcher work
   - **Watcher subscription multiplexing** — optimization once usage patterns are known
   - **Per-file ACL** — only if real abuse cases emerge
