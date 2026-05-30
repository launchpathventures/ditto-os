# Brief 283: Source-Policy, Suppression, Email Compliance, Complaint-Pause

**Date:** 2026-05-18
**Status:** implemented + fresh-context reviewed APPROVE; `/dev-review` follow-up fixes applied 2026-05-18
**Depends on:** Sub-brief **282** (audit substrate — every write here is audited through `writeNetworkAuditEvent`)
**Unlocks:** Sub-brief 284; Brief 279 (consumes source-policy + suppression + email-compliance before any production discovery/invite); the foundation checkpoint

> Foundation sub-brief 2 of 3 under parent **Brief 278**. This is the outbound-safety gate: nothing leaves the system without passing policy + suppression + compliance, and complaints feed back to auto-pause. Build order: **282 → 283 → 284**.

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Source-policy enforcement, suppression list, outbound email compliance, and complaint-threshold auto-pause for outbound discovery and intro emails.

## Context

Brief 279 must not collect, store, or invite from a source class that policy forbids; it must not contact a suppressed/opted-out/declined/complained address; its claim invites and intro emails must be CAN-SPAM/RFC-8058 compliant; and a complaint or suppression spike must automatically pause the offending source/segment until an operator reviews. Parent Brief 278 resolved the engineering forks: R-Q4 (in-code policy registry, ADR-029 precedent), R-Q5 (AgentMail `headers` is an extend of the verified SDK — not Original-to-Ditto), R-Q8 (suppression scope + table; recurring-refresh-survival is Brief 279's).

## Objective

A discovery source-policy registry blocks disallowed collection/storage/invite-use before any 279 tool writes; a suppression list blocks contact across all reasons; an email-compliance helper makes claim/intro emails lawful (incl. RFC 8058 one-click via the extended `AgentMailAdapter`); and complaint/suppression spikes auto-pause the affected source/segment.

## Non-Goals

- No outbound discovery, claim-invite send, or intro send (those are Briefs 279/276 — this only gates them).
- No recurring/TTL discovered-profile suppression that survives future discovery refreshes — the `network_suppressions` table provides `scope`/`expiresAt`; the refresh-survival behavior is Brief 279's (it owns the refresh loop) (R-Q8).
- No admin UI for reviewing paused sources (sub-brief 286; the scaffold-to-pause-all is sub-brief 284).
- No new audit table (sub-brief 282 owns the writer; this brief calls it).

## Inputs

1. `docs/briefs/278-trust-privacy-admin-observability.md` — parent; R-Q4, R-Q5, R-Q8; §Provenance; §Security.
2. `docs/research/278-trust-privacy-admin.md` — §11 (circuit-breaker), §12 (suppression), §13 (source-policy-as-code), §17 Q5 (full SDK verification with file provenance), §15 #5/#6/#8/#9.
3. `docs/adrs/029-*.md` — the in-code-policy precedent for R-Q4.
4. `src/engine/channel.ts` L325-409 — `AgentMailAdapter.send()`/`.reply()`; the `headers` pass-through extension point (does not pass `headers` today).
5. `node_modules/.pnpm/agentmail@0.4.18*/.../api/resources/messages/types/SendMessageRequest.d.ts` + `SendMessageHeaders.d.ts` + `ReplyToMessageRequest.d.ts` + `events/types/EventType.d.ts` + `Complaint.d.ts` — the verified SDK surface (R-Q5).
6. `packages/web/app/api/v1/network/inbound/route.ts` — existing Svix-signed AgentMail receiver for `MessageReceived`; the **pattern to replicate** in the new sibling route (Svix verification + server-minted wrapper run). `/inbound` itself is **not** extended — `message.complained` lives on a dedicated sibling route so `/inbound` stays semantically pure (Brief 098b).
7. `src/engine/network-audit.ts` (from 282) — `writeNetworkAuditEvent`.
8. `packages/core/src/db/network/schema.ts` + `drizzle/network/meta/_journal.json` — schema + journal (Insight-190).
9. FTC CAN-SPAM guide; RFC 2369/8058 — footer/sender/opt-out (pattern).
10. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` — `refusalReason` taxonomy (suppression reason enum aligns to it).

## Constraints

- Side-effecting functions require `stepRunId` per Insight-180 (`recordNetworkSuppression`, source-policy writes). HTTP/admin seams mint server-side and reject caller `stepRunId` incl. falsy (Insight-232/211).
- **The Svix-signed AgentMail complaint webhook follows the standard HTTP-route wrapper pattern (Insight-232), not a webhook "exception."** Svix signature verification is *authentication* (an unsigned request gets 4xx with zero writes); the route then mints its own server-side wrapper run via `createNetworkLaneStepRun` and passes that `stepRunId` to `recordNetworkSuppression`, `writeNetworkAuditEvent`, and the auto-pause writer. The wrapper run *is* the audited context. (Bounded-waiver precedent `architecture.md` L438 / Insight-215 internal-vs-external split applies — the writes here are internal DB-only with a real wrapper-run id, not a sentinel.) **No parallel "webhook exception" precedent is invented.**
- **Complaint-webhook replay idempotency.** Svix retries are normal and the route must tolerate them. The handler keys on `svix-id` (the Svix message id from headers) and uses an idempotency-window dedup TTL — a repeat delivery with the same `svix-id` returns 200 OK without re-writing suppressions, re-auditing, or re-incrementing the complaint counter. The dedup record itself is keyed by `svix-id` with a TTL longer than Svix's max retry window. The dedup claim and complaint writes run in one Network DB transaction so a handler failure rolls back the claim and lets Svix retry recover.
- Source policy is enforced **before storage and before outreach** — it is code that blocks, not documentation. Three enforcement points: collect, store, invite-use (R-Q4).
- Suppression check is **pre-send, fail-closed**: if the suppression store is unavailable, the email does not send.
- Email-compliance helper performs **no send** — it classifies and builds headers; the actual guarded send tools (Briefs 276/279) carry the `stepRunId` guard.
- **Hard Rule #5 (origin: Brief 259 system prompt; carried forward as a binding rule by Brief 261).** The suppression reason enum and policy-block reason are operator/owner metadata; raw anti-persona text is never stored in or surfaced from these structures.
- Network-tier schema follows Insight-190 (next free idx at build, generate, verify SQL).
- `@ditto/core` boundary: `network_suppressions` schema → core network schema file; `discovery-source-policy.ts`, `network-suppression.ts`, `network-email-compliance.ts` and the complaint route are Ditto product (`src/engine/` / route). The `channel.ts` `AgentMailAdapter` change is a product-layer extend (not an engine LLM-type change).
- No new external dependency (R-Q4: in-code registry, not OPA; R-Q5: extend the already-pinned AgentMail SDK).
- **Route topology:** the new `packages/web/app/api/v1/network/complaints/route.ts` is a **sibling** of `packages/web/app/api/v1/network/inbound/route.ts`, **not an extension of it**. `/inbound` stays semantically pure as the `MessageReceived` receiver (Brief 098b). The new route owns `message.complained` and replicates the Svix-verification + wrapper-run-mint pattern.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Source-policy-as-code | ADR-029 (platform-ToS policy encoded in code) | adopt | Established Ditto precedent; R-Q4 chose in-code registry over OPA. |
| RFC 8058 header injection | AgentMail SDK `headers: Record<string,string>` on send+reply (verified, research §17 Q5) | extend | The SDK supports it; `AgentMailAdapter` just doesn't pass it yet. |
| CAN-SPAM footer + pre-send suppression check | FTC CAN-SPAM guide; RFC 2369 | pattern + original | Footer text + the suppression-check wrapper are Original-to-Ditto; the standard is the pattern. |
| Complaint webhook ingestion | AgentMail `message.complained` typed `Complaint` + existing Svix receiver | extend | Signed receiver + typed payload already exist; only the handler is new (research §15 #9). |
| Complaint-threshold circuit-breaker | Research §11 (`circuit_breaker_tripped` trip-state precedent) | pattern | Trip-state shape exists; the complaint→pause threshold logic is Original-to-Ditto. |
| Suppression list | Research §12; Brief 261 `refusalReason` taxonomy | pattern + original | Reason enum aligns to the existing refusal taxonomy; the keyed list with scope/expiry is new. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `networkSuppressions` — `id`, `identifierHash` (normalized email/domain/personRef hash — never raw PII in plaintext where avoidable), `identifierKind` (`email`/`domain`/`person-ref`), `scope` (`global`/`per-user`), `scopeUserId` (nullable, set when per-user), `reason` (enum aligned to Brief 261 `refusalReason` + `opt-out`/`complaint`/`decline`/`blocked-domain`/`source-pause`/`segment-pause`), `source`, `expiresAt` (nullable), `stepRunId`, `createdAt`. Enforce uniqueness with partial unique indexes for global/per-user scope plus a scope/user check constraint, avoiding Postgres nullable-unique semantics for global rows. |
| `drizzle/network/<next-idx>_*.sql` + snapshot + journal | Create: migration (Insight-190 — claim next free idx at build). |
| `src/engine/discovery-source-policy.ts` | Create: typed in-code registry `Record<SourceClass, { collect: boolean; store: boolean; inviteUse: boolean; notes: string }>` + `assertSourcePolicy(sourceClass, op: 'collect'|'store'|'invite-use', { stepRunId })` that throws/blocks + writes an audit row on block. ADR-029 in-code-policy style. |
| `src/engine/network-suppression.ts` | Create: `recordNetworkSuppression({ stepRunId, identifier, identifierKind, scope, scopeUserId?, reason, source, expiresAt? })` (guarded, audited) + `isSuppressed(identifier, { scope, scopeUserId })` (pure read, fail-closed for callers). |
| `src/engine/network-email-compliance.ts` | Create: `classifyAndPrepare({ kind: 'claim-invite'|'intro', to, subject, body, ... })` → `{ ok, blockedReason?, footer, headers }` where `headers` includes `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) and the call runs the pre-send suppression check + misleading-subject check + sender-identity/footer assembly. No send. |
| `src/engine/channel.ts` (`AgentMailAdapter`) | Modify: thread an optional `headers?: Record<string,string>` through `.send()` (→ `inboxes.messages.send`) and `.reply()` (→ reply call), passing it into the SDK `SendMessageRequest`/`ReplyToMessageRequest` `headers` field. Backward-compatible (omitted ⇒ today's behavior). |
| `packages/web/app/api/v1/network/complaints/route.ts` (**new sibling route, not an extension of `/inbound`**) | Create: POST handler that (1) verifies the Svix signature using the same Svix helper `/inbound/route.ts` already uses; (2) parses the typed `EventType.MessageComplained` payload (`Complaint{inboxId,threadId,messageId,timestamp,type,subType,recipients[]}`); (3) checks the `svix-id`-keyed dedup TTL → returns 200 OK without re-writing if seen; (4) mints a server-side wrapper run via `createNetworkLaneStepRun`; (5) atomically claims dedup + calls `src/engine/network-complaint-handler.ts` with that `stepRunId` inside one Network DB transaction. |
| `src/engine/network-complaint-handler.ts` (new) | Create: pure handler called by the route with a real `stepRunId` — records a `complaint` suppression for each `Complaint.recipients[]` via `recordNetworkSuppression`, writes an audit event via `writeNetworkAuditEvent`, and increments the per-source/per-segment complaint counter; when the counter crosses the threshold within the window, auto-pauses the source/segment (trip-state) until operator review. |
| `src/engine/discovery-source-policy.test.ts`, `src/engine/network-suppression.test.ts`, `src/engine/network-email-compliance.test.ts`, complaint-handler test | Create: enforcement, guard-bypass, RFC 8058 header presence, complaint→suppression→threshold-pause, Svix-invalid → no-write. |

## User Experience

- **Jobs affected:** None directly (substrate/policy). Enables operator **Review/Decide** (sub-brief 286 surfaces paused sources, suppression counts) and protects the recipient's implicit "don't contact me" Decide.
- **Primitives involved:** None rendered here. Produces the suppression/policy/complaint data the admin dashboard (286) renders as `MetricBlock`/`AlertBlock`/`InteractiveTableBlock`.
- **Process-owner perspective:** invisible to the member; the recipient experiences it as "Ditto stopped contacting me when I complained/opted out." The operator later experiences the auto-pause as an `AlertBlock` in the Action-required band.
- **Interaction states:** N/A (no UI).
- **Designer input:** `docs/research/278-trust-privacy-admin-ux.md` §4.2 (auto-paused sources land in the operator Action-required band), §4.5 (structured reason enum maps to Brief 261 `refusalReason` so refusal metrics are countable).

## Acceptance Criteria

1. [x] (Parent AC #3) `assertSourcePolicy` blocks disallowed `collect`/`store`/`invite-use` for a forbidden source class *before* any write, and writes an audit event on block; a test proves a disallowed store throws/returns-blocked and persists nothing.
2. [x] (Parent AC #4) `isSuppressed` returns true for opt-outs, complaints, prior declines, deleted-profile identifiers, blocked domains/people, and paused-source/segment identifiers; `recordNetworkSuppression` writes the row guarded + audited.
3. [x] Suppression check is fail-closed: a test simulating an unavailable suppression store makes the email-compliance `classifyAndPrepare` return `ok: false` (no send).
4. [x] (Parent AC #5) `classifyAndPrepare` enforces **each of the five sub-criteria individually** — every one is a separate boolean test in this brief:
   - 4a. (Parent AC #5a) **Sender identity** — `From` and `Reply-To` resolve to the configured Ditto network mailbox and are passed through `AgentMailAdapter.headers` (test: fixture without override uses defaults; fixture with override is rejected unless the override is a configured network mailbox).
   - 4b. (Parent AC #5b) **RFC 8058 one-click** — `List-Unsubscribe` (mailto + https) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers are present on every claim-invite and intro-thread send (test: snapshot the header map for both kinds).
   - 4c. (Parent AC #5c) **Suppression check** — `classifyAndPrepare` calls `isSuppressed(to, ...)`; a suppression hit returns `ok: false` with `blockedReason: 'suppression'` and writes an audited refusal row (no silent drop).
   - 4d. (Parent AC #5d) **Footer/address config** — when the CAN-SPAM config flag is on, the assembled footer contains the configured physical address and the unsubscribe link (test: with flag on, footer present; with flag off, footer absent).
   - 4e. (Parent AC #5e) **Misleading-subject check** — a subject matching the deny-list (impersonation phrases, fake-thread-id prefixes, deceptive urgency tokens) returns `ok: false` with `blockedReason: 'misleading-subject'` (test: cover at least one example per deny-list category).
5. [x] `AgentMailAdapter.send()` and `.reply()` pass a provided `headers` map into the SDK request; a test asserts the `headers` reach the SDK call (mock the SDK client) and that omitting `headers` preserves prior behavior.
6. [x] (Parent AC #11) A Svix-verified `message.complained` POST to `/api/v1/network/complaints` records a `complaint` suppression per recipient, writes an audit event, and when the per-source/segment complaint count crosses the configured threshold within the window, the source/segment is auto-paused (trip-state) pending operator review.
7. [x] An invalid Svix signature on `/api/v1/network/complaints` returns 4xx with **zero writes** (no suppression, no audit row, no counter increment, no pause); a valid signature without server-minted `stepRunId` is unreachable because the route mints the wrapper run before calling the handler (test: handler refuses to act when called directly with absent/falsy `stepRunId`).
8. [x] **Complaint-webhook replay idempotency.** A second POST to `/api/v1/network/complaints` with the same `svix-id` returns 200 OK and performs no additional suppression write, audit row, or counter increment within the dedup TTL window (test: send twice in quick succession; assert single suppression row, single audit row, single counter increment).
9. [x] (Parent AC #10) `recordNetworkSuppression`, source-policy writes, and the `/api/v1/network/complaints` route reject absent/falsy/spoofed `stepRunId`; the route mints its own and never accepts a caller-supplied value (test: post with `?stepRunId=…` and a body field — both ignored; route uses its server-minted run only).
10. [x] The suppression reason enum aligns to Brief 261 `refusalReason` and contains no raw anti-persona text (Hard Rule #5, origin: Brief 259); migration follows Insight-190; root `pnpm run type-check` passes.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + parent Brief 278 + this sub-brief + 282 diffs.
2. Review agent checks: enforcement-before-write at all three policy points, fail-closed suppression, RFC 8058 header correctness against the verified SDK surface, complaint→pause threshold + Svix-invalid no-write, R-Q4/R-Q5/R-Q8 implemented as the parent specified.
3. Present work + review findings to the human (part of the foundation checkpoint, reviewed with 282, 284 before Brief 279).

## Smoke Test

**Spike (Insight-180 — new external integration surface):** add a one-call spike in `src/engine/integration-spike.test.ts` that sends one real AgentMail message with a `List-Unsubscribe` header and asserts the SDK accepts the `headers` field and returns 2xx (verifies the SDK surface in the running environment, not just the type).

```bash
pnpm vitest run src/engine/integration-spike.test.ts
pnpm vitest run src/engine/discovery-source-policy.test.ts src/engine/network-suppression.test.ts src/engine/network-email-compliance.test.ts src/engine/network-complaint-handler.test.ts src/engine/network-webhook-dedup.test.ts packages/web/app/api/v1/network/complaints/route.test.ts src/engine/channel.test.ts
pnpm run type-check

# Manual:
# 1. assertSourcePolicy('linkedin-scrape','store',...) → blocked, audit row written, nothing stored.
# 2. POST /api/v1/network/complaints with a valid-Svix message.complained payload (two recipients) → two complaint suppressions + audit + counter++.
# 3. Cross the threshold → source auto-paused (trip-state set), pending operator review.
# 4. POST /api/v1/network/complaints with an invalid-Svix signature → 4xx, zero writes.
# 5. POST /api/v1/network/complaints twice with the same svix-id → only one set of writes (idempotency).
# 6. Confirm /api/v1/network/inbound still handles message.received only (no behavior change there).
```

## After Completion

1. [x] Update `docs/state.md` (sub-brief 283 complete; outbound-safety gate available for 284/279).
2. [x] Update `docs/roadmap.md` row 278.
3. [x] Phase retro notes feed the foundation-checkpoint retro.
4. [x] No ADR yet — considered at parent closeout.

## Completion Notes

- Implemented 2026-05-18; fresh-context review first returned REVISE because complaint-pause counters counted suppression-state rows. Fixed by counting per-event complaint audit rows after Svix dedup.
- Follow-up `/dev-review` findings fixed 2026-05-18: complaint dedup claim + complaint writes now share one transaction, and suppression uniqueness now uses partial unique indexes plus a scope/user check constraint so global suppressions are enforceably unique.
- Verification: focused Brief-283 vitest 93/93, `pnpm run type-check` pass, `git diff --check` pass. Full `pnpm test` hit three unrelated 5s timeout failures under full-suite load; rerunning those exact files passed 27/27.
