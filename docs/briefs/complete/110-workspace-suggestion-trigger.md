# Brief 110: Workspace Suggestion Trigger — Alex Knows When Email Isn't Enough

**Date:** 2026-04-08
**Status:** draft
**Depends on:** None (can be built independently)
**Unlocks:** Natural email-to-workspace graduation (Insight-161)

## Goal

- **Roadmap phase:** Phase 14+ (Network Agent — surface graduation)
- **Capabilities:** Automated detection of when an email-only user would benefit from a workspace, natural suggestion from Alex

## Context

Insight-161 identifies when email breaks down as a surface: 3+ processes active, batch review needed, user wants more control, or complexity exceeds what email can carry. Today Alex has no automated trigger for this — the suggestion would have to be manually scripted or hardcoded.

The status-composer already runs periodically (every 3+ days with activity). Adding workspace-readiness checks to this existing cycle is the natural integration point.

## Objective

Add workspace suggestion logic to Alex's periodic status checks. When thresholds are met, Alex naturally suggests a workspace in the next status email or briefing.

## Non-Goals

- **Auto-provisioning** — Alex suggests, user decides. No automatic workspace creation.
- **Complex readiness scoring** — simple threshold checks for V1. ML-based readiness prediction is future work.
- **Workspace provisioning itself** — Brief 100 handles Railway provisioning. This brief handles the trigger.

## Inputs

1. `docs/insights/161-email-workspace-boundary.md` — trigger thresholds
2. `src/engine/status-composer.ts` — existing status check cycle
3. `src/engine/pulse.ts` — periodic tick that drives status composition

## Constraints

- Suggestion is a **one-time** event per user — don't nag. Once suggested and declined, don't suggest again for 30 days.
- Suggestion must feel natural: woven into a briefing or status update, not a standalone "upgrade now" email
- Thresholds: 3+ active processes OR goal decomposition with 4+ sub-goals OR user asks for batch review/pipeline view/more control
- Suggestion dismissal tracked (same pattern as `suggestion_dismissals` table)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Threshold-based feature suggestion | SaaS upgrade prompts (Slack free→paid, Notion free→team) | pattern | Usage triggers suggestion, not time |
| Woven into existing communication | Insight-161 | adopt | Natural, not pushy |
| Dismissal tracking | Existing `suggestion_dismissals` table | adopt | Same 30-day expiry pattern |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/workspace-readiness.ts` | Create: `checkWorkspaceReadiness(userId)` — checks: active process count ≥ 3, recent goal with 4+ sub-goals, user signals (keywords in recent messages). Returns `{ ready: boolean, reason: string }` |
| `src/engine/status-composer.ts` | Modify: After composing status, check workspace readiness. If ready and not previously dismissed, append workspace suggestion to status body. |
| `src/engine/workspace-readiness.test.ts` | Create: Unit tests for threshold checks |
| `src/db/schema.ts` | No change — uses existing `suggestion_dismissals` table for tracking |

## User Experience

- **Jobs affected:** Orient (sees workspace suggestion in briefing)
- **Primitives involved:** None new — text woven into existing status email
- **Process-owner perspective:** User has been working with Alex via email for 3 weeks. They have quoting, follow-ups, and weekly briefing running. In the next weekly briefing, Alex adds: "You've got 3 processes running now — things are getting complex enough that a workspace would give you a much better view. I can set one up where you see everything in one place. Want me to?" User replies "yes" → workspace provisioning starts. Or ignores → not asked again for 30 days.
- **Designer input:** Not invoked — text in existing email, no new UI

## Acceptance Criteria

1. [ ] `checkWorkspaceReadiness(userId)` returns `{ ready: true, reason }` when user has 3+ active processes
2. [ ] `checkWorkspaceReadiness(userId)` returns `{ ready: true, reason }` when user has a recent goal decomposition with 4+ sub-goals
3. [ ] `checkWorkspaceReadiness(userId)` returns `{ ready: false }` when thresholds not met
4. [ ] `checkWorkspaceReadiness(userId)` returns `{ ready: false }` when user already has a workspace (status === "workspace")
5. [ ] Status composer appends workspace suggestion to status email when readiness check passes and suggestion not previously dismissed
6. [ ] Workspace suggestion dismissal tracked in `suggestion_dismissals` table with 30-day expiry (existing pattern)
7. [ ] Suggestion appears maximum once per status cycle — never in consecutive emails
8. [ ] Suggestion text is natural and woven into the briefing, not a standalone call-to-action
9. [ ] Unit tests cover: threshold detection (3+ processes, 4+ sub-goals), already-has-workspace skip, dismissal respect

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: threshold logic, dismissal tracking, status-composer integration, no-nag guarantee
3. Present work + review findings to human for approval

## Smoke Test

```bash
pnpm test -- --grep "workspace-readiness"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md`
2. Insight-161's workspace trigger is now implemented

Reference docs checked: Insight-161 consistent, no drift.
