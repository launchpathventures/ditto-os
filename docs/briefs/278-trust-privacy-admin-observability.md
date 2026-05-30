# Brief 278: Trust, Privacy, Admin, and Observability for Superconnector Network (PARENT)

**Date:** 2026-05-14 (designed), 2026-05-18 (split into sub-brief chain)
**Status:** sub-briefs 282-287 implemented 2026-05-19; closeout set (285, 286, 287) ready for fresh-context closeout review; pending human approval to close parent Brief 270
**Depends on:** Briefs 272-277 (implemented surfaces); Brief 279 (outbound discovery — co-dependent: 278 foundation gates 279, 279 consumes 278 foundation)
**Unlocks:** Brief 279 production discovery/invites after the **foundation checkpoint** (sub-briefs 282-284); human approval to close the Network Superconnector Reframe program (parent Brief 270) after the **closeout checkpoint** (sub-briefs 285-287)

> **This is a parent/coordinating brief.** Per Insight-004 it is too large to build in one cycle (29 acceptance criteria, ~9 subsystems, two checkpoints). It is split into six sub-briefs — **282, 283, 284** (foundation) and **285, 286, 287** (closeout). This document is the coherent design reference and resolves every open question from the Researcher (`docs/research/278-trust-privacy-admin.md` §17) and Designer (`docs/research/278-trust-privacy-admin-ux.md` §8). The sub-briefs are the build instructions. See **§Sub-Brief Chain** for the AC-to-sub-brief map and build order.

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Add the privacy, trust, admin, source-policy, compliance, and observability layer required for Member Signals, Active Requests, manual search, outbound discovery, background watch, share loop, and consent-based introductions.

## Context

A superconnector only works if members trust it. Ditto will store sensitive signals: what people are good at, what they want, what they do not want, who they are open to, and which introductions were accepted or declined. It will also infer from public sources and user edits. That creates product power and product risk.

This brief has two checkpoints. The **foundation checkpoint** (sub-briefs 282-284) must land and pass fresh-context review before Brief 279 performs production outbound discovery or sends any claim invite. The **closeout checkpoint** (sub-briefs 285-287) lands after Briefs 275-277 and closes the parent program (Brief 270) with the member Privacy Center, the operator dashboard, full regression coverage, and dry-run tooling.

The Researcher report (`docs/research/278-trust-privacy-admin.md`) inventoried every internal precursor and external pattern and left 10 open technical forks (Q1-Q4, Q6-Q11; Q5 was resolved by SDK verification). The Designer spec (`docs/research/278-trust-privacy-admin-ux.md`) designed the two user-facing surfaces and left 7 UX forks. **This parent brief resolves all 17** (see §Resolved Open Questions) so each sub-brief is unambiguous for a builder.

## Objective

Admins/operators can audit source provenance, proposal quality, intro health, privacy settings, abuse/rate limits, source-policy violations, invite compliance, and failed watch runs. Members can view, edit, hide, export, and delete relevant signal/request data. The system prevents private leakage, spammy behavior, silent source drift, and outbound discovery before consent/legal/source-policy gates exist.

## Non-Goals

- No enterprise compliance dashboard.
- No payments or billing. Economic-outcome/willingness-to-pay metrics are **display-only signals** for a later pricing brief — no payment UI or code here.
- No native social OAuth permissions management unless introduced by a prior brief.
- No automated model fine-tuning.
- No broad public analytics exposure.
- No new admin auth system, no new admin chrome — reuse the existing `/admin` shell (Brief 143 session-cookie + legacy Bearer fallback) and `isWorkspaceDeployment()` deployment gate.
- No second `stepRunId` minting path — reuse `createNetworkLaneStepRun` (`src/engine/network-step-run.ts`); the engine never self-HTTPs to mint a run (Insight-211).
- No tamper-evident hash-chaining of the audit log in this phase (reserved, not built — see Q2).
- No recurring/TTL discovered-profile suppression in 278 foundation — the suppression *table* is built here; the cross-refresh recurrence behavior is Brief 279's (see Q8).

## Inputs

1. `docs/research/278-trust-privacy-admin.md` — technical research report; §17 open questions resolved here.
2. `docs/research/278-trust-privacy-admin-ux.md` — Designer interaction spec; §8 open questions resolved here; the two user-facing surfaces.
3. Briefs 272-277 and 279 — implemented surfaces and data flows.
4. `docs/architecture.md` — governance, admin oversight, memory, channel routing.
5. `docs/review-checklist.md` — current architecture gates (sub-brief 287 adds 7 durable gates).
6. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` — refusal triggers and block list; **Hard Rule #5 (origin: Brief 259 system prompt, propagated as a binding rule by Brief 261)** — anti-persona/block rule *text* is owner-visible only, never revealed to visitor/requester or non-owner admin views.
7. `docs/briefs/279-outbound-discovery-claim-invites.md` — source registry, Discovery Profiles, Invitation Candidates, claim/delete controls.
8. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` — private filters and visibility; the KB-shelf row precedent the Privacy Center adopts.
9. `docs/briefs/270-network-superconnector-reframe-parent.md` — program build order and canonical objects/lifecycle.
10. FTC CAN-SPAM compliance guide (`https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business`) — claim invite and intro email compliance (pattern level).
11. `src/engine/network-step-run.ts` — `createNetworkLaneStepRun`, the canonical wrapper-run minter (reuse, do not re-invent — Insight-232).
12. `src/engine/channel.ts` L325-409 — `AgentMailAdapter`; the `headers` pass-through extension point for RFC 8058 (Q5).
13. `packages/web/app/api/v1/network/inbound/route.ts` — existing Svix-signed AgentMail webhook receiver for `MessageReceived`; the **pattern to replicate** (Svix verification + server-minted wrapper run) for the new sibling route `packages/web/app/api/v1/network/complaints/route.ts` that 283 creates for `message.complained` (keeps `/inbound` semantically pure — see §What Changes and Brief 283).
14. `packages/core/src/db/network/schema.ts` — Network-tier schema (all new tables land here, ADR-036).
15. `drizzle/network/meta/_journal.json` — Network migration journal (Insight-190: next free idx is **9** as of design time; builder re-verifies at build).

## Constraints

These govern every sub-brief. They are reproduced into each sub-brief's Constraints section verbatim where they apply.

- **Side-effecting functions require `stepRunId` (Insight-180).** Every function with an external/durable side effect (audit write, suppression write, source-policy write, email send, export job, delete/tombstone, admin state change, retention purge) takes a `stepRunId` parameter and refuses to act without a valid harness-step-origin run.
- **HTTP seams mint wrapper step runs server-side and reject caller-supplied `stepRunId`, including falsy values (Insight-232/Insight-211).** Routes call `createNetworkLaneStepRun`; the engine never self-HTTPs. **The Svix-signed AgentMail complaint webhook is no exception** — its route uses Svix signature verification as *authentication* (an unsigned request gets 4xx with zero writes) and then mints its own server-side wrapper run via `createNetworkLaneStepRun`, passing that `stepRunId` to `recordNetworkSuppression`, `writeNetworkAuditEvent`, and the auto-pause writer. The wrapper run *is* the audited context; no parallel "webhook exception" precedent is invented. (Bounded-waiver precedent `architecture.md` L438 / Insight-215 internal-vs-external split applies — the writes here are internal DB-only with a real wrapper-run id, not a sentinel.)
- **User data controls must be real.** Edit/hide/delete/export actions need durable effects.
- **Private leakage tests are mandatory.** Every public/search/share/email surface must have scrub coverage.
- **Admin visibility is bounded.** Admin tools can inspect operational data but must not casually expose private raw text; raw text is reachable only via an explicit audited "reveal" that itself writes an audit row.
- **Audit trails are mandatory.** Source additions, claim edits, visibility changes, request changes, intro decisions, watch feedback, share generation, privacy decisions, and admin actions are auditable.
- **Rate limits and abuse controls are enforced server-side.**
- **Discovered profiles are privacy-sensitive.** They stay internal, expire or refresh on schedule, and can be claimed, declined, suppressed, or deleted.
- **Source policy is enforced before storage and before outreach.** Registered source policy is code that blocks disallowed collection, storage, and invite use — not documentation.
- **Outbound email compliance is mandatory.** Claim invites and intro-related emails must have accurate sender identity, lawful footer configuration where required, opt-out/suppression, complaint handling, and no misleading subject/body copy.
- **Retention is explicit.** Raw source snippets, Discovery Profiles, claim tokens, invite events, and audit tombstones need retention/default expiry behavior (see §Proposed Retention Defaults — flagged for human ratification).
- **Deletion/export identity is verified.** A person requesting export/delete for a Discovery Profile or Member Signal must prove control through claim token, email challenge, or authenticated session.
- **Complaint thresholds pause discovery.** Complaint or suppression spikes automatically pause the affected source/segment until operator review.
- **Do not create a second admin auth system.**
- **Respect deployment mode.** Admin routes stay on public Network, not workspace deployments (`isWorkspaceDeployment() → notFound()`).
- **No destructive delete without confirmation and audit tombstone where legally/product-wise appropriate.**
- **Hard Rule #5 (origin: Brief 259 system prompt; carried forward as a binding rule by Brief 261).** Anti-persona/block rule *text* is owner-visible only. The owner sees their own rules and that a filter fired (with reason code) in the Privacy Center; it is never quoted to a visitor/requester, and admin sees only refusal *counts and reason codes*, never the raw anti-persona text.
- **Network-tier schema follows Insight-190.** New tables go in `packages/core/src/db/network/schema.ts`; each schema-changing sub-brief claims the next free journal idx at build time (do not hardcode), runs `drizzle-kit generate`, verifies the SQL file exists.
- **Representative posture remains.** Greeters/agents never impersonate; refusal copy stays generic to non-owners (Brief 248/261).

## Resolved Open Questions

The Architect's core contribution. Each decision is binding on the named sub-brief. Researcher questions are `R-Qn` (from research §17); Designer questions are `D-Qn` (from UX §8).

| # | Question | **Decision** | Rationale | Owner |
|---|----------|--------------|-----------|-------|
| **R-Q1** | Audit-table topology: one generic vs per-domain vs extend-enum | **One generic `network_audit_events` table.** Keep the three existing domain audit tables as-is (no migration churn); the new privacy/suppression/source-policy/abuse/admin event classes they do not cover go in one generic table with `eventClass`, `subjectType`, `subjectId`, `actorType`, `actorId`, `reasonCode`, `metadata jsonb`, `stepRunId`, `createdAt`. | A new table avoids enum churn on three tables and gives one queryable operator surface (Designer §4.5 audit-log view). Generic shape matches the breadth of event classes Brief 278 enumerates. | 282 |
| **R-Q2** | Tamper-evidence tier: plain vs app-no-mutate vs hash-chain vs WORM | **App-enforced append-only + a reserved nullable `prevHash` column, not yet populated.** No UPDATE/DELETE code path on `network_audit_events`; retention purge writes a tombstone row rather than deleting audit rows. `prevHash` exists in the schema but is unwired. | Brief mandates "auditable", not a tamper-evident tier. App-append-only is proportionate now; the reserved column makes a future hash-chain a non-migration. Building WORM/hash-chain now is gold-plating beyond the brief (avoids over-scope). | 282 |
| **R-Q3** | Rate-limit store: `rate-limiter-flexible` vs `@upstash/ratelimit` vs hand-rolled Postgres counter | **Hand-rolled Postgres counter table `network_rate_counters` + keep the existing in-memory fast-path as L1.** No new dependency, no Redis (stack has none). In-memory check first (fast, single-instance best-effort); Postgres counter is the durable cross-instance backstop for the limits that matter (invite send, export, delete, search). | No-Redis stack; ADR-style preference for not adding infra for one feature. The two npm options both carry store/infra coupling the research recorded factually; the hand-rolled counter is bounded and testable. Landscape entries for the alternatives remain accurate (not adopted — recorded as evaluated). | 286 |
| **R-Q4** | Source-policy engine: OPA/Rego vs in-code registry | **In-code policy registry in `src/engine/discovery-source-policy.ts`** (ADR-029 in-code-policy precedent). A typed registry maps source class → allowed {collect, store, invite-use} with enforcement called at three points. No external policy engine. | ADR-029 already establishes platform-ToS policy encoded in code as the Ditto precedent. OPA/Rego adds a runtime + policy language for ~one ruleset; disproportionate. Landscape OPA entry stays as evaluated-not-adopted. | 283 |
| **R-Q5** | AgentMail compliance capability (header injection + complaint webhook) | **RESOLVED by Researcher SDK verification (2026-05-18).** `agentmail@0.4.18` `SendMessageRequest`/`ReplyToMessageRequest` accept `headers?: Record<string,string>` (RFC 8058 injectable); `EventType` includes typed `message.complained` (`Complaint{...recipients[]}`); Svix receiver already exists. Work product is **extend** of `channel.ts` `AgentMailAdapter` (gap #5) + the complaint→suppression handler is the only Original-to-Ditto part (gap #9). | Verified against the pinned SDK with file provenance (research §17 Q5, §18). Not an open fork. | 283 |
| **R-Q6** | Export-artifact shape: transient signed download vs persisted `ArtifactBlock` | **Transient, identity-gated download. NOT an `ArtifactBlock`.** The export is a Network-tier job that streams a generated bundle behind a short-lived identity-verified link; no PII bundle persists at rest, no new retention window for export artifacts, not re-fetchable after the link expires. UX renders as `StatusCardBlock` (job state) → `ActionBlock` (download) — **not** `ArtifactBlock`. | `ArtifactBlock` requires a workspace `artifactId`; the export is Network-tier (separate Supabase, ADR-036) and Insight-201 says PII/credentials are the explicit *exception* to filesystem/artifact legibility. A persisted PII bundle is a standing liability. Resolves D-Q6. | 284 / 285 |
| **R-Q7 / D-Q4** | Identity for export/delete without a session | **278 foundation defines the identity-verification interface and implements two mechanisms: authenticated session and email challenge** (reuse `email-verification.ts` shape). **The claim-token mechanism is Brief 279's** (the claim-invite token primitive is created there). 278's interface accepts a pluggable verifier so 279 wires the claim-token verifier without changing 278. | Avoids 278 inventing a token primitive that 279 owns (clean seam). Session + email challenge cover claimed members and no-session subjects today; claim-invite subjects are a 279-era flow. | 284 |
| **R-Q8 / D (suppression)** | Suppression scope; recurring discovered-profile suppression in 278 or 279 | **`network_suppressions` table with a normalized identifier (email/domain/personRef hash), `scope ∈ {global, per-user}`, `reason` enum, `source`, optional `expiresAt`.** 278 foundation builds the table + global/per-user enforcement. **Recurring/TTL suppression that must survive future discovery refreshes is Brief 279's** behavior (it owns the refresh loop); 278 provides the durable table and the `expiresAt`/`scope` columns it needs. | Clean seam: 278 owns the data structure and the enforcement primitive; 279 owns the refresh-survival semantics because it owns the refresh. Resolves R-Q8. | 283 |
| **R-Q9** | Delete model: status-flag soft vs tombstone table vs hybrid | **Hybrid: a soft-delete status flag on the owning row (reuse the `status='deleted'` precedent) + a dedicated `network_tombstones` table + a scheduled purge.** Soft-delete makes deletion immediate and reversible within the recovery window; the tombstone row is the durable legal/audit record that survives the purge; the scheduled purge hard-removes the soft-deleted payload after the recovery window. | Satisfies "no destructive delete without … audit tombstone" and "data is recoverable for N days then permanently removed" without losing the audit record. Status-flag alone loses the post-purge record; tombstone alone makes delete non-immediate. | 284 |
| **R-Q10** | Where the privacy decision is audited; reconcile lane JSONL vs decision audit | **Two separate layers, not reconciled.** The generic `network_audit_events` table is the **decision-level** record (operator/member/system decisions, queryable, the operator audit-log surface). The lane-step JSONL (`createNetworkLaneStepRun` step output) remains the **provenance/execution trace**. They are linked by `stepRunId` (the audit row carries the step run id) but are different layers with different consumers — do not collapse them. | The decision audit answers "who decided what and why" (operator/DSAR surface); the JSONL answers "what did the step do" (provenance, Insight-087/127). Collapsing loses the three-level disclosure. | 282 |
| **R-Q11 / D-Q5** | Retention windows + post-delete direct-URL behavior | **Defaults proposed in §Proposed Retention Defaults (flagged for human ratification).** Post-delete direct profile URL returns **HTTP 410 Gone with a neutral tombstone page** — not 404 (404 implies "never existed"; the subject deserves an honest "this is gone"), not the claim page (would resurrect the data the subject deleted). The page reveals nothing about the prior content and offers no re-claim of deleted data. | Brief AC #8/#19 require explicit numbers/behavior; the UX deletion-confirmation copy is blocked on this. 410 is the semantically correct "intentionally gone" and supports anti-resurrection (Insight-234 #4). Numbers are a product/legal call → human ratifies. | 284 (behavior) / human (numbers) |
| **D-Q1** | "Curate" as the seventh human job vs composition of Orient+Decide | **Adopt "Curate" as the seventh human job.** Captured as **Insight-238** (this session). Flagged for human ratification; Documenter records it in `docs/human-layer.md` after the human rules. Recurs across `memories-legibility-ux` (OQ-1), KB visibility (Brief 258), and now Brief 278 — three independent surfaces is the argument for ratifying rather than re-deferring. Fallback if human rejects: Privacy Center = composition of Orient + Decide. | A job becoming load-bearing across three surfaces is a real taxonomy gap, not a one-off. Architect rules to adopt; human ratifies the taxonomy change (Designer owns `human-layer.md` but a job addition has architectural reach — Insight-043). | Insight-238 / 285 |
| **D-Q2** | New ContentBlock vs composition for privacy controls | **Composition. No new ContentBlock.** The Privacy Center composes existing blocks (`StatusCardBlock`, `MetricBlock`, `InteractiveTableBlock`, `RecordBlock`, `KnowledgeCitationBlock`, `ActionBlock`, `InputRequestBlock`, `NetworkProfileCardBlock`, `JobRequestCardBlock`) per Designer §3.3. This also resolves the recurring `MemoryBlock` question from memories-legibility — resolve once: no new block. | The 22-type union already covers every cell; a "privacy block" would be a god-block. Composition keeps the block union stable (engine-primitive discipline, CLAUDE.md). Resolves D-Q2 and the memories-legibility duplicate. | 285 |
| **D-Q3** | Where the Privacy Center physically renders | **Standalone `/network/privacy` route**, reachable from chat as a drill-down, not inline-in-`/chat`. Rationale: the Discovery Profile subject (claim-invite holder, §3.7) has **no `/chat` session at all** — they arrive pre-consent via an invite link. A surface that must serve a session-less subject cannot be chat-inline. The conversation-first principle is honored by linking *to* it from chat for claimed members; the blocks are identical either way (Designer is route-agnostic). Front-door/transport restriction stays at the Network engine, not a runtime filter (Insight-235). | The session-less Discovery Profile subject is the binding constraint; it forces a standalone route. Members reach it via a chat drill-down link. | 285 |
| **D-Q6** | Export completion rendering | **Resolved by R-Q6: transient identity-gated download.** UX uses `StatusCardBlock` (job state: queued/running/ready/expired) → `ActionBlock` (download link, identity-gated). Not `ArtifactBlock`. | Follows directly from the R-Q6 storage decision. | 285 |
| **D-Q7** | `docs/review-checklist.md` gate additions | **Sub-brief 287 enumerates and adds the 7 durable review gates:** Member Signal provenance; private-leakage scrub coverage; no-contact background watch; two-sided intro consent; claim-before-public discovery; outbound-email suppression/compliance; source-policy enforcement-before-store/outreach. These are engine/policy review patterns (out of Designer scope, correctly flagged). | The Designer correctly flagged these as non-UX; the Architect assigns them to the closeout doc sub-brief. | 287 |

## Proposed Retention Defaults (FLAGGED FOR HUMAN RATIFICATION)

> **These numbers are an Architect proposal, not a ratified decision.** They are a product/legal call. Sub-brief 284 implements a retention engine that reads these as configurable defaults; the human ratifies or amends the numbers before the foundation checkpoint closes. No in-repo prior default exists (Original to Ditto). Recorded in `docs/state.md` Decisions Made as "proposed, pending human ratification".

| Data class | Proposed default | Behavior on expiry | Notes |
|------------|------------------|--------------------|-------|
| Raw source snippets (pre-derivation public-source text) | **90 days** | Hard purge; derived claims retained with provenance label only | Snippets are the highest-volume PII; derived claims keep the source label, not the raw text |
| Discovery Profiles (unclaimed) | **Refresh at 30 days; expire at 180 days** if never claimed/engaged | Expire → soft-delete → tombstone → purge | Claimed profiles convert to Member Signal and exit this schedule |
| Claim tokens | **30 days** | Token invalid; invite event retained | Short-lived by security design |
| Invite events (sent/claimed/declined/complained) | **1 year** | Aggregate metric retained; row purged | Needed for complaint-rate windows (Gmail/Yahoo 0.3% is a rolling measure) |
| Audit tombstones | **2 years, then permanent neutral stub** | Row content minimized to a permanent non-PII stub (event class, date, subject hash) | The tombstone must outlive the data it records; never fully deleted |
| Soft-deleted member/signal/request data | **30 days recoverable**, then hard purge | User-initiated delete is reversible for 30 days, then permanent | Surfaced in the delete-confirm copy (Designer §3.5) |
| Post-delete direct profile URL | **Permanent** HTTP **410 Gone** + neutral tombstone page | Never 404, never the claim page | Anti-resurrection (Insight-234 #4); reveals nothing about prior content |

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Wrapper-step-run pattern | Insight-232; `src/engine/network-step-run.ts`; `api/v1/network/search/route.ts` | adopt | The canonical guarded-route pattern already in the Network lane; reuse, do not re-invent. |
| Audit-log operator surface | Mercury user-activity (Refero `da0ff7bb…`) + Cake Equity audit log (Refero `d1719b7f…`) | pattern | Reverse-chronological, event-type badge, actor column, filter facets, row-expand — realises the mandatory audit trail as an operator view (Insight-127 three-level disclosure). |
| Privacy scrubber | `connection-proposal.ts` scrub + `integration-handlers/scrub.ts` | adopt + pattern | Two internal scrubbers cover known-value sets; the general-PII surface scrub is the Original-to-Ditto extension (research §6, §15 #1). |
| Source-policy-as-code | ADR-029 (platform-ToS policy in code) | adopt | Established Ditto precedent for encoding policy as enforced code, not docs (resolves R-Q4). |
| Email compliance | FTC CAN-SPAM guide; RFC 2369/8058; `channel.ts` `AgentMailAdapter` | pattern + extend | CAN-SPAM footer + suppression-check are pattern; RFC 8058 header injection is an **extend** of the verified AgentMail SDK `headers` field (R-Q5). |
| Complaint webhook ingestion | AgentMail SDK `message.complained` + existing Svix receiver (`network/inbound/route.ts`) | extend | Signed receiver + typed `Complaint` payload already exist; only the complaint→suppression handler is Original-to-Ditto (research §11, §15 #9). |
| Delete + tombstone + soft-delete | `revokeToken()` soft-revoke; `managedWorkspaces.deprovisionedAt`; `status='deleted'` precedents | adopt + pattern | Soft-terminal-state precedents exist; the hybrid delete *flow* + tombstone table is the Original-to-Ditto composition (R-Q9). |
| Destructive export/delete journey | Brilliant account-deletion flow (Refero Flow 4393) | pattern | Gold-standard consequences-before-action + re-verify + irreversible-success-modal; maps to the brief's destructive-delete constraint + AC #19. |
| Discovery Profile self-service (pre-consent) | Original to Ditto | original | No precedent assumes a non-user subject of a profile; highest trust-stakes screen (Designer §3.7). |
| Operator trust-&-safety console | Navan safety dashboard (Refero `a156afc7…`) + Xbox reason-taxonomy (Refero `9dd1f154…`) | pattern | Side-sheet per-entity drill + structured reason enum; composite + sealed-by-default-with-audited-reveal is Original to Ditto. |
| Bounded admin visibility | Insight-201 (sealed-data pattern), Insight-127 (trust signals) | adopt | Operator-side twin of the member sealed-data pattern: structured metadata default, audited raw-text reveal. |
| Cross-deployment durability | Insight-234 | adopt | Tombstone/anti-resurrection + durable terminal-state semantics for delete/suppression. |
| Curate (7th human job) | `memories-legibility-ux.md` OQ-1; Brief 258 KB visibility; this brief | original | Recurs across three surfaces → Insight-238; ratification flagged for human. |
| Superconnector trust dashboard | Original to Ditto | original | Program-level need to observe network health, economic outcome, willingness-to-pay. |

## Sub-Brief Chain

Six sub-briefs. Foundation must pass fresh-context review before Brief 279 production discovery. Closeout closes parent Brief 270.

| Sub-brief | Title | Owns ACs | Depends on | Unlocks | Subsystems / seam |
|-----------|-------|----------|------------|---------|-------------------|
| **282** | Audit substrate, wrapper-step-run guard, central privacy scrubber | 1, 2, 9, 10 | 272-274 (data to scrub) | 283, 284 | One seam: *every side-effecting Network write goes through an audited + scrubbed + step-run-guarded path.* `network-audit.ts`, `network-privacy-scrubber.ts`, `network_audit_events`. |
| **283** | Source-policy, suppression, email-compliance, complaint-pause | 3, 4, 5, 11 | **282** | 284, 279 | One seam: *nothing goes outbound without passing policy + suppression + compliance, and complaints feed back to auto-pause.* `discovery-source-policy.ts`, `network-suppression.ts` + `network_suppressions`, `network-email-compliance.ts` + `channel.ts` extend, complaint circuit-breaker. |
| **284** | Privacy export/delete, retention engine, identity verification, admin queue scaffold | 6, 7, 8, 12 | **282, 283** | **Brief 279 (foundation checkpoint)**, 285, 286 | One seam: *the user-data-control + operator-entry surface.* export/delete routes, `network_tombstones`, retention engine, identity-verifier interface, admin scaffold + deployment gate. |
| → | **FOUNDATION CHECKPOINT** — fresh-context review of 282+283+284 before Brief 279 production discovery/invites | 1-12 | — | Brief 279 | Review Process step 1-2. |
| **285** | Privacy Center (member-facing) | 13-19 | **284**, 272-275 | 287 | One UI surface: `/network/privacy` route + `privacy-center.tsx`, 8 sections, Discovery Profile self-service. |
| **286** | Admin Network-Health Dashboard, dry-run replay, rate-limit consolidation | 20-24, 26, 27, 28 | **282, 283, 284**, 275-277 | 287 | One UI surface + rate-limit: `admin/network/superconnector`, `network-health-dashboard.tsx`, `network_rate_counters`. |
| **287** | Regression, review-checklist gates, dictionary, parent-270 acceptance | 25, 29 | **285, 286**, 275-277 | parent 270 close | Closeout glue: 7 review-checklist gates, dictionary finalize, full regression, parent acceptance. |
| → | **CLOSEOUT CHECKPOINT** — fresh-context review of 285+286+287 before parent Brief 270 closes | 13-29 | — | parent 270 | Review Process step 3-4. |

**AC coverage check:** 282{1,2,9,10} + 283{3,4,5,11} + 284{6,7,8,12} + 285{13-19} + 286{20-24,26,27,28} + 287{25,29} = all 29, each owned once. Foundation = ACs 1-12 (282+283+284). Closeout = ACs 13-29 (285+286+287).

## Sizing Rationale (Insight-004)

The parent has **29 ACs across ~9 subsystems and two checkpoints** — far past the 8-17 AC / one-seam threshold; it must split. The split runs along the brief's own dependency seams:

1. **First seam — foundation vs closeout.** The brief already declares two checkpoints; outbound safety must exist before Brief 279, the UI/observability can follow Briefs 275-277. This is the primary dependency cut.
2. **Within foundation — substrate → gate → control.** 282 is the substrate every other write depends on (audit + scrub + guard). 283 is the outbound-safety gate (needs 282's audit). 284 is the user-data-control + operator entry (needs 283's suppression for delete→suppress and source-policy for admin pause). Strict 282→283→284 build order.
3. **Within closeout — member UI / admin UI / acceptance.** 285 (member) and 286 (admin) are independent UI surfaces that can build in parallel after 284; 287 is the acceptance/doc gate that needs both plus Briefs 275-277.

Each sub-brief is independently testable, one focused build cycle, one review cycle, one integration seam. The substrate sub-briefs (282-284) have 4 ACs each — small by design because they are tight, single-seam substrate; splitting further would create fragments that are not independently testable. The UI sub-briefs (285: 7 ACs, 286: 8 ACs) sit in the well-sized band. 287 (2 ACs) is the closeout gate — small by nature.

## What Changes (Work Products)

Parent-level summary; each sub-brief restates its own slice with precise actions.

| File | Sub-brief | Action |
|------|-----------|--------|
| `packages/core/src/db/network/schema.ts` + `drizzle/network/` (idx 9+ per Insight-190) | 282, 283, 284, 286 | Modify: add `network_audit_events` (282), `network_suppressions` (283), `network_tombstones` (284), `network_rate_counters` (286). |
| `src/engine/network-audit.ts` | 282 | Create: typed audit-event writer; `stepRunId`-guarded; decision-level layer (R-Q1/Q2/Q10). |
| `src/engine/network-privacy-scrubber.ts` | 282 | Create: central scrubber for all 8 surfaces (public profile, share, search, proposal email, intro email, watch digest, claim invite, discovery admin preview). |
| `src/engine/discovery-source-policy.ts` | 283 | Create: in-code policy registry, enforced at collect/store/invite-use (R-Q4). |
| `src/engine/network-suppression.ts` | 283 | Create: suppression list, `scope ∈ {global, per-user}`, reason enum, expiry (R-Q8). |
| `src/engine/network-email-compliance.ts` | 283 | Create: footer/sender/opt-out/suppression-check + RFC 8058 header builder. |
| `src/engine/channel.ts` (`AgentMailAdapter`) | 283 | Modify: pass `headers` through `.send()`/`.reply()` (R-Q5 extend). |
| `packages/web/app/api/v1/network/complaints/route.ts` (new sibling, **not** an extension of `inbound/route.ts`) | 283 | Create: Svix-verified `message.complained` receiver; mints its own `createNetworkLaneStepRun` wrapper run; handler routes to suppression + complaint-rate threshold circuit-breaker pause; svix-msg-id-keyed dedup TTL guards replay. |
| `packages/web/app/api/v1/network/privacy/export/route.ts` | 284 | Create: transient identity-gated export (R-Q6); wrapper-run; identity-verifier. |
| `packages/web/app/api/v1/network/privacy/delete/route.ts` | 284 | Create: hybrid soft-delete + tombstone (R-Q9); wrapper-run; identity-verifier. |
| `src/engine/network-identity-verification.ts` | 284 | Create: pluggable verifier interface (session + email challenge; claim-token slot for Brief 279) (R-Q7). |
| `src/engine/network-retention.ts` | 284 | Create: retention engine reading the ratified defaults; scheduled purge writing tombstones. |
| admin queue scaffold (under existing `/admin` shell) | 284 | Create: approve/suppress claim invites + pause-all-discovery; deployment-mode gate (reuse `isWorkspaceDeployment`). |
| `packages/web/app/network/privacy/page.tsx` + `packages/web/components/network/privacy-center.tsx` | 285 | Create: standalone route (D-Q3) + member Privacy Center, 8 sections, composition only (D-Q2). |
| `packages/web/app/admin/network/superconnector/page.tsx` + `packages/web/components/admin/network-health-dashboard.tsx` | 286 | Create: operator dashboard, 3 triage bands, bounded visibility + audited reveal, dry-run replay. |
| `src/engine/network-abuse-controls.ts` | 286 | Create/extend: server-side rate-limit shared by search/watch/intro/profile-chat; Postgres counter backstop (R-Q3). |
| `docs/review-checklist.md` | 287 | Modify: add 7 durable review gates (D-Q7). |
| `docs/dictionary.md` | 287 | Modify: finalize canonical Brief 270 terms if not already done in 271. |

## User Experience

Synthesized from the Designer interaction spec (`docs/research/278-trust-privacy-admin-ux.md`). The full spec is the build reference for sub-briefs 285 and 286.

- **Jobs affected:** **Curate** (proposed 7th job — Insight-238; the Privacy Center is its first full realisation), **Orient** (what's public vs private; network-scale health), **Decide** (remove/delete/pause/override), **Review** (operator approve/suppress queues).
- **Primitives involved:** composition only, no new block (D-Q2) — `StatusCardBlock`, `MetricBlock`, `InteractiveTableBlock`, `RecordBlock`, `KnowledgeCitationBlock`, `ActionBlock`, `InputRequestBlock`, `NetworkProfileCardBlock` (public-scrubbed variant, `antiPersonaMd: null` — Brief 261 enforced at the block level), `JobRequestCardBlock`, `ReviewCardBlock`, `AlertBlock`, `ChartBlock`.
- **Process-owner perspective:**
  - *Privacy Center (member / Discovery Profile subject):* "a single mirror of everything this connector knows about me — each item shows where it came from and who can see it, and I can change or revoke any of it." Eight sections ordered by member anxiety (what's exposed first). Pause ≠ delete is a consistent visual language. The pre-consent Discovery Profile subject (§3.7, Original to Ditto) is the highest-stakes screen: four equally-weighted exits (Claim & correct / Decline / Suppress / Delete), provenance-first framing, no dark patterns, sealed refusal logic never shown.
  - *Admin dashboard (internal trust-&-safety operator, a new audience — not a persona):* triage not analytics — three bands (A: Action required / B: Health / C: aggregate Metrics) + per-entity side-sheet drill. The "all clear" empty state is deliberately designed (the most important success message in a trust product). Bounded visibility: structured metadata by default, raw text only via an explicit audited reveal that writes its own audit row.
- **Interaction states:** every section specifies loading/empty/error/partial/success. High-risk ones detailed in Designer §3.4 (export/delete) and §4.4 (admin). Export = `StatusCardBlock` job state → `ActionBlock` download (R-Q6/D-Q6); delete = consequences-before-action → identity re-verify → final confirm → explicit irreversible-success modal stating the 410 URL behavior (Brilliant Flow 4393 pattern).
- **Persona drift flagged (not auto-edited):** the Privacy Center's primary users (Network member; pre-consent Discovery Profile subject) are not represented in `docs/personas.md` (four Layer-3 workspace personas). Designer owns `personas.md` (Insight-043); a "Network audiences" addition has product reach → **flagged for human**, Documenter records after the human rules. Same disposition for the "Curate" 7th job in `human-layer.md` (Insight-238).
- **Designer input:** `docs/research/278-trust-privacy-admin-ux.md` (full spec; §3 Privacy Center, §4 Admin, §3.7 Original-to-Ditto, §8 resolved in §Resolved Open Questions above).

## Security (Insight-017 — security is architectural, not a separate discipline)

| Dimension | Design decision |
|-----------|-----------------|
| **Credential/PII handling** | Export bundle never persists at rest (R-Q6 transient). Raw source snippets purge at 90d (proposed). Admin sees structured metadata by default; raw private text only via audited reveal. Insight-201: PII/credentials are the explicit exception to legibility — sealed by default on both member and operator sides. |
| **Permission boundaries** | Reuse existing `/admin` session-cookie auth + Bearer fallback; no second auth system. Deployment-mode gate (`isWorkspaceDeployment() → notFound()`) keeps admin off workspace deployments. Identity verification (session/email-challenge; claim-token = 279) gates every export/delete. |
| **Data exposure / leakage** | Central scrubber covers all 8 surfaces with mandatory leakage tests (AC #2). Brief 261 Hard Rule #5 enforced at the *block* level (`NetworkProfileCardBlock.antiPersonaMd` must be `null` on any non-owner render) — not only in the scrubber, so a future caller that bypasses the scrubber still cannot leak the anti-persona text. |
| **Trust-enforcement integrity** | All side-effecting functions `stepRunId`-guarded (Insight-180); HTTP seams mint server-side and reject caller `stepRunId` incl. falsy (Insight-232/211). The Svix-signed AgentMail complaint webhook follows the same rule: Svix signature verification is *authentication* (an unsigned request gets 4xx with zero writes), and the route then mints its own wrapper run via `createNetworkLaneStepRun` (Insight-215 internal-DB-only regime). Audit log is app-append-only with no mutate/delete code path; retention purge writes tombstones, never deletes audit rows. Complaint/suppression spikes auto-pause the source/segment (fail-safe: pause on doubt). |
| **Abuse resistance** | Server-side rate limits shared across search/watch/intro/profile-chat with a Postgres cross-instance backstop (R-Q3). Source-policy enforced *before* collection/storage/invite-use, not after. Anti-resurrection: deleted profiles return 410, suppression survives (279 owns refresh-survival). |

## Acceptance Criteria

Each AC is owned by exactly one sub-brief (see §Sub-Brief Chain). The parent-level gate is: **all foundation ACs (1-12) pass fresh-context review before Brief 279 production discovery; all closeout ACs (13-29) pass before parent 270 closes.** ACs restated here for the coherent reference; the owning sub-brief carries the testable detail.

### Foundation acceptance criteria — required before Brief 279 production discovery/invites

1. [ ] Central scrubber covers public profile, share, manual search results, proposal emails, intro thread emails, watch digests, claim invites, and discovery admin previews. *(282)*
2. [ ] Tests prove private/on-request/hidden claims do not leak across those surfaces. *(282)*
3. [ ] Source-policy enforcement blocks disallowed collection, storage, and invite use before any discovery tool writes. *(283)*
4. [ ] Suppression list blocks opt-outs, complaints, prior declines, deleted profiles, blocked domains/people, and paused sources/segments. *(283)*
5. [ ] Email compliance helper enforces all five sub-criteria — each individually testable as its own boolean assertion in 283: *(283)*
   - 5a. Sender identity — `From` and `Reply-To` resolve to the configured Ditto network mailbox and pass through the `AgentMailAdapter` `headers` field (no opaque envelope identity).
   - 5b. RFC 8058 one-click unsubscribe — `List-Unsubscribe` (mailto + https) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers present on every claim invite and intro-thread send.
   - 5c. Suppression check — every send calls `network-suppression.ts` with the destination identifier; a suppression hit blocks the send with an audited refusal row (not silently dropped).
   - 5d. Footer/address config — CAN-SPAM-compliant footer (physical address + opt-out link) is appended at render where the config flag requires it.
   - 5e. Misleading-subject check — a deny-list helper rejects subjects that match misleading patterns (impersonation phrases, fake-thread-id prefixes, deceptive urgency tokens) before send.
6. [ ] Admin/operator queue scaffold can approve/suppress claim invites and pause all outbound discovery. *(284)*
7. [ ] Export/delete routes exist for Member Signal and Discovery Profile data with identity verification (session + email challenge; claim-token slot reserved for Brief 279). *(284)*
8. [ ] Retention/refresh defaults exist (the ratified §Proposed Retention Defaults) for Discovery Profiles, raw source snippets, claim tokens, invite events, and audit tombstones. *(284)*
9. [ ] Audit events are written for source add/remove, claim edit/visibility, request edit, search feedback, invitation candidate score, operator approve/suppress, invite sent, claim, decline, complaint, and delete. *(282 writer; call-sites wired by the owning surfaces)*
10. [ ] All foundation routes/tools reject caller-supplied `stepRunId`, including falsy values, mint wrapper step runs server-side, and tests assert no writes/sends on bypass. *(282 substrate; each route in 283/284 tested)*
11. [ ] Complaint/suppression thresholds can automatically pause a source/segment until operator review. *(283)*
12. [ ] Deployment mode check prevents admin routes in workspace mode. *(284)*

### Closeout acceptance criteria — required before parent 270 closes

13. [ ] User can view every source attached to their Member Signal. *(285)*
14. [ ] User can remove a source from future reasoning. *(285)*
15. [ ] User can edit/hide/delete claims and change visibility. *(285)*
16. [ ] User can pause public profile visibility without deleting private signal. *(285)*
17. [ ] User can pause/resume/close Background Watches. *(285)*
18. [ ] User can export signal/request/watch/intro/share data (transient identity-gated download). *(285)*
19. [ ] User can delete public profile projection; direct profile URL returns HTTP 410 + neutral tombstone page after deletion. *(285)*
20. [ ] Admin dashboard shows source failures, watch failures, high-risk proposals, refusal counts, over-contact flags, source-policy blocks, suppression counts, and complaint metrics. *(286)*
21. [ ] Admin can pause a member/request/source/segment and the pause is honored by search/watch/discovery/intro. *(286)*
22. [ ] Abuse/rate-limit controls are server-side and shared where appropriate (Postgres cross-instance backstop). *(286)*
23. [ ] Audit events are written for watch feedback, intro approval/decline, share generation, profile deletion, dry-run replay, and admin override. *(286 wires call-sites; 282 provides the writer)*
24. [ ] Admin dashboard includes discovery candidates, source errors, invite approval queue, claim/decline/complaint metrics. *(286)*
25. [ ] `docs/review-checklist.md` includes durable review gates for provenance, private leakage, no-contact background watch, two-sided consent, claim-before-public discovery, outbound email suppression, and source-policy enforcement. *(287)*
26. [ ] Dry-run watch replay exists for operator debugging and does not contact/notify users. *(286)*
27. [ ] Metrics are available in aggregate without exposing private text by default. *(286)*
28. [ ] Metrics include economic outcome signals and willingness-to-pay signals for the later pricing brief; no payment UI/code is introduced here. *(286)*
29. [ ] Full superconnector regression suite runs focused tests across Briefs 272-279 plus root type-check. *(287)*

## Side-Effect and HTTP Seam Matrix (parent-level, cross-cutting)

Each sub-brief restates the rows it owns with route-specific test assertions.

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write/no-send assertion |
|----------------|-------------|-------------------|--------------------------|--------------------------------|
| `writeNetworkAuditEvent(stepRunId, ...)` (282) | Audit row creation | Required for all callers. | Calling route/process/admin action propagates the wrapper run. | Missing/spoofed guard writes no audit row unless the source is the signed Svix webhook (separate signature verification). |
| `/api/v1/network/privacy/export` (284) | Transient export job + audit event | Server wrapper run only; identity verification required. | Route mints wrapper run server-side. | Caller `stepRunId` incl. falsy rejected; no job/stream/audit row created. |
| `/api/v1/network/privacy/delete` (284) | Soft-delete flag, tombstone, retention scheduling, audit event | Server wrapper run only; identity verification required. | Route mints wrapper run server-side. | Caller `stepRunId` rejected; no destructive write, tombstone, or queue job. |
| `recordNetworkSuppression(stepRunId, ...)` (283) | Opt-out/complaint/decline/block/source-pause/segment-pause | Required, unless via the signed inbound webhook adapter (equivalent audited context). | Suppression route, inbound handler, or admin action creates wrapper run. | Missing/spoofed run id writes no suppression row. |
| Source-policy admin/update route (283) | Source registry / collection-storage-invite policy / class pause | Server wrapper run only; admin auth required. | Admin route mints wrapper run server-side. | Caller `stepRunId` rejected; no policy write, no discovery unpause. |
| Admin approve/suppress/pause/replay (284 scaffold, 286 full) | Operator decision, pause/unpause, dry-run replay, queue state | Server wrapper run only; admin auth + reason required. | Admin route mints wrapper run server-side. | Caller `stepRunId` rejected; no approval, send-enable, pause change, replay write, or invite send. |
| Retention cleanup job (284) | Snippet/profile/token purge, tombstone preservation | Scheduled process/system step run required; deletion reason audited. | Scheduler/operating-cycle run provides the step run. | Missing run id performs no deletion and emits an alertable failure. |
| Email compliance helper (283) | No send itself; classifies sender/footer/opt-out/suppression readiness + builds RFC 8058 headers | Pure helper; the actual send tools (Briefs 276/279) carry the guard. | N/A unless a route persists a compliance decision (then route wrapper applies). | Helper cannot send; failing compliance blocks the caller's send. |
| `/api/v1/network/complaints` Svix webhook (283) | Suppression write + complaint-rate threshold pause + audit | Server wrapper run minted **after** Svix verification (Svix = authentication, not a guard substitute); same rule as every other HTTP seam (Insight-232). | Route mints wrapper run server-side via `createNetworkLaneStepRun`; svix_msg_id-keyed dedup TTL prevents replay double-write. | Invalid Svix signature → 4xx with zero writes; valid signature without server-minted wrapper run never reached (handler refuses to act without `stepRunId`). |

## Cross-Cutting Risks (parent-level acknowledgement; each owned by a sub-brief)

The Reviewer surfaced six cross-cutting concurrency, atomicity, idempotency, scrubber-discipline, rate-limit-algorithm, and email-DoS risks that are not single-AC issues. Each is addressed in the owning sub-brief's §Constraints; this row exists so the foundation reviewer can see them at parent level.

| Risk | Failure mode if unaddressed | Owning sub-brief |
|------|----------------------------|------------------|
| Concurrent export/delete race | Export job continues streaming after delete request snapshots different state | 284 (§Constraints — snapshot-at-request-time + tombstone in-flight exports on delete) |
| Hybrid-delete atomicity | Soft-delete flag and tombstone row drift if one write fails between them | 284 (§Constraints — soft-delete + tombstone insert in one tx; purge is async + idempotent) |
| Scrubber-bypass discipline | Future caller renders raw fields without going through the scrubber | 282 (§Constraints — scrubber-call discipline + Brief 261 Hard Rule #5 block-level enforcement); 286 (§Constraints — audited admin-reveal is the documented intentional bypass, no other bypasses introduced) |
| Complaint-webhook replay idempotency | Svix retries double-write suppression and double-pause | 283 (§Constraints — svix_msg_id-keyed dedup TTL on the new `/complaints` route) |
| Rate-limit algorithm choice unpinned | Sliding-window builds rejected/landed inconsistently; Postgres write amplification | 286 (§Constraints — **fixed-window** algorithm pinned: cheap, single Postgres write per bucket per window, limits are protective not precise) |
| Email-challenge DoS | An attacker enumerates emails by spamming the challenge endpoint | 284 (§Constraints — challenge endpoint routes through 286's `network-abuse-controls.ts` outer limit before identity work) |

## Review Process

1. **Foundation review:** after 282+283+284, spawn a fresh-context review agent with Briefs 270, 272-274, 278 (this parent), 279, 282-284, `docs/architecture.md`, `docs/review-checklist.md`, and the implemented foundation diffs — **before Brief 279 production discovery/invites build starts.**
2. Foundation reviewer checks: source-policy enforcement before store/outreach, suppression coverage, retention/delete + tombstone, email compliance (RFC 8058 header pass-through verified), admin queue scaffold + deployment gate, wrapper-step-run coverage incl. falsy rejection, and no-private-leakage tests (Brief 261 Hard Rule #5 enforced at block level).
3. **Closeout review:** after 285+286+287, spawn a fresh-context review agent with Briefs 270-279, 282-287, architecture, review checklist, and all implemented diffs — **before closing parent Brief 270.**
4. Present findings to the human before Brief 279 production invites and before parent closeout.

## Smoke Test

```bash
pnpm vitest run src/engine/network-privacy-scrubber*.test.ts src/engine/network-audit*.test.ts src/engine/network-abuse-controls*.test.ts src/engine/discovery-source-policy*.test.ts src/engine/network-suppression*.test.ts src/engine/network-email-compliance*.test.ts
pnpm --filter @ditto/web test -- privacy
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual (foundation):
# 1. Attempt export/delete with a caller-supplied stepRunId (incl. "" and 0) → rejected, no write/send/job.
# 2. Trigger a simulated message.complained webhook (valid Svix sig) → suppression row + source auto-pause.
# 3. Attempt a discovery store for a disallowed source class → blocked before write, audit row written.
# Manual (closeout):
# 4. Create Member Signal with public/on-request/private/hidden claims; open Privacy Center.
# 5. Export data → StatusCardBlock job state → ActionBlock download (link expires).
# 6. Open public profile/share/search/email preview → only public approved claims appear; antiPersonaMd never rendered.
# 7. Pause public profile (reversible, no confirm); delete projection (confirm + re-verify + irreversible modal); hit the direct URL → HTTP 410 + neutral tombstone page.
# 8. Open admin dashboard → "Action required" all-clear state; trigger an event; verify it queues; reveal raw text → audited row written.
# 9. Run dry-run watch replay → "DRY RUN — 0 emails · 0 notifications · 0 writes".
```

## After Completion

1. Update `docs/state.md` (Decisions Made: the 17 resolutions + "retention defaults proposed, pending human ratification"; Active Briefs: 278 parent + 282-287 chain).
2. Update `docs/roadmap.md` row 278 and parent 270.
3. Documenter records the human's ruling on Insight-238 (Curate 7th job) in `docs/human-layer.md` and the "Network audiences" persona note in `docs/personas.md` — only after the human rules.
4. Move parent Brief 270 to complete only after the closeout fresh-context review and human approval.
5. Consider an ADR for the Network Superconnector trust/privacy model (audit topology R-Q1/Q2, delete/tombstone R-Q9, retention defaults, identity-verifier seam) once the architecture is built and durable.
