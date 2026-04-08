# Brief 112: Continuous Journey Monitoring — Heartbeat-Driven Smoke Test Runner

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Brief 111 (journey smoke tests — the tests this runner executes)
**Unlocks:** Automated regression detection, dev process integration for quality issues

## Goal

- **Roadmap phase:** Cross-cutting (quality infrastructure)
- **Capabilities:** Scheduled runner that executes journey smoke tests daily, creates work items on failure, closes them on recovery, and feeds results into Alex's briefing

## Context

Brief 111 creates the journey smoke tests — real LLM integration tests that verify the 8 critical user journey branches. This brief creates the runner that executes them on a schedule, detects regressions, and feeds failures into the dev process so they get fixed.

Today, test failures are only caught when a developer runs `pnpm test`. There's no continuous verification that the product actually works. A prompt change, LLM provider update, or schema migration could silently break a journey — and nobody would know until a user hits it.

## Objective

Build a scheduled smoke test runner that executes journey tests daily, creates work items for failures (type: bug), closes them automatically on recovery, and includes results in Alex's daily briefing.

## Non-Goals

- **Replacing CI** — this is product health monitoring, not build verification. CI runs unit tests on every commit. This runs journey tests daily.
- **Alerting infrastructure** — failures create work items and appear in briefings. No PagerDuty/Slack integration for V1.
- **Performance monitoring** — this verifies correctness. Performance benchmarking is separate.
- **User-facing status page** — internal quality monitoring only.
- **Separate admin app** — journey monitoring lives within the existing `/admin` surface (Brief 108)

## Inputs

1. `src/engine/journey-smoke.test.ts` — the journey tests from Brief 111
2. `src/engine/pulse.ts` — existing scheduled tick system
3. `src/engine/heartbeat.ts` — existing process advancement
4. `src/engine/briefing-assembler.ts` — existing briefing system to include results
5. `src/engine/self-tools/create-work-item.ts` — work item creation for failures
6. `processes/templates/weekly-briefing.yaml` — briefing includes smoke test status

## Constraints

- Runner executes via the existing pulse/scheduler infrastructure — no new cron daemon
- Each run creates an activity log entry with: tests run, passed, failed, cost, duration
- Failed tests create work items with type `bug`, content describing the failure, and the journey branch name
- When a previously-failing test passes again, the corresponding work item is closed automatically (recovery detection)
- Smoke test results are available to the briefing assembler — "Journey health: 8/8 passing" or "Journey health: 7/8 — Connector journey failing since yesterday"
- Cost per run is tracked and logged (estimated ~$0.20/day for 8 journey tests with Haiku)
- Runner must not block the pulse tick — smoke tests run asynchronously with a timeout
- If a test hangs or times out (>120s per test), it counts as a failure

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Scheduled test runner | CI/CD scheduled pipelines (GitHub Actions cron) | pattern | Periodic automated verification |
| Work item on failure | Sentry/PagerDuty issue creation | pattern | Automated issue creation from detected problems |
| Auto-close on recovery | Sentry auto-resolve | pattern | Don't leave stale issues when problems are fixed |
| Health in briefing | SRE status dashboards in daily standups | pattern | Team sees system health at natural checkpoints |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/smoke-test-runner.ts` | Create: `runJourneySmokeTests()` — spawns vitest subprocess for journey tests, parses results (pass/fail per test including full conversation logs), creates/closes work items, logs to activities table. `getJourneyHealth()` — returns current health status for admin and briefing. `getLatestRunResults()` — returns detailed results including Alex's conversation turns. |
| `src/engine/smoke-test-runner.test.ts` | Create: Unit tests for result parsing, work item creation/closure logic, health status assembly |
| `src/engine/pulse.ts` | Modify: Add `runDailySmokeTests()` to the pulse tick — checks if 24h since last run, if so triggers async smoke test execution |
| `src/engine/briefing-assembler.ts` | Modify: Include journey health in briefing data — "8/8 journeys passing" or "7/8 — [journey name] failing" |
| `packages/web/app/admin/smoke-tests/page.tsx` | Create: Admin page showing journey test results — last run timestamp, pass/fail per test, expandable conversation logs showing what Alex actually said, "Run Now" button to trigger on-demand |
| `packages/web/app/api/v1/network/admin/smoke-tests/route.ts` | Create: GET — returns latest journey health + detailed results. POST — triggers an on-demand smoke test run (admin auth required) |
| `processes/templates/smoke-test-runner.yaml` | Create: Process template for the smoke test runner — scheduled daily, autonomous trust (internal system process) |

## User Experience

- **Jobs affected (admin/developer):** Orient (journey health in briefing), Review (work items for failures)
- **Process-owner perspective:** Developer checks morning briefing. Sees "Journey health: 7/8 — Goal decomposition journey failing since 2026-04-08." Clicks the work item. Sees: "Goal decomposition test failed at step 4: decomposeGoalWithLLM returned 0 sub-goals. Expected 3-8." Fixes the issue. Next day's run: test passes, work item auto-closed. Briefing shows "Journey health: 8/8 passing."
- **Designer input:** Not applicable — developer tooling

## Acceptance Criteria

1. [ ] `runJourneySmokeTests()` spawns `pnpm test:journey` as a subprocess, captures stdout/stderr, and parses results into `{ testName, passed, error?, durationMs, costCents }[]`
2. [ ] For each failed test, checks if a work item already exists for that journey (by content match). If not, creates one with type `bug` and content: "[journey name] smoke test failed: [error summary]"
3. [ ] For each passing test that has an open work item, closes the work item automatically (status → completed, context notes "auto-recovered")
4. [ ] `getJourneyHealth()` returns `{ total, passing, failing, failingJourneys: string[], lastRunAt, lastRunCostCents }`
5. [ ] Briefing assembler includes journey health when available — shows as a single line in the "System Health" section of the briefing
6. [ ] Pulse tick checks `lastSmokeTestRunAt` — only triggers if 24+ hours since last run
7. [ ] Smoke test runs asynchronously (setImmediate pattern, same as goalHeartbeatLoop) — does not block the pulse tick
8. [ ] Individual test timeout: 120 seconds. Total run timeout: 15 minutes. Timeouts count as failures.
9. [ ] Activity log entry created per run: `action: "smoke_test.run"`, metadata: `{ total, passed, failed, costCents, durationMs }`
10. [ ] Cost per run tracked in activity metadata — enables monitoring spend over time
11. [ ] `smoke-test-runner.yaml` process template: scheduled daily, autonomous trust, system process
12. [ ] Admin page at `/admin/smoke-tests` shows: last run timestamp, pass/fail per journey test, total cost, duration. Each test expandable to show full conversation log (user messages + Alex replies).
13. [ ] "Run Now" button on admin page triggers `POST /api/v1/network/admin/smoke-tests` — starts an on-demand journey test run. Button disabled while running. Results refresh when complete.
14. [ ] `getLatestRunResults()` returns per-test detail including conversation turns `{ testName, passed, error?, durationMs, turns: { userMessage, alexReply }[] }`
15. [ ] Journey test conversations are stored in activity metadata so admin can review what Alex actually said, not just pass/fail
16. [ ] Admin smoke-tests routes require valid admin token (existing auth pattern)
17. [ ] Unit tests cover: result parsing (all pass, some fail, timeout), work item creation, work item auto-close on recovery, health status assembly

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: pulse integration (non-blocking), work item lifecycle (create/close), briefing integration, cost tracking, subprocess timeout handling
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests for the runner itself (mocked subprocess)
pnpm test -- --grep "smoke-test-runner"

# Manual: trigger a smoke test run and verify work items created for any failures
# Manual: fix a failure, trigger another run, verify work item auto-closed

# Type check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with continuous journey monitoring
2. Journey health is now a permanent part of the daily briefing
3. Track cost per day — verify it stays within the ~$0.20/day estimate

Reference docs checked: no drift found.
