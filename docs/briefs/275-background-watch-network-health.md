# Brief 275: Background Watch and Network Health

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Brief 273; Brief 274; Brief 278 foundation checkpoint; Brief 279; operating cycle infrastructure; Brief 261
**Unlocks:** Briefs 276, 278

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Let Ditto keep working in the background for Active Requests and Member Signals while protecting network health, attention, and trust.

## Context

The strongest difference between Ditto and existing professional networks is that the user should not have to scroll, search repeatedly, or spam people. Ditto should quietly watch for strong-fit connections and timing, then ask for consent before acting.

This is the "always-on superconnector" behavior. It must be calm, restrained, explainable, and throttle-aware.

## Objective

Active Requests and Member Signals can create Background Watches. A watch periodically senses new/changed signals, searches member/public sources, evaluates fit, applies network health constraints, queues a small number of Introduction Proposals, Discovery Profile candidates, or digest items, and learns from user accepts/declines.

## Non-Goals

- No intro fulfillment; Brief 276 owns facilitation.
- No native social DM outreach.
- No automatic public posting.
- No high-volume outreach sequencing.
- No marketplace feed or notification flood.
- No new durable workflow engine if existing operating cycle infrastructure suffices.

## Inputs

1. `docs/briefs/273-need-request-onboarding-manual-search-entry.md` - Active Request model.
2. `docs/briefs/274-manual-search-connection-proposals.md` - Possible Connection and search.
3. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` - refusal triggers, block list, intro state.
4. `docs/briefs/279-outbound-discovery-claim-invites.md` - discovered non-members, source registry, and claim invites.
5. `docs/architecture.md` - Operating cycle archetype and Network Agent.
6. `processes/cycles/network-connecting.yaml` - existing connecting cycle if present.
7. `src/engine/pulse.ts`, `src/engine/chain-executor.ts`, `src/engine/relationship-pulse.ts` - existing continuous-operation patterns.
8. `src/engine/notify-user.ts` - email/workspace channel resolution and throttles.

## Constraints

- **Quiet by default.** Watches do not notify users unless there is a meaningful update or scheduled digest.
- **Few, better proposals.** Default cap should be low: e.g. max 3 new proposals per digest unless user explicitly asks for more.
- **Network health first.** Suppress proposals that would over-contact high-demand members, violate anti-persona, hit block list, or have low fit.
- **No contact without consent.** Watch can propose; it cannot contact.
- **Discovered people follow Brief 279.** Watch can create or surface Invitation Candidates, but claim invites still require source-registry compliance, operator approval in v1, and claim-before-public controls.
- **Privacy/admin foundation applies.** Watch cannot create production Discovery Profiles, claim invites, emails, or notifications outside Brief 278 foundation gates.
- **User control.** Users can pause, refine, close, and set frequency.
- **Feedback loops.** Accept, decline, "more like this", "less like this", and "not now" update future watch behavior.
- **Explainability.** Every watch proposal includes why, evidence, source, risk, and what changed.
- **Throttle with existing `notifyUser` rules.** Do not create a parallel notification path.
- **Use operating cycle shape.** Sense -> assess -> act -> gate -> land -> learn -> brief.
- **Outcome quality beats activity.** Watch success is measured by accepted high-fit proposals and reported outcomes, not number of proposals generated.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Operating cycle phases | Briefs 115-118 | adopt | Existing Ditto continuous-operation primitive. |
| Channel-aware notifications | Briefs 098b/099a-c | adopt | Existing `notifyUser` and resolver should carry digests/proposals. |
| Intro refusal/network safety | Brief 261 | adopt | Existing block/anti-persona/rate-limit logic informs network health. |
| Quiet background watch | Original to Ditto | original | Product thesis requires a superconnector working without feed-scrolling or spam. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `network_background_watches`, `network_watch_runs`, `network_watch_proposals`, and `network_watch_feedback` if existing process/run tables are not sufficient. |
| `drizzle/network/{NEXT}_background_watch.sql` | Create if schema changes. |
| `processes/cycles/network-background-watch.yaml` | Create or modify existing network-connecting cycle to support Active Request watches. |
| `src/engine/network-background-watch.ts` | Create: watch runner using manual search/proposal engine. |
| `src/engine/network-health.ts` | Create: central evaluator for over-contact, high-demand, recent intro, block, anti-persona, rate limit, low confidence, duplicate proposal. |
| `src/engine/network-watch-digest.ts` | Create: digest/proposal email composition. |
| `src/engine/tool-resolver.ts` | Modify: register guarded watch tools if invoked by agent/process. |
| `packages/web/app/api/v1/network/watches/route.ts` | Create: create/list/pause/resume/close watches; wrapper for guarded tools where needed. |
| `packages/web/components/network/watch-status.tsx` | Create: watch active card/status surface. |
| `packages/web/components/network/watch-proposal-queue.tsx` | Create: proposal queue with approve/decline/refine actions. |
| `packages/web/app/network/chat/client-card-actions.tsx` | Modify: "Keep watching" creates a real watch. |
| `packages/web/app/network/chat/expert-card-actions.tsx` | Modify: "Find me opportunities" can start a member-signal watch. |

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write assertion |
|----------------|-------------|-------------------|--------------------------|---------------------------|
| Watch create/update/pause/resume/close | Background watch state write | Required for tool path; HTTP path uses server wrapper run; audit before/after. | Watch route creates wrapper run. | Missing guard/caller `stepRunId` writes no watch state and no audit row. |
| Watch runner | Search job, proposal write, candidate handoff, digest scheduling | Harness/process step run required; no third-party contact. | Scheduled process/operating-cycle run provides step run. | Missing run id creates no proposals, no Invitation Candidates, no digest, and no contact. |
| Network health evaluator | Suppression/downgrade decision write | Required when persisting a decision; source inputs audited. | Watch/search/proposal wrapper run is propagated. | Missing guard writes no suppression/downgrade decision. |
| Digest composer/send | User notification | `notifyUser` only; `stepRunId` required; existing throttles apply. | Watch runner step creates/propagates run id. | Missing guard sends no notification and records no digest event. |
| `/api/v1/network/watches/*` routes | Wrapper invocation and state writes | Must not accept client-provided run ids. | Route mints wrapper run server-side. | Reject caller `stepRunId`, including `null`, `""`, `0`, `false`; guarded tool is not invoked and no watch row is written. |

## Watch Types

- **Request Watch:** looks for people who fit an Active Request.
- **Opportunity Watch:** looks for opportunities/clients/collaborations that fit a Member Signal.
- **Mutual Fit Watch:** looks for bidirectional fit where both sides have compatible signals.
- **Timing Watch:** re-surfaces a possible connection when new evidence/timing changes.

## Network Health Rules

Initial v1 rules:

1. Suppress if target member has an explicit block for requester/domain.
2. Suppress if target anti-persona strongly matches.
3. Suppress if target has been asked about too many introductions recently.
4. Suppress if requester has too many outstanding asks.
5. Suppress duplicate pair/request proposals inside cooldown window.
6. Downgrade if evidence is stale or weak.
7. Queue for human/operator review if commercial sensitivity is high.
8. Do not propose if confidence is low unless user asked for broad exploration.

## Acceptance Criteria

1. [ ] User can create a Background Watch from an Active Request.
2. [ ] User can create an Opportunity Watch from a Member Signal.
3. [ ] Watch has status: active, paused, closed, fulfilled, error.
4. [ ] Watch has frequency/settings: quiet, weekly digest, immediate for strong fit, manual only.
5. [ ] Watch runner uses search/proposal logic from Brief 274 rather than duplicating ranking.
6. [ ] Network health evaluator runs before any proposal reaches the user.
7. [ ] Network health evaluator applies at least the 8 v1 rules listed above.
8. [ ] Watch proposal includes why, why now, evidence, risk/gap, and recommended next action.
9. [ ] Watch never contacts a third party.
10. [ ] Watch can create Invitation Candidates for high-fit non-members but cannot invite/contact them outside Brief 279's approved path.
11. [ ] Watch notifications route through `notifyUser` or the existing channel resolver; no direct ad hoc email path.
12. [ ] Digest caps proposals by default and respects existing notification throttles.
13. [ ] User can pause/resume/close/refine a watch.
14. [ ] User feedback on proposals affects subsequent watch runs.
15. [ ] Failed watch runs are visible to admins/operators and do not spam users.
16. [ ] Watch outcome metrics capture accepted proposal, intro accepted, reply/meeting/outcome feedback, and "more like this/less like this"; proposal volume alone is not a success metric.
17. [ ] Tests cover network health rules, duplicate cooldown, high-demand throttle, pause/resume, digest cap, invitation-candidate handoff, wrapper bypass rejection including falsy values, and no-contact guarantee.
18. [ ] Manual smoke shows a watch created from a request, one run producing proposals/discovery candidates, user declining one, and next run adapting.

## Review Process

1. Spawn review agent with Briefs 270, 273-275, Brief 279, Brief 261, architecture operating cycle sections, and review checklist.
2. Review agent checks continuous-operation fit, network health completeness, notification throttles, no-contact guarantee, and no duplicate process primitives.
3. Present findings to human.

## Smoke Test

```bash
pnpm vitest run src/engine/network-background-watch*.test.ts src/engine/network-health*.test.ts
pnpm --filter @ditto/web test -- watch
pnpm run type-check

# Manual or scripted:
# 1. Create Active Request.
# 2. Start Background Watch.
# 3. Trigger one watch run in test mode.
# 4. Verify proposals generated but no intro/email to targets.
# 5. Decline one proposal as "too junior".
# 6. Trigger second run and verify feedback changes proposals.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 275.
3. If network health rules become broadly reusable, promote to `docs/dictionary.md` or an ADR.
