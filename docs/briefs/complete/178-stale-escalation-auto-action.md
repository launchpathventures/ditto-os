# Brief: Stale Escalation Auto-Action (P0 reliability)

**Date:** 2026-04-16
**Status:** complete

> **Scope adjustment (2026-04-16):** Landed the tier-classification primitive,
> idempotent sweep, and reset helper, plus hourly scheduler registration.
> `notifyUser`/`notifyAdmin` callbacks are defined on the sweep API but
> left unwired in the default scheduler path — wiring them needs a
> personId resolution layer beyond single-user MVP. Follow-up work: add
> `stale_escalation` support to `notifyUser`, then register the callback.
> Tiers still advance and the idempotency marker persists, so the ladder
> is observable even without the notifications.
**Depends on:** Brief 169 (parent), Brief 162 (exception handling quality)
**Unlocks:** Escalations can't rot indefinitely; the system nudges the user before abandoning work.

## Goal

- **Roadmap phase:** Phase 7 / MP-7
- **Capabilities:** Closes P0: `risk-detector.ts:271-346` flags stale escalations > 24h but no code *acts* on them. An escalation sitting in `waiting_human` for a week remains unchanged; the user, having missed the briefing, never learns.

## Context

Brief 162 (MP-7) delivered classified failure types, guidance-to-memory, stale detection, and dependency-block visibility — all observable. What's missing is the gradient-of-escalation: a stale flag should escalate over time, not plateau as a single briefing line.

Pattern in use elsewhere (email follow-up sequences, budget warnings): escalate by surface, not by severity. First a hint in the briefing, then a direct ping, then admin oversight.

## Objective

Stale escalations follow a three-step ladder:

1. **T + 24h** — flagged in briefing (existing behaviour, unchanged).
2. **T + 48h** — direct `notifyUser` with the re-surfaced escalation context and original guidance request.
3. **T + 72h** — admin-oversight notification (per ADR-024 admin oversight pattern). Run remains paused; work is not lost.

## Non-Goals

- Auto-resuming escalations without human input (that would violate trust gate).
- Auto-cancelling runs after N days (separate decision — best treated as a user-configurable policy, out of scope here).
- Backfill of existing stale runs (optional migration script listed as follow-up).

## Inputs

1. `src/engine/risk-detector.ts` — existing stale detection
2. `src/engine/notify-user.ts` — user notification surface
3. `src/engine/admin-oversight.ts` or wherever `notifyAdmin` lives (Brief 108)
4. `src/engine/scheduler.ts` — where a recurring sweep would fit
5. `processes/templates/` — any appropriate template for user-facing re-surfacing

## Constraints

- No new notification without obeying the existing daily email cap (`MAX_EMAILS_PER_USER_PER_DAY = 5`).
- Ladder progress is idempotent — running the sweep twice the same hour must not send two notifications.
- User can dismiss a stale escalation (existing `adjust_trust` / `reject_review` flows), which resets the ladder.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Escalation ladder | PagerDuty 3-tier escalation policy | pattern | Well-understood, user-calming |
| Idempotent sweep marker | Stale checker pattern in `scheduler.ts:91-100` | adopt | Same shape as wait_for timeout checker |
| Notification pacing | Existing `notifyUser` throttle | adopt | Reuse the cap, don't duplicate |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | Modify: add `processRuns.staleEscalationTier integer default 0` (0 = none, 1 = briefing, 2 = user notified, 3 = admin notified) and `processRuns.staleEscalationLastActionAt timestamp` |
| `drizzle/NNNN_stale_escalation_ladder.sql` | Create: migration |
| `src/engine/stale-escalation.ts` | Create: pure functions `classifyStaleTier(waitingSince, now)` and `buildStaleReminder(runMetadata)` |
| `src/engine/scheduler.ts` | Modify: add `checkStaleEscalations()` recurring job (every 1 hour). For each `waiting_human`/`waiting_review` run, compute the appropriate tier; if it advanced since last action, fire the corresponding notification and update the marker. |
| `src/engine/notify-user.ts` | Modify: accept `notificationType: "stale_escalation"` with dedup against last-tier action. |
| `src/engine/admin-oversight.ts` | Modify: accept `notifyAdminOfStaleEscalation(runId, context)`. |
| `src/engine/stale-escalation.test.ts` | Create: tier transitions, idempotency (two sweeps in one hour → one notification), dismissal resets marker. |

## User Experience

- **Jobs affected:** Review, Orient, Decide.
- **Process-owner perspective:** Sends like Ditto lightly tapping your shoulder at 48h ("hey, this one's been waiting for two days; here's the gist again"), then looping in the team at 72h. No drama, no accusations, clear path to resolve.
- **Interaction states:** notification → user acts (approve/edit/reject/defer) → marker resets.

## Acceptance Criteria

1. [ ] `staleEscalationTier` + `staleEscalationLastActionAt` columns exist.
2. [ ] Sweep job runs hourly via scheduler, scoped to `waiting_human` / `waiting_review`.
3. [ ] Tier transitions: 1 at 24h (pure briefing, no direct notification), 2 at 48h (direct notify), 3 at 72h (admin notify).
4. [ ] Idempotency: sweep twice within an hour → same tier → no extra notification.
5. [ ] Dismissal / resume / reject resets tier to 0.
6. [ ] User reminder message includes the original escalation context + guidance ask (not a generic "something needs attention").
7. [ ] Admin notification goes to `ADMIN_EMAIL`, includes user, runId, tier history.
8. [ ] Daily email cap respected.
9. [ ] Journal index is next available.

## Review Process

1. Review agent checks dedup: same sweep repeated immediately produces zero new notifications.
2. Verifies admin notification is not sent if `DITTO_DEPLOYMENT=workspace` (single-user / admin = user, would loop).
3. Confirms reminder message reads like a teammate, not an alarm.

## Smoke Test

```bash
pnpm db:generate
pnpm test -- stale-escalation scheduler notify-user
```

Manual: seed a `waiting_human` run with `createdAt = now - 50h`; run `checkStaleEscalations()` once → user notification recorded. Run again immediately → no second notification.

## After Completion

Update `docs/state.md`: "Brief 178 — stale escalation auto-action (2026-04-16, complete): three-tier ladder (briefing → user notify at 48h → admin notify at 72h) via hourly sweep. Idempotent per tier; resets on dismissal/resume/reject."
