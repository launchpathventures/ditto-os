# ADR-009: Process Output Architecture

**Date:** 2026-03-23 (revised from 2026-03-20)
**Status:** accepted (revision 2 — replaces original "Runtime Composable UI" scope)
**Layers affected:** L1 Process (output schemas in definitions), L2 Agent (agents produce typed outputs), L3 Harness (trust-governed delivery), L4 Awareness (inter-process output contracts extend dependency graph), L6 Human (work surface rendering, Self presents outputs in conversation)

## Context

### Original Question (2026-03-20)

Should Ditto build a formal runtime UI composition protocol (ViewSpec JSON) for its web dashboard? **Answer: no.** React's natural composition model suffices for the web frontend. This decision stands for the app's own UI scaffolding (views, primitives, layout).

### New Question (2026-03-23)

Processes produce outputs. Those outputs are the primary way processes manifest on the work surface (Insight-067). What is the architecture for process outputs — their types, schemas, rendering, lifecycle, and role as interfaces between processes?

This question arose from three triggers:
1. **Insight-066** (Process Outputs Are Polymorphic) — processes produce typed artifacts: data, rendered views, documents, API calls, external artifacts. Not just UI.
2. **Insight-067** (Conversation Is Alignment, Work Surface Is Manifestation) — the work surface is where outputs live; conversation is where they get discussed and refined.
3. **Research** (`docs/research/rendered-output-architectures.md`) — deep extraction of json-render, Vercel AI SDK, OpenUI, Streamlit/Gradio patterns for AI-generated structured output rendering.

### Forces

- Processes currently produce text outputs logged as activities. No typed output schema exists.
- The architecture spec (Layer 1) defines process outputs as `[What] → [Destination]` but doesn't define output types, schemas, or lifecycle.
- ADR-009 v1 defined six Output Viewer types (Text, Data, Visual, Code, Action, Decision). These are **presentation types** — how to render a thing visually. They are orthogonal to **destination types** — where a thing goes and Ditto's relationship to it.
- json-render (Vercel Labs) provides a mature catalog-constrained rendering pattern that didn't exist when ADR-009 was originally written.
- The Ditto app's primary surface is the work surface, not a conversation interface. Telegram and other messaging surfaces are secondary (not primary).
- Processes can produce things that leave Ditto entirely (deployed apps, published content).

## Decision

### 1. Process Definitions Declare Output Schemas

Every process definition includes an `outputs` section that declares what the process produces. This extends the Layer 1 process definition structure:

```
Process: [Name]
├── ...existing fields...
├── Outputs:
│   ├── [name]:
│   │   ├── type: [data | view | document | integration | external]
│   │   ├── schema: [shape declaration — Zod for data/view, MIME for document, service for integration]
│   │   ├── lifecycle: [static | dynamic]
│   │   └── destination: [work-surface | process:<name> | integration:<service> | external]
```

**Output destination types** (where it goes, Ditto's role):

| Type | Where it lives | Ditto's role | Example |
|------|---------------|--------------|---------|
| `data` | In Ditto (DB/store) | Owns it, passes to next process | Extracted invoice fields, classification results |
| `view` | On the work surface | Renders it (static or dynamic) | Dashboard, report, status board |
| `document` | Exported / attached | Produces it, stores reference | PDF report, formatted proposal |
| `integration` | External system | Fires API call, logs result | Salesforce update, Jira ticket creation, email |
| `external` | Out in the world | Tracks provenance + pointer | Deployed app, published website, configured SaaS instance |

**Output lifecycle** (how it changes over time):

| Lifecycle | Behaviour | Example |
|-----------|-----------|---------|
| `static` | Produced once when the step/process completes. Immutable snapshot. | Final report, sent email, completed analysis |
| `dynamic` | Projection of ongoing process state. Re-renders as the process advances. | Incident board during response, project status during execution |

**Relationship to ADR-009 v1 presentation types:** The original six Output Viewer types (Text, Data, Visual, Code, Action, Decision) remain valid as **presentation types** — they describe how `view`-type outputs render visually. They are a property of the view's catalog, not the output architecture.

### 2. Outputs Are the Public Interface Between Processes

When process A produces a `data`-type output and process B consumes it, the output schema of A is the input contract of B. This is **process composition via data contracts**.

```
Process: weekly-report
├── Outputs:
│   ├── report-data:
│   │   ├── type: data
│   │   ├── schema: z.object({ metrics: z.array(MetricSchema), period: z.string() })
│   │   └── destination: process:quarterly-review
```

The runtime validates that process B's expected input matches process A's declared output schema. Schema mismatches are caught at definition time (during `sync`), not at runtime. This formalises the type contracts that Layer 4's dependency graph propagates at runtime — output schemas are the static contract; events are the dynamic delivery mechanism.

### 3. Rendered Views Use Catalog-Constrained Specs (json-render Pattern)

For `view`-type outputs, Ditto adopts the **catalog → registry → renderer** pattern from json-render:

**Schema** (shared grammar — what shape all view specs take):
- Flat map of elements with string-key references (optimised for streaming/progressive rendering)
- Dynamic value expressions for state binding
- Action bindings for user interaction
- The schema is defined once, shared across all processes

**Catalog** (per-process vocabulary — what components this process can use):
- Each process template ships with a catalog declaring available components
- Catalogs are Zod-based: same definition validates output, generates AI prompts, and produces JSON Schema
- Trust tiers modulate catalog richness (Section 4)
- Catalogs compose — a process catalog can spread from a base catalog and add custom components

**Registry** (per-surface rendering — how components look on each platform):
- The Ditto app's web registry maps catalog components to React implementations (shadcn/ui + Tailwind)
- Additional registries for other surfaces (PDF, email) are deferred until needed
- One catalog definition, N surface registries

**Renderer** (spec to pixels):
- Tree walker that resolves element references, evaluates visibility/state bindings, and renders via the registry
- Progressive rendering: elements render as they arrive during streaming
- Error boundaries per element — one bad component doesn't crash the view

**Provenance:** json-render (Vercel Labs) `packages/core/src/schema.ts` (catalog as triple-duty contract), `packages/core/src/types.ts` (flat spec format), `packages/react/src/renderer.tsx` (registry + renderer pattern).

### 4. Trust Tiers Govern Output Delivery and View Richness

Trust extends to outputs in two ways:

**Delivery governance** — whether an output can be sent/published without human review:

| Trust tier | Output delivery |
|------------|----------------|
| Supervised | All outputs held for review before delivery |
| Spot-checked | Sampled outputs held; others auto-deliver |
| Autonomous | Auto-deliver; exceptions paused |
| Critical | All outputs held + audit trail required |

**Catalog richness** — what components are available for `view`-type outputs:

| Trust tier | Catalog scope |
|------------|--------------|
| Supervised | Minimal — text, tables, status indicators |
| Spot-checked | Standard — charts, forms, interactive elements |
| Autonomous | Full — all catalog components including actions |
| Critical | Full + audit components (evidence trail, approval chain) |

This is a governance dial, not a technical constraint. The runtime filters the catalog based on trust tier before generating the AI prompt. Higher trust = richer vocabulary = more expressive outputs.

### 5. The Self Presents Outputs in Conversation

The Conversational Self (ADR-016) can pull outputs into conversation for discussion, clarification, and refinement. This mirrors how a colleague puts a document on screen in a meeting.

In conversation context:
- The Self references outputs by their process and output name
- `view`-type outputs render inline using the same catalog/registry
- `data`-type outputs render as summarised tables or key values
- Other types render as metadata cards (document link, API result status, external pointer)

The work surface is where outputs **live**. Conversation is where they get **discussed**. The Self is output-literate: it can read structured output data, summarise it, and help the user refine it.

### 6. Durable Principles (Carried Forward from v1)

These principles from the original ADR-009 remain valid and unchanged:

**Principle A: Jobs are the organising dimension, not domains.** The 16 UI primitives map to six human jobs. Views compose around jobs. No domain-specific screens.

**Principle B: Trust tier modulates UI density.** Extended in Section 4 to also modulate catalog richness and output delivery governance.

**Principle C: View compositions are defaults, not fixed screens.** The 8 view compositions from the architecture spec remain starting points. The work surface dynamically shows process outputs alongside these views.

**Principle D: No ViewSpec protocol for the app's own UI.** The Ditto app's scaffolding (navigation, layout, primitives) remains standard React. The catalog-constrained rendering in Section 3 applies to **process outputs only** — not to the app's own UI structure.

### 7. Security Boundaries for Outputs

**Output type declarations are immutable at runtime.** They are part of the process definition, set at definition time. An agent cannot change its declared output type mid-execution — it cannot escalate from `data` (stays in Ditto) to `integration` (leaves Ditto) to bypass trust governance.

**`integration`-type outputs route through the integration registry's credential brokering** (ADR-005, Composio pattern). The output step resolves credentials via the same `resolveAuth(service, protocol, processId?)` mechanism as integration executor steps. No direct credential access by agents.

**Outputs that leave Ditto (`integration`, `external`) at Supervised or Critical trust tiers always require human review before delivery.** This is implicit in the Section 4 delivery governance table but stated explicitly here for security: supervised and critical processes cannot auto-deliver to external systems.

**Data minimisation:** `integration` outputs should declare which fields from the process context are included in the external payload. The output schema serves as the data-exposure contract — only declared fields leave Ditto.

### 8. What This Does NOT Cover

- **The Ditto app's UI framework** — still standard React (Principle D). This ADR covers process output rendering within the app, not the app's own architecture.
- **Output storage format** — how outputs are persisted in the database. This is a brief-level decision.
- **Output versioning** — whether/how output history is tracked across process runs. Deferred to implementation.
- **Collaborative outputs** — multiple humans viewing/editing the same output simultaneously. Deferred to Phase 13+.
- **Output marketplace** — sharing output catalogs between users. Deferred to post-MVP.

## Provenance

- **Catalog → Registry → Renderer pattern:** json-render (Vercel Labs) `packages/core/src/schema.ts`, `packages/react/src/renderer.tsx`. **Composition level: adopt** — take relevant source files into Ditto's codebase, adapt for process-scoped catalogs and trust-governed richness. json-render is v0.x, single-maintainer, 68 days old — too immature for a hard dependency. The code is excellent; the project is not yet dependable. (Insight-068)
- **Flat spec with JSON Patch streaming:** json-render `packages/core/src/types.ts`. **Composition level: adopt** — spec types and streaming logic taken into Ditto's codebase. RFC 6902 (JSON Patch) and RFC 6901 (JSON Pointer) are standards; the flat spec structure is json-render's design.
- **Output destination taxonomy:** Original — no surveyed framework has polymorphic typed outputs with destination routing. Informed by Insight-066.
- **Trust-governed output delivery:** Original — no surveyed framework connects trust tiers to output publication/delivery governance.
- **Trust-governed catalog richness:** Original — no surveyed framework adjusts the component vocabulary based on earned trust.
- **Output as process interface:** Original — no surveyed framework uses output schemas as inter-process data contracts.
- **Conversation/work surface duality:** Original — informed by Insight-067. No surveyed framework distinguishes where outputs live vs where they get discussed.

## Consequences

**What becomes easier:**
- Process templates become more valuable — they ship with output schemas, not just step definitions
- Inter-process composition has a type-safe contract mechanism
- The work surface has a clear rendering path for process outputs
- Trust governance extends naturally to what users see and what gets delivered externally
- The Self can meaningfully discuss process outputs because they're structured and typed

**What becomes harder:**
- Process definitions become more complex — output schemas add authoring burden. Mitigated by templates that include outputs and by the Self helping articulate output shapes conversationally.
- Catalog management requires design work per process domain. Mitigated by composable catalogs (spread from base + customise).
- Dynamic outputs require the renderer to handle progressive updates as processes execute. Mitigated by json-render's flat spec format designed for exactly this.

**What new constraints this introduces:**
- Every process template MUST declare its output schema — outputs are not optional metadata
- `view`-type outputs MUST use catalog-constrained specs — agents cannot produce arbitrary markup
- Output schemas are contracts — changing them is a breaking change for downstream processes
- The catalog is the trust boundary for rendered outputs — what's not in the catalog can't be rendered

**Feedback capture:** Output review feedback (human approves, edits, or rejects an output before delivery) follows the existing Layer 5 feedback capture mechanisms — edits-as-feedback, confidence scoring, correction patterns. No new feedback mechanism needed.

**Terminology note:** Insight-066 used the term "API call" for the fourth output type. This ADR uses "integration" to align with the existing integration registry and executor from ADR-005/Phase 6.

**Follow-up decisions needed:**
- [ ] Brief for implementing output schema support in process definitions (extends process-loader, DB schema)
- [ ] Brief for implementing the view rendering pipeline (catalog, registry, renderer — likely uses json-render as dependency)
- [ ] Brief for output-as-interface validation (schema compatibility checking at sync time)
- [ ] Evaluate A2UI v1.0+ when multi-platform rendering is needed (carried from v1)
- [ ] Design the work surface layout — how outputs, process state, and conversation coexist (feeds Phase 10 app design)

**Activations of this ADR:**
- **ADR-040 (2026-04-21)** activates the `external` output type declared in §1 as a first-class primitive called *App*. Apps use the same json-render catalog substrate adopted in §3 (with a second, external-app registry per ADR-040 §3), extend the trust-tier delivery model from §4 to user-facing outbound auto-responses, and resolve the "Output versioning" item listed in §8 as deferred. See `docs/adrs/040-user-facing-apps-primitive.md`.

## Reference Docs Updated

- `docs/architecture.md` — Layer 1 process definition updated with output schema structure (ADR-009 v2 annotation). Layer 4 output propagation updated with typed contract reference. Output Viewer primitive updated to clarify presentation types vs destination types.
- `docs/insights/066-process-outputs-are-polymorphic.md` — "Where It Should Land" updated to reflect ADR-009 v2 landing.
- `docs/insights/067-conversation-is-alignment-work-surface-is-manifestation.md` — "Where It Should Land" updated (partially landed).
- `docs/landscape.md` — json-render and Impeccable entries added (prior Architect session).
- `docs/research/runtime-composable-ui.md` — marked partially superseded by `rendered-output-architectures.md`.
