# Research: Pre-Baked Agents, Process Templates, and Cold-Start Architecture

**Date:** 2026-03-19
**Research question:** Should Agent OS ship with core system agents and gold-standard process templates? What exists in the landscape? How does this relate to the cold-start problem and process analysis?
**Triggered by:** User observation that Agent OS must be opinionated about process analysis and creation — agents should either have local access to gold-standard templates or embody them
**Status:** Complete — awaiting review

---

## Context

Agent OS currently has:
- 5 process YAML files in `processes/` — all for the coding domain (dogfood)
- 10 agent roles in the Claude adapter — all coding-specific
- A process discovery research report (`docs/research/process-discovery-from-organizational-data.md`) describing how to discover processes from existing org data
- A process-driven skill orchestration report (`docs/research/process-driven-skill-orchestration.md`) showing the engine already drives execution automatically

What Agent OS does NOT have:
- Any system agents that are part of the platform itself (not user-configured)
- Any gold-standard process templates for non-coding domains
- Any process taxonomy or classification engine
- Any cold-start onboarding flow

The user's question: shouldn't Agent OS ship with opinionated, best-in-class agents and process templates — some essential to the platform's own operation, others ready for user adaptation?

---

## Two Categories of Pre-Baked Capability

The user identifies a critical distinction:

### Category 1: System Agents (Essential to Agent OS Itself)

Agents that Agent OS needs to do what it does. These are not user-configured — they ARE the platform. They operate on the platform's behalf, governing, discovering, improving, and onboarding.

### Category 2: Domain Process Templates (Ready for User Adaptation)

Gold-standard process definitions that embody best-in-class patterns for common business processes. Users don't start from blank — they start from an opinionated template and adapt it to their context.

---

## Category 1: System Agents — What the Landscape Shows

### Finding 1: Almost No Platform Ships True System Agents

Across all platforms researched, only one clear example of a true system agent exists:

| Platform | System agents? | What exists |
|----------|---------------|-------------|
| **Microsoft AI Foundry** | Yes — 1 example | AI Red Teaming Agent: probes user-built agents for safety vulnerabilities. Operates on the platform's behalf, not user-configured. |
| **Salesforce Agentforce** | No — domain agents | Ships 8+ pre-built agents (Service, Sales Development, Commerce, etc.) but these are domain agents, not system agents |
| **IBM watsonx** | No — domain agents | Ships 100+ pre-built agents and 400+ tools — all domain-specific, not system agents |
| **CrewAI** | No | ~15 example crews in GitHub repo. No system-level agents. |
| **Mastra** | No | 12 starter templates. No system-level agents. |
| **n8n** | No | 8,834 workflow templates. No system-level agents. |
| **Zapier** | No | Templates + Zaps. No system-level agents. |
| **Relevance AI** | No | 18+ community agent templates. No system-level agents. |

**Gap:** Governance across all platforms is implemented as dashboards and infrastructure, not as autonomous agents. No platform ships discovery agents, self-improvement agents, or onboarding agents that operate autonomously within their own product.

### Finding 2: Agent OS Already Describes System Agents — But Hasn't Named Them

The architecture spec already describes several functions that are system agents in all but name:

| Function in architecture.md | Current status | System agent? |
|------------------------------|---------------|---------------|
| **Self-Improvement Scan** (architecture.md:509-526) | Described as a meta-process | Yes — this is a system agent that monitors all other processes |
| **Governance Function** (architecture.md:303-319) | Described as a dedicated agent team | Yes — monitors behaviour, compliance, trust integrity |
| **Process Discovery** (research report: process-discovery-from-organizational-data.md) | Researched, not designed | Yes — Discovery Analyst and Discovery Consultant roles |
| **Project Orchestration / PM** (architecture.md:597-609) | Process definition exists | Hybrid — system function for daily brief, user function for priorities |
| **Trust Earning Engine** | Phase 3 next | Yes — calculates trust, recommends upgrades/downgrades |

### Finding 3: The Process Analysis Phase Implies Specific System Agents

The user's observation about the process analysis phase reveals agents that must exist for Agent OS to function as described:

**Analysis agents (cold-start and ongoing):**
- **Process Discoverer** — connects to org data, identifies recurring patterns, classifies against industry standards
- **Process Analyst** — given a rough process description, asks structured questions, fills gaps, validates against industry standards, produces a complete process definition
- **Process Comparator** — given a user's process, compares it against the gold-standard template and surfaces differences ("Your invoicing process is missing a reconciliation step that 80% of similar businesses include")

**Operational system agents:**
- **Governance Monitor** — watches for trust gaming, rubber-stamping, permission violations
- **Improvement Scanner** — periodic scan for degradation, new tools, correction patterns
- **Daily Brief Synthesizer** — aggregates status across all processes, produces personalized brief
- **Onboarding Guide** — walks new users through first process setup (conversational)

---

## Category 2: Domain Process Templates — What the Landscape Shows

### Finding 4: Template Libraries Are Universal but Shallow

Every automation platform ships templates, but they're workflow-level, not process-level:

| Platform | Template count | Structure | Depth |
|----------|---------------|-----------|-------|
| **n8n** | 8,834 | 7 categories (Marketing, Sales, IT Ops, etc.) | Workflow-level: trigger → steps → output |
| **Zapier** | Thousands | By app pair + use case + role-based starter kits | Connection-level: "When X in App A, do Y in App B" |
| **Notion** | 30,000+ | 19,099 community creators | Document templates, not process templates |
| **CrewAI** | ~15 examples | GitHub repo | Crew definitions (agents + tasks) |
| **Mastra** | 12 | Starter kits | Agent definitions |
| **Relevance AI** | 18+ | Community marketplace | Single-agent templates |
| **Salesforce Agentforce** | 8+ | Pre-built domain agents | Agent + actions + topics |
| **IBM watsonx** | 100+ agents, 400+ tools | Domain-specific | Agent + tool bundles |

**Key observation:** Nobody ships process-level templates with quality criteria, trust configuration, feedback loops, and learning. They ship workflows (trigger → action → output) or agent definitions (role + tools). The process-as-primitive model with its governance declaration — inputs, steps, quality criteria, feedback, trust — does not exist in any template library.

### Finding 5: Industry Standard Frameworks Exist but Are Not Machine-Accessible

| Framework | Owner | Processes | Free? | Machine-readable? | Embeddable? |
|-----------|-------|-----------|-------|-------------------|-------------|
| **APQC PCF** | APQC | 1,000+ across 13 categories, 5 levels deep | Free download (Excel/PDF), royalty-free license | Excel only (no JSON/XML/API) | License appears royalty-free; terms in download file |
| **ITIL v4** | PeopleCert | 34 management practices in 3 groups | No — proprietary | No standard format | Requires paid license + quarterly royalties |
| **SCOR DS** | ASCM | 6 core processes, 250+ metrics, 4 levels | Free since 2022 | Web-based digital standard | Open-access guidance available |
| **eTOM** | TM Forum | 1,000+ activities across 5 levels | No — membership required | Membership-gated | Proprietary |
| **MS D365 Business Process Catalog** | Microsoft | 800+ processes, 3,000+ patterns, 6 levels | Open source on GitHub | Excel + Visio | Open source |

**APQC PCF detail:** The cross-industry PCF v7.4 has 13 top-level categories:

| # | Category | Type |
|---|----------|------|
| 1.0 | Develop Vision and Strategy | Operating |
| 2.0 | Develop and Manage Products and Services | Operating |
| 3.0 | Market and Sell Products and Services | Operating |
| 4.0 | Manage Supply Chain for Physical Products | Operating |
| 5.0 | Deliver Services | Operating |
| 6.0 | Manage Customer Service | Management & Support |
| 7.0 | Develop and Manage Human Capital | Management & Support |
| 8.0 | Manage Information Technology (IT) | Management & Support |
| 9.0 | Manage Financial Resources | Management & Support |
| 10.0 | Acquire, Construct, and Manage Assets | Management & Support |
| 11.0 | Manage Enterprise Risk, Compliance, Remediation, and Resiliency | Management & Support |
| 12.0 | Manage External Relationships | Management & Support |
| 13.0 | Develop and Manage Business Capabilities | Management & Support |

5-level hierarchy: Category → Process Group → Process → Activity → Task. Each element has a unique numeric reference (e.g., 10002 for "1.0 Develop Vision and Strategy"). Available as Excel download. 18 industry-specific versions (Aerospace, Banking, Healthcare, Retail, Telecom, etc.).

**Microsoft D365 Business Process Catalog detail:** Open source on GitHub at [MicrosoftDocs/dynamics365-guidance](https://github.com/MicrosoftDocs/dynamics365-guidance). 6 levels: End-to-end processes → Business process areas → Business processes → Scenarios/Patterns → System processes → Test cases. 15 end-to-end processes, 100+ business process areas, 800+ business processes, 3,000+ scenarios. Available as Excel workbook with Visio diagrams. Community contributions accepted. Dynamics 365-specific but structurally useful as a reference.

**No AI-accessible version of any framework exists.** No project has built a JSON/API/knowledge-graph version of APQC, ITIL, or any standard process taxonomy. The closest is the D365 catalog on GitHub (Excel format, open source).

### Finding 6: APQC Is the Most Viable Base for Agent OS Templates

APQC stands out:
- **Royalty-free license** (appears embeddable — license terms in download file)
- **Cross-industry + 18 industry-specific versions** — covers all our personas
- **5-level hierarchy** maps to Agent OS process definition structure
- **Machine-readable** (Excel, convertible to YAML/JSON)
- **1,000+ processes** — comprehensive base knowledge

The architecture spec already calls this out: "Frameworks like APQC (12,000+ standard business processes), ITIL, COBIT, and ISO 9001 have already mapped what businesses do. The platform knows these the way an LLM knows language." (architecture.md:54-56)

What's missing: nobody has converted APQC into executable process definitions with quality criteria, trust configuration, and feedback loops.

---

## The Cold-Start Problem

### Finding 7: No Platform Uses AI to Solve Cold-Start

Every platform relies on the same pattern: browse templates, pick one, customize.

| Platform | Cold-start approach | AI involvement |
|----------|-------------------|----------------|
| **Zapier** | Role-based starter kits ("Marketing Manager starter pack") | None |
| **n8n** | Category browsing + search + "popular" collections | None |
| **Notion** | Template gallery with community contributions | None |
| **Linear** | Project templates by methodology (Scrum, Kanban, etc.) | None |
| **CrewAI** | `crewai create crew` CLI scaffolding + GitHub examples | None |
| **Salesforce Agentforce** | Guided wizard: select domain → configure agent → test | Minimal |
| **ClearWork** | AI-guided interviews + browser activity capture | Yes — but consulting-style, not product-style |

**Gap:** No platform has a discovery agent that interviews users about their work, connects to their existing tools, identifies what processes they already run, and recommends templates. The closest is ClearWork's hybrid approach (narrative + data), but it produces blueprints for RPA platforms, not executable process definitions.

### Finding 8: Agent OS's Cold-Start Should Be Three-Layered

Based on the landscape gaps, the cold-start problem has three layers that compose:

**Layer A: Template Library (passive)**
Gold-standard process templates derived from APQC/ITIL categories, pre-adapted for common roles and industries. The user browses, selects, and customizes. This is what every other platform does — necessary but not sufficient.

**Layer B: Process Analysis Agent (active, conversation-driven)**
A system agent that asks structured questions informed by industry standards. "What does your day look like?" → classifies against APQC categories → "This sounds like invoice reconciliation (APQC 9.3). Here's how it typically works — how does yours differ?" The agent embodies the template knowledge rather than just pointing at it.

**Layer C: Process Discovery Agent (active, data-driven)**
A system agent that connects to existing tools (email, calendar, Xero, Shopify), analyzes patterns, and surfaces candidate processes. "We found 6 recurring patterns in your email and Xero data. The top one is your invoicing workflow — you create an invoice 2-5 days after job completion, 30% require follow-up." The user confirms and refines.

These layers compose: Discovery finds the patterns (C), the Analysis agent helps formalize them against gold standards (B), and the template library provides the starting structure (A).

---

## Mapping to Agent OS Personas

### What templates each persona needs at cold-start

| Persona | Top 3 process templates | APQC category | Data sources for discovery |
|---------|------------------------|---------------|---------------------------|
| **Rob** (trades MD) | Quoting, Invoicing, Customer follow-up | 3.0 Market & Sell, 9.0 Financial, 6.0 Customer Service | Email, Xero, Calendar |
| **Lisa** (ecommerce MD) | Product content, Competitor monitoring, Order management | 2.0 Products & Services, 3.0 Market & Sell, 4.0 Supply Chain | Shopify, Email, Xero |
| **Jordan** (generalist technologist) | Reference checking, Month-end reconciliation, Weekly reporting | 7.0 Human Capital, 9.0 Financial, 13.0 Business Capabilities | Email, Calendar, Project tools, Slack |
| **Nadia** (team manager) | Report formatting, Quality review, Client reporting | 13.0 Business Capabilities, 6.0 Customer Service, 12.0 External Relationships | Documents, Email, Project tools |

**Key observation:** Each persona's first process maps to a well-established APQC category. The template doesn't need to be the full APQC decomposition — it needs to be the right starting structure: inputs → steps → outputs → quality criteria → feedback → trust, pre-populated with domain-appropriate defaults.

---

## How Templates Relate to System Agents

The user's key insight: agents should either "have local access to defined gold standard templates or embody them."

### Option A: Templates as Data (agents reference them)

Process templates live as YAML files (like the current `processes/` directory). System agents and the conversational interface reference them when helping users. The Process Analysis Agent reads the template library to suggest starting points. The Process Comparator reads them to identify gaps.

**How it works in practice:** User describes their quoting process. The Analysis Agent searches the template library, finds "Customer Quoting" template (derived from APQC 3.3 — Price and Configure). Presents it: "Here's a standard quoting process. It has 6 steps including margin calculation and approval routing. Your version seems to skip the approval step — is that intentional?"

**Factual pros:** Templates are inspectable, editable, versionable. Users can browse them. The library can be updated independently of agents. Community contributions possible.
**Factual cons:** Requires maintaining a separate artifact (the template library). Agent's knowledge is indirect — it reads templates at runtime rather than having intrinsic knowledge.

### Option B: Templates Embodied in Agents (agents ARE the knowledge)

System agents are trained/prompted with gold-standard process knowledge as part of their system prompts. The Process Analysis Agent doesn't search a template library — it has deep knowledge of APQC categories, common variations, and quality criteria baked into its context.

**How it works in practice:** User describes their quoting process. The Analysis Agent, whose system prompt includes structured knowledge of quoting processes across industries, responds: "A standard quoting process has 6 steps..." — from intrinsic knowledge, not a database lookup.

**Factual pros:** No separate artifact to maintain. The agent's reasoning is informed by deep context, not just template matching. More natural conversation — the agent "knows" the domain rather than searching for it.
**Factual cons:** Knowledge is hidden inside system prompts — not inspectable or browsable by users. Harder to update (must modify agent prompts). No community contribution path. Context window limits how much knowledge can be embodied.

### Option C: Hybrid (templates as data + agents trained on them)

Templates exist as structured YAML files. System agents are also trained on the template knowledge — their system prompts include the patterns and heuristics needed to use templates intelligently. The template library is both a browsable artifact AND the training material for system agents.

**How it works in practice:** Template library exists as YAML. The Process Analysis Agent's system prompt includes heuristics derived from templates ("When a user describes a quoting process, look for: margin calculation method, approval routing, follow-up cadence, pricing source"). At runtime, the agent can also reference specific templates for comparison.

**Factual pros:** Combines inspectability of Option A with conversational fluency of Option B. Templates serve dual purpose: user browsing + agent training. Updates to templates can inform agent prompt updates.
**Factual cons:** More maintenance — both templates and agent prompts must stay in sync. Risk of divergence if one is updated without the other.

---

## The "Embodiment" Question Applied to System Agents

For each system agent category, does the agent reference knowledge (data) or embody it (prompt)?

| System Agent | Knowledge type | Best carried as |
|-------------|---------------|-----------------|
| **Process Discoverer** | Pattern recognition heuristics, data source analysis methods | Embodied (prompt) — the heuristics for "this email pattern looks like an invoicing process" are judgment, not lookup |
| **Process Analyst** | Industry standard processes, quality criteria, common variations | Hybrid — APQC taxonomy as data, interview heuristics as prompt |
| **Process Comparator** | Gold-standard templates, gap analysis methods | Data-driven — needs to reference specific template structures |
| **Governance Monitor** | Trust rules, permission policies, compliance requirements | Embodied (prompt) + policy files — rules engine pattern |
| **Improvement Scanner** | Performance analysis methods, ecosystem awareness | Embodied (prompt) — compound-product pattern, judgment-heavy |
| **Daily Brief Synthesizer** | Aggregation logic, priority heuristics, personalization | Embodied (prompt) — how to synthesize is judgment, data comes from the database |
| **Onboarding Guide** | Cold-start flow, template library awareness, persona heuristics | Hybrid — conversational skills as prompt, template library as data |

---

## How This Relates to the Architecture

### Current architecture support

The architecture spec already accommodates this:
- **Layer 1 (Process):** "Industry standard templates provide starting points — users customise from known-good patterns" (architecture.md:145)
- **Layer 1 (Process):** "Based on: [Industry standard reference, if applicable]" field in process definition (architecture.md:122)
- **Layer 2 (Agent):** Agent harness includes identity, memory, tools, permissions — system agents would be defined here
- **Layer 6 (Human):** "Capability Catalog (guided discovery, not app store)" in Phase 11 roadmap (roadmap.md:243)
- **Self-Improvement Meta-Process:** Already described as a baked-in system process (architecture.md:509-526)

### What's not yet in the architecture

1. **System agent category** — no formal distinction between system agents (platform's own) and domain agents (user-configured)
2. **Template library** — mentioned but not specified (structure, format, content scope)
3. **Cold-start flow** — Explore mode is described but the specific onboarding sequence (template browsing → process analysis → discovery → first live process) is not formalized
4. **APQC integration** — mentioned as "base knowledge" but no specification for how it's stored, accessed, or used
5. **Template-to-agent relationship** — how templates inform system agent prompts is not specified

---

## What the Landscape Does NOT Have (Gaps / Original to Agent OS)

1. **Process-level templates with governance declarations** — nobody ships templates that include quality criteria, trust configuration, feedback loops, and learning. Everyone ships workflow templates (trigger → action) or agent templates (role + tools).
2. **System agents that operate the platform autonomously** — governance, discovery, improvement are all dashboards and infrastructure, not autonomous agents (except Microsoft's Red Teaming Agent).
3. **Cold-start via AI-driven process discovery** — no platform uses AI to solve the "what should I automate first?" problem. Everyone uses browse/search/curate.
4. **Industry-standard taxonomy as executable process templates** — APQC has 1,000+ processes but they're classification entries, not executable definitions. Nobody has bridged this gap.
5. **Template library + embodied agent knowledge as a unified system** — the idea that templates both serve as browsable artifacts AND training material for system agents is not found in any reviewed system.

---

## Provenance Summary

| Pattern/Concept | Source | Type |
|----------------|--------|------|
| Template libraries for automation (browse, select, customize) | n8n, Zapier, Make, Notion | Established industry |
| Pre-built domain agents | Salesforce Agentforce, IBM watsonx | Established enterprise |
| System agent (platform probes its own agents) | Microsoft AI Foundry Red Teaming Agent | Emerging (single example) |
| APQC Process Classification Framework | APQC (since 1992) | Industry standard |
| MS D365 Business Process Catalog (open source) | Microsoft GitHub | Open source reference |
| SCOR Digital Standard (open access) | ASCM | Industry standard |
| ITIL v4 practices | PeopleCert | Proprietary standard |
| Role-based starter kits for cold-start | Zapier | Established pattern |
| CLI scaffolding for agent creation | CrewAI | Established pattern |
| AI-guided process interview | ClearWork, PKAI (academic) | Emerging |
| Gold-standard templates as executable process definitions with trust | Not established | Original to Agent OS |
| System agents for governance, discovery, improvement | Not established (except Microsoft Red Teaming) | Original to Agent OS |
| Cold-start via AI-driven process discovery from org data | Not established | Original to Agent OS |
| Template library as dual-purpose: user browsable + agent training material | Not established | Original to Agent OS |
| Industry taxonomy (APQC) converted to executable process templates | Not established | Original to Agent OS |

---

## Landscape Flag

The current `docs/landscape.md` does not include:
- APQC PCF as a data source (structure, licensing, embeddability)
- Microsoft D365 Business Process Catalog (open-source process taxonomy on GitHub)
- SCOR Digital Standard (open-access supply chain process framework)
- Template library patterns from n8n, Zapier, Notion
- Salesforce Agentforce / IBM watsonx pre-built agent patterns
- Microsoft AI Foundry Red Teaming Agent (only known system agent pattern)
- ClearWork (hybrid AI-guided process discovery)

If pre-baked agents and process templates become an Agent OS capability, the landscape should be updated to include these.

Sources:
- [APQC Process Classification Framework](https://www.apqc.org/process-frameworks)
- [APQC PCF FAQs](https://www.apqc.org/process-frameworks/pcf-faqs)
- [APQC PCF Cross-Industry Excel v7.4](https://www.apqc.org/resource-library/resource-listing/apqc-process-classification-framework-pcf-cross-industry-excel-11)
- [APQC Industry-Specific PCFs](https://www.apqc.org/process-frameworks/industry-specific-process-frameworks)
- [Understanding the PCF Elements](https://www.apqc.org/sites/default/files/files/PCF%20Collateral/Understanding%20the%20PCF%20Elements%20%20-%20FINAL.pdf)
- [Microsoft D365 Business Process Catalog](https://learn.microsoft.com/en-us/dynamics365/guidance/business-processes/about)
- [MicrosoftDocs/dynamics365-guidance (GitHub)](https://github.com/MicrosoftDocs/dynamics365-guidance)
- [ASCM SCOR Digital Standard](https://www.ascm.org/corporate-solutions/standards-tools/scor-ds/)
- [ITSM.tools — 34 ITIL 4 Management Practices](https://itsm.tools/34-itil-4-management-practices/)
- [PeopleCert Third Party Licensing](https://www.peoplecert.org/Organisations/Services/third-party-product-licensing-service)
- [n8n Workflow Templates](https://n8n.io/workflows/)
- [CrewAI Examples](https://github.com/crewAIInc/crewAI-examples)
- [Mastra Examples](https://mastra.ai/examples)
- [KBpedia Knowledge Structure](https://kbpedia.org/)
- [awesome-bpm (GitHub)](https://github.com/ungerts/awesome-bpm)
- [bpmn.io (GitHub)](https://github.com/bpmn-io)
- [Enterprise Knowledge — AI & Taxonomy](https://enterprise-knowledge.com/ai-taxonomy-the-good-and-the-bad/)
- [Springer — LLMs for Process Knowledge Acquisition](https://link.springer.com/article/10.1007/s12599-025-00976-w)
- [ClearWork Automated Discovery](https://www.clearwork.io/clearwork-automated-discovery)
