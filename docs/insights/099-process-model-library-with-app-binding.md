# Insight-099: Process Model Library — Universal Process Structure with App-Binding Customisation

**Date:** 2026-03-25
**Trigger:** Strategic conversation: "What if we built a synthetic standards generation engine that generated process standards and output standards? These are effectively domain-specific mental models." Refined: process models are pre-defined and battle-tested; the only thing that changes when operationalised is the apps (Gmail, Xero, etc.).
**Layers affected:** L1 Process (abstract actions), L2 Agent (integration binding), L3 Harness (quality profile association), L5 Learning (model refinement from use), L6 Human (adoption flow, app-binding UX)
**Status:** active

## The Insight

Most business processes are structurally universal. Invoice follow-up is invoice follow-up whether you use Xero or QuickBooks. Customer quoting is the same whether emails arrive via Gmail or Outlook. Content review follows the same pattern whether the CMS is WordPress or Shopify. **What varies across organisations is the toolchain, not the process.**

This means Ditto can ship a library of **Process Models** — pre-built, battle-tested, opinionated process definitions that encode domain expertise about how businesses actually do business. When a user adopts a process model, the only significant customisation is **binding abstract actions to their specific apps**.

This is **composition over invention applied to processes themselves**. Users shouldn't need to invent their accounts payable workflow any more than developers need to reinvent authentication.

### What a Process Model Is

A Process Model is the unification of three existing primitives that are currently separate:

| Existing primitive | Where it lives | What it provides |
|---|---|---|
| **Process template** | `templates/*.yaml` (ADR-008) | Steps, executor types, human steps, routing |
| **Quality profile** | `standards/*.yaml` (ADR-019) | Quality criteria, baselines, risk thresholds, trust calibration |
| **Integration declarations** | `integrations/*.yaml` (ADR-005) | Service-to-protocol mapping, tool definitions |

A Process Model **composes** all three: it declares the process structure (what happens), the quality standard (what good looks like), and the integration requirements (what external systems are needed) — but it declares integration requirements **abstractly**, not bound to a specific service.

```
Process Model = Template + Quality Profile + Abstract Integration Requirements
```

This is distinct from a process template (which is just structure) and a quality profile (which is just standards). A Process Model is the complete, opinionated representation of how a type of work should be done — the domain-specific mental model in machine-actionable form.

### The App-Binding Abstraction (New Architectural Concept)

The current integration architecture (ADR-005) is service-specific. A process step says `tools: [slack.send_message]` or `config.service: github`. The process definition is coupled to a specific vendor.

Process Models need an abstraction layer between process steps and concrete integrations:

```yaml
# In the process model (abstract)
steps:
  - id: send-reminder
    executor: integration
    abstract_action: email.send          # abstract capability
    description: Send reminder email to customer

# In the user's binding (concrete)
bindings:
  email.send: gmail.send_email           # Rob uses Gmail
  # OR
  email.send: outlook.send_email         # Jordan uses Outlook
  accounting.get_invoices: xero.get_invoices  # Lisa uses Xero
```

**Abstract actions** are capabilities (`email.send`, `accounting.get_invoices`, `messaging.send`, `storage.upload`) rather than vendor-specific tools. The **binding** maps abstract actions to concrete integration tools from the integration registry.

This is analogous to:
- **Dependency injection** in software (declare what you need, bind at runtime)
- **Interface vs implementation** in OOP (the process declares the interface, the binding provides the implementation)
- **Terraform providers** (declare resources abstractly, provider implements for AWS/GCP/Azure)

**Provenance:** Abstract action binding is Original to Ditto — patterned after Terraform's provider abstraction (resources declare what, providers implement how) and Kubernetes CRD's dynamic binding (custom resources reference capabilities, controllers resolve to implementations). No existing process automation platform decouples process structure from integration vendor at this level.

### Process Model Is a Template Variant, Not a New Primitive

Architecturally, a Process Model is NOT a fourth artifact type. It is a **well-formed template** — a template with both `quality_profile` and `abstract_actions` populated. The "Process Model Library" is a UX/discoverability concept overlaid on the existing template infrastructure (ADR-008). Process Models live in `templates/` alongside other templates. The loader distinguishes them by the presence of abstract actions.

This avoids:
- A fourth YAML directory
- A fourth concept for developers to learn
- Duplication of loader/validator logic

### Coexistence: Abstract Actions and Direct Service References

Within a Process Model, **all integration steps use abstract actions**. This ensures the model is vendor-independent and adoptable by any user.

After adoption, when a user customises the model, they MAY replace abstract actions with **direct service references** for vendor-specific features that the abstract taxonomy doesn't cover. Example: a step that uses a Xero-specific report format not covered by `accounting.get_invoices`.

**Resolution order in the process loader:**
1. If step has `abstract_action` → resolve via binding → fail validation if unbound
2. If step has `config.service` (direct) → resolve via integration registry (existing ADR-005 path)
3. Never both on the same step — the loader rejects ambiguous steps

### Draft Abstract Action Taxonomy (Top 5 Categories)

To validate the 80% rule — here are the abstract actions that cover the most common integration needs across the four personas:

| Category | Abstract actions | Covers |
|---|---|---|
| **Email** | `email.send`, `email.check_inbox`, `email.search` | Rob (quote delivery, follow-up), Lisa (supplier comms), Nadia (client comms) |
| **Accounting** | `accounting.get_invoices`, `accounting.create_invoice`, `accounting.get_payments`, `accounting.reconcile` | Rob (Xero), Lisa (Shopify payments), Jordan (ERP) |
| **Messaging** | `messaging.send`, `messaging.search` | All personas (Slack, Teams notifications) |
| **Calendar** | `calendar.get_events`, `calendar.create_event` | Rob (job scheduling), Nadia (team meetings) |
| **Documents** | `documents.upload`, `documents.search`, `documents.get` | Lisa (product assets), Jordan (reports), Nadia (deliverables) |

14 abstract actions across 5 categories. Each maps cleanly to equivalent tools across 2-3 vendors (Gmail/Outlook, Xero/QuickBooks/MYOB, Slack/Teams, Google Calendar/Outlook Calendar, Google Drive/Dropbox/SharePoint). Vendor-specific features (Xero's bank feed reconciliation, Slack's workflow triggers) remain accessible via direct service references after adoption.

### How Existing Primitives Already Support This (Mostly)

**Process templates (ADR-008)** already exist with governance declarations. They just need the `abstract_action` field.

**Quality profiles (ADR-019)** already compose via inheritance cascade (built-in → domain → personal). Process Models reference a quality profile, inheriting all its criteria, baselines, and risk thresholds.

**Integration registry (ADR-005)** already maps services to protocols and tools. It just needs a capability taxonomy so tools can be discovered by abstract action rather than service name.

**Process loader** already validates integration steps against the registry. It would additionally validate that all abstract actions in a Process Model have bindings before the process can be activated.

**`suggest_next` and industry patterns** (`industry-patterns.ts`) already know APQC-level process patterns for 5 industries. Process Models are the concrete, adoptable versions of what `suggest_next` currently only describes.

### What's Genuinely New

1. **Abstract action taxonomy** — a vocabulary of integration capabilities (`email.send`, `email.check_inbox`, `accounting.get_invoices`, `accounting.create_invoice`, `messaging.send`, `calendar.create_event`, etc.) that process models declare and users bind. This doesn't exist.

2. **Binding resolution** — the process loader or engine must resolve abstract actions to concrete integrations at activation time. A process model with unbound actions stays in `draft`.

3. **Process Model as a first-class concept** — the composition of template + quality profile + abstract integration requirements into a single, adoptable unit. Currently these three things are separate and not linked.

4. **Battle-testing by AI** — using the existing metacognitive check and spec-testing patterns to validate process models against quality profiles before shipping. AI executes the model against synthetic scenarios, quality profiles evaluate the outputs, corrections refine the model.

### Connection to Onboarding (Insight-047, Brief 044)

Process Models transform onboarding. Instead of the Self asking "describe your process," it can ask:

1. "What kind of work do you need help with?" → maps to Process Model category
2. "Which apps do you use?" → resolves bindings
3. "Here's how this process works — anything you'd adjust?" → presents the model for human editing

This is dramatically faster than blank-canvas process creation. The user's expertise is "does this match how I work?" — editorial, not authorial. This directly addresses Insight-047's gap: the journey from "no process" to "governed process" becomes adoption + binding, not invention.

### Connection to Standards Library (ADR-019, Insight-078)

Quality profiles are already designed as reusable, composable standards. Process Models make quality profiles *contextually discoverable* — when you adopt a quoting process model, you automatically get the `quote-proposal` quality profile. The user never has to think about quality standards separately. Standards are embedded in the model.

The learning loop still works: as the user's corrections accumulate, their personal quality standards diverge from the model's defaults. But they start informed, not blank.

### Connection to Community Intelligence

Process Models are the natural unit of community sharing. When 500 users adopt the "Invoice Follow-Up" model and each refines it through corrections:
- The model's quality baselines improve (ADR-019 trailing window, aggregated)
- Common app bindings surface ("78% of invoice follow-up users bind `accounting.get_invoices` to Xero")
- Structural patterns emerge ("users who add a 'check payment status' step have 15% higher collection rates")

This is the compound intelligence flywheel (Insight-078) with a concrete vehicle: Process Models improve because many people use them.

### Variant Handling

Some processes have genuine structural variants (e.g., approval chains differ by company size; invoice follow-up differs for B2B vs B2C). This should NOT become a template builder.

Two mechanisms handle variants:
1. **Process Model variants** — separate models for meaningfully different structures (`invoice-follow-up-b2b.yaml`, `invoice-follow-up-b2c.yaml`). Simple, discoverable, no conditional logic.
2. **Runtime adaptation (ADR-020)** — the Self adapts the adopted model per-run based on context. If a user's business has a wrinkle the model doesn't cover, the Self adds a step at runtime. Proven adaptations flow back to the canonical model via the improvement cycle (ADR-020 §6).

The principle: **variants are separate models; edge cases are runtime adaptations.** This avoids the template-builder trap (if-then-else branching in templates) while handling real-world diversity.

**Variant discovery UX (Phase 11 design question):** As the library grows, variant discovery becomes a UX problem. The Self (process-analyst role) is the natural discovery mechanism — it asks qualifying questions ("B2B or B2C invoicing?") and surfaces the right variant. This is the same pattern as onboarding (Brief 044) but applied to model adoption. Passive browsing (template library UI) should group variants under their parent category, not list them flat.

### What This Is NOT

- **Not an app store** — process models are not pre-built automations. They're structured domain expertise that still requires human oversight and trust earning.
- **Not a template marketplace** — no buying/selling. Models ship with Ditto and evolve through community use.
- **Not a low-code builder** — users don't wire boxes and arrows. They adopt opinionated models and bind their apps.
- **Not prescriptive** — models are starting points. Every user can override, extend, or simplify. The learning loop personalises.

## Implications

### Architecture Impact

| Layer | Impact |
|---|---|
| **L1 Process** | New concept: abstract actions on integration steps. Binding resolution at activation. Process Model as composed artifact (template + quality profile + abstract requirements). |
| **L2 Agent** | Process-analyst system agent (Phase 11) becomes Process Model adoption guide — its job shifts from blank-canvas articulation to model discovery + binding + customisation. |
| **L3 Harness** | No change — quality profiles and trust tiers already cascade from templates. |
| **L4 Awareness** | No change — process dependency graph works the same for adopted models. |
| **L5 Learning** | Community dimension: correction patterns across instances refine models. Abstract action popularity data informs integration priorities. |
| **L6 Human** | Adoption flow: browse models → bind apps → activate. Dramatically simpler than process creation from scratch. |

### Existing ADR Updates Needed

- **ADR-005** (Integration Architecture) — extend with abstract action taxonomy concept. Service tools annotated with capability categories.
- **ADR-008** (Process Templates) — extend template metadata with `quality_profile` reference and `abstract_actions` declaration. Process Models are the next evolution of templates.
- **ADR-019** (Standards Library) — note that Process Models are the natural carrier for quality profiles. Profiles become contextually discoverable through model adoption.

### Phasing

| Phase | What ships |
|---|---|
| **Phase 11 (Process Model Foundation)** | Abstract action taxonomy. Binding resolution in process loader. 5-10 Process Models for top persona processes. Adoption flow via Self (bind apps, activate). |
| **Phase 12 (Model Maturity)** | Battle-testing infrastructure. AI-validated models. Variant library. Community model sharing foundations. |
| **Phase 13 (Community Intelligence)** | Cross-instance model refinement. Binding popularity data. Structural pattern extraction from corrections. |

### Risk: Over-Abstraction

The abstract action layer must stay thin. If it becomes a universal service abstraction layer (like trying to make every email provider look identical), it collapses under the weight of vendor-specific features. The taxonomy should cover the 80% case (send email, get invoices, send message, check calendar) and let vendor-specific features be accessed directly via the existing service-specific integration tools.

**Design rule:** Abstract actions cover capabilities that are common across vendors for a given category. Vendor-specific capabilities use direct service bindings. A process model can mix both.

## Where It Should Land

- **architecture.md** — Process Model as a first-class concept in L1 Process Layer. Abstract actions as an integration abstraction.
- **ADR-005** — abstract action taxonomy extension
- **ADR-008** — Process Model as the evolution of process templates
- **ADR-019** — Process Models as the carrier for quality profiles
- **Roadmap** — Phase 11 scope expansion to include Process Model foundation
- **Personas** — Process Model adoption flow designed against Rob, Lisa, Jordan, Nadia journeys

## Reference docs checked

- architecture.md — consistent. L1 already describes "industry standard templates provide starting points." Process Models are the concrete realisation.
- ADR-005 — consistent. Integration registry supports the concept; needs abstract action taxonomy extension.
- ADR-008 — consistent. Templates + governance declarations are the foundation. Process Models extend, not replace.
- ADR-019 — consistent. Quality profiles compose naturally into Process Models.
- ADR-020 — consistent. Runtime adaptation handles edge cases within adopted models.
- Insight-047 — directly addressed. Process Models solve the "no process to governed process" journey.
- Insight-078 — directly connected. Process Models are the vehicle for community intelligence.
