# Brief 183: Browser Protocol + Handler Skeleton + Vault Discriminator

**Date:** 2026-04-17
**Status:** ready
**Approved:** 2026-04-17 by human after two review passes
**Depends on:** Brief 182 (parent), ADR-005 (documents the three existing protocols; this brief supersedes-in-part with ADR-032)
**Unlocks:** Brief 184 (makes the handler actually execute actions + session capture + scrub + trace + trust-gate E2E)

## Goal

- **Roadmap phase:** Phase 9 adjacent (infrastructure)
- **Capabilities delivered:** One seam — the new protocol slot. `browser` interface type registered, handler registered, `BrowserRuntime` interface defined, vault payload discriminator recognised, ADR-032 accepted. The skeleton is the deliverable. No action execution yet (that is Brief 184).

## Context

Parent brief 182 designs a three-sub-brief phasing: **183 skeleton → 184 usable → 185 fingerprinting for the user value**. Prior drafting of 183 combined skeleton + usability + trust-gate E2E in one brief, which violated Insight-004 sizing (one integration seam per brief). This rewrite splits cleanly: 183 is "the protocol exists and is declared correctly in all the right places"; 184 is "the protocol actually does anything."

183 is a ship-the-bones brief. Every file is either a declaration (ADR, schema, YAML, interface) or a mocked-runtime test. When 183 ships, the handler returns `NOT_IMPLEMENTED_YET` for every primitive; the skeleton is structurally complete, reviewed, and ready for Brief 184 to fill in.

The reason to ship a skeleton brief separately: the ADR decision, the `BrowserRuntime` interface shape, and the vault discriminator are architectural commitments that the reviewer should evaluate in isolation from Playwright execution details. Mixing the two makes the review harder and the diff larger than a single session can cleanly deliver.

## Objective

Declare the `browser` protocol as a first-class category in the integration pipeline. ADR-032 accepted; schema registers `browser` as an interface type; `integrations/browser.yaml` declares eight primitives; handler registered; `BrowserRuntime` interface defined with mocked local implementation; credential vault recognises the `browser-session` payload discriminator.

## Non-Goals

- No session capture in this brief (Brief 184).
- No scrub extension (Brief 184).
- No trace emission (Brief 184).
- No real Playwright launch or navigation (Brief 184 spike).
- No trust-gate E2E test (Brief 184, once actions execute).
- No `ditto browser auth` CLI command (Brief 184).
- No session-expiry detection (Brief 184).
- No structural fingerprinting (Brief 185).

## Inputs

1. `docs/briefs/182-browser-write-capability.md` — parent design.
2. `docs/research/authenticated-saas-browser-automation.md` — research context.
3. `docs/adrs/005-integration-architecture.md` — the ADR this brief supersedes-in-part via ADR-032.
4. `docs/adrs/000-template.md` — ADR template for ADR-032.
5. `integrations/00-schema.yaml` — schema; gains a `browser` interface entry.
6. `integrations/google-workspace.yaml` — exemplary service file; reference for YAML shape.
7. `src/engine/integration-handlers/cli.ts` — handler shape to mirror in `browser.ts` structure.
8. `src/engine/integration-handlers/rest.ts` — handler shape to mirror.
9. `src/engine/integration-handlers/index.ts` — handler registry.
10. `packages/core/src/db/schema.ts` §`credentials` — payload holds JSON; the discriminator lives inside the encrypted blob.

## Constraints

- Handler MUST register with the existing integration dispatch. No parallel path.
- `BrowserRuntime` interface MUST be defined in a separate file (`browser-runtime.ts`) and imported by the handler. Motivation: future sidecar/container/cloud runtimes (Browserbase, Playwright MCP) drop in behind the same interface without touching the handler.
- Local implementation (`browser-runtime-local.ts`) returns `NOT_IMPLEMENTED_YET` for every primitive in this brief. Brief 184 fills in the real Playwright calls.
- `playwright` npm dependency is NOT added in this brief — adding it means triggering browser-download postinstall steps CI has to accommodate. Defer the dependency to Brief 184 where it's actually used. 183's `browser-runtime-local.ts` compiles without `playwright` imports (types stubbed).
- Schema validator MUST reject a `browser` interface entry that omits `allowed_domains`. No implicit default.
- `allowed_domains` MUST be a non-empty list of fully-qualified hostnames or `*.suffix` patterns. Empty array rejected by schema.
- Insight-180: no functions with external side effects are added in this brief. (All actions return `NOT_IMPLEMENTED_YET`.) The guard pattern for `captureSession` etc. lands in Brief 184.
- ADR-032 MUST cite its supersedes-in-part relationship to ADR-005 in the Status/Context fields per ADR convention.
- Engine-core boundary: `browser.ts`, `browser-runtime.ts`, `browser-runtime-local.ts` all follow the existing `cli.ts` / `rest.ts` pattern of living in `src/engine/integration-handlers/` (Ditto product layer). The reviewer flagged that this entire directory likely should migrate to `packages/core/`; that migration is deliberately out of scope for this brief and belongs in its own dedicated migration brief.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Handler shape | `src/engine/integration-handlers/cli.ts` | adopt | Closest precedent; argument resolution, return shape, handler-index registration |
| Registry loader extensibility | existing integration registry loader | depend | Already validates service YAMLs against schema; adds one new interface_type entry |
| `BrowserRuntime` interface shape | Original to Ditto — reviewer flagged as useful for future runtime swap (Path β Playwright MCP drop-in) | pattern | Small surface: `launch(options) -> runtime`, `createContext(storageState) -> context`, per-primitive methods, `dispose()` |
| ADR template | `docs/adrs/000-template.md` | adopt | Project convention |
| Credential payload discriminator | Original to Ditto (same pattern as existing OAuth vs API-key distinction, now extended to browser-session) | pattern | `kind: "browser-session"` tag inside the encrypted JSON; vault helper type-checks on read |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/adrs/032-browser-integration-protocol.md` | Create — new ADR. Status: proposed → accepted on brief approval. Supersedes-in-part ADR-005's three-protocol claim. Documents stateful BrowserContext lifecycle across multiple tool calls within one stepRun |
| `integrations/00-schema.yaml` | Modify — add `browser` to `interface_types` with required fields `[allowed_domains]`, optional fields `[runtime, default_timeout_ms, login_detection]`. Add `browser_session` to `auth_methods` |
| `integrations/browser.yaml` | Create — service `browser`, interface type `browser`, `allowed_domains: []` (placeholder; actual targets declare their own). Declares eight primitives: `browser.navigate`, `browser.click`, `browser.type`, `browser.select`, `browser.wait_for`, `browser.extract`, `browser.snapshot`, `browser.submit`. Each with parameter schema |
| `src/engine/integration-handlers/browser-runtime.ts` | Create — `BrowserRuntime` interface. Methods: `launch()`, `createContext(storageState?)`, `navigate(ctx, url)`, `click(ctx, selector)`, `type(ctx, selector, text)`, `select(ctx, selector, value)`, `waitFor(ctx, target, timeoutMs)`, `extract(ctx, selector, attribute?)`, `snapshot(ctx)`, `submit(ctx, formSelector?)`, `disposeContext(ctx)`, `shutdown()`. All return `Promise<RuntimeResult<T>>` with `NOT_IMPLEMENTED_YET` marker in 183 |
| `src/engine/integration-handlers/browser-runtime-local.ts` | Create — local (in-process) implementation. Every method returns `{ ok: false, code: "NOT_IMPLEMENTED_YET" }` in 183. Brief 184 fills these in with Playwright calls |
| `src/engine/integration-handlers/browser.ts` | Create — handler. Exports `executeBrowser(input, ctx)`. Reads service from registry, loads `BrowserRuntime` implementation by `runtime` field (default `local`), dispatches per tool name. Returns structured tool-result payloads with stable shape |
| `src/engine/integration-handlers/browser.test.ts` | Create — tests: (a) handler is registered in the dispatch index, (b) registry loads `integrations/browser.yaml` without validation error, (c) schema validator rejects a `browser` interface entry missing `allowed_domains`, (d) schema validator rejects `allowed_domains: []`, (e) calling any primitive returns structured `NOT_IMPLEMENTED_YET` (proves the seam), (f) `BrowserRuntime` interface contract — all methods present, types line up |
| `src/engine/integration-handlers/index.ts` | Modify — register `browser` handler entry |
| `src/engine/vault-helpers.ts` (or equivalent) | Modify — add `getBrowserSession(service, userId)`: reads `credentials` row, decrypts, validates payload discriminator `kind === "browser-session"`, returns typed `{ storageState, capturedAt, userAgent }`. Throws on discriminator mismatch. Pure read helper — no write side effect in this brief |
| `docs/landscape.md` | Modify — upgrade Playwright entry from `referenced in research` to `DEPEND candidate (pending Brief 184 spike)` with adoption date TBD |

**Not modified in 183** (lands in 184): `src/engine/integration-handlers/scrub.ts`, `src/cli/commands/*`, `docs/architecture.md` (the Layer 3 mention), `package.json` Playwright dependency.

## User Experience

- **Jobs affected:** None — this brief has no user-facing surface.
- **Primitives involved:** None.
- **Process-owner perspective:** The user sees nothing after this brief ships. The handler exists but every primitive returns `NOT_IMPLEMENTED_YET`. Brief 184 is when the user first interacts.
- **Interaction states:** N/A.
- **Designer input:** Not invoked.

## Acceptance Criteria

1. [ ] `docs/adrs/032-browser-integration-protocol.md` exists, Status: accepted. Cites supersedes-in-part relationship to ADR-005. Documents stateful BrowserContext lifecycle.
2. [ ] `integrations/00-schema.yaml` declares `browser` interface type with `allowed_domains` as required field. `browser_session` added to `auth_methods`.
3. [ ] Schema validator rejects a service YAML whose `browser` interface entry omits `allowed_domains`. Test covers.
4. [ ] Schema validator rejects `allowed_domains: []` (empty list). Test covers.
5. [ ] `integrations/browser.yaml` loads successfully; declares eight primitives with parameter schemas.
6. [ ] `src/engine/integration-handlers/browser-runtime.ts` defines the `BrowserRuntime` interface; compiles cleanly; no Playwright import.
7. [ ] `src/engine/integration-handlers/browser-runtime-local.ts` implements the interface; every method returns structured `NOT_IMPLEMENTED_YET`; no Playwright import.
8. [ ] `src/engine/integration-handlers/browser.ts` registered in handler index; invoking any of the eight primitives returns the structured `NOT_IMPLEMENTED_YET` result from the runtime (proves the seam end-to-end).
9. [ ] `getBrowserSession(service, userId)` vault helper exists; throws on missing row; throws on discriminator mismatch; returns typed payload on success. Tests cover all three cases with a mocked vault.
10. [ ] Type-check passes at repo root. Existing integration-handler tests unchanged and passing.

## Review Process

1. Spawn review agent with `docs/architecture.md`, `docs/review-checklist.md`, ADR-005, Brief 182, and this brief.
2. Review agent specifically checks:
   - Is ADR-032's supersedes-in-part relationship to ADR-005 correctly framed? Does it document why browser is stateful-different, not just why it's-a-new-protocol?
   - Is the `BrowserRuntime` interface shape minimal? Any method that could be moved out of the interface into handler-level logic should be.
   - Does the schema validator actually reject missing `allowed_domains`, or just warn?
   - Is the vault discriminator approach consistent with how OAuth vs API-key payloads are currently distinguished?
   - Are the `NOT_IMPLEMENTED_YET` returns structured enough that Brief 184 can replace them incrementally without signature changes?
   - Does the brief hold discipline — no scrub / no CLI / no trace leaks in from 184?
3. Fresh-context reviewer re-reads: does this brief actually size to one seam per Insight-004?
4. Present work + review findings to human.

## Smoke Test

```bash
pnpm run type-check
# Expect: clean

pnpm cli sync
pnpm cli inspect integration browser
# Expect: handler registered, eight primitives listed

# Schema validator negative test
cat > /tmp/bad-service.yaml <<EOF
service: test-bad
description: no allowed_domains
interfaces:
  browser: {}
preferred: browser
EOF
pnpm cli validate-integration /tmp/bad-service.yaml
# Expect: exit non-zero with message citing missing allowed_domains

# Handler dispatch smoke
pnpm vitest run src/engine/integration-handlers/browser.test.ts
# Expect: all 6+ tests pass; NOT_IMPLEMENTED_YET returned structurally

# Vault helper
pnpm vitest run -t "getBrowserSession"
# Expect: round-trip test passes, discriminator-mismatch throws cleanly
```

## After Completion

1. Update `docs/state.md` — Brief 183 complete; Brief 184 next.
2. Update `docs/landscape.md` — Playwright entry note accurate.
3. ADR-032 accepted and linked from ADR-005 via standard ADR cross-reference header ("Superseded-in-part by ADR-032 for the browser protocol").
4. Quick retrospective note in state.md: did the `BrowserRuntime` interface come out well-sized for the runtime swap, or did the review find it too tightly coupled to local Playwright?
5. Builder moves to Brief 184 immediately — the skeleton is only valuable when filled.
