# Brief 209: User-Facing Apps — Phase Design (Parent Brief)

**Date:** 2026-04-21
**Status:** ready
**Depends on:** ADR-040 (this brief is the build-out of ADR-040); Brief 200 (Workspace Git-over-HTTPS Server — delivery substrate, at `ready` status per state.md — MUST be complete before sub-brief 210 starts)
**Unlocks:** Jordan persona JTBD-J4; Rob customer-intake latent JTBD; Nadia team-dashboard latent JTBD; ADR-009 `external` output type manifest path

<!--
Parent brief per brief-sizing rule (docs/dev-process.md:179–194, originated as Insight-004, now absorbed) sizing rule.
Sub-briefs 210–213 are named and seamed here; their full bodies are written by
a subsequent Architect session after this parent is human-approved.
The parent brief remains the coherent design reference.
-->

## Goal

- **Roadmap phase:** User-Facing Apps (new phase — to be slotted by PM into `docs/roadmap.md` after User-Facing Legibility phase per state.md current framing)
- **Capabilities:** Activate ADR-009's `external` output type as a first-class primitive called *App*. Ship the primitive + substrate + conversational author flow + inbound routing + sidebar surface such that Jordan can stand up a web-facing thing — portal, form, dashboard, or landing page — in under a working day.

## Context

The Designer's persona-grounded coverage matrix (`docs/research/tool-coverage-by-persona-ux.md` §Part 1, G5) identified app-building as an absent persona JTBD. User steer (2026-04-21) confirmed: (a) this is a persona JTBD, and (b) fulfilment is via *a lightweight framework designed and maintained by Ditto* — not v0 / Lovable / Bolt.new adoption.

ADR-040 resolves the architectural questions (primitive shape, lifecycle, storage, security, engine/product boundary, trust model, relationships to existing primitives) and defers concrete build decisions to this brief. Sub-briefs decompose the build along natural dependency seams.

The substrate (json-render catalog → registry → renderer) is already adopted per ADR-009 §3 for view-type outputs. Brief 200 (Workspace Git-over-HTTPS Server, currently `ready`) is the delivery mechanism. Most of the substrate is in place; this phase is primarily about *activation + the App-specific surface*.

## Objective

A new workspace user can, by conversation with Self, define an App, preview it on mobile + desktop frames inline, deploy it to a shareable URL, receive real submissions that flow as work items into their Inbox, iterate via conversation, and roll back by asking Self to *"revert to last week's version"* — all within one working day, with the authoring conversation feeling like the first-process flow (no forms, no code, no tool choices).

## Non-Goals

Scoped out to keep the phase tractable (per brief-sizing rule (docs/dev-process.md:179–194, originated as Insight-004, now absorbed) sizing; explicit non-goals prevent scope creep):

- **Custom / user-chosen domain deployment** (v1 URL shape is `{workspace-url}/apps/<slug>`; custom domains are future ADR-041 territory — named-trigger parked until first user requests it).
- **Public dashboards with access-control (beyond opaque-URL-is-the-secret).** Private per-identity dashboards require signed-token model; out of scope for v1.
- **Inbound webhooks from external services.** Apps v1 receives end-user form submissions only. External-service inbound (Stripe webhooks, etc.) is a separate primitive.
- **Per-visitor memory / cognition.** Apps are stateless artifacts. Apps-as-agent-front-ends (per-visitor conversations, memory) is a follow-up.
- **Collaborative simultaneous editing.** One editor at a time; merge via YAML + git if two editors produce conflicting drafts.
- **App marketplace / template sharing between workspaces.** Post-MVP.
- **Automatic responsive-design beyond the catalog components' built-in breakpoints.** Catalog components ship mobile-responsive; no layout-automator.
- **Arbitrary HTML / JS in app specs.** Forbidden per ADR-040 §9; catalog is the only component source.
- **Paid-hosted tier / rate-limit-beyond-default.** Per-app limits are the v1 model; per-workspace aggregate tier is later.
- **Integration with ADR-037 Hired Agents runtime** (an app that calls a hired agent per submission). App's classifier is process-based in v1.
- **Internationalisation of app specs / submissions.** Copy and field labels are single-language per app in v1. No locale switcher, no per-visitor translation.
- **Submission funnel analytics beyond count.** Per-app dashboards show `total submissions`, `last-24h submissions`, `error count`; no drop-off tracking, no A/B testing, no conversion-funnel visualisation.
- **End-user search over submitted forms.** Submission log is filesystem-legible + queryable by the owner in their Inbox; not exposed as a searchable surface to end users.
- **Per-submitter identity (OTP / email verification).** V1 submissions are identified by filled-in fields only; no email-OTP, no phone-verification, no login. Spam is handled by rate-limit + optional captcha.
- **Mobile authoring.** The authoring conversation is desk-first per Designer G5; v1 does not support a usable app-build flow on a phone. If a user starts authoring on mobile, Self proposes deferred-to-desk (ties into G2 if/when that ships).
- **Public-app enumeration hardening beyond opaque-URL-is-the-secret.** Slugs are user-chosen; guessable slugs are an owner's choice. No adversarial-slug-generation in v1.

## Inputs

1. `docs/adrs/040-user-facing-apps-primitive.md` — the ADR this brief builds out (primary reference)
2. `docs/adrs/009-runtime-composable-ui.md` — §3 (json-render substrate) + §1 (`external` output type); the activation target
3. `docs/adrs/037-hired-agents-primitive.md` — YAML-primary + DB mirror + conversational-author pattern; Brief 201 structure (parent brief + sub-briefs) is the shape-template for this phase
4. `docs/briefs/200-workspace-git-server.md` — delivery substrate; must be complete before sub-brief 210 starts
5. `docs/research/tool-surface-landscape.md` — current tool-surface inventory (apps add ~5 new Self tools; must not collide with existing 32)
6. `docs/research/tool-coverage-by-persona-ux.md` — Designer G5 interaction states (authoritative UX contract for this phase)
7. `docs/insights/201-user-facing-legibility.md` — filesystem-legible storage constraint
8. `docs/insights/084-prototyping-is-first-class-process.md` — design principle Apps extend to production
9. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — invocation-guard for deploy / rollback / submission-handler tools
10. `packages/core/src/content-blocks.ts` — ContentBlock registry; `AppProposalBlock` is a new discriminated-union member (currently 26; becomes 27)
11. `src/engine/self-delegation.ts` — Self tools array; 5 new tools to add
12. `src/engine/tool-resolver.ts` — built-in tool registry; submission-classifier dispatch target
13. `integrations/00-schema.yaml` — no new service needed; Apps aren't an integration
14. `packages/web/components/layout/sidebar.tsx` — Apps becomes a new sidebar item + composition intent
15. Existing json-render substrate in `packages/web/components/blocks/` — reuse renderer; add second registry

## Constraints

Honoured from ADR-040 (repeated here for builder reference):

- **Engine-first discipline:** The App primitive's core types, schema, renderer, lifecycle, and inbound contract go in `packages/core/src/apps/`. Ditto-specific opinions (the `ditto-default` catalog, external-registry React components, Self tools, sidebar UI) go in `src/engine/apps/` + `packages/web/`.
- **Catalog is the security boundary.** No arbitrary HTML / JS / CSS in specs. Submission payloads validated against catalog schema server-side before storage.
- **Apps are durable, not regenerated.** Once deployed, end users see the deployed spec. No LLM calls per visit.
- **YAML primary, DB mirror.** Reconcile on boot + on conversational-author.
- **Invocation guard (Insight-180-steprun-guard):** tools producing external side effects (`deploy_app_version`, `rollback_app_version`, submission-classifier handler) MUST require `stepRunId`. Canonical publishing tool is `deploy_app_version`; there is **no** separate `publish_app` tool (ADR-040 §10 specifies six Self tools total: `create_app`, `preview_app`, `deploy_app_version`, `rollback_app_version`, `app_history`, `app_status`).
- **CORS posture:** submission endpoint accepts cross-origin POSTs by design; rate-limit + optional captcha + spec-schema validation are the ingress controls. Authenticated Ditto endpoints retain existing same-origin cookie-auth.
- **CSRF posture:** submissions are unauthenticated; no session to ride. Clickjacking mitigated via `X-Frame-Options: DENY` by default on app pages; relaxable to per-app explicit-origin allowlist.
- **Drizzle migration-journal discipline (Insight-190):** new tables `apps`, `app_versions`, `app_submissions` go through `drizzle-kit generate`; journal `idx` values reserved + SQL + snapshot pair verified per table. Sub-brief 210 must include a migration-journal sanity AC.
- **Deploy/rollback audit trail:** every `deploy_app_version` and `rollback_app_version` invocation writes an `activities` table row (mirrors Brief 200's `clone_credential_issued` pattern). Per-version `manifest.json` is the local-legibility record; `activities` is the time-travelable audit log.
- **Credential never leaves Ditto.** Apps do not render credential-bearing data client-side. Credentials used only in server-side classifier process runs.
- **Submission ingress always accepted** (assuming rate-limit + spam checks). Trust applies to outbound auto-responses only.
- **Filesystem legibility.** `apps/<slug>/` directory structure per ADR-040 §2 is user-inspectable, grep-able, diff-able.
- **No user-chosen domains in v1.** Workspace sub-path URL only.
- **Catalog stays v1-minimal.** 13-ish components targeted; additions are follow-up work, not this phase.
- **First-app onboarding does not auto-propose.** v1 user initiates the authoring conversation; Self does not volunteer "hey, want an app?" (unlike first-process proposal which is conversation-initiated by Self per ADR-016 onboarding flow). Revisit if dogfood reveals a stronger user need.
- **No shipping without Brief 200.** Delivery substrate must be live.

## Provenance

| What | Source | Level | Why this source |
|---|---|---|---|
| Catalog → registry → renderer substrate | json-render (Vercel Labs) `packages/core/src/schema.ts`, `packages/react/src/renderer.tsx` | **adopt** (extends ADR-009 adoption) | Already adopted for view-type outputs; Apps add a second registry (external-app) on the same catalog |
| Primitive activation pattern | Ditto `docs/adrs/037-hired-agents-primitive.md` + Paperclip `packages/db/src/schema/agents.ts` | **pattern** | Ditto-original shape (ADR-037) which itself adopted-and-adapted Paperclip — App uses the same YAML-primary + DB-mirror shape |
| Versioning + rollback model | Ditto `src/engine/self-tools/edit-process.ts` + Paperclip `agent_config_revisions` | **pattern** | Existing Ditto pattern for versioned primitives (processes have `process_history` + `rollback_process`); same shape applies |
| Delivery substrate | Ditto `docs/briefs/200-workspace-git-server.md` | **depend** | Already designed + ready; Apps are served through it |
| Conversational authoring flow | Ditto ADR-016 + ADR-037 hire-as-conversation | **pattern** | Ditto-original; Apps extend to a new primitive class |
| `AppProposalBlock` inline preview | Ditto `HireProposalBlock` (Brief 201 / ADR-037) | **pattern** | Sibling content-block pattern; adapted for App spec preview |
| Submissions-as-work-items routing | Ditto existing `work_item` primitive + `create_work_item` Self tool `self-delegation.ts:233` | **extend** | No new primitive — Apps' submissions flow as work items through existing infrastructure |
| Inbound spam-protection | Cloudflare Turnstile or hCaptcha (research required in sub-brief 212) | **depend** (optional per-app) | Standard web-form bot protection; only loaded when app has `spamProtection: turnstile\|hcaptcha` set |
| Filesystem-legible submissions | Ditto Insight-201 + Brief 199 memories projection | **extend** | Apps' submissions inherit the legibility model |

## What Changes (Work Products)

Per sub-brief. Parent brief doesn't itself ship files — sub-briefs do. The table below names the seams.

| Sub-brief | Work product scope | Size estimate (ACs) |
|---|---|---|
| **210 — App primitive + substrate (skeleton)** | `packages/core/src/apps/types.ts`, `schema.ts`, `renderer/`, `lifecycle.ts`, `inbound.ts`, `registry-contract.ts` + Drizzle migration + boot reconciler. v1 catalog (`src/engine/apps/catalog/ditto-default.ts`, **22 components** per sub-brief 210 §Appendix B — resolves ADR-040 §11 open question #1) + external-app registry (React impls in `src/engine/apps/external-registry/`). Unit tests for catalog schema + renderer + lifecycle. **No UI yet.** Sub-brief 210 written 2026-04-21, status `draft`. | 17 (upper bound) |
| **211 — Conversational authoring + preview + deploy** | 5 Self tools in `src/engine/apps/self-tools.ts`: `create_app`, `preview_app`, `deploy_app_version`, `rollback_app_version`, `app_history`. `AppProposalBlock` new ContentBlock type (27th) in `packages/core/src/content-blocks.ts` + renderer `packages/web/components/blocks/app-proposal-block.tsx`. Authoring conversation flow + preview iframe (mobile + desktop frames side-by-side on desktop; tabs on mobile). Deploy-to-URL wiring through Brief 200's server. | ~15 |
| **212 — Inbound routing + submissions as work items** | `POST /apps/<slug>/submit` endpoint in `packages/web/app/api/v1/apps/`. Submission validation (Zod vs catalog schema). Rate-limit + optional spam-protection (Turnstile / hCaptcha). Per-app classifier dispatch (default: Self intake-classifier via `src/engine/system-agents/intake-classifier.ts`; swappable per app). `work_item` creation from submission. Filesystem legibility (`apps/<slug>/submissions/YYYY-MM/`). Activity log entries. | ~13 |
| **213 — Apps sidebar surface + health monitoring** | `compositions/apps.ts` (new composition intent). Sidebar item "Apps" below "Routines". AppDetail page with tabs: Overview / Versions / Submissions / Configuration / Activity. StatusCardBlock per app in Apps composition (usage, submission count, error count). Morning brief integration: apps with pending-review submissions appear in Today. Empty state per `composition-empty-states.ts` pattern. | ~12 |

**Sub-brief 210 is the critical path.** 211 / 212 / 213 can partially overlap after 210 merges, but 211 needs 210's tools + types; 212 needs 210's inbound contract + 211's deploy surface; 213 needs 212's submission data.

## User Experience

- **Jobs affected:** Define (describe the app by conversation), Delegate (trust an app to serve users without daily review), Decide (iterate from feedback + roll back). Latent: Orient (monitoring app health in morning brief), Capture (end users' submissions become work items).
- **Primitives involved:** ProcessProposalBlock pattern (inspiration for AppProposalBlock — new 27th ContentBlock), ActionBlock (deploy / rollback buttons), StatusCardBlock (app health), SuggestionBlock (rollback + teach-pattern), ReviewCardBlock (submission review for supervised apps), new Apps sidebar composition intent.
- **Process-owner perspective:** They describe an app by conversation (*"I need a page where HR candidates can submit their references"*). Self asks 2-4 clarifying questions (kind, fields, what happens to submissions). AppProposalBlock renders inline with mobile + desktop preview frames — scrollable, tappable, realistic. They approve with one action; the URL is returned with a QR code for SMS-sharing (for Rob). Iteration is conversational (*"make the phone-number field required", "add a confirmation page", "change the button to say 'Send request'"*). Rollback is a single suggestion (*"revert to last week's version"*). Submissions arrive as work items in Inbox, filtered by supervised trust tier (first 5 get full review; then spot-checked; then autonomous).
- **Interaction states:**
  - *Authoring:* Define (Self asks) → Preview (AppProposalBlock inline) → Edit (conversational) → Deploy (ActionBlock) → Live (URL + QR).
  - *Running:* Healthy (green StatusCardBlock, submission count) → Attention (amber — submissions need review or error rate spike) → Degraded (red — deploy failed or classifier failing).
  - *Iteration:* Conversational edit → Preview updates → Deploy (creates new version) → Prior version still available.
  - *Rollback:* SuggestionBlock surfaces prior versions → One-tap revert → New work item logged *"rolled back to vN"*.
  - *Deferred-to-desk:* If user on mobile starts an authoring conversation (which expects desk), Self proposes *"want to finish at your desk later?"* — ties into G2 spec's deferred-to-desk primitive (if/when that ships separately).
  - *Empty state:* User with zero apps sees Apps sidebar empty state with a SuggestionBlock *"Describe what your customers or colleagues need — a form, a portal, a dashboard."*
- **Designer input:** `docs/research/tool-coverage-by-persona-ux.md` §Part 4 G5. **Authoritative** — builder MUST match the state vocabulary (Define / Preview / Deploy / Running / Inbound / Iterate / Rollback / Teach-pattern). No deviation without Designer re-invocation.

## Acceptance Criteria (phase-level)

These are phase-completion gates; each sub-brief has its own 8-17 ACs.

1. [ ] ADR-040 human-approved and merged before sub-brief 210 starts.
2. [ ] All four sub-briefs (210, 211, 212, 213) completed and merged.
3. [ ] Brief 200 (Workspace Git-over-HTTPS Server) complete and deployed; Apps delivery uses it without ad-hoc infrastructure.
4. [ ] ADR-009 is referenced (not silently superseded) — the `external` output type language is preserved; Apps are explicitly described as activating it.
5. [ ] `@ditto/core` boundary honoured: `packages/core/src/apps/` contains no Ditto-specific imports; consumer test ("could ProcessOS use this?") passes for all core code.
6. [ ] Type-check passes at root (`pnpm run type-check`) after each sub-brief merges.
7. [ ] Invocation guard (Insight-180) enforced on `deploy_app_version`, `rollback_app_version`, and the submission-classifier handler — calls without `stepRunId` throw at runtime; unit-tested per sub-brief.
8. [ ] `DITTO_TEST_MODE=true` suppresses actual deploys (writes YAML + DB mirror but does not register the workspace-git route).
9. [ ] Filesystem legibility verified: after an end-to-end smoke test, `apps/<slug>/app.yaml`, `apps/<slug>/versions/v001/spec.json`, and `apps/<slug>/submissions/YYYY-MM/*.json` are all human-readable with no credential substrings.
10. [ ] Smoke test passes (see Smoke Test below) end-to-end with at least one real app Rob could use (customer-intake form) and one Jordan could use (HR reference portal).
11. [ ] Apps sidebar surface appears only for workspaces with ≥1 app (empty-state-first pattern); no empty nav clutter.
12. [ ] `AppProposalBlock` renders correctly on both desktop (side-by-side mobile + desktop frames) and mobile (tabbed frames).
13. [ ] No new credential types added; Slack / email / webhook sends triggered by submissions use existing integration registry per ADR-031.
14. [ ] Trust-tier posture: first 5 submissions per app surface as work items in supervised state by default (per persona emotional journey at `personas.md:290`).
15. [ ] Apps with pending-review submissions appear in Today composition morning brief (integration with existing briefing per ADR-016).
16. [ ] Rollback by conversation works: saying *"revert to last week's version"* to Self surfaces a SuggestionBlock; tapping it restores the prior version.
17. [ ] Post-phase landscape.md update: the json-render entry gets a cross-reference note about the second registry (external-app); Paperclip entry gets a note about the versioning shape transfer.
18. [ ] **Tool-name uniqueness** verified at sub-brief 211 merge: the six new Self tools (`create_app`, `preview_app`, `deploy_app_version`, `rollback_app_version`, `app_history`, `app_status`) do NOT collide with any existing Self tool name in `src/engine/self-delegation.ts` or built-in tool name in `src/engine/tool-resolver.ts`. Verified via grep at merge time.
19. [ ] **Drizzle migration-journal discipline** verified at sub-brief 210 merge: new tables `apps`, `app_versions`, `app_submissions` each have matching `drizzle/NNNN_*.sql` file + `drizzle/meta/_journal.json` entry + snapshot pair. Journal `idx` values are sequential with no gaps or collisions. (Insight-190.)
20. [ ] **Teach-pattern detector** shipped at sub-brief 213 merge: recurring conversational edits across an app's version history (e.g. user keeps adding a postcode field on every new app) surface as SuggestionBlocks in Self's proactive suggestions, matching Designer G5 "Teach-pattern" state semantics.
21. [ ] **ADR-009 cross-reference** updated in same session as ADR-040 approval: `docs/adrs/009-runtime-composable-ui.md` gains a footer line *"**ADR-040** activates the `external` output type declared in §1."* Per Insight-043 (Architect owns ADR accuracy). This is a gate before sub-brief 210 starts, not at phase end.

**21 ACs — above the 8-17 band for a single build brief.** This is deliberate for a **parent brief**: these are phase-level gates spanning 4 sub-briefs, not a single build session. Sub-briefs 210–213 each ship with 8-17 of their own ACs per `docs/dev-process.md:179-194` (brief sizing rule, originated as Insight-004, now absorbed).

**For briefs that modify process YAML `tools:` declarations (Insight-180):** Sub-brief 211 adds tools; it MUST verify every tool name in its YAML / Self tools array has a matching entry in `src/engine/tool-resolver.ts` builtInTools or is resolvable via the integration registry. This AC is replicated in sub-brief 211.

## Review Process

1. Spawn review agent with this brief + ADR-040 + `docs/architecture.md` + `docs/review-checklist.md` + Researcher report (`tool-surface-landscape.md`) + Designer spec (`tool-coverage-by-persona-ux.md`).
2. Review agent checks:
   - ADR-040 + this brief are internally consistent (nothing in the brief contradicts ADR-040; nothing in ADR-040 lacks a build surface in this brief)
   - Sub-brief decomposition honours one-seam-per-brief rule (brief-sizing rule (docs/dev-process.md:179–194, originated as Insight-004, now absorbed))
   - UX spec G5 interaction states are all addressed somewhere in sub-briefs
   - Engine/product boundary is clean (`@ditto/core` consumer test)
   - No new security surface (public URL + submissions) is introduced without the security constraints in ADR-040 §9 being explicit in sub-briefs
   - Brief 200 dependency is pre-requisite, not parallel — sub-brief 210 cannot start without it
   - Non-goals list is thorough; no scope-creep opportunities leak in
   - Rob / Jordan / Nadia personas each get addressed in the Smoke Test (G5 notes all three have variants)
   - Trust-tier model for Apps (§7 of ADR-040) doesn't accidentally override ADR-007
3. Present work + review findings to human for approval.

## Smoke Test

Phase-completion smoke test — exercised at the end of sub-brief 213 merge (i.e., phase-complete):

```bash
# Prerequisite: Brief 200 deployed; fresh workspace; user has Self access.

# 1. Type-check
pnpm run type-check

# 2. Unit tests across all four sub-briefs
pnpm test src/engine/apps
pnpm test packages/core/src/apps
pnpm test packages/web/components/blocks/app-proposal-block.test.tsx
pnpm test packages/web/app/api/v1/apps

# 3. End-to-end scenarios (one per persona):

# Scenario A — Jordan's HR reference portal
# User conversation with Self (manual via web UI):
#   "I need a portal where HR can submit reference requests for candidates."
# Expected:
#   - Self asks 2-4 clarifying questions (kind=portal? required fields? submission destination?)
#   - AppProposalBlock renders inline with mobile + desktop preview
#   - User approves; URL returned: {workspace-url}/apps/hr-references (or similar slug)
#   - Visiting URL in an external browser shows the portal
#   - Submitting a test form creates a work_item in Inbox with correct labels
#   - First 5 submissions appear as supervised-tier work items
#   - apps/hr-references/app.yaml + versions/v001/spec.json + submissions/2026-04/*.json all readable

# Scenario B — Rob's customer quote-request page
#   "I need a page where customers can request a quote. Needs photos and postcode."
# Expected:
#   - Same flow; kind=form
#   - file-upload component appears in catalog; photo upload works
#   - QR code surfaces with URL after deploy (for SMS pasting)
#   - Submission creates work item tagged with postcode + attached photos

# Scenario C — Nadia's team status page
#   "I need a page my team can bookmark to see what's in flight across our projects."
# Expected:
#   - kind=dashboard; display-only
#   - Trust tier field is effectively inert for display-only apps (no outbound behaviour to gate) per ADR-040 §7
#   - Public via opaque-URL-is-the-secret (per ADR-040 §9); workspace team can bookmark
#   - Data rendered via the external-app registry's read-only display components; no server-side credential access from rendered client

# 4. Trust + rollback exercise:
#   After 5 submissions on Scenario A, ask Self: "adjust_trust for hr-references to spot-checked"
#   Expected: SuggestionBlock confirms with evidence (5/5 clean), accept, trust tier updates
#   Then: "revert the hr-references app to last week's version"
#   Expected: SuggestionBlock lists versions; accepting v001 restores it; new work_item logs rollback

# 5. Security check:
#   grep -r "xoxb-\|sk_\|Bearer " apps/  # must return nothing
#   Submit malicious payload (<script>alert(1)</script>) — must be sanitized in UI and in submission JSON
#   Rate-limit: 6th submission from same IP within an hour rate-limited (returns 429)

# 6. Workspace transfer:
#   Git-commit the workspace; clone elsewhere; boot — apps reconcile from YAML; URLs work
```

## After Completion

1. Update `docs/state.md` — phase complete; Apps available; retrospective captured
2. Update `docs/roadmap.md` — move Apps phase to "Recently Shipped"
3. Update `docs/landscape.md` — json-render entry gets the second-registry cross-reference note per AC #17
4. Update `docs/human-layer.md` — add App primitive section (new primitive), G1-G5 states table entry for G5, Apps composition intent in the sidebar table
5. Update `docs/dictionary.md` — add *App*, *App version*, *App submission*, *App catalog*, *External-app registry*
6. Confirm `docs/adrs/009-runtime-composable-ui.md` cross-reference (AC #21) is in place; if ADR-009 gained further activations after ADR-040 (e.g. new output-type primitives), add those too per Insight-043
6. Phase retrospective — what worked (sub-brief seams?), what surprised, what to change for future activations of dormant architecture primitives
7. **Named-trigger parking for follow-up work:**
   - **Custom / user-chosen domain (ADR-041):** write when first user requests it
   - **App marketplace / template sharing:** write when 10+ apps shipped by 3+ workspaces
   - **App-as-agent-front-end:** write when first user requests per-visitor memory
   - **Trust-tier-driven catalog richness** (extension of ADR-009 §4 to apps): write if dogfood shows richer-component-at-higher-trust is valuable
   - **Per-workspace aggregate rate-limit tier:** write at the first abuse incident or when first self-hosted deployment requests it

## Sizing Note (brief-sizing rule (docs/dev-process.md:179–194, originated as Insight-004, now absorbed) Compliance)

This is a **parent brief** with **17 phase-level ACs** (upper bound of the 8-17 band). Body complexity is managed via four sub-briefs along named seams. Each sub-brief should land at 12-15 ACs, single-subsystem, one build session. Total phase estimate: 4 sub-briefs × one build session ≈ one dev-week with reviewer gates between each.

Parent-vs-sub-brief pattern mirrors Brief 201 + sub-briefs 202-206 (Hired Agents phase). That precedent is the shape-template.

## Sub-brief bodies

**Not written in this Architect session.** Sub-briefs 210, 211, 212, 213 have their seams and AC counts declared above; bodies are produced by a subsequent Architect session after ADR-040 + this parent brief are human-approved. This respects the parent-then-sub-brief sequence and keeps each Architect session within brief-sizing rule (docs/dev-process.md:179–194, originated as Insight-004, now absorbed) sizing.
