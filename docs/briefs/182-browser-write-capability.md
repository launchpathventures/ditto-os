# Brief 182: Browser Write Capability (Parent)

**Date:** 2026-04-17
**Status:** ready
**Approved:** 2026-04-17 by human after two review passes
**Depends on:** ADR-005 (integration architecture), Brief 134 (Stagehand READ-only `browse_web` self-tool), `credentials` table (ADR-005 §3), `work_items` table (existing iteration primitive)
**Unlocks:** Sub-brief 183 (protocol + handler skeleton); Sub-brief 184 (session capture + scrub + trace + trust-gate wiring); Sub-brief 185 (structural fingerprinting for bulk auto-promotion); user-level processes that automate authenticated long-tail SaaS (afirmo.co.nz reconciliation, Xero/FreshBooks/MYOB UI paths where no API covers the operation, internal vendor portals, etc.)

**User-value landing point:** Sub-brief 185 is when the user's concrete use case (498-row afirmo reconciliation) becomes actually usable. 183 and 184 are infrastructure; running afirmo against 184 alone means ~2000 supervised approval prompts (498 rows × ~4 writes). The parent brief commits to shipping all three in sequence before declaring the user value delivered. See §Afirmo Ergonomic Reality below.

## Goal

- **Roadmap phase:** Phase 9 adjacent — Network Agent Continuous Operation currently active; this capability is orthogonal infrastructure (not gated on Phase 9 closure) that extends Alex's action surface beyond email/channel/API to arbitrary authenticated web UIs.
- **Capabilities:** (a) a `browser` integration protocol in the registry, (b) authenticated session capture + vaulted persistence, (c) trust-gated per-action browser writes traversing the harness the same way integration calls already do, (d) replay-grade audit artefacts per run, (e) (Sub-brief 184) structural fingerprinting so bulk identical-pattern rows can auto-promote through the trust tier after N supervised approvals.

## Context

Ditto today automates work reachable through APIs, CLIs, MCP servers, or email. Research (`docs/research/authenticated-saas-browser-automation.md`) was prompted by a concrete user ask: 498 expenses on afirmo.co.nz — a NZ vertical accounting SaaS with no public API — that need reconciling. This is not a one-off: the long tail of vertical, regional, or legacy SaaS never gets an API, and Ditto's thesis (harness + trust + process primitive) is *exactly* the right shape for "the user's own work, many repetitive clicks, per-row judgment, audit required."

The research catalogued five modalities (Stagehand WRITE mode, Anthropic Computer Use, Playwright MCP, autonomous agent libraries, record-and-replay) and five factual gaps between any library and Ditto's trust/process/audit requirements. Prior Ditto work (Brief 134) adopted Stagehand at `adopt` level but blocked writes at the tool boundary via `WRITE_INTENT_PATTERNS` — a correct choice at the time, because the trust gate had not yet been wired to browser actions.

ADR-005 declared three integration protocols (CLI, MCP, REST). Inspection reveals only `cli.ts` and `rest.ts` handlers are built; the MCP handler slot is declared but not implemented. Adopting Playwright MCP would therefore require first building a generic MCP handler — larger scope than the afirmo-level user need justifies for a first cut. **Playwright itself** is mature (`v1+`, Microsoft, multi-decade stability), fits `depend` level cleanly, and adding it as a direct protocol handler is the minimum shippable path.

**Browser is stateful in a way CLI/REST are not.** A single `BrowserContext` persists across multiple tool calls within one stepRun (navigate → wait → click → type → submit is one logical operation across ~5 handler invocations sharing the same context + session + DOM state). CLI and REST handlers are per-call stateless. This divergence matters for ADR hygiene: rather than extend ADR-005's three-protocol prose, this brief proposes a new **ADR-032 (Browser Integration Protocol)** that supersedes-in-part ADR-005's three-protocol claim and documents the state-carrying lifecycle.

This brief proposes two architectural tracks, orthogonal to each other:

1. **Integration track (engine, process-declarable):** `browser` as a fourth protocol in ADR-005, implemented via a direct Playwright handler. Deterministic tool calls (`browser.navigate`, `browser.click`, `browser.type`, `browser.select`, `browser.wait_for`, `browser.extract`, `browser.trace_save`). Sessions provided by the credential vault. Trust gate per call, same as CLI/REST. **This is what bulk reconciliation needs.**
2. **Self-tool track (Stagehand `act`/`agent`, ad-hoc, conversational):** the existing `browse_web` gains a `browse_act` sibling later for natural-language browser steering during conversation (e.g. "go check the Xero invoice and tell me what's wrong"). **Deferred out of this brief.** The integration track is the higher-priority capability because it unblocks user-scale process automation; the self-tool track is a convenience for conversational exploration.

The parent brief designs both tracks and phases the build along the integration track first.

## Objective

Ship a browser integration protocol that lets a process definition declare browser steps (navigate, click, type, extract, etc.), lets Ditto authenticate to a target site using a vaulted storageState blob the user captured once, routes every action through the existing trust gate + activity log, and produces a Playwright trace file per run for audit. Sufficient to author a `reconcile-afirmo-expense` process today at supervised trust tier; sufficient for Sub-brief 184 to add structural fingerprinting that auto-promotes identical-pattern rows.

## Afirmo Ergonomic Reality

The user's concrete need is 498 expenses reconciled. Under Sub-brief 184 (skeleton + flesh) at supervised trust tier, each row requires ~4 writes (match invoice → set category → confirm → submit), producing ~2000 approval prompts across one bulk run. **That is not a usable product.** Sub-brief 185's structural fingerprinting is what collapses 2000 prompts to ~12 (rows 1-3 supervised, rows 4-498 auto-approve on matching fingerprint, deviations escalate).

This brief commits to the phase order 183 → 184 → 185 as one deliverable. Under no circumstance should the user be directed at the afirmo task after 184 and before 185 — they will bounce off the approval queue and the system will look broken. If operationally we need to ship earlier, the acceptable stopgap is an explicit `ditto run --auto-approve-matching-pattern` flag added in 184 that the user can opt into for a single run, scoped to one process, with a visible "unsupervised mode" badge. No silent defaults.

## Non-Goals

- Not a general-purpose AI-driven browser agent in this brief. No `Stagehand.agent({ goal })` natural-language planner here; tool calls are structured. The agentic layer is Sub-brief 185 (deferred).
- Not a Stagehand write-mode wrapper. Stagehand stays READ-only via `browse_web`; writes go through the new `browser` protocol. (Sub-brief 185 may later unify the two if pressure emerges.)
- Not a generic MCP handler. Playwright MCP is evaluated and deferred; direct Playwright is simpler for the known use cases. If a second MCP server becomes necessary, build the generic handler then. No speculative abstraction (CLAUDE.md: "Three similar lines is better than a premature abstraction.")
- Not a headed-browser UX inside the workspace. Session capture uses a CLI command in v1; workspace-UI capture (streamed remote browser) is deferred.
- Not MFA/SSO automation. First login is always user-present. Session persistence handles everything after.
- Not a captcha-solving layer. If a SaaS throws a captcha mid-flow, the run pauses and escalates to the user via the existing escalation ladder (Brief 178).
- Not a scraper/crawler. Target is authenticated user-owned operations on sites the user has account access to. Robots.txt / TOS are the user's responsibility; Ditto honours abort/escalate conventions, not compliance policy.
- Not a desktop automation layer. Vision-based Computer Use is out. (Evaluated in research; deferred.) If a target app is Electron or canvas-heavy, this capability does not cover it.

## Inputs

1. `docs/research/authenticated-saas-browser-automation.md` — five-modality survey, provenance, gaps (this parent brief is that research's consumer).
2. `docs/research/linkedin-ghost-mode-and-browser-automation.md` — prior browser research (LinkedIn/DM domain). Still accurate for Stagehand READ mode.
3. `docs/adrs/005-integration-architecture.md` — the protocol pattern. This brief extends it with a fourth protocol.
4. `integrations/00-schema.yaml` — integration registry schema. Gains a `browser` interface type.
5. `integrations/google-workspace.yaml` — reference for how a service file is shaped.
6. `src/engine/integration-handlers/cli.ts` + `rest.ts` — pattern for the new `browser.ts` handler (argument resolution, retry, timeout, credential brokering, scrub).
7. `src/engine/self-tools/browser-tools.ts` — Stagehand READ path; the `WRITE_INTENT_PATTERNS` gate can stay (that's the self-tool track); this brief does not remove it.
8. `packages/core/src/db/schema.ts` §`credentials` — existing `(userId, service, encryptedValue, iv)` shape. A storageState blob is a payload variant, not a new column.
9. `packages/core/src/db/schema.ts` §`workItems` — iteration primitive for 498-row bulk runs.
10. `docs/insights/163-find-or-build-orchestration.md` — "missing capability is a build signal." Afirmo reconciliation is the archetypal find-or-build trigger.
11. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — all new side-effecting functions take `stepRunId` invocation guards.
12. `docs/insights/190-migration-journal-concurrency.md` — schema-change migration discipline (none required by this brief, but sub-briefs add tables).
13. Playwright docs — `playwright.dev/docs/auth` (storageState), `playwright.dev/docs/trace-viewer` (trace artefacts), `playwright.dev/docs/codegen` (session-capture prior art).

## Constraints

- MUST ship a new ADR-032 (Browser Integration Protocol) that supersedes-in-part ADR-005's three-protocol claim. ADR-005 stays accepted; ADR-032 layers on the stateful fourth protocol. No in-place rewrite of ADR-005 (ADR hygiene: accepted ADRs are append-only).
- MUST abstract the Playwright runtime behind a `BrowserRuntime` interface (`launch`, `createContext`, `dispose`) so a later sidecar or container runtime implementation drops in without touching call sites. In-process headless Chromium is the v1 implementation; interface shape lets Network deployment add an out-of-process backend without re-opening handler code.
- MUST NOT invent a second credential storage mechanism. storageState blobs go in the existing `credentials` table as the `encryptedValue` payload. Service name (e.g. `browser:afirmo`) discriminates.
- MUST route every browser tool call through the same integration call path (memory-assembly → step execution → trust gate → feedback-recorder) as CLI/REST calls. No harness bypass.
- MUST NOT leak authenticated cookies or storage values into LLM context under any circumstance. The handler brokers auth; the agent never sees it. Scrub handler (`src/engine/integration-handlers/scrub.ts`) must be extended to scrub storageState blobs if any slip into log output.
- MUST enforce a per-process, per-service credential scope (ADR-005 §3). A process cannot use another process's browser session unless the user explicitly binds it.
- MUST gate writes behind the trust tier. Supervised tier holds every write for approval; trusted tier runs through. (Sub-brief 184 refines with structural fingerprinting for auto-promotion of pattern-stable rows.)
- MUST record a Playwright trace artefact per stepRun when a browser tool call runs. Trace file path stored in `stepRuns.outputs` (existing field); file storage location defaults to `<DITTO_DATA>/traces/<stepRunId>.zip`. Traces are durable audit evidence for financial/compliance scenarios.
- MUST support abort mid-flow. If a step fails (timeout, unexpected DOM, captcha, navigation off-domain), the run escalates via existing failure classification (`classifyFailureType` — Brief 162 MP-7.1) and escalation ladder (Brief 178). Partial work is not rolled back automatically; the escalation carries the trace file for human review.
- MUST respect SSRF guard pattern from `browser-tools.ts:37-50` (localhost, RFC-1918, `.local`, metadata endpoints blocked by default). A per-service `allowed_domains` field in the registry overrides to whitelist the target SaaS explicitly.
- MUST ship a per-step timeout (default 30s, configurable per tool). Long-running operations that exceed timeout abort the action without aborting the run; the escalation path handles.
- Insight-180: any new function with external side effects (`captureSession`, `executeBrowserAction`, `saveTrace`, `disposeSession`) takes a `stepRunId` (or equivalent invocation-context) guard so it cannot be called from outside a harness step.
- Insight-190: sub-briefs that add tables (184 adds `fingerprints` / `fingerprint_approvals`) must check the drizzle journal and resequence idx on any merge conflict.
- MUST NOT require Browserbase cloud. Default runtime is local headless Chromium via `playwright` package. Browserbase is a later DEPEND candidate for scale; not in any sub-brief here.
- MUST NOT pre-empt the self-tool track. `browse_web` stays. `WRITE_INTENT_PATTERNS` stays at the self-tool boundary — those checks guard ad-hoc LLM-invoked browsing; the integration track's trust gate is the write guardrail there.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Protocol handler pattern | `src/engine/integration-handlers/cli.ts` and `rest.ts` | adopt | Established handler shape: `execute`, `buildArgs`, retry, timeout, credential brokering, scrub. `browser.ts` mirrors exactly |
| Integration registry YAML shape | `integrations/00-schema.yaml` + `integrations/google-workspace.yaml` | adopt | Gains a new `browser` interface type alongside `cli` / `mcp` / `rest` |
| Session storage primitive | Playwright `storageState` (playwright.dev/docs/auth) | depend | De-facto Playwright auth format. JSON blob of cookies + localStorage. Every Playwright-based modality in the research report consumes the same format |
| Session-capture UX | Playwright `codegen --save-storage` | pattern | The interactive login → storageState flow exists; Ditto wraps it in a CLI command that writes to the credential vault |
| Audit trace artefact | Playwright `trace` files (`.trace.zip`) | depend | Industry audit format for browser actions. `npx playwright show-trace <path>` viewer is free, ubiquitous, zero-cost for Ditto to emit |
| Integration registry + protocol resolution | ADR-005 §2 + existing loader | depend | Already in the engine. New protocol slots in |
| Credential vault (encrypted blob storage) | ADR-005 §3 + existing `credentials` table (`packages/core/src/db/schema.ts:670-`) | depend | storageState is a JSON blob; the vault already encrypts arbitrary JSON under `(userId, service)` |
| Trust gate on per-action basis | ADR-007 + existing trust-gate handler | depend | Every integration call is already trust-gated; browser tool calls inherit |
| Scrub pattern | `src/engine/integration-handlers/scrub.ts` (Brief 171) | adopt | Existing credential scrub extended to recognise storageState fragments if they leak into output |
| Structural fingerprinting for auto-promotion | Original to Ditto — no library surveyed in research provides this | pattern | Sub-brief 184's kernel. No prior art; design deliberately simple (hash of tool-name + a11y path + action kind + input schema) |
| SSRF guard | `src/engine/self-tools/browser-tools.ts:37-50` | adopt | Pattern is already proven in the READ-only `browse_web`; reused verbatim with per-service override |
| Work-item iteration | existing `workItems` table + heartbeat loop | depend | 498-row bulk runs use the standard pattern; no new primitive |
| Failure classification / escalation | `classifyFailureType` (Brief 162 MP-7.1), escalation ladder (Brief 178) | depend | Mid-flow browser failures route through the existing failure taxonomy |

## Phasing — Sub-Briefs

Strict dependency order. Sub-brief 183 is the build target of the current session; 184 and 185 are scoped here and ship later.

### Sub-brief 183 — Protocol + Handler Skeleton + Vault Discriminator (this session's build target)

Lay the structural foundation. One seam: the new protocol slot in the integration pipeline.

**What it adds:**
- New **ADR-032 (Browser Integration Protocol)** declaring the stateful fourth protocol, its BrowserContext lifecycle, and the supersedes-in-part relationship to ADR-005.
- `browser` interface type in `integrations/00-schema.yaml` — required/optional fields including `allowed_domains` (mandatory when interface present, no implicit default), `runtime`, `default_timeout_ms`, `login_detection: { unauthenticated_status_codes?, login_url_pattern? }`.
- `integrations/browser.yaml` generic service file declaring the eight primitives: `browser.navigate`, `browser.click`, `browser.type`, `browser.select`, `browser.wait_for`, `browser.extract`, `browser.snapshot`, `browser.submit`.
- `src/engine/integration-handlers/browser.ts` skeleton — exports `executeBrowser(input, ctx)`, dispatches per tool, delegates actual Playwright work to a `BrowserRuntime` interface. Handler registers with index.
- `BrowserRuntime` interface + in-process Playwright implementation (`src/engine/integration-handlers/browser-runtime-local.ts`). The interface is the seam for future sidecar/container runtimes.
- Credential payload discriminator: `{ kind: "browser-session", storageState, capturedAt, userAgent }` recognised by a new vault helper `getBrowserSession(service, userId)`. No schema change; payload is a JSON blob inside the existing `encryptedValue` column. Builder verifies column can hold ~100 KB; adds width migration only if it cannot.
- `playwright` added as npm dependency with `postinstall` browser download (documented in README).

**Explicitly NOT in 183:** the interactive `browser auth` CLI command, scrub extension, trace emission, trust-gate end-to-end test, real session round-trip. All of those land in 184. The skeleton ships with mocked-runtime tests only. 183 is the "ADR + types + interface + registration" deliverable; 184 is where the system becomes usable.

**Exit criteria:** ADR-032 accepted; `pnpm cli sync` lists the browser handler and its eight primitives; handler returns a structured `NOT_IMPLEMENTED_YET` error for each primitive (the skeleton makes the seam real but does not yet execute actions); type-check passes; tests cover registration and the `BrowserRuntime` interface contract. ~8–10 ACs.

### Sub-brief 184 — Session Capture + Scrub + Trace + Trust Gate (makes the system usable)

Flesh the skeleton. Session capture works, writes land, scrubbed, traced, trust-gated.

**What it adds:**
- `pnpm cli browser auth <service>` — opens headed Chromium, user logs in, hits confirmation key, storageState written to credential vault. Idempotent (replaces prior session with visible confirmation of replacement).
- **Capture-invocation guard:** the CLI command first inserts an `activities` row with `actorType: "cli_user"`, `action: "browser_auth_begin"`, service name — the returned activity id is the Insight-180 invocation anchor passed to `captureSession({ activityId })`. Guard validates the activity row exists and is of the expected kind before writing to vault. No free-floating "capture-context id."
- **Scrub concretisation:** when the handler opens a BrowserContext from a vaulted storageState, it **registers every cookie value into the per-step scrub secret-list** before any action executes. Scrub then walks tool output the same way it walks CLI output today — the existing `scrubCredentialsFromValue` architecture extends naturally because the secrets are real values, not shape-matched patterns. Handler de-registers cookies on context dispose.
- Trace emission per stepRun: `context.tracing.start({ screenshots: true, snapshots: true, sources: false })` on first browser call in a stepRun; stop + save on stepRun exit. Path in `stepRuns.outputs.browserTracePath`.
- **Trace-size ceiling:** hard cap at 250 MB per single stepRun trace (configurable via `DITTO_BROWSER_TRACE_MAX_BYTES`). When exceeded, tracing switches to "chunked append with oldest-chunk eviction" so the ceiling is never breached even on runaway runs. Activity log records `traceSizeCapHit: true` when truncation occurred.
- **Session-expiry detection:** minimal MVP — HTTP status in `[401, 403]` always triggers `SESSION_EXPIRED`. Optional per-service `login_url_pattern` enables URL-redirect detection when the service declares it; absent the declaration, URL-redirect is NOT treated as a session signal (no hardcoded heuristics).
- **SSRF default-deny semantics:** if `allowed_domains` is absent from a service's interface entry, **navigation is denied to every domain** (the schema validator rejects `browser` interfaces missing `allowed_domains`; belt-and-braces enforcement at runtime). Test covers: entry with `allowed_domains: []` denies all; entry with `allowed_domains: [afirmo.co.nz]` permits only that; entry missing the field fails schema validation.
- Trust gate per-call: inherited from integration pipeline, verified end-to-end by a supervised-tier test that asserts a `browser.click` is held for approval.
- Playwright spike test in `src/engine/integration-spike.test.ts` (one real Chromium launch + navigation + extraction).
- Optional `--auto-approve-matching-pattern` flag on `ditto run` as interim stopgap per parent §Afirmo Ergonomic Reality. Explicit opt-in, visible "unsupervised mode" badge in activity log, scoped to one run.

**Exit criteria:** A hand-authored single-row `browser-smoke.yaml` process runs end-to-end against a public test site under supervised trust tier, producing one approval per write, a valid trace file, zero credential leakage verified by grep over activity log, and a successful spike test. ~12–14 ACs. Brief 185 unblocks.

### Sub-brief 185 — Structural Fingerprinting + Bulk Auto-Promotion

The Ditto-original gap. Lets rows 4–498 of a bulk reconciliation auto-approve once rows 1–3 have established a structurally-identical pattern under human approval. Specifically:

- New `fingerprint` field on `harnessDecisions` (or a new `browserActionFingerprints` table — decide in the sub-brief): hash of `(tool_name, a11y_path_or_selector, action_kind, input_schema_shape)`. Input *values* excluded; only schema is hashed.
- Trust gate extension: when a browser tool call's fingerprint matches an `approved` fingerprint within the same process run (or within the parent work-item group), the trust gate auto-approves. Revocable: any human rejection of a matched-fingerprint call invalidates the fingerprint for the remainder of the run.
- Deviation detection: when a row's fingerprint differs from the established pattern (e.g. row 347 requires a new categorisation), the trust gate falls back to supervised and escalates: "row 347 differs from the pattern you approved — review."
- Per-run reversibility register: a structured per-row log of `(rowInput, actionSequence, observedOutput)` attached to the run's artefacts. Not full undo automation — auditable evidence for post-hoc human rollback.

**Exit criteria:** same afirmo reconciliation, but rows 4–498 auto-approve after the supervised first three rows; any deviation escalates; full per-row log viewable.

**Scope size estimate:** moderate — ~14–16 ACs, one new table, one new harness handler extension. Independently testable.

### Sub-brief 186 — AI-Driven Browser Agent (Stagehand `agent`) (deferred, optional)

When the Build meta-process encounters a new SaaS and needs to *author* a reconciliation process (not just run one), the authoring step benefits from Stagehand's `agent` primitive. Deferred until evidence says users can't hand-author process YAMLs via the existing `generate_process` tool.

## What Changes (Work Products)

Parent brief design only. File deltas owned by sub-briefs.

| File | Owning sub-brief | Action |
|------|------------------|--------|
| `docs/adrs/032-browser-integration-protocol.md` | 183 | Create — new ADR declaring stateful fourth protocol; supersedes-in-part ADR-005's three-protocol claim |
| `integrations/00-schema.yaml` | 183 | Add `browser` interface type definition; `allowed_domains` required |
| `integrations/browser.yaml` | 183 | Create — generic browser service (eight primitives) |
| `src/engine/integration-handlers/browser.ts` | 183 | Create — handler dispatching to `BrowserRuntime` |
| `src/engine/integration-handlers/browser-runtime.ts` | 183 | Create — `BrowserRuntime` interface definition |
| `src/engine/integration-handlers/browser-runtime-local.ts` | 183 | Create — in-process Playwright implementation (skeleton in 183, action execution in 184) |
| `src/engine/integration-handlers/browser.test.ts` | 183 | Create — registration + interface contract tests (mocked runtime) |
| `src/engine/integration-handlers/index.ts` | 183 | Modify — register `browser` handler |
| `src/cli/commands/browser-auth.ts` | 184 | Create — session capture CLI with activity-row invocation anchor |
| `src/engine/integration-handlers/scrub.ts` | 184 | Modify — per-context cookie-value registration API |
| `src/engine/integration-handlers/browser.test.ts` | 184 | Extend — real-runtime E2E tests; trace verification; scrub round-trip |
| `src/engine/integration-spike.test.ts` | 184 | Add browser spike case |
| `src/cli/commands/run.ts` | 184 | Add `--auto-approve-matching-pattern` stopgap flag |
| `src/engine/trust-gate.ts` or equivalent | 185 | Modify — fingerprint-match auto-approval |
| `packages/core/src/harness/types.ts` | 185 | Modify — add optional `fingerprint` field on harness decision shape |
| `docs/landscape.md` | 183/184 | Upgrade Playwright to DEPEND on 183 ADR acceptance; re-verify at 184 completion |
| `docs/architecture.md` | 183 | Modify — one-paragraph mention of browser protocol under §Layer 3 / integrations; cross-reference ADR-032 |
| `docs/state.md` | each sub-brief | Modify — mark sub-brief complete, note what shipped |

## User Experience

- **Jobs affected:** Delegate (user hands a bulk browser task to Alex), Review (supervised writes enter the review queue until fingerprint auto-promotes, Sub-brief 184), Decide (approve/reject each write during the first-few-rows supervised period).
- **Primitives involved:** Review Queue (unchanged — browser write approvals slot in as existing review items), Activity Feed (gains browser action events), Process Card (the `reconcile-afirmo-expense` process appears in Routines once authored), Trace Artefact (new artefact type referenced in Activity Feed — user opens locally via `playwright show-trace`).
- **Process-owner perspective:** First-run experience for a new SaaS — user tells Alex "I need to reconcile 498 expenses on afirmo"; Alex recognises a novel domain, proposes authoring a process; once authored, Alex asks "I need to log in to afirmo once — can you run `ditto browser auth afirmo` in your terminal? I'll wait." User runs it, browser opens, user logs in, hits confirm, vault captures the session. Alex proceeds. Supervised first three rows: approvals appear in the Today view. Sub-brief 184 promotes: rows 4–498 complete autonomously; deviations escalate. User sees a progress bar + "498 / 498 reconciled; 2 escalated for review" at end.
- **Interaction states:** session-capture-in-progress (headed Chromium open, CLI waiting for user), supervised-pending (write held for approval), auto-approved (fingerprint-matched, Sub-brief 184), deviation-escalated (row differs from pattern, routed to review), session-expired (storageState rejected by target — re-prompt user for re-auth), target-down (site returns 5xx or captcha — run pauses, escalation ladder fires).
- **Designer input:** Not invoked for this parent brief. Sub-brief 183 does not need Designer (CLI + existing review surface). Sub-brief 184 may invoke Designer for the deviation-escalation card treatment + progress aggregation view.

## Acceptance Criteria

Parent-level ACs are gated on sub-briefs 183, 184, 185. Parent sits in `partial` status after 184 and `complete` only after 185.

1. [ ] ADR-032 (Browser Integration Protocol) accepted. Supersedes-in-part ADR-005's three-protocol claim. Documents stateful lifecycle.
2. [ ] `browser` interface type declared in `integrations/00-schema.yaml` with `allowed_domains` marked required (schema validator rejects entries without it).
3. [ ] Generic `integrations/browser.yaml` exists, declaring the eight primitives.
4. [ ] `src/engine/integration-handlers/browser.ts` registered; handler dispatches to `BrowserRuntime` interface.
5. [ ] `BrowserRuntime` interface defined; local Playwright implementation behind it; v1 default is in-process, interface permits sidecar without caller changes.
6. [ ] `pnpm cli browser auth <service>` captures an authenticated session, writes to vault as `service=browser:<service>`, survives restart. Idempotent replacement of prior session.
7. [ ] CLI capture uses an `activities` row as Insight-180 invocation anchor (not a free-floating "capture-context id"). Guard rejects capture calls whose activity id doesn't exist or isn't of kind `browser_auth_begin`.
8. [ ] Scrub extension: on context open, every cookie value from the loaded storageState is registered into the per-step scrub secret-list; de-registered on dispose. Test: cookie injected into tool output is redacted by standard `scrubCredentialsFromValue`.
9. [ ] Trust gate holds supervised-tier browser writes; verified by test. Trusted-tier writes pass through; verified by test.
10. [ ] Playwright trace file emitted per stepRun; path in `stepRuns.outputs.browserTracePath`; file valid in `playwright show-trace`.
11. [ ] Trace-size cap: 250 MB default (configurable via `DITTO_BROWSER_TRACE_MAX_BYTES`), chunked append + oldest-chunk eviction on overflow, `traceSizeCapHit` flag in activity when truncation occurred.
12. [ ] SSRF / allowlist: absent `allowed_domains` ⇒ schema rejects and runtime denies all navigation. Empty array ⇒ denies all. Listed domains ⇒ only those permitted. Three separate tests cover all three cases.
13. [ ] Session-expiry detection: 401/403 always triggers `SESSION_EXPIRED`; optional `login_url_pattern` enables URL-redirect detection when service declares it. Escalation ladder (Brief 178) translates to "please re-authenticate." Test injects 401, asserts error code and escalation.
14. [ ] `--auto-approve-matching-pattern` stopgap flag on `ditto run` exists in 184; explicit opt-in, visible unsupervised-mode indicator in activity log, scoped to one run. Removed or restructured once 185 ships fingerprinting.
15. [ ] Structural fingerprinting (Sub-brief 185): rows matching an approved fingerprint in the same run auto-promote; deviations escalate.
16. [ ] End-to-end: a hand-authored `reconcile-afirmo-expense.yaml` runs against afirmo.co.nz under supervised tier at first, auto-approves matching-fingerprint rows after approval threshold, completes at least 10 rows with trace artefacts, no credential leakage in logs, no uncaught exceptions.
17. [ ] Insight-180 invocation guards on `captureSession`, `executeBrowserAction`, `saveTrace`, `disposeContext`, `scrubStorageState`.
18. [ ] Type-check, lint, test suite all pass; new tests added for handler, scrub extension, CLI command, trust-gate fingerprint match.
19. [ ] `docs/architecture.md` gains a one-paragraph browser-protocol note in §Layer 3; cross-references ADR-032.
20. [ ] Landscape doc entries for Playwright (`depend`) and Playwright MCP (`evaluated, not adopted`) accurate at brief-complete time.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + ADR-005 + this brief.
2. Review agent specifically checks:
   - Does the `browser` handler bypass the harness pipeline anywhere? (It must not.)
   - Can an agent observe or exfiltrate the storageState? (It must not.)
   - Is the trust gate actually invoked per tool call, and can the test prove it?
   - Is the scrub extension concrete — does it register real cookie values at context-open — or does it rely on shape-matching?
   - SSRF containment: schema validator + runtime guard both default-deny when `allowed_domains` absent?
   - Insight-180 guards on every side-effecting function, including CLI capture path anchored on `activities` row?
   - Does the registry YAML validator reject a browser interface entry that omits `allowed_domains`?
   - Is the stateful-protocol divergence from ADR-005 properly handled by ADR-032, including BrowserContext lifecycle documentation?
   - Trace-size cap enforced at the Playwright layer, not just post-hoc?
   - Is the CLI `browser auth` command idempotent? Re-running cleanly replaces the prior session without leaking the old one?
3. Fresh-context reviewer re-reads as adversary: how would a malicious or confused process escalate privilege? Capture answers as test cases.
4. Present work + review findings to human.

## Smoke Test

```bash
# Sub-brief 183 smoke (skeleton only):
pnpm cli sync
pnpm cli inspect integration browser
# Expect: browser handler registered; eight tools listed; all return NOT_IMPLEMENTED_YET when invoked.

# Sub-brief 184 smoke (system usable):
pnpm cli browser auth afirmo
# Interactive: activity row written first, headed Chromium opens, user logs in, hits Enter.
# Expect: "Session captured for browser:afirmo."

pnpm cli run processes/test/browser-smoke.yaml --work-item-id=<row>
# Expect: one approval prompt per write, trace file at <DITTO_DATA>/traces/<stepRunId>.zip,
# activity log shows one event per browser tool call, no secrets in the log.

# Sub-brief 185 smoke (user value):
pnpm cli run processes/user/reconcile-afirmo-expense.yaml --bulk --trust-tier=supervised
# Expect: rows 1-3 held for approval; rows 4-N auto-approve on matching fingerprint;
# any deviating row escalates.
```

## After Completion

1. Update `docs/state.md` as each sub-brief ships (183, 184, 185).
2. Update `docs/roadmap.md` — note browser protocol capability under Phase 9 adjacent infrastructure.
3. Phase retrospective at parent-brief close (after 185): what worked, what surprised us, what the afirmo use case taught us that generalises to other long-tail SaaS.
4. Consider an insight at parent-close: is browser-as-a-protocol the right categorical placement, or does evidence suggest separating "deterministic browser" from "agentic browser" as distinct architectural layers? Also consider whether integration handlers (cli.ts, rest.ts, browser.ts) should migrate to `packages/core/` — the reviewer flagged that all three meet the "ProcessOS could use this" test.

## Open Questions

1. **Runtime isolation for Network.** `BrowserRuntime` interface lands in 183; in-process local is v1. Sidecar/container implementation is a separate brief when Network deployment actually demands it. Interface shape prevents lock-in.
2. **Fingerprint granularity (Sub-brief 185).** Hash on selector exact match is brittle. Hash on a11y-path + action kind is more robust but may over-generalise. Candidate: both — exact hash for fast-path match, a11y-path hash as fallback with lower auto-approve confidence. Decide in 185.
3. **Trace file retention.** Ship with indefinite retention per run, 250 MB cap per stepRun (AC 11). Add a `ditto trace prune --older-than=30d` command when evidence shows disk pressure. Not blocking this parent brief.
4. **CLI capture UX vs workspace UI.** CLI command is sufficient for dev-users. Non-technical users need workspace-UI capture (streamed remote browser). Deferred; not a blocker for afirmo because that user is comfortable with CLI.
5. **Path α vs Path β revisit.** If a second MCP server use case arrives within six months, the cost of not-having-an-MCP-handler will outweigh the cost of having built one. Revisit at parent-brief close. Playwright MCP would integrate cleanly with the `BrowserRuntime` interface introduced in 183 — a future `BrowserRuntimePlaywrightMcp` implementation is a drop-in.
6. **Input redaction in traces.** Playwright traces capture DOM + typed values by default. Non-login inputs typed during normal runs (amounts, categories, names) are captured. Acceptable for audit purposes; user owns the data and runs happen under their account. Password fields are not typed by Ditto during normal runs (sessions pre-authenticated). Flagged for documentation at 184 completion; not a blocker.

## Alternatives Considered (summary, full treatment in the research report)

- **Playwright MCP (Path β).** Rejected for this round because no generic MCP handler exists yet in `integration-handlers/`. Playwright MCP is a strong candidate once other MCP servers become necessary; the `BrowserRuntime` interface introduced in 183 lets a future `BrowserRuntimePlaywrightMcp` implementation drop in without touching callers.
- **Stagehand WRITE mode.** Rejected for the integration track because deterministic tool calls are preferable for bulk work where pattern stability matters more than AI planning. Stagehand `agent` is re-scoped to Sub-brief 185 for authoring (find-or-build) flows.
- **Anthropic Computer Use.** Rejected because (a) Claude-only violates ADR-026 multi-provider goal, (b) vision-token cost at 498 rows is prohibitive, (c) our targets are DOM-structured; a11y or selector paths are cheaper and more stable than screenshots.
- **Record-and-replay only.** Rejected as primary because brittle to DOM changes across rows; rejected as secondary because Sub-brief 184's fingerprinting captures the same ergonomic benefit (fast-repeat once a pattern is approved) without taking on the recording infrastructure.
