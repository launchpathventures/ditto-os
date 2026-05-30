# Brief 284: Privacy Export/Delete, Retention Engine, Identity Verification, Admin Queue Scaffold

**Date:** 2026-05-18
**Status:** draft
**Depends on:** Sub-briefs **282** (audit substrate) and **283** (suppression — delete→suppress; source-policy — admin pause-all)
**Unlocks:** **Brief 279** (the foundation checkpoint is the gate between this and 279 production discovery/invites); sub-briefs 285, 286

> Foundation sub-brief 3 of 3 under parent **Brief 278**. The user-data-control + operator-entry surface. After this lands, the **FOUNDATION CHECKPOINT** fresh-context review runs before Brief 279 does production discovery. Build order: **282 → 283 → 284 → [foundation checkpoint] → 279**.

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Privacy export/delete routes with identity verification, the retention engine + tombstone model, and the admin/operator approve-suppress-pause scaffold with the deployment-mode gate.

## Context

Before Brief 279 sends production claim invites or stores production Discovery Profiles, a person must be able to export and delete their Member Signal / Discovery Profile data with verified identity; retention/refresh defaults must exist and run; and an operator must be able to approve/suppress claim invites and pause all outbound discovery. Parent Brief 278 resolved the forks: R-Q6 (transient identity-gated export, not `ArtifactBlock`), R-Q7 (identity-verifier interface — session + email challenge here; claim-token slot for Brief 279), R-Q9 (hybrid soft-delete + tombstone + scheduled purge), R-Q11 (proposed retention defaults + HTTP 410 post-delete URL — numbers human-ratified).

## Objective

Export/delete routes exist for Member Signal and Discovery Profile data with verified identity; a retention engine enforces the ratified defaults and writes tombstones on purge; and an admin queue scaffold (under the existing `/admin` shell, gated off workspace deployments) can approve/suppress claim invites and pause all outbound discovery.

## Non-Goals

- No member Privacy Center UI (sub-brief 285 — this brief provides the routes it calls).
- No full admin dashboard (sub-brief 286 — this brief provides only the approve/suppress/pause-all scaffold the foundation checkpoint requires).
- No claim-invite token identity mechanism — the verifier interface reserves a pluggable slot; Brief 279 wires the claim-token verifier (R-Q7).
- No persisted export artifact / `ArtifactBlock` — the export is a transient identity-gated stream (R-Q6).
- No new audit table or suppression table (282/283 own them; this brief calls them).

## Inputs

1. `docs/briefs/278-trust-privacy-admin-observability.md` — parent; R-Q6, R-Q7, R-Q9, R-Q11; §Proposed Retention Defaults (use the **human-ratified** values — confirm ratified before build); §Security; the Brilliant Flow 4393 destructive-journey pattern.
2. `docs/research/278-trust-privacy-admin.md` — §7 (DSAR export + identity options), §8 (delete/soft-delete/tombstone options), §15 #2/#3/#4.
3. `src/engine/network-api-auth.ts` — `revokeToken()` soft-revoke (`revokedAt`) precedent; `networkTokens` hashed-token shape (identity-verifier reference).
4. `src/engine/email-verification.ts` — the email-challenge shape to reuse for the no-session verifier.
5. `packages/web/app/admin/layout.tsx` — existing `/admin` shell, session-cookie auth + Bearer fallback, `isWorkspaceDeployment() → notFound()` (reuse; do not invent a second auth system).
6. `packages/web/app/api/v1/network/search/route.ts` — canonical wrapper-run route shape (server-side mint, falsy rejection).
7. `src/engine/network-audit.ts` (282), `src/engine/network-suppression.ts` + `discovery-source-policy.ts` (283).
8. `packages/web/app/api/v1/network/people/[id]/opt-out/route.ts` — nearest existing privacy-action route shape.
9. `packages/core/src/db/network/schema.ts` + `drizzle/network/meta/_journal.json` — schema + journal (Insight-190).
10. Scheduler/operating-cycle entry point for the retention purge job (system step run, not an HTTP route).

## Constraints

- Side-effecting functions require `stepRunId` per Insight-180. The export and delete routes mint a server-side wrapper run via `createNetworkLaneStepRun` and **reject any caller-supplied `stepRunId`, including falsy values** (Insight-232/211); identity verification is required before any side effect.
- Export is **transient**: no PII bundle persists at rest, the link is short-lived and identity-gated, not re-fetchable after expiry, and no new retention window is introduced for export artifacts (R-Q6; Insight-201 PII exception).
- Delete is **hybrid** (R-Q9): set the soft-delete status flag on the owning row (reuse the `status='deleted'` precedent), write a `network_tombstones` row (the durable legal/audit record), and schedule the hard purge after the recoverable window. The tombstone outlives the data; audit rows are never deleted (282 append-only).
- Post-delete direct profile URL returns **HTTP 410 Gone + a neutral tombstone page** (R-Q11) — never 404, never the claim page; the page reveals nothing about prior content and offers no re-claim of deleted data (anti-resurrection, Insight-234 #4).
- Retention defaults are **the human-ratified values** from parent §Proposed Retention Defaults. If the human has not ratified at build time, the builder stops and escalates — do not invent numbers.
- The retention purge job runs under a **scheduled process/system step run** (not a caller-facing route); a missing run id performs no deletion and emits an alertable failure. The purge writes tombstones; it never deletes audit rows.
- Identity verifier is a **pluggable interface** with `session` and `email-challenge` verifiers implemented here and a reserved `claim-token` slot Brief 279 fills — 278 must not implement the claim-token primitive (R-Q7).
- Admin scaffold reuses the existing `/admin` shell + auth + `isWorkspaceDeployment()` gate. No second admin auth system; admin actions require auth + a structured reason; admin routes mint wrapper runs server-side and reject caller `stepRunId`.
- Email masking: an email-challenge never echoes the full target address back to the requester (Designer §3.6 — "we'll email {masked}").
- Network-tier schema follows Insight-190.
- `@ditto/core` boundary: `network_tombstones` schema → core network schema file; routes, `network-identity-verification.ts`, `network-retention.ts`, and the admin scaffold are Ditto product.
- **Concurrent export/delete race contract.** The export job snapshots the eligible row set at the time the request is accepted (after identity verification) and operates on that snapshot — a subsequent delete does not retroactively redact what the snapshot already contains. **However**, a delete arriving while an export is in flight marks any *not-yet-streamed* row as tombstoned in the export pipeline: those rows are skipped and the export's `StatusCardBlock` final summary reports the count of rows tombstoned mid-stream. The link expires normally; the download is a single chance, by design. This snapshot-at-request-time contract is asserted by a concurrency test (delete during export → export completes with snapshot semantics + skipped-tombstoned count > 0).
- **Hybrid-delete atomicity.** The soft-delete status flag write and the `networkTombstones` row insert happen in **one Postgres transaction**, so the soft-delete flag and the tombstone row never drift (either both land or both fail). The audit event write follows the tx commit. The scheduled hard purge is **async and idempotent**: re-running the purge on a row that has already been purged is a no-op (the purge keys on the tombstone row, which is the durable marker — re-running cannot double-delete because there is nothing left to delete). The purge runner's idempotency is asserted by a test that runs the purge twice on the same eligible set.
- **Email-challenge DoS vector.** The `/privacy/export` and `/privacy/delete` email-challenge endpoints are unauthenticated by design (a no-session subject must be able to initiate verification), which makes them an enumeration/abuse vector if not rate-limited. They route through sub-brief 286's `network-abuse-controls.ts` **before** any identity-verifier work, per-IP and per-target-email-hash, so an attacker cannot spray challenges or use challenge timing to enumerate emails. 286 owns the limiter; 284 declares the dependency and asserts in tests that the limit short-circuits the route before `verifyNetworkIdentity` is called.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Wrapper-run route | `api/v1/network/search/route.ts`; Insight-232 | adopt | Canonical guarded route (server mint, falsy rejection). |
| Soft-terminal-state | `revokeToken()`/`revokedAt`; `managedWorkspaces.deprovisionedAt`; `status='deleted'` | adopt | Existing soft-delete precedents; R-Q9 hybrid composes them with a new tombstone table. |
| Email challenge | `src/engine/email-verification.ts` | adopt | Existing email-verification shape for the no-session verifier (R-Q7). |
| Hashed-token identity | `src/engine/network-api-auth.ts` `networkTokens` | pattern | Shape reference for the verifier; the claim-token verifier itself is Brief 279's. |
| Destructive export/delete journey | Brilliant account-deletion (Refero Flow 4393) | pattern | Consequences-before-action + re-verify + irreversible-success modal; the route must support the 285 UI implementing this. |
| Admin shell + deployment gate | `packages/web/app/admin/layout.tsx` (Brief 143) | adopt | Reuse — explicit parent constraint "do not create a second admin auth system". |
| DSAR export/delete + tombstone | GDPR Art 15/17/20, CCPA/CPRA, CA DELETE Act (research §7/§8) | pattern | External legal standards shape the export bundle scope and the tombstone obligation; no code adopted. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `networkTombstones` — `id`, `subjectType` (`member-signal`/`discovery-profile`/`request`/`public-profile`), `subjectIdHash`, `deletedReason`, `deletedByActorType`, `deletedAt`, `purgeAfter`, `permanentStubAt`, `stepRunId`, `createdAt`. Plus a soft-delete status flag on owning rows where the `status='deleted'` precedent isn't already present. |
| `drizzle/network/<next-idx>_*.sql` + snapshot + journal | Create: migration (Insight-190 — next free idx at build). |
| `src/engine/network-identity-verification.ts` | Create: `verifyNetworkIdentity({ method, ... })` pluggable interface; implement `session` and `email-challenge` (masked address, reuse `email-verification.ts`); reserve `claim-token` (throws "not-wired-until-279"). |
| `src/engine/network-retention.ts` | Create: retention engine reading the ratified defaults; `runRetentionPurge({ stepRunId })` (system step run) — soft-deletes/expires per class, writes tombstones, minimizes tombstones to permanent stubs at `permanentStubAt`, never deletes audit rows; emits an alertable failure if run id is missing. |
| `packages/web/app/api/v1/network/privacy/export/route.ts` | Create: POST — verify identity, mint wrapper run, reject caller `stepRunId` incl. falsy, assemble the export bundle (Member Signal + Active Request + watch + intro + share data), stream behind a short-lived identity-gated link, write an audit event. No bundle at rest. |
| `packages/web/app/api/v1/network/privacy/delete/route.ts` | Create: POST — verify identity, mint wrapper run, reject caller `stepRunId`, set soft-delete flag, write tombstone, schedule purge, record a `delete` suppression for the identifier (via 283), write an audit event. |
| post-delete profile URL behavior | Modify: the public profile route returns HTTP **410 Gone** + a neutral tombstone page for a tombstoned subject (never 404, never the claim page). |
| admin scaffold — `packages/web/app/admin/network/superconnector/` (route + minimal component) under the existing shell | Create: approve/suppress claim-invite queue actions + a "pause all outbound discovery" control; reuse `/admin` auth; `isWorkspaceDeployment() → notFound()`; every action mints a wrapper run, requires a structured reason, writes an audit event. (Full dashboard is sub-brief 286; this is the checkpoint-minimum scaffold.) |
| tests | Create: identity-verifier (session/email-challenge/claim-token-not-wired), retention purge (per-class, tombstone, stub minimization, missing-run-id no-op), export (transient, identity-gated, guard bypass), delete (hybrid + tombstone + 410), admin scaffold (auth, deployment gate, guard bypass, reason required). |

## User Experience

- **Jobs affected:** **Decide** (the member's export/delete is the highest-stakes Decide; the operator's approve/suppress/pause-all is Review+Decide). The member-facing *rendering* of these is sub-brief 285; this brief provides the routes and the 410 behavior the 285 copy depends on.
- **Primitives involved:** none rendered here. The export route's job-state is what 285 renders as `StatusCardBlock` → `ActionBlock` (R-Q6/D-Q6). The 410 tombstone page is a minimal neutral HTML page (not a ContentBlock surface).
- **Process-owner perspective:** the member experiences the *route* as "my data really left / I really can take it with me"; the route must make the delete durable and the export complete so the 285 UI's promises are true. The operator experiences the scaffold as the minimum "I can stop this right now" control before 279 goes live.
- **Interaction states:** route-level — success (job queued / soft-deleted + tombstoned), error (fail-closed: "nothing was changed"), identity-unverified (challenge sent to masked address), bypass (caller `stepRunId` → 400, nothing happens). The rich UI states are sub-brief 285.
- **Designer input:** `docs/research/278-trust-privacy-admin-ux.md` §3.5 (the export/delete journey the route must support), §3.6 (identity-verification UX — masked email, no password the person never set), §3.7 (the pre-consent Discovery Profile subject must be able to delete → 410).

## Acceptance Criteria

1. [ ] (Parent AC #7) `/privacy/export` and `/privacy/delete` exist for Member Signal and Discovery Profile data and require verified identity (session or email-challenge) before any side effect; a request without verified identity performs no export/delete and (for email-challenge) sends a link to the **masked** address only.
2. [ ] (Parent AC #10) Both routes reject caller-supplied `stepRunId` including falsy values, mint the wrapper run server-side, and tests assert no export stream, no soft-delete, no tombstone, no audit row on bypass.
3. [ ] Export is transient: a test asserts no PII bundle is written to durable storage and the link is not re-fetchable after expiry; the response is consumable as a `StatusCardBlock`-trackable job + an identity-gated `ActionBlock` download (R-Q6) — not an `ArtifactBlock`.
4. [ ] Delete is hybrid (R-Q9): the owning row gets the soft-delete status flag, a `networkTombstones` row is written, the hard purge is scheduled after the recoverable window, and a `delete` suppression is recorded; a test verifies all four and that no audit row is ever deleted.
5. [ ] (Parent AC #19 precondition) The public profile URL for a tombstoned subject returns HTTP **410 Gone** with a neutral tombstone page — not 404, not the claim page; the page body reveals nothing about prior content.
6. [ ] (Parent AC #8) `runRetentionPurge` enforces the human-ratified defaults for raw source snippets, Discovery Profiles (refresh/expire), claim tokens, invite events, and audit tombstones; tombstones are minimized to a permanent non-PII stub at `permanentStubAt`; a missing system `stepRunId` performs no deletion and emits an alertable failure.
7. [ ] (Parent AC #6) The admin scaffold can approve a claim invite, suppress a claim invite, and pause all outbound discovery; each action requires admin auth + a structured reason, mints a wrapper run, and writes an audit event.
8. [ ] (Parent AC #12) The admin route returns `notFound()` under `isWorkspaceDeployment()` and reuses the existing `/admin` session-cookie + Bearer auth — no second auth system (test asserts both).
9. [ ] The identity verifier exposes `session` + `email-challenge` and a reserved `claim-token` slot that throws an explicit "wired in Brief 279" error (R-Q7); migration follows Insight-190; root `pnpm run type-check` passes.
10. [ ] If the human has not ratified the retention defaults at build time, the builder halts and escalates rather than inventing numbers (process AC — verified by the reviewer confirming ratified values are referenced, not invented).

## Review Process

1. **This completes the foundation set.** Spawn the **foundation-checkpoint** fresh-context review agent with parent Brief 278, sub-briefs 282-284, Briefs 270/272-274/279, `docs/architecture.md`, `docs/review-checklist.md`, and all foundation diffs.
2. Foundation reviewer checks (per parent §Review Process step 2): source-policy enforcement before store/outreach (283), suppression coverage (283), retention/delete + tombstone + 410 (284), email compliance + RFC 8058 (283), admin queue scaffold + deployment gate (284), wrapper-step-run coverage incl. falsy rejection across 282/283/284, no-private-leakage tests + Brief 261 block-level enforcement (282).
3. Present the foundation work + review findings to the human **before Brief 279 production discovery/invites build starts** (parent §Review Process step 4).

## Smoke Test

```bash
pnpm vitest run src/engine/network-identity-verification.test.ts src/engine/network-retention.test.ts
pnpm --filter @ditto/web test -- privacy
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual (foundation checkpoint):
# 1. POST /privacy/export with caller stepRunId="" → 400, no stream, no audit row.
# 2. POST /privacy/export with a valid session → job tracked, identity-gated download link, link dead after expiry.
# 3. POST /privacy/delete (verified) for a Discovery Profile → soft-delete flag + tombstone + scheduled purge + delete-suppression + audit row.
# 4. GET the deleted profile's direct URL → HTTP 410 + neutral tombstone page (not 404, not claim page).
# 5. Run runRetentionPurge with no system stepRunId → no deletion, alertable failure emitted.
# 6. Open the admin scaffold in workspace mode → notFound(); in Network mode with a session → approve/suppress/pause-all work, each audited with a reason.
```

## After Completion

1. Update `docs/state.md` (foundation set 282-284 complete; **foundation checkpoint** ready; Brief 279 unblocked after human approval).
2. Update `docs/roadmap.md` rows 278/279.
3. Run the **foundation-checkpoint retrospective** (what worked, what surprised, what to change) — this is the first of the two parent checkpoints.
4. No ADR yet — the trust/privacy-model ADR is considered at parent closeout.
