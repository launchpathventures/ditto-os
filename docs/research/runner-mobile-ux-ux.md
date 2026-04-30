# Runner Mobile UX — Interaction Spec (Brief 221)

**Date:** 2026-04-27
**Author:** Dev Designer
**Status:** Draft — feeds Brief 221 (deferred body, post-216-merge). Architect synthesises with Researcher findings + this spec.
**Brief:** `docs/briefs/214-cloud-execution-runners-phase.md` §D13 — sub-brief 221 scope
**Companion technical research:** none required (Researcher cleared during 214 / 216 / 217 / 218; this is a UX-only pass)

---

## 1. Scope

Brief 221 ships the mobile-first UX layer over the cloud-execution-runners primitive. Four surfaces:

1. **`/projects/[slug]`** — runner pill on dispatch rows
2. **`/review/[token]`** — "Run on:" selector + force-cloud toggle inline with approval
3. **Conversation surface** — runner-started / running / finished inline cards with external deep-link + retry-next-in-chain
4. **`/admin`** (or `/projects/[slug]/admin` — see §10 below) — runner-metrics card (success rate, mean duration, rate-limit hits, fallback-triggered rate)

The user is on a phone, away from their desk, with the Mac mini powered off. The pipeline is intake → triage → approve → cloud runner dispatch → PR → `/dev-review` skill comment → Vercel preview URL inline → manual PR approve in GitHub Mobile → deploy approve in GitHub Mobile → done. **The phone is sufficient.** That is the standard the UX must meet.

---

## 2. Persona Alignment

| Persona | Relevance | What they need |
|---------|-----------|---------------|
| **Rob** (mobile-primary, on-the-go) | **Primary** | A phone-only approve flow that fits between jobs. Push notification → tap → glance at the work item + runner choice → approve → done. Total tap budget: ≤3 taps from notification to dispatched. |
| **Jordan** (cross-department leverage, demo-driven) | Secondary — admin/metrics | A runner-health view to demo "I delegated coding work to a Routine, here's the success rate." Mobile glanceable, desktop-detailed. |
| **Lisa** (ecommerce, fragmented attention) | Tangential | Same approval pattern as Rob; runners are coding-pipeline-specific, less central to her ecommerce flow. |
| **Nadia** (manages specialists) | Tangential | Trust-tier semantics matter more than runner choice; the runner is an implementation detail under her trust dial. |

**Founder (dogfooding) is the immediate target user.** This is the user's own phone-only smoke test (Smoke A in §214). Designing for Rob's mobile-first, between-jobs context covers the founder's case. Anti-pattern: designing for desktop-Jordan first — that pushes the runner pill / metrics into a desktop-only affordance and breaks the dogfood goal.

**Founder ↔ Rob mapping:** the founder is the proxy Rob during dogfood. If Rob can approve a coding dispatch from a job site, the founder can approve agent-crm changes between meetings. Test the spec against Rob's day, not against an idealised power-user.

---

## 3. The Six Human Jobs Served

| Job | How Brief 221 serves it |
|-----|------------------------|
| **Orient** | "What ran where?" — runner pills on dispatch rows, runner-started/finished inline cards in conversation, metrics card showing health at a glance |
| **Review** | The trust-gate pause surface (`/review/[token]`) is where runner choice intersects with approval — the user reviews the proposed work AND the proposed dispatch target in one place |
| **Define** | Out of scope here (handled by `/projects/[slug]/runners` admin from Brief 215; Brief 221 does NOT extend the admin form) |
| **Delegate** | Picking a runner per-dispatch IS a delegation moment ("you go run this, on this surface, with these constraints"). The "Run on:" selector + force-cloud toggle are the per-decision delegation affordance |
| **Capture** | Out of scope (capture handled by existing prompt input) |
| **Decide** | Retry-next-in-chain affordance: when primary fails, the user decides *go to next* or *stop and reconsider*. Metrics card surfaces fallback-triggered rate so the user can decide whether to reorder the chain |

**Not served by Brief 221:**
- Define (runner config form is Brief 215 substrate; Brief 221 doesn't touch it)
- Capture (no capture surfaces)

---

## 4. Process-Owner's Mental Model

The user does not think in "adapter dispatch primitives." They think:

1. **"Where will this run?"** — Mac mini (mine, fast, can't run if off), Cloud (runs anywhere), Chain (let the system pick).
2. **"Is it running?"** — Yes (with progress) / No (queued / failed / blocked).
3. **"Where can I watch it live?"** — One tap → external session in browser.
4. **"Did it finish? Did it ship?"** — PR opened, preview URL ready, review comment posted.
5. **"What if it broke?"** — Try the next one in line, or fix the runner that broke.

**Language to use on surfaces (vs internal terminology):**

| Internal term | User-facing language |
|--------------|---------------------|
| `runner kind` | "where it runs" / runner name (Mac mini, Routine, Managed Agent, GitHub Action) |
| `runner mode` | "local" / "cloud" — but only when distinction matters (force-mode toggle, mode-required filter) |
| `runner chain` | "fallback order" / "what to try next" |
| `runner_dispatches` row | "dispatch" or just "run" |
| `runner_mode_required` | "force cloud" / "force local" toggle copy |
| `attemptIndex` | "primary" / "fallback #1" / etc. — only shown in retry UI, not in normal pills |
| `last_health_status` | runner's status dot (healthy / degraded / offline) |

**Don't invent abbreviations.** Surface "Routine" (Anthropic's name) not "ACR." Surface "Mac mini" (the user's name for it) not "local-mac-mini."

---

## 5. Surface 1 — Runner Pill on `/projects/[slug]`

### What the user sees

A list of recent dispatches under a "Recent dispatches" heading on the project detail page. Each row shows:

```
┌──────────────────────────────────────────────────────────┐
│ Add /healthz endpoint to agent-crm app router            │
│ ●  Routine  ·  Cloud   →  PR #142  ·  2m ago             │
└──────────────────────────────────────────────────────────┘
```

- **Status dot** (`●`): green = succeeded, blue = running, amber = queued / awaiting approval, red = failed / timed out / rate-limited, grey = revoked / cancelled
- **Kind label**: short-form (Mac mini / Routine / Managed Agent / GitHub Action) — never the slug (`local-mac-mini`)
- **Mode chip**: "Local" / "Cloud" — colour-keyed: local = warm grey (the user's machine), cloud = cool tint (off-premise)
- **Outcome trail**: PR # if opened, preview URL if available, otherwise the runner's external link or error reason

### Pill interaction

| State | Tap behaviour |
|-------|--------------|
| Running / queued | Open external runner URL in same window (Anthropic Routine session, GitHub Actions run page, Managed Agents session) |
| Succeeded with PR | Open the PR (GitHub Mobile if installed, otherwise browser) |
| Failed | Open the row's expanded view (in-app) with the error reason + retry-next-in-chain button |
| Cancelled / revoked | Open expanded view with reason + "configure runner" link |

### Process-architecture recommendation

The runner-pill **visual** should be reusable across three surfaces. But the surfaces split cleanly along Insight-107 (BlockList is the viewer):

| Surface | Source of data | Implementation kind |
|---------|---------------|--------------------|
| `/projects/[slug]` recent dispatches | Client-side `fetch('/api/v1/projects/:slug/dispatches')` of `runner_dispatches` rows (admin / list view) | **React component** rendering admin data — NOT a ContentBlock (this is not engine-emitted conversational output) |
| Today / Work composition rows | Composition-engine query of `runner_dispatches` joined to work items | **ContentBlock metadata** on existing `StatusCardBlock` row entries |
| Conversation inline runner-started card (§7) | Engine emission via runner-status-handler | **ContentBlock** — extended `StatusCardBlock` (see §7 metadata contract) |

The visual sub-component (status dot + kind label + mode chip + outcome trail) is the **same React leaf component** (e.g., `<RunnerPillView dispatch={...} />`) consumed by:

- The `/projects/[slug]` admin page (rendering admin-fetched data)
- The block renderer for `StatusCardBlock` when `metadata.runnerKind` is present (Today/Work + conversation inline)

This separates "what data goes into a row" (ContentBlock vs admin fetch — a Layer 6 vs Layer 5 concern) from "how a runner row renders" (one React leaf used in both contexts). **No new ContentBlock type is invented.** Per Insight-107, the runner-state data lives as `metadata` on existing `StatusCardBlock`; the admin surface fetches the underlying `runner_dispatches` row directly.

The Architect decides whether to extend Today / Work composition queries in Brief 221 or in a follow-on. Soft recommendation: ship the `/projects/[slug]` view + the conversation inline card (§7) in 221; defer Today/Work integration unless trivial.

### Empty / loading / error states

| State | Behaviour |
|-------|-----------|
| Loading | Skeleton row (single line, animated shimmer) — same `Shimmer` component as conversation |
| Empty (no dispatches yet) | "No runs yet. Configure a runner and dispatch a work item to see it here." with a tap-target link to `/projects/[slug]/runners` |
| Error fetching | Inline error band (existing red-50 pattern) with retry button |
| Stale (last dispatch >7d) | No special treatment — older dispatches just sit in the list. (Future: collapse / paginate. Not in 221.) |

---

## 6. Surface 2 — `/review/[token]` "Run on:" Selector

### Critical UX gap to surface to the Architect

The existing `/review/[token]` page (`packages/web/app/review/[token]/page.tsx`) is the **Brief 106 Network Service** review surface — content blocks + chat with Alex, no Approve/Reject buttons. Briefs 211/212/216/217/218 mint review tokens for trust-gate pauses on dispatches but currently render the same single-`TextBlock` payload with NO interactive approval affordance — the approval flow is implicit in chat or via a separate page (status: Brief 212 stub).

**Brief 221's "Run on:" selector + force-cloud toggle has no host page that does Approve/Reject yet.** Either:

- **Option A (recommended):** Brief 221 ships the trust-gate-pause variant of `/review/[token]` as a first-class affordance: bound to a `runner_dispatches` row in `queued` state, renders work-item summary + proposed runner chain + interactive selector + Approve/Reject + Force-cloud toggle. The Architect decides whether this is a NEW route (`/review/[token]/dispatch`) or a discriminated variant of the existing route. **My UX recommendation: discriminated variant** — same URL, same token-validate flow, the page renders different blocks depending on the **`review_pages.kind`** (or equivalent payload-type discriminator on the row that backs the token). One URL is what the user has muscle memory for.
- **Option B:** Brief 221 ships its own surface (`/dispatch/[token]`). I recommend against — it forks the user's mental model.

The Architect must take a stance. The rest of this section assumes Option A.

**Important — what the discriminator is and is NOT:**

- The discriminator is on the **review-page object kind** (Brief 106 network-service review vs runner-dispatch-pause vs file-write supervised approval vs … future review kinds). This is a payload-shape discriminator, exactly the same pattern used for the polymorphic status webhook (Brief 214 §D7 — Zod discriminated union keyed on `runner_kind`).
- The discriminator is **NOT** on `TrustAction` (`pause` / `sample_pause` / `advance` / etc.). `TrustAction` is the same regardless of which review-page kind is being approved — supervised and sampled-in dispatches both render the same dispatch-pause page; the trust tier only governs WHETHER a token is minted, not what's rendered when one is.
- All review-page kinds share the same token-validate + expiry + one-shot semantics. Only the rendered ContentBlocks (and the actions they expose: Approve / Reject / chat-with-Alex) differ per kind.

### What the user sees (mobile portrait, 375×667)

```
┌────────────────────────────────────────────┐
│  Approve dispatch                          │
│                                            │
│  Add /healthz endpoint to agent-crm        │
│  app router                                │
│                                            │
│  This work will run on:                    │
│   ●  Routine  · Cloud         (default)    │
│   ○  Managed Agent · Cloud                 │
│   ○  Mac mini · Local       (offline)      │
│                                            │
│  [⊘] Force cloud for this approval         │
│                                            │
│  ───── Mac mini is offline ─────           │
│   The chain skips offline runners.         │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │           Approve & dispatch           │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │              Reject                    │ │
│ └────────────────────────────────────────┘ │
│                                            │
│  [Ask Alex about this work →]              │
└────────────────────────────────────────────┘
                                ▲
                       Sticky bottom action bar:
                  Approve & Reject pinned to viewport
```

### Selector interaction

- **Default selection** = the project's `runner_chain` head (or `default_runner_kind`). Dispatcher's `resolveChain()` runs server-side to populate the radio list with eligible runners only (mode-filtered, health-aware).
- **Radio buttons, not dropdown.** On mobile, vertical-stacked radios beat dropdowns at every level (accessibility + thumb-reach + visible state). Dropdowns are for ≥6 options; runners cap at 4.
- **Each option shows:** kind label, mode chip, health hint (greyed-out + parenthesised reason if `last_health_status ∈ {unauthenticated, rate_limited, unreachable}`). Selecting a degraded runner is allowed (the chain may still try) but warns ("Mac mini is offline — the chain will skip it. Pick anyway?").
- **Force-cloud toggle:** a single switch with copy "Force cloud for this approval." Default OFF. When ON: the selector list re-renders to cloud kinds only and the work item gets `runner_mode_required = "cloud"` persisted. Symmetric "Force local" exists behind a "More options ▾" disclosure (chevron button below the toggle, ≥44pt tap target, visible at all viewport widths down to 320px). Force-local is the 5% case (the user wants hands-on local execution); force-cloud is the 95% case (the user is on a phone, Mac is off). Both are reachable; only force-cloud is in the default tap path.
- **Mode-required already set on work item:** if the work item came in with `runner_mode_required = "cloud"` (set elsewhere), the toggle is preset ON and disabled with a hint: "This work item was already marked cloud-only at intake."

### Approve & dispatch flow

1. User taps Approve.
2. Page transitions to a "Dispatching…" state (existing `Shimmer` pattern + the selected runner's pill rendered, status dot blue).
3. On `runner_dispatches.status` reaching `dispatched` (≤2s typical), page redirects to either:
   - The conversation surface for that work item (if the user came from there), OR
   - A confirmation page with the runner pill + external URL deep link + "Back to projects."
4. The token is consumed (one-shot). Reopening the URL shows "This dispatch was already approved — view the run."

### Reject flow

1. User taps Reject. Optional reason textarea (placeholder: "Why? (optional — helps the agent learn.)").
2. The `runner_dispatches` row is moved to `cancelled` with `errorReason = "user_rejected"` + the reason. The work item state machine handles upstream consequences (Architect's call — likely revert to `triaged` for re-dispatch).

### Interaction states

| State | Visual |
|-------|--------|
| Loading (token validating) | Full-page shimmer, no chrome |
| Token expired | Existing "This link has expired" copy + "Talk to Alex" CTA — same as Brief 106 |
| Already approved | "This dispatch was approved on {time}. [View the run →]" deep-link to conversation or the runner's external URL |
| Already rejected | "This dispatch was rejected." + the reason |
| Approving (post-tap, pre-dispatched) | Approve button shows spinner + "Dispatching…", buttons disabled |
| Dispatch failed mid-flight | Inline red band: "Dispatch to {runner} failed: {reason}. Try the next runner?" + button "Try {next-kind}" — this is the retry-next-in-chain affordance triggered from the approval surface itself when the dispatcher errors at approve-time (vs runtime — see §7) |
| No eligible runner | "No runner can run this work right now." + reason ("All cloud runners rate-limited" / "Force-cloud requested but no cloud runner configured") + action ("Configure runners" → `/projects/[slug]/runners`) |
| Network error | Existing red-50 inline band with retry |

### "Edit @ desk" pattern (Insight-012)

The user may see this approval on their phone but want to edit the work-item body before dispatch. Add a third action below Approve / Reject: **"Edit at desk →"** marks the dispatch as `acknowledged-pending-desktop-edit` and surfaces it prominently on the desktop Today composition. This preserves Insight-012 — the user actively decides "I'll handle this at my computer" rather than passively deferring or wrongly rejecting.

This is **optional for Brief 221** — flag for Architect as a stretch goal. The minimum is Approve + Reject + Force-cloud + selector.

### Sticky bottom action bar

The Approve / Reject buttons MUST stay pinned to the bottom of the viewport on mobile (CSS `position: sticky` or fixed bar with safe-area padding). The selector + content scroll above. This is non-negotiable — the user's thumb is always near the bottom of the screen, and reaching for an approve button at the top of a long page is a friction point that destroys the "approve in 30 seconds between jobs" goal.

---

## 7. Surface 3 — Conversation Inline Cards (Runner Started / Running / Finished + Retry)

### What exists today

Brief 216 / 217 / 218 emit text-only descriptions via `describe<Kind>Callback()` (e.g., `"Routine session running — https://claude.ai/session/..."`) to `activities.description`. There is **no ContentBlock card** for runner state. Brief 221's job is to lift this into a first-class card.

### Recommended approach: extend `StatusCardBlock`, do not invent

Per Insight-107 (BlockList is the viewer) and Insight-138 (metadata-first block mapping), invent NO new ContentBlock type unless the existing 26 types cannot represent the data. **`StatusCardBlock` already exists** for "process/item status" — extending it with runner-specific metadata (kind, mode, externalUrl, attemptIndex, fallbackPending) is the right move.

**Surface vocabulary:**

```
┌──────────────────────────────────────────────────────────┐
│ ● Routine started · Cloud                                │
│   Add /healthz endpoint to agent-crm app router           │
│   ↗ Watch live in Anthropic ·  3s ago                    │
└──────────────────────────────────────────────────────────┘
```

**On status change (running → succeeded):**

```
┌──────────────────────────────────────────────────────────┐
│ ● Routine finished · PR #142 opened                      │
│   Review comment posted by @ditto-bot                    │
│   ↗ Open PR  ·  ↗ Vercel preview                         │
└──────────────────────────────────────────────────────────┘
```

**On status change (running → rate_limited):**

```
┌──────────────────────────────────────────────────────────┐
│ ● Routine rate-limited                                   │
│   Anthropic rate limit hit. Try the next runner?         │
│   ┌────────────────────────────────────────┐             │
│   │   Retry on Managed Agent  →            │             │
│   └────────────────────────────────────────┘             │
│   [Stop and reconfigure ↗]                               │
└──────────────────────────────────────────────────────────┘
```

### Retry-next-in-chain interaction

- **Single button**, not a menu. The next runner is computed server-side from the chain + mode filter + health, exactly as approve-time chain resolution.
- **Always shows the next runner's name explicitly.** "Retry on Managed Agent" — the user must know what they're saying yes to.
- **Auto-advance is opt-in, never default.** Brief 214's chain semantics auto-advance on dispatch failure (network blip, 5xx) but a `rate_limited` / explicit `failed` is treated as "ask the human." The reasoning: a transient dispatch error is the harness's job to recover (Insight-209 resilience trio); a real failure is a decision moment.
- **"Stop and reconfigure" link** opens `/projects/[slug]/runners` for the user to fix the underlying problem (re-pair routine, refresh PAT, etc.).

### Externally-linked deep-links

- **Same window, not new tab** (mobile convention from Researcher §5). Mobile browsers preserve back-stack; new-tab loses context.
- **Truncate URLs** with ellipsis on the visible row; the link itself routes to the full URL. Pattern: `↗ Watch live in Anthropic` — verb-led, surface-named, no raw URL on small screens.
- **GitHub Mobile deep-linking:** when a card has a PR URL and the device has GitHub Mobile installed, prefer the `github://` scheme (universal-link fallback). This is GitHub's own convention; Vercel preview URLs go to the browser.

### Card rendering source — `StatusCardBlock` metadata contract

Per Insight-138 (metadata-first block mapping) and Insight-107 (BlockList is the viewer), no new ContentBlock type is invented. The runner-status-handler populates `StatusCardBlock.metadata` with a runner-specific extension:

**Required when `metadata.runnerKind` is set:**
- `runnerKind`: enum (`local-mac-mini` / `claude-code-routine` / `claude-managed-agent` / `github-action` / future)
- `runnerMode`: enum (`local` / `cloud`)
- `status`: enum (`queued` / `dispatched` / `running` / `succeeded` / `failed` / `timed_out` / `rate_limited` / `cancelled` / `revoked` / `orphaned`) — superset of `runner_dispatches.status` plus client-side `orphaned`
- `attemptIndex`: integer (0 = primary, 1 = first fallback, …)

**Optional, populated when known:**
- `externalUrl`: string (the runner's session / run URL — Anthropic Routine session, Managed Agents UI, GitHub Actions run page)
- `prUrl`: string (when a PR has opened)
- `previewUrl`: string (Vercel / Netlify / etc. preview deployment)
- `errorReason`: string (for failed / timed_out / rate_limited / revoked)
- `nextRunnerKind`: string (when retry-next-in-chain is available — the kind to retry on)
- `elapsedSeconds`: number (for running state, server-stamped)

**Backward compatibility:** existing `StatusCardBlock` callers (process-step status, work-item status, etc.) populate none of these runner-specific fields. The renderer dispatches:

```
if (metadata.runnerKind) → runner-row template (kind label + mode chip + status dot + outcome trail)
else                     → existing generic StatusCard template
```

This is a single explicit fork in the renderer, not an ad-hoc proliferation of `if (metadata.X)` checks. Adding future block subtypes (e.g., a `deployStatus`-bearing card for Brief 220) follows the same pattern: one well-named metadata discriminator, one renderer template per subtype, no new top-level block kinds. The Architect should review this conditional against Insight-107 at brief-write time and confirm it stays bounded.

**Not in metadata** (these belong on the work-item / conversation row, not the StatusCard):
- `workItemId` — already in scope at the conversation level
- `projectSlug` — same
- `stepRunId` — internal audit (Insight-180), not surfaced to the renderer

### Interaction states

| State | Card |
|-------|------|
| Queued (awaiting approval) | Amber dot + "Awaiting approval" + link to `/review/[token]` |
| Dispatched (sent to runner) | Blue dot + "Dispatched to {runner}" + external link |
| Running | Blue dot + "{runner} running" + external link + (optional) elapsed time |
| Succeeded | Green dot + "{runner} finished · PR #{n} opened" + PR link + preview link if present |
| Failed | Red dot + reason + retry button (next in chain) + "Stop and reconfigure" link |
| Rate-limited | Red dot + reason + retry button (mode-aware: skips other rate-limited cloud runners if same provider) |
| Timed out | Red dot + "Timed out after {duration}" + retry button + "View partial logs" link |
| Cancelled (user) | Grey dot + "Cancelled" |
| Revoked (credential expired) | Red dot + "Routine credential expired — re-pair" + link to `/projects/[slug]/runners` |
| Orphaned (Insight-209 staleness sweeper) | Amber dot + "Lost contact with {runner}. Status check pending." + auto-refresh + manual "Mark as failed" |

---

## 8. Surface 4 — Runner Metrics Card

### Where it lives — Architect decision

Brief 214 §D13 says "/admin runner-metrics card." But `/admin` today is "Alex's Teammate View" (network of users, communications, processes — a workspace-wide network ops view). Adding runner metrics there is a *context shift*. Two options:

- **Option A (recommended):** Per-project runner-metrics card on `/projects/[slug]` — replaces the current "Sub-brief 221 surfaces runner-dispatch metrics here." placeholder. Plus a workspace-wide "Runners" card on `/admin` that aggregates across projects.
- **Option B:** Single `/admin/runners` route with all-runners metrics, no per-project view.

I recommend Option A. Per-project metrics are the unit of decision-making ("should I reorder agent-crm's chain?") and `/projects/[slug]` is the natural home. The workspace-wide aggregate on `/admin` gives Jordan the demo view.

### Per-project metrics card

```
┌──────────────────────────────────────────────────────────┐
│  Runner health · last 7 days                             │
│                                                           │
│  ●  Routine        94%   45s avg   2 fallbacks          │
│  ●  Managed Agent  100%  3m avg    0 fallbacks          │
│  ●  Mac mini       offline                              │
│                                                           │
│  Rate-limit hits last 7d: 1 (Routine, Tue 14:32)        │
│  Fallback-triggered rate: 5% (1 of 20 dispatches)       │
└──────────────────────────────────────────────────────────┘
```

### KPIs per runner

| KPI | Source | Mobile display |
|-----|--------|---------------|
| Success rate (%) | `runner_dispatches.status = succeeded` / total | One number, % |
| Mean duration | `finishedAt - startedAt` over succeeded | Compact ("45s" / "3m" / "1h 12m") |
| Rate-limit hits (count) | `runner_dispatches.status = rate_limited` | Single number + last occurrence (collapsed) |
| Fallback-triggered rate (%) | `attemptIndex > 0` / total | One number, % |
| Health (from `last_health_status`) | Health-check cron output | Status dot + label |

### Time window

- **Default: last 7 days.** Time horizon matches the user's mental review window (a week). Toggle-able to 30d / all-time on tap (chip group, not dropdown). Mobile-default is 7d; desktop default is 30d.
- **Sparklines**: not in MVP. Use compact numerics first; add sparklines via `ChartBlock` if Brief 221 has time, otherwise a follow-on. (Researcher §6: most CI tools use sparklines but they're hard to make legible at mobile width.)

### Interaction states

| State | Behaviour |
|-------|-----------|
| Loading | Skeleton card with three shimmer rows |
| No dispatches yet | Hide the card entirely. (Don't show "0% / 0 / 0" — it's noise.) |
| All runners healthy | Green-tinted card border |
| Any runner degraded | Amber card border + the offending runner row's status dot |
| All runners offline / unhealthy | Red border + "All runners need attention" CTA → `/projects/[slug]/runners` |

### `/admin` aggregate (lower priority)

If `/admin` ships in Brief 221: a single workspace-wide card that aggregates per-runner-kind. Rows: kind name, count of projects using it, success rate across projects, last 24h volume. Tap a row → drill into the per-runner deep view.

---

## 9. Cross-Surface Coherence

### Notification → action

The push-notification → `/review/[token]` → approve flow must work without ever opening Ditto's main app. (Researcher §8: GitHub Mobile sets the bar.) Push payload should include the work-item title + runner choice so the user can decide before they tap.

### Telegram parity

If Telegram bot is the user's preferred mobile surface (per Self's cross-surface coherence model in human-layer.md §Conversational Self), the `/review/[token]` URL should be linkable from Telegram messages and the dispatch-card should be embeddable in a Telegram message thread. **Out of scope for Brief 221** — flag as follow-on. But the `/review/[token]` URL must remain shareable / unauthenticated-by-token (already true).

### Trust-tier semantics carry through

- `supervised` → ALL dispatches mint a `/review/[token]`. The page renders the dispatch-pause variant with the "Run on:" selector + Approve/Reject. `runner_dispatches.status` stays `queued` until the user approves; on approve → `dispatched`.
- `spot_checked` (sampled-in) → same as supervised: token minted, page renders identically. The user has no signal that this dispatch was sampled-in vs always-supervised; the trust-tier nuance is server-side.
- `spot_checked` (sampled-out) → **no token is minted.** `runner_dispatches.status` advances `queued → dispatched` directly without a user-facing approval moment. The user sees only the runner-started inline card in conversation. (Optional UX: a small "auto-approved (sampled out)" tag on the inline card so the user can audit sampling decisions retrospectively. Architect's call.)
- `autonomous` → same as sampled-out: no token, no approval, runner-started card emitted directly.
- `critical` → dispatch rejected pre-flight per Brief 214 §D8. The user sees an error-state inline card ("Critical-tier work cannot dispatch via runners") with no approval option and no retry button.

The runner pill, runner-started cards, and metrics card render identically across all trust tiers — only the selector / approval surface is gated.

---

## 10. Open Questions for the Architect

1. **`/review/[token]` discriminator vs new route:** §6 above. Recommend: discriminated variant of existing route (one URL).
2. **Runner pill scope:** §5 — pill on `/projects/[slug]` only (Brief 221 mandate) vs also Today / Work compositions vs conversation inline. Recommend: build as a single component, consume in all three; whether all three ship in Brief 221 or one + follow-ons is your call.
3. **Metrics card location:** §8 — per-project on `/projects/[slug]` (recommended) vs workspace `/admin` only vs both.
4. **Edit @ desk action on `/review/[token]`:** §6 — stretch or core? Insight-012 says core; Brief 214 §D13 doesn't mention it. Recommend: stretch (minimum is Approve / Reject / selector / toggle).
5. **Auto-advance vs ask-the-human on retry:** §7 — recommend manual retry by default for `failed` / `rate_limited`, automatic for transient dispatch errors. Confirm the harness state machine in `packages/core/src/runner/` supports this distinction or needs an extension.
6. **`StatusCardBlock` extension vs new card type:** §7 — recommend extending `StatusCardBlock` with runner-specific metadata. Confirm the `metadata` field is permissive enough or whether a new variant is justified.
7. **Workspace shell for non-public surfaces:** the four surfaces here render outside the conversation workspace shell (no sidebar / right panel). `/projects/[slug]` already does this correctly (see `packages/web/app/projects/[slug]/page.tsx`); confirm `/review/[token]` retains its bare-shell pattern from Brief 106.

---

## 11. UX Patterns — Provenance Table

| Pattern | Source | Provenance level | Why |
|---------|--------|-----------------|-----|
| Status dot + label pill on row | GitHub Actions, Vercel deployment cards | **adopt** | Industry-standard; users recognise the pattern |
| Vertical radio stack for ≤4 options | Apple HIG / iOS form patterns | **adopt** | Outperforms dropdowns at all mobile sizes |
| Force-mode toggle below selector | Feature-flag toggle conventions (Fowler) | **adopt** | Familiar mental model: default-off override |
| Sticky bottom action bar | iOS / Android system convention | **adopt** | Thumb-reach optimisation |
| External "↗ Watch live in {service}" deep-link | Vercel Mobile, GitHub Mobile | **adopt** | Verb-led link copy avoids URL exposure |
| Single-button retry-next-in-chain | None — design gap (Researcher §4) | **original to Ditto** | Argo / GitHub Actions / Buildkite all have retry but none have "advance to next runner in declared chain" |
| "Run on:" selector inline with approval | None — design gap (Researcher §2) | **original to Ditto** | No CI / deploy tool surfaces a runner picker at approval time |
| Per-project compact metrics card (mobile) | Buildkite Insights, GitHub Actions Metrics (desktop only) | **pattern (mobile compaction is original)** | Compaction strategy is ours; KPIs are conventional |
| Edit @ desk action on review surface | Insight-012 (Ditto-internal) | **pattern (project-internal)** | Existing Ditto pattern; first-class extension to runner approval |
| `StatusCardBlock` metadata extension | Insight-138 (Ditto-internal) | **pattern (project-internal)** | Metadata-first is the Ditto convention for tool→block mapping |
| Discriminated `/review/[token]` payload | Brief 106 + 211 + 212 + 215 (Ditto-internal) | **pattern (project-internal)** | Reuse the existing review-token primitive instead of forking the URL space |

---

## 12. Acceptance Signals (UX-side, complementary to AC #16)

These are user-facing acceptance signals the Architect should reflect in the brief's ACs (alongside the existing mobile-viewport e2e at 375×667):

1. **Tap budget — approval flow:** ≤3 taps from push notification to dispatched (notification → tap → Approve). No taps required to change runner if default is correct.
2. **Tap budget — retry flow:** ≤2 taps from runner-failed inline card to next runner dispatched (card → "Retry on X").
3. **First-meaningful-paint on `/review/[token]`:** under 2 seconds on a phone over 4G. The selector and Approve button must both be on-screen without scroll on iPhone SE (320×568) — the smallest supported viewport.
4. **No horizontal scroll on any surface at 320–414px width** (iPhone SE through iPhone 14 Pro Max).
5. **External-link deep-links open in same window**, never new tab. (Verify with Playwright `popup` event count = 0.)
6. **Sticky action bar holds during scroll** on `/review/[token]` (Playwright bounding-box check after scroll = 0).
7. **Status dot colour is the only colour-coded affordance** on dispatch rows / pills. Background fills stay neutral (light grey / white) so the row reads cleanly against the workspace shell. Avoid the GitLab orange-ambiguity issue (Researcher §1).
8. **All copy uses user-facing terminology** from §4 — no occurrences of `claude-code-routine` / `local-mac-mini` / `attemptIndex` / `runner_kind` strings in any rendered surface (verify with a Playwright `page.locator` exclusion check). Internal slugs are server-only.
9. **Empty-state on metrics card is hidden, not zeroed.** (Don't render "0% success / 0 dispatches" — the card is absent entirely until the project has its first dispatch.)
10. **Push-notification-driven entry** (Brief 220 owns the deploy-gate notifications; Brief 221's `/review/[token]` notifications are a separate signal) reaches the approval surface in ≤2 taps, no app-shell load. Confirm with Architect whether Brief 221 needs its own push-trigger or rides Brief 220's infrastructure.

---

## 13. Reference Doc Status

Reference docs **checked**: no drift found that requires update from this Designer pass.

- `docs/personas.md` — Rob persona's mobile day already covers the founder's dogfooding scenario; no update needed.
- `docs/human-layer.md` — six human jobs framework, ContentBlock catalog, mobile-experience subsection all current. The runner-pill / runner-status card recommendation extends `StatusCardBlock`, which is already cataloged. No new primitive proposed.
- `docs/insights/011-mobile-is-operate-mode.md` — runner UX is squarely in Operate mode; consistent with insight.
- `docs/insights/012-edit-at-desk-is-first-class.md` — extension to the runner approval surface is recommended (§6).
- `docs/insights/138-metadata-first-block-mapping.md` — runner-status-handler metadata extension follows this pattern.
- `docs/architecture.md` — §L6 Human Layer text doesn't yet name runners specifically; Brief 214's parent-level draft amendment (§"Reference doc updates") will add the L2 + L3 paragraphs. No additional Designer-driven amendment required.

---

## 14. Handoff to Architect

The Architect synthesises this spec with:

- Brief 214 §D13 (the parent-brief UX section) — terms-of-reference
- Brief 215 / 216 / 217 / 218 (already-shipped substrate) — what's currently behind the four surfaces
- This spec — what the user experiences

**Specific Architect calls to make** (numbered for traceability):

1. Resolve §6 — `/review/[token]` discriminated variant vs new route. Recommend: variant.
2. Resolve §5 — runner-pill scope (project-detail-only vs Today/Work also).
3. Resolve §8 — metrics card location.
4. Confirm §7 — extend `StatusCardBlock` metadata (or new card type) for runner-status inline cards.
5. Resolve §6 — Edit @ desk action core vs stretch.
6. Resolve §7 — auto-advance vs manual-retry default for failed/rate-limited dispatches.
7. Confirm push-notification trigger for `/review/[token]` Brief 221 vs Brief 220.

The brief body Brief 221 produces should consume this spec as its "User Experience" section, expanded with technical-implementation detail (component file paths, API contracts, types).

---

**Spec status:** Ready for Architect synthesis.

---

## 15. Reviewer Pass — 2026-04-27

A separate Reviewer agent reviewed this spec against `docs/architecture.md`, `docs/human-layer.md`, `docs/personas.md`, `docs/review-checklist.md`, Brief 214, and key insights (107, 119, 138, 209, 011, 012). **Verdict: approve-with-revisions.**

Three critical issues were raised and **all three have been addressed in this revision:**

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Runner-pill primitive type ambiguous (ContentBlock vs React component) — risked Insight-107 violation | §5 process-architecture recommendation table now splits cleanly: admin surface = React component over admin fetch (not a ContentBlock); conversation inline = `StatusCardBlock` metadata extension. Single shared `<RunnerPillView>` leaf consumed by both. No new ContentBlock type invented. |
| 2 | `/review/[token]` discriminator ambiguous (object kind vs `TrustAction`) — risked silent divergence from Brief 214 §D8 trust contract | §6 now explicitly states the discriminator is on **review-page object kind** (Brief 106 vs runner-dispatch-pause vs file-write-supervised vs future), NOT on `TrustAction`. Trust tier governs whether a token is minted, not what's rendered when one is. |
| 3 | `StatusCardBlock` metadata extension scope underspecified — risked uncontrolled `if (metadata.X)` proliferation in renderers | §7 now defines the metadata field contract (required + optional + not-in-metadata), the single explicit renderer fork (`metadata.runnerKind` → runner template, else generic), and a constraint that future block subtypes follow the same pattern. Architect to confirm the conditional stays bounded. |

Minor issues addressed:

- §9 — clarified token semantics across all four trust tiers (sampled-out gets no token; supervised + sampled-in get identical pages; autonomous gets no token; critical rejected pre-flight).
- §6 — clarified the "Force local" disclosure is reachable at all viewport widths via "More options ▾" chevron, not hidden.

Minor issues left for the Architect:

- §6 — Edit @ desk action core vs stretch. Reviewer agreed with stretch framing; Architect decides at brief-write time.
- §12 AC #3 — "selector + Approve button on iPhone SE 320px without scroll" needs Playwright bounding-box assertion. Brief 221 should encode this explicitly in its ACs.

Reviewer strengths preserved:

- Six human jobs exhaustiveness (§3)
- User-facing terminology mapping (§4)
- Mobile-first verifiable acceptance signals (§12)
- Provenance discipline (§11)
- Reference-doc integrity check (§13)

Spec is ready for Architect synthesis.
