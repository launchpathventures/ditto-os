# Brief: Test Infrastructure

**Date:** 2026-03-21
**Status:** draft
**Depends on:** None (standalone infrastructure)
**Unlocks:** All future briefs (Builder can run `pnpm test`, Reviewer can verify test evidence)

## Goal

- **Roadmap phase:** Cross-cutting infrastructure (not a phase capability — enables all phases)
- **Capabilities:** `pnpm test` script, integration tests for core engine paths, Builder contract fulfilled

## Context

After 4 phases of engine building (storage, harness, trust, workspace foundation), there is zero automated test coverage. The Builder contract (updated per Insight-038) requires `pnpm test` and test authoring, but no test framework exists. Every phase has relied on manual smoke tests and the review loop. The review loop has found real bugs 13 times — but without regression tests, the same class of bug can be reintroduced.

The QA research (`docs/research/qa-tester-role-in-dev-pipeline.md`) concluded: for a CLI-only project, the Aider pattern (test-running baked into the build loop) is the right approach. vitest is the standard choice for TypeScript projects — fast, ESM-native, no config boilerplate.

## Objective

`pnpm test` runs a vitest suite that covers the core engine paths. The Builder includes test evidence in handoff notes. Regressions in heartbeat, trust, harness, and human steps are caught automatically.

## Non-Goals

- Full coverage — test the critical paths, not every line
- Browser/E2E testing — CLI-only project (re-entry: Phase 10, Insight-038)
- LLM-based QA agent — research showed these are unreliable (CrewAI finding)
- Mocking the Claude API — tests target engine logic, not adapter output
- Testing CLI commands end-to-end — those involve interactive prompts and DB state; smoke tests remain manual for CLI UX

## Inputs

1. `docs/research/qa-tester-role-in-dev-pipeline.md` — QA patterns across 11 projects
2. `docs/insights/038-testing-is-a-quality-dimension-not-always-a-role.md` — testing belongs in the build loop
3. `src/engine/heartbeat.ts` — primary test target (heartbeat cycle, human step suspend/resume)
4. `src/engine/trust.ts` — trust computation, tier evaluation
5. `src/engine/trust-diff.ts` — structured diff, edit severity classification
6. `src/engine/process-loader.ts` — YAML parsing, dependency validation
7. `src/engine/harness-handlers/feedback-recorder.ts` — correction pattern extraction

## Constraints

- MUST use vitest (TypeScript-native, ESM, fast — standard for 2026 TypeScript projects)
- MUST use a separate test database (not `data/agent-os.db`) — tests create/destroy their own DB
- MUST NOT mock the database — tests use real SQLite via better-sqlite3 (the QA research + Phase 3 retro both validated: "mocked tests passed but prod migration failed")
- MUST NOT require API keys to run — skip/mock any test that would call Claude
- The Anthropic SDK client is constructed at import time in `review-pattern.ts` and `claude.ts`. Heartbeat tests transitively import these modules. Use vitest module mocks (`vi.mock`) for the Anthropic SDK to prevent import-time failures. This is NOT mocking the database — the "no mocks" constraint applies to SQLite, not to external API clients.
- Tests run against the real engine code, not test doubles
- Test files live alongside source: `src/**/*.test.ts` (vitest convention, co-located)
- When removing the `captures` table, verify `pnpm cli sync` succeeds on an existing DB that has the table (drizzle-kit push will drop it)

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| vitest as test runner | vitest.dev (Vite ecosystem) | TypeScript-native, ESM, fast, zero-config for TS projects. Standard choice 2026. |
| Test-in-build-loop pattern | Aider (paul-gauthier/aider) | Auto-runs tests after edits. Research Option D — best fit for CLI project. |
| Real DB, not mocks | Agent OS Phase 3 retro + QA research | "Mocked tests passed but prod migration failed." Integration tests must hit real SQLite. |
| Co-located test files | vitest convention | `foo.ts` → `foo.test.ts` in same directory. Easy to find, easy to maintain. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `package.json` | Modify: Add `vitest` devDependency, add `"test": "vitest run"` and `"test:watch": "vitest"` scripts |
| `vitest.config.ts` | Create: vitest config with TypeScript paths, test DB setup |
| `src/test-utils.ts` | Create: Shared test helpers — fresh DB creation, process definition fixtures, cleanup |
| `src/engine/process-loader.test.ts` | Create: YAML parsing, dependency validation, cycle detection, human step input_fields |
| `src/engine/trust-diff.test.ts` | Create: Structured diff, edit ratio, severity classification |
| `src/engine/heartbeat.test.ts` | Create: Start → execute → complete cycle, human step suspend/resume, parallel group execution |
| `src/engine/harness-handlers/feedback-recorder.test.ts` | Create: Correction pattern extraction, pattern counting, memory bridge |
| `src/engine/trust.test.ts` | Create: Trust state computation, tier evaluation, upgrade/downgrade logic |
| `src/db/schema.ts` | Modify: Remove dead `captures` table (superseded by `workItems` — the old `capture` command wrote here, the new one writes to `workItems`) |
| `tsconfig.json` | Modify: Add `"include": ["src/**/*"]` already covers test files; may need vitest types |

## User Experience

- **Jobs affected:** None — no user-facing changes
- **Primitives involved:** None
- **Designer input:** Not invoked — pure infrastructure

## Acceptance Criteria

1. [ ] `pnpm test` runs vitest and exits cleanly (no hanging processes, no leftover DB files)
2. [ ] Tests use a fresh in-memory or temp-file SQLite database (not `data/agent-os.db`)
3. [ ] `process-loader.test.ts`: YAML with human step + input_fields parses correctly
4. [ ] `process-loader.test.ts`: Circular dependency detection throws an error
5. [ ] `trust-diff.test.ts`: Known edit pair produces correct severity classification (formatting < 0.1, correction 0.1-0.3, revision 0.3-0.6, rewrite > 0.6)
6. [ ] `trust-diff.test.ts`: Identical strings produce edit ratio 0
7. [ ] `heartbeat.test.ts`: Script step executes and produces step run with status `approved` (using a test process with script executor)
8. [ ] `heartbeat.test.ts`: Human step suspends run to `waiting_human` and creates action work item
9. [ ] `heartbeat.test.ts`: `resumeHumanStep` with input data marks step approved and continues execution
10. [ ] `feedback-recorder.test.ts`: `extractCorrectionPattern` returns pattern from a diff with removed words
11. [ ] `feedback-recorder.test.ts`: `checkCorrectionPattern` returns null with fewer than 3 matches, returns pattern+count with 3+
12. [ ] `trust.test.ts`: Trust computation returns correct approval rate from a set of test feedback records
13. [ ] The dead `captures` table is removed from `src/db/schema.ts`
14. [ ] `pnpm run type-check` still passes after all changes
15. [ ] No test requires an `ANTHROPIC_API_KEY` environment variable

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: tests use real DB (not mocks), no API key dependency, test coverage targets match the critical engine paths, `captures` table removal doesn't break any imports

## Smoke Test

```bash
# Run the full test suite
pnpm test

# Expected: all tests pass, clean exit, no leftover DB files
# Expected: no test requires ANTHROPIC_API_KEY

# Verify type-check still passes
pnpm run type-check

# Verify the captures table is gone
grep -r "captures" src/db/schema.ts
# Expected: no results (table removed)

# Verify CLI still works (captures table removal doesn't break anything)
pnpm cli sync
pnpm cli status
```

## After Completion

1. Update `docs/state.md` with test infrastructure as working
2. Update `docs/roadmap.md` — no phase status change, but note test infrastructure as cross-cutting
3. Remove any debt item related to missing test suite
