# Research-278: Trust, Privacy, Admin & Observability — Technical Precursors

**Date:** 2026-05-18
**Brief:** `docs/briefs/278-trust-privacy-admin-observability.md` (foundation + closeout checkpoints)
**Role:** Dev Researcher (pipeline: follows `docs/research/278-trust-privacy-admin-ux.md`)
**Status:** active
**Companion:** `docs/research/278-trust-privacy-admin-ux.md` (Designer interaction spec — UX side of the same brief)
**Consumers:** Dev Architect (to design the solution and write/refine the build brief)

> **Neutrality note (role contract):** This report describes what exists and what
> patterns are available. It does **not** rank options, recommend an approach, or
> evaluate trade-offs between competing options — that synthesis is the Architect's
> job. Pros/cons listed are factual properties, not judgements. Gaps with no
> existing solution are explicitly marked **Original to Ditto**.

---

## 1. Research Question

Brief 278 names 13 work products spanning privacy scrubbing, DSAR export/delete,
abuse controls, discovery-source policy, suppression, email compliance, an admin
trust-&-safety console, and a network health dashboard. The Builder needs to know,
per work product: **what can we build FROM?** (Principle 1 — composition over
invention; depend / adopt / pattern). The brief itself states new audit/metrics
tables should be added "only if existing feedback/activity tables cannot cover
events," so the central question is internal-codebase-first, with targeted
external-pattern research only for genuinely external concerns (CAN-SPAM,
RFC 8058, robots.txt/RFC 9309, DSAR statutory windows, rate-limit algorithms,
circuit-breaker, tamper-evident audit).

---

## 2. Constraint Inventory (what bounds every option below)

These prior decisions are stated factually as boundaries, not as recommendations.
Every option in §4–§14 is presented within these boundaries.

| Constraint | Source | What it requires |
|---|---|---|
| Network/Workspace tier separation; **no cross-boundary joins**; new tables explicitly tiered at creation | `docs/adrs/036-database-tier-strategy.md`, ADR-048, ADR-025 | Brief 278 privacy/audit/suppression schema is **Network-tier** (`packages/core/src/db/network/schema.ts` → `drizzle/network/`). Combine cross-tier in app code only. |
| `stepRunId` guard on side-effecting engine tools | Insight-180 | Every guarded tool invocation anchored to an audited run. |
| Engine must not call itself over HTTP to mint a run | Insight-211 | Routes cannot `fetch()` themselves for a `stepRunId`. |
| Audited HTTP-route wrapper step run; reject caller-supplied `stepRunId`; reuse `src/engine/network-step-run.ts` | Insight-232 | All 7+ foundation routes mint a server-side network-lane wrapper run and 400 on any caller `stepRunId`. |
| Cross-deployment delivery = durable sender outbox + consumer pull-and-ack + idempotent ACK retry + terminal-state persistence (not in-memory SSE) | Insight-234 | Any Network→workspace privacy artifact (e.g. a delete-completion receipt) must use the durable-delivery primitive, not SSE. |
| Trust **signals** not activity traces; three-level disclosure (collapsed one-line → summary card → deep raw audit) | Insight-127 | The admin health dashboard and audit-log viewer must default to signal-level, with raw audit behind progressive disclosure. |
| Filesystem legibility is the default — **except** Tier-2 credentials & PII must not be in the filesystem projection | Insight-201, Insight-087 | Privacy export/delete artifacts and suppression entries: legible where safe, sealed where PII. |
| Boundary enforced by transport, not a runtime filter | Insight-235 | Scrub/privacy guarantees should be structural, not a single in-process filter that can be bypassed. |
| Brief 261 Hard Rule #5 | `docs/briefs/261-introductions-free-counter-workspace-upsell.md` (enforced in `src/engine/connection-proposal.ts`) | Anti-persona rules are **owner-visible only** — never quoted/revealed to a visitor, requester, or in admin tools that surface to non-owners. |
| Do not create a second admin auth system; admin routes stay on **public Network**, not workspace deployments | Brief 278 Constraints | Reuse the existing `requireAdmin` / deployment-mode gate (§13). |
| Drizzle journal idx sequencing | Insight-190 | New Network migrations: next idx is **9** (journal currently ends at idx 8, tag `0008_smooth_leo`); generate SQL + snapshot, verify the SQL file exists. |

---

## 3. Existing Research / Landscape Touchpoints

- `docs/research/README.md` — no prior report covers Brief 278's privacy/trust/admin
  **technical** layer. Adjacent reports (not superseded, complementary):
  `docs/research/trust-visibility-ux.md` (trust-signal disclosure UX),
  `docs/research/centralized-network-service-deployment.md` (Network tier deployment),
  `docs/research/ai-sdr-and-network-introduction-platforms.md` (outbound/intro context).
  This report should be **added** to that index.
- `docs/landscape.md` — current relevant entries: AgentMail (depend level, primary
  email adapter, `integrations/agentmail.yaml`; SDK v0.4.18 webhook `EventType`
  set verified §17 Q5 — incl. `message.complained` / `message.delivered` /
  `message.sent` / `message.rejected`, **not** only received/bounced); Cloudflare
  Turnstile (in use, `src/engine/turnstile.ts`);
  anti-spam default stack note (honeypot + rate-limit + captcha). **No** entry for a
  rate-limit library (`rate-limiter-flexible` / `@upstash/ratelimit`); **no** entry
  for policy-as-code (OPA/Rego). Landscape updates required by the Researcher
  contract are listed in §16 and applied separately (Task: landscape.md update).

---

## 4. Internal Precursor Inventory (per Brief 278 work product)

"Build FROM" level uses Principle 1 vocabulary: **reuse** (call existing module
as-is), **extend** (add to existing module/table), **pattern** (study and
implement new), **Original to Ditto** (no precedent).

| Brief 278 work product | Closest existing precursor (source path) | Build-FROM level |
|---|---|---|
| `network-privacy-scrubber.ts` | `src/engine/connection-proposal.ts` — `scrubProposalText()` (L104–120), `PRIVATE_TOKEN="[private]"` (L92), `privateValues()` strips `card.antiPersonaMd` + `card.budgetShape.ballpark` (L98–101), `scrubApplied` reported on object (L66–67); `src/engine/integration-handlers/scrub.ts` — `scrubCredentialsFromValue()` recursive walk-and-redact at a return boundary (L37–94) | **pattern** (two precedents, different scopes — proposal-text vs credential-value; neither is a general PII scrubber) |
| `network-audit.ts` | `networkRequestAuditEvents`, `networkSignalReviewEvents`, `networkSearchAuditEvents` in `packages/core/src/db/network/schema.ts` (L504–522, L763–789, L922–946) — all append-only, `stepRunId NOT NULL`, `actorId`, `before`/`after` JSON, indexed by entity + eventType; `networkSearchAuditEvents.scrubDecision` JSON (L936) records the scrub outcome already | **extend / pattern** (three domain-scoped audit tables exist; no generic privacy/network audit log; see §9) |
| `network-abuse-controls.ts` | `src/engine/visitor-rate-limit.ts` (full); `src/engine/turnstile.ts` (full); `networkUserBlockList` table (schema L1012–1036, Brief 261, kind ∈ workspace-user/visitor-session/pattern, unique target+kind+identifier) | **reuse + extend** (rate-limit + Turnstile + block-list all exist; see §10) |
| `discovery-source-policy.ts` | `docs/adrs/029-x-api-and-social-publishing.md` (Ditto precedent: platform-ToS constraints encoded in integration code); `networkSignalSourceType` enum (schema L128–143) enumerates allowed source types already | **pattern** (policy-as-code is new; ADR-029 is the Ditto encoding precedent; see §13) |
| `network-suppression.ts` | `people.optedOut` boolean (schema L365) + `packages/web/app/api/v1/network/people/[id]/opt-out/route.ts`; `networkSessionUpsellLog` `unique(userId,trigger)` once-only pattern (schema L1038–1052) | **pattern** (opt-out is per-person boolean, not a suppression list keyed by email/identifier with reason+source; see §12) |
| `network-email-compliance.ts` | AgentMail SDK supports `headers: Record<string,string>` on send **and** reply (`SendMessageRequest` / `ReplyToMessageRequest`) — RFC 8058 injectable (verified §17 Q5); `src/engine/channel.ts` `AgentMailAdapter` L342–364 is the extension point (does not pass `headers` today); CAN-SPAM footer text + pre-send suppression check have no precedent | **extend** (adapter header pass-through) + **Original to Ditto** (CAN-SPAM footer + suppression-check wrapper) |
| `/api/v1/network/privacy/export/route.ts` | No existing export route. `packages/web/app/api/v1/network/people/[id]/opt-out/route.ts` is the nearest privacy-action route shape; `network/search/route.ts` is the canonical wrapper-run route (§5) | **Original to Ditto** (DSAR export; external standards in §7) |
| `/api/v1/network/privacy/delete/route.ts` | Same as above; `revokeToken()` soft-revoke via `revokedAt` (`src/engine/network-api-auth.ts` L125–151) and `managedWorkspaces.deprovisionedAt` are the existing soft-terminal-state precedents | **Original to Ditto** (DSAR delete + tombstone; external standards in §8) |
| `packages/web/app/admin/network/superconnector/page.tsx` | `packages/web/app/admin/` — `layout.tsx` (deployment-mode gate), `page.tsx`, `fleet/page.tsx`, `smoke-tests/page.tsx`, `users/[userId]/page.tsx`; admin API under `packages/web/app/api/v1/network/admin/*` | **extend** (new admin sub-page in an existing admin shell + auth; see §14) |
| `packages/web/components/network/privacy-center.tsx` | No existing privacy-center component; KB visibility controls `packages/web/app/api/v1/network/kb/visibility/route.ts` + member-signal review components are the nearest "user controls their own data" UI precedent | **pattern** (composes existing visibility/edit/delete affordances; UX spec is the companion `-ux.md`) |
| `packages/web/components/admin/network-health-dashboard.tsx` | No existing health-dashboard component; `packages/web/app/admin/fleet/page.tsx` + `upgradeHistory`/`upgradeWorkspaceResults` tables (schema L1155–1195) are the nearest operational-metrics UI precedent | **pattern** (Insight-127 three-level disclosure constrains it; "Superconnector trust dashboard = Original to Ditto" per brief Provenance) |
| `docs/review-checklist.md` additions | Existing checklist (cross-deployment auth-artifact check already present) | **extend** |
| `docs/dictionary.md` additions | Existing glossary | **extend** |

---

## 5. The Canonical `stepRunId` Wrapper-Run Pattern (Insight-232)

All foundation HTTP routes in Brief 278's Side-Effect/HTTP Seam Matrix replicate
one shape that already exists verbatim in the codebase.

**Reference implementation:** `packages/web/app/api/v1/network/search/route.ts`
- `hasCallerStepRun(body)` — `Object.prototype.hasOwnProperty.call(body, "stepRunId")` (L59–61)
- Reject bypass: `if (hasCallerStepRun(body)) return 400 { error: "step_run_bypass_rejected" }` — POST L114–116, PATCH L166–168
- Mint server-side: `const stepRunId = await createNetworkLaneStepRun({ route, sessionId, actorId })` — POST L125–129, PATCH L183–187
- Pass minted id into the guarded engine call (L153, L198)

**Minter + guard:** `src/engine/network-step-run.ts`
- `createNetworkLaneStepRun()` (L47–69) — generates `network-lane-step:<route>:<uuid>`,
  `fs.appendFile` JSONL to `data/network-kb/audit/network-lane-step-runs.jsonl`
  (filesystem-backed lane audit, **not** a DB table; `NETWORK_KB_ROOT`-rooted)
- `requireNetworkStepRunId(stepRunId, operation, { rejectWebDirect })` (L28–45) —
  throws unless present (or `DITTO_TEST_MODE=true`); `rejectWebDirect` additionally
  refuses ids starting `web-direct-action:`

**Factual properties:** the wrapper run is route-minted (caller cannot supply or
influence it); the lane audit is append-only JSONL on the Network deployment's
filesystem; `DITTO_TEST_MODE` is the only guard bypass and only inside engine tests.
Other network routes already minting wrappers (precedent breadth):
`packages/web/app/api/v1/network/scout/route.ts`, `.../intros/route.ts`,
`.../people/[id]/intro-request/route.ts`.

**Gap:** the lane-step JSONL records *that a route ran*; it does not record the
*privacy/abuse decision* (what was scrubbed, who was suppressed, what source was
blocked). Brief 278's `network-audit.ts` is the decision-level audit (§9), distinct
from the lane-step provenance log. Both are "audit" but different layers.

---

## 6. Privacy Scrubber — Options

### 6a. Internal precedent A — proposal-text scrub (`connection-proposal.ts`)
`scrubProposalText(text, card)` (L104–120) builds a private-value list from
`card.antiPersonaMd` + `card.budgetShape.ballpark` (`privateValues()` L98–101),
regex-replaces each case-insensitively with `[private]`, returns
`{ text, scrubbed }`; callers OR the
`scrubbed` flags into a single `scrubApplied` recorded on the connection object
(`networkPossibleConnections.scrubApplied` boolean, schema L874) and in
`networkSearchAuditEvents.scrubDecision` (L936).
- *Properties:* operates on **known private strings from a structured card**;
  enforces Brief 261 Hard Rule #5 (anti-persona never leaves owner scope);
  decision is persisted on the row and in the audit trail.
- *Scope limit:* string-substring match of values the system already holds; not
  generic PII (emails, phones, names not in the card) detection.

### 6b. Internal precedent B — credential-value scrub (`integration-handlers/scrub.ts`)
`scrubCredentialsFromValue(value, secrets, serviceLabel)` recursively walks
strings/arrays/objects (skips Date/Map/Set/RegExp/Error/TypedArray), replaces each
known secret with `[REDACTED:{service}]`; `MIN_CREDENTIAL_LENGTH = 5`;
`secretsFromAuthEnv()` extracts the value set. Applied at the integration return
boundary (Brief 171/179).
- *Properties:* recursive structural walk over arbitrary nested values; redacts
  **known values** (vault/env), explicitly out of scope for entropy/regex
  heuristic detection; documented short-value limitation.

### 6c. External pattern family — PII scrub strategies (no code adopted; pattern only)
For surfaces where the private values are *not* a known list (public profile,
search snippet, forwarded note), the documented external families are:
allowlist projection (emit only fields explicitly marked public — structural,
matches Insight-235 "boundary by transport"); denylist/regex PII detection
(email/phone/handle patterns — false-positive prone, the `scrub.ts` header
explicitly defers this); tokenization/format-preserving redaction; and
visibility-tagged field model (each fact carries `visibility ∈ public/on-request/
private/hidden`, already present on `networkSignalClaims.visibility` schema L740–743
and `networkUserKbFacts.visibility` L573–576).
- *Properties (allowlist projection):* nothing leaks unless explicitly marked
  public; aligns with the existing visibility enums; requires every emitting
  surface to project rather than filter.
- *Properties (denylist/regex):* catches unknown PII; false positives/negatives;
  the codebase has a written stance deferring heuristic detection.

---

## 7. DSAR Export & Identity Verification — Options

No existing export route. External statutory/standards inputs (pattern level):

- **GDPR Art. 15 (access) / Art. 20 (portability)** — data subject may obtain a
  copy in a "structured, commonly used, machine-readable format"; controller
  responds within 1 month (extendable to 3).
- **CCPA/CPRA** — right to know/access; **45-day** response window (one 45-day
  extension); verifiable consumer request required.
- **Identity verification primitives available in-codebase** (reuse candidates):
  1. Authenticated session — `resolveNetworkLaneSession()` (used in
     `network/search/route.ts` via `../kb/session`), session→userId.
  2. Network token — `validateToken()` / `requireAdmin()`
     (`src/engine/network-api-auth.ts`): Bearer `dnt_` token, SHA-256 hashed,
     O(1) index lookup, `revokedAt` soft-revoke.
  3. Email challenge — `src/engine/email-verification.ts` exists (email
     verification primitive); AgentMail send path for the challenge email.
  4. Claim token — **Original to Ditto** (no claim-invite token primitive exists;
     Brief 279 territory but Brief 278 must define the export/delete identity
     contract). Nearest shape: one-time hashed token like `networkTokens`.
- *Factual:* Brief 278 Constraint "Deletion/export identity is verified … claim
  token, email challenge, or authenticated session" maps to primitives 1–3
  existing and 4 not existing.

**Export artifact shape — options (symmetric factual properties; no preference):**
- *Transient signed download* (generate on request, no storage). Properties: no
  PII bundle at rest beyond the source tables; consistent with the Insight-201
  stance against projecting PII to the filesystem; the artifact cannot be
  re-fetched after the signed link expires (a second request regenerates it);
  no new retention window to define.
- *`ArtifactBlock` persisted* (the content-block union has an artifact type).
  Properties: re-downloadable; survives a session interruption or lost link;
  can satisfy AC #18 ("user can export their data") with a durable, referenceable
  record; introduces a stored PII bundle that itself requires a defined retention
  window (interacts with §8 retention and Open Question #11).
- This is also a companion UX-spec open question (`-ux.md` §8 Q6). Both shapes
  are presented with factual properties only, no preference, per role contract.

---

## 8. Delete, Soft-Delete & Tombstone — Options

- **Existing soft-terminal-state precedents (reuse-shape):**
  `networkTokens.revokedAt` (soft revoke, `src/engine/network-api-auth.ts`
  `revokeToken()` checks-then-sets, returns whether a row changed),
  `managedWorkspaces.deprovisionedAt`, `networkMemberSignalStatus` includes
  `deleted` (status-flag soft delete, schema L125–126),
  `networkSignalReviewEventType` includes `signal_deleted` (delete is audited).
- **External pattern — two-phase soft-delete / tombstone:** mark (status=deleted +
  deletedAt), retain a minimal tombstone (id + deletion timestamp + reason +
  legal-hold flag) for audit/anti-resurrection, hard-purge body after a retention
  window. Anti-resurrection mirrors Insight-234 implication #4 (a terminal state
  must persist so a reload/import can't revive a decided artifact).
- **External statutory inputs:** GDPR Art. 17 (erasure, with exceptions: legal
  obligation, establishment/defence of legal claims — the tombstone/audit
  retention basis); CCPA right to delete (service-provider exceptions);
  California DELETE Act / DROP (deletion mechanism direction).
- **Brief 278 Constraint:** "No destructive delete without confirmation and audit
  tombstone where legally/product-wise appropriate." The audit row for the delete
  is itself a Network-tier append-only record (§9).
- *Factual options surface:* (a) status-flag soft delete reusing the existing
  `status='deleted'` enum precedent; (b) dedicated tombstone table keyed by
  deleted entity; (c) hybrid (status flag + tombstone + scheduled purge). No
  recommendation — Architect to choose.

---

## 9. Network Audit-Log Model — Options

**What exists (three domain-scoped append-only audit tables, identical shape):**
`networkRequestAuditEvents` (L504–522), `networkSignalReviewEvents` (L763–789),
`networkSearchAuditEvents` (L922–946). Common columns: `id`, entity FK,
`eventType` (typed enum), `actorId`, **`stepRunId NOT NULL`**, `before`/`after`
JSON, `createdAt`, indexed by entity + eventType. `networkSearchAuditEvents`
additionally carries `scrubDecision` JSON and `targetLifecycleState` — the
existing precedent for "record the privacy decision in the audit row."

**Brief 278 instruction:** add new audit/metrics tables "only if existing
feedback/activity tables cannot cover events." Coverage analysis (factual):

| Brief 278 event class | Covered by existing table? |
|---|---|
| Request/search/signal lifecycle + scrub decision | Yes — the three tables above |
| `stepRunId` provenance (route ran) | Yes — `network-lane-step-runs.jsonl` (§5), filesystem |
| Privacy export requested/fulfilled | No existing table has an export event type |
| Delete requested/confirmed/tombstoned | No existing table; `signal_deleted` only covers member-signal |
| Suppression added/removed (email/identifier) | No table (only `people.optedOut` boolean, no event) |
| Source-policy block (collection/storage/invite) | No table |
| Abuse trip / complaint-threshold pause | No table |

**Options for the new privacy/safety audit surface:**
- (a) **One generic `network_audit_events` table** — single eventType enum
  spanning privacy/suppression/source-policy/abuse, same shape as the existing
  three. *Property:* one query surface for the admin viewer; broad enum.
- (b) **Per-domain tables** mirroring the existing three (e.g.
  `network_privacy_events`, `network_abuse_events`). *Property:* matches existing
  precedent exactly; more tables/migrations.
- (c) **Extend an existing table's enum** — only viable where the entity FK fits;
  privacy/abuse events are often not request/signal/search-scoped.

**Tamper-evidence spectrum (external pattern, factual ladder, no recommendation):**
none (plain append-only rows — current Ditto state) → application-enforced
append-only (no UPDATE/DELETE code path) → hash-chain (each row stores
`prevHash`; detects tampering) → external WORM/anchoring (S3 Object Lock /
external notarization; strongest, heaviest). Brief 278 says "audit trails are
mandatory" but does not specify a tamper tier — Architect decision.

**Migration mechanics (Insight-190):** Network journal
(`drizzle/network/meta/_journal.json`) ends at idx 8 (`0008_smooth_leo`, version
7, postgresql). Next idx is **9**; generate SQL + snapshot, verify the
`0009_*.sql` file exists, resequence on merge conflict. Tier label is **Network**
(file lives in `packages/core/src/db/network/schema.ts`).

---

## 10. Rate-Limit & Abuse Controls — Options

**What exists:**
- `src/engine/visitor-rate-limit.ts` — in-memory `Map` counters, per-session
  limit 30, per-IP limit 200, 1-hour fixed window (`bumpCounter` resets when
  `resetAt <= now`), returns `{ blocked, reason, retryAfterSec }` + visitor copy
  helper. Header comment states it "mirrors the process-os Charlie shape" and
  "should move to Redis when public Network traffic is high enough for
  multi-instance enforcement." *Property:* single-instance only; counters lost on
  restart; documented as v1.
- `src/engine/turnstile.ts` — Cloudflare Turnstile server-side verify
  (`siteverify`), fail-open on Cloudflare outage, graceful-degrade when
  unconfigured, skipped in `NODE_ENV=development`.
- `networkUserBlockList` — per-target block list, kind ∈
  workspace-user/visitor-session/pattern, `blockedRequesterIdentifier`,
  unique(target,kind,identifier) (Brief 261 abuse precedent).
- `introductionRefusalReasonValues` includes `rate-limit` (schema L215–221) —
  Brief 261's >5/60min refusal trigger is already a modelled outcome.
- `src/engine/spend-ceiling.ts` — spend ceiling enforcement (a budget-based
  circuit-breaker-adjacent existing module).

**Rate-limit algorithm family (external, factual, no ranking):** fixed-window
(current `visitor-rate-limit.ts` approach — simple, burst-at-boundary);
sliding-log (exact, memory-heavy); sliding-window-counter (approximate, low
memory); token-bucket (smooth burst allowance); leaky-bucket (constant drain).

**Library landscape (no entry in `docs/landscape.md` yet — Researcher must add):**
- `rate-limiter-flexible` — npm; in-memory + pluggable stores (Postgres/Redis/
  Mongo/Memcached); supports the algorithm families above; Postgres store means
  **no Redis dependency** (relevant: Ditto Network runs Supabase Postgres, no
  Redis in stack today). License MIT.
- `@upstash/ratelimit` — npm; requires Upstash Redis (HTTP Redis). Adds an
  external managed dependency not currently in the Ditto stack.
- Hand-rolled Postgres counter — a `network_rate_counters` table with atomic
  `INSERT … ON CONFLICT … DO UPDATE` increment; no new dependency; multi-instance
  safe via the shared Network DB. *Property:* matches the no-Redis constraint;
  Original-to-Ditto code.
- *Factual constraint:* Brief 278 says "rate limits and abuse controls are
  enforced **server-side**" and the current limiter is single-instance memory;
  multi-instance enforcement requires a shared store (Postgres or Redis).

---

## 11. Circuit-Breaker / Complaint-Threshold Auto-Pause — Options

**What exists:**
- `upgradeHistory` schema: `status` enum includes `circuit_breaker_tripped`,
  column `circuitBreakerAt` timestamp (schema L1161, L1168) — Ditto already
  models a tripped breaker as a persisted terminal state in the fleet-upgrade
  domain (Brief 091). This is the in-repo circuit-breaker **state-modelling**
  precedent.
- `src/engine/spend-ceiling.ts` — threshold-based halt precedent (budget).
- No discovery-pause mechanism exists (Brief 279 produces discovery; Brief 278
  must lay the pause primitive).

**External pattern — circuit breaker (Nygard / Fowler / AWS):** three states
CLOSED → OPEN (trip on threshold breach) → HALF-OPEN (probe) → CLOSED. Applied to
Brief 278's "complaint thresholds pause discovery": a counter of
spam-complaint/bounce signals over a window; on breach, flip a persisted
`discoveryPaused` state (matching the `circuit_breaker_tripped` precedent shape);
manual or timed reset.

**Gmail/Yahoo bulk-sender thresholds (external, factual):** Feb-2024 rules —
keep spam-complaint rate **below 0.30%** (ideally <0.10%); one-click unsubscribe
honoured within 2 days; valid SPF/DKIM/DMARC. These supply the *threshold values*
Brief 278's complaint-pause would encode. ARF (Abuse Reporting Format) / FBL
(feedback loop) is the inbound complaint-signal source.

- *Factual (Q5 resolved):* the trip-state persistence has an exact in-repo
  precedent (`circuit_breaker_tripped` + `circuitBreakerAt`); the complaint-rate
  threshold values are external (Gmail/Yahoo); the complaint **signal source
  exists** — AgentMail emits a typed `message.complained` /
  `Complaint { recipients[], type, subType }` webhook and Ditto **already
  verifies** the Svix-signed AgentMail webhook in
  `packages/web/app/api/v1/network/inbound/route.ts`. Original-to-Ditto is now
  only the complaint→suppression handler + the complaint-threshold
  circuit-breaker, **not** the ingestion path (§17 Q5, §15 #9).

---

## 12. Suppression List — Options

**What exists:** `people.optedOut` boolean (person-level, schema L365) +
`/api/v1/network/people/[id]/opt-out/route.ts`; `networkSessionUpsellLog` shows
the `unique(userId, trigger)` "fire-once / idempotent" table pattern
(schema L1051) reusable for "suppress-once per identifier."
`interactionTypeValues` includes `opt_out` (an opt-out is already an audited
interaction type, schema L64).

**Gap vs Brief 278:** the brief needs a suppression **list** keyed by contact
identifier (email/domain/handle) with reason + source + timestamp, queried
**before every outbound send and before invite use** (Constraint: "source policy
is enforced before storage and before outreach"), and distinct from a
per-`people`-row boolean (a suppressed contact may not be a `people` row at all —
e.g. a discovered profile or a raw bounce address).

**Options (factual):**
- Dedicated `network_suppressions` table — identifier (normalised), scope
  (global/per-user), reason enum (unsubscribe/bounce/complaint/manual/
  source-policy), source, createdAt, optional expiry; unique on
  (identifier, scope). *Property:* single authoritative pre-send gate; new table
  (Network tier, migration idx 9+).
- Reuse `people.optedOut` + extend — only covers contacts that are `people` rows;
  does not cover discovered/raw addresses.
- Recurring-profile / TTL suppression for a private network — **Original to
  Ditto** (no precedent for "suppress this discovered profile, and keep it
  suppressed across future discovery refreshes"); relates to Brief 279
  discovered-profile expiry.

---

## 13. Discovery Source-Policy-as-Code — Options

**Ditto precedent (in-repo, the encoding model):**
`docs/adrs/029-x-api-and-social-publishing.md` — Ditto already encodes
platform-ToS constraints directly in integration code (LinkedIn via Unipile only;
X via own API; Buffer rejected; later Unipile-X deprecation tracked). This is the
established "policy lives in code, not config" precedent for the **collection
side**. `networkSignalSourceType` enum (schema L128–143) already enumerates the
permitted source types (linkedin/website/x/github/substack/…); a policy layer
would gate which of these may be collected, stored, and used for invite.

**External inputs (pattern level, factual):**
- **RFC 9309 (robots.txt)** — the standardised robots exclusion protocol; a
  source-policy module that respects robots would parse and honour it before
  fetch.
- **Litigation context** — *hiQ v. LinkedIn* (public-data scraping, CFAA
  narrowed) and *Meta v. Bright Data* — establish that public-data collection is
  legally contested and platform-ToS-sensitive; the factual takeaway is "policy
  must be explicit and enforced before storage," matching the Brief 278
  Constraint wording.
- **Policy-as-code engines:**
  - **OPA / Rego** (Open Policy Agent) — general policy engine, policies in Rego,
    decision API. *Property:* powerful, externally-evaluated; adds a runtime/
    sidecar dependency; **no `docs/landscape.md` entry** (Researcher must add as
    evaluated-not-adopted).
  - **In-code policy table / registry** — a `discoverySourcePolicy` map or
    `network_source_policy` table (sourceType → {collect, store, inviteUse}
    booleans + note), checked by `discovery-source-policy.ts` before each action.
    *Property:* no new dependency; matches the ADR-029 in-code precedent;
    Original-to-Ditto code.
- *Factual:* Brief 278 requires the policy be enforced "before storage and before
  outreach" and that "code must block disallowed collection, storage, and invite
  use" — i.e. three enforcement points, regardless of engine choice.

---

## 14. Admin Trust-&-Safety Console & Health Dashboard — Options

**Admin auth — what exists (the "do not create a second admin auth system"
target):**
- `src/engine/network-api-auth.ts` — `validateToken()` (Bearer `dnt_`,
  SHA-256-hashed, O(1) hash-index lookup, `revokedAt` honoured), `requireAdmin()`
  (returns the validation only if `isAdmin`), `createToken(userId,{isAdmin})`.
  `networkTokens.isAdmin` boolean is the single admin authority.
- `packages/web/app/admin/layout.tsx` — `isWorkspaceDeployment()` →
  `notFound()`; comment notes a middleware-level hard block in `middleware.ts`
  and that admin "only exists in `public` deployments" — exactly the Brief 278
  Constraint "admin routes stay on public Network, not workspace deployments."
- `packages/web/app/api/v1/network/admin/login/route.ts` and the
  `app/api/v1/network/admin/*` route family (provision, rollback, upgrades,
  users, smoke-tests, fleet, deprovision) are existing admin endpoints using this
  auth. New `superconnector` admin surface = a sibling under the same shell/auth.

**Admin pages shell precedent:** `packages/web/app/admin/` already has
`layout.tsx`, `page.tsx`, `fleet/page.tsx`, `smoke-tests/page.tsx`,
`users/[userId]/page.tsx`. Brief 278's
`admin/network/superconnector/page.tsx` extends this directory.

**Health-dashboard precedent:** `packages/web/app/admin/fleet/page.tsx` +
`upgradeHistory`/`upgradeWorkspaceResults` tables are the existing
operational-metrics-in-admin shape. No trust/economic-outcome dashboard exists —
brief Provenance explicitly marks "Superconnector trust dashboard = Original to
Ditto."

**Disclosure constraint (Insight-127, factual):** the audit-log viewer and health
dashboard must default to **signal-level** (collapsed one-line → summary card →
deep raw audit). Raw `before`/`after` JSON and any private text sit behind the
deepest disclosure tier; Brief 261 Hard Rule #5 forbids surfacing anti-persona
text to non-owners even in admin tools.

**Metrics inputs available (factual, no aggregation built):** the three audit
tables (event counts, scrub-rate via `scrubDecision`), `introductions.state` /
`refusalReason` (refusal mix incl. `rate-limit`), `networkUserBlockList`
(block volume), `networkWorkspaceDeliveries.status` (delivery health),
`networkSearchRuns.partial`/`resultCount`. Economic-outcome / willingness-to-pay
metrics (brief asks for these) have **no source column today** — Original to
Ditto (would need a new captured signal).

---

## 15. Gaps — Original to Ditto (explicitly flagged)

No existing solution; must be designed new (no source to build FROM):

1. **General PII privacy scrubber** for surfaces where private values are not a
   known card/secret list (the two existing scrubbers cover known-value sets only).
2. **DSAR export route + artifact** (`/api/v1/network/privacy/export`) — no
   precedent; export-artifact storage shape unresolved (transient vs `ArtifactBlock`).
3. **DSAR delete route + tombstone** (`/api/v1/network/privacy/delete`) — soft-
   delete *state* precedents exist; the delete *flow* + tombstone table do not.
4. **Claim-invite token identity primitive** — needed for export/delete identity
   when there is no session/token; nearest shape is `networkTokens` hashed-token.
5. **Email-compliance wrapper** (`network-email-compliance.ts`) — CAN-SPAM footer
   text + pre-send suppression check are Original-to-Ditto; the RFC 8058
   `List-Unsubscribe` / `List-Unsubscribe-Post` header injection is an **extend**
   of `src/engine/channel.ts` `AgentMailAdapter` (SDK supports `headers` on
   send+reply — verified §17 Q5), not Original-to-Ditto.
6. **Suppression list** keyed by contact identifier with reason/source/expiry
   (existing `optedOut` is a per-`people` boolean only).
7. **Recurring-profile / TTL suppression** that survives future discovery
   refreshes (private-network discovered-profile context).
8. **Discovery source-policy enforcement at three points** (collect / store /
   invite-use) — ADR-029 is the encoding precedent but no source-policy module
   exists.
9. **Complaint-threshold discovery pause** — Original-to-Ditto: the trip-state
   shape has a precedent (`circuit_breaker_tripped`) but the complaint→suppression
   handler + threshold circuit-breaker do not exist. (The ARF/FBL **ingestion
   path is no longer a gap** — AgentMail emits typed `message.complained` and
   Ditto already verifies the Svix-signed webhook; verified §17 Q5.)
10. **Privacy/safety audit surface** (privacy/suppression/source-policy/abuse
    events) — three domain audit tables exist but none covers these event classes.
11. **Operator trust-&-safety console + Superconnector health/economic-outcome
    dashboard** — composite is Original to Ditto (brief Provenance says so);
    economic-outcome/willingness-to-pay has no source signal today.
12. **Multi-instance server-side rate limiting** — current limiter is
    single-instance in-memory by its own documentation.

---

## 16. Reference-Doc Status (Researcher contract)

**`docs/landscape.md` — updates required (applied as a separate task, per
contract "every external dependency the Architect might reference must have a
landscape entry before the brief is written"):**
- **Add** `rate-limiter-flexible` (and note `@upstash/ratelimit` as the
  Redis-coupled alternative) — candidate dependency for §10; record the
  Postgres-store / no-Redis property factually.
- **Add** OPA / Rego — evaluated for §13 source-policy; record as
  pattern-reference with the in-code-registry lightweight alternative noted (no
  recommendation — Architect decides).
- **AgentMail entry — RESOLVED & rewritten (no longer "Architect-to-verify"):**
  the §17 Q5 verification confirmed `headers: Record<string,string>` on
  send+reply (RFC 8058 injectable) and the full webhook `EventType` set incl.
  `message.complained` (typed `Complaint`); the landscape bullet is rewritten to
  the verified fact (applied this session, 2026-05-18).
- No existing landscape evaluation is *contradicted* by these findings (Turnstile
  / AgentMail entries remain accurate) — these are **additions**, not supersessions.

**`docs/research/README.md`:** add this report + the companion `-ux.md` to the
index (no prior 278 technical report to supersede).

**Other reference docs:** `docs/architecture.md`, `docs/dictionary.md`,
`docs/review-checklist.md` — Brief 278 itself modifies the latter two; no
Researcher-owned drift found in architecture.md for this scope.

---

## 17. Open Questions for the Architect (decisions this report does not make)

These surface the technical forks the Architect must resolve (several mirror the
companion `-ux.md` §8). Presented as questions, not recommendations.

> **Update (2026-05-18):** Q5 (AgentMail compliance capability) is **RESOLVED by
> Researcher verification** below — it is a verified fact, not an open fork.
> **10 open questions remain** for the Architect (Q1–Q4, Q6–Q11). Numbering is
> retained (not renumbered) so cross-references stay stable.

1. **Audit-table topology** — one generic `network_audit_events` (§9a) vs
   per-domain tables matching the existing three (§9b) vs extend-enum (§9c).
2. **Tamper-evidence tier** — plain append-only vs app-enforced no-mutate vs
   hash-chain vs WORM (§9). Brief mandates "audit" but not a tier.
3. **Rate-limit store** — `rate-limiter-flexible` (Postgres store, no new infra)
   vs `@upstash/ratelimit` (Redis) vs hand-rolled Postgres counter (§10), given
   the documented single-instance limitation of the current limiter and the
   no-Redis stack.
4. **Source-policy engine** — OPA/Rego vs in-code policy table/registry (§13),
   given the ADR-029 in-code precedent and three enforcement points.
5. **AgentMail compliance capability — RESOLVED by verification (2026-05-18, Dev
   Researcher; landscape-accuracy duty, Insight-043).** Both halves confirmed
   against the pinned SDK `agentmail@0.4.18`:
   - *(a) Header injection — SUPPORTED.* `SendMessageRequest` **and**
     `ReplyToMessageRequest` both expose `headers?: SendMessageHeaders` where
     `SendMessageHeaders = Record<string, string>` — arbitrary RFC headers on
     initial send and on replies. RFC 8058 `List-Unsubscribe` /
     `List-Unsubscribe-Post: List-Unsubscribe=One-Click` are injectable.
     *Wiring gap (not a capability gap):* Ditto's `AgentMailAdapter.send()` /
     `.reply()` (`src/engine/channel.ts` L342–364) do **not** pass a `headers`
     field today — `network-email-compliance.ts` extends that adapter call. The
     work product is therefore **extend**, not Original-to-Ditto (§4, §15 #5).
   - *(b) Complaint/FBL webhook beyond `message.bounced` — SUPPORTED.* The SDK
     `EventType` enum is `message.received` / `message.received.spam` /
     `message.received.blocked` / `message.sent` / `message.delivered` /
     `message.bounced` / **`message.complained`** / `message.rejected` /
     `domain.verified`. `MessageComplainedEvent` carries a typed `Complaint
     { inboxId, threadId, messageId, timestamp, type, subType, recipients[] }`
     — `recipients[]` is the suppression-list key; `type`/`subType` classify the
     complaint (ARF/FBL). Webhooks are Svix-delivered and Ditto **already
     verifies the Svix signature** in
     `packages/web/app/api/v1/network/inbound/route.ts` (uses `svix` `Webhook`,
     `AGENTMAIL_WEBHOOK_SECRET`, normalises any `event_type` generically). The
     signed receiver + the signal source both exist; only the
     complaint→suppression handler and the complaint-threshold circuit-breaker
     remain Original-to-Ditto (§11, §15 #9).
   No open question remains here; the landscape entry is updated to the verified
   fact (§16).
6. **Export-artifact shape** — transient signed download (no PII bundle at rest,
   not re-fetchable after link expiry, no new retention window) vs persisted
   `ArtifactBlock` (re-downloadable, survives session loss, satisfies AC #18 with
   a durable record, requires a defined retention window) (§7). Both carry
   factual properties; the Architect weighs them.
7. **Identity for export/delete without a session** — reuse hashed-token
   (`networkTokens` shape) vs email challenge (`email-verification.ts`) vs a new
   claim-invite token primitive (§7, gap #4).
8. **Suppression scope** — global vs per-user vs both; and whether discovered-
   profile recurring suppression is in Brief 278 foundation or deferred to 279.
9. **Delete model** — status-flag soft delete (reuse `status='deleted'`
   precedent) vs dedicated tombstone table vs hybrid + scheduled purge (§8).
10. **Where the privacy decision is audited** — extend
    `networkSearchAuditEvents.scrubDecision` precedent vs the new audit surface
    (§9); and whether the lane-step JSONL (§5) and the decision audit are
    reconciled or kept separate layers.
11. **Retention windows & post-delete URL behaviour** — Brief AC #8 requires
    explicit retention/refresh defaults for Discovery Profiles, raw source
    snippets, claim tokens, invite events, and audit tombstones; Brief AC #19
    requires defined direct-profile-URL behaviour after deletion (HTTP 404 vs a
    tombstone/claim page). No in-repo default exists (Original to Ditto, gaps
    #2/#3/#7). The companion UX spec (`-ux.md` §8 Q5) cannot write the deletion
    confirmation copy until the Architect supplies these numbers/behaviour — this
    is a hard dependency, not just a fork.

---

## 18. Source Index (provenance — every pattern traced)

| Pattern / fact | Source (project + path) |
|---|---|
| `stepRunId` wrapper-run canonical impl | Ditto · `packages/web/app/api/v1/network/search/route.ts` L59–61,114–116,125–129,166–168,183–187 |
| Network-lane step minter + guard | Ditto · `src/engine/network-step-run.ts` L28–69 |
| Proposal-text private scrub | Ditto · `src/engine/connection-proposal.ts` L92,98–101,104–120,183–185,265 |
| Recursive credential-value scrub | Ditto · `src/engine/integration-handlers/scrub.ts` L37–94 (`secretsFromAuthEnv` convenience extractor L100–108) |
| Three domain audit tables | Ditto · `packages/core/src/db/network/schema.ts` L504–522,763–789,922–946 |
| Scrub-decision-in-audit precedent | Ditto · `packages/core/src/db/network/schema.ts` L874,936 |
| Visitor rate limiter (in-memory, documented single-instance) | Ditto · `src/engine/visitor-rate-limit.ts` (full) |
| Turnstile bot gate | Ditto · `src/engine/turnstile.ts` (full) |
| Block list (Brief 261) | Ditto · `packages/core/src/db/network/schema.ts` L1012–1036 |
| Circuit-breaker state precedent | Ditto · `packages/core/src/db/network/schema.ts` L1161,1168 (`upgradeHistory`) |
| Spend-ceiling threshold halt | Ditto · `src/engine/spend-ceiling.ts` |
| Admin token auth + `requireAdmin` | Ditto · `src/engine/network-api-auth.ts` L50–96,125–151 |
| Admin deployment-mode gate | Ditto · `packages/web/app/admin/layout.tsx`; `app/api/v1/network/admin/*` |
| Opt-out precedent | Ditto · `src/engine/...`; `packages/web/app/api/v1/network/people/[id]/opt-out/route.ts`; schema L365 |
| Durable delivery outbox | Ditto · `packages/core/src/db/network/schema.ts` L1054–1076 (Insight-234) |
| Idempotent fire-once table shape | Ditto · `packages/core/src/db/network/schema.ts` L1038–1052 (`networkSessionUpsellLog`) |
| Soft-revoke / soft-terminal precedent | Ditto · `src/engine/network-api-auth.ts` `revokeToken()`; `managedWorkspaces.deprovisionedAt` |
| Migration journal (next idx 9, Network tier) | Ditto · `drizzle/network/meta/_journal.json` |
| Platform-ToS-in-code precedent | Ditto · `docs/adrs/029-x-api-and-social-publishing.md` |
| Tier separation / no cross-join | Ditto · `docs/adrs/036-database-tier-strategy.md`, ADR-048, ADR-025 |
| `stepRunId` guard / no self-HTTP / wrapper run | Ditto · Insight-180, Insight-211, Insight-232 |
| Durable cross-deployment delivery | Ditto · Insight-234 |
| Trust-signal three-level disclosure | Ditto · Insight-127 |
| Filesystem legibility / PII-not-projected | Ditto · Insight-201, Insight-087 |
| Boundary by transport not filter | Ditto · Insight-235 |
| Migration journal idx sequencing | Ditto · Insight-190 |
| AgentMail send/reply `headers: Record<string,string>` (RFC 8058 injectable) — verified §17 Q5 | Ditto dep · `agentmail@0.4.18` `dist/cjs/api/resources/messages/types/SendMessageRequest.d.ts`, `SendMessageHeaders.d.ts`, `ReplyToMessageRequest.d.ts` |
| AgentMail webhook `EventType` set incl. `message.complained` + typed `Complaint` | Ditto dep · `agentmail@0.4.18` `dist/cjs/api/resources/events/types/EventType.d.ts`, `MessageComplainedEvent.d.ts`, `Complaint.d.ts` |
| AgentMail adapter send/reply (no `headers` passed today — the extension point) | Ditto · `src/engine/channel.ts` L342–364 |
| Svix-signed AgentMail webhook already verified in-app | Ditto · `packages/web/app/api/v1/network/inbound/route.ts` (`svix` `Webhook`, `AGENTMAIL_WEBHOOK_SECRET`) |
| CAN-SPAM (16 CFR Part 316, primary-purpose §316.3) | External standard (FTC) |
| RFC 2369 / RFC 8058 one-click List-Unsubscribe | External standard (IETF) |
| Gmail/Yahoo bulk-sender rules (<0.3% complaint, Feb 2024) | External (Google/Yahoo postmaster) |
| ARF / FBL complaint format | External standard |
| GDPR Art 15/17/20; CCPA/CPRA 45-day; CA DELETE Act/DROP | External statute |
| RFC 9309 robots.txt | External standard (IETF) |
| hiQ v. LinkedIn; Meta v. Bright Data | External litigation context |
| OPA / Rego policy engine | External (`openpolicyagent.org`) — to add to landscape |
| `rate-limiter-flexible` / `@upstash/ratelimit` | External (npm) — to add to landscape |
| Circuit-breaker 3-state (CLOSED/OPEN/HALF-OPEN) | External pattern (Nygard / Fowler / AWS) |
| Rate-limit algorithm families | External pattern (fixed/sliding-log/sliding-counter/token-bucket/leaky-bucket) |
| Two-phase soft-delete / tombstone | External pattern |
| Tamper-evidence ladder (none→append-only→hash-chain→WORM) | External pattern |

---

*End of Research-278. Companion UX spec: `docs/research/278-trust-privacy-admin-ux.md`.
Next pipeline step after the mandatory Dev Reviewer loop: `/dev-architect`.*
