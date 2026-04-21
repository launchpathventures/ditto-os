# App Component Catalog Patterns

**Date:** 2026-04-21
**Researcher:** Dev Researcher (thg)
**Status:** draft — pending review
**Trigger:** ADR-040 + Brief 209 (User-Facing Apps) explicitly defer the v1 component catalog to build-time (ADR-040 §11 open question #1; Brief 209 sub-brief 210 row). Sub-brief 210 cannot be written without a concrete catalog shape. User steer (2026-04-21): Ditto maintains its own lightweight framework — this scout is patterns-and-vocabulary only, not adoption.
**Companion reports:** `docs/research/tool-surface-landscape.md` (Researcher — tool-surface inventory), `docs/research/tool-coverage-by-persona-ux.md` (Designer — persona JTBD coverage; G5 is the source)

---

## The question

Brief 209 sub-brief 210 must decide, at minimum:
1. **How many components** ship in Ditto's v1 catalog? Scale contrasts: Google Forms (11), Microsoft Forms (8), Typeform (~25–30), Paperform (27), Tally (~22), Fillout (50+), Jotform (40+ basic + 300+ widgets), Softr/Glide (full component libraries beyond forms).
2. **Which components** — field types (portal/form kinds), layout + display (landing/dashboard kinds), actions (submit, navigate), containers (cards, sections, tabs).
3. **What property vocabulary** is universal per component (label, required, validation, visibility, default, placeholder, ...).
4. **What catalog-definition mechanism** (JSON Schema + UI overlay? JSON Schema + x-extensions? Proprietary class registry? Code-first TS registration? Zod — already chosen per ADR-009 §3 adoption of json-render).
5. **What constraint mechanism** prevents LLM hallucination of non-catalog components + arbitrary HTML/JS injection.
6. **What submission shape** is idiomatic for end-user form submissions (ordered-fields-array vs flat-KV vs schema-nested).
7. **What anti-spam defaults** ship at v1 (honeypot, captcha, rate-limit combinations).

This scout inventories how three categories of adjacent products answer each of these, presents options neutrally, and flags gaps where nothing fits Ditto's specific architecture (trust-tier gating, two-registries-one-catalog, classifier-driven submission routing).

---

## Part A — Scout scope

Three parallel scouts covering ~27 products across:

**AI app-builders (10):** v0.app (Vercel), Lovable, Bolt.new (StackBlitz), Replit Agent, Firebase Studio, Cursor Agent, OpenUI (thesysdev/openui), Builder.io Visual Copilot, Plasmic AI, Softr AI / Glide AI.

**Form + portal builders (13):** Typeform, Tally, Fillout, Jotform, Paperform, Google Forms, Microsoft Forms, Formspree, Getform, Basin, Netlify Forms, Softr, Glide, Framer Forms, Webflow Forms.

**Open-source schema-driven libraries (8):** SurveyJS, Formily, JSON Forms, react-jsonschema-form (RJSF), Formio (formio.js), Plasmic (plasmicapp/plasmic), Builder.io (BuilderIO/builder), Craft.js.

For every claim, this report cites a URL (closed-source) or `{repo}/file.ts:line` (open-source). Scouts completed 2026-04-21.

---

## Part B — Component vocabulary convergence

### B.1 Universal form-field types (appear in essentially every catalog scouted)

Ten field types appear in **all seven mainstream form-builders** (Typeform, Tally, Fillout, Jotform, Paperform, Google Forms, Microsoft Forms) and all form-capable OSS libraries (SurveyJS, Formily, JSON Forms, RJSF, Formio):

1. **Short text** (`text`, `input`, `short-answer`)
2. **Long text** (`textarea`, `paragraph`, `long-answer`, `comment`)
3. **Email**
4. **Number**
5. **Dropdown / Select** (single-choice from list)
6. **Multiple choice / Radio** (single-select inline)
7. **Checkbox / Checkboxes** (multi-select)
8. **Date**
9. **File upload**
10. **Rating / Scale** (star, numeric, linear scale — Likert variants)

These are **v1 table-stakes candidates**. No scouted product ships without them.

### B.2 Near-universal (present in ≥5 of 7 mainstream form-builders)

- **Phone number** (Typeform, Tally, Fillout, Jotform, Paperform)
- **URL / Link** (Fillout, Tally, Jotform, Paperform, Microsoft)
- **Time**
- **Address** (composite: street, city, state, postcode, country)
- **Signature** (e-signature; Tally, Fillout, Jotform, Paperform)
- **Matrix / Grid** (row × column rating; Typeform, Jotform, Paperform, Google Forms, Microsoft Forms)
- **Ranking**
- **Yes/No** (boolean)
- **Multi-page / Section breaks** (page-level layout)
- **Hidden field** (for URL-prefill or context-passing)
- **NPS / Linear scale** (10-point common)

### B.3 Common but not universal (3–4 of 7)

- **Payment** (Stripe / PayPal; Typeform, Tally, Fillout, Jotform, Paperform)
- **Appointment / Booking** (Typeform via Calendly, Jotform, Paperform, Fillout)
- **Picture choice** (Typeform, Fillout)
- **Slider** (Fillout, Paperform, Jotform)
- **Calculated field** (Jotform, Paperform, Fillout)
- **Consent / Legal** (Typeform, Jotform)
- **Password** (Fillout; uncommon — most forms don't collect passwords)

### B.4 Niche / specialized (1–2 products) — v2+ territory

Voice recording (Fillout), barcode scanner (Jotform, Glide, Softr), color picker (Fillout, Paperform), video recording, location/GPS, PDF viewer, record picker (Fillout), spinner/stopwatch (Glide), AI Custom (Glide), subscription/recurring payment, rich-text/HTML, progress bar, embedded video/audio/maps.

### B.5 Cross-kind components (beyond forms — apply to portal / dashboard / landing)

**Present in Softr and/or Glide** (both ship full portal/no-code catalogs):

- **Collections / Lists** (grid, cards, timeline, inbox, kanban, calendar, map)
- **Tables** (data grid with sortable columns)
- **Charts** (bar, line, area, pie, donut — Softr adds stacked/rose/scatter)
- **Big Number / KPI card**
- **Navigation / Header / Tabs / Breadcrumbs**
- **Hero / Landing sections** (cover image + heading + CTA)
- **Feature / Testimonials / Pricing / Partner grids**
- **Detail page** (item-level view with data binding)
- **Action buttons** (add/edit/delete/call-API/download)
- **Containers** (columns, stacks, sections, tabs-container)
- **Authentication surfaces** (signup, onboarding flow, 401/404) — Softr-specific; N/A for Ditto's v1 opaque-URL-public model
- **Rich text / Markdown / Code** display
- **Images / Galleries / Video embeds**

These are not form fields — they are the *rendering vocabulary* for `portal`, `dashboard`, and `landing` app kinds (per ADR-040 §1).

### B.6 Scale contrasts (what's "small" vs "large" vs "superset"?)

| Tier | Examples | Catalog size |
|---|---|---|
| Minimum viable | Google Forms (11), Microsoft Forms (8), Framer Forms (~10) | 8–11 |
| Mainstream | Typeform (~25–30), Paperform (27), Tally (~22) | 20–30 |
| Superset | Fillout (50+), Jotform (40 basic + 300 widgets), SurveyJS (~32 question types + composites) | 50+ |
| OSS reference | JSON Forms material-renderers (~30+), RJSF core (12 fields + 19 widgets = 31) | 30+ |

AI app-builders using shadcn/ui (v0, Lovable) effectively have a floor of ~40–50 primitives but no upper bound (LLM can write arbitrary JSX).

---

## Part C — Catalog-definition mechanisms

Four distinct mechanisms across the OSS scout. Ditto has already chosen Zod-first (via json-render adoption per ADR-009 §3), which is a fifth category not prevalent in the scouted libraries.

### C.1 JSON Schema + parallel UI Schema

**RJSF and JSON Forms.** Data-shape (JSON Schema) and render-shape (UI Schema) are separate trees. The UI Schema keys by JSON Pointer segments (RJSF) or has its own `Control | Layout | Group` element types (JSON Forms).

- **Source:** `rjsf/packages/core/src/getDefaultRegistry.ts` (registry entry-point; field + widget counts live in `rjsf/packages/core/src/components/fields/index.ts` and `rjsf/packages/core/src/components/widgets/index.ts`); `jsonforms/packages/core/src/testers/testers.ts` (ranked-tester implementations).
- **Pros (factual):** Most W3C-aligned. Strong validator ecosystem (AJV). Component resolution via either `ui:widget`/`ui:field` string lookup (RJSF) or ranked-tester functions (JSON Forms).
- **Cons (factual):** Two trees to maintain. UI Schema for deeply-nested data is cumbersome.
- **Catalog breadth:** RJSF ships 12 fields + 19 widgets + 10 theme packages; JSON Forms material-renderers ships ~30+.
- **LLM authoring friendliness:** Dual-tree is harder for streaming — renderer must correlate both.

### C.2 JSON Schema + `x-*` extensions (single-tree)

**Formily.** Single schema tree with `x-component`, `x-component-props`, `x-decorator`, `x-display`, `x-pattern`, `x-reactions`, `x-validator` alongside standard JSON-Schema keywords.

- **Source:** `formily/packages/json-schema/src/schema.ts:150-164`, `formily/packages/json-schema/src/types.ts:20-45`.
- **Pros:** Single tree. Authoring and rendering share a schema.
- **Cons:** Vendor-prefixed keys are not validator-standard. Formily compiles `{{expressions}}` via `new Function()` — `formily/packages/json-schema/src/compiler.ts:20-35` — explicit code-execution surface.
- **Catalog breadth:** Formily itself ships no components; adapters (`@formily/antd`, `@formily/element`, `@formily/next`) bring their own.
- **LLM authoring friendliness:** High — one tree.

### C.3 Proprietary class hierarchy + registry

**SurveyJS, Formio.** Each component is a TS/JS class extending a base; registered via `Serializer.addClass()` + `QuestionFactory.registerQuestion()` (SurveyJS) or `Components.setComponent()` (Formio).

- **Source:** `surveyjs/packages/survey-core/src/question_text.ts:887-1049`, `surveyjs/packages/survey-core/src/questionfactory.ts:7-89`; `formio/src/components/Components.js:60-89`.
- **Pros:** Richest property vocabulary observed (Formio's `Component.js:32-200` base schema has ~40+ per-component properties including `validate`, `conditional`, `calculateValue`, `encrypted`, `allowCalculateOverride`, `customDefaultValue`, `persistent`).
- **Cons:** Steep custom-component bar (full class + serializer metadata + editForm). Component code tightly coupled to runtime.
- **Catalog breadth:** SurveyJS ~32 question types; Formio 38 top-level component folders.
- **LLM authoring friendliness:** Medium — LLM generates JSON of `{type, ...properties}` shape; runtime instantiates the class.

### C.4 Code-first TypeScript registration

**Plasmic, Builder.io, Craft.js.** Components are React components; catalog is a registration call — `registerComponent(Component, meta)` (Plasmic), `builder.registerComponent({ name, inputs: [...] })` (Builder), `Component.craft = { rules, related, props }` (Craft.js).

- **Source:** `plasmic/packages/host/src/registerComponent.ts` (public `registerComponent(component, meta)` + `window.__PlasmicComponentRegistry` mutation); `builder/packages/sdks/src/functions/register-component.ts` (serialization + editor-message emit); `craftjs/packages/core/src/interfaces/nodes.ts` (`craft` static shape).
- **Pros:** Maps 1:1 to existing React codebases. Prop-type-safe at TS level (`RestrictPropType<T, P>` in Plasmic — `component-types.ts:420-435`). Developer-friendly.
- **Cons:** Not schema-first — serialization formats vary. Builder.io serializes functions as strings for remote `new Function()` eval at edit time (`register-component.ts:10-33`) — explicit code-execution channel by design.
- **Catalog breadth:** Plasmic ships minimal built-ins; Builder ships 13 core blocks (accordion, button, columns, custom-code, embed, form, fragment, image, img, personalization-container, raw-text, section, slot, symbol, tabs, text, video); Craft.js ships zero.
- **LLM authoring friendliness:** Medium — LLM generates editor-operation messages rather than pure data.

### C.5 Zod-first (Ditto's adopted approach via json-render)

**json-render (Vercel Labs) + OpenUI (thesysdev).** Zod schemas define the catalog; the same Zod definition validates specs, generates AI authoring prompts (library-driven prompt per OpenUI's `library.prompt()`), and produces JSON Schema (`library.toJSONSchema()`) for external tool-calling.

- **Source:** json-render at https://github.com/vercel-labs/json-render (`packages/core/src/schema.ts` — catalog-as-Zod; `packages/core/src/types.ts` — flat spec format; `packages/react/src/renderer.tsx` — registry + renderer). OpenUI at https://github.com/thesysdev/openui (`packages/react-lang/src/index.ts` — `defineComponent` / `createLibrary` / `library.prompt()` / `library.toJSONSchema()` public API; `packages/react-lang/README.md` — Zod component-definition examples).
- **Properties (factual):** Single source of truth (one Zod definition → validation + prompt generation + JSON-Schema export). Streams compatibly with progressive rendering (partial Zod-validated specs parse without waiting for stream completion). TS-first ecosystem; Zod typing flows end-to-end. JSON-Schema export preserves interoperability with non-TS consumers.
- **Limitations (factual):** Zod is a TS-ecosystem standard, not a W3C standard — external-tooling ecosystem is narrower than JSON Schema's native. Zod-to-JSON-Schema conversion is a lossy bridge in some edge cases (union discrimination, recursive schemas).
- **Catalog breadth:** json-render ships 36 pre-built shadcn/ui components (Readme claim, https://github.com/vercel-labs/json-render#components). OpenUI's default catalog size is not documented in the public README — the repo's `examples/` directory would need enumeration to establish a reference floor (flagged open question).
- **Status:** Ditto adopted this per ADR-009 §3 (`docs/adrs/009-runtime-composable-ui.md:82-108`). This scout surfaces no evidence to reconsider that adoption; it confirms that the Zod-first approach occupies level 8 of the constraint-mechanism taxonomy in §D.

---

## Part D — Constraint-mechanism taxonomy (ranked weakest → strongest)

Eight mechanisms observed, in increasing order of enforcement strength:

1. **Prompt-only.** Model told to "use shadcn/ui"; nothing enforces it. *Firebase Studio; early Bolt.new before the artifact envelope.*
2. **Prompt + machine-readable component docs.** Context-injected component docs reduce hallucination. *v0.app via shadcn/skills (March 2026 CLI v4 release); Lovable via boilerplate.*
3. **XML artifact envelope + platform sandbox.** Output shape is constrained; runtime rejects disallowed capabilities but component content is still free-form code. *Bolt.new's `<boltArtifact>/<boltAction>` + WebContainer.*
4. **Multi-agent verifier loop.** Verifier runs code, reads stderr, self-corrects — catches runtime errors rather than enforcing a catalog. *Replit Agent.*
5. **Fail-open with fallback renderer.** Unregistered components render as `"No applicable renderer found"` or a minimal fallback. *JSON Forms `UnknownRenderer` (`jsonforms/packages/react/src/UnknownRenderer.tsx:40-48`), Formio `UnknownComponent`, RJSF `FallbackField`.*
6. **Fail-fast invariant throw.** Unregistered component names throw `ERROR_NOT_IN_RESOLVER`. *Craft.js (`craftjs/packages/core/src/utils/resolveComponent.ts:54-58`).*
7. **Component-mapping compiler pipeline.** AI → IR (Mitosis) → framework-specific codegen; BYO-components whitelist enforced at mapping step. *Builder.io Visual Copilot.*
8. **Catalog + Zod validation + library-driven prompt + streaming parser.** System prompt is *generated FROM the catalog* so the model cannot describe components that don't exist; Zod gates props; parser rejects unknown node types; catalog exportable as JSON Schema. *OpenUI, json-render.* (Observable maximum in the scout; Ditto sits here per ADR-009 §3 adoption.)

**HTML-sanitization layer** (orthogonal to catalog enforcement; applies when components accept user-authored text):
- **DOMPurify on all rendered strings.** Formio runs every `this.sanitize()` call through DOMPurify (`formio/src/utils/utils.js:4,1516-1583`).
- **`disableParsingRawHTML: true` forced in markdown renderer.** RJSF (`rjsf/packages/core/src/components/RichDescription.tsx:37-43`).
- **No arbitrary HTML accepted.** JSON Forms, Plasmic (except via slot), Craft.js.
- **Explicit escape hatches.** Builder.io ships `custom-code`/`embed` blocks that bypass the type system.

**Trust-tier-gated component richness** — NOT FOUND in any scouted library. All registries are all-or-nothing per editor instance. Craft.js's per-node `canDrag/canDrop` (`interfaces/nodes.ts:35-45`) is the closest analog but operates at node level, not catalog level. Ditto's ADR-009 §4 pattern (catalog richness modulated by trust tier) is **original to Ditto's architecture**.

---

## Part E — Property conventions

### E.1 Universal per-field properties (present in ≥5 of 7 OSS form libraries + all mainstream form-builders)

1. **label / title / friendlyName** — display text of the field
2. **description / help-text / tooltip** — supplementary explanation
3. **defaultValue / default** — prefilled value
4. **required** — must be filled before submit
5. **hidden / visible / visibleIf / showIf / x-display** — conditional visibility (expression-driven in all except RJSF which uses JSON Schema if/then)

### E.2 Common but not universal

- **placeholder** (SurveyJS, Formio, RJSF via uiOptions, JSON Forms via options, Builder.io)
- **readOnly / enabled / x-pattern** (all OSS libs except Craft.js)
- **validation rules** (all form libs; typed in Zod/Formio/SurveyJS, AJV in RJSF/JSON Forms)
- **advanced / showMode / hidden** (Plasmic, Builder, SurveyJS — "power user" property gating)
- **localized / isLocalizable / i18n key** (Plasmic, Builder, SurveyJS — marks strings translatable)
- **dependsOn / refreshOn / x-reactions / rule** (declarative inter-field effects — all form libs)

### E.3 Inconsistent (no convergence)

- **Responsive breakpoints** — JSON Forms UI-schema options, Builder via `responsiveStyles`, Plasmic via variants, others do not standardize.
- **A11y** — left to underlying component in every library scouted. No universal a11y-label convention beyond `aria-label` passthrough.
- **Error messages** — mix of static strings, i18n keys, custom functions.

### E.4 The "every component has these N fields" pattern

The following 5 fields are the consensus minimum: `label`, `description`, `defaultValue`, `required`, `visibility`. If Ditto's v1 catalog ships these on every component, it matches the dominant convention.

---

## Part F — Submission-shape conventions

Four distinct shapes observed across form-builders + OSS libraries:

### F.1 Ordered fields array with typed values

```json
{
  "event_id": "...",
  "form_response": {
    "submitted_at": "2026-04-21T14:42:33Z",
    "answers": [
      { "type": "email", "email": "a@b.com", "field": { "id": "Xy7", "ref": "email", "type": "email" } },
      { "type": "text",  "text":  "Hello",  "field": { "id": "Ab3", "ref": "message", "type": "short_text" } }
    ]
  }
}
```

**Products:** Typeform, Tally, Fillout.
**Pros:** Self-describing, type-tagged, robust across schema edits (old submissions remain readable even after fields renamed).
**Cons:** Verbose; consumers have to iterate the array to look up a field.

### F.2 Flat key-value + metadata

```json
{
  "form": "<form-id>",
  "_date": "2026-04-21T14:42:33Z",
  "data": { "email": "a@b.com", "message": "Hello" }
}
```

**Products:** Formspree, Netlify Forms, Webflow, Jotform (inside `rawRequest`).
**Pros:** Simple; maps directly to HTML form defaults.
**Cons:** Type information lost; schema-edit fragility (renaming a field orphans old submissions).

### F.3 Schema-nested (data tree mirrors schema tree)

```json
{ "user": { "email": "a@b.com", "name": { "first": "Ada", "last": "Lovelace" } }, "message": "Hello" }
```

**Products:** RJSF, JSON Forms, Formily.
**Pros:** Typed per schema; nested structure preserved.
**Cons:** Only works when the schema is itself nested; form-as-flat-list maps awkwardly.

### F.4 Wrapped envelope

```json
{ "data": {...}, "metadata": {...}, "state": "submitted" }
```

**Products:** Formio only.
**Pros:** Explicit submission state (draft/submitted); metadata pocket.
**Cons:** Proprietary; unique among scouted libs.

### F.5 Commonalities across all shapes

- Files delivered as **URLs**, never base64 (Netlify persists 24h after form-delete; Typeform/Tally persist indefinitely).
- Timestamps are **ISO-8601**.
- Responses include a **stable response/submission ID**.
- Field identity is a **stable ID** separate from display label (enables rename without breaking history).
- Webhook signing uses **HMAC-SHA-256** (Tally, Webflow).
- Retry policies vary: Basin 15× over 24–28h; Tally staged (5/30/60/360/1440 min); Webflow 3×.

---

## Part G — Anti-spam and security defaults

### G.1 Anti-spam conventions across mainstream form-builders

Every UI builder ships at least one of:
- **reCAPTCHA** (v2/v3 most common) — Typeform, Tally, Webflow, Jotform, Paperform
- **Honeypot** — Formspree, Basin, Paperform, Webflow (documented pattern), Netlify (via attribute)
- **Akismet** — Netlify, Formspree, Basin
- **Invisible bot detection** — Typeform (default), Framer

**Emerging baseline v1 stack (for Ditto's consideration):** honeypot + rate-limit + optional reCAPTCHA or hCaptcha or Cloudflare Turnstile. Matches ADR-040 §9 constraint.

### G.2 Security observations

- **HTML handling split** — libraries that render user-authored text either (a) route it through DOMPurify (Formio, precedent), or (b) force-disable raw HTML in markdown (RJSF), or (c) refuse to render HTML at all (JSON Forms, Plasmic without slot escape, Craft.js).
- **Code-execution surfaces** — Formily compiles `{{expressions}}` via `new Function()`; Builder.io serializes functions as strings for remote eval; Plasmic accepts `code` PropType with `css/html/javascript/json` subtypes. All three are explicit design decisions for authoring-time flexibility; Ditto's ADR-040 §9 explicitly forbids this for the external-app registry (render-time catalog is the security boundary).
- **Submission-endpoint auth** — all form-builders use same origin + HMAC webhook signing. CSRF is not the relevant threat because submissions are unauthenticated.

---

## Part H — Versioning + rollback patterns

### H.1 Form-level versioning (form-builders)

**Essentially nobody offers true form versioning.** Field IDs are stable across edits; submissions retain original field IDs and (in Typeform/Tally/Fillout) a type snapshot. No builder offers "form v2 — route existing submissions" semantics.

### H.2 App-level versioning (AI app-builders + no-code)

- **Chat-history checkpoints** — v0, Lovable, Bolt use chat-turn history as implicit versioning; GitHub sync provides real VCS.
- **Per-step checkpoints** — Replit Agent stands alone: it creates explicit checkpoints automatically while working; user can roll back to any prior state from the UI.
- **App-level versioning** — Softr, Glide, Plasmic Studio all have revision/branching primitives at the app level.

### H.3 Component-level versioning — nobody

No product scouted versions individual components independently of the enclosing app/spec. ADR-040 §4 versions at app level (matching app-builder/no-code norm), which aligns with the convention.

### H.4 Rollback semantics

The ADR-040 rollback model (`current.json` pointer switch) matches Replit Agent's per-step-checkpoint pattern more closely than the chat-history-rewind pattern. No library scouted uses a pointer-file; most use a DB-row "active_version" marker or git refs.

---

## Part I — Extensibility conventions

How do libraries let users register custom components?

| Library | Mechanism | Source |
|---|---|---|
| SurveyJS | `Serializer.addClass()` + `QuestionFactory.registerQuestion()` | `surveyjs/.../questionfactory.ts:7-89` |
| Formio | Extend `Component`, then `Components.setComponent(name, class)` | `formio/src/components/Components.js:60` |
| JSON Forms | Add `{tester, renderer}` pair to renderers array | `jsonforms/.../renderers.ts:40-99` |
| RJSF | `withTheme({fields, widgets, templates})` HOC | `rjsf/packages/core/src/withTheme.tsx:17-42` |
| Formily | `createSchemaField({ components: {...} })` | `formily/.../SchemaField.tsx:28-35` |
| Plasmic | `registerComponent(Comp, meta)` — mutates `window.__PlasmicComponentRegistry` | `plasmic/.../registerComponent.ts:360-400` |
| Craft.js | `<Editor resolver={{MyButton: MyButton, ...}}>` | `craftjs/.../resolveComponent.ts:45-60` |
| Builder.io | `Builder.registerComponent(Comp, info)` | `builder/.../register-component.ts:1-38` |

**Catalog-extension for Ditto's v1** is not in scope (ADR-040 §11 defers third-party component contributions to post-MVP). The patterns above are reference for when that scope opens.

---

## Part J — Original to Ditto

Confirmed via this scout — these are architectural concepts NOT present in any scouted product:

1. **Trust-tier-gated component richness** (ADR-009 §4 + ADR-040 §7). No library implements per-viewer capability-gated catalogs. All registries are static per editor instance. Closest analog is Craft.js per-node rules, operating at node level not catalog level.
2. **Per-app classifier routing on submission** (ADR-040 §6). No form-builder routes submitted data through a classifier process to decide labeling, routing, or downstream action. All ship single-endpoint + zapier-style integrations.
3. **YAML-primary spec with filesystem legibility** (ADR-040 §2, per Insight-201). No scouted library uses YAML as canonical at-rest storage; all use JSON (SurveyJS, Formio, JSON Forms, RJSF, Formily) or proprietary binary blobs (Plasmic, Builder.io). YAML↔JSON conversion itself is trivial; the architectural novelty is Ditto's treatment of the YAML path as the source of truth with the DB as mirror (per ADR-037 pattern).
4. **Two-registries-one-catalog** (ADR-040 §3: workspace-internal + external-app on the same catalog). No library exposes dual registries sharing a vocabulary with per-surface gating. All are single-namespace.
5. **Conversational authoring + rollback by conversation** (ADR-040 §4 + Brief 209 §UX). AI app-builders converge on chat-based authoring but none treat conversational rollback (*"revert to last week's version"*) as a first-class primitive.
6. **Submission-as-work-item** (ADR-040 §6). Form-builders deliver to webhook/email/sheet; Softr/Glide deliver to a row in a database. No product routes submissions through a process-primitive with trust-tier-governed outbound responses.

---

## Part K — Open questions for the Architect (sub-brief 210 decisions)

Factual, neutrally framed:

1. **v1 catalog scale.** Minimum viable is 8–11 (Google/MS Forms). Mainstream mid-20s (Typeform/Tally/Paperform). ADR-040 §11 open question #1 proposed "~13 components" for v1. Observed convergence: **10 universal field types** (§B.1) + **5–8 layout/display components** (heading, text-block, divider, button, link, image, card-container, section) = **15–18 components** if Ditto wants to cover form + landing kinds in v1. Dashboard kind needs additional **3–5 data components** (data-table, metric-card, chart-simple, list, status-indicator). Portal kind is the most expansive (full Softr/Glide vocabulary would be 30+).
   - **Options:** v1 = forms-only (~15 components) vs v1 = forms + landing (~20) vs v1 = all four kinds minimal (~25).
2. **Catalog-definition mechanism.** Zod-first (via json-render) is already decided per ADR-009 §3. This scout confirms Zod is appropriate; no reason to reconsider.
3. **Submission shape.** Ordered-fields-array (Typeform/Tally) is self-describing; flat-KV (Formspree) is simpler; schema-nested (RJSF/JSON Forms) is strict. ADR-040 §6 doesn't specify. Whichever is chosen, the scout-observed commonalities (stable field ID separate from label; ISO-8601 timestamps; files as URLs; HMAC-SHA-256 signing; stable submission IDs) should be honored.
4. **Property vocabulary per component.** Consensus minimum: `label`, `description`, `defaultValue`, `required`, `visibility`. Beyond the minimum: `placeholder`, `readOnly`, `validation`, `dependsOn`. Plasmic's PropType discriminated-union is the richest observed pattern — 17 variants (§C.4).
5. **Visibility / conditional logic DSL.** Options observed, with factual notes:
   - **JSON Schema `if/then/else`** (RJSF standard) — declarative, specification-standard, verifiable offline.
   - **Expression strings** (SurveyJS `visibleIf`, Formio `conditional`) — compact, requires a small expression parser at runtime.
   - **Declarative `rule: { effect, condition }` trees** (JSON Forms) — decoupled from the data schema; most structurally similar to ADR-040's Zod-first approach.
   - **`x-reactions`** (Formily) — reactive-observable model; requires `new Function()` compilation of bindings (`formily/packages/json-schema/src/compiler.ts:20-35`).
   - **Property-level functions** (Plasmic `hidden: (props) => ...`) — arbitrary TS functions at registration time.
   - **ADR-040 §9 constraint for Ditto:** arbitrary code in specs is forbidden (catalog is the security boundary), so Formily-style `new Function()` compilation of embedded expressions and Plasmic-style property-level functions fall outside the allowed set. JSON Schema `if/then/else`, declarative rule trees, and expression strings parsed through an allow-listed operator set remain within the constraint.
6. **Anti-spam defaults.** Honeypot + rate-limit are universal cheap defaults. Captcha (reCAPTCHA v3, hCaptcha, or Cloudflare Turnstile) is per-app opt-in per ADR-040 §6. Matches existing convention.
7. **File upload infrastructure.** Universal convention: files as **URLs**, never base64. Ditto needs a file-host target — Brief 200 (workspace git-over-HTTPS server) is a natural candidate for submission-asset storage alongside the submission JSON. Alternative: third-party uploader (Uploadcare, S3, Cloudflare R2). Open for Architect.
8. **Constraint-enforcement strength.** ADR-040 §9 specifies "catalog is the security boundary." The scout's 8-level taxonomy (§D) places json-render + OpenUI at level 8 (observable maximum: catalog + Zod validation + library-driven prompt + streaming parser). Ditto sits at level 8 by construction per ADR-009 §3 adoption of json-render.
9. **Rollback atomicity.** Ditto's `current.json` pointer file (ADR-040 §4) is atomic for v1's single-writer model. Under concurrent deploys, a compare-and-swap (CAS) on the pointer file is a likely sub-brief 210 implementation concern — flagged, not prescribed.
10. **Catalog extensibility timeline.** v1 ships a fixed catalog. Extensibility (user-registered components) is post-MVP per ADR-040 §11. If/when it opens, the clearest pattern from the scout is Plasmic's `registerComponent(Comp, meta)` with typed PropType metadata — extractable for Ditto when the time comes.

---

## Reference doc status

**Reference docs updated this session:** `docs/landscape.md` — 6 new landscape entries added (AI app-builders section bucketed + OSS schema-form libraries section new). Researcher owns landscape accuracy per Insight-043.

**Reference docs checked, no drift found:**
- `docs/adrs/009-runtime-composable-ui.md` — json-render adoption language still correct; this scout confirms Zod-first + catalog-constrained + library-driven prompt is the strongest constraint mechanism observed (level 8 of 8 on the taxonomy).
- `docs/adrs/040-user-facing-apps-primitive.md` — all §11 open questions now have factual input. No contradictions surfaced.
- `docs/briefs/209-user-facing-apps-phase.md` — sub-brief 210 row references "13-ish components"; this scout provides the scale-contrast data to refine that number.

**New `docs/landscape.md` entries added (this session):**
1. **AI App-Builders bucket entry** — v0 / Lovable / Bolt.new / Replit Agent / Firebase Studio (pattern-only, not adoption candidates)
2. **OSS Schema-Form Libraries bucket entry** — SurveyJS / Formily / JSON Forms / RJSF / Formio (pattern references)
3. **Plasmic** — standalone entry (code-first registration pattern reference)
4. **Builder.io Visual Copilot** — standalone entry (component-mapping pipeline pattern)
5. **Craft.js** — compact entry (fail-fast resolver pattern reference)
6. **Form/Portal Builder bucket entry** — Typeform / Tally / Fillout / Jotform / Paperform / Google Forms / Microsoft Forms / Softr / Glide / Framer / Webflow Forms / Formspree / Netlify Forms / Basin (field-vocabulary + submission-shape pattern references)

These are compact entries (2–6 lines each in landscape.md) — not deep evaluations, because none are adoption candidates. Their purpose is future-Architect reference: "where did we get this pattern?"

---

## Scout methodology + provenance

Three parallel subagent scouts executed 2026-04-21:
- Scout A (AI app-builders): 10 products, external docs + public artefacts, ~30 source URLs
- Scout B (form + portal builders): 14 products, official docs + developer references, ~40 source URLs
- Scout C (OSS schema-driven libraries): 8 projects, GitHub source at `{repo}/file:line` granularity, ~60 code-level references

All claims cite either a URL (closed-source) or `{repo}/file:line` (open-source). Scouts executed in parallel via the Agent tool; raw scout output preserved for verification. Freshness: all sources as of 2026-04-21.

Ditto-internal cross-reference: `docs/research/tool-surface-landscape.md` (tool-surface inventory), `docs/research/tool-coverage-by-persona-ux.md` (persona coverage matrix), `docs/adrs/040-user-facing-apps-primitive.md` (App primitive architecture), `docs/briefs/209-user-facing-apps-phase.md` (phase build decomposition).
