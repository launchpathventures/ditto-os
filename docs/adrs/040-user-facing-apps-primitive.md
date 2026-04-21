# ADR-040: User-Facing Apps — Activating ADR-009's `external` Output Type as a First-Class Primitive

**Date:** 2026-04-21
**Status:** accepted
**Depends on:** ADR-009 (Process Output Architecture — `external` output type), ADR-007 (Trust-Earning), ADR-037 (Hired Agents — primitive-activation pattern), Brief 200 (Workspace Git-over-HTTPS Server — delivery substrate)
**Paired with:** Parent Brief 209 (User-Facing Apps phase)

## Context

### The persona need (confirmed via user steer 2026-04-21)

Jordan's JTBD-J4 (per `docs/research/tool-coverage-by-persona-ux.md` §Part 1) — *"stand up a web-facing thing (portal, form, dashboard) in a couple of days"* — has no current fulfilment path. Every output in Ditto's inventory renders **inside** Ditto's own workspace (composition intents, ReviewCardBlocks, artifact mode). There is no primitive for *"a thing that lives at a URL my customers, colleagues, or department heads can navigate to without a Ditto account."*

The user has steered this explicitly: the fulfilment is to be **a lightweight framework designed and maintained by Ditto** — not adoption of v0 / Lovable / Bolt.new / Replit Agent. Ditto owns the primitive.

### What's already architecturally decided

ADR-009 v2 §1 declares a `external` output type defined as *"out in the world — deployed app, published website, configured SaaS instance"* (`docs/adrs/009-runtime-composable-ui.md:82`). It has been conceptually present since 2026-03-23 but never activated as a primitive — no schema, no lifecycle, no authoring flow, no rendering substrate binding.

ADR-009 §3 already adopted **json-render** (Vercel Labs) as the catalog → registry → renderer substrate for `view`-type outputs (composition level: adopt). The same substrate is the natural mechanism for `external`-type outputs at a different deployment surface.

ADR-037 established the activation-pattern for a dormant architectural primitive: **YAML primary + DB mirror + conversational author flow + user-language primitive name + explicit per-persona mapping**. L2 Agent was dormant for ~18 months before ADR-037 activated it; this ADR does the same for ADR-009's `external` output.

Brief 200 (Workspace Git-over-HTTPS Server — currently at `ready` status per state.md) is the delivery substrate — apps are static-served from their spec through the workspace's own HTTP surface.

### What this ADR must resolve

Designer's Part 6 open question #6 (`tool-coverage-by-persona-ux.md`) lists seven sub-questions:

| Sub-Q | Decision needed | Where resolved in this ADR |
|---|---|---|
| (a) | Durable primitive vs regenerated-each-time? | §4 Lifecycle |
| (b) | Component catalog scope? | Deferred to Brief 209 (v1 catalog is build-time decision; shape is §3) |
| (c) | URL / domain? | §5 Deployment (v1 = workspace sub-path; user-chosen domain = future ADR) |
| (d) | Trust tier application to user-facing submissions? | §7 Trust Tiers |
| (e) | Submissions → work items routing? | §6 Inbound Routing |
| (f) | Relationship to `workspace.register_view` / `workspace.push_blocks`? | §8.workspace-views row |
| (g) | Relationship to Hired Agents (ADR-037)? | §8.hired-agents row |

## Decision

### 1. The App Primitive

An **App** in Ditto is a *persistent, versioned, user-facing artifact that lives at a URL and accepts inbound events from end users*. Apps are activations of ADR-009's `external` output type, raised to a first-class primitive alongside Processes (L1), Agents (L2 per ADR-037), and Memories (ADR-003).

User language: *"an app"* — same word as the public-domain concept. Not "portal," "form," "view," "deployment," or "artifact." Jordan says *"I need an app that lets HR submit reference requests"* — that's the primitive.

**Shape:**

| Field | Purpose |
|---|---|
| `id` | Stable UUID |
| `slug` | URL-safe identifier (`hr-references`, `quote-requests`) |
| `name` | User-given name (*"Reference Check Portal"*) |
| `kind` | Enum: `portal` / `form` / `dashboard` / `landing`. User-language hint; does not change runtime. |
| `description` | One-liner surfaced in Apps sidebar + process contexts |
| `spec` | Current app spec — component tree in the json-render format adopted in ADR-009 §3 |
| `catalog` | Which component catalog this app draws from (`ditto-default` v1; extensible later) |
| `version` | Integer, monotonic. `spec` always reflects `version`. |
| `inboundRouting` | Contract declaring how submissions route to work items (see §6) |
| `trustTier` | ADR-007 enum; governs outbound auto-response behaviour (see §7) |
| `status` | `draft` / `deployed` / `paused` / `archived` |
| `ownerId` | Workspace user who owns this app |
| `processScope` | Optional — process(es) this app is tied to for submission routing |
| `createdAt`, `deployedAt`, `updatedAt` | Timestamps |

**What an App is not:**
- Not a process (no cognitive loop, no step execution at render time)
- Not an agent (no runtime identity, no persistent memory, no ADR-038 supervisory observation)
- Not a workspace view (workspace views are *internal* — see §8)
- Not a live LLM call per request (end users see the deployed spec; no AI inference at visit time — see §4 + §9)

### 2. Storage — YAML primary, DB mirror (ADR-037 pattern)

**Source of truth:** one directory per app at `{workspaceRoot}/apps/<slug>/`:
```
apps/<slug>/
  app.yaml               # primitive config (fields from §1 except `spec`)
  versions/
    v001/
      spec.json          # component tree for version 1
      manifest.json      # timestamp, author, change summary
    v002/
      spec.json
      manifest.json
    ...
  submissions/           # inbound event log (write-only append; see §6)
    2026-04/
      20260421-1442-abc.json
  current.json           # { "activeVersion": "v003" } — pointer file (not symlink; Windows-portable; see §4)
```

Grep-able, diffable, user-inspectable — extends Insight-201's user-facing legibility default (already established for memories, processes, agents per ADR-037) to apps.

**DB mirror:**
- `apps` table — parsed from `app.yaml` for query performance (joins with `work_items`, `cost_events`)
- `app_versions` table — one row per version; stores `specJson` as large text for query-free rollback
- `app_submissions` table — one row per submission; foreign-keys to `work_items` created per §6

**Reconciliation:** engine boot walks `apps/*/app.yaml` and upserts mirrors. User hand-edits + workspace restart = DB catches up. Authoring via Self writes both sides simultaneously.

### 3. Framework Substrate — json-render catalog-constrained rendering (extends ADR-009 §3)

Apps use the same catalog → registry → renderer triad already adopted for view-type outputs, with a distinct deployment surface:

- **Catalog:** a named Zod-backed component vocabulary (v1: `ditto-default`). Same definition validates specs, generates AI authoring prompts, and produces JSON Schema. Catalog composition (base + extensions) is supported per json-render's pattern.
- **Registry:** **two** registries coexist under the same catalog:
  - *Workspace-internal registry* (already exists for ADR-009 view-type outputs) — renders inside Ditto's own UI, has access to Ditto-internal actions (push blocks, open process detail, adjust trust)
  - *External-app registry* (new per this ADR) — renders in the user's browser via workspace git-HTTPS delivery; actions are limited to `submit` / `navigate` / `read-only-display`; no Ditto-internal context leak
- **Renderer:** tree walker + streaming (during authoring preview) + static-serve at runtime (no LLM calls per visit)

**Constrained-catalog is the security boundary.** Arbitrary HTML/JS in app specs is explicitly forbidden (§9). The catalog is what protects against XSS and credential exfiltration.

### 4. Lifecycle — Durable primitive, not regenerated per visit

Apps are **durable, versioned artifacts**. This is the most important design decision and resolves Designer open-question (a):

- A new version is created on every deploy
- Prior versions are addressable via their version number
- Rollback is a **pointer switch** via `apps/<slug>/current.json` (not a symlink; `current.json` holds `{ activeVersion: "v003" }`). Symlinks were considered and rejected: workspace git clones must stay portable to Windows clients (git-on-Windows does not round-trip symlinks cleanly) — pointer-file is a cleaner fit for Insight-201 filesystem-legibility and Brief 200's git-over-HTTPS model. Pointer-file switch is atomic enough for v1's single-writer model.
- The submission log (`apps/<slug>/submissions/`) is preserved across versions — submissions are not tied to app-version lifecycle
- Specs are editable in place *through conversation*; the edit creates a new draft version which is previewed and optionally deployed
- End users see the deployed version — *no LLM call per visit*. Apps are served as static artifacts from their spec + registry
- **Streaming note:** the json-render renderer's progressive-rendering / streaming mode is used **only during authoring preview** inside Self's conversation (where the LLM emits spec deltas in real time). End-user visits load the final deployed spec in one pass — no streaming at runtime, no LLM contact.

**Why not regenerate-per-visit:**
- URL stability for users (can't bookmark a page that looks different every visit)
- Data integrity (submissions in progress can't be broken by a mid-stream regeneration)
- Trust governance (every regeneration would be a new unreviewed output — incompatible with trust tiers)
- Cost (LLM call per public visitor is prohibitive)
- Latency (static serve < 100ms; LLM serve ~2-5s — UX killer for forms)

Durable-primitive aligns with existing versioned-primitive patterns in Ditto: `process_history` + `rollback_process` (self-delegation.ts), `agent_config_revisions` (Paperclip, adopted in ADR-037). Apps extend the same shape.

### 5. Deployment — Workspace sub-path v1

**v1 URL shape:** `{workspace-url}/apps/<slug>` — served by the workspace git-over-HTTPS server (Brief 200). For example: `https://<user>.ditto.you/apps/hr-references`.

**Served content:**
- `GET /apps/<slug>` → static HTML page that loads the registry bundle and the spec for `current` version
- `GET /apps/<slug>/version/<n>` → same, but for a specific version (useful for previews and shareable version links)
- `POST /apps/<slug>/submit` → submission endpoint (see §6)
- `GET /apps/<slug>/health` → lightweight endpoint returning `{ status, version, schema-version }` (no sensitive data)

**Deferred to future ADR (user-chosen domain, v2):**
- Custom domain CNAME (`reference.jordans-company.com` → `jordan.ditto.you/apps/hr-references`)
- Subdomain allocation (`hr-references.jordan.ditto.you`)
- Rationale for deferral: v1 must prove the primitive works end-to-end before adding DNS + TLS-cert-automation surface. User-chosen domains require ADR-031 credential-platform extension for DNS proofs and Let's Encrypt flows. v1 ships with workspace-relative URLs; Jordan, Rob, and Nadia can still share these.

### 6. Inbound Routing — Submissions as work items

Every App declares an `inboundRouting` contract in its spec:

```yaml
inboundRouting:
  classifier: process:self-intake-classifier   # or: process:<custom-slug>
  workItemTemplate:
    title: "Reference request from {{ submission.candidateName }}"
    labels: ["reference-check", "hr"]
    initialStatus: "needs-triage"
  rateLimit:
    perIpPerHour: 5
    perAppPerHour: 100
  spamProtection: off | turnstile | hcaptcha
```

**Flow on submission:**
1. `POST /apps/<slug>/submit` receives the payload (form data + file attachments if declared in catalog)
2. Payload validated against the app's spec schema (catalog is the contract — server-side Zod validation)
3. Rate-limit + spam-protection checks (captchas optional per-app)
4. Submission appended to `apps/<slug>/submissions/YYYY-MM/` as JSON file (filesystem legibility per Insight-201)
5. Mirror row inserted in `app_submissions`
6. Classifier process invoked (defaults to Self's intake classifier; swappable per app)
7. `work_item` created with classifier-returned labels + title from template + submission reference
8. Work item flows into the process-owner's Inbox composition (existing infrastructure)

**Inbound is not trust-gated.** Submissions are always accepted (assuming rate-limit + spam checks pass). Trust applies to **outbound auto-responses** (§7), not to ingress — a supervised app still receives submissions; it just doesn't send a confirmation reply without human review.

### 7. Trust Tier Model (answers Designer sub-Q (d))

Extends ADR-007 trust tiers to Apps' **outbound auto-response behaviour**. Trust is **per-app**, independent of process trust:

| Tier | Outbound behaviour |
|---|---|
| `supervised` | All auto-responses (confirmation emails, follow-up messages) held for human review in owner's Inbox before sending. Display-only responses (in-browser "thank you" pages) always allowed. |
| `spot_checked` | Sampled auto-responses held (sampling rate per existing ADR-007 mechanics); others auto-send |
| `autonomous` | Auto-send all outbound; exceptions paused |
| `critical` | All outbound held + audit trail required (matches ADR-009 §4) |

**Reconciliation with ADR-007 upgrade mechanics.** ADR-007 governs *when an app's trust tier promotes* (≥10 runs, 0 rejections, ≥85% approval, plus grace period per `docs/adrs/007-trust-earning.md:37-46`). Those upgrade conditions apply wholesale to Apps — no new semantic introduced. The Designer's "first N supervised" emotional-journey shape in `personas.md:286-290` maps to **where an App starts** (supervised tier for new apps), not to a new upgrade trigger. The tier table above is the ADR-040-specific *application* of a tier; the promotion mechanism remains ADR-007's.

**Why `supervised` is the default for new Apps.** New apps start at `supervised` so the owner reviews outbound auto-responses while trust is established. Inbound ingress is always accepted (below) — the owner sees *submissions* in their Inbox regardless of tier. This matches the persona emotional-journey arc at `personas.md:286-290` (*"cautious hope → building confidence → trust forming"*).

**Read-only dashboard apps** (kind=dashboard, no outbound auto-responses, no submission-triggered integrations) have no outbound behaviour for trust to govern; their trust-tier field is effectively inert in v1. A future tier-application axis (e.g. "data-freshness guarantees") may add meaning for this kind; out of scope for v1.

**Not trust-gated:** submission ingress, in-browser display of "thank you" / error states, display of dashboard data drawn from the owner's workspace.

**Always trust-gated:** outbound auto-responses (emails, SMS, webhooks to end users), data transforms that touch external integrations.

### 8. Relationships to existing primitives

| Existing primitive | Relationship |
|---|---|
| `workspace.register_view` + `workspace.push_blocks` (per Researcher inventory `tool-resolver.ts:870,920`) | **Siblings, not generalisation.** Workspace views are *internal* (logged-in Ditto user, access to internal context and actions). Apps are *external* (any visitor, submission-only interaction). Both use the same catalog + json-render substrate but with distinct registries (see §3). No attempt to unify — they're different deployment surfaces with different trust/security/identity models. |
| Processes (L1) | One-to-many. An App is typically tied to one Process via `processScope`. Submissions → work items → process runs. Process owns the work logic; App owns the public face. An App can exist without a process (pure display-only dashboard) but most have one. |
| Hired Agents (ADR-037) | **Apps are not agents.** Agent = runtime identity + memory + supervisory loop (ADR-037, ADR-038). App = versioned artifact + inbound contract. A Hired Agent *can* own a process that backs an App's classifier or submission-handling logic, but the App itself is not an agent and has no agent-ness. |
| Process Outputs (ADR-009) | App *is* the primitive that activates ADR-009's `external` output type. A process step with `output.type: external` can emit an App version (deploy tool call) or reference an existing App (link tool call). |
| Trust Tiers (ADR-007) | Applied per-app for outbound behaviour only (§7). Submission ingress not trust-gated. |
| Memories (ADR-003) | Apps have no memory scope. They are stateless artifacts. (Their *submissions* become work items which belong to the process's memory scope — but the App itself doesn't accumulate memory.) |
| Workspace Git Server (Brief 200) | **Delivery substrate.** Apps are served by the existing workspace git-over-HTTPS server. No new server infrastructure. |

### 9. Security

- **Catalog = security boundary.** Arbitrary HTML / JS / CSS in app specs is forbidden. All rendering goes through the external-app registry (§3), which maps catalog components to React implementations. The registry is the only place component code lives.
- **SSRF / XSS:** fixed catalog eliminates XSS at spec-authoring time. Submission payloads are validated against the spec schema (server-side Zod per §6) and sanitized before storage.
- **Credential exposure:** Apps cannot access workspace credentials. Credential-using operations (send email, call integration) happen in process runs triggered by submission classifiers, not in the rendered app. End users cannot trigger credential use directly from the rendered client.
- **Public URL surface:** each app has a `public` flag (default: true for kind `portal`/`form`/`landing`, false for kind `dashboard`). Private dashboards require a signed token (out of scope for v1 — v1 dashboards are either fully public with opaque-URL-is-the-secret, or workspace-internal via the workspace view registry, not this primitive).
- **Rate limiting:** per-IP + per-app + per-submission-type, configurable in the inbound contract. Defaults conservative (5/IP/hour, 100/app/hour).
- **CORS posture:** the submission endpoint (`POST /apps/<slug>/submit`) accepts cross-origin POSTs from any origin by design — the whole point of an App is that end users submit from arbitrary browsers. Ditto's *authenticated* surfaces (all other `/api/v1/**` endpoints) retain the existing same-origin cookie-auth pattern. Submissions do NOT receive a workspace session cookie; they are authenticated by the app's URL + schema + rate-limit + optional captcha alone, not by Ditto-workspace identity.
- **CSRF posture:** because submissions are unauthenticated and there is no cookie/session to ride on, traditional CSRF is not the relevant threat. The relevant threats are bot abuse (handled by rate-limit + captcha) and embedded-iframe clickjacking (the app page sets `X-Frame-Options: DENY` by default; can be relaxed per-app to explicit-origin allowlist if owner needs the app embedded).
- **Deploy/rollback audit trail:** every `deploy_app_version` and `rollback_app_version` invocation writes a row to the existing `activities` table (mirroring Brief 200's `clone_credential_issued` pattern). This gives the owner a time-travelable audit log beyond the per-version `manifest.json` file.
- **Invocation guard (Insight-180):** tools `deploy_app_version`, `rollback_app_version`, and the submission-classifier handler all produce external side effects and MUST require `stepRunId` at the tool boundary.
- **Credential scrubbing:** app specs must never contain credentials. Builder-side validation rejects any spec field containing token-shaped substrings (extends existing credential-scrub pattern per `scrub.ts`).

### 10. Engine / Product boundary (`@ditto/core`)

Per CLAUDE.md engine-core split:

**Core (`packages/core/src/apps/`):**
- `types.ts` — `App`, `AppVersion`, `AppSubmission`, `AppSpec`, `InboundRoutingContract`, `AppCatalog`, `AppRegistry` types
- `schema.ts` — Drizzle schema for `apps`, `app_versions`, `app_submissions` (core defines schema, does not open DB — per engine-first discipline)
- `renderer/` — catalog-constrained renderer engine (already belongs in core per ADR-009 adoption of json-render)
- `lifecycle.ts` — `deploy`, `createVersion`, `rollback`, `reconcile` handlers
- `inbound.ts` — submission validation + work-item-creation contract
- `registry-contract.ts` — typed extension point for registries (workspace-internal, external-app, future: PDF/email)

**Product (`src/engine/apps/` + `packages/web/…`):**
- `src/engine/apps/self-tools.ts` — `create_app`, `preview_app`, `deploy_app_version`, `rollback_app_version`, `app_history`, `app_status` Self tools (exactly six; `deploy_app_version` is canonical for publishing — no separate `publish_app` tool)
- `src/engine/apps/catalog/ditto-default.ts` — the actual v1 catalog (the product's opinion about which components ship)
- `src/engine/apps/external-registry/` — shadcn-backed React implementation of the external-app registry
- `packages/web/components/blocks/app-proposal-block.tsx` — `AppProposalBlock` (inline preview during authoring, matches HireProposalBlock pattern from ADR-037)
- `packages/web/app/apps/` — Apps sidebar surface + AppDetail page
- `packages/web/app/api/v1/apps/` — submission endpoint + version-serve + health endpoint

Consumer test ("could ProcessOS use this?"): **yes for core**. A different product built on `@ditto/core` could ship its own catalog, its own registry, and its own authoring flow without touching the App primitive's shape, lifecycle, or inbound contract. That's the core/product line.

### 11. What this ADR does NOT cover

- **Specific v1 component catalog contents** — Brief 209 decides (13-ish components targeted: text, heading, button, form-fields for text/textarea/select/number/file, submit, image, link, divider, card-container)
- **User-chosen domain deployment** — future ADR post-v1
- **Collaborative editing of app specs** — later phase
- **App marketplace / template library** — post-MVP
- **App-level analytics dashboards** — follow-up brief
- **Inbound webhooks from external services (not end-user form submissions)** — later brief; orthogonal to this primitive
- **App-as-agent integration** (an App that calls a Hired Agent per submission, with per-visitor memory) — follow-up; v1 classifier is process-based, not agent-based
- **Trust-tier-driven catalog richness for Apps** (ADR-009 §4 does this for view-type outputs; whether Apps get the same treatment is deferred to Brief 209's build experience)

## Consequences

### What becomes easier

- Jordan JTBD-J4 becomes buildable. The persona whose success most depends on *shipping things to his organisation* stops being aspirational.
- ADR-009's `external` output type gains a concrete primitive (was conceptual since 2026-03-23 — now an activation path exists).
- Prototyping-as-first-class-process (Insight-084) extends to production: the prototypes users see in Define mode ARE the apps they can deploy. No separate "production build" step.
- json-render's catalog pattern gets a second deployment surface, validating the "one catalog, N registries" architecture already in ADR-009 §3.
- Rob's "customer-facing intake page" latent JTBD (per Designer spec) gets an unblock (even though messaging tool surface closes his primary gap first).
- Nadia's "team dashboard at a URL" latent JTBD gets an unblock when combined with the team-scope work (G3).

### What becomes harder

- **Component-catalog curation burden.** Ditto now maintains a component vocabulary. Additions require design + accessibility + security review. This is the explicit cost of the user steer ("lightweight framework designed and maintained by Ditto").
- **Version proliferation.** Apps with frequent iteration will accumulate version directories. v1 keeps all versions; housekeeping policy deferred to Brief 209 (likely: keep last 20, archive older to compressed tarballs).
- **Public URL surface** requires security hardening Ditto hasn't needed before (open CORS, rate limits, captcha integration if demanded, DDoS posture — most of which Brief 200's git server already hardens for workspace content, but app-submit endpoint is new).
- **Filesystem legibility under load.** `apps/<slug>/submissions/YYYY-MM/` directories can grow. Per-month bucketing is the v1 answer; archival policy deferred.
- **Trust-tier model extension.** Apps add a new trust-tier application axis (outbound auto-response). Owners now reason about trust-per-process AND trust-per-app. Documenter must update trust-tier explainers.

### Explicitly rejected alternatives

- **Adopt v0 / Lovable / Bolt.new / Replit Agent as the framework.** Rejected per user steer (Ditto owns the framework). Reasons: closed-source coupling; pricing/availability dependency on external vendors; loss of already-adopted json-render substrate; loss of the catalog-as-security-boundary property (these products accept arbitrary JSX).
- **Apps as ephemeral process outputs (regenerated each run).** Rejected per §4. Breaks URL stability, trust model, performance, and cost.
- **Arbitrary HTML/JS in app specs.** Rejected per §9. Eliminates the security boundary.
- **Apps as a subset of Hired Agents.** Rejected per §8. Conflates artifact with cognitive-loop identity; breaks ADR-037's Agent invariants.
- **Apps as a generalisation of workspace views (`workspace.register_view` etc.).** Rejected per §8. Internal-vs-external deployment surface is a first-class distinction; unification would break trust, identity, and security models.
- **Apps as a new Agent `kind`.** Rejected — same reason as the Hired-Agents-subset rejection. Apps are not agents.
- **Per-visitor LLM call at render time.** Rejected per §4. Would make Apps effectively `CompanyGPT`-style chat widgets instead of persistent deployable artifacts.

## Provenance

- **ADR-009 `external` output type:** Apps activate the output type declared but never primitive-ised in ADR-009 v2 (`docs/adrs/009-runtime-composable-ui.md:82`). **Level: activate** (Ditto-original — no external source; this ADR is the activation).
- **ADR-037 activation-pattern:** YAML primary + DB mirror + conversational author flow + user-language primitive name. **Level: pattern** (Ditto-original from ADR-037 itself).
- **json-render (Vercel Labs) catalog → registry → renderer:** `packages/core/src/schema.ts`, `packages/react/src/renderer.tsx`. Already adopted per ADR-009 §3 for view-type outputs; this ADR adds a second registry on the same catalog. **Level: adopt** (extends existing adoption).
- **Paperclip (paperclipai/paperclip) `agent_config_revisions` pattern:** versioning + rollback for a YAML-primary primitive. **Level: pattern** (shape informs §4; no code transfer — already adapted in ADR-037).
- **Brief 200 (Workspace Git-over-HTTPS Server):** the delivery substrate. **Level: depend** (pre-req for this primitive's deployment surface).
- **Insight-084 (prototyping-is-first-class-process):** design principle; Apps extend prototyping from design-time to production-time. **Level: extend**.
- **Insight-201 (user-facing legibility):** YAML primary + filesystem legibility. **Level: extend** to apps.

## Follow-up decisions

- **Parent Brief 209** covers implementation, split into 4 sub-briefs along the seams named in §10.
- **Possible ADR-041** — User-chosen domain deployment (post-v1, when the first user requests it via dogfood feedback)
- **Possible ADR-042** — Catalog-extension model for third-party component contributions (post-MVP)
- **Possible amendment to ADR-009** — If Apps reveal that the `external` output type needs structural changes beyond activation, amend ADR-009 explicitly rather than accumulating drift
- **Named-trigger parking:**
  - Inbound webhooks from external services (vs end-user submissions) — write a brief when the first process declares `requires: webhook-ingress`
  - App-as-agent-front-end — write a brief when the first user requests per-visitor memory/cognition in an App
  - App marketplace — post-MVP; earliest trigger is 10+ apps shipped by 3+ workspaces

## Open design questions for Brief 209 (not for this ADR)

1. ~~v1 catalog: precise 13-ish components.~~ **Resolved 2026-04-21:** sub-brief 210 §Appendix B commits to **22 components** (10 universal form fields + 6 layout/display + 1 submit + 3 dashboard data + 2 containers) — covers all four ADR-040 kinds. Accessibility + responsive-breakpoint behaviour per component remains a sub-brief 210 build concern.
2. Authoring conversation flow: how many questions before first preview? (Target: 3 — kind, primary action, required fields.)
3. Preview rendering: iframe within Self conversation vs bottom-sheet vs right-panel. Designer's G5 says "inline mobile + desktop frame."
4. Default classifier: use Self's intake-classifier vs a dedicated `app-submission-classifier`. Latter keeps boundaries clean.
5. Submission → work item: label auto-derivation from catalog form-field labels.
6. Rollback UX: conversation-triggered (`"revert to last week's version"`) + Apps detail page button. Two paths; both need specifying.
7. First-app onboarding: does the user's first App get proposed by Self (like first-process proposal) or is it creator-initiated?

---

## Reference docs updated

- `docs/adrs/009-runtime-composable-ui.md` — Architect to add a footer cross-reference: "**ADR-040** activates the `external` output type declared in §1." Per Insight-043 (Architect owns ADR accuracy), an ADR that's been activated must reference its activator — edit to be made in the same session as this ADR's human approval.
- `docs/landscape.md` — json-render entry to get a cross-reference noting the second registry (external-app) on the same catalog. Same-session edit.
- `docs/state.md` — Architect checkpoint block added this session.
- Reference docs checked, no drift found: `docs/architecture.md` (no layer structure change — Apps fit within existing L1/L3/L6), `docs/personas.md` (motivational JTBD row already added by Designer in prior checkpoint, 2026-04-21), `docs/human-layer.md` (will need G5 states + App primitive added when Brief 209 ships — flagged to Documenter, not updated now to avoid spec-ahead-of-build drift).
