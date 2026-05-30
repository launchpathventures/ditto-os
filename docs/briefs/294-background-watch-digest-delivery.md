# Brief 294: Background Watch — Digest Delivery (Cross-Tier)

**Date:** 2026-05-19
**Status:** draft
**Depends on:** Brief 293 (engine skeleton — runner, tables, proposals); Brief 288 (complete — `network_workspace_deliveries` durable substrate); Briefs 098b/099a-c (`notifyUser`); Brief 283 (email compliance)
**Unlocks:** Brief 295 (review + Curate UI + feedback)
**Parent:** Brief 275 (read it for the cross-tier topology and decisions D1–D16, especially D6, D7, D8, D11)

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Compose a capped, explainable, quiet-by-default digest from queued proposals and deliver it across the tier boundary through Brief 288's durable substrate, landing as a throttled `notifyUser` on the workspace tier. Roadmap row 275 (part 2 of 3).

## Context

Brief 293 produces queued proposals Network-tier but delivers nothing. This sub-brief is the **delivery seam**. It is the highest-risk decision in the parent (cross-tier; Cross-Cutting Risk §1), which is why it is isolated: it can be tested by asserting a `watch-digest` row appears in `network_workspace_deliveries` (Network side) and that the workspace consumer pulls it and calls `notifyUser` exactly once, throttled and capped.

The watch cannot call `notifyUser` directly — that primitive is workspace-tier and imports the workspace `db` (parent §Context). Brief 288 already built `network_workspace_deliveries`: sender-side persistence + consumer pull-and-ack + idempotent ACK retry + terminal-state persistence (Insight-234). This brief adds one new `kind` to that table and a consumer branch; it builds **no new transport** (Non-Goal).

## Objective

When a watch run produces proposals, a quiet-by-default digest (≤3 by default, empty → no send) is persisted as a `watch-digest` delivery; the workspace consumer pulls it and calls `notifyUser` locally, at the user's local cadence, respecting all existing throttles.

## Non-Goals

- No new cross-tier transport — extend Brief 288's table only.
- No new notification path — the workspace consumer calls existing `notifyUser`.
- No watch runner / health / schema-for-watch changes — Brief 293 owns those.
- No proposal-queue or status UI — Brief 295.
- No change to `network_workspace_deliveries` columns beyond adding an enum value.

## Inputs

1. `docs/briefs/275-background-watch-network-health.md` — parent; D6 (quiet-week), D7 (cross-tier), D8 (composer), D11 (timezone).
2. `docs/briefs/complete/288-intro-consent-state-machine-and-decision-emails.md` + `packages/core/src/db/network/schema.ts:249-258,1734-1756` — `networkWorkspaceDeliveryKindValues` (currently `forwarded_note`, `visitor_intro_request`, `intro-proposal-card`), `networkWorkspaceDeliveryStatusValues` (`pending`/`imported`/`failed`), table columns + indexes.
3. The workspace-tier delivery consumer built by Brief 288 (pull-and-ack loop) — extend with a `watch-digest` branch.
4. `src/engine/notify-user.ts` — `MAX_EMAILS_PER_USER_PER_DAY=5`, `MIN_MS_BETWEEN_NOTIFICATIONS=1h`, channel resolver, `stepRunId` requirement.
5. `src/engine/relationship-pulse.ts:443-446` — `shouldReach=false → skip send` empty-state precedent.
6. `docs/research/275-background-watch-network-health.md` §8 — `react-dom/server` `renderToStaticMarkup` for email card (no new dep; landscape.md entry exists).
7. Brief 283 — email compliance profile / RFC 8058 list-unsubscribe.

## Constraints

- Extend `networkWorkspaceDeliveryKindValues` with `"watch-digest"` only; no other column change to `network_workspace_deliveries` (parent D7; Cross-Cutting Risk §1).
- The Network-tier composer writes the delivery row with a `stepRunId` (Insight-180) and a `dedupeKey` so re-runs do not double-deliver (idempotent — reuse Brief 288's `dedupeKey` semantics).
- The workspace consumer calls **existing `notifyUser`** with its own workspace-tier `stepRunId`; it does not invent an email path (parent Constraint; AC #11).
- Empty digest → **no delivery row written** (Designer D-Q1; precedent `relationship-pulse.ts:443-446`).
- Default cap ≤3 proposals per digest unless watch settings explicitly raise it; never exceed `notifyUser` throttles.
- Per-user timezone (parent D11): the composer/scheduler resolves "Monday 09:00 local" via `Intl.DateTimeFormat` against the watch's `ianaTimezone`; no new dependency.
- Quiet-week calibration (parent D6): when the watch's `consecutiveQuietRuns` column (added by Brief 293) reaches ≥3, the digest payload includes one amber calibration item (broaden/close); this is a payload flag, not a separate notification. The composer reads and the runner increments/resets `consecutiveQuietRuns`.
- Privacy scrubber (Brief 283) runs on every field rendered into the digest; Brief 261 Hard Rule #5 — never render private claims/anti-persona text (parent D16).
- RFC 8058 list-unsubscribe maps to "pause this watch". The one-click `List-Unsubscribe-Post` arrives with **no session** (Reviewer FLAG-6), so it MUST NOT hit the session-authenticated `/api/v1/network/watches/*` route. Instead the digest email embeds a **signed single-purpose token** (reuse the existing email-token pattern in `src/engine/magic-link.ts`) encoding `{ watchId, action: "pause" }`; a dedicated route `/api/v1/network/watches/unsubscribe` validates the token (not a session), transitions that watch to `paused`, and deletes no data. Token is single-watch, expiring, and replay-safe per the magic-link pattern.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Cross-tier durable delivery | Brief 288 `network_workspace_deliveries` | adopt | The only sanctioned cross-tier path (Insight-234). |
| Empty-state suppression | `relationship-pulse.ts:443-446` | pattern | Existing skip-send-when-nothing-changed. |
| Throttled notification | `notifyUser` (Briefs 098b/099a-c) | adopt | Existing throttle/resolver; no parallel path. |
| Email HTML | `react-dom/server` `renderToStaticMarkup` | pattern | Stdlib of the React dep already present; no new dep. |
| List-unsubscribe = pause | RFC 8058 + Designer spec | pattern | Standard mailer convention mapped to watch control. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `"watch-digest"` to `networkWorkspaceDeliveryKindValues` (enum value only) |
| `drizzle/network/0018_*_watch_digest_kind.sql` + snapshot | Create: migration for the enum value (journal next idx after 293's 17 = **18**; Insight-190 — re-verify at build time) |
| `src/engine/network-watch-digest.ts` | Create: digest composer — selects ≤cap proposals, empty→skip, scrubbed fields, `renderToStaticMarkup` card, quiet-week amber flag, writes `watch-digest` delivery row with `stepRunId` + `dedupeKey` |
| `src/engine/network-background-watch.ts` | Modify: the runner's `land` phase calls the digest composer; tz-resolved schedule of next digest |
| Workspace delivery consumer (Brief 288's pull-and-ack module) | Modify: add a `watch-digest` branch that calls `notifyUser` locally with a workspace `stepRunId`, embeds the signed unsubscribe token in the `List-Unsubscribe`/`List-Unsubscribe-Post` headers, then acks |
| `packages/web/app/api/v1/network/watches/unsubscribe/route.ts` | Create: token-authenticated (NOT session) one-click unsubscribe → pause; validates the `magic-link`-style signed token, transitions watch to `paused`, deletes nothing |

## User Experience

- **Jobs affected:** Review (the digest is the primary Review surface), + (quiet weeks are silent — ambient only).
- **Primitives involved:** Digest email card (no new primitive), list-unsubscribe → pause control.
- **Process-owner perspective:** On their local Monday-9am cadence the user gets at most a 3-proposal digest; each entry is scrubbed and explainable. Quiet weeks produce nothing. After three silent weeks, one calm amber line in the next digest (or, if still empty, surfaced via the 295 status card) offers to broaden or close. Unsubscribing from the email pauses the watch — it does not delete data.
- **Interaction states:** success (digest delivered), empty (no row written; silence), partial (some proposals health-suppressed → digest shows only the survivors + a "others reviewed, not surfaced" count, no private detail), error (delivery row stuck → operator-visible via Brief 295 admin surface; user not spammed).
- **Designer input:** `docs/research/275-background-watch-network-health-ux.md` §C (digest card), §B′ (ambient/quiet), D-Q1 (suppress empty), D-Q3 (Monday 9am local).

## Acceptance Criteria

1. [ ] `networkWorkspaceDeliveryKindValues` includes `"watch-digest"`; migration + snapshot exist; `type-check` passes.
2. [ ] A watch run with ≥1 surviving proposal writes exactly one `watch-digest` row to `network_workspace_deliveries` with a non-null `stepRunId` and a `dedupeKey`.
3. [ ] A re-run with the same proposals does not write a second delivery row (idempotent via `dedupeKey`).
4. [ ] A watch run with zero surviving proposals writes **no** delivery row (empty-state suppression).
5. [ ] The digest contains at most the default cap (3) proposals unless watch settings raise it; it never exceeds `notifyUser` throttles.
6. [ ] The workspace consumer pulls a `watch-digest` row and calls `notifyUser` exactly once with its own workspace-tier `stepRunId`, then acks; a redelivery does not double-notify.
7. [ ] No code path in this brief sends email except through `notifyUser` (asserted by test/inspection — AC maps to parent #11).
8. [ ] Every field rendered into the digest passes the Brief 283 scrubber; a test asserts no private-claim/anti-persona string reaches the card (Brief 261 Hard Rule #5).
9. [ ] The digest is scheduled at the watch's local "Monday 09:00" via `Intl.DateTimeFormat` against `ianaTimezone`; no new dependency added.
10. [ ] After ≥3 consecutive quiet weeks the next digest payload carries the amber calibration flag (broaden/close); it does not generate an extra notification.
11. [ ] The digest email's RFC 8058 one-click `List-Unsubscribe-Post` hits `/api/v1/network/watches/unsubscribe`, authenticates by signed `magic-link`-style token (no session), transitions exactly that watch to `paused`, and deletes no data; a forged/expired token is rejected (Reviewer FLAG-6).
12. [ ] `pnpm run type-check` passes; smoke test passes.

## Review Process

1. Spawn a fresh-context review agent with this brief, parent Brief 275, Brief 288, `docs/architecture.md`, `docs/review-checklist.md`.
2. Reviewer checks: no parallel cross-tier path (only Brief 288's table extended), no parallel notification path (only `notifyUser`), idempotent dedupe, empty-state suppression, scrubber on every rendered field, throttle compliance, timezone correctness, no `network_workspace_deliveries` column change beyond the enum value.
3. Present work + findings to the human.

## Smoke Test

```bash
pnpm vitest run src/engine/network-watch-digest.test.ts
pnpm --filter @ditto/web test -- watch-digest
pnpm run type-check

# Manual (full cross-tier):
# 1. Trigger a Network-tier watch run producing 5 proposals (cap 3).
# 2. Assert one watch-digest row in network_workspace_deliveries; <=3 proposals; scrubbed; dedupeKey set.
# 3. Re-run with same proposals — assert no second row.
# 4. Run the workspace consumer — assert notifyUser fired once, throttled, unsubscribe=pause; row acked.
# 5. Trigger a run with 0 surviving proposals — assert NO delivery row, NO notification.
# 6. Simulate 3 quiet weeks then 1 proposal — assert amber calibration flag present in payload.
```

## After Completion

1. Update `docs/state.md` rolling log (Builder checkpoint).
2. Parent Brief 275 stays in-progress (2 of 3).
3. Hand off to Brief 295.
