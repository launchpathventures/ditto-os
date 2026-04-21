# Brief 210: App Primitive + Substrate + v1 Catalog (Sub-Brief 1 of 4)

**Date:** 2026-04-21
**Status:** ready
**Depends on:** ADR-040 (App primitive shape — accepted 2026-04-21); Parent Brief 209 (phase design — ready 2026-04-21); Brief 200 (Workspace Git-over-HTTPS Server — MUST be merged + deployed before this sub-brief starts; delivery substrate); ADR-009 §3 (json-render catalog-constrained rendering — decided but first source-file landing is THIS sub-brief, see Inputs #11)
**Unlocks:** Sub-briefs 211 (conversational authoring + preview + deploy), 212 (inbound routing + submissions-as-work-items), 213 (Apps sidebar + health monitoring)

## Goal

- **Roadmap phase:** User-Facing Apps (Brief 209 parent).
- **Capabilities:** Ship the **engine-layer primitive + substrate + v1 component catalog** that activates ADR-040 at code level. After this sub-brief merges, future sub-briefs can author, deploy, route, and surface apps; this sub-brief is the foundation they all sit on. **No user-facing UI is shipped in this sub-brief** — the surface is a library (`@ditto/core` + `src/engine/apps/` + external-app registry).

## Context

ADR-040 activates ADR-009's long-dormant `external` output type as a first-class primitive called *App*. Parent Brief 209 decomposes the build into four seams; this is the **first and critical-path** seam. Every subsequent sub-brief (211/212/213) depends on types, schemas, renderer, catalog, and lifecycle handlers defined here.

The catalog scope, visibility DSL, submission shape, file-upload target, and `@ditto/core` boundary are resolvable from `docs/research/app-component-catalog-patterns.md` (Researcher scout across 27 products). Key inputs:

- **Catalog scale.** Researcher's §K.1 gave three options (15 / 20 / 25). This brief commits to **22 components** covering all four ADR-040 kinds (portal / form / dashboard / landing). The 10 universal field types (§B.1 of research) + 6 layout/display + 1 submit action + 3 dashboard-data + 2 containers = 22. The parent brief's "~13 components" estimate was form-kind-biased; the research refined it upward. See §"What changes" below for the enumerated list.
- **Catalog-definition mechanism.** Zod-first via json-render, already adopted per ADR-009 §3. Confirmed by Researcher scout as the observable strongest constraint mechanism (level 8 of 8 in §D taxonomy).
- **Visibility DSL.** Declarative rule tree `{ effect, condition }` — neither Formily's `new Function()` nor Plasmic's property-level TS functions, both of which violate ADR-040 §9's "catalog-is-the-security-boundary" invariant. Nine value operators + three composition operators specified below.
- **Submission shape.** Ordered-fields-array with metadata envelope, per Typeform/Tally pattern (Researcher §F.1). Self-describing, type-tagged, robust to schema edits, filesystem-legible.
- **File-upload target.** Workspace git server (Brief 200) — files committed to the workspace repo alongside submission JSON. Maximum 10MB per file, 50MB per submission. Third-party offload deferred to named-trigger (first workspace to hit the limit).
- **Rollback atomicity.** Pointer-file switch (`current.json`) with read-before-write invariant check. Single-writer workspace model makes true CAS unnecessary for v1.
- **Property vocabulary per component.** 5-field consensus minimum from Researcher §E.1: `componentId`, `label`, `description`, `defaultValue`, `required`, plus optional `visibility`.

## Objective

After merge: the engine can *understand* apps as primitives — create them from a spec, version them, roll them back, reconcile YAML↔DB, validate submissions against their catalog, and render their specs into React via the external-app registry — all without a single UI component existing yet. Sub-brief 211's conversational-authoring flow will bolt onto this foundation.

## Non-Goals

Scoped out; explicit to prevent creep:

- **Conversational authoring + preview** (sub-brief 211 scope). This sub-brief does not ship Self tools, AppProposalBlock, the preview iframe, or the deploy flow. It ships the `lifecycle.deploy()` function these will call.
- **Submission ingress + classifier routing** (sub-brief 212 scope). This sub-brief ships the `inbound.validateSubmission()` contract; the HTTP POST endpoint, classifier dispatch, work-item creation, rate-limit, and captcha all live in 212.
- **Apps sidebar + AppDetail + health monitoring** (sub-brief 213 scope).
- **User-facing UI beyond the external-app registry React components.** The registry components are functional (they render when given a spec) but are not embedded in any page in this sub-brief. Sub-brief 211 will use them through the preview iframe.
- **Catalog extensibility** (third-party component registration). V1 catalog is fixed; extensibility deferred per ADR-040 §11 to post-MVP.
- **User-chosen domain deployment.** V1 URL is `{workspace-url}/apps/<slug>`; custom domains = future ADR-041.
- **Per-visitor memory / cognition.** Apps are stateless artifacts; no LLM calls at visit time.
- **App-level analytics.** Submission count + error count surface via sub-brief 213; richer funnel/A-B analytics are post-phase.
- **i18n of specs / submissions.** Single-language v1.
- **Collaborative simultaneous editing.** Single-writer; merge via YAML + git if conflicts arise.
- **Multiple concurrent draft versions per app.** V1 supports one draft + N deployed versions. Branching workflows deferred.
- **Chart components** (bar / line / pie / area / scatter) — dashboard kind in v1 is `metric_card` + `data_table` + `status_badge` only. Visualisation components deferred to follow-up catalog addition. Named trigger: first user requests a chart.
- **App spec import/export between workspaces.** One-way export (`.ditto-app.tar.gz`) is an obvious post-MVP feature; out of scope v1.
- **i18n of app specs / submissions.** Single-language v1 (restated for emphasis — it was in the earlier non-goals list).

## Inputs

1. `docs/adrs/040-user-facing-apps-primitive.md` — primary contract; §2 storage, §3 substrate, §4 lifecycle, §6 inbound, §7 trust, §9 security, §10 engine/product boundary
2. `docs/briefs/209-user-facing-apps-phase.md` — phase-level context; §"What Changes" sub-brief 210 row is the scope anchor
3. `docs/research/app-component-catalog-patterns.md` — authoritative input for all 10 §K open questions (this sub-brief resolves 9 of 10; last open is `sub-brief 212` classifier-default)
4. `docs/adrs/009-runtime-composable-ui.md` §3 — json-render substrate adoption reference; this sub-brief *extends* that adoption to a second (external-app) registry
5. `docs/briefs/200-workspace-git-server.md` — delivery + file-upload substrate (dependency, must be merged)
6. `docs/insights/201-user-facing-legibility.md` — filesystem-legible storage discipline
7. `docs/insights/190-migration-journal.md` (or absorbed location per Insight-004 handling) — Drizzle migration-journal discipline for new tables
8. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — invocation guard for `deploy` / `rollback` lifecycle entry points
9. `docs/insights/043-researcher-owns-landscape.md` — docs must stay in sync; if implementation reveals drift in ADR-040, update the ADR not the code
10. `packages/core/src/content-blocks.ts` — ContentBlock registry context (AppProposalBlock is sub-brief 211 scope; not added here)
11. **json-render source files for first-time adoption.** ADR-009 §3 decided to adopt (composition level: adopt), but the source files have never actually been ported — verified 2026-04-21: grep of `packages/core/`, `packages/web/`, root `package.json` returns zero matches for `json-render`, `defineComponent`, `createLibrary`, `vercel-labs`, `thesysdev`. **This sub-brief is the first code-level landing of json-render.** Builder ports the relevant source files (`packages/core/src/schema.ts` — catalog Zod grammar; `packages/core/src/types.ts` — flat spec format; `packages/react/src/renderer.tsx` — renderer engine; plus streaming parser) from `github.com/vercel-labs/json-render` into `packages/core/src/apps/renderer/`. Source-file headers preserve upstream attribution. NOT added as an npm dep — adopt-level composition per Insight-068 (copy source, own it). Brief 209 AC #17 After-Completion note about landscape.md cross-reference can be satisfied at sub-brief 213 merge once the two-registries-one-catalog shape is demonstrable
12. Existing Drizzle setup + journal (`drizzle/meta/_journal.json`) — add three new tables
13. Existing DOMPurify / credential-scrub utilities in `src/engine/integration-handlers/scrub.ts` — reuse for submission text-sanitisation

## Constraints

Honoured from ADR-040 + parent Brief 209 + research report:

- **Engine-first discipline (CLAUDE.md).** All primitive types, Drizzle schema, renderer engine, lifecycle handlers, inbound contract, and catalog Zod schemas go in `packages/core/src/apps/`. Ditto-specific product opinions (the `ditto-default` catalog composition, React implementations, shadcn-bound theming, file-upload-to-workspace-git target code) go in `src/engine/apps/`. Consumer test: "could ProcessOS use this?" — for every file in `packages/core/src/apps/`, the answer must be yes.
- **Catalog is the security boundary.** No arbitrary HTML / JS / CSS anywhere in specs or component code. No `new Function()` compilation of expressions. No function-as-string serialisation. Visibility rules use the allow-listed operator set only.
- **Zod-first.** Every component in the catalog is defined by a Zod schema; the same schema validates specs, generates AI authoring prompts (via the catalog's `.prompt()` method, from json-render), and exports JSON Schema (via `.toJSONSchema()`).
- **YAML-primary, DB-mirror.** The filesystem at `apps/<slug>/` is the source of truth per ADR-040 §2. Drizzle-backed `apps` / `app_versions` / `app_submissions` tables are projections for query performance.
- **Insight-190 migration-journal discipline.** Three new tables require three SQL migrations with sequential `idx` in `drizzle/meta/_journal.json` plus matching snapshots. Verify `idx` gap-free pre-merge.
- **Insight-180 invocation-guard.** `deploy()`, `rollback()`, `createVersion()` all produce external side effects (filesystem writes + DB mutations + HTTP route registration via Brief 200's git server). Each MUST require `stepRunId` parameter. Callers (sub-brief 211's Self tools) pass it through.
- **Single-writer atomicity.** Pointer-file (`current.json`) writes use read-before-write invariant check: if `activeVersion` differs between read and the expected-value sent by the caller, reject with a typed `StaleVersionError`. v1 model assumes single writer; this is defensive, not true CAS.
- **Filesystem legibility.** Submission JSON, spec JSON, and manifest JSON are human-readable, grep-able, diff-able. No binary blobs or base64-embedded data in spec files (images referenced by URL or asset-id, not inlined).
- **Two distinct sanitisation boundaries** (resolving Reviewer-flagged conflation):
  - **Credential-scrub** at spec-commit time: pre-commit validation rejects any spec field containing token-shaped substrings. Reuses existing `scrubCredentialsFromValue()` from `src/engine/integration-handlers/scrub.ts`. Credential scrub has nothing to do with HTML — it's a pattern-match for API-key-shaped leakage (`xoxb-`, `sk_`, `Bearer ` etc.).
  - **DOMPurify** at render time: any user-authored string rendered by `text_block` or `heading` passes through DOMPurify inside the external-app registry component. Specs store plain text + a small markdown subset (bold/italic/link) — arbitrary HTML is never stored; what DOMPurify catches is markdown-to-HTML rendering-time leakage. (Formio-pattern per Researcher §D.)
- **File-upload limits enforced server-side.** 10MB per file, 50MB per submission. Reject excess with typed `UploadLimitExceeded` error. Store files at `apps/<slug>/submissions/<YYYY-MM>/files/<uuid>.<ext>` alongside submission JSON.
- **No React imports in `packages/core/`.** Core defines types + Zod schemas + lifecycle + renderer *engine* (tree walker + error boundary contract); React component implementations live in product. The renderer engine accepts a registry prop; the registry is supplied by the consumer.
- **Side-effecting functions must require `stepRunId`** per Insight-180 (restated here for builder reference).

## Provenance

| What | Source | Level | Why |
|---|---|---|---|
| Primitive activation pattern (YAML primary + DB mirror + typed contracts) | Ditto ADR-037 (Hired Agents) | **pattern** | Ditto-original; ADR-040 adopts the template |
| Catalog → registry → renderer substrate | json-render (`github.com/vercel-labs/json-render`) | **adopt (first landing)** — ADR-009 §3 decided; sub-brief 210 lands the actual source files | Never previously ported; verified absent via grep 2026-04-21. Copy relevant files into `packages/core/src/apps/renderer/`, own them, extend for Ditto's two-registry contract. Not an npm dep |
| `defineComponent` / `createLibrary` catalog API | OpenUI (`github.com/thesysdev/openui`, `packages/react-lang/src/index.ts`) + json-render equivalents | **pattern** | Naming + API shape; Ditto's `defineComponent` is a Zod wrapper matching these precedents |
| 5-field consensus minimum per-component property vocabulary | Researcher §E.1 (cross-library convergence) | **pattern** | Emerged from SurveyJS/Formily/JSON Forms/RJSF/Formio scout |
| Ordered-fields-array submission shape + metadata envelope | Typeform/Tally/Fillout (Researcher §F.1) | **pattern** | Self-describing + type-tagged + schema-edit-robust |
| Declarative rule-tree visibility DSL | JSON Forms `rule: { effect, condition }` | **pattern** | Closest structural fit to Zod-first model; no code-execution surface |
| 9 value operators + 3 composition operators | Researcher §K.5 option set | **original** | Specific operator list is Ditto's composition of the scouted options |
| Pointer-file (current.json) rollback with invariant check | ADR-040 §4 | **ditto-original** | Windows-portable; simpler than CAS for single-writer v1 |
| Filesystem legibility for apps + submissions | Insight-201 (memories projection precedent) | **extend** | Apps + submissions inherit the legibility principle |
| DOMPurify on text-rendered components | Formio (`formio.js/src/utils/utils.js`) | **pattern** | Runtime sanitisation on any user-authored text |
| File delivery as URLs (never base64) | Universal form-builder convention (Researcher §F.5) | **pattern** | Every scouted product; matches workspace git delivery model |
| Drizzle migration-journal discipline | Insight-190 | **adhere** | Journal `idx` contention is a concurrency hazard for parallel Ditto sessions |

## What Changes (Work Products)

### `packages/core/src/apps/` — engine-first (all new files)

| File | Action | Purpose |
|---|---|---|
| `packages/core/src/apps/types.ts` | Create | Typed contracts: `App`, `AppVersion`, `AppSubmission`, `AppSpec`, `AppCatalog`, `AppRegistry`, `InboundRoutingContract`, `ComponentInstance`, `VisibilityRule`, `ValidationRule`, `FileReference`, `SubmissionEnvelope` |
| `packages/core/src/apps/schema.ts` | Create | Drizzle schemas for `apps`, `app_versions`, `app_submissions` (shape in §Appendix A below). No `db` import; accepts DB via param per CLAUDE.md rule 5 |
| `packages/core/src/apps/catalog/core-primitives.ts` | Create | 22 `defineComponent()` calls: the v1 vocabulary (enumerated §Appendix B). Pure Zod + metadata; no React |
| `packages/core/src/apps/catalog/visibility-dsl.ts` | Create | Zod schemas for `VisibilityRule` tree: 9 value operators (`equals`, `not_equals`, `gt`, `gte`, `lt`, `lte`, `contains`, `is_empty`, `is_not_empty`) + 3 composition operators (`and`, `or`, `not`). Static validator + evaluator (pure function, no eval) |
| `packages/core/src/apps/renderer/schema.ts` | Create (port from json-render) | Catalog Zod grammar — ported from `github.com/vercel-labs/json-render` `packages/core/src/schema.ts`. Header preserves upstream attribution + license. Extended with Ditto's two-registry contract (workspace-internal + external-app discriminator) |
| `packages/core/src/apps/renderer/types.ts` | Create (port from json-render) | Flat-spec + tree-node types — ported from json-render `packages/core/src/types.ts` |
| `packages/core/src/apps/renderer/engine.ts` | Create (port + extend) | Tree-walker renderer **engine** — ported from json-render `packages/react/src/renderer.tsx` with Ditto-side changes: (a) framework-agnostic output (returns `ResolvedTree` = `{ componentName, props, children, errorState }` tree; product wraps in React); (b) streaming mode gated by explicit `streamingSource` parameter; (c) per-element error boundary contract |
| `packages/core/src/apps/renderer/parser.ts` | Create (port from json-render) | Streaming parser for LLM-emitted specs — ported from json-render equivalent |
| `packages/core/src/apps/renderer/registry-contract.ts` | Create (Ditto extension) | Typed extension point `defineRegistry<T>()` for the two registries (workspace-internal + external-app) |
| `packages/core/src/apps/renderer/index.ts` | Create | Public re-exports |
| `packages/core/src/apps/lifecycle.ts` | Create | `deploy(slug, specJson, stepRunId)`, `createVersion(slug, specJson, stepRunId)`, `rollback(slug, targetVersion, expectedActiveVersion, stepRunId)`, `reconcile(workspaceRoot, db)` |
| `packages/core/src/apps/inbound.ts` | Create | `validateSubmission(app, payload): Result<SubmissionEnvelope, ValidationError>`; sanitises strings; validates against catalog; enforces file-upload limits |
| `packages/core/src/apps/errors.ts` | Create | Typed errors: `StaleVersionError`, `UploadLimitExceeded`, `ValidationError`, `UnknownComponentError`, `SpecParseError`, `MissingStepRunIdError` |
| `packages/core/src/apps/index.ts` | Create | Public re-exports |
| `packages/core/src/apps/*.test.ts` | Create | Unit tests covering each file (catalog Zod validation for all 22 components with both valid and invalid specs; visibility evaluator for all operator combinations; lifecycle CAS; inbound validation; file-limit enforcement; registry contract) |

### `src/engine/apps/` — product-layer

| File | Action | Purpose |
|---|---|---|
| `src/engine/apps/catalog/ditto-default.ts` | Create | Wraps `packages/core/src/apps/catalog/core-primitives.ts`; adds Ditto-specific opinions (theme tokens, icon defaults, brand-aligned labels) |
| `src/engine/apps/external-registry/index.ts` | Create | `defineRegistry`-call exposing 22 React implementations |
| `src/engine/apps/external-registry/{22 component files}.tsx` | Create | shadcn/Radix/Tailwind-backed React component per catalog entry |
| `src/engine/apps/external-registry/styles.css` | Create | Tailwind + CSS tokens matching workspace theme; scoped to `[data-ditto-app]` to prevent leakage |
| `src/engine/apps/workspace-git-upload.ts` | Create | File-upload handler: writes to `apps/<slug>/submissions/<YYYY-MM>/files/<uuid>.<ext>`; validates file-size limits; returns `FileReference` with URL |
| `src/engine/apps/boot-reconciler.ts` | Create | Workspace-boot hook: walks `apps/*/app.yaml`, calls `lifecycle.reconcile()`, logs drift without failing boot |
| `src/engine/apps/*.test.ts` | Create | Unit tests for the product layer (registry 1:1 with catalog; file-upload limits; boot-reconciler handles missing/stale/corrupt YAML gracefully) |

### Database

| File | Action | Purpose |
|---|---|---|
| `drizzle/NNNN_apps_primitive.sql` | Create | Three CREATE TABLE statements: `apps`, `app_versions`, `app_submissions`. Indexes on `apps.slug`, `app_versions.app_id`, `app_submissions.app_id`, `app_submissions.submitted_at` |
| `drizzle/meta/NNNN_snapshot.json` | Create (generated by `drizzle-kit generate`) | Snapshot matching the migration; `idx` next-sequential value |
| `drizzle/meta/_journal.json` | Modify (append) | Journal entry with next-sequential `idx` |

### No changes to

- `packages/core/src/content-blocks.ts` (AppProposalBlock is sub-brief 211)
- `src/engine/self-delegation.ts` (Self tools are sub-brief 211)
- Any `packages/web/` file (UI surfaces are sub-briefs 211-213)
- Existing json-render substrate files (reuse, don't modify)

## User Experience

- **Jobs affected:** **None directly user-facing in this sub-brief.** Sub-brief 210 is pure engine/library work; no surface changes. Sub-briefs 211/212/213 deliver the Define / Delegate / Decide / Capture / Orient touchpoints that make the App primitive usable.
- **Primitives involved:** The ContentBlock registry gains no new member (AppProposalBlock = sub-brief 211). External-app registry React components are built but not yet routed to any URL (Brief 200 server wires them in sub-brief 211).
- **Process-owner perspective:** No visible change after this merge. A curious user who greps their workspace filesystem will find an `apps/` directory ready to receive files (empty). That's the only observable surface.
- **Interaction states:** N/A (no UI).
- **Designer input:** `docs/research/tool-coverage-by-persona-ux.md` §Part 4 G5 is consulted for future sub-briefs but no direct UX decisions in this sub-brief. Designer is **not** invoked for this sub-brief per Insight-010 (cognitive separation; Designer triggers when UI surface changes).

## Acceptance Criteria

Each criterion is boolean: pass or fail.

1. [ ] `packages/core/src/apps/types.ts` exports all typed contracts named in §"What Changes" (12 types). TypeScript `pnpm run type-check` passes at root.
2. [ ] `packages/core/src/apps/schema.ts` exports Drizzle schemas for `apps`, `app_versions`, `app_submissions`. Column shape matches `types.ts` exactly (programmatic check via type-check; schema fields and TS fields are cross-referenced).
3. [ ] Three new migration files: `drizzle/NNNN_apps_primitive.sql` + matching snapshot. `drizzle/meta/_journal.json` has the corresponding entry with next-sequential `idx`. Grep verifies no gaps or collisions in the journal. Per Insight-190.
4. [ ] `packages/core/src/apps/catalog/core-primitives.ts` defines **exactly 22** components via `defineComponent({ name, schema: z.object(...), metadata })`. Names enumerated in §Appendix B.
5. [ ] Every catalog component's Zod schema includes the 5-field consensus minimum: `componentId`, `label`, `description`, `defaultValue`, `required`, plus optional `visibility`. Form-field components additionally include `placeholder?` and `validation?` per their category.
6. [ ] `packages/core/src/apps/catalog/visibility-dsl.ts` exports a Zod-validated `VisibilityRule` schema with exactly 9 value operators (`equals`, `not_equals`, `gt`, `gte`, `lt`, `lte`, `contains`, `is_empty`, `is_not_empty`) + 3 composition operators (`and`, `or`, `not`). Evaluator is a pure function over a typed context; no `eval` or `new Function` in the file (grep-verified). **Operator semantics table (included inline in the file as doc-comment + unit-tested):** `equals`/`not_equals` = strict equality, no coercion; `gt`/`gte`/`lt`/`lte` require both operands numeric or both ISO-date strings else return false (no coercion); `contains` works on strings (substring) and arrays (element membership) else returns false; `is_empty`/`is_not_empty` true iff value is null/undefined/empty-string/empty-array. Type mismatch = condition evaluates false (no throws). Unit tests cover every operator × every type-match-and-mismatch combination.
7. [ ] Catalog exposes `.prompt()` method (returns system-prompt context for LLM authoring) and `.toJSONSchema()` method (returns valid JSON Schema for external tooling). Unit tests verify output shape for both on a representative 3-component subset.
8. [ ] `packages/core/src/apps/renderer/engine.ts` exports a renderer engine that takes an `AppSpec` + a `ComponentRegistry` and returns a **framework-agnostic `ResolvedTree`** — a tree of `{ componentName, resolvedProps, children, errorState }` nodes, NOT React elements. The product layer (`src/engine/apps/external-registry/`) wraps this tree into React via `React.createElement` in its own render helper. This keeps `packages/core/` React-free (AC #16). Per-element error boundary contract: on render-time error, the node's `errorState` is populated; the tree still resolves; one bad component does not poison siblings. Renderer makes **no LLM calls** at render time; streaming mode activates only when an explicit `streamingSource` parameter is passed (used by sub-brief 211's authoring preview).
9. [ ] `lifecycle.deploy(slug, specJson, expectedActiveVersion, stepRunId)` creates a new version: reads current.json, verifies on-disk `activeVersion` matches `expectedActiveVersion` (if mismatch → `StaleVersionError`), writes to `apps/<slug>/versions/v<N+1>/spec.json` + `manifest.json`, updates `apps/<slug>/current.json` atomically (write to temp + rename) to `{ activeVersion: "v<N+1>" }`, upserts the DB mirror. First deploy accepts `expectedActiveVersion === null`. Requires `stepRunId` (Insight-180); calls without it throw `MissingStepRunIdError`. Directory creation for `versions/v<N+1>/` is the atomic lock against concurrent deploys — second concurrent deploy hits EEXIST and rejects cleanly.
10. [ ] `lifecycle.rollback(slug, targetVersion, expectedActiveVersion, stepRunId)` performs an atomic pointer-file switch on `current.json` (write-to-temp + rename). If on-disk `activeVersion` differs from `expectedActiveVersion`, rejects with typed `StaleVersionError`. `targetVersion` must exist under `versions/` else rejects with `UnknownVersionError`. Requires `stepRunId`.
11. [ ] `lifecycle.reconcile(workspaceRoot, db)` walks `apps/*/app.yaml`, upserts DB mirror; on drift (YAML exists + no DB row, or vice versa), logs `activities` row *"apps.reconcile_drift_detected"* and reconciles toward YAML as source of truth. Does not throw on individual-app errors — partial reconcile is acceptable.
12. [ ] `inbound.validateSubmission(app, payload)` validates the payload against the deployed version's catalog; sanitises any text fields (DOMPurify pattern via existing `scrub.ts`); returns `Result<SubmissionEnvelope, ValidationError>`. Submission envelope matches §Appendix C shape (metadata + `fields[]`).
13. [ ] `src/engine/apps/workspace-file-writer.ts` (**renamed from `workspace-git-upload.ts` to reflect Brief 200 decoupling**) writes files to workspace filesystem at `apps/<slug>/submissions/<YYYY-MM>/files/<uuid>.<ext>`; enforces **10MB per file + 50MB per submission** limit server-side via streaming size-check (multipart parser aborts stream on size overflow — does NOT buffer full payload to memory); rejects excess with typed `UploadLimitExceeded`. No file ever written outside the submissions directory — path-traversal guard is a dedicated unit test: attempts to write with `<slug>=../../../etc` or `<uuid>=../../` all rejected. **URL production (for use in `FileReference.url`) is deferred to sub-brief 212 once Brief 200's workspace git-HTTPS server is live** — sub-brief 210 ships only the filesystem-path writer; the URL field in `FileReference` is populated by sub-brief 212's ingress endpoint.
14. [ ] `src/engine/apps/external-registry/` exports React implementations for all 22 catalog components, 1:1 with `core-primitives.ts`. Each component uses shadcn/Radix/Tailwind; styles scoped to `[data-ditto-app]` via CSS attribute-root scoping (not shadow DOM, not iframe — preview iframe isolation is sub-brief 211's concern; external-app registry is not hardened for inline in-workspace embed). Each component accepts **`mode: 'preview' | 'live'`** prop: in `preview` mode, `submit_button` and `file` components disable their side effects (preview renders but cannot actually submit or upload) so sub-brief 211's authoring-preview iframe can use them safely. Renders when given a valid spec instance.
15. [ ] Submission envelope shape matches §Appendix C exactly: `submissionId` (stable), `appSlug`, `appVersion`, `submittedAt` (ISO-8601), `ip`, `userAgent`, `fields[]` (each with `componentId`, `type`, `label`, `value`). Files in `fields[]` appear as `FileReference` objects (url + filename + size), never base64. **Schema-edit invariant** (unit-tested): submissions carry their `appVersion`; consumers resolve field meaning against that captured version, NOT against current version. A componentId rename in app v4 (from `candidate_name` → `applicant_name`) does not orphan v3 submissions — v3 submissions stay fully readable + classifiable because they resolve against v3's catalog.
16. [ ] `@ditto/core` boundary clean: `grep -r "from \"\\.\\./\\.\\./src/engine" packages/core/src/apps/` returns **zero matches**. `packages/core/src/apps/**/*` contains no imports from `src/engine/`, `packages/web/`, or Ditto-product-specific modules. No React imports in any core file. Verified via grep in CI or by hand before merge.
17. [ ] All unit tests pass (`pnpm test packages/core/src/apps`, `pnpm test src/engine/apps`). Type-check passes at root. No test depends on a live DB connection or network call (all DB-touching tests use an in-memory better-sqlite3 instance per existing Ditto pattern).

**Exactly 17 ACs — upper bound of the brief-sizing rule (docs/dev-process.md:179–194).** Size-check acceptable: one integration seam (engine-layer primitive + substrate), independently testable, one focused build session.

**For briefs that modify process YAML `tools:` declarations:** N/A — this sub-brief doesn't add Self tools (that's sub-brief 211). The 5 Self tools from Brief 209 AC #18 will verify tool-name uniqueness at sub-brief 211 merge, not here.

## Review Process

1. Spawn review agent with this brief + ADR-040 + Brief 209 + research reports + `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Every AC is boolean and independently verifiable
   - `@ditto/core` boundary is clean (grep-verified — no product imports)
   - Zod-first catalog mechanism matches ADR-009 §3 + Researcher §C.5
   - 22-component list in §Appendix B is complete (covers all 4 ADR-040 kinds) and not over-scoped
   - Visibility DSL operator set is allow-listed (no arbitrary code surface)
   - File-upload limits are enforced server-side (not just client-side)
   - Submission envelope shape matches §Appendix C and is filesystem-legible
   - Pointer-file rollback with invariant check works under concurrent-deploy simulation in a unit test
   - Insight-190 migration-journal discipline: the new journal entries are sequential
   - Insight-180 invocation-guard enforced on every side-effecting lifecycle entry point
   - No React imports in `packages/core/`
   - Unit tests cover catalog + visibility-evaluator + lifecycle + inbound + file-upload
   - Non-goals list is thorough; no scope creep into sub-briefs 211/212/213
3. Present work + review findings to human for approval

## Smoke Test

**Not shipped at sub-brief 210 merge** — there's no UI yet. The phase-level smoke test (per Brief 209 §"Smoke Test") runs at sub-brief 213 merge.

**Sub-brief 210 merge smoke:**

```bash
# 1. Type-check
pnpm run type-check

# 2. Unit tests across core + product layer
pnpm test packages/core/src/apps
pnpm test src/engine/apps

# 3. Engine boundary grep
grep -rE "from \"\\.\\./\\.\\./src/engine|from \"packages/web" packages/core/src/apps/
# expected: zero matches

# 4. Migration journal check
cat drizzle/meta/_journal.json | jq '.entries | last'
# expected: idx = (previous max + 1), tag matches "_apps_primitive"

# 5. Visibility DSL security check
grep -rE "new Function|eval\\(" packages/core/src/apps/
# expected: zero matches

# 6. React-in-core check
grep -rE "from \"react\"|from 'react'" packages/core/src/apps/
# expected: zero matches

# 7. No-DB-in-core check (CLAUDE.md rule 5)
grep -rE "from \"\\.\\./\\.\\./db\"|createDb\\(|drizzle\\(" packages/core/src/apps/
# expected: zero matches (schema.ts defines the shape; DB is passed in by caller)

# 8. Manual catalog sanity (at repl/node)
node -e 'import("./packages/core/src/apps").then(m => console.log(m.catalog.components.length))'
# expected output: 22

# 9. Drizzle migration dry-run
pnpm drizzle-kit push --dry-run
# expected: three CREATE TABLE statements, no destructive changes, no skipped migrations

# 10. Manual lifecycle exercise (at repl/node)
# - Call lifecycle.deploy("test-app", <valid-spec>, "test-step-123") — creates apps/test-app/ directory
# - Call lifecycle.rollback("test-app", "v001", "v002", "test-step-124") without first making v002 — should reject with StaleVersionError
# - Verify current.json contains { "activeVersion": "v001" }
# - Call lifecycle.reconcile(workspaceRoot, db) — upserts DB mirror; returns drift report

# 11. Credential-scrub on specs
echo '{"version":"v1","spec":{"components":[{"type":"text_block","componentId":"t","value":"xoxb-fake-slack-token"}]}}' | node -e '/* validateSpec call */'
# expected: pre-commit validation rejects (linter pattern catches xoxb-)
```

## After Completion

1. Update `docs/state.md` — sub-brief 210 complete; substrate in place; ready for sub-briefs 211/212/213 to be written and built
2. Update `docs/briefs/209-user-facing-apps-phase.md`:
   - AC #19 (migration-journal) verified complete
   - Sub-brief 210 row status: `complete`
   - Catalog count note: **verify** — Brief 209 sub-brief 210 row was pre-updated in the sub-brief-210 Architect session to "22 components per sub-brief 210 §Appendix B"; confirm the text still reads that way at sub-brief 210 merge time
3. Update `docs/adrs/040-user-facing-apps-primitive.md`:
   - §11 open question #1 — **verify** already marked resolved (was pre-updated in sub-brief-210 Architect session); confirm pointer text still correct at merge time
4. Update `docs/landscape.md` — no new entries from this sub-brief (substrate is already adopted json-render; no third-party file-upload provider added for v1)
5. Phase retrospective at the end of the sub-brief: what worked (the Zod-first catalog story?); what surprised (did 22 components feel right or were more needed?); what to change (for sub-briefs 211/212/213)
6. **Named-trigger parks (for follow-up briefs):**
   - Third-party file-upload provider: write a brief when the first workspace hits the 50MB submission limit or demand for large media surfaces
   - Git LFS for submission files: write when submissions directory exceeds 500MB per workspace
   - Catalog extensibility (third-party component registration): write when first user requests custom components

## Sizing Note

17 ACs (upper bound of 8-17). One seam (engine-layer primitive + substrate — which includes the first json-render code landing as a single cohesive substrate commit). One build session with one reviewer cycle. Matches sub-brief 210 row estimate in Brief 209 (~15, adjusted upward by 2 for explicit boundary + file-upload check).

No further split needed. The 17 ACs are distributed across three natural internal phases (types + schema + migration + json-render port → catalog + renderer engine + lifecycle → external registry + tests) that a single builder can progress through linearly.

## Rejected Alternatives (factual, brief)

- **CAS on `current.json` with true optimistic-concurrency token.** Rejected for v1 — single-writer workspace model makes the simpler read-before-write invariant check (AC #9/#10) sufficient. Directory-creation-as-lock covers the remaining concurrent-deploy case. True CAS revisitable if Ditto ships multi-writer workspaces.
- **Third-party file-upload provider** (Uploadcare / S3 / R2). Rejected for v1 — workspace git server (Brief 200) already being built for filesystem-legibility reasons; submission files live adjacent to submission JSON; no new credential/dependency surface. Named-trigger: first workspace hits 50MB-per-submission or 500MB-per-workspace submission storage.
- **npm depend on `json-render`.** Rejected — json-render is v0.x, single-maintainer, very young. Source-level adoption (copy + own) per Insight-068 composition framework is the appropriate level.
- **Arbitrary HTML in `text_block` / `heading`.** Rejected — breaks catalog-as-security-boundary. Plain text + small markdown subset is the capability surface.
- **Shadow DOM isolation for external-app registry components.** Rejected for v1 — CSS attribute-root scoping + preview-iframe isolation (sub-brief 211) is sufficient. Shadow DOM has interop costs (focus-trap, forms, accessibility testing) out of proportion to the leakage risk in the single-workspace-render scenario.
- **Catalog as proprietary class hierarchy** (SurveyJS / Formio model per Researcher §C.3). Rejected — Zod-first (per ADR-009 §3 adoption + Researcher §C.5) offers stronger LLM-authoring constraints (level 8 of 8) and cleaner TS ergonomics.
- **JSON Schema + parallel UI Schema** (RJSF / JSON Forms model per Researcher §C.1). Rejected — dual-tree is harder to stream during authoring; single Zod schema per component is simpler.

---

## Appendix A — Drizzle schema (reference)

```ts
// packages/core/src/apps/schema.ts

export const apps = sqliteTable("apps", {
  id: text("id").primaryKey(), // uuid
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["portal", "form", "dashboard", "landing"] }).notNull(),
  description: text("description"),
  catalog: text("catalog").notNull().default("ditto-default"),
  currentVersion: text("current_version"),  // references app_versions.version
  inboundRoutingJson: text("inbound_routing_json").notNull(),
  trustTier: text("trust_tier", { enum: ["supervised", "spot_checked", "autonomous", "critical"] }).notNull().default("supervised"),
  status: text("status", { enum: ["draft", "deployed", "paused", "archived"] }).notNull().default("draft"),
  ownerId: text("owner_id").notNull(),
  processScope: text("process_scope"),  // JSON array of process slugs
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deployedAt: integer("deployed_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const appVersions = sqliteTable("app_versions", {
  id: text("id").primaryKey(),
  appId: text("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  version: text("version").notNull(),  // "v001", "v002", ...
  specJson: text("spec_json").notNull(),
  manifestJson: text("manifest_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  createdBy: text("created_by").notNull(),
  changeSummary: text("change_summary"),
}, (t) => ({ appVersionUnique: unique().on(t.appId, t.version) }));

export const appSubmissions = sqliteTable("app_submissions", {
  id: text("id").primaryKey(),
  appId: text("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  appVersion: text("app_version").notNull(),
  submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  payloadJson: text("payload_json").notNull(),  // the full SubmissionEnvelope
  filesystemPath: text("filesystem_path").notNull(),  // apps/<slug>/submissions/YYYY-MM/<id>.json
  workItemId: text("work_item_id"),  // backfilled by sub-brief 212 when classifier creates the work_item
  classifierStatus: text("classifier_status", { enum: ["pending", "classified", "failed"] }).notNull().default("pending"),
});
```

## Appendix B — v1 component catalog (22 components)

| # | Name | Kind-applicability | Category |
|---|---|---|---|
| 1 | `short_text` | form, portal | Form field |
| 2 | `long_text` | form, portal | Form field |
| 3 | `email` | form, portal | Form field |
| 4 | `number` | form, portal | Form field |
| 5 | `select` | form, portal | Form field |
| 6 | `radio` | form, portal | Form field |
| 7 | `checkboxes` | form, portal | Form field |
| 8 | `date` | form, portal | Form field |
| 9 | `file` | form, portal | Form field |
| 10 | `rating` | form, portal | Form field |
| 11 | `heading` | all | Layout/display |
| 12 | `text_block` | all | Layout/display |
| 13 | `divider` | all | Layout/display |
| 14 | `link` | all | Layout/display — semantic anchor tag (external or in-app href); for SEO + screen-reader navigation |
| 15 | `image` | all | Layout/display |
| 16 | `button` | all | Layout/display — visual button with `onClick: { kind: "navigate" \| "open-url" \| "noop" }`; distinct from `link` by visual weight + interaction affordance (button is a call-to-action; link is inline prose reference); distinct from `submit_button` by NOT being tied to form submission |
| 17 | `submit_button` | form | Action — tied to the enclosing form; triggers submission validation + dispatch. Exactly one per form (catalog validator enforces) |
| 18 | `metric_card` | dashboard | Data |
| 19 | `data_table` | dashboard | Data |
| 20 | `status_badge` | dashboard, portal | Data |
| 21 | `section` | all | Container (labelled, with optional heading) |
| 22 | `stack` | all | Container (structural — vertical/horizontal via prop) |

**Coverage check:**
- **form kind:** 1–10 + 17 + 21 + 22 (13 components) — covers every table-stakes field type + structural layout + submit action.
- **portal kind:** 1–22 — full catalog is available.
- **dashboard kind:** 11–22 (read-only data display) — data components + containers.
- **landing kind:** 11–16 + 21 + 22 (no form fields) — headline + text + image + CTA button + links + layout.

Every catalog-item's complete Zod schema is in `packages/core/src/apps/catalog/core-primitives.ts`. Representative shape for `short_text`:

```ts
defineComponent({
  name: "short_text",
  category: "form-field",
  schema: z.object({
    componentId: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    defaultValue: z.string().max(200).optional(),
    required: z.boolean().default(false),
    placeholder: z.string().max(100).optional(),
    visibility: VisibilityRuleSchema.optional(),
    validation: z.array(TextValidationRuleSchema).optional(),  // min_length, max_length, pattern
  }),
  kindApplicability: ["form", "portal"],
});
```

## Appendix C — Submission envelope shape (ordered-fields-array)

```json
{
  "submissionId": "2026-04-21T14:42:33.123Z-7e4b",
  "appSlug": "hr-references",
  "appVersion": "v003",
  "submittedAt": "2026-04-21T14:42:33.123Z",
  "ip": "192.0.2.1",
  "userAgent": "Mozilla/5.0 (...) ...",
  "fields": [
    {
      "componentId": "candidate_name",
      "type": "short_text",
      "label": "Candidate full name",
      "value": "Ada Lovelace"
    },
    {
      "componentId": "cv_upload",
      "type": "file",
      "label": "CV (PDF)",
      "value": {
        "kind": "file_reference",
        "url": "/ws.git/apps/hr-references/submissions/2026-04/files/7e4b-cv.pdf",
        "filename": "cv.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": 287432
      }
    },
    {
      "componentId": "references_text",
      "type": "long_text",
      "label": "Referees (names + contact details)",
      "value": "1. Grace Hopper, grace@navy.mil, ..."
    }
  ]
}
```

Per Researcher §F.1 pattern: self-describing, type-tagged, stable `componentId` separate from human label, files as `FileReference` objects (URL + filename + size — never base64), ISO-8601 timestamps.

**Ordering is significant.** `fields[]` order matches the rendered-spec tree order (depth-first traversal). Unanswered optional fields appear in the array with `value: null`. This makes submission logs diff-stable across schema edits that add/remove fields without renaming.

---

## Reference docs updated

- `docs/briefs/210-apps-primitive-and-substrate.md` (this file — new)
- `docs/briefs/209-user-facing-apps-phase.md` — sub-brief 210 row "~13 components" → "22 components per sub-brief 210 §Appendix B" (to be edited same session as human approval, per Insight-043)
- `docs/adrs/040-user-facing-apps-primitive.md` §11 open question #1 — mark resolved with pointer to sub-brief 210 §Appendix B (same session)
- `docs/state.md` — Architect checkpoint block for sub-brief 210 (same session)
- Reference docs checked, no drift found: `docs/architecture.md` (no layer structure change); `docs/personas.md` (motivational JTBD row added earlier in day remains accurate); `docs/human-layer.md` (App primitive to be added at phase completion per Brief 209 After Completion #4 — not this sub-brief); `docs/landscape.md` (no new third-party adoption; workspace git server already in the Brief 200 entry)
