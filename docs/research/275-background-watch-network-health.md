# Research-275: Background Watch and Network Health — Technical Precursors

**Date:** 2026-05-19
**Brief:** `docs/briefs/275-background-watch-network-health.md`
**Role:** Dev Researcher (pipeline: follows `docs/research/275-background-watch-network-health-ux.md`)
**Status:** active
**Companion (UX):** `docs/research/275-background-watch-network-health-ux.md` + `docs/research/275-background-watch-network-health-ux-patterns.md`
**Consumers:** Dev Architect (to design the solution and refine the build brief)

> **Neutrality note (role contract):** This report describes what exists and
> what patterns are available. It does **not** rank options, recommend an
> approach, or evaluate trade-offs between competing options — that synthesis
> is the Architect's job. Pros/cons listed are factual properties, not
> judgements. Gaps with no existing solution are explicitly marked
> **Original to Ditto**.

---

## 1. Research Question

Brief 275 names **13 work products** (3 schema additions + migration, 1 cycle
YAML, 3 engine modules, 1 HTTP route, 2 new UI components, 2 modified UI
files, 1 tool-resolver modification) plus 18 acceptance criteria, 8 v1
network-health rules, and 4 watch types. The Builder needs to know, per work
product: **what can we build FROM?** (Principle 1 — composition over
invention; depend / adopt / pattern / Original-to-Ditto).

The brief constrains: "no new durable workflow engine if existing operating
cycle infrastructure suffices," "throttle with existing `notifyUser` rules,"
"use operating cycle shape." So the central question is internal-codebase-
first, with external-pattern surveys only for surfaces that are
demonstrably absent in-repo (per-user-timezone cron anchoring, cycle-control
magic links, cross-tier scheduler/runner topology).

**Cross-cutting human disposition (2026-05-19):** the cycle YAML
(`processes/cycles/network-background-watch.yaml`) **lives in the Network
repo** — not the workspace monorepo. This is a load-bearing topology fact
because (a) the existing `loadAllProcesses` scanner walks
`PROJECT_ROOT/processes/cycles/` in the **workspace** repo, and (b) the
existing `notifyUser` digest path imports `db` from the **workspace** SQLite
tier. §5 and §11 lay out the options this opens.

---

## 2. Constraint Inventory (what bounds every option below)

These prior decisions are stated factually as boundaries, not recommendations.
Every option in §6–§17 is presented within these boundaries.

| Constraint | Source | What it requires |
|---|---|---|
| `stepRunId` guard on every side-effecting engine tool | Insight-180 | Watch runner, watch tools, digest composer, route handlers all require `stepRunId`. |
| Engine must not call itself over HTTP to mint a run | Insight-211 | The watch runner cannot `fetch()` the watches route to get a `stepRunId`. |
| Audited HTTP-route wrapper step run; reject caller-supplied `stepRunId` including falsy values; reuse `src/engine/network-step-run.ts` | Insight-232 | The `/api/v1/network/watches/*` routes must mint a server-side network-lane wrapper run and 400 on any caller `stepRunId`. |
| Cross-deployment delivery = durable sender outbox + consumer pull-and-ack + idempotent ACK retry + terminal-state persistence (not in-memory SSE) | Insight-234 | Any cross-tier handoff between watch runner (Network) and digest delivery (workspace `notifyUser`) must use durable delivery, not SSE. |
| Boundary enforced by transport, not runtime filter | Insight-235 | "Watch cannot contact" must be enforced by the runner's tool set (no `compose_intro` / `send_claim_invite` in watch tools), not by a runtime filter on a privileged path. |
| Network/Workspace tier separation; no cross-boundary joins | ADR-036, ADR-048, ADR-025 | Watch schema is **Network-tier** (`packages/core/src/db/network/schema.ts` → `drizzle/network/`). Combine cross-tier in app code only. |
| Drizzle journal idx sequencing | Insight-190 | Network journal currently ends at idx 14 (`0014_intro_consent_state_machine`). Next idx is **15**; generate SQL + snapshot; resequence on merge conflict. |
| Brief 261 Hard Rule #5 — anti-persona never visible to non-owners | `docs/briefs/261-introductions-free-counter-workspace-upsell.md`; enforced in `connection-proposal.ts:104–120` | Digest emails, proposal-queue surface, and admin watch dashboards must never quote anti-persona text. |
| Brief 278 foundation gates apply (privacy scrubber, source-policy, suppression, email compliance) | Brief 275 Constraint | Watch can only emit proposals/digests/invitation candidates after passing Brief 278's checkpoint. |
| Brief 279 source policy + claim-before-public + LinkedIn URL-pointer-only | Brief 275 Constraint, Brief 279 | Watch can create Invitation Candidates but cannot bypass operator approval / source-policy / suppression. |
| No contact without consent | Brief 275 Constraint | Watch tool surface excludes any send/email/DM tool. Downstream `compose_intro` (Brief 276) and `send_claim_invite` (Brief 279) are the only outbound paths. |
| Throttle with existing `notifyUser` rules; no parallel notification path | Brief 275 Constraint | The digest cannot bypass `MAX_EMAILS_PER_USER_PER_DAY=5` / `MIN_MS_BETWEEN_NOTIFICATIONS=1h`. |
| Outcome quality beats activity | Brief 275 Constraint | Watch metrics must include accepted-proposal / intro-accepted / outcome — not raw proposal volume. |
| Cycle YAML lives in Network repo (not workspace monorepo) | Human disposition 2026-05-19 | §5 cross-tier topology must be resolved by the Architect. |

---

## 3. Existing Research / Landscape Touchpoints

- **Companion UX spec:** `docs/research/275-background-watch-network-health-ux.md`
  (Designer's interaction spec — surfaces A–H + B′, D-Q1–D-Q8 open questions, three-state dismiss, auto-pause N=3).
- **Companion UX pattern survey:** `docs/research/275-background-watch-network-health-ux-patterns.md`
  (LinkedIn Job Alerts; Zillow/Redfin saved searches; Apple News / Substack /
  Discover Weekly digests; Notion / Linear / Zapier / Google Alerts criteria-
  based watching; Pinterest / Goodreads / Spotify "more/less like this";
  headhunter / buyer-agent posture). The user-facing pattern landscape is
  already mapped — this technical report references it where digest shape and
  three-state dismiss are concerned and does not re-survey those surfaces.
- **`docs/research/README.md`** — no prior report covers the technical layer
  of Background Watch. Adjacent reports:
  `docs/research/273-need-request-onboarding-manual-search-entry.md`
  (Active Request model — watch anchor),
  `docs/research/274-manual-search-connection-proposals.md` (Manual Search /
  Possible Connection — watch runner's search primitive),
  `docs/research/278-trust-privacy-admin.md` (privacy/admin foundation Brief
  275 depends on), `docs/research/279-outbound-discovery-claim-invites.md`
  (discovery / invitation candidate handoff). This report should be **added**
  to the index.
- **`docs/landscape.md`** — current relevant entries: AgentMail (depend
  level), Paperclip primitive catalog (mentions `routines+routine_triggers
  +routine_runs`, but Ditto already adopted its own equivalent in
  `pulse.ts` + `scheduler.ts` + `chain-executor.ts`). **No** entry exists
  for saved-search / alert / digest engines, per-user-timezone scheduling,
  or cross-tier scheduler topology. Landscape updates required by the
  Researcher contract are listed in §18.

---

## 4. Internal Precursor Inventory (per Brief 275 work product)

"Build FROM" vocabulary (Principle 1): **reuse** (call existing module
as-is), **extend** (add to existing module/table), **pattern** (study and
implement new), **Original to Ditto** (no in-repo precedent; external
pattern level only).

| Brief 275 work product | Closest existing precursor (source path) | Build-FROM |
|---|---|---|
| **Schema:** `network_background_watches` table | `networkJobRequests` (request lifecycle, schema L820+), `networkMemberSignals` (lifecycle + status enum, L668+), `schedules` (cron + lastRunAt + nextRunAt, workspace tier `src/db/schema.ts`); status enum precedent: `networkMemberSignalStatus` includes `"deleted"` (status-flag soft delete) | **pattern** (no existing "watch" table; lifecycle states ∈ active/paused/closed/fulfilled/error are new; shape mirrors `networkJobRequests`) |
| **Schema:** `network_watch_runs` | `networkSearchRuns` (L1029, append-only per-run audit with `stepRunId NOT NULL`, `actorId`, `partial` flag, `resultCount`); `processRuns` (workspace; status, started/completed, suspendState) | **pattern** (mirror `networkSearchRuns` shape; one row per watch tick) |
| **Schema:** `network_watch_proposals` | `networkPossibleConnections` (L840+ — already the proposal row; `searchRunId` FK, recommended/notRecommendedReason, scrubApplied) | **extend / reuse** (add `watchRunId` FK to `networkPossibleConnections` OR create thin proposal table joining to PC by id) |
| **Schema:** `network_watch_feedback` | `networkSearchFeedback` (L1091, kind enum already includes `"watch"` and `"invitation-candidate"`; `searchRunId` FK + `possibleConnectionId` FK + `metadata` JSON; missing `"not-now"`/`"wrong-person"` for Designer §14 three-state dismiss) | **extend** (add `watchId` FK; extend kind enum; OR reuse with metadata `{kind: "not-now"}`) |
| **Migration SQL:** `drizzle/network/0015_*_background_watch.sql` | Existing 14 Network migrations (`drizzle/network/0001*..0014_intro_consent_state_machine.sql`); generate via `drizzle-kit generate` then verify SQL + snapshot + journal idx 15 | **reuse** (standard drizzle-kit flow; idx 15) |
| **YAML:** `processes/cycles/network-background-watch.yaml` (Network repo) | `processes/cycles/network-connecting.yaml` (4 existing cycle YAMLs at `processes/cycles/`: `gtm-pipeline.yaml`, `network-connecting.yaml`, `relationship-nurture.yaml`, `sales-marketing.yaml`); archetype: sense → assess → act → gate → land → learn → brief | **pattern** + **Original to Ditto** for deployment topology (§5) |
| **Engine:** `src/engine/network-background-watch.ts` (runner) | `src/engine/relationship-pulse.ts:355–490` (per-user iteration loop, `shouldReach` suppression L443–446, recency-anchored MIN_MS check L407–414); `src/engine/network-manual-search.ts:142` (`runNetworkSearch` already accepts injectable `matchFn`/`scoutFn`, `health: Record<string, NetworkHealthSignal>`, non-chat callers — §6); `src/engine/pulse.ts:45–98` (tick shape, idempotent, fire-and-forget heartbeat) | **extend `runNetworkSearch`** + **pattern (relationship-pulse iteration)** |
| **Engine:** `src/engine/network-health.ts` (evaluator) | `src/engine/connection-proposal.ts:70–76` (`NetworkHealthSignal` interface — 4 of 8 v1 rules already flagged; §7), `:154–157` (stale-source 30-day check), `:224–233` (`notRecommendedReason` population for blocked/antiPersonaRisk/highDemand/recentlyContacted); `src/engine/network-abuse-controls.ts:117–127` (`"network-watch": 12/hour` policy pre-configured), `:371` (`isNetworkOperationPaused` — source/segment/person-ref suppression check) | **extend** (4 of 8 rules already wired; 4 missing — §7) |
| **Engine:** `src/engine/network-watch-digest.ts` (digest composer) | `src/engine/relationship-pulse.ts:441–446` (LLM `shouldReach` suppression precedent — *if nothing to say, skip send*); `src/engine/status-composer.ts` (composer-level empty-state suppression — pattern); `src/engine/notify-user.ts:217` (`notifyUser()` channel-agnostic entry point; §8); `src/engine/channel.ts:281` (`textToHtmlWithBlocks`), `:236` (`formatEmailBody`), `:1027` (`MAX_OUTREACH_PER_PERSON_PER_DAY=3`) | **extend `notifyUser`** (4 gaps — §8) + **Original to Ditto** for `renderPossibleConnectionCardHtml()` |
| **Engine:** `src/engine/tool-resolver.ts` (register guarded watch tools) | Existing tool-resolver entries for `runNetworkSearch`, `compose_intro`, etc. — pattern: every tool name maps to an engine module that calls `requireNetworkStepRunId` first; tool list is **the** transport boundary (Insight-235) | **reuse / extend** (add `watch_create`, `watch_pause`, `watch_resume`, `watch_close`, `watch_refine`, `watch_propose`; exclude any send/contact tool) |
| **Route:** `packages/web/app/api/v1/network/watches/route.ts` | `packages/web/app/api/v1/network/search/route.ts` (canonical wrapper-run route — Insight-232; `hasCallerStepRun(body)` L59–61, reject L114–116, mint L125–129, pass into engine L153); `src/engine/network-step-run.ts:104` (`createNetworkLaneStepRun({ route, sessionId, actorId })`); precedent breadth — `scout/route.ts`, `intros/route.ts`, `people/[id]/intro-request/route.ts` already mint wrappers | **reuse** (canonical wrapper-run pattern) |
| **UI:** `packages/web/components/network/watch-status.tsx` | `packages/web/components/network/possible-connection-card.tsx` (a card with disclosure-controlled detail — closest shape); `packages/web/app/admin/fleet/page.tsx` (operational-status surface — closest semantic) | **pattern** (no exact watch-status precursor) |
| **UI:** `packages/web/components/network/watch-proposal-queue.tsx` | `packages/web/components/network/search-results-panel.tsx` (queue of Possible Connection cards, sortable, with feedback actions — closest shape); `packages/web/components/network/possible-connection-card.tsx` (the card the queue lists); Designer spec §14 names the three feedback kinds (Save / Not now / Wrong person + "less like this" sub-reasons) | **reuse + extend** (queue shape + new three-state dismiss UI) |
| **UI mod:** `packages/web/app/network/chat/client-card-actions.tsx` | The file already exists; Brief 275 adds a "Keep watching" action that creates a watch (modify add a watch-create handler that calls the new route) | **extend** |
| **UI mod:** `packages/web/app/network/chat/expert-card-actions.tsx` | The file already exists; Brief 275 adds a "Find me opportunities" action that creates a member-signal watch (modify same shape) | **extend** |

---

## 5. The Cycle-YAML Cross-Tier Deployment Question

**Fact (human disposition 2026-05-19):** `processes/cycles/network-background-
watch.yaml` lives in the Network repo, not the workspace monorepo.

**Fact (current code):** the only YAML loader that runs at boot is
`packages/web/instrumentation.ts:123–135`:
```ts
const processDir = path.join(PROJECT_ROOT, "processes");
const templateDir = path.join(PROJECT_ROOT, "processes", "templates");
const cycleDir = path.join(PROJECT_ROOT, "processes", "cycles");
const definitions = loadAllProcesses(processDir, templateDir, cycleDir);
await syncProcessesToDb(definitions);
```
`PROJECT_ROOT` resolves to the workspace monorepo root. The 4 existing cycle
YAMLs (`gtm-pipeline`, `network-connecting`, `relationship-nurture`,
`sales-marketing`) all live there.

**Fact (current deployment shape):** `instrumentation.ts:99–109` gates
`ensureNetworkSchema()` on `DITTO_DEPLOYMENT === "public"` (Network Service
deployment) but `scheduler.start()` (L137–145) and `startPulse()`
(L147–156) run **unconditionally** in `packages/web`, regardless of
deployment mode. So the cron scheduler + pulse already run on both the
Network Service deployment (ditto.partners) and per-user workspace
deployments (ditto.you/*).

**Options surface (factual properties only — Architect chooses):**

- **(a) Load the YAML from the Network repo on the Network deployment.**
  Mirror the loader to a Network-tier directory (e.g. `network/cycles/`) and
  conditionally invoke a second `loadAllProcesses` call when
  `DITTO_DEPLOYMENT === "public"`. The runner executes inside the Network
  Service deployment.
  - *Properties:* runner co-located with Network DB; YAML lives where the
    human said it lives; new loader path to maintain; `schedules`/
    `processRuns`/`stepRuns` tables are workspace-tier, so the runner needs
    a Network-tier mirror (or the runner writes to workspace tables, which
    contradicts tier separation).

- **(b) Watch runner runs in the workspace deployment; YAML symlinked or
  copied into the workspace monorepo at build time.**
  - *Properties:* no new loader; reuses every existing runner primitive
    (`pulse.ts`, `scheduler.ts`, `chain-executor.ts`, `heartbeat.ts`);
    contradicts the "YAML in Network repo" disposition unless symlink/copy
    counts as compliant; cross-tier read pattern: workspace-tier runner
    reads Network-tier DB (already done by Brief 274 search routes).

- **(c) Cycle definition stored in DB (`processes` table), not in YAML on
  disk.** Existing precedent: `syncProcessesToDb` already projects YAML
  definitions into the `processes` table; the runner reads from DB. A
  Network-deployment migration could seed the watch cycle definition
  directly.
  - *Properties:* removes the file-loader question entirely; loses the
    legibility of a YAML file in the repo; DB-as-source-of-truth contradicts
    the existing "YAML is the source, DB is a projection" pattern.

- **(d) Per-user watch cycle is *not* a process YAML at all — it's a
  per-user row in `network_background_watches` with a `nextRunAt` column,
  evaluated by a single sweep cron.** Precedent: `pulse.ts:104–172`
  already scans `delayedRuns WHERE executeAt <= now AND status='pending'`
  on each tick — same sweep shape applied to `network_background_watches
  WHERE nextRunAt <= now AND status='active'`.
  - *Properties:* fits naturally into the per-watch lifecycle in the schema;
    no per-user YAML; the YAML in the Network repo would describe the
    *generic* cycle steps (sense→assess→act→gate→land→learn→brief), and
    each row in the watches table is an instance. Closest existing model:
    `relationship-pulse.ts:380` (`for (const user of users)` per-user loop
    on a single sweep).

The Designer companion spec §22 D-Q1 ("quiet-week default — suppress
digest") and the brief's "Default cap 3" / "Sense→...→Brief archetype" both
admit either option (c) or option (d) shape.

---

## 6. Watch Runner — Options

The runner answers: every N (default: weekly) per-watch, fan out
sense/assess/act/gate/land/learn/brief; respect health rules; cap
proposals; emit digest.

### 6a. Per-watch evaluation primitive — extend `runNetworkSearch`

`src/engine/network-manual-search.ts:142` — `runNetworkSearch(input:
NetworkManualSearchInput)`. The input already accepts:
- `stepRunId` (required, rejectWebDirect L146–150)
- `userId`, `actorId`, `sessionId`, `visitorSessionId`
- `jobRequestCard` (the watch's Active-Request anchor) **or** a raw `query`
- `mode` / `sourcesAllowed` (member / public-web / both)
- `requestId` / `memberSignalId` (the anchor FK)
- `refinement`, `geography`, `proofRequired`
- `health: Record<string, NetworkHealthSignal>` (§7)
- `consentFoundationAvailable` (currently false; flipped by Brief 276)
- `sampleLimit`, `matchFn`, `scoutFn` (injectable for non-chat callers)
- `db` (injectable for cross-tier callers)

Output: `searchRunId`, `mode`, `query`, `webSearchAvailable`, `partial`,
`scrubApplied`, `connections: PersistedPossibleConnection[]`.

*Properties:* the function already supports non-chat callers (`matchFn`/
`scoutFn` injection); already requires `stepRunId`; already writes to
`networkSearchRuns` and `networkPossibleConnections`; already applies
`scrubProposalText` (Brief 261 Hard Rule #5); already filters prior
`"hide"`/`"not-a-fit"` feedback.

*Gap:* the runner needs to additionally:
1. Apply the 8-rule network-health evaluator (§7) before proposals reach
   the user (4 of 8 rules already wired via `NetworkHealthSignal`).
2. Cap proposals at the watch's `cap` setting (default 3) **after** scrub
   and ranking — `runNetworkSearch` currently slices at `MAX_RESULTS`
   (line 222), which is a search-side hard cap.
3. Hand off non-member candidates to Brief 279's `networkInvitationCandidates`
   row (the `watchId` FK column already exists at schema L1304; index L1348).
4. Emit a digest object (not a full search result page) for `notifyUser`
   pipeline (§8).
5. Record per-rule suppression decisions to a watch-audit row (§14).

### 6b. Per-watch iteration loop — pattern `relationship-pulse.ts`

`src/engine/relationship-pulse.ts:355–490` is the closest existing
per-entity-iteration shape:
```ts
const users = await db.select().from(schema.networkUsers)
  .where(inArray(schema.networkUsers.status, ["active", "workspace"]));
for (const user of users) {
  // skip if paused / no person / status sent this tick / too recent
  // build snapshot
  // composeProactiveMessage()
  // if !decision.shouldReach → skip (empty-state suppression precedent)
  // else notifyUser()
}
```
*Properties:* per-user loop, recency anchor (`lastNotifiedAt`), pause
respect (`pausedAt`), LLM-decides-silence pattern (`shouldReach=false →
skip`), errors non-fatal. The watch runner can mirror this exactly,
substituting `network_background_watches WHERE status='active'` for the
user query.

### 6c. Tick shape — pattern `pulse.ts:45–98`

The pulse tick is the existing cadence primitive. Properties: idempotent
(`pulseRunning` guard L51–54), fire-and-forget heartbeat (L150–155),
non-blocking pulse, errors caught (L91), uses `node-cron` with a default
5-minute interval (`PULSE_INTERVAL_MS=300000` L33). The watch runner could
either: (i) run as a separate scheduled cron, (ii) be a fourth step in
`pulseTick()` after smoke tests, or (iii) be a cycle YAML with its own
schedule trigger (the existing 4 cycle YAMLs use `trigger.type=schedule
cron=...` — e.g. `network-connecting.yaml` line 23: `"0 9 * * 1,4"`).

### 6d. Manual run / "Run now" — reuse `scheduler.triggerManually`

`src/engine/scheduler.ts:140–172` — `triggerManually(processSlug)` already
exists. Properties: bypasses cron timing; respects overlap-check via
`checkActiveRun(processId)` (L223–236); updates `schedules.lastRunAt`
(L160–163); creates a process run via `startProcessRun(slug, {},
"schedule")` (L165); fires heartbeat fire-and-forget (L167–169). The
Designer spec §22 D-Q2 ceiling (≤1 run/4h per watch) **is not enforced
here** — `triggerManually` only checks active-run overlap, not cooldown.
A cooldown gate would be additional logic in the watch route.

### 6e. Trust tier for the runner — pattern existing cycles

`network-connecting.yaml` uses `trustOverride: autonomous` on sense/learn/
brief steps and `trustOverride: critical` on the gate step. Brief 275
default tier should follow this shape: autonomous on sense/score/gate-
prepare, critical on any operator-review-queue write (Invitation
Candidate scoring).

---

## 7. Network Health Evaluator — Options

Brief 275 lists **8 v1 rules**:
1. Suppress if target has explicit block for requester/domain.
2. Suppress if target anti-persona strongly matches.
3. Suppress if target asked about too many intros recently.
4. Suppress if requester has too many outstanding asks.
5. Suppress duplicate pair/request proposals inside cooldown window.
6. Downgrade if evidence is stale or weak.
7. Queue for human/operator review if commercial sensitivity is high.
8. Do not propose if confidence is low unless user asked for broad exploration.

### 7a. What already exists in `NetworkHealthSignal`

`src/engine/connection-proposal.ts:70–76`:
```ts
export interface NetworkHealthSignal {
  highDemand?: boolean;
  recentlyContacted?: boolean;
  blocked?: boolean;
  antiPersonaRisk?: boolean;
}
```
Maps to brief rules:
- Rule 1 ↔ `blocked` (precedent: `networkUserBlockList`, schema L1647)
- Rule 2 ↔ `antiPersonaRisk` (precedent: `networkUserAntiPersona`, schema L790)
- Rule 3 ↔ `highDemand` (precedent: existing target-side counter)
- Rule 5 (partial) ↔ `recentlyContacted` (precedent: `lastNotifiedAt`,
  `interactions` scan in `notifyUser.checkEmailThrottle` L140–186)

### 7b. What does not exist in the interface

Rules **3 (over-contact threshold), 4 (requester over-asking), 5 (duplicate
pair/request cooldown), 6 (stale evidence — partially at L154–157), 7
(commercial sensitivity review), 8 (low confidence)** either lack a flag
or lack a configurable threshold.

*Internal precedents available:*
- **Over-contact threshold (rule 3):** `notify-user.ts:39` `MAX_EMAILS_
  PER_USER_PER_DAY=5`; `channel.ts:1027` `MAX_OUTREACH_PER_PERSON_
  PER_DAY=3`; Brief 261's `introductionRefusalReasonValues` includes
  `"rate-limit"` (>5/60min trigger).
- **Requester over-asking (rule 4):** no existing per-requester counter
  on outstanding watch proposals; `networkRateCounters` table (schema
  L1561) and `network-abuse-controls.ts:117–127` `"network-watch":
  12/hour` policy can be repurposed; per-call `policy` override accepted.
- **Duplicate cooldown (rule 5):** `loadSuppressedKeys` in
  `network-manual-search.ts:307` already filters prior `"hide"`/`"not-a-
  fit"` proposals by `proposalKey`; cooldown by `(actorId, proposalKey)`
  with a time bound is a thin extension. `networkSearchFeedback` already
  has `searchRunId`, `possibleConnectionId`, `kind`, `createdAt` — enough
  to write the query without schema changes.
- **Stale evidence (rule 6):** `connection-proposal.ts:154–157` — 30-day
  threshold on `candidate.computedAt` already emits a stale-source risk.
  The downgrade currently is "add to `risks[]`," not "downgrade
  confidence." `downgrade(base)` function at L161–164 exists and is wired
  for `notRecommendedReason` population, not for stale.
- **Commercial sensitivity (rule 7):** no existing flag; nearest precedent
  is `networkSignalClaims.visibility ∈ public/on-request/private/hidden`
  (schema L740–743) — `on-request` is the existing "ask the owner before
  exposing" surface.
- **Low confidence (rule 8):** `networkPossibleConnections.confidence ∈
  high/medium/low` exists. Brief 275 needs a configurable floor per-watch
  (Designer spec: "broad exploration" mode lets low-confidence through).

### 7c. Options for the interface extension

- **(α) Add four optional flags** to `NetworkHealthSignal`: `overContact?`,
  `requesterOverAsking?`, `duplicateCooldown?`, `staleEvidence?`,
  `pendingCommercialReview?`. *Properties:* mirrors existing boolean
  shape; no breaking change; rules become symmetric.
- **(β) Replace the interface with a structured score object** with
  per-rule outcomes and reason strings. *Properties:* richer audit row;
  breaks every existing call site (rare — `runNetworkSearch` is the only
  consumer); supports per-rule operator review.
- **(γ) Keep the interface, add a sibling structure** (`NetworkHealth
  Decision`) for the new rules. *Properties:* old surface untouched;
  two surfaces for one concept.

### 7d. Health-evaluator side-effect status

The brief states the evaluator persists "suppression/downgrade decision"
audit rows. That makes the evaluator a **side-effecting tool** under
Insight-180 → must take `stepRunId`. The brief's seam matrix line 90
confirms: "Required when persisting a decision; source inputs audited."

---

## 8. Digest Composer — Options

The digest is the user-facing artifact of a watch run. Brief 275 names
"`network-watch-digest.ts` — digest/proposal email composition," AC #11
("route through `notifyUser` or the existing channel resolver"), AC #12
("Digest caps proposals by default and respects existing notification
throttles").

### 8a. Composer shape — pattern `relationship-pulse.ts`

The empty-state pattern is the load-bearing one. Precedent:
`relationship-pulse.ts:443–446`:
```ts
if (!decision.shouldReach || !decision.subject || !decision.body) {
  result.skipped++;
  result.details.push({ userId: user.id, action: "skipped_llm_silent" });
  continue;
}
```
*Property:* the composer can decide to **not send** based on content; the
caller does not need a separate "should-send" gate. The digest composer
can adopt this exactly: if `proposals.filter(p => p.recommended).length
=== 0` AND watch frequency is "quiet," skip the send entirely (Designer
D-Q1).

### 8b. Channel pipeline — `notifyUser` extension points

`src/engine/notify-user.ts:217` is the channel-agnostic entry. Properties
in §3 of the file header: "Every outbound communication from Alex to a
user goes through this function. No module should call sendAndRecord()
directly for user notifications — use notifyUser() instead."

`UserNotification` interface (L52–79):
- `userId, personId, subject, body` (required)
- `personaId? = "alex" | "mira"`
- `mode? = "selling" | "connecting" | "nurture"`
- `inReplyToMessageId?`, `includeOptOut?`, `urgent?` (bypasses throttle)
- `reviewPageUrl?` (Brief 106 — adds "View details →" link)
- `htmlBlocks?: string[]` (Brief 149 AC18 — pre-rendered HTML spliced
  in via `channel.ts:281` `textToHtmlWithBlocks`)

**Gaps for Brief 275:**

1. **No `stepRunId` field on `UserNotification`.** Insight-180 requires
   `stepRunId` on side-effecting calls. The digest send is a side effect;
   `notifyUser` writes interaction rows + sends email. *Option:* add
   `stepRunId` to the interface; thread through the throttle check and
   the channel adapter.
2. **No compliance gate.** `network-email-compliance.ts`'s `classifyAndPrepare`
   (called from `claim-invite.ts` and `network-scout.ts`) is **not** in
   `notifyUser`'s path. Brief 275 inherits Brief 278's compliance
   requirement (suppression check, RFC 8058 unsubscribe, CAN-SPAM footer,
   misleading-subject). *Option:* wrap or insert a compliance call before
   the throttle check.
3. **No suppression gate.** `network-suppression.ts:235` `isSuppressed`
   is similarly not called. Same wrap option applies.
4. **No digest cap.** The throttle is per-email, not per-content-bundle.
   The Designer spec specifies "default cap 3 proposals per digest" —
   composer-side enforcement, not throttle-side.
5. **Workspace SQLite import.** `notify-user.ts:23` imports `{ db, schema
   } from "../db"` (workspace tier). If the watch runner runs on the
   Network deployment (§5 option a), `notifyUser` is not callable
   directly without porting or cross-tier delivery.

### 8c. Email body pipeline — reuse `channel.ts`

`src/engine/channel.ts:236` `formatEmailBody(message, htmlBlocks?)`
appends a magic link as "Continue in chat" (L265–268 — via
`getMagicLinkForEmail` L368); L281 `textToHtmlWithBlocks(text, html
Blocks)` splices pre-rendered HTML after the text body. *Property:* the
HTML splicing pipeline already exists; Brief 275 only needs to produce
the HTML for proposals.

### 8d. PossibleConnectionCard HTML rendering — Original to Ditto

`packages/web/components/network/possible-connection-card.tsx` is the
canonical React component (also referenced in `search-results-panel.tsx`,
`suggested-candidates-panel.tsx`). Properties: browser-only (React JSX,
Tailwind classes). No `renderToString`/`renderHtml`/`HtmlBlock`
equivalent exists in `src/engine/` (`Grep renderHtml|renderToHtml|toHtml
\(|HtmlBlock` returns 0 hits across `src/engine`). The digest needs a
*server-renderable* HTML version of the proposal card.

*External pattern level (no library adoption required):*
- `react-dom/server` `renderToStaticMarkup` — server-render React
  components to a static HTML string; existing `react-dom` dependency.
- MJML — purpose-built email markup framework with React bindings; not
  in current `package.json`.
- Plain template literal — write `renderPossibleConnectionCardHtml()` by
  hand, mirroring the JSX structure.

This is **Original to Ditto** at the implementation level. The Architect
chooses the rendering primitive.

### 8e. Magic link "Continue in chat" vs cycle-control tokens — Original to Ditto

`src/engine/magic-link.ts:368` `getMagicLinkForEmail(email)` is the
current pattern. Properties: 24h expiry; single-use; links to
`/chat/auth?token=TOKEN`. *Gap:* the Designer spec specifies that the
digest must offer Pause / Refine / Close actions inline (or via a
one-click link). The single "Continue in chat" link does not cover
per-watch state mutation.

*Options:*
- **(a) Cycle-control tokens:** a new hashed-token surface (mirror
  `networkTokens` shape) keyed to `(watchId, action ∈ pause|refine|close)`,
  single-use, signed.
- **(b) Render review-page URL only:** every digest sends the user to
  `/network/watches/[id]` via `reviewPageUrl` and the actions happen
  there. Brief 106 already wired `reviewPageUrl`. *Property:* no new
  token primitive; one extra tap on mobile.
- **(c) Hybrid:** action buttons render `reviewPageUrl?action=pause`
  query-string flags; the watches page reads them on load.

---

## 9. Watch Lifecycle State — Options

States ∈ `active / paused / closed / fulfilled / error` (brief AC #3).

### 9a. Pause / resume precedents

- **User-level pause:** `src/engine/admin-oversight.ts:290–308`
  `pauseUserProcesses(userId, adminId)` sets `networkUsers.pausedAt`;
  `:315–332` `resumeUserProcesses()` clears it; `:443–451`
  `isUserPaused()` reads it. Used by admin only.
- **Cycle-instance pause:** `src/engine/self-tools/cycle-tools.ts:318–336`
  `handlePauseCycle()` sets `processRuns.status = "paused"`; `:348–416`
  `handleResumeCycle()` sets back to `"running"`; `:114–268`
  `handleActivateCycle()` uses `setImmediate(() => fullHeartbeat(runId))`.

### 9b. Auto-pause on N failures — Original to Ditto

Designer D-Q5: threshold N=3 (configurable). No existing in-repo
auto-pause precedent. Closest shape: `circuitBreakerStateValues`
(`packages/core/src/db/network/schema.ts:1161+` — CLOSED/OPEN/HALF-OPEN)
exists for the upgrade pipeline (Brief 282 territory); not wired to
watches.

*External pattern level:* classic circuit-breaker — count consecutive
failures, open at N, half-open after cooldown, close on success. The
brief states "Failed watch runs are visible to admins/operators and do
not spam users" (AC #15) — auto-pause + admin alert is the simplest
fit.

### 9c. Closed / Fulfilled vs Active

The Designer spec §22 D-Q7 ("Mark Fulfilled outcome schema") names
fulfillment outcomes (intro accepted; outcome reported; user marked done).
Closed is user-initiated; fulfilled is system-detected or
user-confirmed. *No existing precedent* for fulfillment detection beyond
manual Mark-Fulfilled.

---

## 10. Three-State Dismiss + Feedback Enum — Options

Designer §14 specifies three-state dismiss: **Save proposal / Not now /
Wrong person** (plus "Less like this" sub-reasons).

### 10a. Current feedback enum

`packages/core/src/db/network/schema.ts:296–306`:
```ts
export const networkSearchFeedbackKindValues = [
  "refine",
  "not-a-fit",
  "save",
  "intro-request",
  "hide",
  "watch",
  "invitation-candidate",
] as const;
```
**Has:** `"save"` (≈ Designer "Save proposal"), `"not-a-fit"` (≈ Designer
"Wrong person" — semantically close), `"hide"` (per-search dismissal),
`"refine"`, `"watch"`, `"invitation-candidate"`, `"intro-request"`.

**Missing for Designer §14:** explicit `"not-now"` (defer without
penalising future fit), `"wrong-person"` (different from "not-a-fit"
which implies the proposal itself was poor).

### 10b. Options for representing the three-state dismiss

- **(a) Extend the enum** to add `"not-now"` and `"wrong-person"`.
  *Property:* clean; new migration adds enum values; consumers can
  switch on kind directly.
- **(b) Reuse `"not-a-fit"` + `"hide"` with `metadata.dismissKind`
  field.** *Property:* no enum change; relies on convention; admin/audit
  queries must JSON-decode metadata.
- **(c) Map Designer's three states onto two enum values:** Save →
  `"save"`; Not now → `"hide"`; Wrong person → `"not-a-fit"`.
  *Property:* loses the "Not now" vs "Wrong person" distinction in audit
  trail; simplest schema.

### 10c. Feedback applied to ranking

`network-manual-search.ts:307–...` `loadSuppressedKeys` reads only
`"hide"` and `"not-a-fit"` kinds and applies them to subsequent searches
in the same request scope. Brief 275 needs the same effect to **flow
into the next watch run** — same actor, same anchor, new tick. Either
extend `loadSuppressedKeys` to accept a watchId scope or write a sibling
function.

---

## 11. Discovery / Invitation Candidate Handoff (Brief 279 Path)

Brief 275 AC #10: "Watch can create Invitation Candidates for high-fit
non-members but cannot invite/contact them outside Brief 279's approved
path."

### 11a. Schema already wired

`packages/core/src/db/network/schema.ts:1294` `networkInvitationCandidates`
already has a **nullable `watchId` column** (L1304) and an index
`network_invitation_candidates_watch_id` (L1348). The shape supports
watch-originated candidates today.

### 11b. Upstream prerequisite: discovery profile

`networkInvitationCandidates.discoveryProfileId` is non-nullable (L1298–
1300). So a watch can only create an invitation candidate **after**
creating or finding a `networkDiscoveredProfiles` row. Brief 279 owns
that creation path. *Property:* the watch runner cannot bypass Brief
279's source-policy gate (`discovery-source-policy.ts` per Brief 278/
279) — every `networkDiscoveredProfiles` insert is gated at collect/
store/invite-use.

### 11c. Watch tool must not call invite tools

Brief 275 Hard Rule: "Watch never contacts a third party" (AC #9).
Enforced at the transport boundary (Insight-235) — the watch's
`tool-resolver.ts` entry list **excludes** `send_claim_invite`,
`compose_intro`, and any other outbound contact tool. The runner
produces the queue row only; an operator (or in v1, the brief's
operator-approval flow) advances it.

### 11d. Operator review queue

`networkInvitationCandidates.status` enum includes operator states
(default `"queued"`); fields `operatorApprovedAt` / `operatorApprovedBy`
(L1334–1335); `sentAt` (L1336) is the post-approval send timestamp. The
queue surface is shared with Brief 279.

---

## 12. Per-User Timezone Cron Anchoring — Options

Designer D-Q3: "Monday 9am user-local" is the default proposed cadence.
Existing cycle YAMLs use UTC cron (e.g. `network-connecting.yaml:23`
`cron: "0 9 * * 1,4"` — Monday/Thursday 9am **UTC**).

### 12a. What does not exist

- **No `timezone` column on `networkUsers`** — `Grep` confirms; the user
  table tracks `email, name, status, pausedAt, lastNotifiedAt,
  workspaceSuggestedAt`, etc., but not IANA timezone.
- **No per-row `nextRunAt` evaluation** that consults user timezone —
  `scheduler.ts:276` writes `task.getNextRun()` to `schedules.nextRunAt`
  in the cron's interpretation (UTC for `node-cron`).
- **No `cron-parser`-like per-row evaluator** in the codebase.

### 12b. External pattern level (no library adoption required)

- **Store IANA tz on the user** (`Intl.DateTimeFormat().resolvedOptions().
  timeZone` is the browser-side resolver — capture at onboarding). Storage
  shape: `networkUsers.timezone: text` (nullable, default `null`; fall
  back to UTC). *Pattern source:* every modern calendar product (Calendly,
  Cal.com, Google Calendar).
- **Per-row `nextRunAt` evaluator** that, given a base cron expression
  + user IANA tz + last-fire timestamp, computes the next user-local
  fire. Two implementation paths:
  - **Stdlib only:** `Intl.DateTimeFormat` to format a UTC instant in
    the user's tz, then back-compute the UTC of the next "Monday 9am
    local." Manual but adoptable.
  - **`Temporal` API (Stage 3 ECMAScript proposal, polyfill available):**
    `Temporal.ZonedDateTime` makes the math straightforward. No `Temporal`
    in current `package.json`.
- **Cron-in-UTC + runner-side filter:** the cron fires once an hour; the
  runner reads each watch's tz, computes whether the user is at the
  watch's `localFireHour` (default 9), and either runs or skips.
  *Property:* one cron expression for all watches; runner is the
  arbiter; mirrors Brief 178's hourly sweep shape (`scheduler.ts:109–
  122` — `cron.schedule("0 * * * *", ...)`).

This is **Original to Ditto** at the implementation level (no precedent
in repo).

### 12c. Daylight-saving and "Monday 9am" edge cases

- Spring-forward Sunday → Monday: a watch may be skipped if the cron
  evaluates strictly. The hourly-sweep + runner-filter pattern (option
  above) avoids this — the runner sees "user-local hour == 9" and
  fires.
- Travel: capturing tz at onboarding vs. per-session vs. user-editable
  is a UX question (Designer spec doesn't specify; flag as open).

---

## 13. Side-Effect Tools and HTTP Seam Matrix

Brief 275's Side-Effect/HTTP Seam Matrix (brief lines 84–93) names five
seams. The canonical wrapper-run pattern (Insight-232) applies:

### 13a. Reference implementation (already in repo)

`packages/web/app/api/v1/network/search/route.ts` is the canonical:
- `hasCallerStepRun(body)` — `Object.prototype.hasOwnProperty.call(body,
  "stepRunId")` (L59–61)
- Reject bypass: `if (hasCallerStepRun(body)) return 400 { error: "step_
  run_bypass_rejected" }` (L114–116, L166–168)
- Mint server-side: `const stepRunId = await createNetworkLaneStepRun({
  route, sessionId, actorId })` (L125–129, L183–187)
- Pass minted id into guarded engine call (L153, L198)

Precedent breadth: `scout/route.ts`, `intros/route.ts`, `people/[id]/
intro-request/route.ts` all mint wrappers. `/api/v1/network/watches/*`
copies the shape.

### 13b. Minter + guards (already in repo)

`src/engine/network-step-run.ts:104` `createNetworkLaneStepRun` —
generates `network-lane-step:<route>:<uuid>` (L111), `fs.appendFile`
JSONL to `data/network-kb/audit/network-lane-step-runs.jsonl` (L114–
124).

Guards:
- `requireNetworkStepRunId(stepRunId, operation, { rejectWebDirect
  })` (L85–102) — throws unless present (or `DITTO_TEST_MODE=true`);
  `rejectWebDirect` additionally refuses ids starting `web-direct-
  action:`.
- `requireServerMintedNetworkLaneStepRunId` (L74–82) — verifies the id
  exists in the JSONL provenance log.

### 13c. Reject-falsy-values requirement

Brief 275 line 92 explicitly requires the wrapper to reject "caller
`stepRunId`, including `null`, `""`, `0`, `false`." Current
`hasCallerStepRun` uses `hasOwnProperty` and so already rejects
falsy values that are present in the body (any presence triggers
the 400). Test surface: existing route tests in
`packages/web/app/api/v1/network/search/route.test.ts` already cover
this.

### 13d. Tool resolver — Insight-235 boundary

`src/engine/tool-resolver.ts` is the canonical tool-list registry. The
brief instruction: "register guarded watch tools if invoked by
agent/process." Watch tools to register (proposed names):
- `watch_create` — create a watch from a request/signal anchor
- `watch_pause` / `watch_resume` / `watch_close`
- `watch_refine` — update anchor or settings
- `watch_propose` — internal: write a proposal row + audit
- `watch_score_health` — internal: persist a health decision
- `watch_emit_digest` — internal: emit a digest to `notifyUser`

The tool list **excludes** `send_claim_invite`, `compose_intro`, and
any outbound contact tool. This is the boundary that enforces "no
contact without consent" per Insight-235 (transport, not runtime
filter).

---

## 14. Audit Event Classes — Options

`packages/core/src/db/network/schema.ts:419–458`
`networkAuditEventClassValues` already includes:
- `"watch_lifecycle_changed"` (L426) — covers create/pause/resume/close/
  fulfill
- `"watch_feedback"` (L443) — covers save/not-now/wrong-person

**Missing for Brief 275:**
- `"watch_run"` — append-only audit of each run tick (success/partial/
  error, proposal count, suppressions)
- `"watch_proposal"` — per-proposal audit (passed health, scrubApplied,
  pushed to digest)
- `"watch_paused_auto"` — when auto-pause threshold trips (separate from
  user-initiated pause)

*Options:*
- **(a) Add three new classes** to the enum. *Property:* one migration
  appending values; clean separation in admin viewer.
- **(b) Use existing classes with `metadata.subtype`.** *Property:* no
  enum change; convention-based; admin queries need JSON decode.

`networkAuditEvents` table already supports `prevHash` (tamper-evident
chain) and `stepRunId` linkage. Brief 275 inherits this audit table; no
new audit table needed.

---

## 15. Rate-Limit Policy — Options

### 15a. Existing policies

`src/engine/network-abuse-controls.ts:117–127`:
```ts
const DEFAULT_POLICIES: Record<NetworkRateLimitName, NetworkRateLimitPolicy> = {
  "network-search": { max: 20, windowMs: 60 * 60 * 1000 },
  "network-watch":  { max: 12, windowMs: 60 * 60 * 1000 },  // ← already configured
  "network-intro":  { max: 10, windowMs: 60 * 60 * 1000 },
  ...
};
```
`"network-watch"` is **pre-configured at 12/hour**. Brief 275 must
decide whether this means:
- 12 watch *runs* per hour (engine-side cadence)
- 12 watch *creates / route invocations* per hour (HTTP-side, anti-
  abuse)
- 12 watch *proposals* per hour (output cap — different concept)

### 15b. Per-call policy override

`checkRateLimit(input: CheckRateLimitInput)` (L229) accepts
`input.policy` — per-call override of `max`/`windowMs`. Properties:
fixed-window algorithm (L233 `cost = 1`; L235 `windowStart`); memory
L1 store + Postgres L2 fallback; bucket key `${limitName}:${actor.kind}
:${hashRateLimitActor(actor)}` (L162).

### 15c. Per-watch and per-target person rate limits

Brief 275 implies two additional rate dimensions not currently covered:
- **Per-watch cadence:** "run not more than 1× per 4h" (Designer D-Q2
  ceiling for "Run now") — *cooldown*, not fixed-window rate limit;
  applied at the watches route + `triggerManually` wrapper. Implementation:
  `network_background_watches.lastRunAt`-based check, not
  `network-abuse-controls.ts` extension.
- **Per-target person aggregate:** "target X has been proposed in 3
  watches this week — suppress further proposals" (rule 3 over-contact).
  *Implementation:* new query against `network_watch_proposals` (or
  reuse `networkPossibleConnections` + `networkSearchFeedback`).

---

## 16. UI Surfaces — Options

Designer spec §6 names surfaces A (Inline watch creation in chat), B
(`/network/watches/[id]` watch detail), B′ (multi-watch list at
`/network/watches`), C (Watch Status card in chat rail), D (Digest
email), E (Digest landing page), F (Refine modal), G (Pause/Close
confirm), H (Settings panel inside watch detail).

### 16a. Mostly-extension surfaces

- **A (chat-rail watch creation):** modify `client-card-actions.tsx` and
  `expert-card-actions.tsx` to call the new watches route. The card-
  action handlers already exist; only the action handler is new.
- **C (Watch Status card in chat rail):** mirror existing card shape;
  closest precedent `possible-connection-card.tsx`.
- **D (Digest email):** §8 — extend `notifyUser` + new HTML renderer.
- **F (Refine modal), G (Pause/Close confirm):** existing modal
  components in the network app (e.g. share/intro confirmation flows).

### 16b. New components

- **`watch-status.tsx`:** the "what's running" card — no exact precursor,
  but the disclosure pattern from `possible-connection-card.tsx` is the
  shape.
- **`watch-proposal-queue.tsx`:** the queue — `search-results-panel.tsx`
  is the closest shape; three-state dismiss action group is new (§10).

### 16c. Mobile-first constraint (Designer Persona Rob)

The Designer spec carries a 375px-wide one-thumb constraint for every
watch surface; the digest must parse on a lock-screen preview. No
codebase enforcement of mobile-first exists; this is design-level.

---

## 17. Open Questions for the Architect

Symmetric factual options are presented in §5–§16; the Architect picks
among them. The questions that require Architect synthesis are:

1. **§5 — Cycle YAML cross-tier topology.** Four options (a/b/c/d). The
   human disposition ("YAML in Network repo") narrows but does not fully
   resolve — option (d) "no per-user YAML, per-row evaluator" is consistent
   with the disposition because the YAML in the Network repo would
   describe the *generic* cycle, not per-user instances.
2. **§5 / §8 — Cross-tier `notifyUser`.** If the runner lives on Network
   deployment, does it: (i) call workspace `notifyUser` via a durable
   delivery primitive (Insight-234 outbox), (ii) get a Network-tier
   sibling of `notifyUser`, or (iii) the digest is composed Network-
   side and delivered via Brief 278's email-compliance path?
3. **§7 — `NetworkHealthSignal` extension shape.** Add four flags (α) vs.
   replace with structured score (β) vs. parallel structure (γ).
4. **§9 — Auto-pause threshold N and backoff.** Designer suggests N=3
   consecutive failures; brief is silent on backoff curve.
5. **§10 — Three-state dismiss representation.** Enum extension (a) vs.
   metadata convention (b) vs. collapsed mapping (c).
6. **§8 / §12 — Magic-link cycle-control tokens.** Cycle-control token
   primitive (a) vs. review-page redirect (b) vs. query-string action
   flag (c).
7. **§12 — Per-user timezone primitive.** Store IANA tz on `networkUsers`
   vs. infer per-watch vs. cron-in-UTC + runner-filter pattern.
8. **§8 — Digest HTML rendering.** `react-dom/server` `renderToStaticMarkup`
   vs. MJML adoption vs. hand-written template literal.
9. **§14 — Audit event class extension.** Add three new classes vs.
   `metadata.subtype` convention.
10. **§15 — Rate-limit semantics for `"network-watch": 12/hour`.** Runs
    vs. creates vs. proposals; brief doesn't disambiguate.
11. **§9 — Fulfillment detection.** User-only mark vs. system-detected
    via intro-accepted signal vs. hybrid.
12. **Designer D-Q1 through D-Q8** (companion UX spec §22) — most
    intersect with the items above; the Architect's brief synthesis must
    reconcile both lists.

---

## 18. Landscape Updates Required (Researcher contract)

Per Insight-043, the Researcher owns `docs/landscape.md` accuracy.
Findings from this report that warrant landscape updates:

- **No new external dependency adoption is required.** Every work
  product has an internal precursor or is solvable with stdlib/existing
  deps (`react-dom`, `Intl.DateTimeFormat`).
- **New landscape entry (informational):** "Saved Search / Alert /
  Digest Patterns" — note that the user-facing pattern survey lives in
  `docs/research/275-background-watch-network-health-ux-patterns.md`;
  the technical pattern (criteria-based filtering + scheduled
  evaluation + digest composition) is adopted in-house from the existing
  `runNetworkSearch` + `pulse.ts` + `notifyUser` primitives. No external
  library to depend on.
- **New landscape entry (informational):** "Per-User-Timezone
  Scheduling" — pattern-level entry noting (i) IANA tz capture via
  `Intl.DateTimeFormat`, (ii) `Temporal` API (Stage 3) as a future
  primitive, (iii) cron-in-UTC + runner-filter as the in-repo-consistent
  shape (mirrors `scheduler.ts:109` hourly-sweep precedent). No external
  library adoption proposed.
- **Cross-reference to add:** Brief 275 work products in §4 reference
  `runNetworkSearch` (Brief 274 territory). The existing 274 landscape
  context applies.

These updates are factual additions, not evaluations. The Documenter or
the Researcher updating landscape adds them after this report is
approved.

---

## 19. Reference Doc Status

| Doc | Status |
|---|---|
| `docs/architecture.md` | Checked — operating cycle archetype (sense→assess→act→gate→land→learn→brief) is the engine shape; no drift. `notifyUser` is named in the Layer-6 design section. No reference doc update needed for this report. |
| `docs/dictionary.md` | Checked — "Background Watch" (L1171) and "Network Health" (L1195) already defined; "Watch Proposal" not yet present and will be added on Brief 275 close-out (Documenter task, after build). |
| `docs/landscape.md` | Two informational entries to add (§18). Researcher contract: handle in the landscape-update commit, not in this report. |
| `docs/research/README.md` | Add this report to the index after approval. |
| `docs/research/275-background-watch-network-health-ux.md` | Companion (Designer spec) — read; cross-references in §3, §7, §8, §9, §10, §12, §17. |
| `docs/research/275-background-watch-network-health-ux-patterns.md` | Companion (Designer pattern survey) — referenced; the UX pattern landscape is **not** re-surveyed in this technical report (Insight-043: no duplication). |
| `docs/research/273-need-request-onboarding-manual-search-entry.md` | Adjacent (Active Request — watch anchor) — referenced. |
| `docs/research/274-manual-search-connection-proposals.md` | Adjacent (Manual Search — watch runner primitive) — referenced. |
| `docs/research/278-trust-privacy-admin.md` | Adjacent (foundation Brief 275 depends on) — referenced. |
| `docs/research/279-outbound-discovery-claim-invites.md` | Adjacent (invitation candidate handoff) — referenced. |

**Reference docs checked: no drift found.**

---

## 20. Source Index (provenance — every pattern traced)

| Pattern / fact | Source (project + path) |
|---|---|
| `stepRunId` wrapper-run canonical impl | Ditto · `packages/web/app/api/v1/network/search/route.ts` L59–61, L114–116, L125–129, L166–168, L183–187 |
| Network-lane step minter + guard | Ditto · `src/engine/network-step-run.ts` L74–82, L85–102, L104–126 |
| `runNetworkSearch` non-chat caller surface | Ditto · `src/engine/network-manual-search.ts` L142–245 |
| `NetworkHealthSignal` interface (4 of 8 rules wired) | Ditto · `src/engine/connection-proposal.ts` L70–76 |
| Proposal-text private scrub (Brief 261 Hard Rule #5) | Ditto · `src/engine/connection-proposal.ts` L92, L98–101, L104–120 |
| `notRecommendedReason` population for 4 health rules | Ditto · `src/engine/connection-proposal.ts` L224–233 |
| Stale-source 30-day risk | Ditto · `src/engine/connection-proposal.ts` L154–157 |
| `loadSuppressedKeys` (prior feedback into ranking) | Ditto · `src/engine/network-manual-search.ts` L307 (reads only `"hide"` / `"not-a-fit"`) |
| `notifyUser` channel-agnostic entry | Ditto · `src/engine/notify-user.ts` L52–79 (`UserNotification`), L217 (`notifyUser`) |
| `MAX_EMAILS_PER_USER_PER_DAY=5`, `MIN_MS_BETWEEN_NOTIFICATIONS=1h` | Ditto · `src/engine/notify-user.ts` L39, L46 |
| `checkEmailThrottle` interaction-scan + `lastNotifiedAt` | Ditto · `src/engine/notify-user.ts` L140–186 |
| `resolveChannel` (email / workspace) | Ditto · `src/engine/notify-user.ts` L109–124 |
| `notifyUser` imports workspace tier `db` | Ditto · `src/engine/notify-user.ts` L23 (`{ db, schema } from "../db"`) |
| `textToHtmlWithBlocks(text, htmlBlocks)` | Ditto · `src/engine/channel.ts` L281 |
| `formatEmailBody(message, htmlBlocks?)` | Ditto · `src/engine/channel.ts` L236 |
| `MAX_OUTREACH_PER_PERSON_PER_DAY=3` | Ditto · `src/engine/channel.ts` L1027 |
| Magic-link "Continue in chat" (24h, single-use) | Ditto · `src/engine/magic-link.ts` L368 |
| Empty-state suppression precedent (`shouldReach=false → skip`) | Ditto · `src/engine/relationship-pulse.ts` L443–446 |
| Per-user iteration loop | Ditto · `src/engine/relationship-pulse.ts` L380 (`for (const user of users)`), L355–490 |
| `MIN_HOURS_BETWEEN_OUTREACH=4` recency anchor | Ditto · `src/engine/relationship-pulse.ts` L42 |
| Pulse tick shape (idempotent, fire-and-forget) | Ditto · `src/engine/pulse.ts` L45–98, L150–155 |
| `PULSE_INTERVAL_MS=300000` (5-min default) | Ditto · `src/engine/pulse.ts` L33 |
| `intervalToCron(ms)` | Ditto · `src/engine/pulse.ts` L214–221 |
| Cron scheduler `start()` + `triggerManually` | Ditto · `src/engine/scheduler.ts` L36–125, L140–172 |
| Hourly sweep precedent (Brief 178 stale-escalation) | Ditto · `src/engine/scheduler.ts` L109–122 |
| `task.getNextRun()` → `schedules.nextRunAt` | Ditto · `src/engine/scheduler.ts` L276 |
| `durationToCron("3d"/"7d"/"24h"/"30m")` | Ditto · `src/engine/chain-executor.ts` L57–69 |
| Shared `HarnessPipeline` at module scope | Ditto · `src/engine/heartbeat.ts` L83–104 |
| `pauseUserProcesses` / `resumeUserProcesses` / `isUserPaused` | Ditto · `src/engine/admin-oversight.ts` L290–308, L315–332, L443–451 |
| `handlePauseCycle` / `handleResumeCycle` / `handleActivateCycle` | Ditto · `src/engine/self-tools/cycle-tools.ts` L114–268, L318–336, L348–416 |
| `loadAllProcesses` scans `PROJECT_ROOT/processes/cycles/` | Ditto · `packages/web/instrumentation.ts` L123–135 |
| `scheduler.start()` + `startPulse()` run unconditionally | Ditto · `packages/web/instrumentation.ts` L137–145, L147–156 |
| `DITTO_DEPLOYMENT === "public"` gates Network schema sync | Ditto · `packages/web/instrumentation.ts` L99–109 |
| Existing 4 cycle YAMLs (workspace monorepo) | Ditto · `processes/cycles/` (`gtm-pipeline.yaml`, `network-connecting.yaml`, `relationship-nurture.yaml`, `sales-marketing.yaml`) |
| Cycle archetype (sense→assess→act→gate→land→learn→brief) | Ditto · `processes/cycles/network-connecting.yaml` |
| Trust override pattern (autonomous on sense/learn/brief; critical on gate) | Ditto · `processes/cycles/network-connecting.yaml` L53, L98, L124, L136 |
| Cycle trigger `cron: "0 9 * * 1,4"` (UTC) | Ditto · `processes/cycles/network-connecting.yaml` L23 |
| `network-abuse-controls.ts` `"network-watch": 12/hour` pre-configured | Ditto · `src/engine/network-abuse-controls.ts` L117–127 |
| `checkRateLimit` + per-call `policy` override | Ditto · `src/engine/network-abuse-controls.ts` L229–249 |
| `isNetworkOperationPaused` (source/segment/person-ref) | Ditto · `src/engine/network-abuse-controls.ts` L370 |
| `rateLimitBucketKey` + `hashRateLimitActor` | Ditto · `src/engine/network-abuse-controls.ts` L149–163 |
| `classifyAndPrepare` (compliance) + `isSuppressed` | Ditto · `src/engine/network-email-compliance.ts` L207, L246–263; `src/engine/network-suppression.ts` L235 |
| `networkSearchFeedbackKindValues` (missing `"not-now"`, `"wrong-person"`) | Ditto · `packages/core/src/db/network/schema.ts` L296–306 |
| `networkSearchFeedback` table | Ditto · `packages/core/src/db/network/schema.ts` L1117+ |
| `networkInvitationCandidates.watchId` column + index | Ditto · `packages/core/src/db/network/schema.ts` L1304, L1348 |
| `networkInvitationCandidates.discoveryProfileId` non-nullable | Ditto · `packages/core/src/db/network/schema.ts` L1298–1300 |
| `networkAuditEventClassValues` — has `watch_lifecycle_changed`, `watch_feedback`; missing `watch_run`, `watch_proposal`, `watch_paused_auto` | Ditto · `packages/core/src/db/network/schema.ts` L419–458 |
| `networkSearchRuns` shape (precedent for `network_watch_runs`) | Ditto · `packages/core/src/db/network/schema.ts` L1024+ |
| `networkPossibleConnections` shape (precedent for `network_watch_proposals`) | Ditto · `packages/core/src/db/network/schema.ts` L1062+ |
| `networkUserAntiPersona` (rule 2 precursor) | Ditto · `packages/core/src/db/network/schema.ts` L816+ |
| `networkUserBlockList` (rule 1 precursor) | Ditto · `packages/core/src/db/network/schema.ts` L1690+ |
| `circuitBreakerAt` timestamp (auto-pause adjacent) | Ditto · `packages/core/src/db/network/schema.ts` L1846 |
| Network journal next idx 15 | Ditto · `drizzle/network/meta/_journal.json` (current last: idx 14 `0014_intro_consent_state_machine`) |
| `PossibleConnectionCard` (browser-only React) | Ditto · `packages/web/components/network/possible-connection-card.tsx` (+ `search-results-panel.tsx`, `suggested-candidates-panel.tsx`) |
| `search-results-panel.tsx` (queue-shape precedent) | Ditto · `packages/web/components/network/search-results-panel.tsx` |
| `client-card-actions.tsx` / `expert-card-actions.tsx` (modification target) | Ditto · `packages/web/app/network/chat/client-card-actions.tsx`, `packages/web/app/network/chat/expert-card-actions.tsx` |
| Insight-180 (`stepRunId` guard) | Ditto · `docs/insights/180-*.md` |
| Insight-211 (no self-HTTP for `stepRunId`) | Ditto · `docs/insights/211-*.md` |
| Insight-232 (wrapper run + reject caller `stepRunId`) | Ditto · `docs/insights/232-*.md` |
| Insight-234 (durable cross-deployment delivery) | Ditto · `docs/insights/234-*.md` |
| Insight-235 (transport-not-filter boundary) | Ditto · `docs/insights/235-*.md` |
| Insight-190 (drizzle journal idx sequencing) | Ditto · `docs/insights/190-*.md` |
| Brief 261 Hard Rule #5 (anti-persona owner-only) | Ditto · `docs/briefs/261-introductions-free-counter-workspace-upsell.md` (enforced in `connection-proposal.ts:104–120`) |
| Tier separation (ADR-036, ADR-048, ADR-025) | Ditto · `docs/adrs/036-*.md`, `docs/adrs/048-*.md`, `docs/adrs/025-*.md` |
| `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser tz capture) | External (stdlib — MDN) |
| `Temporal.ZonedDateTime` (Stage 3 proposal) | External (TC39 — `@js-temporal/polyfill`) |
| Circuit-breaker 3-state (CLOSED/OPEN/HALF-OPEN) | External pattern (Nygard / Fowler / AWS) |
| MJML (email-markup framework, React bindings) | External (`mjml.io`) — not in `package.json` |
| `react-dom/server` `renderToStaticMarkup` | External (`react-dom`, already a Ditto dep) |
| Saved-search / alert / digest UX analogues (LinkedIn Job Alerts, Zillow/Redfin, Apple News, Discover Weekly, Notion/Linear/Zapier/Google Alerts, Pinterest/Goodreads, headhunter/buyer-agent) | Designer companion · `docs/research/275-background-watch-network-health-ux-patterns.md` |

---

*End of Research-275. Companion UX spec: `docs/research/275-background-watch-network-health-ux.md`. Companion UX pattern survey: `docs/research/275-background-watch-network-health-ux-patterns.md`.*
