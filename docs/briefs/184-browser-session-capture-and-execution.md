# Brief 184: Browser Session Capture + Action Execution + Scrub + Trace + Trust Gate

**Date:** 2026-04-17
**Status:** ready
**Approved:** 2026-04-17 by human after two review passes
**Depends on:** Brief 183 (skeleton — protocol registered, runtime interface defined, vault discriminator recognised)
**Unlocks:** Brief 185 (structural fingerprinting + bulk auto-promotion — where the user value actually lands for bulk reconciliation)

## Goal

- **Roadmap phase:** Phase 9 adjacent (infrastructure)
- **Capabilities delivered:** The browser protocol becomes *usable*. Playwright actually launches; session capture works interactively; cookies are scrubbed from tool outputs; traces are emitted per stepRun with a size ceiling; trust gate intercepts browser writes end-to-end; session-expiry detection escalates appropriately.

## Context

Brief 183 shipped the skeleton — ADR-032, schema, handler, `BrowserRuntime` interface, all with `NOT_IMPLEMENTED_YET` returns. This brief fills in the implementation.

The reviewer flagged three concrete issues against the prior combined version of this brief that this split addresses properly:

- **Scrub cannot rely on shape-matching storageState.** `scrub.ts` today redacts known *values*, not patterns. The fix: when the handler opens a BrowserContext, it registers every cookie value from the vaulted storageState into the per-step scrub secret-list. The existing `scrubCredentialsFromValue` walker then handles redaction naturally. Values are real; the mechanism is already proven for CLI output.
- **SSRF default-deny must be explicit in schema and runtime.** Brief 183 makes `allowed_domains` schema-required. This brief enforces at runtime: navigation outside the whitelist throws before Playwright ever fires. Two layers.
- **CLI capture command has no natural stepRun anchor for Insight-180.** The fix: capture writes an `activities` row first, gets its id, passes that as the invocation context. Guard validates the row exists and is of kind `browser_auth_begin`. No free-floating "capture-context id."

## Objective

Ship the usable-but-not-yet-ergonomic browser protocol: user can authenticate once via CLI, author a process YAML that uses browser primitives, run it under supervised trust, see each write held for approval, get a trace file, and trust that nothing sensitive lands in logs or memory. 498-row bulk runs are mechanically possible but ergonomically punishing — the `--auto-approve-matching-pattern` stopgap flag gives an opt-in escape; Brief 185 replaces it with structural fingerprinting.

## Non-Goals

- Not structural fingerprinting (Brief 185).
- Not Stagehand `agent` integration (Brief 186, optional).
- Not workspace-UI session capture (deferred indefinitely; CLI is sufficient for dev users).
- Not Browserbase cloud runtime.
- Not multi-tab, popup handling, file download capture, or PDF generation primitives.
- Not captcha solving or MFA automation.
- Not the afirmo reconciliation process YAML (user-level work, authored after this ships).

## Inputs

1. `docs/briefs/183-browser-protocol-playwright-handler.md` — prior brief, now completed.
2. `docs/briefs/182-browser-write-capability.md` — parent design.
3. `docs/adrs/032-browser-integration-protocol.md` — the accepted ADR.
4. `src/engine/integration-handlers/browser.ts` — skeleton created in 183; filled in here via the `BrowserRuntime` interface's local implementation.
5. `src/engine/integration-handlers/browser-runtime-local.ts` — where Playwright calls actually land.
6. `src/engine/integration-handlers/cli.ts` — reference for retry / timeout / activity-log emission.
7. `src/engine/integration-handlers/scrub.ts` — the walker extended here with the context-scoped secret-registration API.
8. `src/engine/self-tools/browser-tools.ts:37-50` — SSRF guard pattern, reused verbatim.
9. `packages/core/src/db/schema.ts` §`activities` — the invocation-anchor row for the CLI capture path.
10. `packages/core/src/db/schema.ts` §`stepRuns.outputs` — where `browserTracePath` is recorded.
11. Playwright docs: `playwright.dev/docs/auth` (storageState), `playwright.dev/docs/trace-viewer`, `playwright.dev/docs/class-browsercontext`, `playwright.dev/docs/test-timeouts`.
12. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — the invocation-guard pattern, extended here with activity-row anchoring for the CLI path.
13. `docs/briefs/complete/178-stale-escalation-auto-action.md` — escalation ladder that receives `SESSION_EXPIRED` errors.

## Constraints

- MUST add `playwright` to npm dependencies. Pin to a specific minor version. Document browser-download postinstall (`~150 MB`) in README, offer `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` escape hatch for contributors who don't need the runtime locally.
- MUST run the browser-runtime in headless mode by default. `runtime: headed` override is allowed at the service-registry level (used only during `ditto browser auth`, which sets headed explicitly for that invocation). Process-run execution MUST NOT honour `runtime: headed` from the registry — only the CLI capture path does.
- MUST use a **fresh BrowserContext per process run**, constructed from the vaulted storageState at first `browser.*` call, disposed when the process run terminates (success, failure, timeout, cancelled — all paths). No context pooling in v1.
- MUST record a Playwright trace via `context.tracing.start({ screenshots: true, snapshots: true, sources: false })` at first `browser.*` call within a stepRun. Stop and save at stepRun exit. Path written to `stepRuns.outputs.browserTracePath`.
- **Trace-size ceiling:** 250 MB per stepRun trace by default (configurable via `DITTO_BROWSER_TRACE_MAX_BYTES`). When exceeded mid-run, tracing switches to chunked-append + oldest-chunk eviction so the ceiling is never breached. Activity log records `traceSizeCapHit: true` when truncation occurred. Enforcement MUST be at the Playwright tracing layer (monitor trace-file size during run), not a post-hoc truncation.
- **Scrub concretisation:** when `browser-runtime-local.ts` opens a BrowserContext, it MUST register every cookie value from the loaded storageState into the per-step scrub secret-list via a new `scrub.ts` API `registerContextSecrets(stepRunId, secrets: string[])`. On context dispose: `clearContextSecrets(stepRunId)`. Existing `scrubCredentialsFromValue` then walks tool output and redacts the registered values. Short values (≤4 chars) filtered per existing scrub policy.
- **SSRF default-deny:** the handler MUST check every `browser.navigate(url)` against the service's `allowed_domains` whitelist before Playwright is invoked. URL whose host doesn't match any pattern in the list throws `SSRF_DOMAIN_NOT_ALLOWED`. Pattern match: exact host or `*.suffix` (no wildcards elsewhere). The existing `BLOCKED_HOST_PATTERNS` from `browser-tools.ts` remains as belt-and-braces — RFC-1918 etc. always denied even if whitelisted by a misconfigured service YAML.
- **Session-expiry detection (minimal MVP):** the handler MUST translate HTTP response status in `[401, 403]` on any `browser.*` call into a structured `SESSION_EXPIRED` error. When the service declares `login_detection.login_url_pattern`, URL-redirect detection enables: if `browser.navigate` lands on a URL matching the pattern, throw `SESSION_EXPIRED`. Absent the declaration, no URL-based heuristic fires. `SESSION_EXPIRED` errors flow through the existing failure-classification path (`classifyFailureType`, Brief 162) and escalate with "please re-authenticate <service>" via the escalation ladder (Brief 178).
- **CLI capture invocation guard:** `src/cli/commands/browser-auth.ts` MUST write a synthetic `activities` row at command start: `{ actorType: "cli_user", action: "browser_auth_begin", service: <name>, status: "in_progress" }`. The returned activity id is passed to `captureSession({ activityId })`. Guard validates: activity row exists, kind is `browser_auth_begin`, status is `in_progress`. On successful capture: activity row updated to `status: "complete"`. On failure: `status: "failed"`. This is the Insight-180 anchor for non-stepRun side effects.
- Capture runs Playwright in **headed mode** (`headless: false`). During capture, tracing is NOT enabled — the login screen would capture password input into the trace. This is the single documented deviation from the normal "trace every run" rule and MUST be called out in the capture command's implementation comment.
- Insight-180 guards on all new side-effecting functions: `captureSession`, `executeBrowserAction` (wraps every primitive), `saveTrace`, `disposeContext`, `registerContextSecrets`, `clearContextSecrets`. Each takes either `stepRunId` (normal path) or `activityId` (capture path) and validates against the corresponding table before mutating.
- Per-primitive `timeout_ms` honoured (default 30s, override per tool declaration). Timeout aborts the action (not the run); the step's normal failure path handles.
- Trust gate is inherited from the integration pipeline — no new trust-gate code in this brief, only an E2E test that proves browser writes are intercepted at supervised tier.
- `--auto-approve-matching-pattern` flag on `ditto run`: explicit opt-in, scoped to one run, activity log entry `unsupervisedMode: true`, visible indicator in any UI that later surfaces the run. Exists as a stopgap between 184 and 185; once 185 ships, this flag is marked deprecated in help text, removed in a later cleanup.
- Playwright spike test: before any Ditto-level integration test runs, a spike test in `src/engine/integration-spike.test.ts` launches real headless Chromium, navigates to `example.com`, extracts `<h1>`, asserts "Example Domain". Gated by `PLAYWRIGHT_SPIKE=1` in CI to avoid running on every dev run.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Playwright library | github.com/microsoft/playwright (npm `playwright`) | depend | v1+, Microsoft, Apache-2.0. Adoption formalised at this brief's close |
| storageState capture flow | Playwright `codegen --save-storage` + `context.storageState()` | depend | Playwright's documented session-capture approach |
| Tracing API | Playwright `context.tracing.start()` + chunk mode | depend | Industry-standard audit format |
| Scrub extension pattern (context-scoped registration) | `src/engine/integration-handlers/scrub.ts` (Brief 171) | adopt | Existing value-walker architecture extended with a per-step secret-registration API |
| SSRF guard patterns | `src/engine/self-tools/browser-tools.ts:37-50` (Brief 134) | adopt | Verbatim RFC-1918 / `.local` / metadata denies, on top of whitelist enforcement |
| Activity-row invocation anchor | Original to Ditto (reviewer suggestion) | pattern | Same shape as `stepRunId` guards; the row is the concrete DB anchor |
| Failure classification | Brief 162 MP-7.1 `classifyFailureType` | depend | `SESSION_EXPIRED` added to the existing failure taxonomy |
| Escalation ladder | Brief 178 | depend | Receives `SESSION_EXPIRED` and produces the re-auth prompt |
| CLI argument parsing | existing `src/cli/commands/*` pattern | adopt | Existing CLI command shape |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `package.json` | Modify — add `playwright` dependency, pinned minor |
| `README.md` | Modify — note `pnpm install` triggers Playwright browser download; `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` escape hatch |
| `src/engine/integration-handlers/browser-runtime-local.ts` | Modify — replace all `NOT_IMPLEMENTED_YET` returns with real Playwright calls. `launch()` creates browser, `createContext(storageState)` constructs context + registers cookies with scrub + starts tracing, each primitive calls Playwright, `disposeContext` stops tracing + saves file + clears scrub secrets + closes context |
| `src/engine/integration-handlers/browser.ts` | Modify — implement domain allowlist check before `browser.navigate` dispatch; translate runtime errors into stable error codes (`SSRF_DOMAIN_NOT_ALLOWED`, `SESSION_EXPIRED`, `TIMEOUT`, `TARGET_UNAVAILABLE`) |
| `src/engine/integration-handlers/browser.test.ts` | Modify — replace NOT_IMPLEMENTED_YET tests with real-runtime E2E: supervised tier holds browser write, trusted tier passes, trace file written and valid, scrub round-trip redacts cookie value, SSRF default-deny fires on unlisted domain, 401 returns SESSION_EXPIRED, timeout aborts action without aborting run, trace-size cap triggers chunked eviction. ~14 tests |
| `src/engine/integration-handlers/scrub.ts` | Modify — add `registerContextSecrets(stepRunId, secrets: string[])` and `clearContextSecrets(stepRunId)`. Per-step secret-list stored in-memory (no schema change). `scrubCredentialsFromValue` consults both the auth-env-derived secrets AND the per-step registered secrets |
| `src/engine/integration-handlers/scrub.test.ts` | Modify — 4 new tests: registration, de-registration, cross-step isolation (step A secrets do not bleed into step B), short-value filter respects the 4-char rule for registered secrets too |
| `src/engine/integration-handlers/index.ts` | No change (handler already registered in 183) |
| `src/cli/commands/browser-auth.ts` | Create — `pnpm cli browser auth <service>` command. (1) Insert `activities` row, get id. (2) `captureSession({ activityId, service })` launches headed Chromium with tracing OFF, waits for Enter keypress, extracts storageState, writes to vault. (3) Updates activity row status. Idempotent — replacing a prior session logs "Replacing prior session (captured <timestamp>)" and removes the old credential row before writing the new one |
| `src/cli/index.ts` | Modify — register `browser` command group |
| `src/engine/integration-spike.test.ts` | Add — browser spike case (real Chromium, navigate to example.com, extract h1). Gated by `PLAYWRIGHT_SPIKE=1` |
| `src/cli/commands/run.ts` | Modify — add `--auto-approve-matching-pattern` flag. Default false. When set: log `unsupervisedMode: true` to run activity; trust-gate enforcement is relaxed only for browser primitives within this run; every relaxed call still logs normally. Removed/deprecated in a later cleanup brief once 185 ships |
| `src/engine/failure-classification.ts` (or equivalent) | Modify — add `SESSION_EXPIRED` and `SSRF_DOMAIN_NOT_ALLOWED` to the failure taxonomy; escalation ladder uses existing template with service name interpolation |
| `packages/core/src/harness/types.ts` | (Likely) no change; verify `stepRuns.outputs` allows arbitrary JSON keys for `browserTracePath` and `traceSizeCapHit` |
| `docs/architecture.md` | Modify — one paragraph in §Layer 3 mentioning the browser protocol and cross-referencing ADR-032 |
| `docs/landscape.md` | Modify — Playwright entry upgraded to DEPEND, adoption date 2026-04-17 (or build-complete date) |

## User Experience

- **Jobs affected:** Delegate (user runs `ditto browser auth <service>` as setup), Review (supervised browser writes enter the review queue like any integration call), Decide (approve/reject each write).
- **Primitives involved:** Review Queue (new item kind — browser action approval), Activity Feed (new event type — browser action with tool name + target selector + result), CLI command (new surface).
- **Process-owner perspective:** "Alex, I need to automate <thing> on <site>. Can you help?" Alex: "Novel domain — I need access once. Run `ditto browser auth <service>` in your terminal; I'll wait." User runs it, Chromium opens, user logs in, hits Enter. CLI: "Session captured for browser:<service>." Alex proceeds. First process run: every write shown in review queue. User approves in sequence.
- **Interaction states:** capture-in-progress (headed Chromium open, CLI waiting), capture-success, capture-replaced-prior (explicit confirmation of replacement), session-expired-on-use (handler returns `SESSION_EXPIRED`, escalation fires "please re-run `ditto browser auth <service>`"), target-unavailable (5xx, captcha, other non-auth failure — escalation path handles), trace-cap-hit (activity log flagged, run continues).
- **Designer input:** Not invoked. All surfaces existing. The CLI capture is operational not design-sensitive.

## Acceptance Criteria

1. [ ] `playwright` dependency added to `package.json`; README documents postinstall browser download + skip escape hatch.
2. [ ] Spike test at `src/engine/integration-spike.test.ts` launches real Chromium under `PLAYWRIGHT_SPIKE=1`, navigates to example.com, extracts `<h1>`, asserts "Example Domain".
3. [ ] `pnpm cli browser auth <service>` opens headed Chromium, captures storageState on user keypress, writes to vault as `service=browser:<service>`. Session survives a process restart.
4. [ ] Capture command writes an `activities` row at start (kind `browser_auth_begin`, status `in_progress`), updates to `complete` on success / `failed` on failure. Test asserts row lifecycle.
5. [ ] `captureSession({ activityId })` rejects with a clear error when given a non-existent activity id, an id of the wrong kind, or a status-not-`in_progress` row.
6. [ ] Re-running `browser auth <service>` cleanly replaces the prior session — old credential row removed, new one written, CLI logs "Replacing prior session (captured <timestamp>)". Test asserts via mocked vault.
7. [ ] `registerContextSecrets(stepRunId, secrets)` API exists in `scrub.ts`; `clearContextSecrets(stepRunId)` pairs. Cross-step isolation test: step A's secrets do not leak into step B's output scrub.
8. [ ] Handler registers every cookie value from the loaded storageState into the scrub secret-list on context open; clears on dispose. Test: inject a cookie into tool output, verify it's redacted as `[REDACTED:...]`.
9. [ ] Supervised-tier test: a `browser.click` call in a supervised run is held by the trust gate for human approval before the Playwright action fires.
10. [ ] Trusted-tier test: a `browser.click` call in a trusted run passes through without approval.
11. [ ] Playwright trace file emitted per stepRun; path written to `stepRuns.outputs.browserTracePath`; file opens cleanly in `playwright show-trace` (CI shell assertion).
12. [ ] Trace-size cap: default 250 MB; override honoured via `DITTO_BROWSER_TRACE_MAX_BYTES`; chunked append + oldest-chunk eviction verified by test that drives trace to cap and asserts file stays at-or-below cap. `traceSizeCapHit: true` recorded in activity when truncation occurred.
13. [ ] SSRF: `browser.navigate("http://10.0.0.1/")` denied by existing `BLOCKED_HOST_PATTERNS` even if `10.0.0.1` is mistakenly in `allowed_domains`. Test.
14. [ ] Allowlist: service with `allowed_domains: [afirmo.co.nz]` permits navigation to afirmo.co.nz; denies navigation to `evil.com` with `SSRF_DOMAIN_NOT_ALLOWED`. Wildcard pattern `*.afirmo.co.nz` matches subdomains only. Three tests.
15. [ ] Session expiry: 401 response from any primitive returns `SESSION_EXPIRED`; escalation ladder translates to human-readable re-auth prompt. Test.
16. [ ] Session expiry (URL pattern): when service declares `login_url_pattern: "/login"`, `browser.navigate` landing on `<domain>/login` returns `SESSION_EXPIRED`. Absent declaration, URL-based detection does not fire (no hardcoded heuristic). Two tests.
17. [ ] Per-primitive timeout: default 30s; per-tool `timeout_ms: 5000` override aborts at 5s; abort surfaces as a tool-level failure, not a run-level failure. Test.
18. [ ] `--auto-approve-matching-pattern` flag: `ditto run --auto-approve-matching-pattern` sets `unsupervisedMode: true` in the run's activity log; every browser write in that run logs the flag's presence; help text marks it "STOPGAP — replaced by structural fingerprinting in Brief 185."
19. [ ] Insight-180 guards present on `captureSession`, `executeBrowserAction`, `saveTrace`, `disposeContext`, `registerContextSecrets`, `clearContextSecrets`. Each rejects when invoked without a valid anchor.
20. [ ] `docs/architecture.md` §Layer 3 gains browser-protocol paragraph; `docs/landscape.md` Playwright entry upgraded to DEPEND.
21. [ ] Type-check, lint, full test suite all pass. No regressions on existing integration-handler tests.

## Review Process

1. Spawn review agent with `docs/architecture.md`, `docs/review-checklist.md`, ADR-032, Brief 182, Brief 183, and this brief.
2. Review agent specifically checks:
   - BrowserContext lifecycle: is it guaranteed disposed on every terminal state (complete, failed, timeout, cancelled, process crash)? Leak test expected.
   - Per-stepRun trace file: one per stepRun, not global, not cross-contaminated under parallel steps?
   - Scrub context-scoped registration: does it isolate by stepRunId cleanly, or could a leak occur when two parallel steps run concurrently?
   - SSRF: both layers active? Whitelist-override cannot defeat the RFC-1918 deny.
   - Session-expiry detection: does the URL-pattern path fire only when the service declares it? No hardcoded heuristics for specific sites?
   - Capture command: headed mode and tracing-OFF both present in the capture path? Any code path that would trace the login page?
   - Activity-row invocation anchor: does `captureSession` actually validate activity kind + status, or does it merely check existence?
   - `--auto-approve-matching-pattern`: does the relaxation apply only to browser primitives, or does it accidentally bypass trust gate for other tool types in the same run?
   - Insight-180 guards on the full list; each rejects under adversarial conditions.
   - Playwright dependency lock: pinned minor, postinstall documented, CI skip-browser-download works.
3. Fresh-context reviewer re-reads adversarially: how does a malicious process or corrupted session leak credentials, bypass trust gate, or exhaust disk? Capture answers as tests.
4. Present work + review findings to human.

## Smoke Test

```bash
# 1. Install + sync
pnpm install                 # triggers Playwright browser download
pnpm run type-check
pnpm cli sync
pnpm cli inspect integration browser

# 2. Spike (real browser, one call)
PLAYWRIGHT_SPIKE=1 pnpm vitest run src/engine/integration-spike.test.ts -t "browser"
# Expect: Chromium launches, navigates to example.com, extracts "Example Domain"

# 3. Session capture (requires human)
pnpm cli browser auth example-site
# activities row written, headed Chromium opens, user logs in, hits Enter.
# Expect: "Session captured for browser:example-site."

# 4. Re-run for idempotency
pnpm cli browser auth example-site
# Expect: "Replacing prior session (captured <timestamp>)."

# 5. Scrub + trust-gate E2E
pnpm vitest run src/engine/integration-handlers/browser.test.ts

# 6. End-to-end with a minimal test process
pnpm cli run processes/test/browser-smoke.yaml --work-item-id=<row>
# Expect: one approval per browser write, trace at <DITTO_DATA>/traces/<stepRunId>.zip

# 7. Verify trace file
npx playwright show-trace <DITTO_DATA>/traces/<stepRunId>.zip
# Expect: viewer opens; actions, screenshots, DOM snapshots visible

# 8. Verify no secrets in activity log
pnpm cli activity export --run-id=<run-id> | grep -i "cookie\|session-token"
# Expect: no matches; redaction confirmed
```

## After Completion

1. Update `docs/state.md` — Brief 184 complete; Brief 185 next (structural fingerprinting, where the afirmo use case becomes ergonomic).
2. Update `docs/landscape.md` — Playwright DEPEND, adoption date recorded.
3. Phase retrospective: did the BrowserContext lifecycle clean up cleanly in all failure modes? Did the scrub registration isolate correctly under parallel steps? Did Playwright's dependency footprint cause any CI friction?
4. Consider a new insight if a design discovery emerged — especially around the "activity-row as invocation anchor" pattern, which is novel and may generalise.
5. Brief 185 builder starts immediately. Parent Brief 182 remains `partial` until 185 ships.
