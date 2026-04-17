# Brief: Tool Output Credential Scrubbing (P0 security)

**Date:** 2026-04-16
**Status:** complete
**Depends on:** Brief 169 (parent)
**Unlocks:** Safe reflection of tool results into LLM context without credential leakage.

## Goal

- **Roadmap phase:** Phase 3 Integrations hardening
- **Capabilities:** Closes P0 credential-leak risk: tool output returned to the agent is not currently scrubbed.

## Context

`scrubCredentials()` in `src/engine/integration-handlers/cli.ts:54-65` and `rest.ts:115-116` runs when producing log lines, but when the tool output is returned to the agent in `src/engine/tool-resolver.ts:1100-1107` (CLI) and `:1137-1152` (REST), the raw stdout / parsed JSON is passed straight through. If an external API returns a credential in an error body (seen in real-world APIs: GitHub "token prefix exposed", Slack "xoxp-..." in error path, AgentMail replay of headers), Ditto hands that secret to the LLM. From there it can land in memories, activity logs, SSE streams, and — in the worst case — be echoed to the user.

This is the opposite direction of the existing scrub path: outbound-from-Ditto logs are scrubbed; inbound-to-LLM tool results are not.

## Objective

No credential value known to the vault or env vars is visible in any string returned from a tool invocation to the agent, to memories, to activity records, or to SSE events.

## Non-Goals

- Detecting generic secrets (arbitrary JWTs, inline bearer tokens) that are not in the vault/env. That requires entropy/pattern scanning, deferred.
- Scrubbing in the vault itself (already encrypted at rest).
- Modifying the LLM provider abstraction.

## Inputs

1. `src/engine/tool-resolver.ts:1000-1220` — tool dispatch + result return
2. `src/engine/integration-handlers/cli.ts:54-170` — current scrub logic
3. `src/engine/integration-handlers/rest.ts:100-160` — REST scrub logic
4. `src/engine/credential-vault.ts:288-364` — `resolveServiceAuth` surface
5. `src/engine/harness-handlers/feedback-recorder.ts` — where tool results are persisted to memories/step outputs

## Constraints

- Must not mutate the tool's raw return if the caller passes a parsed object — scrub on a copy.
- Must preserve the current log scrub (don't regress double-scrubbing).
- Redaction token must be unambiguous: `[REDACTED:{serviceName}]`.
- Performance: O(n × m) where n = output size, m = number of secrets, but secrets are capped per-process → acceptable for typical outputs. Document any output over 1MB bypasses scrub with a log warning.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Redaction-by-value pattern | `integration-handlers/cli.ts:54-65` existing scrub | adopt | Same approach, new insertion point |
| Recursive object walker | Lodash `_.cloneDeepWith` pattern | pattern | Walk parsed JSON tool results without touching primitives unnecessarily |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/integration-handlers/scrub.ts` | Create: export `scrubCredentialsFromValue<T>(value: T, secrets: string[]): T` that recursively walks strings in objects/arrays and redacts known credential values |
| `src/engine/integration-handlers/cli.ts` | Modify: extract shared scrubber helper; apply to tool result before return |
| `src/engine/integration-handlers/rest.ts` | Modify: apply scrubber to parsed JSON + raw text before return |
| `src/engine/tool-resolver.ts` | Modify: apply final scrub at the tool-dispatch return boundary — belts-and-braces even if handler forgets |
| `src/engine/credential-vault.ts` | Modify: export `getKnownSecretsForProcess(processId, service?)` returning the set of active credential values for scrubbing |
| `src/engine/integration-handlers/scrub.test.ts` | Create: unit tests for nested object scrubbing, overlap handling, 1MB cap |
| `src/engine/tool-resolver.test.ts` | Modify: regression test "credential in simulated API error response is redacted before LLM sees it" |

## User Experience

- **Jobs affected:** None directly. Security/privacy fix; users don't see it unless it prevents a leak they'd otherwise hit.

## Acceptance Criteria

1. [ ] New `scrubCredentialsFromValue` walks strings in objects/arrays/tuples and replaces known secret values with `[REDACTED:{service}]`.
2. [ ] CLI + REST handlers apply scrub to the returned result (not just logs) before return.
3. [ ] `tool-resolver.ts` applies a safety-net scrub at the dispatch boundary, so a future handler that forgets to scrub cannot leak.
4. [ ] Test: simulated GitHub 401 error body containing the token is redacted in the returned value.
5. [ ] Test: nested JSON `{ "data": { "auth": "<token>" } }` is scrubbed recursively.
6. [ ] Test: value larger than 1MB skips recursive walk (logged), raw string-level scrub only, so we don't stall the runtime on massive outputs.
7. [ ] `getKnownSecretsForProcess` respects process scope — only secrets for this run, not others.
8. [ ] Existing log-scrub tests still pass unchanged.

## Review Process

1. Review agent verifies: no path from `dispatchToolCall` return to `stepRuns.output` / `harnessDecisions` / SSE without passing through the scrubber.
2. Cross-check memory-assembly: a redacted string in a memory stays redacted (memory write happens after scrub).
3. Confirm env-var-only credentials are also scrubbed, not just vault values.

## Smoke Test

```bash
pnpm test -- scrub tool-resolver integration-handlers
# All three suites green; new scrub tests pass.
```

## After Completion

Update `docs/state.md`: "Brief 171 — tool output scrubbing (2026-04-16, complete): credential values from vault+env are redacted from tool results before they cross the LLM boundary. Three-layer scrub (handler, dispatch boundary, log)."
