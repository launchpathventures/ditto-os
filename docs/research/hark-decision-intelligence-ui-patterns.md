# Research Report: Hark — Decision Intelligence UI Patterns for Process Execution

**Date:** 2026-03-25
**Research question:** What UI composition patterns does Hark (gethark.ai) use for process execution, and what can Ditto learn from its approach to human-in-the-loop decision workflows?
**Source:** gethark.ai (product website + screenshots of production UI)

---

## What Hark Is

Hark is a **decision intelligence layer** that sits between AI models and real workflows. It is model-agnostic (runs on Claude, GPT, Gemini, Copilot) and adds policy enforcement, human oversight, accountability capture, and audit evidence generation to existing AI stacks.

**Key positioning:** "LLMs Reason. Hark Decides." — AI does the reasoning, Hark governs the decision.

**Target:** Regulated industries — financial services, insurance, healthcare. Currently deployed in production at a tier-one financial institution (live mortgage workflow).

**Background:** Built by a team with "a decade of delivering highly regulated, auditable, expert-reviewed systems" for Big Four banks, payment processors, and digital asset exchanges.

**What it is NOT:** Not an AI model. Not a replacement for ChatGPT/Claude. Not a general-purpose automation platform. It is specifically a governance/decision layer.

---

## Six UI Patterns Extracted from Screenshots

### Pattern 1: Process-as-Stepped-Navigation

**What it does:** A loan application process is rendered as a navigable sequence of named steps in a persistent left sidebar.

**Steps observed:** Product → Goal → Consent → Upload Documents → Loan Application Details → Applicant Details → Employment → Income → Expenses → Assets → Liabilities → Review → Outcome

**How it works:**
- Each step has a dedicated icon (document, user, dollar, house, checklist, etc.)
- The sidebar is persistent — user can navigate between completed and current steps
- Current step renders its dedicated UI composition in the main content area
- The step sequence is the process definition made visible

**What's notable:**
- This is an **opinionated, form-like process runner** — not chat-first, not freeform. The process defines the UI structure.
- Steps are domain-specific (not generic "Step 1, Step 2"). They use the language of the domain: "Upload Documents", "Applicant Details", "Employment".
- The sequence is a **wizard pattern** applied to process execution — familiar to users of regulated workflows.
- Two interface variants observed: a "Banker Interface" (role-specific, full sidebar with step names) and a compact icon-only sidebar. This suggests role-based UI composition.

**Ditto relevance:** Ditto's composable UI (Insight-086) composes from universal components. Hark shows a complementary pattern: the **process definition itself generates the navigation structure**. When a process has well-defined steps (like a loan application), the UI can render a stepped wizard rather than requiring the user to navigate via chat or a generic work feed. This is one valid composition the Self could produce — a "Process Runner" composition.

---

### Pattern 2: Document Integrity Checking as First-Class UI

**What it does:** When documents are uploaded, the system automatically analyses document metadata and flags integrity issues — not just content extraction, but authenticity verification.

**Issues detected in screenshots:**
- **"Excessive Incremental Saves"** — "Multiple incremental saves were found in the document structure, which may indicate repeated manual edits after the original file was generated."
- **"Device Source Discrepancy"** — "The document metadata indicates it was created or modified using suspicious software (iLovePDF / Adobe Illustrator 29.2 (Macintosh)). This may suggest reconstruction or unauthorized editing."
- **"Creation Timeline Anomaly"** — "The document modification date (2025-12-01 15:15:44) significantly differs from the creation date (2025-09-22 13:09:11), suggesting the file may have been altered after initial creation."

**How it works:**
- Each uploaded document shows a status badge: "Flagged" (orange) or uploading status
- Flagged documents expand to show specific integrity issues
- Each issue has a view action (eye icon) for drill-in
- The system analyses PDF metadata (creation tool, timestamps, save structure) automatically

**What's notable:**
- This goes beyond Insight-088's "document understanding" (which focuses on content extraction). Hark treats **document integrity/authenticity** as a distinct capability.
- The integrity analysis is pre-processing — it happens before the content is trusted, acting as a quality gate on inputs.
- Flags are specific and technical (metadata-level), not vague warnings. Each gives the human enough context to make a judgment call.
- This is a **harness pattern applied to inputs**, not just outputs. The process doesn't just check the AI's work — it checks the input artifacts before they enter the process.

**Ditto relevance:** Ditto's architecture validates AI outputs through harness patterns (maker-checker, adversarial review). Hark shows that the same rigor should apply to **process inputs**. When a document enters a Ditto process, the harness could run integrity checks (metadata analysis, format validation, authenticity signals) before the content is extracted and processed. This extends Insight-088 from "can parse documents" to "can validate documents."

---

### Pattern 3: Human Validation with Source Cross-Reference

**What it does:** A "Human Validation" modal presents extracted data fields alongside the source document, allowing the human to verify each field by seeing both the extraction and the original.

**How it works:**
- Left panel: checklist of fields to validate (Employer's Name, ABN, Job Title, Payment Date, Pay Frequency, Gross Pay, Net Pay, Base Wage, Property Address, Appraised Range)
- Each field shows a green checkmark when verified
- Currently-selected field highlights in the list
- Right panel (top): the source document with the relevant value highlighted/boxed — e.g., "142 Lee Rd. Austin, TX 78702" highlighted in the Rental Income document
- Right panel (bottom): the extracted value in an editable field, with source attribution ("Rental Agre..." indicating which document)
- Actions: "Edit Field" and "Mark as Verified"

**What's notable:**
- This is a **structured review pattern** — not "approve/reject the whole thing" but field-by-field validation with evidence.
- The cross-reference pattern (extracted value ↔ source document) builds trust through transparency. The human isn't asked to trust the extraction blindly — they can see exactly where each value came from.
- "Edit Field" acknowledges that extraction may be wrong and lets the human correct inline — this is the feedback-as-correction pattern.
- The checklist provides completion visibility — the human knows how much validation remains.

**Ditto relevance:** Maps to Ditto's Output Viewer primitive (Primitive 6) and the provenance principle (Insight-087: every piece of data carries its source chain, accessible via hover/click). Ditto's Output Viewer already specifies field-level interaction (clickable flagged cells, inline editing with diff capture). The novel element from Hark is the **dedicated validation mode with source cross-reference** — a split view that pairs extracted values with the originating document region, purpose-built for verification workflows. For processes where accuracy matters (regulated, financial, legal), this structured cross-reference validation may be a valuable composition the Self can produce alongside the general Output Viewer.

---

### Pattern 4: Activity Log as Standard Process Component

**What it does:** Every process instance has an Activity Log showing a chronological audit trail of all actions.

**Fields observed:** Date & Time, Item/Field (what changed), Performed By (who — human name or "System"), Details (expandable)

**Entries observed:**
- "Today 14:32 | Gross Pay | Michael D. | Details ⌄"
- "Today 13:41 | PAYG Income | System | Details ⌄"
- "Today 13:40 | Jan-Payslip.pdf | Michael D. | Details ⌄"
- "Yesterday 16:45 | Rental Income | Michael D. | Details ⌄"

**What's notable:**
- The log includes **both human and system actions** in the same timeline — no artificial separation.
- Application metadata is visible: Application ID (658), Status (In Progress).
- The log is field-level, not step-level. It tracks individual data changes, not just "step completed."
- A "Go to Application" button provides navigation from the log back to the live process.

**Ditto relevance:** Ditto's architecture already records all harness decisions and human feedback (stepRuns table, trustChanges table). Hark shows how to **surface this data as a user-facing component** — not hidden in system tables, but visible as a first-class view within the process. The Activity Log is a concrete component for the Ditto component catalog (Insight-086): a time-ordered feed of actions on a specific process instance, mixing human and system events, with expandable details.

---

### Pattern 5: Decision Rendering with Reasoning

**What it does:** The process outcome is displayed as a clear decision (Conditionally Approved / Declined / etc.) with the reasoning chain and supporting data visualizations.

**Elements observed:**
- Decision badge: "Conditionally Approved" (green checkmark)
- Reasoning: "Monthly payment ($X) represents 35% of applicant's serviceable income ($Y). All criteria met."
- Loan Overview: donut chart (Down Payment 17.3%, Principal 69.3%, etc.)
- Financial details table: Property Value, Down Payment, Loan Amount, Taxes & Fees, Total Interest Paid, Total Amount to Repay, Loan to Value Ratio
- Actions: Download, Print

**What's notable:**
- The decision is not just "approved" — it shows **why** (the specific criteria that were evaluated and met).
- Financial data is visualized (donut chart) for quick comprehension, with detailed table for drill-in.
- The outcome is exportable (download/print) — designed for regulated environments where decisions must be documented externally.
- The decision rendering is domain-specific — this is a loan-specific composition, not a generic "result" view.

**Ditto relevance:** Maps to Ditto's Output Viewer with the "Decision" output type (reasoning trace: input → reasoning steps → conclusion). Hark shows a production implementation: the decision itself is prominent, the reasoning is one level down, and the supporting data is visualized appropriately for the domain. The export capability (download/print) is a practical requirement for regulated processes that Ditto should account for.

---

### Pattern 6: Policy and Rules as a Governance Layer

**What it does:** Hark's four pillars describe a governance layer between AI reasoning and action:
1. **Apply Policy and Rules** — organizational policies, regulatory requirements, business rules enforced before decisions advance
2. **Keep Experts in Control** — route to domain experts at critical points
3. **Capture Accountability** — who approved, when, and why
4. **Generate Audit Evidence** — human-readable explanations for regulators

**What's notable:**
- This is essentially a **harness** — it sits between agent output and real-world action, governing the transition.
- The language is regulatory/compliance-first, not AI-first. The product is framed around decisions, not agents.
- "Audit evidence" is a first-class output, not a byproduct. The system is designed to produce artifacts for external review.
- The governance layer is model-agnostic — it wraps ANY LLM, treating the AI as a reasoning component and the governance as a separate concern.

**Ditto relevance:** Hark's governance pillars map almost exactly to Ditto's harness layer (Layer 3): policy → quality criteria / harness rules, expert routing → trust-tier-based review, accountability → feedback recording / audit trail, audit evidence → provenance chains. The difference: Hark applies this to a single use case (decision governance in regulated workflows). Ditto generalizes this as a universal harness pattern for any process.

---

## Conceptual Comparison: Hark vs Ditto Architecture

| Concept | Hark | Ditto |
|---------|------|-------|
| **Core framing** | Decision intelligence — governance layer for AI decisions | Process harness — orchestrating human-agent collaboration |
| **Process model** | Stepped wizard with domain-specific stages | Universal process primitive with arbitrary step sequences |
| **Human oversight** | Field-level validation with source cross-reference | Review queue with multiple patterns (maker-checker, adversarial, spec-test) |
| **Trust model** | Appears fixed: system processes, human validates at defined points (inferred from screenshots — no trust progression visible) | Four earnable tiers: supervised, spot-checked, autonomous + separate critical tier (always-review, never auto-upgrades) |
| **Audit** | Activity log per application + audit evidence generation | Comprehensive: stepRuns, trustChanges, feedback diffs, provenance chains |
| **Document handling** | Upload + integrity analysis + field extraction + validation | Insight-088 identifies as capability gap — not yet built |
| **UI composition** | Process definition generates stepped navigation (wizard) | Self composes from universal component catalog (dynamic) |
| **Model relationship** | Model-agnostic governance wrapper | Model-agnostic process orchestration |
| **Scope** | Regulated decision workflows (financial, insurance, healthcare) | Universal process harness for any domain |
| **Deployment** | Production in tier-one financial institutions | In development (Phase 10 — web dashboard) |

---

## Gaps and Novel Elements

### Elements Hark has that Ditto should consider:

1. **Input integrity checking** — Validating document authenticity/integrity before processing content. Extends Insight-088 from "parse documents" to "validate documents." Original pattern not seen in other landscape entries.

2. **Process-as-wizard composition** — When a process has well-defined sequential steps, compose the UI as a stepped wizard with persistent navigation. A specific composition pattern for the Self's catalog (Insight-086).

3. **Field-level human validation with source cross-reference** — Structured review that shows extracted value alongside source document. More granular than Ditto's current approve/reject review patterns.

4. **Audit evidence as first-class output** — The process doesn't just record what happened internally — it produces exportable, human-readable evidence packages for external review (regulators, auditors, compliance).

5. **Domain-specific step naming** — Steps are named in the user's domain language ("Applicant Details", "Employment", "Liabilities"), not system language. Confirms Insight-073 (user language, not system language).

### Elements where Ditto is architecturally ahead:

1. **Progressive trust** — Hark has fixed review points. Ditto's trust tiers allow oversight to reduce as confidence grows.
2. **Universal process model** — Hark is purpose-built for regulated decisions. Ditto's process primitive handles any workflow type.
3. **Learning from corrections** — Ditto's feedback-to-learning bridge (teach-this, correction velocity) is absent from Hark's visible surface.
4. **Composable UI** — Ditto's Self composes dynamically. Hark appears to use pre-designed process-specific UIs.
5. **Proactive attention** — Ditto's quiet shift report, attention management, and management-by-exception patterns go beyond Hark's static activity log.

### Elements where neither has a clear solution:

1. **Cross-process decision intelligence** — When decisions in one process affect another (e.g., a document flagged in one application affects risk scoring across all applications from the same source).

---

## Source-Level Provenance

All observations are from:
- **gethark.ai** — product website, fetched 2026-03-25
- **Screenshots provided by user** — production UI showing: Banker Interface (loan application outcome), Upload Documents (integrity checking), Activity Log (audit trail), Human Validation (field-level cross-reference)
- No source code available — Hark is a closed-source commercial product

---

## Reference Doc Status

- **`docs/landscape.md`:** Hark added under new section "Decision Intelligence / Governance Layers" as a commercial reference product.
- **Insights checked:** 086 (composable UI), 087 (provenance), 088 (document understanding), 089 (artifact-first processes) — all confirmed and extended by Hark's patterns.
- **No existing research superseded** — this is a new product evaluation.
