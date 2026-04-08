# Brief 108: Admin Oversight — Ditto Team Controls for Alex

**Date:** 2026-04-08
**Status:** draft
**Depends on:** None (can be built independently)
**Unlocks:** Ditto admin team can monitor, guide, pause, and act-as Alex across all users

## Goal

- **Roadmap phase:** Phase 14+ (Network Agent — operational maturity)
- **Capabilities:** Admin web UI on the network service, feedback to Alex, pause Alex per-user, act-as-Alex mode, downgrade notifications

## Context

Alex operates autonomously in Context 2 (professional connector — Insight-160). When quality drops, the trust system downgrades Alex. But today, nobody gets notified. Admin oversight is CLI-only (`ditto trust`, `ditto status`). For a production service, the Ditto admin team needs:

1. **Visibility** — see Alex's quality across all users
2. **Feedback** — guide Alex to adjust approach (not just approve/reject individual outputs)
3. **Control** — pause Alex for a specific user if something goes wrong
4. **Agency** — act as Alex when manual intervention is needed

The existing `/admin` route on the network service and the admin login (`/api/v1/network/admin/login`) provide the authentication foundation.

## Objective

Build an admin oversight surface within the existing network service web app that lets the Ditto team monitor Alex's quality, provide feedback, pause Alex per-user, and act as Alex when needed. Include automated downgrade notifications.

## Non-Goals

- **Full analytics dashboard** — this is operational oversight, not business intelligence
- **User-facing admin controls** — users never see admin tools. Admin operates behind the scenes.
- **Cross-instance aggregation** — this is single-instance admin for the centralized network service. Cross-instance intelligence is Phase 13+.
- **Custom admin roles/permissions** — one admin role for V1. Role-based admin access is future work.

## Inputs

1. `packages/web/app/admin/` — existing admin route (check what's there)
2. `packages/web/app/api/v1/network/admin/login/route.ts` — existing admin auth
3. `docs/insights/160-trust-context-not-universal.md` — trust contexts, downgrade review by admin
4. `src/engine/notify-user.ts` — notification pattern to extend for admin
5. `src/db/schema.ts` — networkUsers, processes, processRuns, activities tables

## Constraints

- Admin UI lives on the **network service** web app (not in user workspaces)
- Admin auth uses existing token-based login at `/api/v1/network/admin/login`
- Admin actions are logged to the `activities` table (full audit trail)
- "Act as Alex" sends emails from Alex's inbox — admin composes, Alex's identity sends. This is for edge cases (manual follow-up, relationship repair), not routine operation.
- Pause-per-user halts ALL Alex-driven processes for that user. Does not cancel — pauses. Admin can resume.
- Admin feedback to Alex is stored as admin-scoped memory that Alex loads in context for that user
- Downgrade notifications sent via email to the admin email address configured in env vars

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Admin dashboard within app | Existing `/admin` route | adopt | Foundation already exists |
| Token-based admin auth | Existing admin login | adopt | Already built and working |
| Downgrade notifications | Existing `notifyUser()` pattern | adopt | Same fire-and-forget notification, different recipient |
| Act-as pattern | Customer support impersonation (Intercom, Zendesk) | pattern | Support agents act as the product identity |
| Admin feedback as memory | Self-scoped memory (ADR-016) | adopt | Same memory mechanism, admin scope |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/admin/page.tsx` | Create/Modify: Admin dashboard — list of active users with quality health indicators (recent run success rates, downgrade flags, last activity) |
| `packages/web/app/admin/users/[userId]/page.tsx` | Create: Per-user detail view — processes, recent runs, trust tiers, quality metrics, admin actions (pause, resume, feedback, act-as) |
| `packages/web/app/api/v1/network/admin/users/route.ts` | Create: GET — list users with quality summary data |
| `packages/web/app/api/v1/network/admin/users/[userId]/route.ts` | Create: GET — user detail with processes/runs. POST — admin actions (pause, resume, feedback, act-as) |
| `src/engine/admin-oversight.ts` | Create: `pauseUserProcesses()`, `resumeUserProcesses()`, `addAdminFeedback()`, `sendAsAlex()`, `getAdminDashboardData()`, `getUserDetail()` |
| `src/engine/admin-oversight.test.ts` | Create: Unit tests for pause/resume, feedback storage, dashboard data assembly |
| `src/engine/notify-admin.ts` | Create: `notifyAdmin()` — sends notifications to admin email. Called on trust downgrades and quality threshold breaches. |
| `src/engine/trust-diff.ts` | Modify: After trust downgrade computation, call `notifyAdmin()` with downgrade evidence |
| `src/db/schema.ts` | Modify: Add `adminFeedback` table (id, userId, feedback, createdAt, createdBy). Add `pausedAt` column to `networkUsers` for per-user pause state. |
| `src/test-utils.ts` | Modify: Add `admin_feedback` table and `paused_at` column to `createTables()` |

## User Experience

- **Jobs affected (admin):** Orient (quality overview), Review (downgrade evidence), Decide (pause/resume/feedback), Operate (act-as-Alex)
- **Primitives involved:** Standard web UI components — tables, status badges, action buttons. No ContentBlocks — this is admin tooling, not user-facing.
- **Admin perspective:** Admin logs in to `/admin`. Sees a list of users with quality health: green (all good), yellow (recent downgrade), red (quality below threshold). Clicks a user → sees their processes, trust tiers, recent runs, and quality metrics. Can: add feedback ("Rob's a painter, not a plumber — stop positioning him for plumbing jobs"), pause Alex for that user, or compose and send a message as Alex.
- **Interaction states:** Dashboard (user list with health), User detail (processes + actions), Feedback form (text input + save), Act-as composer (email form sent from Alex's inbox), Pause confirmation ("This will halt all Alex activity for this user")
- **Designer input:** Not invoked. Admin tooling — functional, not branded. Simple tables and forms.

## Acceptance Criteria

1. [ ] Admin dashboard at `/admin` shows list of active network users with: name, email, process count, last activity, quality health indicator (green/yellow/red based on recent downgrade events)
2. [ ] Per-user detail page at `/admin/users/[userId]` shows: all processes for that user, trust tier per process, recent 10 runs with status, quality metrics (approval rate, edit rate)
3. [ ] "Pause Alex" button halts all Alex-driven process runs for a user. Sets `pausedAt` timestamp on networkUsers. Pulse and heartbeat check this flag before executing.
4. [ ] "Resume Alex" clears the pause. Processes resume from where they paused.
5. [ ] "Add Feedback" stores admin feedback in `adminFeedback` table. Alex loads admin feedback for this user as part of context assembly (admin-scoped memory).
6. [ ] "Act as Alex" presents a compose form (to, subject, body). Sends from Alex's email inbox via existing `sendAndRecord()`. Logged as admin action in activities table.
7. [ ] `notifyAdmin()` sends email to `ADMIN_EMAIL` env var on trust downgrades. Email includes: user name, process name, old tier, new tier, evidence (recent correction/failure data).
8. [ ] Trust downgrade computation in trust-diff.ts calls `notifyAdmin()` when a process tier drops
9. [ ] All admin actions (pause, resume, feedback, act-as) logged to `activities` table with `actorType: "admin"`
10. [ ] Admin routes require valid admin token (existing auth pattern)
11. [ ] Unit tests cover: pause/resume lifecycle, feedback storage and retrieval, dashboard data assembly, notifyAdmin trigger on downgrade

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: admin auth enforcement, audit trail completeness, pulse/heartbeat pause-flag checks, act-as security (only from Alex's inbox), memory scope separation (admin feedback vs user feedback)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests
pnpm test -- --grep "admin-oversight"

# Schema migration
pnpm cli sync

# Type check
pnpm run type-check

# Manual: log in as admin, view dashboard, pause a user, add feedback, verify Alex loads feedback
```

## After Completion

1. Update `docs/state.md` with admin oversight
2. Update `docs/architecture.md` — admin oversight as operational layer
3. Insight-160's "who reviews on downgrade" now has implementation: `notifyAdmin()` + admin dashboard

Reference docs updated: `docs/architecture.md` (admin oversight layer), `docs/insights/160-trust-context-not-universal.md` (downgrade review implementation)
