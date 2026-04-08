# Brief 111: Journey Smoke Tests — Real LLM End-to-End Verification

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Briefs 100-106 (all journey infrastructure built)
**Unlocks:** Brief 112 (continuous monitoring via heartbeat)

## Goal

- **Roadmap phase:** Cross-cutting (quality infrastructure)
- **Capabilities:** Real-LLM integration tests that trace full user journeys end-to-end, asserting on structure and outcomes (not exact text). Proves the product works, not just the plumbing.

## Context

The codebase has 1049 unit tests (mock LLM) and 14 Playwright e2e tests (UI rendering). Neither traces an actual user journey through the engine with a real LLM. We can't verify that Alex actually detects connector mode, decomposes goals sensibly, or produces quality introductions — only that data moves between steps.

The 15 journey branches identified in the architecture stress test need real verification. A mock LLM proves pipes connect. A real LLM proves the product works.

## Objective

Build journey-level integration tests that use real LLM calls (Haiku for cost efficiency) to verify complete user journeys from front door through process execution, chaining, and outcomes. Assert on structure and outcomes, not exact text. Each journey test traces one of the 15 verified branches.

## Non-Goals

- **Exact text assertions** — LLM responses are non-deterministic. Assert that Alex detected the right mode, not what Alex literally said.
- **UI/browser testing** — these are engine-level integration tests, not Playwright specs
- **Performance benchmarks** — verify correctness, not speed
- **Testing every edge case** — these are smoke tests for critical paths, not exhaustive coverage
- **Continuous monitoring** — Brief 112 adds the scheduled runner and work-item-on-failure. This brief creates the tests themselves.

## Inputs

1. `.context/goal-seeking-orchestration-design.md` — the 15 journey branches to verify
2. `src/engine/network-chat-workflow.test.ts` — existing pattern for real-integration tests with test DB
3. `src/test-utils.ts` — test DB creation, fixtures
4. `src/engine/network-chat.ts` — front door entry point
5. `src/engine/heartbeat.ts` — process advancement
6. `src/engine/pulse.ts` — continuous operation tick
7. `src/engine/system-agents/orchestrator.ts` — goal decomposition
8. `src/engine/system-agents/goal-decomposition.ts` — LLM decomposition
9. `src/engine/review-pages.ts` — review page lifecycle
10. All 23 process templates in `processes/templates/`

## Constraints

- **Real LLM calls** — no mocks. Use `model_hint: fast` (Haiku) for cost efficiency. Estimated cost: ~$0.10-0.20 per full journey run.
- **Assert on structure, not text** — verify modes detected, processes fired, steps executed, chains created, records stored. Not what Alex literally said.
- **Test isolation** — each journey test gets a fresh test DB. No cross-test contamination.
- **Timeout tolerance** — LLM calls take 1-5 seconds each. A full journey test may take 30-60 seconds. Set generous timeouts.
- **Network dependencies** — tests require `LLM_PROVIDER` and API key configured. Skip gracefully if not set (CI environments without keys).
- **Idempotent** — tests can be re-run without cleanup. Test DB is ephemeral.
- **Real email delivery via test inbox** — emails are sent to `smoke-test@agentmail.to` (a dedicated test inbox). Tests verify emails actually arrive via AgentMail API (check inbox). No emails ever go to real external people. This proves the full pipeline: LLM generates → quality gate passes → channel adapter formats → AgentMail delivers → email lands.
- **Web search is real** — Perplexity calls are live. Tests verify Alex actually finds relevant results.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Journey-level integration tests | Existing network-chat-workflow.test.ts | adopt | Same test DB + mock pattern, extended to full journeys |
| Structure-based assertions | Contract testing (Pact, consumer-driven contracts) | pattern | Assert on shape and outcomes, not exact values |
| Real LLM in tests | Anthropic evaluation suites | pattern | Production AI needs real model testing, not just mock testing |
| Smoke test per journey branch | Acceptance testing (BDD Given-When-Then) | pattern | Each test traces one user journey scenario |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/journey-smoke.test.ts` | Create: Primary journey smoke test file. Contains tests for the 8 highest-priority journey branches (see AC). Uses real LLM, test DB, mocked external services. |
| `src/engine/journey-test-helpers.ts` | Create: Shared helpers — `simulateFrontDoorChat()` (drives handleChatTurn with real LLM), `advanceProcess()` (runs heartbeat steps), `advanceTime()` (manipulates timestamps for chain testing), `assertChainCreated()`, `assertPersonCreated()`, `assertProcessRunStatus()` |
| `vitest.config.ts` or `package.json` | Modify: Add `test:journey` script that runs only journey smoke tests with extended timeout. Separate from `pnpm test` (unit tests should stay fast). |

## User Experience

- **Jobs affected:** None — this is developer infrastructure
- **Designer input:** Not applicable

## Acceptance Criteria

### Journey Tests (8 critical paths)

1. [ ] **Connector journey:** Simulate front-door chat with connector signals → verify `detectedMode === "connector"` → verify `front-door-intake` process run created → advance through research-targets, draft-intros, quality-gate, send-outreach, report-back steps → verify all complete → verify chains created (follow-up-sequences, pipeline-tracking, network-nurture, connecting-introduction) → verify person records created for targets → verify emails actually landed in `smoke-test@agentmail.to` inbox
2. [ ] **CoS journey:** Simulate front-door chat with CoS signals → verify `detectedMode === "cos"` → verify `front-door-cos-intake` process run created → advance through analyze-conversation, draft-first-briefing steps → verify user model populated → verify weekly-briefing chain created
3. [ ] **Both modes journey:** Simulate "both" detection → verify CoS intake fires → verify connector cross-check step detects connector need → verify chain to front-door-intake created
4. [ ] **Goal decomposition journey:** Create a goal work item ("build a freelance consulting business") → run `decomposeGoalWithLLM()` with real LLM → verify sub-goals produced (3-8 range) → verify each tagged find or build → verify assumptions list is non-empty → verify dimension map populated
5. [ ] **Find-or-build routing journey:** Given decomposed sub-goals → run routing → verify sub-goals matching existing templates route to find → verify unmatched sub-goals attempt build (triggerBuild called) → verify Process Model Library checked before build-from-scratch
6. [ ] **Review page journey:** Create a review page → verify token generated → get page by token → verify content returned → append chat message → verify persisted → complete page → verify status → verify expired page returns null after grace period
7. [ ] **Quality gate journey:** Create a front-door-intake run → advance to quality-gate step → verify quality gate evaluates draft intros → verify gate produces pass/fail with evidence → verify failed intros don't proceed to send-outreach
8. [ ] **Process chaining journey:** Complete a front-door-intake run → verify pulse tick processes chains → verify follow-up-sequences delayed run created with correct `executeAt` (5 days out) → advance time past 5 days → verify pulse starts the follow-up run

### Infrastructure

9. [ ] `journey-test-helpers.ts` exports: `simulateFrontDoorChat()`, `advanceProcess()`, `advanceTime()`, `assertChainCreated()`, `assertPersonCreated()`, `assertProcessRunStatus()`, `assertEmailDelivered()` (checks test inbox via AgentMail API), `clearTestInbox()` (empties inbox before each test)
10. [ ] `simulateFrontDoorChat()` drives `handleChatTurn()` with real LLM through GATHER → REFLECT → ACTIVATE stages, returns the session + final state (detectedMode, emailCaptured, done)
11. [ ] `advanceProcess()` calls `fullHeartbeat()` and returns the result, advancing one step at a time for assertion between steps
12. [ ] Each test uses a fresh test DB (createTestDb pattern) — no cross-test contamination
13. [ ] Tests skip gracefully when `LLM_PROVIDER` or API key is not configured — `describe.skipIf(!process.env.LLM_PROVIDER)` pattern
14. [ ] `pnpm test:journey` script runs only journey tests with 120-second timeout per test
15. [ ] All outgoing emails are routed to `smoke-test@agentmail.to` test inbox — no emails to real external people. Tests verify delivery by checking the test inbox via AgentMail API after send steps complete.
16. [ ] Test inbox is configured via `SMOKE_TEST_EMAIL` env var (default: `smoke-test@agentmail.to`). All person records and outreach targets in journey tests use this address.
17. [ ] Each journey test logs cost (from LLM response costCents) — total cost per test run visible in output
18. [ ] `clearTestInbox()` runs in `beforeEach` — each test starts with an empty inbox

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: test isolation, assertion quality (structure not text), cost tracking, skip-when-no-key pattern, no real external service calls
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Run journey smoke tests (requires LLM_PROVIDER + API key)
pnpm test:journey

# Verify journey tests skip gracefully without API key
LLM_PROVIDER= pnpm test:journey

# Verify unit tests still pass (journey tests don't break existing tests)
pnpm test

# Type check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with journey smoke test infrastructure
2. Brief 112 becomes buildable (continuous monitoring wraps these tests)
3. Record the cost per journey test run for budget tracking

Reference docs checked: no drift found.
