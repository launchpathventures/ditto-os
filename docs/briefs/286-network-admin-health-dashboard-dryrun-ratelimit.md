# Brief 286: Admin Network-Health Dashboard, Dry-Run Replay, Rate-Limit Consolidation

**Date:** 2026-05-18
**Status:** implemented & per-brief fresh-context reviewed APPROVE 2026-05-19; closeout set (285, 286, 287) ready for fresh-context closeout review; pending human approval to close parent Brief 270
**Depends on:** Sub-briefs **282** (audit read), **283** (suppression/source-policy/complaint data), **284** (admin scaffold + deployment gate to extend); Briefs **275-277** (watch, intro, share surfaces whose health/metrics this displays)
**Unlocks:** Sub-brief 287; the closeout checkpoint

> Closeout sub-brief 2 of 3 under parent **Brief 278**. One operator UI surface + the server-side rate-limit consolidation. Builds in parallel with sub-brief 285 after 284. UX reference: `docs/research/278-trust-privacy-admin-ux.md` §4 — do not re-derive.

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** The operator trust-&-safety + network-health dashboard, dry-run watch replay, and shared server-side rate-limit/abuse controls with a Postgres cross-instance backstop.

## Context

Parent Brief 278 closeout requires an operator surface to triage liability-bearing items, observe network health, and read aggregate metrics (incl. economic-outcome/willingness-to-pay) — without casually exposing private raw text. It also requires server-side, shared rate-limit controls and a dry-run watch replay that contacts no one. The Designer fully specified the operator experience (`-ux.md` §4, three triage bands, bounded-visibility-with-audited-reveal). The parent resolved R-Q3 (hand-rolled Postgres counter + keep in-memory L1, no new dependency).

## Objective

An operator can, on the existing `/admin` shell (gated off workspace deployments), triage the action-required queue, see subsystem health and private-leakage test status, read aggregate metrics, drill per-entity in a side-sheet, run a dry-run watch replay that contacts no one, and reveal raw text only via an explicit audited action — backed by shared server-side rate limits with a Postgres backstop.

## Non-Goals

- No member surface (sub-brief 285).
- No new admin auth/chrome — extend the sub-brief 284 scaffold under the existing `/admin` shell (parent constraint).
- No payment/billing UI or code — economic-outcome/willingness-to-pay are display-only `MetricBlock`s (parent Non-Goals; AC #28).
- No new audit/suppression/policy tables — read what 282/283/284 created.
- No new external rate-limit dependency (R-Q3 — hand-rolled Postgres counter).
- No raw private text exposed by default — only via the explicit audited reveal.

## Inputs

1. `docs/research/278-trust-privacy-admin-ux.md` — **§4 in full** (4.1 triage-not-analytics, 4.2 three bands + per-entity drill, 4.3 primitive composition, 4.4 interaction states incl. the deliberately-designed "all clear" empty state, 4.5 audit-log/side-sheet/reason-taxonomy/dry-run patterns, 4.6 bounded visibility + audited reveal + post-reveal rendering).
2. `docs/briefs/278-trust-privacy-admin-observability.md` — parent; R-Q3; §Metrics; §Security (bounded visibility); §User Experience.
3. `docs/research/278-trust-privacy-admin.md` — §10 (rate-limit options + the single-instance limitation), §14 (admin console options), §11 (complaint pause surfaced here).
4. `docs/briefs/284-network-privacy-export-delete-retention-admin-scaffold.md` — the scaffold + deployment gate this extends.
5. `src/engine/network-audit.ts`, `network-suppression.ts`, `discovery-source-policy.ts` (282/283) — the data sources.
6. Briefs 275-277 — watch/intro/share run data, the dry-run replay target, share-conversion + economic-outcome signals.
7. `packages/web/app/admin/page.tsx` + `packages/web/app/admin/fleet/page.tsx` — existing admin idioms (stat cards, `healthDot`, `trustBadge`, design tokens, side-sheet) to reuse.
8. `docs/research/trust-visibility-ux.md` — the Evaluate/dry-run pattern (GitHub rulesets precedent) the replay banner adopts.
9. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` — `refusalReason` taxonomy (the suppress/override reason enum); Hard Rule #5 (admin sees counts/codes, never raw anti-persona text).

## Constraints

- Reuse the existing `/admin` shell + session-cookie/Bearer auth + `isWorkspaceDeployment() → notFound()` (extends sub-brief 284's scaffold). No second auth system; the surface simply does not exist in workspace mode.
- Bounded admin visibility (parent §Security; Designer §4.6): structured metadata by default — counts, reason codes, classifications, provenance labels, leakage-test pass/fail; **raw private text only via an explicit "Reveal raw text (audited)" action** that (a) requires a reason, (b) writes its own audit row via `writeNetworkAuditEvent`, (c) is visually marked privileged, (d) renders post-reveal inline in the same row as a `RecordBlock` with a "Revealed — this view is audited" annotation + revealing actor + timestamp (not a modal, does not leave the queue context).
- **Audited admin-reveal is the single documented intentional scrubber bypass — not a defect.** Sub-brief 282's scrubber-bypass discipline explicitly names this path as the *only* sanctioned bypass of `scrubForSurface`. It is sanctioned because (a) every reveal writes its own audit row recording the reveal, (b) it requires admin auth + a structured reason + a server-minted wrapper run, (c) it is visually marked privileged so it cannot happen by accident, (d) the post-reveal annotation tells the operator the action they just took is audited. No other scrubber bypass is introduced anywhere in this dashboard or its sub-components.
- **Hard Rule #5 (origin: Brief 259 system prompt; carried forward as a binding rule by Brief 261).** Admin sees refusal **counts and reason codes** only; raw anti-persona text is never rendered, even behind the audited reveal (the reveal is for private member claim/email text, not for anti-persona rules — the rule text has no admin surface at all).
- Every destructive/state-changing admin action (pause/unpause/suppress/override/replay) requires a structured **reason** (`InputRequestBlock` textarea + a reason enum aligned to Brief 261 `refusalReason`), mints a server-side wrapper run, rejects caller `stepRunId` incl. falsy, and writes an audit event (Insight-180/232/211).
- Dry-run watch replay **contacts/notifies no one and writes nothing user-visible**: an unmissable persistent "DRY RUN — no contact" banner and an explicit post-run assertion line ("0 emails sent · 0 notifications · 0 writes"); labelled `ArtifactBlock`/`RecordBlock` "DRY RUN — no contact occurred" (Designer §4.3/§4.5; AC #26).
- Rate-limit (R-Q3): keep the existing in-memory check as L1 (fast, single-instance best-effort) and add a `network_rate_counters` Postgres table as the durable cross-instance backstop for the limits that matter (invite send, export, delete, search, profile-chat). Shared by search/watch/intro/profile-chat. No Redis, no new dependency.
- **Rate-limit algorithm is fixed-window (committed choice).** Each `(bucketKey, windowStart)` row is one Postgres write per bucket per window — cheap, simple, and asserts cross-instance counter via the unique key + atomic increment. Sliding-window was considered and rejected: it requires either a per-request write of the timestamp (write amplification) or a separate counter table partitioned more finely (more migrations, more keys). The limits here are **protective, not precise** — we want "this actor cannot send 1000 invites in a minute," not "exactly 100 per rolling 60s." Fixed-window allows up to 2x burst at the window edge in the worst case; that is acceptable for the abuse-control use case (the absolute cap is what matters). If a later limit needs precise smoothing, it can be added without changing the existing fixed-window callers.
- **Email-challenge outer limiter.** `network-abuse-controls.ts` exposes a limiter shape that sub-brief 284's `/privacy/export` and `/privacy/delete` email-challenge routes call **before** any identity-verifier work — per-IP and per-target-email-hash. The limiter short-circuits with a non-revealing 429 (does not confirm/deny whether the email is a known subject) so it cannot be used to enumerate. 286 owns the limiter; 284 declares the dependency and the integration is asserted by a test that pins 284's challenge route to the limiter.
- Economic-outcome/willingness-to-pay metrics are **display-only** `MetricBlock`s/`ChartBlock`s — no payment UI/code (AC #28; parent Non-Goals).
- Aggregate-only: metrics never expose private raw text by default (AC #27).
- Network-tier schema follows Insight-190 for `network_rate_counters`.
- `@ditto/core` boundary: `network_rate_counters` schema → core network schema file; the dashboard, `network-abuse-controls.ts`, and the replay are Ditto product.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Operator triage shell | Navan safety dashboard (Refero `a156afc7…`); existing `/admin` idioms | pattern + adopt | Side-sheet per-entity drill keeps queue context; reuse existing admin chrome (parent constraint). |
| Audit-log operator view | Mercury user-activity (Refero `da0ff7bb…`) + Cake Equity (Refero `d1719b7f…`) | pattern | Reverse-chron, event badge, actor column, filter facets, row-expand; Insight-127 three-level disclosure. |
| Reason taxonomy | Xbox report-reason dropdown (Refero `9dd1f154…`); Brief 261 `refusalReason` | pattern + adopt | Structured enum so refusal/override metrics are countable and map to the existing taxonomy. |
| Dry-run replay banner | `docs/research/trust-visibility-ux.md` (GitHub rulesets Evaluate) | pattern | Persistent "no contact" banner + post-run zero-assertion. |
| Bounded visibility + audited reveal | Insight-201; Insight-127; Designer §4.6 | adopt | Operator-side twin of the member sealed-data pattern. |
| Postgres rate-limit backstop | Research §10 (single-instance limitation); R-Q3 | pattern + original | Keep in-memory L1; the Postgres counter backstop is the Original-to-Ditto durable layer. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `networkRateCounters` — `id`, `bucketKey` (limit name + actor/segment), `windowStart`, `count`, `updatedAt`. Unique on `(bucketKey, windowStart)`. |
| `drizzle/network/<next-idx>_*.sql` + snapshot + journal | Create: migration (Insight-190 — next free idx at build). |
| `src/engine/network-abuse-controls.ts` | Create/extend: shared `checkRateLimit({ limitName, actor, ... })` — in-memory L1 then Postgres `networkRateCounters` backstop; used by search/watch/intro/profile-chat; server-side only. |
| `packages/web/app/admin/network/superconnector/page.tsx` | Modify/extend (from sub-brief 284 scaffold): the full three-band dashboard + per-entity side-sheet + dry-run replay entry; reuse `/admin` auth + deployment gate. |
| `packages/web/components/admin/network-health-dashboard.tsx` | Create: the band components per `-ux.md` §4.3 — `ReviewCardBlock` queues, `StatusCardBlock`+`healthDot` health, **red `AlertBlock`** for leakage-test failure + auto-pause spikes, `MetricBlock`/`ChartBlock` aggregate metrics, `InteractiveTableBlock` audit/candidate/suppression rows with filter facets + accordion drill, the audited-reveal `RecordBlock` post-reveal rendering, the dry-run "DRY RUN — no contact" surface. |
| dry-run watch replay | Create: an operator-invoked replay of a watch run that resolves candidates/scoring but **emits nothing** — no email, no notification, no user-visible write; produces a labelled dry-run result + a post-run zero-assertion; the invocation is audited. |
| tests | Create: bounded-visibility (no raw text by default; reveal requires reason + writes audit row + renders inline annotated), all-clear empty state, reason-required on every state-changing action, guard-bypass, deployment gate, dry-run zero-side-effect assertion, rate-limit L1+Postgres-backstop + shared usage, aggregate-no-private-text, economic-metrics-display-only-no-payment-code. |

## User Experience

- **Jobs affected:** **Orient** at network scale (the operator's primary job — triage not analytics; the deliberately-designed "all clear" state is the most important success message in a trust product), **Review** (approve/suppress queues), **Decide** (pause/override/replay).
- **Primitives involved:** composition only — `ReviewCardBlock` (approve/suppress, `actorType:"admin"` + mandatory reason), `StatusCardBlock`+`healthDot`, red `AlertBlock` (leakage-test fail / auto-pause spike), `MetricBlock`+`ChartBlock` (aggregate, incl. economic-outcome/willingness-to-pay, display-only), `InteractiveTableBlock` (audit/candidate/suppression, filter facets, accordion), `ActionBlock`+`InputRequestBlock` (state-changing action + required reason), labelled dry-run `ArtifactBlock`/`RecordBlock`.
- **Process-owner perspective (the operator — a new internal audience, not a persona):** "what needs my decision now → what's degraded → how is the network trending." Bounded visibility framed *to the operator* as protection ("private member text is sealed by default — revealing it is logged"), not a missing feature. Per-entity drill in a side-sheet so the queue is never lost.
- **Interaction states:** per-band skeleton loading (never block the whole console on the slowest query); the deliberately-calm "all clear" empty state; band-scoped errors (a failed metrics query must not hide the action-required queue); partial with true totals not loaded-subset counts; success = action confirms inline, item leaves the queue, audit row written and visible in the audit drill. (Designer §4.4.)
- **Designer input:** `docs/research/278-trust-privacy-admin-ux.md` §4 in full (the build reference).

## Acceptance Criteria

1. [x] (Parent AC #20) The dashboard shows source-research failures, watch-run failures, high-risk proposals, refusal counts, over-contact/high-demand flags, source-policy blocks, suppression counts, and complaint metrics. Dependency caveat: watch-specific rows are read-model-ready until Brief 275 lands the watch producer.
2. [x] (Parent AC #24) The dashboard includes the discovery-candidate pipeline, source errors, the claim-invite approval/suppress queue, and claim/decline/complaint metrics. Dependency caveat: pipeline enrichment is bounded to current persisted audit/suppression sources until 275/279 add their producer rows.
3. [x] (Parent AC #21) The operator can pause a member/request/source/segment; the pause is honored by existing search, discovery-source, and intro surfaces; each pause requires a reason, mints a wrapper run, and is audited. Dependency caveat: watch enforcement is ready through `isNetworkOperationPaused()` but awaits Brief 275's watch route/runner.
4. [x] (Parent AC #22) Rate-limit/abuse controls are server-side and shared by search/intro/profile-chat/share/email-challenge routes; a test proves the Postgres `networkRateCounters` backstop enforces the limit across two simulated instances when the in-memory L1 is cold.
5. [x] (Parent AC #23) Audit events are written for intro approval/decline, share generation, profile deletion, dry-run replay, and admin override through the sub-brief 282 writer; `watch_feedback` is schema/read-model-ready for Brief 275's producer.
6. [x] (Parent AC #26) The dry-run watch replay contacts/notifies no one and writes nothing user-visible; it shows a persistent "DRY RUN — no contact" banner and an explicit post-run "0 emails · 0 notifications · 0 writes" assertion; a test asserts zero side effects.
7. [x] (Parent AC #27) Metrics render in aggregate without exposing private raw text by default; raw text appears only via the "Reveal raw text (audited)" action that requires a reason, writes its own audit row, and renders inline annotated "Revealed — this view is audited" with revealing actor + timestamp (not a modal).
8. [x] (Parent AC #28) Economic-outcome and willingness-to-pay signals render as display-only `MetricBlock`/`ChartBlock`; a test asserts no payment or billing UI/code is introduced.
9. [x] Admin sees refusal counts and reason codes only; raw anti-persona text has no admin surface and is never rendered, even behind the audited reveal (Hard Rule #5) — test-asserted.
10. [x] The surface returns `notFound()` under `isWorkspaceDeployment()` and reuses the existing `/admin` auth; the "all clear" empty state renders calm/unambiguous, not a blank panel; migration follows Insight-190; root `pnpm run type-check` passes.

## Completion Notes (2026-05-19)

- Added `network_rate_counters` (`drizzle/network/0012_cute_outlaw_kid.sql`) and `src/engine/network-abuse-controls.ts` with fixed-window L1 + Postgres backstop, hashed bucket keys, email-challenge outer limiters, and suppression-backed operation-pause checks.
- Added the admin health read model, dry-run replay, audited raw-text reveal, admin override route, and the `/admin/network/superconnector` dashboard component/page under the existing `/admin` deployment gate.
- Wired current public surfaces into shared controls: search, profile chat, privacy export/delete challenges, profile share generation, and intro routes. Search and intro routes honor suppression-backed pauses before side effects.
- Wired current audit producers for `share_generated`, `intro_approved`, `intro_declined`, `profile_deleted`, `dry_run_replay`, `admin_override`, and the new source-policy/watch-related classes. Watch feedback remains dependency-bound to Brief 275's watch producer rather than inventing a fake call-site.
- Fresh-context review first returned REVISE for two gaps: public profile chat/visitor intro still used the old in-memory visitor limiter, and manual search did not honor request/member pauses. Both were fixed and re-reviewed APPROVE. Final verified suite: 94 focused tests, root type-check, and `git diff --check`.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + parent Brief 278 + this sub-brief + the Designer spec + 282-284 diffs.
2. Review agent checks: bounded visibility (no raw text default; audited reveal correct), Hard Rule #5 (no anti-persona text anywhere), reason-required + guard on every state-changing action, dry-run zero-side-effect, rate-limit cross-instance backstop, economic-metrics display-only, deployment gate, the all-clear state.
3. Present work + review findings to the human (part of the closeout checkpoint, reviewed with 285, 287 before parent 270 closes).

## Smoke Test

```bash
pnpm vitest run src/engine/network-abuse-controls.test.ts
pnpm --filter @ditto/web test -- network-health
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Open the dashboard in workspace mode → notFound(); in Network mode with a session → three bands render.
# 2. Action-required empty → calm "No items need your decision" (not a blank/broken panel).
# 3. Approve/suppress a claim invite without a reason → blocked; with a reason → item leaves queue, audit row appears in the audit drill.
# 4. "Reveal raw text (audited)" → reason required → text renders inline annotated "Revealed — this view is audited" + actor + timestamp; a new audit row exists.
# 5. Run a dry-run watch replay → persistent "DRY RUN — no contact" banner + "0 emails · 0 notifications · 0 writes"; verify no email/notification/user-write occurred.
# 6. Hammer the search limit from two simulated instances with cold L1 → Postgres backstop enforces it.
```

## After Completion

1. Update `docs/state.md` (sub-brief 286 complete).
2. Update `docs/roadmap.md` row 278.
3. Phase retro notes feed the closeout-checkpoint retro.
4. No ADR yet — the trust/privacy-model ADR is considered at parent closeout (sub-brief 287 / parent §After Completion #5).
