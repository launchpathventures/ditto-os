# Research: Process Discovery from Organizational Data

**Date:** 2026-03-19
**Research question:** How might Agent OS discover, analyze, and operationalize processes from an organisation's existing data (emails, documents, Slack messages, calendars, process documents, software, financial data) — rather than requiring users to manually describe processes?
**Triggered by:** User observation that every organisation already has artifacts that reveal its real processes
**Status:** Complete — awaiting Architect

---

## Context

Agent OS currently assumes processes are defined through conversational setup (Explore mode → Process Builder). The user describes their pain, the system asks questions, and a process definition emerges. This works but places the burden of articulation on the human.

The research question inverts this: what if the system could examine an organisation's existing digital footprint — emails, documents, Slack messages, calendars, financial records, CRM data, project tools — and surface the processes that already exist? The human's role shifts from "describe your process" to "confirm, correct, and refine what we found."

This is a well-established field called **process mining / process discovery / process intelligence**, with both mature enterprise tools and emerging AI-native approaches.

---

## The Three Layers of Process Discovery

Research reveals three distinct approaches, each operating on different data and producing different outputs:

### Layer 1: System-Level Process Mining (Event Logs)

**What it does:** Reconstructs process flows from structured event logs in enterprise systems (ERP, CRM, accounting software, ticketing systems).

**How it works:** Every system action generates a timestamped event (e.g., "invoice created," "payment approved," "ticket closed"). Process mining algorithms (Alpha Miner, Heuristics Miner, Inductive Miner) reconstruct the actual process flow from these events — revealing the *real* process vs. the *documented* process.

**Key players:**
| Tool | Approach | Data sources | Strengths | Limitations |
|------|----------|-------------|-----------|-------------|
| **Celonis** | Event log mining from SAP, Oracle, Salesforce | ERP/CRM system logs | Deep system integration, mature analytics, ~60% market share | Enterprise-only ($250k+), 6-9 month implementation, misses human context |
| **SAP Signavio** | Process mining + BPM integrated into SAP BTP | SAP ecosystem logs | Native SAP integration, conformance checking | SAP-centric, requires structured logs |
| **Microsoft Power Automate Process Mining** | Acquired Minit; integrated into Power Platform | System event logs | Microsoft ecosystem integration, accessible pricing | Limited to Microsoft-connected systems |
| **ProcessMind** | AI-powered process mining | System logs + user activity | Fast setup, AI-driven analysis | Newer entrant, less enterprise depth |

**Relevance to Agent OS:** LOW for our personas. Rob, Lisa, Nadia, and Jordan don't have SAP or Oracle. Their "systems" are Gmail, Xero, Shopify, Slack, and spreadsheets. System-level process mining requires structured event logs that SMBs typically don't produce at the resolution needed.

### Layer 2: Task Mining (Desktop Activity Capture)

**What it does:** Records what humans actually do on their computers — clicks, keystrokes, app switching, copy-paste patterns — and infers processes from observed behaviour.

**How it works:** A desktop agent (or browser extension) passively records user interactions, then AI analyzes the recordings to identify repeated patterns, variations, and exceptions. Produces process maps showing how work actually flows across applications.

**Key players:**
| Tool | Approach | Data capture method | Strengths | Limitations |
|------|----------|-------------------|-----------|-------------|
| **Mimica** | AI records user actions → infers workflow diagrams → creates automation blueprints | Desktop agent capturing clicks/keystrokes, PII auto-anonymised | 2-week discovery cycle, exports to RPA platforms, $26.2M Series B (2025) | Requires desktop agent installation, captures *how* not *why* |
| **Skan.ai** | Computer vision observes desktop activity → creates "Digital Twin of Operations" | Computer vision on user desktops | Works with any application including legacy/mainframes, no API needed | Work graphs require interpretation, manual translation to automation |
| **KYP.ai** | Real-time activity capture → AI-powered insights → process intelligence | Desktop/browser monitoring | Fast insights (days vs months), Everest Group Leader in Task Mining 2025 | Activity monitoring raises privacy concerns |

**Relevance to Agent OS:** MEDIUM. Task mining captures the *how* — what applications people use, in what order, for how long. This is valuable for understanding where time goes. But it's surveillance-adjacent (desktop agents recording user activity), which conflicts with our personas' expectations. Rob isn't going to install a desktop agent on his laptop. Jordan might for an enterprise initiative, but it's a hard sell for SMBs.

### Layer 3: Narrative + Data Discovery (AI-Guided Elicitation)

**What it does:** Combines AI analysis of existing documents/communications with structured interviews to discover processes. Uses unstructured data (emails, documents, Slack messages) as evidence, supplemented by guided conversation.

**Key players:**
| Tool | Approach | Data sources | Strengths | Limitations |
|------|----------|-------------|-----------|-------------|
| **ClearWork** | AI-guided digital interviews + browser add-on activity capture + document analysis | Voice/text interviews, browser activity, existing documentation | No desktop agent needed, combines narrative with data, produces build-ready blueprints | Requires interview participation, newer platform |
| **Glean** | Enterprise knowledge graph across all apps → AI search + agents | Email, Slack, documents, calendar, CRM, project tools — 100+ connectors | Unified search across all organizational data, enterprise-grade | Not purpose-built for process discovery (search-first), enterprise pricing |
| **PKAI** (academic) | Multi-agent LLM system for process knowledge acquisition | Documents, interviews, domain knowledge | 19 design requirements for LLM-based process discovery, academically validated | Research prototype (Python), not production-ready |

**Relevance to Agent OS:** HIGH. This is the approach most aligned with our personas and architecture. It doesn't require desktop surveillance. It works with data that already exists (emails, documents, Slack, calendar). It uses conversation (which maps to Explore mode) supplemented by evidence from organizational data.

---

## The PKAI Academic Framework (Springer, 2025)

The most relevant academic work is "Large Language Models for Process Knowledge Acquisition" (Business & Information Systems Engineering, 2025). Key findings:

**Multi-agent architecture with three stages:**
1. **Preparation** — agents analyze existing documents, templates, and domain knowledge to understand the process landscape before any human interview
2. **Socialization** — agents conduct structured interviews with process stakeholders, asking targeted questions informed by the preparation stage
3. **Externalization** — agents formalize the discovered knowledge into process models (BPMN, structured definitions)

**19 design requirements** identified for LLM-based process discovery, covering prompt design, agent coordination, knowledge representation, and validation.

**Key finding:** LLM-based multi-agent systems can match junior process analysts in formalization quality within comparable timeframes, and add value for experienced analysts by handling the documentation burden.

**Limitation:** Unsuitable for strategic reasoning about modeling perspectives or granularity levels — these require human judgment.

**Implication for Agent OS:** The preparation → socialization → externalization pipeline maps directly to a potential Agent OS discovery flow: (1) connect data sources and analyze, (2) guided conversation with evidence, (3) produce process definitions.

---

## Industry Standard Frameworks as a Discovery Lens

The architecture spec already mentions APQC (12,000+ standard business processes). This becomes more powerful in the context of process discovery:

**APQC Process Classification Framework (PCF):**
- 12 enterprise-level categories, 1,000+ processes with definitions
- Cross-industry and industry-specific versions
- Machine-readable process element numbers (for database storage)
- Free PDF versions available; detailed versions require membership

**How it applies to discovery:** When analyzing an organisation's data, the system can use APQC/ITIL categories as a classification lens. Instead of "we found 47 email patterns," the system says: "Your emails suggest you have active processes in *Order Management* (APQC 8.0), *Invoice Processing* (APQC 8.3), and *Customer Service* (APQC 9.0). Let's start with the one that's costing you the most time."

This is the "industry standards as base knowledge" principle from the architecture spec, applied to discovery rather than just template provision.

---

## Five Discovery Approaches Mapped to Agent OS

### Approach 1: Communication Pattern Analysis

**Data sources:** Email (Gmail, Outlook), Slack/Teams messages, calendar
**What it reveals:** Recurring communication patterns that indicate processes — weekly reports, approval chains, follow-up sequences, scheduling patterns, recurring meetings tied to specific workflows.
**How it works:** LLM analyzes email/message threads to identify:
- Repeated sequences (request → draft → review → approve → send)
- Recurring temporal patterns (every Monday, end of month)
- Role-based handoffs (person A always sends to person B for approval)
- Exception patterns (when things go wrong, what happens?)

**Example for Rob:** Analyzing Rob's email reveals a pattern: customer enquiry → Rob responds with questions → customer replies → Rob drafts quote → sends to customer. The system identifies this as a quoting process with 3-5 day latency and surfaces it: "You have a quoting process that takes 3-5 days. Want to speed this up?"

**Factual pros:** Works with data that already exists. No new tools or agents to install. Reveals the *real* process.
**Factual cons:** Email/message analysis requires broad access permissions. Privacy concerns. Noisy data — not every email is a process. Requires significant LLM processing for pattern extraction.

### Approach 2: Document and File Analysis

**Data sources:** Google Drive, SharePoint, Dropbox, local files
**What it reveals:** Templates, repeated document types, naming conventions, folder structures that encode process knowledge.
**How it works:** LLM analyzes document collections to identify:
- Templates and their usage patterns (quote templates, report templates, proposal templates)
- Document evolution (v1 → v2 → final patterns indicating review cycles)
- Naming conventions that encode process stages (DRAFT_, APPROVED_, FINAL_)
- Folder structures that map to process categories

**Example for Lisa:** Her Google Drive has a folder called "Product Descriptions" with 200+ files following a pattern: product name → draft → final. Version history shows Lisa edits 60% of drafts. The system identifies the content creation process and the specific types of edits Lisa makes.

**Factual pros:** Documents are structured artifacts with rich metadata. Version history reveals review patterns. Templates encode process knowledge directly.
**Factual cons:** Requires file storage access. Not all processes produce documents. Folder structures may be inconsistent or absent in smaller organisations.

### Approach 3: Software Usage Analysis

**Data sources:** SaaS tool data via APIs (Xero, Shopify, CRM, project management tools)
**What it reveals:** Actual workflow execution — what gets created, modified, approved, and in what order.
**How it works:** APIs expose structured activity logs:
- Xero: invoice creation → approval → payment tracking
- Shopify: order received → fulfilled → shipped → delivered
- CRM: lead created → contacted → qualified → proposed → closed
- Project tools: task created → assigned → in progress → review → done

**Example for Jordan:** Connecting to the company's CRM reveals the sales pipeline has 7 stages but deals stall at stage 4 (proposal). Connecting to email shows the stall correlates with waiting for finance to approve discounts. The system discovers a hidden cross-departmental process.

**Factual pros:** Structured data with timestamps — closest to traditional process mining but for SaaS tools. Rich data via APIs. Clear process flows.
**Factual cons:** Requires OAuth connections to each tool. Different APIs expose different levels of detail. Fragmented across many tools.

### Approach 4: Calendar and Meeting Analysis

**Data sources:** Google Calendar, Outlook Calendar
**What it reveals:** Recurring meetings, review cadences, decision points, handoff patterns.
**How it works:** Calendar events encode governance and coordination:
- Weekly review meetings indicate oversight processes
- Recurring 1:1s indicate management/coaching processes
- Meeting titles and attendees reveal cross-functional workflows
- Meeting cadence changes indicate process evolution

**Example for Nadia:** Her calendar shows a weekly "team quality review" with all analysts, a monthly "client reporting" with department heads, and ad-hoc "escalation" meetings that cluster around month-end. The system maps her quality governance process from calendar patterns.

**Factual pros:** Low-noise data. Calendar events are inherently structured. Attendee lists reveal organisational structure.
**Factual cons:** Calendars don't capture what happens *between* meetings. Not all processes have calendar events. Small businesses may not use calendars systematically.

### Approach 5: Financial Data Analysis

**Data sources:** Accounting software (Xero, QuickBooks), bank feeds, payment processors
**What it reveals:** Financial workflows — invoicing, payment, reconciliation, expense management.
**How it works:** Financial records are inherently process artifacts:
- Invoice creation → send → payment received → reconciled
- Expense submitted → approved → reimbursed
- Purchase order → supplier invoice → payment → goods received
- Revenue patterns revealing seasonal business cycles

**Example for Rob:** Xero shows Rob creates invoices 2-5 days after job completion (delay pattern). 30% of invoices require a follow-up. Average payment time is 45 days. The system identifies the invoicing process and its pain points before Rob describes them.

**Factual pros:** Financial data is the most structured organisational data. Clear process flows with timestamps. Direct link to business outcomes (cash flow, profitability).
**Factual cons:** Financial data alone doesn't capture the full process (just the financial artifacts). Requires accounting system access with appropriate permissions.

---

## Practical Data Ingestion: The Readily Available Sources

Agent OS is not being built for enterprise. The question isn't "how do Celonis and SAP mine processes?" — it's **"what data can we practically suck in from the tools every organisation already uses, and what does it tell us?"**

Every organisation — a sole trader, a 10-person trades business, a 50-person ecommerce company — already has some combination of these readily available data sources:

### The Seven Universal Sources

| Source | What every org has | What it reveals about processes | API/Access method | Privacy model |
|--------|-------------------|-------------------------------|-------------------|---------------|
| **Email** (Gmail, Outlook) | Every business has email | Communication patterns: request → response chains, approval sequences, follow-up cadences, handoff patterns between people | Gmail API (OAuth), Microsoft Graph API | Read-only access to inbox/sent. User grants per-mailbox. Sensitive — must be explicit about what's read and why. |
| **Calendar** (Google, Outlook) | Most businesses use calendar | Governance cadences: recurring reviews, team meetings, client check-ins, deadline patterns. Attendee lists reveal org structure | Google Calendar API, Microsoft Graph | Low sensitivity. Event titles + times + attendees. No content access needed. |
| **Documents** (Drive, SharePoint, Dropbox) | Templates, SOPs, quotes, reports | Process templates (quote template = quoting process), review cycles (v1→v2→final), naming conventions encoding stages | Google Drive API, SharePoint API, Dropbox API | File metadata + content. User selects which folders/files to share. |
| **Knowledge base** (Notion, Confluence, wikis) | SOPs, runbooks, how-to guides | Explicitly documented processes — often stale but a starting point. Shows what the org *thinks* its processes are vs. what email/calendar show they *actually* are | Notion API, Confluence API | Page content. User selects which spaces to share. |
| **Messaging** (Slack, Teams) | Team communication channels | Real-time process execution: who asks whom, what gets escalated, where decisions happen, what gets stuck. Channel names often map to functional areas | Slack API (with bot token), Microsoft Graph | Channel messages. Org admin grants access. Most sensitive source — contains informal communication. |
| **Service desk** (Zendesk, Freshdesk, Linear, Jira) | Ticket/issue tracking | Request → triage → assignment → resolution → closure patterns. SLA compliance. Recurring issue categories revealing systemic problems | Zendesk API, Freshdesk API, Linear API, Jira API | Ticket data. Less sensitive than email — already structured for external access. |
| **Financial** (Xero, QuickBooks, Stripe) | Accounting and payments | Transactional workflows: invoice → payment → reconciliation. Purchase cycles. Revenue patterns. Cash flow timing | Xero API, QuickBooks API, Stripe API | Financial records. Requires accountant-level trust. Most structured source. |

### What Each Source Uniquely Contributes

No single source reveals the full picture. The power is in combination:

- **Email + Calendar** together reveal: "There's a weekly meeting about X, and the email chain shows what happens between meetings — preparation, follow-up, exceptions."
- **Email + Financial** together reveal: "Customer enquiry arrives by email → quote is drafted → invoice is created in Xero → payment is tracked." The full lifecycle from first contact to cash received.
- **Service desk + Messaging** together reveal: "Tickets come in via Zendesk → team discusses in #support Slack channel → escalation happens when someone @-mentions the team lead."
- **Knowledge base + Email** together reveal: "The SOP says the process works like X, but email patterns show it actually works like Y." The gap between documented and actual process.
- **Documents + Financial** together reveal: "Quote template is used → Xero invoice follows 2-5 days later. The template fields map to invoice line items."

### Ingestion Approach per Source

Each source has a different ingestion character:

| Source type | Ingestion mode | Volume | Signal-to-noise | Processing approach |
|------------|---------------|--------|-----------------|-------------------|
| **Email** | Batch pull (last 90 days) + ongoing sync | High | Low — lots of noise | LLM classification: process-related vs. not. Thread analysis for sequence detection. |
| **Calendar** | Batch pull + ongoing sync | Low | High — inherently structured | Direct pattern analysis: recurring events, attendee clustering, meeting cadence mapping. |
| **Documents** | Batch index + metadata scan | Medium | Medium | Template detection, version history analysis, naming convention extraction. LLM for content classification. |
| **Knowledge base** | Batch index of pages/articles | Low-Medium | High — already curated | LLM analysis of documented processes. Cross-reference with actual data from other sources. |
| **Messaging** | Channel history pull + ongoing sync | Very high | Low — very noisy | Channel-level classification first. Then thread analysis within process-relevant channels. LLM-intensive. |
| **Service desk** | Structured API pull | Medium | High — already structured | Direct workflow analysis: ticket state transitions, assignment patterns, resolution times. Minimal LLM needed. |
| **Financial** | Structured API pull | Low-Medium | Very high — all signal | Direct workflow analysis: transaction sequences, timing patterns, reconciliation flows. Minimal LLM needed. |

### The Ingestion Priority Stack

Not all sources are equal. For our personas, the practical starting order:

1. **Financial + Email** — highest signal, reveals the processes that cost the most (Rob's quoting, Lisa's ordering, Jordan's reconciliation)
2. **Calendar** — low effort to connect, reveals governance structure
3. **Service desk** — if they have one, it's already structured process data
4. **Documents** — reveals templates and SOPs
5. **Knowledge base** — reveals documented processes (to compare against reality)
6. **Messaging** — most valuable but most privacy-sensitive, highest noise

This is a suggested analysis order, not a user-facing priority. The user connects what they want; the system adapts to what's available.

---

## How Existing Players Position This

### The Enterprise Approach (Celonis, SAP Signavio)

**Model:** Connect to enterprise systems → extract event logs → mine processes → visualize → optimize.
**Assumption:** The organisation has large ERP/CRM systems with structured logs.
**Gap for Agent OS personas:** Our users don't have enterprise systems. They have Gmail, Xero, Shopify, Slack, and spreadsheets.

### The Surveillance Approach (Skan.ai, KYP.ai, Mimica)

**Model:** Install desktop agents → record user activity → AI infers processes from behaviour.
**Assumption:** The organisation will accept desktop monitoring of employee activity.
**Gap for Agent OS personas:** Privacy concerns, especially for SMBs. Rob isn't installing a desktop agent. The approach also captures *how* but not *why* — it sees clicks but not business intent.

### The Hybrid Approach (ClearWork)

**Model:** AI-guided interviews + browser extension activity capture + document analysis.
**Assumption:** Stakeholders will participate in structured interviews; some browser monitoring accepted.
**Gap for Agent OS personas:** Still requires formal "discovery project" mindset. Closer to consulting engagement than product experience.

### The Knowledge Graph Approach (Glean)

**Model:** Connect to all apps → build enterprise knowledge graph → search + AI agents across all data.
**Assumption:** Enterprise scale with 100+ app connections.
**Gap for Agent OS personas:** Not process-focused — it's a search/knowledge platform. Doesn't produce process definitions. Enterprise pricing.

### The Academic Approach (PKAI)

**Model:** Multi-agent LLM system: preparation (analyze docs) → socialization (interview) → externalization (formalize).
**Assumption:** Research context with willing participants.
**Gap for Agent OS personas:** Not production software. Python-based. But the three-stage pipeline is a valuable architectural pattern.

---

## Gap Analysis: What Doesn't Exist

No existing tool combines all of the following:

1. **SMB-friendly data sources** — Gmail, Xero, Shopify, Slack, Google Drive (not SAP/Oracle)
2. **Non-surveillance discovery** — works with data the organisation already has, no desktop agents
3. **Process-first output** — produces executable process definitions, not just process maps or insights
4. **Progressive trust from day one** — discovered processes start supervised, earn trust through track record
5. **Conversational refinement** — discovery is a dialogue, not a report
6. **Industry standard matching** — maps discovered patterns to APQC/ITIL categories for recognition and confidence
7. **Continuous discovery** — not a one-time audit but an ongoing capability that detects new or changed processes

The closest is **ClearWork's hybrid approach** (narrative + data), but it produces blueprints for RPA platforms, not executable process definitions with trust tiers.

---

## Architectural Mapping to Agent OS

### Where Process Discovery Fits in the Six Layers

Process discovery is a **Layer 6 (Human Layer) capability** that feeds **Layer 1 (Process Layer)**. It extends the current Explore mode from "user describes process" to "system discovers process, user confirms and refines."

### Proposed Discovery Flow (Three Phases)

**Phase A: Connect & Analyze (Preparation)**
```
Inputs:  Connected data sources (email, calendar, documents, SaaS tools, financial data)
Agent:   Discovery Analyst (new agent role)
Steps:   1. Ingest available data via integration registry
         2. Identify recurring patterns using LLM analysis
         3. Classify patterns against APQC/ITIL categories
         4. Score patterns by frequency, time cost, and automation potential
Output:  Process Candidates — a ranked list of discovered process patterns
```

**Phase B: Confirm & Refine (Socialization)**
```
Inputs:  Process Candidates + conversation with process owner
Agent:   Discovery Consultant (new agent role, or extension of Explore mode)
Steps:   1. Present discovered patterns: "We found 6 recurring processes..."
         2. User confirms/corrects/adds context
         3. For each confirmed process, guided deep-dive:
            - "Your quoting process takes 3-5 days. Is that right?"
            - "You always adjust the labour estimate. What's your rule?"
            - "These 3 people are always in the approval chain. Is that correct?"
         4. Compare user's version against industry standard
Output:  Confirmed process definitions with user refinements
```

**Phase C: Operationalize (Externalization)**
```
Inputs:  Confirmed process definitions
Agent:   Process Builder (existing capability)
Steps:   1. Generate executable process definition (YAML)
         2. Assign initial trust tier (always supervised for discovered processes)
         3. Configure integrations from discovery data sources
         4. First run appears in review queue
Output:  Live process, ready for trust earning
```

### New Capabilities Required

| Capability | Layer | Build from | Notes |
|-----------|-------|------------|-------|
| Data source connectors (Gmail, Calendar, Drive, Xero, Shopify, Slack) | L2 (via integration registry) | Phase 6 integration architecture (ADR-005) | Discovery reuses the same integration infrastructure |
| Communication pattern analyzer | L1/L6 | PKAI preparation stage + Original | LLM-based analysis of email/message patterns |
| Document pattern analyzer | L1/L6 | Original | Template detection, version history analysis |
| SaaS activity analyzer | L1/L6 | System-level process mining concepts, adapted for SaaS APIs | Structured event log analysis |
| APQC/ITIL classification engine | L1 | Architecture spec (industry standards as base knowledge) | Process candidate classification against known frameworks |
| Process candidate scoring | L1/L6 | ClearWork's automation scoring concept | Frequency × time cost × automation potential |
| Discovery conversation flow | L6 | PKAI socialization stage + Explore mode | Evidence-informed guided conversation |
| Process definition generator | L1 | Existing process builder | Generate YAML from confirmed patterns |
| Continuous monitoring for new patterns | L4/L5 | Original | Ongoing discovery, not one-time |

### Relationship to Existing Architecture

- **Integration registry (ADR-005):** Discovery reuses the same connectors. No separate integration infrastructure needed.
- **Explore mode:** Discovery extends Explore from "blank canvas conversation" to "evidence-informed conversation."
- **Industry standards (architecture spec):** APQC/ITIL classification is already described as "base knowledge" — discovery makes this actionable.
- **Self-improvement meta-process:** Continuous discovery is a natural extension of the self-improvement scan — not just "are existing processes degrading?" but also "are there processes we haven't captured yet?"
- **Trust tiers:** All discovered processes start supervised. Trust is earned, not assumed.

---

## Data Source Accessibility for Our Personas

| Data source | Rob (trades) | Lisa (ecommerce) | Jordan (mid-size) | Nadia (team mgr) | API availability |
|------------|-------------|-------------------|-------------------|-------------------|-----------------|
| Email (Gmail/Outlook) | High volume, unstructured | High volume | High volume | High volume | Gmail API, Microsoft Graph |
| Calendar | Low use | Moderate use | High use | High use | Google Calendar API, Microsoft Graph |
| Documents (Drive/SharePoint) | Low — receipts, quotes | Moderate — product docs, SOPs | High — policies, reports | High — templates, reports | Google Drive API, SharePoint API |
| Accounting (Xero/QuickBooks) | High — invoices, quotes | High — orders, invoices | Moderate | Low | Xero API, QuickBooks API |
| Ecommerce (Shopify) | N/A | High — orders, products, customers | N/A | N/A | Shopify API |
| CRM | Low — maybe spreadsheet | Moderate | Moderate-High | Moderate | Varies (HubSpot API, Salesforce API) |
| Slack/Teams | Low | Moderate | High | High | Slack API, Microsoft Graph |
| Project tools | Low | Low-Moderate | High | High | Linear API, Jira API, etc. |

**Key observation:** Every persona has at least 2-3 rich data sources that would reveal processes. Rob has email + Xero. Lisa has email + Shopify + Xero. Jordan has email + calendar + project tools + Slack. Nadia has email + calendar + project tools + documents.

---

## Provenance Summary

| Pattern/Concept | Source | Type |
|----------------|--------|------|
| System-level process mining | Celonis, SAP Signavio, Microsoft (Minit) | Established industry |
| Task mining (desktop activity capture) | Mimica, Skan.ai, KYP.ai | Established industry |
| Hybrid narrative + data discovery | ClearWork | Emerging commercial |
| Enterprise knowledge graph | Glean | Established enterprise |
| Multi-agent LLM process knowledge acquisition (PKAI) | Springer BISE 2025 paper | Academic research |
| APQC Process Classification Framework | APQC (since 1992) | Industry standard |
| Process discovery from SaaS API data | Not established — typically enterprise ERP | Gap / Original to Agent OS |
| Evidence-informed conversational discovery | Not established — ClearWork interviews are closest | Gap / Original to Agent OS |
| Discovered processes → executable definitions with trust tiers | Not established | Original to Agent OS |
| Continuous discovery (ongoing, not one-time audit) | Not established | Original to Agent OS |

---

## Landscape Flag

The current `docs/landscape.md` does not include process mining, process discovery, or process intelligence tools. If process discovery becomes an Agent OS capability, the landscape should be updated to include:
- Celonis (enterprise process mining — context, not adoption)
- Mimica (task mining — pattern reference)
- ClearWork (hybrid discovery — closest approach)
- Glean (enterprise knowledge graph — connector patterns)
- PKAI (academic reference for LLM-based discovery)
- APQC PCF (industry standard process taxonomy)

Sources:
- [KYP.ai — Automated Process Discovery Tools](https://kyp.ai/automated-process-discovery-tools/)
- [ProcessMind — 23 Process Mining Tools for 2026](https://processmind.com/resources/blog/the-ultimate-list-of-process-mining-tools-for-2026)
- [ClearWork — Automated Process Discovery](https://www.clearwork.io/clearwork-automated-discovery)
- [Springer — LLMs for Process Knowledge Acquisition (PKAI)](https://link.springer.com/article/10.1007/s12599-025-00976-w)
- [Springer — Business Process Discovery Through Agentic Generative AI](https://link.springer.com/chapter/10.1007/978-981-95-5015-9_19)
- [Skan.ai — Process Discovery and Analysis](https://www.skan.ai/process-discovery-and-analysis)
- [Mimica — AI-Powered Task Mining](https://www.mimica.ai/product)
- [Glean — Enterprise AI Search](https://www.glean.com/)
- [APQC — Process Classification Framework](https://www.apqc.org/process-frameworks)
- [PM4JS — Process Mining for Javascript](https://github.com/pm4js/pm4js-core)
- [Slack — AI Enterprise Search](https://slack.com/blog/productivity/ai-enterprise-search-top-features-and-tools-in-2025)
