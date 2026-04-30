# Brief 238: Claude CLI Session Handler

**Date:** 2026-05-01
**Status:** **deferred — pending Anthropic ToS clarification (Reviewer CRIT-6, 2026-05-01)**
**Depends on:** Brief 235 (Handler Registry + Capability Advertisement), Brief 236 (Paired-Device Awareness + UI Capability Gating)
**Parallel-safe with:** Brief 237 (File Operations Handler)
**Unlocks:** Cloud Self LLM calls billed against the operator's Claude Max subscription (when a paired device with `claude-cli.session` capability is online); foundation for future "always prefer local LLM when available" cost-optimization phase

---

## Deferral notice (added 2026-05-01 post-Reviewer pass)

This brief is **deferred from the Bridge Capability Layer phase (Brief 234)** pending resolution of the Anthropic Max ToS interpretation flagged in §Open Questions Q1. The Reviewer (separate-context pass, 2026-05-01) escalated this from "human decision" to CRITICAL, noting:

> Insight-158 explicitly notes every other tool in the ecosystem (OpenClaw, Cursor, Continue, Windsurf, Cody) switched to BYOK after the Anthropic ban. Ditto deliberately not switching is asymmetric exposure. The cautious read (Interpretation B / ship-behind-flag) is the responsible default for a product Ditto bills users for.

The substrate this brief depends on (Briefs 235, 236) plus Brief 237 (file operations) ship as the Bridge Capability Layer phase without this brief. The capability-surface architecture is independently valuable for file operations, watchers, future OS-integrated capabilities — local-LLM-via-bridge is one possible consumer among many.

**Re-entry conditions:**
1. Anthropic clarifies third-party orchestration of locally-authenticated Claude CLI is permitted under Max terms, OR
2. Ditto's Anthropic relationship gives explicit go-ahead, OR
3. The brief is restructured to ship behind `DITTO_BRIDGE_LLM_ENABLED=false` flag with explicit operator self-attestation language and only enabled in operator's own personal-use deployment (no multi-tenant cost-shifting)

Until any of those resolves, the brief stays in `docs/briefs/` (not in `docs/briefs/complete/`) as a designed-but-not-built artifact.

---

## Original brief content (preserved for re-entry)


## Goal

- **Roadmap phase:** Phase 9 — Bridge Capability Layer (sub-brief #4 of Brief 234)
- **Capabilities:** New daemon handler `claude-cli.session` that streams `claude -p` completions back to the cloud; new cloud-side `LocalClaudeProvider` implementing the existing `LLMProvider` interface; routing heuristic that prefers local-via-bridge when available + caller doesn't explicitly opt out

## Context

Insight-158 documents Anthropic's February 2026 ban on third-party use of Max-subscription OAuth tokens (enforced April 2026). The cloud Ditto deployment cannot use the operator's Max subscription — it needs an Anthropic API key (separate billing, per-token).

But the operator's Max subscription IS addressable from one place: an authenticated `claude` CLI installed on their machine. Brief 212's bridge daemon already runs on that machine; ADR-044 establishes the bridge as the capability surface; Briefs 235 + 236 give us the substrate (handler registry, capability advertisement, paired-device awareness, UI gating).

This brief closes the loop: a `claude-cli.session` handler on the daemon spawns `claude -p` (Claude Code's print-mode invocation) and streams stdout back as a structured token stream. On the cloud, a `LocalClaudeProvider` implements the existing `LLMProvider` interface (the same shape as `AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`) and is injected into the multi-provider routing layer (`src/engine/llm.ts`, ADR-026).

When this ships, cloud Ditto's LLM calls — Self conversation, briefings, memory ops, lightweight planning — can be served by the operator's locally-authenticated Claude CLI, billed against Max. When the device is offline, the existing API-key path takes over transparently. The operator never thinks about it; the router picks the cheapest available compute.

## Objective

Implement the `claude-cli.session` daemon handler with structured streaming output, the matching cloud-side `LocalClaudeProvider` adapter slotted into the existing multi-provider routing layer, and a configurable routing heuristic ("prefer local when available, fall back to cloud") that can be controlled at three levels: deployment-default env var, per-process YAML hint, per-call programmatic override.

## Non-Goals

- **No multi-message conversation state on the daemon side.** Each `claude-cli.session` dispatch is a one-shot prompt → completion pair. The full conversation lives on the cloud side (in the Self/process context); the bridge call is stateless from the daemon's perspective. This matches `claude -p`'s native model.
- **No tool-use streaming through the bridge in this brief.** `claude -p`'s tool-use semantics (when claude itself wants to call tools mid-completion) are out of scope. Cloud Self's tool calls happen on the cloud side, before/after the LLM call, not as nested invocations.
- **No model selection within `claude` CLI.** Whatever model the operator's Claude CLI is configured to use, that's what gets used. No `--model` injection from the cloud (would require knowledge of the operator's available subscription tier; out of scope).
- **No fallback automation across devices.** If the primary device's `claude-cli.session` dispatch fails, the cloud falls back to the API-key path. No "try the next paired device with this capability" — single attempt, then fallback to API.
- **No streaming-in-streaming (`claude -p` mid-completion changes).** Stream is one-way: prompt in, tokens out. Cancel via existing cancel JSON-RPC method (terminates the subprocess).
- **No conversation memory persistence on the daemon.** The daemon does not remember previous sessions, doesn't maintain a Claude conversation file, doesn't keep stdin alive. Each call is fresh.
- **No `claude` CLI version detection / capability negotiation in this brief.** The operator must have a recent-enough `claude` CLI; if `--print` mode flags differ, surface the error and require operator update. Future brief may add version-detection if the friction proves real.
- **No prompt-template injection or system-prompt management.** The cloud sends the full prompt; daemon passes it verbatim to `claude -p`. No daemon-side prompt manipulation.
- **No integration with cloud-side metacognitive-check / outbound-quality-gate.** Those handlers operate on the LLM completion result regardless of which provider produced it. The provider abstraction makes this transparent.
- **No cost tracking per-provider.** Future-brief work; the provider abstraction supports it but this brief doesn't add cost-attribution UI or telemetry.
- **No CLI-binary discovery / install help.** If `claude` is not on the daemon's PATH, the handler refuses to register the capability. The operator sees "no `claude-cli.session` capability" in Devices view and is responsible for installing the CLI.

## Inputs

1. `docs/briefs/235-bridge-handler-registry.md` — handler interface
2. `docs/briefs/236-paired-device-awareness.md` — capability availability hook (used by routing heuristic)
3. `docs/briefs/234-bridge-capability-layer-phase.md` — parent phase brief
4. `docs/adrs/044-local-client-capability-surface.md` — capability surface decision; §4 follow-up "LLM routing heuristic" called out as resolved here
5. `docs/insights/158-ditto-provides-the-llm.md` — context for why this brief exists; the Max-OAuth ban
6. `docs/adrs/026-multi-provider-purpose-routing.md` — multi-provider architecture; `LLMProvider` interface; routing layer
7. `src/engine/llm.ts` — `LLMProvider` interface, `getActiveProvider()`, `createCompletion`, `createStreamingCompletion`
8. `src/engine/llm-stream.ts` — streaming + CLI vs. provider routing (the `claude-cli` connection method already exists for the local-builder dogfooding case; this brief adds a network-mediated cousin)
9. `src/adapters/cli.ts` — reference for how `claude -p` is invoked locally (used for reference; bridge dispatch replaces direct subprocess)
10. `packages/bridge-cli/src/handlers/exec.ts` — reference handler shape; subprocess streaming pattern
11. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — LLM calls have ambiguous Insight-180 status (internal compute vs. billable side effect); rationale below
12. `claude` CLI docs — `claude -p --output-format stream-json` invocation

## Constraints

- **Use `claude -p --output-format stream-json` (or its current stable equivalent) — not interactive mode.** The daemon does not maintain a stdin-attached `claude` session; each call is a fresh subprocess with the prompt as `-p` input.
- **Output parsing must handle `stream-json` format faithfully.** Each line is a JSON object with `{ type, data, ... }`; the daemon parses and emits structured `claude.token` notifications matching the cloud-side LLM stream interface.
- **Subprocess lifecycle:** spawn → stream stdout/stderr → exit. Exit code != 0 = error frame. Stderr is captured and surfaced in the error frame's `errorMessage`. Cancel via existing JSON-RPC `cancel` (SIGTERM, then SIGKILL after 5s — same pattern as `exec` handler).
- **Timeout cap: 5 minutes per session.** Cloud-configurable up to 30 min. Long-running completions are unusual; cap protects against runaway subprocesses.
- **Trust class:** `autonomous`-eligible. LLM compute is in-band — the cloud is going to make the LLM call somewhere; whether it goes via API key or bridge is a routing decision, not a trust decision. The harness's existing trust gates (around what Self does WITH the completion) remain unchanged.
- **Insight-180 stance:** an LLM call is internal compute (no external mutation), not a side effect in the Insight-180 sense. The `LocalClaudeProvider.createCompletion()` does NOT require `stepRunId`. The dispatcher path (`dispatchBridgeJob`) DOES require it — but that's because dispatching ANY bridge job goes through the harness pipeline. Document this rationale explicitly in the brief because LLM-as-side-effect is a borderline call: it bills money externally (Max subscription consumption is a real-world side effect from a billing perspective). Decision: bill-as-side-effect is captured in the existing audit row (`harness_decisions`) via the dispatcher; no additional `stepRunId` enforcement layer needed because the dispatcher's existing guard covers it.
- **Engine-product split:** `LocalClaudeProvider` lives in `src/engine/llm-providers/local-claude-via-bridge.ts` (product — couples to bridge dispatch infrastructure). The wire types for `claude.token` notifications live in `@ditto/core/src/bridge/claude-cli-types.ts` (engine — ProcessOS-equivalent could host the same daemon).
- **Routing heuristic precedence (highest wins):**
  1. Per-call programmatic override: `createCompletion({ ..., providerHint: "local" | "cloud" })` — explicit caller intent
  2. Per-process YAML hint: `process.config.llm.routePreference: "local" | "cloud" | "auto"` — process-level policy
  3. Deployment env var: `DITTO_LLM_ROUTE_PREFERENCE = "local" | "cloud" | "auto"` (default `auto`)
  - `auto` means: use local IF a paired device with `claude-cli.session` is online AND the caller hasn't explicitly opted out
  - `local` means: use local; if unavailable, fall back to cloud (existing API-key path)
  - `cloud` means: use cloud; never route through bridge
- **Routing decision is per-call, not per-session.** A long Self interaction may have some LLM calls served local, others cloud, depending on bridge availability at the time of each call. No "pin the conversation to one provider" semantic.
- **Fallback is automatic + transparent.** If `LocalClaudeProvider.createCompletion()` fails for ANY reason (device offline mid-call, subprocess crashed, claude CLI not found, parse error), the router catches the failure and re-issues against the next-preferred provider (typically `AnthropicProvider`). The caller doesn't see the local attempt failed; only metrics + audit reflect it.
- **Streaming semantics match `createStreamingCompletion`.** Tokens arrive as async-generator yields with the same `{ type, content, role, ... }` shape as the existing Anthropic provider's stream. Consumers shouldn't need to care which provider produced the stream.
- **Audit completeness:** every `LocalClaudeProvider` call records in `harness_decisions` with `kind: "claude-cli.session"`, prompt size in tokens (estimated), completion size in tokens (counted), exit reason, fallback-occurred flag.
- **No prompt logging in cleartext audit.** The audit row stores prompt token-count, not prompt content (consistent with existing provider audit behavior). Content lives in step run inputs/outputs as usual.
- **Side-effect invocation guard:** `dispatchBridgeJob` already enforces `stepRunId` per Insight-180; the `LocalClaudeProvider` flow goes through `dispatchBridgeJob`, so the guard is honored transitively. No additional guard inside `LocalClaudeProvider` itself (would be duplicative).
- **Capability metadata advertises `claude` CLI version (best-effort).** On daemon startup, the `claude-cli.session` handler runs `claude --version` once and includes the version string in capability metadata: `{ method: "claude-cli.session", version: "1.0.0", trustTier: "autonomous", metadata: { claudeCliVersion: "x.y.z" } }`. The cloud surfaces this in Devices view for operator awareness.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `claude -p --output-format stream-json` invocation | Claude Code Headless SDK docs (`docs.claude.com/en/docs/claude-code/sdk-headless`) | depend | Anthropic-published canonical pattern for scripted Claude CLI usage. Already used in `src/engine/llm-stream.ts` for the local-builder `claude-cli` connection method |
| `LLMProvider` interface adoption | Existing Ditto `src/engine/llm.ts` (per ADR-026) | adopt | Already in production for Anthropic/OpenAI/Google providers; LocalClaudeProvider implements the same interface. Zero new abstraction |
| Local subprocess as LLM provider | Continue.dev (`continuedev/continue`) — `core/llm/llms/Ollama.ts` subprocess pattern | pattern | Continue's local-Ollama adapter is the closest precedent for "local subprocess = LLM provider"; we adopt the streaming-stdout-as-tokens pattern but route through bridge dispatch instead of direct subprocess (because the daemon is on a different machine than the cloud) |
| Routing heuristic with three precedence levels | Anthropic SDK provider routing (env > config > param) + standard 12-factor app config precedence | pattern | The "env default, config override, programmatic override" stack is the conventional shape for service routing. No new pattern |
| Stream-JSON parsing on subprocess stdout | Vercel AI SDK streaming text response (`ai-sdk` core); existing Ditto `llm-stream.ts` parser | adopt | Matches what we already do for the local `claude-cli` connection method; bridge wrap reuses the parsing logic |
| Automatic provider fallback on failure | `bullmq` retry-with-fallback patterns; existing Ditto provider error handling | pattern | Standard try-next-on-fail wrapper; no library, just wrap the existing provider list iteration with the routing heuristic |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/bridge/claude-cli-types.ts` | **Create**: payload type `BridgeClaudeCliSessionPayload` (`{ kind: "claude-cli.session"; prompt: string; timeoutMs?: number }`); notification frame `BridgeClaudeTokenFrame` (`{ kind: "claude-token"; jobId; type; content; ... }`); result frame extension for completion-final summary |
| `packages/core/src/bridge/types.ts` | **Modify**: extend `BridgePayload` discriminated union with `claude-cli.session` kind |
| `packages/core/src/bridge/index.ts` | **Modify**: barrel-export new types |
| `packages/bridge-cli/src/handlers/claude-cli-session.ts` | **Create**: handler implementation; spawns `claude -p --output-format stream-json <prompt>`; parses stdout line-by-line as JSON; emits `claude.token` notifications per token / event; final result frame on subprocess exit |
| `packages/bridge-cli/src/handlers/claude-cli-session.test.ts` | **Create**: unit tests (with mocked subprocess) for token streaming, error handling, timeout, cancel |
| `packages/bridge-cli/src/registry.ts` | **Modify**: register `claude-cli.session` handler ONLY if `claude --version` succeeds at startup; advertise version in capability metadata |
| `packages/bridge-cli/README.md` | **Modify**: add section "Local Claude CLI Capability" explaining the optional dependency on `claude` being installed + authenticated |
| `src/engine/llm-providers/local-claude-via-bridge.ts` | **Create**: `LocalClaudeProvider` implementing `LLMProvider` interface; `createCompletion` / `createStreamingCompletion` dispatch via `dispatchBridgeJob({ kind: "claude-cli.session", ... })`; assemble streaming response from `claude.token` frames; handle errors with structured failure types |
| `src/engine/llm-providers/local-claude-via-bridge.test.ts` | **Create**: unit tests with mocked dispatch; success path, fallback-on-error path, cancel-mid-stream path |
| `src/engine/llm.ts` | **Modify**: add `LocalClaudeProvider` to provider registry; extend `getActiveProvider(hint?)` with routing-heuristic logic (per-call hint → per-process config → env var → default) |
| `src/engine/llm.test.ts` | **Modify**: add tests for routing heuristic at all three precedence levels; fallback-from-local tests |
| `src/engine/llm-stream.ts` | **Modify**: route streaming completions through the same provider selection; ensure existing `claude-cli` connection method (local-builder direct subprocess) is NOT broken — these are different code paths (`DITTO_CONNECTION=claude-cli` is local-only; this brief's `LocalClaudeProvider` is the network-mediated cousin) |
| `processes/templates/example-using-local-llm.yaml` (optional, illustrative) | **Create or skip**: small example process YAML showing `config.llm.routePreference: "local"` — purely illustrative; can be skipped if no clear use case at brief time |
| `.env.example` | **Modify**: add `DITTO_LLM_ROUTE_PREFERENCE=auto # local | cloud | auto` with comment explaining the precedence stack |
| `docs/architecture.md` | **Modify**: §Tech Stack — Model Routing by Purpose section (line 1144) gets one paragraph noting the bridge-mediated local provider option; cite this brief and ADR-044 |
| `docs/dictionary.md` | **Modify**: add entries for "LocalClaudeProvider", "Local LLM Routing", "Routing Heuristic" |
| `docs/landscape.md` | **Modify**: extend the Anthropic SDK row (or add a sibling row) to note the local-CLI-via-bridge option as an alternative path; cite this brief |
| `src/engine/harness-handlers/bridge-dispatch.ts` | **Modify**: add the `claude-cli.session` payload kind to the dispatcher switch; credential-scrub the `prompt` field via the existing scrubber (prompts may contain leaked secrets) |
| `src/engine/bridge-server.ts` | **Modify**: add inbound frame handler for `claude.token` notifications; route to the `LocalClaudeProvider`'s waiting completion via existing job-id correlation map |
| `docs/insights/NNN-llm-routing-heuristic-precedence.md` | **Create (likely)**: capture the three-level precedence stack as a reusable insight if it ossifies; depends on whether the heuristic feels load-bearing post-implementation |

## User Experience

- **Jobs affected:** None directly user-facing. **Cost-affecting** (operator's API bill drops when local is in use; Max subscription bill rises). Surfaces in the Devices view (capability chip "claude-cli.session vX.Y.Z").
- **Primitives involved:** None new. The cost surface (post-call telemetry "served by [provider]") is out of scope here; future brief.
- **Process-owner perspective:**
  - First time: operator installs `claude` CLI on their Mac (separate; not Ditto's job to install), authenticates via `claude` to their Max account, restarts `ditto-bridge`. Devices view now shows the chip "claude-cli.session" with the CLI version
  - Cloud Self conversations transparently use local Claude when available. The operator sees no UX change but their Anthropic API console shows reduced usage; their Max usage rises
  - Operator unplugs the Mac (lid closed): cloud Self continues working seamlessly via API key. No interruption, no error.
  - Operator can override per-process or per-call if they want to force cloud (e.g., for a long-running autonomous process they want to serve via API even when local is online)
- **Interaction states:** Largely invisible. Only visible state is the Devices view chip + (out-of-scope) future cost telemetry surface
- **Designer input:** Not invoked. No new UI surface in this brief beyond a capability chip already added by Brief 236

## Open Questions (HUMAN APPROVAL REQUIRED before build)

**Q1 — Anthropic Max ToS interpretation.** Insight-158 establishes that Anthropic banned third-party tools from using Max-subscription OAuth tokens (Feb 2026, enforced Apr 2026). This brief's mechanism does NOT exfiltrate the OAuth token — the operator's `claude` CLI runs on the operator's own machine using the operator's own session, with cloud Ditto orchestrating *when* to invoke it. Output streams back; the token never leaves the operator's machine.

Two reasonable interpretations:
- **Interpretation A (likely permitted):** This is "remote keyboard" semantics — equivalent to the operator typing `claude -p ...` in a terminal at the cloud's request. The OAuth token is not handled by Ditto. Comparable to a developer running their own scripts on their own machine that happen to be triggered by a cron job.
- **Interpretation B (potentially restricted):** Anthropic's intent likely covers any third-party orchestration that consumes Max-subscription compute for the orchestrator's purposes, not just direct OAuth handling. The cloud routes work to local Max as a deliberate cost-shifting strategy; this is the kind of arbitrage the ToS likely targets.

**Architect default:** Interpretation A is defensible and worth shipping if the human concurs. Interpretation B is the cautious read.

**Decision required from human:**
- Approve Interpretation A → proceed with build
- Approve Interpretation B → pause this brief; the bridge can still ship file ops (Brief 237) and the rest of the capability layer; LLM-via-bridge waits for Anthropic to clarify
- Approve "ship behind a flag" → build but ship feature-flagged off by default; opt-in only after operator self-attests they understand the ToS posture

This is the single load-bearing decision in the brief; the implementation is straightforward.

**Q2 — Routing heuristic default value.** The brief proposes `DITTO_LLM_ROUTE_PREFERENCE=auto` as default, where `auto` means "local when available, else cloud". An alternative default is `cloud` ("never route through bridge unless explicitly opted in"), making local LLM an opt-in surprise rather than an automatic cost optimization. **Architect default: `auto`.** Decision required from human.

## Acceptance Criteria

1. [ ] `BridgeClaudeCliSessionPayload`, `BridgeClaudeTokenFrame`, and supporting types exist in `packages/core/src/bridge/claude-cli-types.ts`; `BridgePayload` discriminated union extended with `claude-cli.session` kind; barrel-exported
2. [ ] Daemon-side `claude-cli-session.ts` handler spawns `claude -p --output-format stream-json` with the prompt; parses each stdout line as JSON; emits `claude.token` notifications via the hooks-injected stream sender
3. [ ] On subprocess exit, handler emits a final result frame with exit code, total tokens emitted, duration. Exit code != 0 produces error frame with stderr captured in `errorMessage`
4. [ ] Cancel via JSON-RPC `cancel` method terminates the subprocess (SIGTERM, SIGKILL after 5s)
5. [ ] Daemon registers the `claude-cli.session` handler ONLY if `claude --version` succeeds at startup; capability metadata includes the version string. If `claude` is absent or fails to invoke, handler is silently skipped — no crash, capability omitted
6. [ ] `LocalClaudeProvider` exists in `src/engine/llm-providers/local-claude-via-bridge.ts`; implements both `createCompletion` and `createStreamingCompletion` of the existing `LLMProvider` interface
7. [ ] `LocalClaudeProvider.createCompletion` dispatches via `dispatchBridgeJob({ kind: "claude-cli.session", ... })` and assembles the response from streamed `claude.token` frames; respects timeout
8. [ ] `LocalClaudeProvider` returns a structured failure (not a thrown exception) when the dispatch fails for any reason; the router catches the failure and falls back to the next provider transparently — caller sees one completion, not "first attempt failed, try again" semantics
9. [ ] Routing heuristic in `getActiveProvider(hint?)` honors precedence: per-call `providerHint` → per-process `config.llm.routePreference` → `DITTO_LLM_ROUTE_PREFERENCE` env var → default (`auto`); when `auto` + paired device with `claude-cli.session` online → `LocalClaudeProvider`; when offline → `AnthropicProvider` (or configured default). Verified by integration test covering all three precedence levels
10. [ ] Mid-stream device disconnect: in-flight stream cleanly errors, router re-issues against fallback provider, partial output discarded. Verified by integration test
11. [ ] `harness_decisions` rows for bridge-mediated LLM calls record `kind: "claude-cli.session"`, prompt token-count, completion token-count, exit reason, `fallbackOccurred` flag. Verified by audit-row inspection in tests
12. [ ] Credential scrubber extended to scrub the `prompt` payload field (best-effort) — existing scrubber pattern list applied; prompt content is NOT logged in cleartext audit (only token-counts persist)
13. [ ] `.env.example` documents `DITTO_LLM_ROUTE_PREFERENCE`; `docs/architecture.md` line 1144 paragraph extended; `docs/dictionary.md` has new entries; `docs/landscape.md` extended re: Anthropic SDK row
14. [ ] `pnpm run type-check` + `pnpm test` pass; existing `DITTO_CONNECTION=claude-cli` local-builder direct-subprocess path remains unchanged (verified by existing tests passing without modification)
15. [ ] If Q1 resolution is "ship behind a flag": handler registration AND `LocalClaudeProvider` participation in routing are both gated on `DITTO_BRIDGE_LLM_ENABLED=true` env var; when unset, both are inert. Test coverage for both flag positions

## Review Process

1. Spawn review agent with: this brief, Briefs 235 + 236 (substrate), ADR-044, ADR-026 (multi-provider), parent Brief 234, `docs/architecture.md`, `docs/insights/158-ditto-provides-the-llm.md`, `docs/insights/180-steprun-guard-for-side-effecting-functions.md`, `docs/review-checklist.md`
2. Review agent specifically checks:
   - The two `claude-cli` paths (existing local-builder direct subprocess via `DITTO_CONNECTION=claude-cli`, vs. this brief's network-mediated `LocalClaudeProvider`) are clearly distinct in code AND in documentation. No path-aliasing, no accidental sharing of identifier names that conflict
   - Routing heuristic's three precedence levels are testable independently; default `auto` behaves as documented; explicit `cloud` never routes through bridge regardless of availability
   - Fallback is genuinely transparent — caller sees one completion, not "first attempt failed, try again" semantics
   - Insight-180 reasoning is documented inline in `LocalClaudeProvider` (why no `stepRunId` parameter on the provider interface, given the dispatcher already enforces it)
   - Credential scrubbing on prompt content is best-effort but explicit; prompt content is NOT logged in cleartext audit
   - Anthropic policy compliance: the bridge handler invokes the operator's locally-authenticated `claude` CLI; the cloud never sees the OAuth token; Anthropic's terms-of-service stance about third-party tool use of Max OAuth applies to the OAuth token, NOT to "the cloud orchestrates the user's local CLI on the user's machine" — verify this interpretation with the human before shipping
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Pre-req: claude CLI installed and authenticated to a Max account on the daemon machine

# Type-check + unit tests
pnpm run type-check
pnpm vitest run packages/bridge-cli/src/handlers/claude-cli-session.test.ts
pnpm vitest run src/engine/llm-providers/local-claude-via-bridge.test.ts
pnpm vitest run src/engine/llm.test.ts

# Integration smoke (Briefs 235 + 236 shipped + paired daemon + claude CLI installed)
ditto-bridge start &

# Verify capability advertised
curl http://localhost:3000/api/v1/bridge/devices | jq '.[] | .capabilities[] | select(.method=="claude-cli.session")'
# Expect: { method: "claude-cli.session", version: "1.0.0", trustTier: "autonomous",
#           metadata: { claudeCliVersion: "X.Y.Z" } }

# Set routing preference
export DITTO_LLM_ROUTE_PREFERENCE=auto

# In workspace chat with Self: "What's 2+2?"
# Cloud logs:
#   getActiveProvider(): heuristic resolved to LocalClaudeProvider
#   LocalClaudeProvider.createCompletion: dispatching jobId X via bridge
#   bridge.dispatch: device <id> kind=claude-cli.session
#   <claude.token frames stream>
#   completion received, N tokens
# Anthropic API console: no usage from this call
# Max account: usage incremented

# Disconnect daemon (kill -9)
# In chat: "What's 3+3?"
# Cloud logs:
#   getActiveProvider(): no online device for claude-cli.session, falling back to AnthropicProvider
#   AnthropicProvider.createCompletion: ...
# Anthropic API console: usage from this call

# Reconnect daemon. In chat: "What's 4+4?"
# Cloud logs back to LocalClaudeProvider path

# Per-call override
# In chat (programmatic invocation by Self): provider hint "cloud"
# Cloud logs:
#   getActiveProvider(hint=cloud): explicit cloud, using AnthropicProvider
# Local Claude bypassed even though available

# Cancel mid-stream
# Send a long prompt, cancel before complete
# Daemon logs: SIGTERM sent to claude subprocess, exit, cleanup
# Cloud: completion errors gracefully; no zombie process
```

## After Completion

1. Update `docs/state.md` — Brief 238 shipped, parent Brief 234 progress: 4/4 sub-briefs complete; Phase complete pending phase-end Reviewer pass + Documenter wrap
2. Move `docs/briefs/238-claude-cli-session-handler.md` → `docs/briefs/complete/`
3. Run brief retrospective:
   - Did the routing heuristic feel intuitive, or did consumers want different defaults?
   - Were fallbacks transparent, or did edge cases (mid-stream disconnect) surface UX issues?
   - Did the existing `LLMProvider` interface accommodate the bridge-mediated provider cleanly, or did it strain (suggesting a future ADR)?
   - Anthropic ToS interpretation: did the implementation hold up under second-look from a legal perspective? (If not, rollback path: disable the handler, document the issue, separate brief)
4. Phase-level wrap-up (per parent Brief 234 §After Completion): Documenter pass for the whole phase
5. Likely insight to capture if not already done: "LLM Routing Heuristic Precedence" — env > config > per-call, with `auto` as the smart-default sentinel value
6. Future-brief candidates to flag:
   - **Cost telemetry per-provider** — operator-facing dashboard of "served by local vs. cloud" with cost estimates
   - **Tool-use streaming through bridge** — when Self wants to nest tool calls inside an LLM completion (currently out of scope; cloud Self handles tool calls externally)
   - **Per-device cost preferences** — "always prefer this Mac for LLM calls" if multiple paired devices have `claude-cli.session`
   - **Anthropic Max policy re-evaluation** — periodic check whether the third-party OAuth ban (Insight-158) has been lifted; if so, simpler direct-OAuth path may obsolete this brief's bridge-mediation
