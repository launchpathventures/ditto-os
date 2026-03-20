# Agent OS — Current State

**Last updated:** 2026-03-20
**Current phase:** Phase 4b complete. Brief 016 (Intelligent Coding Orchestrator) ready for builder. Then Phase 4c.
**History:** See `docs/changelog.md` for completed phases, retrospectives, and resolved decisions.

---

## What's Working

- **Storage** — SQLite + Drizzle ORM + better-sqlite3. WAL mode. Auto-created at `data/agent-os.db`. (ADR-001)
- **Process definitions** — 6 YAML processes in `processes/`. Parallel groups, depends_on, human steps.
- **Claude adapter** — 10 role-based system prompts, tool use loop (read_file/search_files/list_files, max 25 calls)
- **Script adapter** — Deterministic steps with on_failure
- **Process loader** — YAML parsing, parallel_group containers, dependency validation, cycle detection
- **CLI** — citty + @clack/prompts. 12 commands: sync, start, heartbeat, status, review, approve, edit, reject, trust, capture, complete, debt. TTY-aware, --json on listings. Unified task surface.
- **Work items** — workItems table (type, status, goalAncestry, assignedProcess, spawnedFrom). Conditional flow (Insight-039).
- **Harness pipeline** — 5 handlers: memory-assembly → step-execution → review-pattern → trust-gate → feedback-recorder
- **Trust gate** — 4 tiers: supervised, spot-checked (~20%), autonomous, critical. Deterministic SHA-256 sampling.
- **Trust earning** — Sliding window (20 runs), conjunctive upgrades, disjunctive downgrades, grace period, simulation, override. (ADR-007)
- **Review patterns** — Maker-checker, adversarial, spec-testing. Retry with feedback injection.
- **Memory** — Two-scope (agent + process), salience sorting, token-budgeted assembly, feedback-to-memory bridge. (ADR-003)
- **Human steps** — `executor: human` suspends execution, creates action work item with input_fields, `aos complete` resumes with human input.
- **Pattern notification** — After 3+ corrections of same pattern, read-only notification surfaced. Precursor to Phase 8 "Teach this".
- **Parallel execution** — Promise.all for parallel groups, depends_on resolution
- **Heartbeat** — Routes through harness. Sequential + parallel. Human step suspend/resume.
- **Agent tools** — 3 read-only tools (read_file, search_files, list_files). Path traversal prevention, secret deny-list.
- **DB schema enforcement** — `pnpm cli sync` runs drizzle-kit push. Handles first-run and evolution.
- **Debt tracking** — `docs/debts/` markdown files. `pnpm cli debt` to list.
- **Dev process** — 7 roles as skills. Brief template. 27 active insights, 15 archived. 27 research reports. 11-point review checklist.
- **Dev pipeline** — `claude -p` orchestrator + Telegram bot. Full Claude workspace on mobile. (Brief 015)

## What Needs Rework

- Architecture "First Implementation" section still frames everything as processes, not work items

## In Progress

- **Phase 4b complete** (Brief 013) — Human steps, capture, unified task surface, pattern notification. All 12 AC pass.
- **Brief 016 ready for builder** — CLI adapter (016a) → conditional routing (016b) → dev pipeline YAML (016c) → confidence + events (016d)
- **Phase 4c next** (Brief 014) — 4 system agents, per-output confidence, auto-classification. 10 AC. Depends on 016.

## What's Blocked

Nothing.

## Known Debt

Tracked in `docs/debts/`. Run `pnpm cli debt` to list. Key item: no test suite (`pnpm test` has no infrastructure).

## Decisions Made

| Decision | ADR | Status |
|----------|-----|--------|
| SQLite via Drizzle + better-sqlite3 | ADR-001 | Done |
| Research reports as durable artifacts | ADR-002 | Proposed |
| Memory architecture (two-scope, phased) | ADR-003 | Done (Phase 2b scope) |
| Harness as middleware pipeline | Phase 2a | Done |
| Trust gate (4 tiers, deterministic sampling) | Phase 2a | Done |
| Review patterns (composable layers) | Phase 2b | Done |
| Parallel execution via Promise.all | Phase 2c | Done |
| Dev Designer as 7th role | ADR-004 | Accepted |
| Trust earning algorithm | ADR-007 | Accepted |
| Integration architecture (multi-protocol) | ADR-005 | Proposed |
| Analyze as first-class mode + org data model | ADR-006 | Accepted |
| Two-track deployment | ADR-006 | Accepted |
| AGPL-3.0 license | ADR-006 | Accepted |
| Workspace interaction model | ADR-010 | Accepted |
| System agents + templates + cold-start | ADR-008 | Accepted |
| Runtime composable UI (no ViewSpec, React) | ADR-009 | Proposed |
| Attention model (3 modes, confidence, silence) | ADR-011 | Accepted |
| Context engineering, model routing, cost | ADR-012 | Accepted |
| Cognitive model (mode, feedback, escalation) | ADR-013 | Accepted |

## Active Briefs

| Brief | Phase | Status |
|-------|-------|--------|
| 011 — Phase 4 parent | 4 | Draft |
| 014 — Phase 4c (meta-processes) | 4c | Draft (depends on 016) |
| 016 — Intelligent Coding Orchestrator | Pre-4c | Ready for builder |

## Next Steps

1. **NOW:** Brief 016 — builder starts with 016a (CLI adapter)
2. **Then:** 016b → 016c → 016d
3. **Then:** Phase 4c (Brief 014)
4. **After Phase 4:** Phase 5 Work Evolution Verification
5. **Planned:** Knowledge lifecycle meta-process design (Insight-042) — after 016a ships
