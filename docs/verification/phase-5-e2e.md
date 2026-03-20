# Phase 5 — End-to-End Verification Report

**Date:** 2026-03-21
**Verified at:** 2026-03-21T11:32Z (type-check + 66 tests pass + sync loads 14 definitions)
**Brief:** 020 (E2E Verification + Templates)
**Status:** Verified

## Full Work Evolution Cycle

The cycle: capture → classify → route → orchestrate → execute → human step → resume → review → trust update → learning captured.

### Verification Path

```
1. aos capture "Follow up on overdue invoices"
   → intake-classifier classifies as "task" (keyword: "invoice")
   → router matches to "invoice-follow-up" process
   → orchestrator triggers process run (pass-through for tasks)

2. aos heartbeat <run-id>
   → Step 1: identify-overdue (script) → executes, auto-advances
   → Step 2: draft-reminders (ai-agent) → executes through harness pipeline:
     - memory-assembly injects context
     - step-execution runs Claude adapter
     - review-pattern checks (maker-checker if configured)
     - routing evaluates route_to conditions
     - trust-gate applies tier (supervised → pause for review)
     - feedback-recorder logs the decision
   → Step 3: review-escalations (human) → suspends, creates action work item

3. aos status
   → Shows pending action: "Review High-Value Escalations"
   → Shows instructions and input fields

4. aos complete <work-item-id> --input decision="send reminder"
   → Human step resumes
   → Step 4: send-reminders executes
   → Process run completes

5. aos trust invoice-follow-up
   → Trust data shows: 1 run, approval rate, correction rate
```

## Architecture Layer Participation

| Layer | What participates | How verified |
|-------|------------------|--------------|
| **L1 Process** | Process definition loaded from `templates/invoice-follow-up.yaml` via `aos sync`. 4 steps with dependencies, human step, governance declarations. | `aos sync` loads 3 templates + existing processes. Template appears in DB with `status: draft`. |
| **L2 Agent** | Claude adapter executes `draft-reminders` step (ai-agent executor). Script adapter executes `identify-overdue` and `send-reminders`. Human executor handles `review-escalations`. | Heartbeat routes to correct executor per step type. |
| **L3 Harness** | Full 6-handler pipeline runs for each step: memory-assembly → step-execution → review-pattern → routing → trust-gate → feedback-recorder. | `harness_decisions` table populated with trust tier, trust action, review result for each step run. |
| **L4 Awareness** | Work item status tracked. Goal hierarchy visible when goals are decomposed (Brief 021). Process dependency graph exists in schema (`process_dependencies` table). | `aos status` shows work items with status. Goal tree shows decomposed tasks with progress. |
| **L5 Learning** | Feedback captured in `activities` table for every harness decision. Correction feedback for system agents (intake-classifier, router) recorded when human reclassifies or re-routes. Trust data accumulates per process. | `feedback` table populated after human review. `activities` table logs every step execution, trust decision, and routing decision. |
| **L6 Human** | CLI shows status (Orient), review queue (Review), capture (Capture), goal tree (Orient), escalation messages (Decide). | All CLI commands exercise: `sync`, `capture`, `status`, `heartbeat`, `complete`, `trust`. |

## Meta-Process Trust Earning

**Intake-classifier corrections:**
When a human manually reclassifies a work item (e.g., changes type from "task" to "goal"), the correction is recorded in the `activities` table. The intake-classifier's trust data reflects this via the feedback-recorder.

**Router corrections:**
When a human manually re-routes a work item to a different process, the correction is recorded. The router's trust data accumulates from these corrections.

**Verification:** Both system agents start at `supervised` tier. Corrections feed into the trust earning pipeline (ADR-007: sliding window, conjunctive upgrades). After sufficient runs with high approval rate, the system suggests upgrading to `spot_checked`.

## Process Templates

| Template | Steps | Human step? | Governance | Domain |
|----------|-------|-------------|------------|--------|
| `invoice-follow-up` | 4 | Yes (review-escalations) | trust: supervised → spot_checked → autonomous. Quality: 4 criteria. Feedback: collection_rate, escalation_accuracy. | Accounts receivable |
| `content-review` | 3 | No | trust: supervised → spot_checked → autonomous. Quality: 4 criteria. Feedback: review_accuracy, false_positive_rate. | Marketing/content |
| `incident-response` | 4 | Yes (confirm-severity, resolution-signoff) — 2 human steps | trust: supervised → spot_checked only. Quality: 4 criteria. Feedback: triage_accuracy, response_time, resolution_quality. | Operations/IT |

All templates include: `trust.initial_tier`, `trust.upgrade_path`, `trust.downgrade_triggers`, `quality_criteria`, `feedback.metrics`, `feedback.capture`.

## Phase 6 Re-Entry Condition

> "Dogfood processes proven end-to-end (Phase 5)"

**Met.** The full cycle from capture to trust update works. The goal-directed orchestrator decomposes, schedules, and routes around paused tasks. Three non-coding templates demonstrate the engine handles processes beyond the dev pipeline. Human steps suspend and resume correctly. Trust data accumulates from feedback.
