# Architecture Validation: Real-World Use Cases

**Date:** 2026-03-24
**Role:** Dev Architect
**Status:** Complete — validation report
**Consumers:** Dev Architect (brief design), Dev PM (prioritisation), Human (approval)

---

## Purpose

Stress-test Ditto's architecture (6 layers) and UX design (conversation-first, progressive reveal) against 6 real businesses with 30+ concrete processes spanning real estate content, quantity surveying, insurance underwriting, immigration case management, timber manufacturing, and clinical practice.

**Scope:** This validates architectural *concepts* — can the abstractions express these processes? It does not assess implementation readiness at the current Phase 10 MVP state.

---

## Businesses Tested

| # | Business | Domain | Processes tested | Key stress factors |
|---|----------|--------|------------------|--------------------|
| 1 | Steven Leckie (Prime Capital Dubai) | Real estate / content | 6 | Multi-artifact output, brand voice, external platform publishing, performance feedback loops |
| 2 | Rawlinsons | Quantity surveying | 5 | Domain expertise capture, rate databases, professional judgment, document processing |
| 3 | Delta Insurance | Insurance underwriting | 6 | Compliance/audit, inconsistent inputs, regulatory reporting, never-autonomous processes |
| 4 | FICO Capital Solutions | Immigration services | 5 | Deadline-driven case management, document validation, concurrent cases, regulatory change |
| 5 | Abodo Wood | Timber manufacturing | 5 | ERP integration, plan quantity takeoff, order-production handoff, stock management |
| 6 | Jay / Status | Clinical practice | 6 | Voice-first input, methodology capture, patient data sensitivity, cross-cohort analytics |

---

## Layer-by-Layer Validation

### Layer 1: Process Layer — VALIDATED WITH CAVEATS

Every one of the 33 processes maps to the process definition structure. **Caveat:** Input handling for document-triggered (G1) and voice-triggered (G2) processes depends on extensions not yet designed. The definition structure itself is sound, but `input_types` declarations are needed (Insight-089).

| Process pattern | Examples | L1 construct |
|----------------|----------|--------------|
| Input → multi-step → output with review | Steven's content pack, Rawlinsons' cost estimate, Delta's quote preparation | Standard process: steps + quality_criteria + trust |
| Periodic batch | Steven's weekly social, Delta's bordereaux, Rawlinsons' quarterly rate review | `source:` with schedule trigger (Brief 036) |
| Document-triggered | Steven's PDF brochure drop, FICO's document receipt, Delta's broker submission | `source:` with event trigger |
| Multi-output | Steven's content pack (4+ artifacts), Abodo's spec support package | ADR-009 `outputs:` with multiple named outputs |
| Conditional routing | Delta's submission triage (decline/flag/quote), FICO's category routing | `route_to` conditions (Brief 016b) |
| Never-autonomous | Delta's regulatory compliance check, FICO's application submission | `trust: critical` tier — never auto-upgrades |
| Human steps | Rawlinsons' senior QS rate approval, FICO's case manager review, Jay's clinical review | `executor: human` with input_fields |

**Key validation:** The process-as-primitive abstraction works across all six domains without modification. No domain required a process structure the architecture can't express.

### Layer 2: Agent Layer — VALIDATED WITH GAPS

**What works:**

| Capability | Validated by |
|-----------|-------------|
| AI agent for judgment/generation | All 33 processes — content generation, cost estimation, risk assessment, session notes |
| Script executor for deterministic work | Bordereaux formatting, document checklist generation, stock calculations |
| Human executor | QS rate approval, clinical review, underwriter judgment, case manager review |
| Integration executor | ERP data pull, Meta ad submission, Lloyd's reporting, email sending |
| Model routing hints | Routine listing descriptions (fast), complex underwriting assessment (capable) |
| Adapter pattern (LLM-agnostic) | Jay might prefer local models for patient data; Steven doesn't care |

**Gaps identified:**

| Gap | Severity | Use cases affected | Notes |
|-----|----------|-------------------|-------|
| **G1: Document understanding** | HIGH | Steven (PDF brochure parsing), Rawlinsons (plan quantity takeoff), Delta (broker submission extraction), FICO (document validation), Abodo (plan measurement) | The agent tools (`read_file`, `search_files`) work for code. These users need document processing: PDF parsing, image analysis of architectural plans, table extraction. This is an integration/tool concern — agents need `parse_document` and `analyze_image` tools. |
| **G2: Voice-to-text processing** | MEDIUM | Jay (voice notes → session notes), Rob (voice capture between jobs), Steven (could use for content capture) | UX spec mentions voice as first-class (mic icon). Architecture needs speech-to-text as a preprocessing step — either a system-level capability or an integration service. |
| **G3: File generation** | MEDIUM | Delta (bordereaux XLSX to Lloyd's spec), Rawlinsons (formatted cost reports), FICO (application packages), Steven (Instagram carousel images) | ADR-009 has `document` output type but the rendering pipeline for producing formatted files (PDF, XLSX, specific formats) isn't designed. |

### Layer 3: Harness Layer — STRONGLY VALIDATED

This is where Ditto's architecture shines against these use cases:

| Trust pattern | Use case | How it works |
|--------------|----------|-------------|
| **Supervised → spot-checked** | Steven's content pack, Rawlinsons' cost estimates | Review first 10, then routine ones get lighter review |
| **Supervised → autonomous (with conditions)** | Steven's agent listing review, Delta's bordereaux | Agents whose work consistently passes → auto-approve. Bordereaux earns autonomy because it's mechanical |
| **Critical (never autonomous)** | Delta's regulatory compliance, FICO's application submission | Compliance never auto-upgrades — architecture handles this natively |
| **Confidence override** | Rawlinsons' estimates with flagged assumptions | Cost estimate with low confidence on some rates → pauses regardless of trust tier |
| **Metacognitive self-check** | Delta's quote preparation, Rawlinsons' variation assessment | Self-review catches: unsupported rate assumptions, missing scope items, regulatory gaps |
| **Quality profiles (ADR-019)** | Steven's Dubai advertising rules, Delta's Lloyd's format requirements | Standards library provides domain-specific quality criteria |
| **Maker-checker** | Delta's claims assessment (agent drafts, handler reviews) | Standard review pattern |
| **Trust auto-downgrade** | Any domain — quality drifts | Error rate spike → supervised. Works for all 6 businesses |

**Key validation:** The trust tier + confidence + metacognitive check + quality profile stack handles every oversight pattern these businesses need. Delta's "never fully autonomous" is exactly the `critical` tier. Steven's "review first 10, then lighter" is exactly supervised → spot-checked progression. The four-tier model is sufficient.

### Layer 4: Awareness Layer — VALIDATED WITH GAPS

**What works:**

| Capability | Validated by |
|-----------|-------------|
| Process dependency graph | Steven: listing → content pack → social posts. Abodo: enquiry → quote → order → production |
| Cross-process intelligence | Rawlinsons: benchmark data from completed projects informs new estimates |
| Output as typed contract | Delta: submission triage output feeds quote preparation input |
| Work item lifecycle tracking | FICO: case status across all stages |

**Gaps identified:**

| Gap | Severity | Use cases affected | Notes |
|-----|----------|-------------------|-------|
| **G4: Deadline/SLA as first-class concept** | MEDIUM | FICO (visa deadlines, document expiry dates), Delta (90-day renewal trigger, bordereaux monthly deadline), Abodo (delivery timeline commitments) | The attention model has "upcoming" dimension and process I/O has schedule triggers, but process definitions don't declare explicit deadlines, SLAs, or escalation timelines. Currently handled as quality criteria strings, not structured data. |
| **G5: Entity-scoped process instances** | MEDIUM | FICO (dozens of concurrent visa cases), Tim (multiple clients), Steven (per-listing content) | The same process type runs for N entities simultaneously. Each needs its own context, status, timeline. Work items with goal ancestry handle the hierarchy (client → visa application → document collection), but the Self needs to manage attention across many concurrent instances of the same process. |

### Layer 5: Learning Layer — STRONGLY VALIDATED

Every business validates the implicit feedback pattern that is core to Ditto:

| Business | Correction → learning pattern | L5 mechanism |
|----------|------------------------------|--------------|
| Steven | Tone edits on listings → learns his voice. Ad click-rate feedback → biases toward performing structures | Correction patterns → process memory. Outcome impact signal (KPI feedback) |
| Rawlinsons | QS rate adjustments → learns market feel. "That comparison is misleading" → learns weighting factors | Human corrections extracted as diffs → agent memory. Negative feedback on comparisons → process memory |
| Delta | Underwriter accept/reject on borderline cases → trains appetite model | Decision patterns → process memory (classification learning) |
| FICO | Case manager adjusts communication cadence → learns per-client preferences | Per-entity corrections → entity-scoped process memory |
| Abodo | Sales rep product recommendations → learns application rules | Selection corrections → process memory |
| Jay | Clinical corrections → learns documentation style. Framework label corrections → methodology refinement | Professional judgment capture → agent memory + self-scoped knowledge |

**Gap identified:**

| Gap | Severity | Use cases affected | Notes |
|-----|----------|-------------------|-------|
| **G6: Outcome feedback from external systems** | MEDIUM | Steven (Meta ad click rates), Delta (claim outcomes), Jay (patient outcomes over time) | L5 tracks corrections and quality metrics. But some learning requires pulling outcome data from external systems weeks or months later and correlating with specific outputs. Integration I/O (Brief 036) can poll, but the "correlate output X with later outcome Y" pattern isn't explicit. |
| **G7: Cross-instance pattern recognition (institutional learning)** | MEDIUM | Jay (phenotype → intervention → outcome patterns across patients), Rawlinsons (rate patterns across project types), Delta (risk patterns across submissions) | The improvement-scanner analyzes single processes. Cross-instance analytics (across many runs, looking for domain patterns) is the mechanism that makes learning *compound* rather than linear. For Jay, this IS the methodology refinement. For Delta, it captures institutional underwriting judgment. For Rawlinsons, it builds market intuition. This differentiates "AI tool" from "institutional intelligence." |

### Layer 6: Human Layer / UX — STRONGLY VALIDATED

**Caveat:** The "drop a PDF" and "record a voice note" scenarios in the table below depend on G1 (document understanding) and G2 (voice preprocessing) being resolved. The UX patterns themselves are validated; the engine support is gapped.

**Conversation-first works for every persona:**

| Persona analogue | Why conversation-first works | What they'd say |
|-----------------|------------------------------|-----------------|
| Steven (high-energy, mobile, content-focused) | Drops a PDF, gets back a content pack. Reviews in conversation. Edits tone there. | "Send me the listing write-up for Palm Jumeirah" |
| Rawlinsons QS (desk-based, detail-oriented, document-heavy) | Uploads plans. Gets estimate with flagged assumptions. Adjusts rates inline. | "The Corten cladding rate is too low — use $285/m²" |
| Delta underwriter (structured, compliance-aware, batch-oriented) | Morning briefing: "3 new submissions, 1 renewal due, bordereaux ran clean." Triage in conversation. | "Decline the first one — outside appetite. Quote the other two, standard terms." |
| FICO case manager (deadline-driven, multi-case, communication-heavy) | "What's outstanding on the Al-Rashid case?" Self gives status, outstanding docs, next deadline. | "Chase the bank statement again — it's been a week" |
| Abodo sales (enquiry-driven, needs system data, customer-facing) | "New enquiry from Smith Architecture — office cladding, 400m²." Self qualifies and drafts quote. | "Check if we have enough Vulcan in stock for that" |
| Jay (clinical, voice-first, methodology-building) | Records voice note after session. Gets structured notes back. Corrects framework labels. | "That was ACT-based, not CDT — and add a note about sleep quality" |

**The workspace (structured view) is correctly positioned as earned:**

- Steven with 6 processes running → workspace view makes sense for batch content review
- Delta with a submission queue → workspace feed is natural for the underwriter's daily desk
- FICO with dozens of concurrent cases → workspace is essential for case management overview
- Jay with 1-2 patients per day → stays in conversation mode, never needs the workspace

**Key UX validation:** The two-surface model (Self for low-volume / direct interaction, workspace for high-volume / overview) correctly maps to all 6 businesses. Nobody needs a dashboard from day one. Everyone starts with a conversation.

---

## Summary: Universal Patterns Confirmed

All 33 processes follow the same 5 patterns already identified in `docs/prototypes/PLAN.md`:

1. **Something comes in** (PDF, email, plans, voice note, enquiry, broker submission) → Self recognises → right process unfolds
2. **Structured output for review** (content pack, cost estimate, triage result, session notes, quote, application package)
3. **Corrections = learning** (tone edits, rate adjustments, pricing modifications, clinical corrections, appetite training)
4. **Trust earns over time** (routine listings auto-approve, bordereaux runs autonomously, simple renewals process automatically)
5. **Knowledge accumulates** (brand voice sharpens, rate judgment deepens, methodology codifies, client preferences learned, appetite model trains)

**The architecture handles all 5 patterns natively.** The gaps are in the input/output edges, not the core architecture.

---

## Gap Summary and Prioritisation

| # | Gap | Layers | Severity | When needed | Recommendation |
|---|-----|--------|----------|-------------|----------------|
| G1 | Document understanding (PDF, plans, images) | L2 | HIGH | Phase 10+ (first real user) | Add `parse_document` / `analyze_image` as agent tools. Integration with document AI services (Google Document AI, Claude vision, etc.) via the integration registry. Not a new executor type — an agent tool. |
| G2 | Voice-to-text preprocessing | L2 | MEDIUM | Phase 10+ (Rob, Jay) | Speech-to-text as a system-level preprocessing step before work item creation. Integration service (Whisper, Deepgram, etc.) registered in integration registry. Self routes voice input through transcription before processing. |
| G3 | File/document generation | L1, L2 | MEDIUM | Phase 10+ (Delta, Rawlinsons, FICO) | Design a rendering/templating pipeline for `document` output type. Process steps can produce formatted files (PDF, XLSX) via template + data. Could be a `render` executor type or an integration tool. |
| G4 | Deadline/SLA as first-class concept | L1, L4 | MEDIUM | Phase 10+ (FICO, Delta) | Add optional `deadline`, `sla`, and `escalation` fields to process definitions. The attention model's "upcoming" dimension consumes these. Escalation rules: "if deadline is <24h and step is pending review, alert the user." |
| G5 | Entity-scoped process instances | L2, L4 | MEDIUM | Phase 12+ (FICO, Tim) | Work items with goal ancestry already create hierarchies. Extend with an entity concept: a named context (client, listing, patient) that scopes memory, deadlines, and status within a process type. The Self groups attention by entity. |
| G6 | Outcome feedback from external systems | L5 | MEDIUM | Phase 12+ (Steven, Delta, Jay) | Extend the feedback loop to support delayed outcome correlation. A process output gets a correlation ID. When outcome data arrives (via polling or webhook), the learning layer matches and updates quality signals. |
| G7 | Cross-instance pattern recognition (institutional learning) | L5 | MEDIUM | Phase 12+ (Jay, Rawlinsons, Delta) | Extend the improvement-scanner to analyze patterns across runs: "patients with phenotype X respond better to ACT." This differentiates "AI tool" from "institutional intelligence" — the mechanism by which Ditto's learning compounds rather than stays linear. |
| G8 | Data sensitivity classification | L1, L2, L3 | MEDIUM | Phase 10+ (Jay, FICO, Delta) | No data classification model exists. Jay handles patient clinical data, FICO handles identity documents, Delta handles commercially sensitive underwriting data. Process definitions should declare `data_sensitivity: public | internal | confidential | regulated`. Model routing should enforce constraints: regulated data cannot flow to external LLM APIs without appropriate data processing agreements. Brokered credentials protect API keys from agents, but nothing protects sensitive content from being sent to cloud providers. |
| G9 | Conversational integration auth | L2, L6 | HIGH | Phase 10 (all 6 businesses) | Credential vault exists (Brief 035) but is CLI-only. No design for how non-technical users connect external services during conversational process creation. Every real process needs this: Rob→Gmail/Xero, Steven→Meta/Mailchimp, Delta→Lloyd's, FICO→email, Abodo→Epicor, Jay→clinical systems. Auth must be just-in-time (woven into conversation), plain language, scope-explicit, testable, and resumable. See Insight-090. |

---

## Architectural Integrity Assessment

### What doesn't need to change

| Architecture element | Status |
|---------------------|--------|
| Process-as-primitive | Rock solid. All 33 processes express naturally. |
| Six-layer separation | Clean. Each gap maps to a specific layer. No cross-cutting architectural failures. |
| Trust tiers (4 tiers) | Complete. supervised/spot-checked/autonomous/critical cover all oversight patterns. |
| Confidence override | Essential. Every domain has uncertain outputs that need human review regardless of tier. |
| Conversation-first UX | Validated. Every persona naturally starts with conversation. |
| Progressive reveal (Self → workspace) | Validated. Volume determines when workspace appears — matches all 6 businesses. |
| Integration registry pattern | Extensible. ERP, CRM, regulatory systems, social platforms all map to the registry. |
| Quality profiles (ADR-019) | Directly applicable. Brand standards, regulatory rules, quality baselines all compose. |
| Feedback-to-memory bridge | Core to every business. Implicit learning from corrections is universal. |

### What needs architectural extension (not change)

| Extension | How it relates to existing architecture |
|-----------|----------------------------------------|
| Document AI tools | New tool type in existing agent tool infrastructure (L2) |
| Voice preprocessing | New integration service in existing registry (L2) |
| File generation pipeline | Extension of ADR-009 document output type (L1, L2) |
| Deadlines/SLAs | Extension of process definition schema (L1) |
| Entity-scoped instances | Extension of work item + memory model (L2, L4) |
| Outcome correlation | Extension of L5 feedback loop |
| Data sensitivity classification | Extension of process definition schema + model routing constraints (L1, L2, L3) |
| Cross-instance learning | Extension of improvement-scanner (L5) |
| Conversational integration auth | Extension of credential vault (Brief 035) + new Self capability (L2, L6) |
| Cross-instance analytics | Extension of improvement-scanner (L5) |

**Key finding:** Every gap is an *extension* of existing architectural concepts, not a structural deficiency. The six-layer model, the process primitive, the trust model, the memory architecture, and the integration pattern all hold. No new layers needed. No fundamental rethinking required. The most significant missing concept is data sensitivity classification (G8) — a cross-cutting concern the architecture doesn't address and that is a regulatory prerequisite for clinical, immigration, and insurance use cases.

---

## Insights Captured

- **Insight-088:** Document understanding is a first-class capability gap — not a nice-to-have
- **Insight-089:** Every real process starts with an artifact (file, email, voice note, data), not a text prompt — the input edge is load-bearing. Converges with Insight-080 from UX design; adds engine implications (intake classifier, input_types declaration, email integration priority)
- **Insight-090:** Integration auth is a conversation moment, not a setup step — the credential vault exists but has no UX for non-technical users. Every real process needs external system access, and auth must happen just-in-time within conversation.

---

## Conclusion

**The architecture validates strongly against all 6 businesses and 33 processes.** The core abstractions — process as primitive, trust tiers, implicit feedback, conversation-first UX, progressive reveal — are universal across real estate content, quantity surveying, insurance underwriting, immigration case management, timber manufacturing, and clinical practice.

The gaps are at the edges (input processing, output formatting, deadline management) and in scale patterns (entity-scoped instances, cross-instance analytics). All gaps are extensions of existing architectural concepts — none require structural change.

The prototype plan's observation that "the universal primitives compose into all of these — no bespoke components needed per industry" is confirmed by this analysis.
