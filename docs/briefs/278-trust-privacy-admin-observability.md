# Brief 278: Trust, Privacy, Admin, and Observability for Superconnector Network

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Briefs 272-277; Brief 279
**Unlocks:** Brief 279 after the foundation checkpoint; human approval to close the Network Superconnector Reframe program after the closeout checkpoint

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Add the privacy, trust, admin, source-policy, compliance, and observability layer required for Member Signals, Active Requests, manual search, outbound discovery, background watch, share loop, and consent-based introductions.

## Context

A superconnector only works if members trust it. Ditto will store sensitive signals: what people are good at, what they want, what they do not want, who they are open to, and which introductions were accepted or declined. It will also infer from public sources and user edits. That creates product power and product risk.

This brief has two checkpoints. The **foundation checkpoint** must land before Brief 279 performs production outbound discovery or sends any claim invite. The **closeout checkpoint** lands after Briefs 275-277 and closes the parent program with dashboards, full regression coverage, and dry-run tooling.

## Objective

Admins/operators can audit source provenance, proposal quality, intro health, privacy settings, abuse/rate limits, source-policy violations, invite compliance, and failed watch runs. Users can view, edit, hide, export, and delete relevant signal/request data. The system prevents private leakage, spammy behavior, silent source drift, and outbound discovery before consent/legal/source-policy gates exist.

## Non-Goals

- No enterprise compliance dashboard.
- No payments or billing.
- No native social OAuth permissions management unless introduced by a prior brief.
- No automated model fine-tuning.
- No broad public analytics exposure.

## Inputs

1. Briefs 272-277 and 279 - implemented surfaces and data flows.
2. `docs/architecture.md` - governance, admin oversight, memory, channel routing.
3. `docs/review-checklist.md` - current architecture gates.
4. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` - refusal triggers and block list.
5. `docs/briefs/279-outbound-discovery-claim-invites.md` - source registry, Discovery Profiles, Invitation Candidates, claim/delete controls.
6. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` - private filters and visibility.
7. FTC CAN-SPAM compliance guide (`https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business`) - claim invite and intro email compliance.
8. LinkedIn User Agreement/prohibited software guidance - source-policy enforcement for LinkedIn pointer-only posture.
9. `src/engine/network-api-auth.ts` - Network API auth.
10. `packages/web/app/admin/` - existing admin surfaces if present.
11. `packages/core/src/db/network/schema.ts` - Network-tier data.

## Constraints

- **User data controls must be real.** Edit/hide/delete/export actions need durable effects.
- **Private leakage tests are mandatory.** Every public/search/share/email surface must have scrub coverage.
- **Admin visibility is bounded.** Admin tools can inspect operational data but should avoid casually exposing private raw text where not needed.
- **Audit trails are mandatory.** Source additions, claim edits, visibility changes, request changes, intro decisions, watch feedback, and share generation should be auditable.
- **Rate limits and abuse controls are enforced server-side.**
- **Discovered profiles are privacy-sensitive.** They stay internal, expire or refresh on schedule, and can be claimed, declined, suppressed, or deleted.
- **Source policy is enforced before storage and before outreach.** Registered source policy is not documentation only; code must block disallowed collection, storage, and invite use.
- **Outbound email compliance is mandatory.** Claim invites and intro-related emails must have accurate sender identity, lawful footer configuration where required, opt-out/suppression, complaint handling, and no misleading subject/body copy.
- **Retention is explicit.** Raw source snippets, Discovery Profiles, claim tokens, invite events, and audit tombstones need retention/default expiry behavior.
- **Deletion/export identity is verified.** A person requesting export/delete for a Discovery Profile or Member Signal must prove control through claim token, email challenge, or authenticated session.
- **Complaint thresholds pause discovery.** Complaint or suppression spikes automatically pause the affected source/segment until operator review.
- **Do not create a second admin auth system.**
- **Respect deployment mode.** Admin routes stay on public Network, not workspace deployments.
- **No destructive delete without confirmation and audit tombstone where legally/product-wise appropriate.**

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Admin oversight | Brief 108, architecture admin section | adopt | Existing admin pause/resume/feedback posture. |
| Private filters and visibility | Brief 258 | adopt | Existing per-fact visibility and private scrub precedent. |
| Intro refusal controls | Brief 261 | adopt | Existing block list, anti-persona, rate-limit behavior. |
| Cross-deployment durability review | Insight-234 | adopt | Network/workspace artifacts need durable sender/consumer semantics. |
| Outbound email compliance | FTC CAN-SPAM guide | pattern | Claim invites and intro emails must support accurate sender identity, suppression, opt-out, and complaint handling. |
| Source-policy enforcement | LinkedIn/Microsoft docs + LinkedIn User Agreement + robots/REP norms | pattern | Source registry needs enforceable collection/storage/invite rules, not copy-only guidance. |
| Superconnector trust dashboard | Original to Ditto | original | New program-level need to observe network health and signal quality. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add audit/metrics tables only if existing feedback/activity tables cannot cover events. |
| `src/engine/network-privacy-scrubber.ts` | Create/extend: central scrubber for public/search/share/email contexts. |
| `src/engine/network-audit.ts` | Create/extend: typed audit events for signal, request, watch, intro, share, source. |
| `src/engine/network-abuse-controls.ts` | Create/extend: rate-limit and abuse decisions shared by search/watch/intro/profile chat. |
| `src/engine/discovery-source-policy.ts` | Create/extend: enforce source registry collection/storage/invite policy before Brief 279 discovery stores or sends anything. |
| `src/engine/network-suppression.ts` | Create: suppression list for declines, complaints, opt-outs, deleted profiles, blocked domains, and paused sources/segments. |
| `src/engine/network-email-compliance.ts` | Create: footer/sender/opt-out/commercial-classification helper for claim invites and intro emails. |
| `packages/web/app/api/v1/network/privacy/export/route.ts` | Create: user export endpoint for signal/request/watch/share/intro data. |
| `packages/web/app/api/v1/network/privacy/delete/route.ts` | Create: delete/hide flow for Member Signal and request data, with safeguards. |
| `packages/web/app/admin/network/superconnector/page.tsx` | Create: admin dashboard for watches, proposals, source errors, intro health, abuse/refusal events. |
| `packages/web/components/network/privacy-center.tsx` | Create: user-facing controls for signal sources, claims, visibility, requests, watches, share links. |
| `packages/web/components/admin/network-health-dashboard.tsx` | Create: admin queue and metrics components. |
| `docs/review-checklist.md` | Modify: add gates for Member Signal provenance, private leakage, background-watch no-contact, and two-sided intro consent if they are durable review patterns. |
| `docs/dictionary.md` | Modify: finalize canonical terms from Brief 270 if not already done in 271. |

## Foundation Checkpoint Before Brief 279

These items must be implemented and reviewed before outbound discovery sends production claim invites or stores new production Discovery Profiles:

1. Central scrubber exists and covers Member Signal, Active Request, search result, proposal email, intro email, watch digest, share, and discovery invite contexts.
2. Audit event writer exists for source add/remove, claim review, request edit, search feedback, candidate save, discovery source search, invitation candidate score, operator decision, invite send, claim, decline, complaint, delete.
3. Source-policy enforcement helper exists and can block disallowed collection/storage/invite use before any 279 tool writes.
4. Suppression list exists for opt-out, complaint, prior decline, delete request, blocked domain/person, source pause, segment pause.
5. Email compliance helper exists for claim invites and introduction emails: sender identity, reply/opt-out handling, suppression, footer/address config where required, and misleading-subject checks.
6. Admin/operator queue scaffold exists for approving/suppressing claim invites.
7. Privacy export/delete routes exist for Member Signal and Discovery Profile data with identity verification.
8. Retention defaults exist for Discovery Profiles, raw source snippets, claim tokens, invite events, and audit tombstones.
9. All foundation routes/tools have side-effect matrices and wrapper-step-run bypass tests.

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write/no-send assertion |
|----------------|-------------|-------------------|--------------------------|--------------------------------|
| `write_network_audit_event(stepRunId, ...)` or equivalent | Audit row creation for source, claim, request, search, discovery, invite, intro, share, privacy, and admin events | Required for tool/code paths that write audit rows. | Calling route/process/admin action creates or propagates wrapper run. | Missing guard writes no audit row unless the source is a documented system webhook with separate signature verification. |
| `/api/v1/network/privacy/export` | Export job/file creation and audit event | Server wrapper run only; identity verification required. | Privacy export route mints wrapper run server-side. | Caller `stepRunId`, including falsy values, is rejected; no export job/file/audit row is created. |
| `/api/v1/network/privacy/delete` | Hide/delete request, tombstone, retention scheduling, audit event | Server wrapper run only; identity verification required. | Privacy delete route mints wrapper run server-side. | Caller `stepRunId` is rejected; no destructive write, tombstone, or queue job is created. |
| `record_network_suppression(stepRunId, ...)` | Opt-out, complaint, decline, block, source pause, segment pause | Required unless handled by a signed inbound-email/webhook adapter that creates an equivalent audited context. | Suppression route, inbound handler, or admin action creates wrapper run. | Missing guard or spoofed caller run id writes no suppression row. |
| Source-policy admin/update route | Source registry, collection/storage/invite policy, source-class pause | Server wrapper run only; admin auth required. | Admin source-policy route mints wrapper run server-side. | Caller `stepRunId` is rejected; no source-policy write and no discovery unpause. |
| Admin approve/suppress/pause/replay actions | Operator decision, pause/unpause, dry-run replay, queue state write | Server wrapper run only; admin auth and reason required. | Admin dashboard route mints wrapper run server-side. | Caller `stepRunId` is rejected; no approval, send enablement, pause change, replay write, or invite send. |
| Retention cleanup job | Raw snippet/profile/token cleanup, tombstone preservation | Scheduled process/system step run required; deletion reason audited. | Scheduler/operating-cycle run provides step run. | Missing run id performs no deletion and emits an alertable failure. |
| Email compliance helper | No send by itself; classifies sender/footer/opt-out/suppression readiness | Pure helper; senders in Briefs 276/279 still require guarded send tools. | Not applicable unless a route persists compliance decisions, in which case route wrapper applies. | Helper cannot send email; failing compliance blocks send in caller matrix. |

## Privacy Center Requirements

User can:

- see all sources Ditto used,
- remove a source from future reasoning,
- hide or delete claims,
- change visibility per claim,
- pause public profile,
- pause search/watch,
- close requests,
- export Member Signal and Active Request data,
- delete public profile projection,
- see intro history and feedback,
- manage blocked domains/people/patterns,
- see what is public versus private.

## Admin Requirements

Admin/operator can:

- inspect failed source research jobs,
- inspect watch run failures,
- inspect discovery candidates and source-registry violations,
- review high-risk intro proposals,
- view refusal trigger counts,
- view over-contact/high-demand member flags,
- pause a member or request,
- audit source provenance for a reported profile,
- approve/suppress claim invites,
- see share conversion metrics in aggregate,
- see private-leakage test status/build warnings,
- replay a watch run in dry-run mode,
- override or suppress abusive sessions.
- pause a discovery source, source class, invite segment, or all outbound discovery immediately.
- inspect email opt-outs, complaints, suppression reasons, and source-policy blocks without exposing private raw text by default.

## Metrics

Track:

- member signal completion rate,
- source types added,
- claim approval/edit/hide rate,
- manual searches run,
- searches saved as requests,
- active watches created,
- watch proposals per run,
- approval/decline rate,
- intro thread sent rate,
- intro usefulness feedback,
- public profile visitor conversion,
- share card copy/open/download,
- abuse/refusal/rate-limit counts,
- discovery candidate volume, approval, invite, claim, decline, complaint, deletion,
- high-demand member suppression count.
- economic outcome signals: intro accepted, reply received, meeting occurred, work/client/hire/funding/advisory/partnership outcome reported, user willingness-to-pay signal, and repeated request/watch creation after successful outcome.

## Acceptance Criteria

### Foundation acceptance criteria - required before Brief 279 production discovery/invites

1. [ ] Central scrubber covers public profile, share, manual search results, proposal emails, intro thread emails, watch digests, claim invites, and discovery admin previews.
2. [ ] Tests prove private/on-request/hidden claims do not leak across those surfaces.
3. [ ] Source-policy enforcement blocks disallowed collection, storage, and invite use before any discovery tool writes.
4. [ ] Suppression list blocks opt-outs, complaints, prior declines, deleted profiles, blocked domains/people, and paused sources/segments.
5. [ ] Email compliance helper supports accurate sender identity, reply/opt-out path, suppression checks, footer/address config where required, and misleading-subject checks.
6. [ ] Admin/operator queue scaffold can approve/suppress claim invites and pause all outbound discovery.
7. [ ] Export/delete routes exist for Member Signal and Discovery Profile data with identity verification.
8. [ ] Retention/refresh defaults exist for Discovery Profiles, raw source snippets, claim tokens, invite events, and audit tombstones.
9. [ ] Audit events are written for source add/remove, claim edit/visibility, request edit, search feedback, invitation candidate score, operator approve/suppress, invite sent, claim, decline, complaint, and delete.
10. [ ] All foundation routes/tools reject caller-supplied `stepRunId`, including falsy values, mint wrapper step runs server-side, and tests assert no writes/sends on bypass.
11. [ ] Complaint/suppression thresholds can automatically pause a source/segment until operator review.
12. [ ] Deployment mode check prevents admin routes in workspace mode.

### Closeout acceptance criteria - required before parent 270 closes

13. [ ] User can view every source attached to their Member Signal.
14. [ ] User can remove a source from future reasoning.
15. [ ] User can edit/hide/delete claims and change visibility.
16. [ ] User can pause public profile visibility without deleting private signal.
17. [ ] User can pause/resume/close Background Watches.
18. [ ] User can export signal/request/watch/intro/share data.
19. [ ] User can delete public profile projection and confirm direct profile URL behavior after deletion.
20. [ ] Admin dashboard shows source failures, watch failures, high-risk proposals, refusal counts, over-contact flags, source-policy blocks, suppression counts, and complaint metrics.
21. [ ] Admin can pause a member/request/source/segment and the pause is honored by search/watch/discovery/intro.
22. [ ] Abuse/rate-limit controls are server-side and shared where appropriate.
23. [ ] Audit events are written for watch feedback, intro approval/decline, share generation, profile deletion, dry-run replay, and admin override.
24. [ ] Admin dashboard includes discovery candidates, source errors, invite approval queue, claim/decline/complaint metrics.
25. [ ] `docs/review-checklist.md` includes durable review gates for provenance, private leakage, no-contact background watch, two-sided consent, claim-before-public discovery, outbound email suppression, and source-policy enforcement.
26. [ ] Dry-run watch replay exists for operator debugging and does not contact/notify users.
27. [ ] Metrics are available in aggregate without exposing private text by default.
28. [ ] Metrics include economic outcome signals and willingness-to-pay signals for the later pricing brief; no payment UI/code is introduced here.
29. [ ] Full superconnector regression suite runs focused tests across Briefs 272-279 plus root type-check.

## Review Process

1. Foundation review: spawn review agent with Briefs 270, 272-274, 278, 279, architecture, review checklist, and implemented foundation diffs before Brief 279 build starts.
2. Foundation reviewer checks source-policy enforcement, suppression, retention/delete, email compliance, admin queue scaffold, wrapper-step-run coverage, and no-private-leakage tests.
3. Closeout review: spawn review agent with Briefs 270-279, architecture, review checklist, and all implemented diffs before closing parent Brief 270.
4. Present findings to human before Brief 279 production invites and before parent closeout.

## Smoke Test

```bash
pnpm vitest run src/engine/network-privacy-scrubber*.test.ts src/engine/network-audit*.test.ts src/engine/network-abuse-controls*.test.ts
pnpm --filter @ditto/web test -- privacy
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Create Member Signal with public, on-request, private, and hidden claims.
# 2. Export data.
# 3. Open public profile/share/search/email preview and verify only public approved claims appear.
# 4. Pause public profile.
# 5. Start a watch, then pause it.
# 6. Open admin dashboard and verify watch/source/refusal events.
# 7. Run dry-run watch replay and verify no notifications/contact occur.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 278 and parent 270.
3. Move parent Brief 270 to complete only after fresh-context review and human approval.
4. Consider ADR for Network Superconnector trust/privacy model if the resulting architecture becomes durable.
