# Brief: YAML Round-Trip Validation (P0 correctness)

**Date:** 2026-04-16
**Status:** complete
**Depends on:** Brief 169 (parent)
**Unlocks:** `generate_process(save=true)` cannot store unparseable YAML.

## Goal

- **Roadmap phase:** Phase 14 — process authoring hardening
- **Capabilities:** Closes P0: LLM can produce a `ProcessDefinition` that serializes successfully but cannot be parsed back, storing junk in the DB until the first run fails mysteriously.

## Context

`generate-process.ts:185` stringifies the LLM-composed `ProcessDefinition` via `YAML.stringify()` and stores it. Validation runs on the object tree (step executor enum, dependency cycles, tool refs), *not* on the stringified output. Edge cases where structural validation passes but the resulting YAML contains non-serializable values, illegal indentation, or character-set issues are possible — and the failure mode is "first heartbeat tick on this process crashes on parse".

## Objective

After `generate_process` returns `save=true` success, the stored YAML is guaranteed parseable, produces a definition structurally equal to what we intended to store, and passes `process-loader` validation.

## Non-Goals

- Revalidating existing processes in the DB (separate migration concern).
- Schema evolution / `processVersions` migration — handled by Brief 174 for overrides and Brief 164 for version history already.

## Inputs

1. `src/engine/self-tools/generate-process.ts` — `handleGenerateProcess` function
2. `src/engine/process-loader.ts` — `validateProcessDefinition`, `validateStepTools`, `validateProcessIo`
3. `src/engine/self-tools/edit-process.ts` — similar path, same fix applies
4. YAML library in use (`yaml` npm package)

## Constraints

- Must not require a second LLM call on failure — fail fast with a structured error the Self can relay to the user.
- Must not duplicate the existing object-level validators; reuse them after re-parse.
- Error message must cite the offending field path when possible.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Round-trip serialization test | Protobuf / JSON schema validation canon | pattern | Standard check for any code that stores serialized objects |
| Deep-equal comparison | `packages/web/` test helpers / Node assert.deepStrictEqual | adopt | Existing utility |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-tools/generate-process.ts` | Modify: after `YAML.stringify`, call `YAML.parse`, run `validateProcessDefinition` on the reparsed object, assert structural equality with the pre-serialization object. On any failure, return a tool result with `success: false` and a reason the LLM can see and retry from. |
| `src/engine/self-tools/edit-process.ts` | Modify: same round-trip guard on edit. |
| `src/engine/self-tools/yaml-round-trip.ts` | Create: shared helper `roundTripValidate(definition: ProcessDefinition): { yaml: string } \| { error: string; path?: string[] }` |
| `src/engine/self-tools/generate-process.test.ts` | Modify: add test with a deliberately problematic value (e.g. string containing `\0`, or a number that YAML would write in flow-style that breaks block parsing) |

## User Experience

- **Jobs affected:** Define (process authoring trust).
- **Process-owner perspective:** Instead of "process created" → "first run fails mysteriously", the user gets an immediate "I couldn't lock this in — the definition round-trips to invalid YAML at `steps[2].config.prompt`. Try removing the backticks." message.

## Acceptance Criteria

1. [ ] `roundTripValidate` helper exists and is pure (no DB, no side effects).
2. [ ] `generate_process(save=true)` calls `roundTripValidate` and only writes to DB on success.
3. [ ] `edit_process` calls the same helper on the updated definition before committing.
4. [ ] Test: definition with embedded `\0` in a prompt string is rejected with a clear error.
5. [ ] Test: definition that YAML writes in flow-style that doesn't round-trip cleanly is rejected (synthesized case).
6. [ ] Happy path: all existing generate-process tests still pass.
7. [ ] Self delegation guidance gains a one-liner telling the LLM how to react to a round-trip failure (retry with different phrasing, not with `save=true` again).

## Review Process

1. Review agent checks for any bypass path to DB write without round-trip.
2. Confirms error shape is LLM-actionable (JSON with `reason` + `path`).

## Smoke Test

```bash
pnpm test -- generate-process edit-process yaml-round-trip
```

## After Completion

Update `docs/state.md`: "Brief 173 — YAML round-trip validation (2026-04-16, complete): `generate_process`/`edit_process` verify `YAML.parse(YAML.stringify(def))` equals `def` and revalidates via process-loader before DB write."
