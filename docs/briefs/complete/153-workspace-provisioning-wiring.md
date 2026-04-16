# Brief 153: Workspace Provisioning Wiring — Suggestion to Running Workspace

**Date:** 2026-04-14
**Status:** draft
**Depends on:** Brief 110 (workspace suggestion trigger), Brief 143 (workspace magic-link auth), Brief 100 (Railway provisioning)
**Unlocks:** Self-service workspace graduation for email-only users

## Goal

- **Roadmap phase:** Phase 15: Managed Workspace Infrastructure (final wiring)
- **Capabilities:** End-to-end flow from workspace suggestion acceptance through provisioned, authenticated workspace access

## Context

Four individually-complete briefs have built everything needed for workspace provisioning:

- **Brief 110** — Alex detects readiness (3+ processes, 4+ sub-goals, control signals) and weaves a workspace suggestion into status emails: *"Just reply 'yes' if you'd like that."*
- **Brief 143** — Workspace auth via magic link, gated by `WORKSPACE_OWNER_EMAIL` env var
- **Brief 100** — Railway provisioning saga (service + volume + env vars + deploy + health check + rollback)
- **Brief 123** — Magic link infrastructure (token generation, consumption, rate limiting)

But these pieces aren't wired together. Four gaps break the chain:

1. **No acceptance handler** — User replies "yes" to workspace suggestion, but `handleUserEmail()` routes it to Self, which has no workspace acceptance tool. The reply gets treated as a general message.
2. **`WORKSPACE_OWNER_EMAIL` not injected** — The provisioner sets 4 env vars (`DITTO_NETWORK_URL`, `DITTO_NETWORK_TOKEN`, `DATABASE_PATH`, `NETWORK_AUTH_SECRET`) but not `WORKSPACE_OWNER_EMAIL`, so the workspace auth gate (Brief 143 middleware) won't activate.
3. **User status never updated** — After provisioning, `networkUsers.status` stays `"active"` instead of transitioning to `"workspace"`. The readiness check keeps firing. The workspace URL isn't linked.
4. **No welcome email** — Workspace is created but user never receives a magic link to access it.

## Objective

When a user replies "yes" to a workspace suggestion email, Alex provisions the workspace, updates the user's status, and sends a magic-link welcome email — zero admin intervention.

## Non-Goals

- **Multi-user workspaces** — single owner per workspace (same as Brief 143)
- **Changing provisioning infrastructure** — the Railway saga (Brief 100) is unchanged
- **Changing readiness detection** — the threshold logic (Brief 110) is unchanged
- **Admin dashboard provisioning button** — admin retains CLI/API access; no new UI
- **Retry/queue for failed provisioning** — if provisioning fails, Alex tells the user and the admin can investigate. Queue-based retry is future work.

## Inputs

1. `src/engine/inbound-email.ts` — `handleUserEmail()` (line 510): where user email replies are routed. The acceptance handler intercepts before Self routing.
2. `src/engine/workspace-provisioner.ts` — `provisionWorkspace()` (line 276): the saga to call. Needs `WORKSPACE_OWNER_EMAIL` added to env var injection (line 349).
3. `src/engine/status-composer.ts` — `WORKSPACE_SUGGESTION_CONTENT` (line 35): the dismissal key used to identify workspace suggestion emails.
4. `src/engine/magic-link.ts` — `createWorkspaceMagicLink()`: generates the magic link for the welcome email.
5. `src/db/schema/network.ts` — `networkUsers` table (line 180): `status`, `workspaceId`, `workspaceSuggestedAt` columns.
6. `src/engine/notify-user.ts` — `notifyUser()`: sends the welcome email.

## Constraints

- The acceptance check runs AFTER cancellation detection and BEFORE waiting-step resume in `handleUserEmail()` — same priority ordering pattern.
- Provisioning is async and can take 1-2 minutes. The user gets an immediate acknowledgment ("Setting up your workspace now...") and a follow-up email with the magic link when it's ready.
- If provisioning fails (Railway error, timeout), the saga rolls back automatically (existing behavior). Alex sends a failure notification and logs for admin investigation. No silent failures.
- **Thread matching for acceptance detection:** The acceptance signal must be tied to a workspace suggestion thread. Detection uses the inbound email's `threadId` (AgentMail thread) to match against the status email that contained the workspace suggestion. The status composer must record the outbound `messageId` or `threadId` when a suggestion is sent (stored alongside `workspaceSuggestedAt` on `networkUsers`). A "yes" reply that isn't in a suggestion thread is routed to Self as normal. This prevents accidental or malicious provisioning triggers from unrelated "yes" replies.
- Rate limiting: a user can only trigger provisioning once. Idempotency in `provisionWorkspace()` already handles this (returns existing workspace if healthy).
- **Workspace seed is automatic:** The workspace imports its seed on first boot via `fetchAndImportSeed()` in `packages/web/instrumentation.ts` (lines 108-130). When `DITTO_NETWORK_URL` is set and no self-scoped memories exist, the workspace fetches `GET /api/v1/network/seed` and imports memories, people, and interactions. The deep health check (`/healthz?deep=true`) verifies seed was imported before reporting healthy. No additional seed triggering is needed from this brief.
- **Side-effect exemption (Insight-180):** `sendWorkspaceWelcome()` and the immediate ack email send via `notifyUser()`, which is an infrastructure-level notification function operating outside harness step execution. This is consistent with the existing pattern — `notifyUser()` is already called without `stepRunId` throughout the inbound email handler (line 760), status composer, and completion notifier. Infrastructure notifications (provisioning ack, welcome email, failure alerts) are exempt from the `stepRunId` guard because they are system operations, not user-process side effects.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Inbound intent detection before Self routing | Existing cancellation handler pattern (inbound-email.ts line 532) | adopt | Same file, same pattern — intercept specific intents before general Self routing |
| Async operation with immediate ack + follow-up | Email service patterns (Superhuman invite flow) | pattern | User gets confirmation immediately, result arrives later |
| Status transition on provisioning | Existing `NetworkUserStatus` union (`active` → `workspace`) | adopt | The type already defines the target state |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/inbound-email.ts` | Modify: Add workspace acceptance detection in `handleUserEmail()`, after cancellation check (line ~624) and before waiting-step resume (line ~626). Detects affirmative reply to a workspace suggestion thread via `threadId` matching against `networkUsers.suggestionThreadId`. Sends immediate ack, triggers async provisioning, sends magic-link welcome email on success or failure notification on error. |
| `src/engine/workspace-provisioner.ts` | Modify: Add `WORKSPACE_OWNER_EMAIL` to env var injection (line 349-354). Accept optional `ownerEmail` in `ProvisionerConfig`. After successful provisioning, update `networkUsers.status = "workspace"`, set `networkUsers.workspaceId`, and record `workspaceAcceptedAt` timestamp. |
| `src/engine/workspace-welcome.ts` | Create: `sendWorkspaceWelcome(userId, workspaceUrl)` — generates a workspace magic link and sends a welcome email with the link. Separated from the provisioner for testability and reuse (admin-triggered provisioning should also send welcome emails). |
| `src/engine/status-composer.ts` | Modify: When a workspace suggestion is included in a status email, record the outbound `threadId` on `networkUsers.suggestionThreadId` (alongside existing `workspaceSuggestedAt` update, line ~506-509). This enables thread matching for acceptance detection. |
| `src/db/schema/network.ts` | Modify: Add `suggestionThreadId` (text, nullable) and `workspaceAcceptedAt` (timestamp_ms, nullable) columns to `networkUsers` table. `suggestionThreadId` links the suggestion email thread for acceptance matching. `workspaceAcceptedAt` records when the user accepted (learning layer signal for readiness threshold tuning). |
| `src/engine/inbound-email.test.ts` | Modify: Add tests for workspace acceptance detection — affirmative reply in suggestion thread triggers provisioning, non-suggestion-thread "yes" doesn't trigger, already-has-workspace skips, provisioning failure sends notification. |
| `src/engine/workspace-provisioner.test.ts` | Modify: Add test that `WORKSPACE_OWNER_EMAIL` is included in upserted env vars. Add test that `networkUsers.status` is updated to `"workspace"` after successful provisioning. |

## User Experience

- **Jobs affected:** Orient (receives workspace welcome), Delegate (workspace unlocks richer delegation surface)
- **Primitives involved:** None new — uses existing email notification + magic link
- **Process-owner perspective:** User has been working with Alex via email for weeks. Gets a status update that mentions a workspace. Replies "yes". Within seconds gets "On it — setting up your workspace now." Two minutes later, gets a welcome email: "Your workspace is ready. Here's your private link: [magic link]. Click it to get started — everything you've been working on is already there." Clicks link → authenticated → full workspace.
- **Interaction states:** N/A — email-only flow, no new UI
- **Designer input:** Not invoked — text in existing email channel, no new UI

## Acceptance Criteria

1. [ ] User replying "yes" / "yeah" / "sure" / "please" to a workspace suggestion email triggers provisioning
2. [ ] User replying "yes" to a non-suggestion email does NOT trigger provisioning (thread context required)
3. [ ] User who already has `status === "workspace"` replying "yes" gets a message with their existing workspace URL instead of re-provisioning
4. [ ] Immediate acknowledgment email sent within seconds: "Setting up your workspace now..."
5. [ ] `WORKSPACE_OWNER_EMAIL` is injected as an env var during provisioning, set to the user's email from `networkUsers.email`
6. [ ] After successful provisioning, `networkUsers.status` is updated to `"workspace"` and `networkUsers.workspaceId` is set to the `managedWorkspaces.id`
7. [ ] After successful provisioning, a welcome email is sent containing a workspace magic link
8. [ ] Magic link in welcome email, when clicked, authenticates the user and redirects to `/`
9. [ ] If provisioning fails, user receives a failure notification: "Hit a snag setting up your workspace — I've flagged it for review."
10. [ ] If provisioning fails, the saga rollback runs (existing behavior preserved) and error is logged with user context
11. [ ] `checkWorkspaceReadiness()` returns `{ ready: false }` for users with `status === "workspace"` (existing AC4 from Brief 110 — verify still works with status update)
12. [ ] Workspace suggestion is never sent again after successful provisioning (status gate + dismissal tracking)
13. [ ] `pnpm run type-check` passes
14. [ ] All existing inbound email tests continue to pass
15. [ ] New tests cover: acceptance detection, thread matching, already-has-workspace skip, provisioning failure notification
16. [ ] Status composer records `suggestionThreadId` on `networkUsers` when a workspace suggestion is sent
17. [ ] `workspaceAcceptedAt` timestamp is recorded on `networkUsers` when user accepts workspace suggestion
18. [ ] Workspace seed imports automatically on first boot (existing behavior — verify not broken by new env vars)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: inbound email handler ordering (cancellation → workspace acceptance → waiting step → Self), env var completeness, status transition correctness, no silent failure paths, magic link security
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type check
pnpm run type-check

# Unit tests
pnpm test -- --grep "inbound-email"
pnpm test -- --grep "workspace-provisioner"
pnpm test -- --grep "workspace-welcome"

# Integration (manual):
# 1. Set up a network user with status "active" and workspaceSuggestedAt set
# 2. Send an email reply "yes" to the suggestion thread
# 3. Verify: immediate ack email received
# 4. Verify: workspace provisioned on Railway (check fleet status)
# 5. Verify: welcome email with magic link received
# 6. Verify: clicking magic link authenticates to workspace
# 7. Verify: networkUsers.status === "workspace"
# 8. Verify: subsequent status emails do NOT include workspace suggestion
```

## After Completion

1. Update `docs/state.md`: "Workspace provisioning wiring: end-to-end from email suggestion acceptance to authenticated workspace access"
2. Update `docs/roadmap.md`: Phase 15 fully wired (suggestion → acceptance → provisioning → welcome)
3. Phase retrospective: four briefs (110, 143, 100, 123) connected — was the separation right? Would a single brief have been better?

Reference docs checked: ADR-025 consistent (section 6 workspace seed — automatic on first boot via instrumentation.ts, no drift). Brief 110 consistent (readiness thresholds unchanged). Brief 143 consistent (middleware gates on WORKSPACE_OWNER_EMAIL). Brief 100 consistent (provisioner saga unchanged, env var list extended). Insight-180 addressed (infrastructure notification exemption documented).
