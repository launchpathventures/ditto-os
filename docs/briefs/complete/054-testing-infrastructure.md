# Brief 054: Testing Infrastructure — Playwright E2E + Web Component Tests

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 053 (Execution Pipeline Wiring — pipeline flows through UI, review gates surface)
**Unlocks:** Automated quality verification for all future briefs, CI/CD pipeline

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (Composable Workspace Architecture, ADR-024)
- **Capabilities:** Playwright e2e test infrastructure, key user flow tests for Briefs 050-053, CI workflow

## Context

The engine has 20+ vitest unit test files covering trust, heartbeat, tools, LLM, and self. Zero frontend tests exist — no Playwright, no component tests, no e2e. The web app is the primary surface for the dev process but has no automated verification.

The dev pipeline's Builder role contract says "MUST run `pnpm test`" and Reviewer says "MUST verify Builder ran tests." Brief 051 gives them `run_command` to execute tests. But there are no web tests to run. The pipeline can verify engine code but not the UI it produces.

Briefs 050-053 add significant UI surface: markdown rendering in TextBlock, ArtifactBlock in artifact mode, ProgressBlock for pipeline progress, review prompts via SSE, and session trust controls. Without e2e tests, regressions are invisible until manual smoke testing.

### Current Test State

| Layer | Framework | Files | Coverage |
|-------|-----------|-------|----------|
| Engine (src/) | vitest | 20+ test files | Good — trust, heartbeat, tools, LLM, self |
| Web components | None | 0 | None |
| Web e2e | None | 0 | None |
| CI/CD | None | No workflows | None |

## Objective

Set up Playwright for e2e tests and write the critical flow tests that verify Briefs 050-053 work end-to-end. Establish the test infrastructure so every future brief includes testable acceptance criteria that the Builder can verify.

## Non-Goals

- Full test coverage of all 25+ block components — test the critical path only
- Visual regression testing (Percy, Chromatic) — separate concern
- Load/performance testing — separate concern
- Mobile e2e tests — desktop first
- Custom per-test LLM response scripting — canned responses are keyed by input message patterns, not individually scripted per test case
- Component-level unit tests for every block — focus on e2e integration

## Inputs

1. `vitest.config.ts` — existing test configuration
2. `src/test-setup.ts` — LLM SDK mocks
3. `packages/web/app/page.tsx` — web app entry point
4. `packages/web/app/api/chat/route.ts` — chat API route
5. `packages/web/app/api/processes/route.ts` — process API route
6. `packages/web/app/api/events/route.ts` — SSE route
7. `packages/web/components/blocks/block-registry.tsx` — block registry (21 types)
8. `packages/web/components/layout/workspace.tsx` — workspace layout
9. `packages/web/components/layout/artifact-layout.tsx` — artifact mode layout
10. `docs/briefs/050-artifact-block-markdown-rendering.md` — what to test (markdown, artifact mode)
11. `docs/briefs/051-shell-execution-tool.md` — what to test (command output blocks)
12. `docs/briefs/052-planning-workflow.md` — what to test (planning conversation flow)
13. `docs/briefs/053-execution-pipeline-wiring.md` — what to test (pipeline trigger, progress, review)

## Constraints

- **Playwright for manual e2e tests + expect-cli for AI-generated tests.** Two complementary layers: (1) hand-written Playwright specs for critical known flows (blocks, artifact mode, pipeline, planning) running with `MOCK_LLM=true`, and (2) `expect-cli` (millionco/expect) for AI-generated tests from code diffs. expect-cli uses Playwright internally — same browser, same assertions. **expect-cli does not call LLMs directly** — it speaks the Agent Client Protocol (ACP) and spawns a coding agent as a subprocess. The agent handles its own LLM connection. expect-cli supports 7 agent backends: Claude Code, Codex, Copilot, Gemini CLI, Cursor, OpenCode, Droid. For Ditto development, expect-cli uses Claude Code (`-a claude`) as its agent backend — no separate API key configuration needed since Claude Code manages its own auth. `MOCK_LLM=true` is NOT set when running expect-cli — it tests the real app against actual UI behavior. **Future: Ditto ACP adapter.** Ditto could expose an ACP-compatible agent (`ditto-acp`) that routes prompts through Ditto's own LLM layer, allowing expect-cli to use Ditto's configured provider/model. This is a future optimization — the ACP interface is simple (JSON-RPC over stdio) but building a compliant adapter is out of scope for this brief.
- **Tests run against the real app.** Playwright starts the web server via `webServer` config. Locally: `pnpm dev`. In CI: `pnpm build && pnpm start` (production build is faster and more stable for testing).
- **LLM calls are mocked via environment flag.** The vitest `test-setup.ts` mocks (vi.mock) do NOT work with Playwright — the server runs in a separate process. Instead: add a `MOCK_LLM=true` environment variable that the server checks. When set, `initLlm()` short-circuits (does not require `LLM_PROVIDER`/`LLM_MODEL` env vars or API keys), and `createCompletion()` / `createStreamingCompletion()` return deterministic canned responses. Canned responses are keyed by regex patterns on the user message content (e.g., `/build brief/i` → `start_pipeline` tool_use response). Unmatched patterns return a generic text response ("I'll help with that.") — never throw. Canned response fixtures live in `src/test-fixtures/`. This means e2e tests verify the UI flow with realistic but deterministic data.
- **Database reset via test-only API endpoint.** A `POST /api/test/reset` endpoint (guarded by `NODE_ENV=test` check) truncates all tables and re-seeds with minimal test data (a process definition, a work item, a user session). Playwright's `beforeAll` in each spec file calls this endpoint. The server holds the DB connection, so external file replacement won't work — the reset must go through the server.
- **Tests must be runnable by the Builder.** `pnpm test:e2e` runs Playwright. The `run_command` allowlist (Brief 051) permits `pnpm run` and `pnpm test`.
- **Use `expect` assertions from Playwright.** The user specifically wants Playwright `.expect` patterns for UI verification.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Playwright setup | @playwright/test | depend | Industry standard for e2e testing, mature (v1+), active community |
| AI-generated tests | millionco/expect (`expect-cli`) | adopt | AI-driven browser testing from code diffs. 2.7k stars, TypeScript, uses Playwright internally. Speaks Agent Client Protocol (ACP) to spawn coding agents (Claude Code, Codex, etc.) for test plan generation. Complements hand-written specs with diff-aware coverage. |
| Page object pattern | Playwright best practices docs | pattern | Established pattern for maintainable e2e tests |
| Test fixtures | Playwright fixtures API | depend | Built-in mechanism for setup/teardown |
| Database reset | vitest beforeEach pattern | pattern | Adapting existing engine test pattern for e2e |
| CI workflow | GitHub Actions | depend | Standard CI platform |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `playwright.config.ts` | Create: Playwright configuration. Base URL `http://localhost:3000`. Headless mode. Single browser (Chromium). Timeout 30s per test. Web server command: `pnpm dev` (local) / `pnpm build && pnpm start` (CI, controlled via env var). Reporter: HTML + list. |
| `packages/web/e2e/fixtures.ts` | Create: Test fixtures. Database reset helper (calls `POST /api/test/reset`). App URL helper. `MOCK_LLM=true` environment setup. |
| `packages/web/app/api/test/reset/route.ts` | Create: Test-only database reset endpoint. Guarded by `NODE_ENV=test`. Truncates all tables, re-seeds with minimal test data (one process definition, one work item, one session). Returns 403 if not in test mode. |
| `src/engine/llm-mock.ts` | Create: Mock LLM responses for e2e testing. Exports `mockCreateCompletion()` and `mockCreateStreamingCompletion()` that return canned responses keyed by regex patterns on user message content. Unmatched patterns return a generic text response (never throw). Canned fixtures cover: "build brief" → start_pipeline tool_use, "plan" / "I want to add" → plan_with_role tool_use, general questions → inline text response. |
| `src/engine/llm.ts` | Modify: `initLlm()` short-circuits when `MOCK_LLM=true` (skips provider/model env var checks, does not instantiate SDK clients). `createCompletion()` delegates to `mockCreateCompletion()` when flag is set. |
| `src/engine/llm-stream.ts` | Modify: `createStreamingCompletion()` delegates to `mockCreateStreamingCompletion()` when `MOCK_LLM=true`. Must check the flag before instantiating Anthropic/OpenAI SDK clients. |
| `packages/web/e2e/page-objects/conversation.ts` | Create: Page object for conversation view. Selectors: message input, send button, message list, tool invocation blocks, content blocks by type. Actions: sendMessage, waitForResponse, getBlocks, getLatestBlock. |
| `packages/web/e2e/page-objects/workspace.ts` | Create: Page object for workspace view. Selectors: sidebar nav, center canvas, right panel, artifact mode. Actions: navigateTo, enterArtifactMode, exitArtifactMode, getRightPanelContent. |
| `packages/web/e2e/blocks.spec.ts` | Create: Block rendering tests. Verify TextBlock renders markdown (headers, code blocks, lists). Verify ArtifactBlock renders title + status + actions. Verify ProgressBlock renders progress bar with percentage. Verify ChecklistBlock renders items with status indicators. |
| `packages/web/e2e/artifact-mode.spec.ts` | Create: Artifact mode tests (Brief 050). Verify: artifact mode layout renders three columns. TextBlock in artifact host renders markdown via react-markdown. Exiting artifact mode restores workspace. Responsive breakpoints collapse correctly. |
| `packages/web/e2e/pipeline.spec.ts` | Create: Pipeline flow tests (Brief 053). Verify: sending "Build Brief X" triggers pipeline. ProgressBlock appears with step count. SSE events update progress. Review gate pauses and shows review prompt. Approve continues pipeline. Completion shows final status. |
| `packages/web/e2e/planning.spec.ts` | Create: Planning workflow tests (Brief 052). Verify: planning conversation triggers plan_with_role (not start_dev_role). Role reads documents. Proposed output appears as ArtifactBlock. |
| `package.json` | Modify: Add `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`, `"test:e2e:auto": "expect-cli -a claude -y --target changes"` scripts. Add `@playwright/test` and `expect-cli` as devDependencies. |
| `.github/workflows/test.yml` | Create: CI workflow. Triggers on push/PR. Steps: install deps, type-check, unit tests (pnpm test), e2e tests (pnpm test:e2e). Playwright browser install step. Upload test report as artifact. Note: `test:e2e:auto` (expect-cli) is NOT run in CI initially — it requires Claude Code as an ACP agent backend, which needs auth configuration in the CI environment. Add as a separate CI job when agent auth in CI is solved. |

## User Experience

- **Jobs affected:** None directly — testing infrastructure is invisible to the end user
- **Primitives involved:** None — internal development tooling
- **Process-owner perspective:** The dev pipeline Builder runs `pnpm test:e2e` as part of verification. The Reviewer independently runs the same tests. Test results appear as ChecklistBlock (pass/fail per suite) in the step output. The user sees "Tests: 12/12 passed" in the review, not just a claim that it works.
- **Interaction states:** N/A — no user-facing interaction states
- **Designer input:** Not invoked — testing infrastructure has no UI design.

## Acceptance Criteria

1. [ ] `@playwright/test` installed as devDependency. `playwright.config.ts` created at project root with Chromium, headless, base URL `http://localhost:3000`, web server command configurable (dev locally, production build in CI).
2. [ ] `pnpm test:e2e` runs Playwright tests with `MOCK_LLM=true` and `NODE_ENV=test`. `pnpm test:e2e:ui` opens Playwright UI mode.
3. [ ] `llm-mock.ts` provides canned LLM responses keyed by regex patterns on user message content. `llm.ts` `initLlm()` short-circuits when `MOCK_LLM=true` (no API keys needed). `createCompletion()` and `createStreamingCompletion()` delegate to mocks when flag is set. Unmatched patterns return generic text response (never throw). Canned responses include realistic Self tool_use blocks (e.g., `/build brief/i` → `start_pipeline` tool call).
4. [ ] `POST /api/test/reset` endpoint resets database state. Guarded by `NODE_ENV=test` (returns 403 otherwise). Each spec file calls this in `beforeAll`.
5. [ ] Page objects created for conversation and workspace views with typed selectors and actions.
6. [ ] `blocks.spec.ts`: TextBlock renders markdown (h1/h2, code blocks, bullet lists verified via Playwright `.expect`). ArtifactBlock renders title + status badge. ProgressBlock renders bar with percentage. ChecklistBlock renders items.
7. [ ] `artifact-mode.spec.ts`: Three-column layout renders. Markdown content visible in artifact host. Exit returns to workspace mode.
8. [ ] `pipeline.spec.ts`: Pipeline trigger produces correct UI response (ProgressBlock appears with step count). Review gate shows inline review prompt. Approve action triggers continuation. Tests verify UI rendering with deterministic mock data — they do not verify LLM quality or real pipeline execution.
9. [ ] `planning.spec.ts`: Planning message triggers plan_with_role response in mocked Self. Proposed output appears as ArtifactBlock with "Pending Approval" status.
10. [ ] `.github/workflows/test.yml` runs type-check, unit tests, and e2e tests on push/PR. Uses `pnpm build && pnpm start` for stable CI environment.
11. [ ] `pnpm run type-check` passes with 0 errors.
12. [ ] `expect-cli` installed as devDependency. `pnpm test:e2e:auto` runs AI-generated tests via `expect-cli -a claude -y --target changes` (uses Claude Code as ACP agent backend). No separate API key configuration — Claude Code manages its own auth.
13. [ ] Builder role contract (`.claude/commands/dev-builder.md`) updated: Builder MUST run `pnpm test:e2e` (manual specs) AND `pnpm test:e2e:auto` (AI-generated from diff) before completing.
14. [ ] Existing vitest unit tests continue to pass (no regression from Playwright installation or mock mode).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - **Test quality**: Tests verify actual user flows, not implementation details. Assertions use Playwright expect patterns.
   - **Isolation**: Database reset prevents test pollution. Tests don't depend on execution order.
   - **CI integration**: Workflow runs all test types. Failure blocks merge.
   - **Maintainability**: Page objects abstract selectors. Tests read like user stories.
   - No regressions to existing test infrastructure.
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Install Playwright
cd /Users/thg/conductor/workspaces/agent-os/paris
npx playwright install chromium

# 2. Run e2e tests
pnpm test:e2e

# 3. Verify all test suites pass:
#    blocks.spec.ts — block rendering
#    artifact-mode.spec.ts — artifact layout
#    pipeline.spec.ts — pipeline trigger + progress + review
#    planning.spec.ts — planning workflow

# 4. Run in UI mode for visual verification
pnpm test:e2e:ui

# 5. Verify existing unit tests still pass
pnpm test

# 6. Verify type-check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark "Testing Infrastructure" as done
3. Update `docs/dev-process.md` — document e2e test expectations for Builder and Reviewer roles
4. Phase retrospective: Are the page objects maintainable? Is database reset reliable? Do mocked LLM responses produce realistic test scenarios?
5. Next: Brief 055 (Scope Selection + Roadmap Visualization)
