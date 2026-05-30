# Brief 278 — Trust, Privacy, Admin & Observability — Interaction Spec (UX Research)

**Role:** Dev Designer
**Date:** 2026-05-18
**Brief:** `docs/briefs/278-trust-privacy-admin-observability.md`
**Status:** Reviewed (see review report at bottom). Feeds Dev Architect.
**Consumers:** Dev Architect (synthesise with Researcher findings into the "User Experience" section of the build plan), Dev Documenter.

---

## 0. Scope & Method

Brief 278 has many work products. **Only two are user-facing surfaces.** This spec designs the *experience of the controls*; it does not design engine internals.

| In scope (this spec designs the experience) | Out of scope (Architect/Builder own; designed here only as the controls they back) |
|---|---|
| `packages/web/components/network/privacy-center.tsx` — member-facing | `network-privacy-scrubber.ts`, `network-audit.ts`, `network-abuse-controls.ts` |
| `packages/web/app/admin/network/superconnector/page.tsx` + `packages/web/components/admin/network-health-dashboard.tsx` — operator-facing | `discovery-source-policy.ts`, `network-suppression.ts`, `network-email-compliance.ts` |
| | `/api/v1/network/privacy/export` + `/delete` routes (UX of the *moment* is in scope; route internals are not) |

Both target files were confirmed **not to exist yet** (`Glob` → no files found). Both are net-new surfaces.

**Method.** Research-first (Refero precedents cited with screen IDs as provenance, per CLAUDE.md provenance rule), persona-tested against `docs/personas.md`, mapped to the six human jobs (`docs/human-layer.md`), mapped to the canonical ContentBlock union (`packages/core/src/content-blocks.ts`), and tested against legibility/provenance insights (201, 087, 127).

---

## 1. Who Is The User — Persona Resolution

The four `docs/personas.md` personas (Rob, Lisa, Jordan, Nadia) are **Layer-3 workspace users**. Neither Brief 278 surface is used primarily by them. This is a persona gap that must be named (see §7).

### 1a. Privacy Center user — the Network member / Discovery Profile subject

A professional whose signal Ditto holds. Two sub-cases:

1. **Claimed member** — opted in, has a Member Signal. Closest persona lens: **Lisa** ("understand at a glance") and **Jordan** ("would demo this to leadership" → must look trustworthy and controlled). Emotional stake: *"Is what this connector says about me — to people I can't see — actually mine, correct, and within bounds I set?"*
2. **Discovery Profile subject** — a person Ditto built an internal profile of from public sources, who has **not consented yet** and arrives via a claim invite. Not represented by any persona. Highest-stakes trust moment in the product (§3.7).

### 1b. Admin Dashboard user — internal Ditto trust-&-safety operator

Not one of the four personas. A new internal audience. The operator's emotional stake is *liability and reputation*: "Is anything leaking, is anyone being abused, what needs my decision right now?" This is the human side of the architecture's **governance** function (`docs/architecture.md`: "Governance governs the system as a whole… Governance agents cannot modify processes or override trust tiers. They can only surface findings and recommend actions to humans. The human always decides.").

**Hard constraint honoured:** reuse the existing `/admin` shell, session-cookie auth (Brief 143) + legacy Bearer fallback, and the `isWorkspaceDeployment() → notFound()` deployment gate (`packages/web/app/admin/layout.tsx`). Do **not** invent a second admin auth system or new admin chrome (Brief 278 Constraint; AC #12).

---

## 2. The Job Framing — and the Seventh Job, "Curate"

> **Note on provenance of this proposal:** this is the *same* open question `docs/research/memories-legibility-ux.md` left as its OQ-1 ("Architect may fold Curate into Orient+Decide rather than expand to seven"). Both specs independently recommend adopting the seventh job; neither has had Architect ratification. This spec restates the recommendation against a second surface (the Privacy Center) — it is not a fresh first-principles claim, and the recurrence across two surfaces is itself the argument for ratifying rather than re-deferring.

The six human jobs (`docs/human-layer.md`): **Orient, Review, Define, Delegate, Capture, Decide.**

The Privacy Center does not map cleanly to any one of them. Its core question — *"Is what Ditto knows and says about me correct, mine, and revocable?"* — is a **data-ownership / self-correction** job. `docs/research/memories-legibility-ux.md` already proposed a seventh job for exactly this:

> **Curate** — "Is what Ditto knows about me correct and mine?"

**Recommendation (for Architect + Documenter to ratify):** Adopt **Curate** as the seventh human job. The Privacy Center is its first full realisation. If the project prefers not to expand the job taxonomy, the fallback is to treat the Privacy Center as a *composition of Orient (what's public vs private right now) + Decide (change/remove/delete)* — but this undersells a job that is becoming load-bearing across memories-legibility, KB visibility (Brief 258), and now Brief 278. Designer owns `human-layer.md` (Insight-043) but this introduces a taxonomy change with architectural reach → **flagged, not unilaterally edited** (§7).

| Surface | Primary job | Secondary jobs |
|---|---|---|
| Privacy Center | **Curate** (proposed) | Orient ("what's public vs private"), Decide ("remove source / change visibility / delete") |
| Admin Dashboard | **Orient** at network scale | Review (approve/suppress queues), Decide (pause/override/replay) |

---

## 3. Surface A — Privacy Center (member-facing)

### 3.1 Mental model & process architecture (L1)

The member's mental model must be: **"a single mirror of everything this connector knows about me — each item shows where it came from and who can see it, and I can change or revoke any of it."**

The atomic primitive the member reasons about is the **claim** (Member Signal claim: `visibility ∈ {public, on-request, private, hidden}`, `approvalState ∈ {suggested, approved, edited, hidden, rejected}`) and its **source** (Signal Source). The Privacy Center is, architecturally, *a legible projection of the claim+source graph plus the controls that mutate it.*

Three principles govern the data model's user-facing shape:

- **Legibility by default (Insight-201).** The Privacy Center is the canonical "user-facing data seam." Claims, sources, visibility, and the block/anti-persona list are the member's own data and must read as an inspectable list, not an opaque DB. Where something is *withheld from others*, that withholding is itself shown ("3 things are private — only you see these") — the sealed-data pattern. (Note: the member **can** see their own anti-persona/block rules here; Brief 261's "never reveal" rule is about hiding them from *visitors/requesters*, not from the owner.)
- **Provenance per claim (Insight-087).** Every claim carries "where did this come from?" — a source label, drillable. Progressive disclosure: clean by default, "From LinkedIn · 12 days ago" on hover/expand, full source on drill.
- **Pause is not delete.** AC #16 explicitly requires pausing public-profile visibility *without* deleting private signal. Reversible (pause) and irreversible (delete) actions must be visually and semantically distinct everywhere on this surface.

### 3.2 Information architecture — sections

Brief 278's twelve Privacy Center requirements map to **eight sections** on one scannable surface. Order is by member anxiety, not by data model — the orienting "what's exposed" answer comes first.

| # | Section | Brief 278 requirement(s) | Job |
|---|---|---|---|
| 1 | **What's public vs private** (mirror header) | "see what is public versus private" | Orient |
| 2 | **Sources** | "see all sources Ditto used", "remove a source from future reasoning" | Curate |
| 3 | **Claims** (grouped by visibility) | "hide or delete claims", "change visibility per claim" | Curate |
| 4 | **Public profile** | "pause public profile", "delete public profile projection" + confirm direct-URL behavior | Decide |
| 5 | **Requests & Watches** | "pause search/watch", "close requests" | Decide |
| 6 | **Introductions** | "see intro history and feedback" | Orient (read-only) |
| 7 | **Blocked & filtered** | "manage blocked domains/people/patterns" | Curate |
| 8 | **Your data** | "export Member Signal and Active Request data", "delete" | Decide |

### 3.3 Primitive mapping & composition

No existing ContentBlock is a "privacy control." The surface is **composed** from existing blocks. (Whether a dedicated block is warranted is a flagged Architect decision — §8.)

| Section | ContentBlock composition | Why |
|---|---|---|
| 1. Mirror header | `StatusCardBlock` (three-state summary: N public · N on-request · N private/hidden) + `MetricBlock` row | One-glance orientation; matches `status-card` health-summary idiom already used in `/admin/page.tsx`. |
| 2. Sources | `InteractiveTableBlock` (source label, type, last used, claims derived) with per-row `ActionBlock` ("Remove from future reasoning"); each row carries `KnowledgeCitationBlock` provenance | `KnowledgeCitationBlock` is the canonical provenance primitive (Insight-087). "Remove from future reasoning" is a durable toggle, not a delete — copy must say so. |
| 3. Claims | Grouped `RecordBlock` list (one per claim: text, source chip, visibility control, approvalState badge) + inline `ActionBlock` (edit / hide / delete) + a visibility selector (`InputRequestBlock` `select`: Public / On-request / Private / Hidden) | Mirrors the Brief 258 KB-shelf row (fact · source · visibility · edit/archive) — adopt that proven precedent for consistency. |
| 4. Public profile | `NetworkProfileCardBlock` (preview of what visitors see) + `ActionBlock` with a clearly reversible **Pause** toggle and a clearly irreversible **Delete projection** action behind confirmation | Show the member exactly what the public sees; `network-profile-card` is the canonical block for this. **The `NetworkProfileCardBlock` rendered here MUST be the public-profile-scrubbed variant — `antiPersonaMd: null` — not the owner's full record** (the field exists on the block at `content-blocks.ts` and the text fallback renderer will print it). The owner's anti-persona/block rules appear *only* in §3.3 row 7, never via a populated `antiPersonaMd` on a profile-card. This keeps Brief 261 Hard Rule #5 enforced at the block level, not just the scrubber. |
| 5. Requests & Watches | `JobRequestCardBlock` per Active Request + `RecordBlock` per Watch, each with `ActionBlock` (pause/resume/close) and a `StatusCardBlock` status chip | `job-request-card` is canonical for requests. |
| 6. Introductions | `InteractiveTableBlock` (counterpart, date, state, usefulness feedback) read-only. For refused-by-greeter rows, show the **owner** the structured `refusalReason` code (e.g. "Anti-persona match" / "Rate limit" / "You blocked this person") — this is the owner's own control firing on their behalf and is useful calibration feedback. The **requester-facing** generic styling (Brief 248/261 rejected-state) applies to the visitor lane, not this owner view. | The owner sees *that* a filter fired and *which kind*; the anti-persona rule **text** is never rendered even here (Brief 261). Requester identity is shown only to the degree it was ever surfaced. |
| 7. Blocked & filtered | `InteractiveTableBlock` (entry, kind: user/visitor-session/pattern, private note, added) + add/remove `ActionBlock`; an adjacent sealed line: "You have N private filters that shape who reaches you" | Owner-visible (per §3.1). Pattern entry needs inline validation (Brief 261: only `*`, ≤254 chars, no regex metacharacters) — surface the rule *before* error. |
| 8. Your data | Two `ActionBlock`s: **Export** (async → `ArtifactBlock` when ready) and **Delete** (multi-step, see §3.5) | `artifact` is the canonical block for a produced file. |

### 3.4 Interaction states

Every section must specify all five. The high-risk ones:

| State | Sources / Claims | Public profile delete | Export |
|---|---|---|---|
| **Loading** | Skeleton rows; never an empty flash that implies "no data" | Disable action, spinner on confirm | Job-queued indicator, not a frozen button |
| **Empty** | "Ditto hasn't used any sources yet" — reassuring, not alarming | N/A (no projection yet → show "No public profile exists") | "Nothing to export yet" |
| **Error** | Row-level retry, not whole-page failure | "Couldn't delete — nothing was changed. Try again." (fail-closed reassurance) | "Export failed — your data is unchanged" |
| **Partial** | "Showing 40 of 120 sources" with load-more; provenance still attached to each loaded row | N/A | Partial export must declare scope ("Member Signal + Requests; Watches pending") |
| **Success** | Inline confirmation + the row visibly updates (visibility chip changes immediately) | **Explicit irreversible-success modal** (§3.5) | Toast + the `ArtifactBlock` appears with the file |

### 3.5 Key interaction pattern — the export & delete journey (research-grounded)

**Precedent: Brilliant "Account deletion & data export," Refero Flow 4393** (screens `8f43c5a6…`, `a7804ecb…`, `3ef82fd1…`, `c51c800c…`, `1ec86429…`). This is a gold-standard destructive flow and Brief 278's Constraint ("No destructive delete without confirmation and audit tombstone") + AC #19 (confirm direct-URL behavior after deletion) map onto it almost exactly. Adopt its structure:

1. **Landing** — Export and Delete sit together; **consequences surfaced before the action** ("Deleting your public profile means a direct link to it will return *[the Architect/Researcher must specify: 404 vs. tombstone page]* and you will disappear from search and share cards"). Export is offered *next to* delete so the member can take their data first.
2. **Reveal the destructive control** — primary delete action is deliberately one step removed (not a hair-trigger button).
3. **Context & empathy + identity re-verification** — Brilliant re-asks for the password here. Brief 278 Constraint requires verified identity for delete/export. **Design the "prove this is you" moment** (§3.6). Disclose retention: "Your data is recoverable for *[Architect to set]* days, then permanently removed" (Brief 278 requires explicit retention + audit tombstone).
4. **Final confirm.**
5. **Explicit irreversible-success modal** — Brilliant's "permanently deleted… no longer discoverable… cannot be recovered." Ditto's must state the *direct-profile-URL behavior* explicitly (AC #19).

Other adopted patterns:

- **Per-claim visibility control** → 1Password Email Preferences granular per-type toggles (Refero `603670c5…`) + the Brief 258 KB-shelf's `Public / On-request / Off` triad. Use a 4-way selector (Public / On-request / Private / Hidden) with a one-line plain-language consequence under the current selection ("On-request: shown only when someone asks and you approve").
- **Source provenance** → Insight-087 progressive disclosure: clean row, "From {source} · {age}" on expand, full source on drill (`KnowledgeCitationBlock`).
- **Pause vs delete** → two different visual weights: Pause = secondary, reversible, no confirmation; Delete = destructive styling, confirmation + re-verification. Never co-locate them as equal-weight siblings.

### 3.6 Identity-verification UX (Brief 278 Constraint)

| Member context | Verification moment | UX |
|---|---|---|
| Authenticated session | Already proven | Inline; no extra step beyond the confirm modal |
| Claim-invite holder (Discovery Profile subject) | Claim token | The invite link carries the token; the delete/export confirm step shows "Verifying your invite…" then proceeds — no password the person never set |
| No session, no token | Email challenge | "We'll email {masked address} a confirmation link before exporting/deleting" — never expose the full address back to the requester |

The Architect/Researcher must confirm which mechanisms Brief 279 actually provides; the UX above is the desired shape, flagged in §8.

### 3.7 The Discovery Profile case — "Original to Ditto"

A non-member discovers Ditto already built an internal profile of them from public sources. **No Refero precedent exists** — every privacy-center pattern in the corpus assumes you are already a user. This is genuinely original and the single highest-trust-stakes screen in the product.

Designed experience:

- **First frame is honest and bounded:** "A member asked to be connected to people like you. To do that, Ditto put together what's publicly available about you, from these sources. You decide what happens next." Lead with *provenance* (the sources, drillable) before anything else — Insight-087 as a trust device, not a footnote.
- **Four exits, equally weighted, no dark patterns:** Claim & correct · Decline (no contact) · Suppress (never resurface) · Delete (tombstone). "Delete" must not be visually buried beneath "Claim."
- **Sealed data honoured:** any anti-persona/refusal logic that caused or shaped this is **never shown** (Brief 261). The subject sees only their own derived public facts.
- **Refusal-as-protection framing:** if Ditto declined to act, the subject still gets a clean, non-revealing message — consistent with Brief 261's generic refusal copy.

Mark this entire sub-surface **Original to Ditto** in the build plan.

---

## 4. Surface B — Admin / Network-Health Dashboard (operator-facing)

### 4.1 Mental model & process architecture (L1)

The operator's mental model is **triage, not analytics**: "What needs my decision now → what's degraded → how is the network trending." A metrics-wall-first dashboard would bury the liability-bearing items. Reuse `/admin/page.tsx` idioms: stat cards, `healthDot` (green/yellow/red), `trustBadge`, design tokens (`text-vivid`, `bg-vivid-subtle`, `border-border`, `text-text-primary|secondary|muted`), expandable person/entity cards.

### 4.2 IA — triage-ordered, three bands

| Band | Contents (Brief 278 Admin reqs + AC #20, #24) | Job |
|---|---|---|
| **A. Action required** (top, the operator's "Inbox") | Claim-invite approval/suppress queue; high-risk intro proposals; auto-paused sources/segments from complaint/suppression spikes; source-policy violations; abusive sessions to override/suppress | Review + Decide |
| **B. Health** (middle) | Failed source-research jobs; watch-run failures; **private-leakage test status / build warnings** (AC #20); discovery candidate pipeline health | Orient |
| **C. Metrics** (bottom, aggregate, read) | The full Metrics list incl. economic-outcome & willingness-to-pay signals (AC #27, #28) — *aggregate, no private raw text by default* | Orient |
| **Per-entity drill** (modal/side-sheet) | Pause member/request/source/segment; audit source provenance for a reported profile; **dry-run watch replay**; reveal-raw-text (audited) | Decide |

### 4.3 Primitive mapping & composition

| Element | ContentBlock | Notes |
|---|---|---|
| Approve/suppress claim-invite queue | `ReviewCardBlock` (approve / suppress / edit), one per invite | Reuses the canonical inline-review primitive; operator decision carries `actorType:"admin"` + mandatory reason. |
| High-risk intro proposals | `ReviewCardBlock` + `AuthorizationRequestBlock` styling for the refused/risky state | Consistent with Brief 261 rejected-state visual language. |
| Candidates / audit / suppression rows | `InteractiveTableBlock` with filter facets + accordion drill | See audit-log precedent §4.5. |
| Health band | `StatusCardBlock` per subsystem (source jobs, watch runs, leakage tests) with `healthDot` | Leakage-test failure must be a **red `AlertBlock`**, not a quiet status — it gates Brief 279. |
| Auto-pause spike | `AlertBlock` (high severity) + `ActionBlock` (review / unpause-with-reason) | Brief 278 Constraint: complaint spikes auto-pause; operator reviews. |
| Metrics | `MetricBlock` grid + `ChartBlock` for trended series | Aggregate only. |
| Pause / replay / override | `ActionBlock`, every destructive/state-changing action **requires a reason field** (`InputRequestBlock` textarea) | Brief 278 Side-Effect matrix: admin actions need "admin auth and reason." |
| Dry-run replay result | `ArtifactBlock` or `RecordBlock` labelled **"DRY RUN — no contact occurred"** | AC #26: must not notify/contact users. |

### 4.4 Interaction states

| State | Treatment |
|---|---|
| **Loading** | Per-band skeletons; never block the whole console on the slowest query |
| **Empty** | **Design the "all clear" state deliberately** — for a trust dashboard, "Action required: nothing" is the *most important success message in the product*. Make it calm and unambiguous (green, "No items need your decision"), not a blank panel that reads as "broken." |
| **Error** | Band-scoped; a failed metrics query must not hide the Action-required queue |
| **Partial** | "Showing newest 50 audit events" + load-more; counts always reflect the true total, not the loaded subset |
| **Success** | Operator action confirms inline, the queue item leaves the queue, and an audit row is written (visible in the audit drill) |

### 4.5 Key patterns (research-grounded)

- **Audit / activity log** → **Mercury** user-activity (Refero `da0ff7bb…`: chronological rows, status/event badges, low-contrast secondary text, fixed left nav + scannable rows) and **Cake Equity** audit log (Refero `d1719b7f…`: table + accordion-expand rows + filter dropdowns). Adopt: reverse-chronological, event-type badge, actor column (with `actorType:"admin"` distinct styling), filter facets, row-expand for detail. This realises Brief 278's mandatory audit trail as an operator surface and Insight-127's *three-level disclosure* (one-line → expanded card → raw audit).
- **Operator safety monitoring shell** → **Navan** admin safety dashboard (Refero `a156afc7…`, `2cb8dfc3…`: breadcrumb scoping "Safety > …", side-sheet for per-entity detail). Adopt the side-sheet for per-member/per-source drill so the operator never loses the queue context.
- **Approve/suppress with a reason taxonomy** → **Xbox** "Report this review… Potential violation [reason dropdown]" (Refero `9dd1f154…`). Adopt a structured reason enum for suppress/override (not free text alone) so refusal-reason metrics (Brief 278 Metrics: refusal trigger counts) are countable and map to Brief 261's `refusalReason` taxonomy.
- **Dry-run replay** → `docs/research/trust-visibility-ux.md` Evaluate/dry-run pattern (GitHub rulesets precedent). The replay surface must carry an unmissable persistent "DRY RUN — no contact" banner and an explicit post-run assertion line ("0 emails sent · 0 notifications · 0 writes"). AC #26.

### 4.6 Bounded admin visibility is a designed trust feature

Brief 278 Constraint + AC #27: admin must inspect operational data "without exposing private raw text by default." Design this as the operator-facing twin of Insight-201's sealed-data pattern:

- Default: the operator sees **structured metadata** — counts, reason codes, classifications, provenance labels, leakage-test pass/fail — never the raw private claim/email text.
- Raw text is reachable only via an explicit **"Reveal raw text (audited)"** action that (a) requires a reason, (b) writes its own audit row, (c) is visually marked as a privileged action. The reveal is itself a tracked event.
- Frame this *to the operator* as protection ("private member text is sealed by default — revealing it is logged"), not as a missing feature. This is loyalty made legible on the operator side.
- **Post-reveal rendering:** after the audited reveal, the raw text renders inline in the same row as a `RecordBlock` with the revealed field carrying an info-level annotation ("Revealed — this view is audited") plus the revealing actor + timestamp as provenance. It is **not** a modal and does not leave the queue context (consistent with the Navan side-sheet drill, §4.5).

---

## 5. Cross-Cutting Requirements (both surfaces)

1. **Provenance everywhere (Insight-087).** Every claim, source, candidate, audit row, and metric carries "where did this come from?" and is drillable. Non-negotiable, both surfaces.
2. **Trust signals, not activity traces (Insight-127).** Admin metrics are structured signals with three-level disclosure (summary → card → raw audit). Do not render raw tool/event logs as the primary view.
3. **Reversible vs irreversible — one consistent visual language** across both surfaces. Pause/close = soft, secondary, no-confirm, instantly reversible. Delete/suppress = destructive styling, confirmation, identity/reason gate, audit tombstone.
4. **Refusal framing (Brief 261).** Member sees their *own* block/anti-persona list (owner-visible) in the Privacy Center; it is never leaked to anyone else; admin sees refusal *counts and reason codes*, never the raw anti-persona text.
5. **Economic-outcome metrics are display-only (AC #28).** Render willingness-to-pay / outcome signals as `MetricBlock`s; introduce **no** payment or billing UI (Brief 278 Non-Goals).
6. **Deployment + auth invariants are UX-invisible but enforced.** The admin surface simply does not exist in workspace mode (`notFound()`); no UI affordance hints at it. No second auth system.

---

## 6. Gaps Marked "Original to Ditto"

| Gap | Why no precedent | Treatment |
|---|---|---|
| Pre-consent **Discovery Profile self-service** (claim/correct/suppress/delete before you are a user) | Every privacy-center precedent assumes an existing account | Designed §3.7 from first principles; mark original in build plan |
| Member control over an agent's **future reasoning sources** ("remove this source from future reasoning") | Adjacent to AI-memory controls, but the *durable "stop using this for inference"* semantic is novel | Designed §3.3 row 2; copy must make the durability explicit |
| Operator **trust-&-safety console for a consent-based introduction network with sealed private text** | Composite of audit-log + moderation-queue + dry-run; the sealed-by-default-with-audited-reveal combination is original | Composed §4 from cited precedents + Insight-201 |
| The **seventh job, "Curate"** | Job taxonomy is Ditto-original; this extends it | Proposed §2; ratification flagged §7/§8 |

---

## 7. Reference-Doc Status

**Reference docs checked: drift found in two; one note recommended.**

- **`docs/human-layer.md`** — *Checked.* Conversation-first IA is **current** (lines 40–48 explicitly describe the post-280 inversion; the earlier "three-panel" concern is resolved in this file). The six jobs remain valid. **Drift candidate (not corrected here):** there is no seventh "Curate" job and no privacy/provenance-control primitive in the 16. Designer owns `human-layer.md` (Insight-043), but adding a job + possibly a new ContentBlock has architectural reach → recommend the Architect rule on §2/§8 first, then the Documenter (or Designer) records the decision in `human-layer.md`. **Not unilaterally edited.**
- **`docs/personas.md`** — *Checked. Drift found.* The four personas are Layer-3 workspace users. The Privacy Center's primary users — the **Network member** and especially the **Discovery Profile subject** (Layer 1/2, possibly pre-consent and not a user at all) — are not represented. Recommend adding a short "Network audiences" note to `personas.md` (Designer-owned). **Proposed, not auto-edited**, pending human approval to avoid scope creep inside a research task.
- **`docs/architecture.md`** — *Checked. No drift found* in the consumed sections. The Brief 108 admin-oversight model, governance function, trust-tier model, and Layer-6 conversation-first IA are current and sufficient to back both surfaces.

---

## 8. Open Questions the Architect Must Resolve

1. **"Curate" as the seventh job vs. composition of Orient+Decide.** This spec recommends adopting it. Architect to rule; Documenter to record in `human-layer.md`.
2. **New ContentBlock vs. composition.** Is a dedicated privacy/provenance-control block warranted, or is the §3.3 composition (`RecordBlock` + `KnowledgeCitationBlock` + `ActionBlock` + `InputRequestBlock`) sufficient? (memories-legibility-ux.md proposed a `MemoryBlock`; this is the same question recurring — resolve once.)
3. **Where the Privacy Center physically renders.** Brief 278 names a `components/network/privacy-center.tsx` component. The conversation-first principle (`human-layer.md` 40–48) says member surfaces render as ContentBlocks inline in `/chat`, with routes reachable as drill-downs. Architect to confirm: inline-in-chat composition vs. a `/network/privacy` route reachable from chat. UX works either way; the spec is route-agnostic but the blocks are the same.
4. **Identity-verification mechanism (§3.6).** UX desired-state is specified; Architect/Researcher must confirm what Brief 279 actually provides (claim token vs. email challenge vs. session) so the "prove this is you" moment is designed against reality.
5. **Retention windows & post-delete direct-URL behavior (AC #19).** UX must state these explicitly to the member; Architect to supply the actual numbers/behavior (404 vs. tombstone page) so copy isn't invented.
6. **Export completion rendering depends on storage reality.** §3.3 row 8 / §3.5 use `ArtifactBlock`, which requires a valid `artifactId` from the workspace artifact system. But the Brief 278 Side-Effect matrix mints a server-side wrapper run for the export, implying a Network-tier job, not a workspace artifact. Architect to confirm: does the Network privacy export store into the workspace artifact system (→ `ArtifactBlock` is correct), or is it a transient presigned download (→ use `StatusCardBlock` tracking job state → `ActionBlock` download link instead)? The UX is specified both ways; the block choice is the only thing blocked on this answer.
7. **`docs/review-checklist.md` gate additions (AC #25)** — provenance, private-leakage, no-contact background-watch, two-sided-consent, claim-before-public-discovery, outbound-email-suppression, and source-policy gates are *engine/policy* review patterns, not UX surfaces. Out of scope for this spec; flagged so the Architect specifies them in the build plan rather than assuming the Designer covered them.

---

## 9. Handoff

→ **Dev Reviewer** (spawned by Designer before presenting — see review report below).
→ **Dev Architect** — synthesise this spec with Researcher findings into the build-plan "User Experience" section; resolve §8.
→ **Dev Documenter** — record the §2/§7 job-taxonomy and personas decisions once the human rules on them.
