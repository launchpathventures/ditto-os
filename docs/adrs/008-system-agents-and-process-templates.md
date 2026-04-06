# ADR-008: System Agents, Process Template Library, and Cold-Start Architecture

**Date:** 2026-03-19
**Status:** accepted

## Context

Ditto's architecture describes several functions that operate on behalf of the platform rather than on behalf of user-configured processes: the self-improvement meta-process (architecture.md:509-526), the governance function (architecture.md:303-319), process discovery (Insight-016), and the daily brief (architecture.md:597-609). These are described as processes or functions, but they are architecturally distinct from user-configured domain processes — they are essential to the platform's own operation.

Separately, the architecture states that "industry standard templates provide starting points — users customise from known-good patterns" (architecture.md:145) and that "frameworks like APQC... have already mapped what businesses do" (architecture.md:54-56). But no specification exists for how these templates are structured, stored, or used by the platform.

These two gaps — unnamed system agents and unspecified template library — converge at the cold-start problem. Every automation platform in the landscape solves cold-start with passive template browsing (n8n: 8,834 templates, Zapier: role-based starter kits, Notion: 30,000+ community templates). None uses AI to actively help users discover, analyze, or formalize their first process. Ditto's Explore mode and process-first model demand a more active approach.

### Forces

1. **The architecture already describes system agents without naming them.** Governance, self-improvement, daily brief, and trust earning are platform-level functions. Formalizing them as a category prevents architectural drift as more are added.

2. **Process templates with governance declarations don't exist anywhere.** The landscape ships workflow templates (trigger → action) or agent templates (role + tools). Nobody ships templates with quality criteria, trust configuration, feedback loops, and learning — the process-as-primitive model. This is a gap Ditto must fill.

3. **APQC PCF is the most viable base.** 1,000+ processes, 13 categories, 5 levels deep, royalty-free license, available as Excel. No AI-accessible version exists. The D365 Business Process Catalog is the only open-source alternative (800+ processes on GitHub, but Dynamics 365-specific).

4. **Cold-start is phased by integration availability.** Conversational process analysis works without integrations (system agent + template knowledge). Data-driven process discovery requires connected data sources (Phase 6+). The cold-start flow must work at each phase.

5. **Single-process value (Insight-014) constrains the template approach.** A user must get to one working process quickly. Templates must be immediately usable, not reference material that requires further decomposition.

6. **The reviewer flagged that the research pre-loaded design decisions.** This ADR makes those decisions explicitly, with justification.

### Research inputs

- `docs/research/pre-baked-agents-and-process-templates.md` — landscape survey of templates, system agents, cold-start patterns, APQC/framework analysis
- `docs/research/process-discovery-from-organizational-data.md` — five discovery approaches, PKAI framework, persona data source mapping
- `docs/research/process-driven-skill-orchestration.md` — engine already drives execution automatically; gap is process creation
- `docs/insights/016-discovery-before-definition.md` — discovery should precede definition
- `docs/insights/017-platform-agents-are-the-product.md` — system agents are the product, not a feature

## Decision

### 1. Formalize two agent categories: system and domain

**System agents** are shipped with the platform, versioned with it, and operate on behalf of Ditto itself. They cannot be deleted by users. They are subject to the same harness pipeline (trust, review, feedback) as domain agents — they are not exempt from governance.

**Domain agents** are user-configured agents that execute user-defined processes. They are created, modified, and deleted by users. This is what the current architecture describes.

The distinction is a `category` field on agent definitions: `system` | `domain`. System agents have a `systemRole` field identifying their platform function.

### 2. Define thirteen system agent roles

These are the functions the architecture already describes, now formalized as system agents. ADR-010 added three meta-process agents (intake-classifier, router, orchestrator) to the original seven. Brief 079 added network-agent and coverage-agent:

| System role | Purpose | Phase | Status |
|-------------|---------|-------|--------|
| **intake-classifier** | Classifies incoming work items by type (question/task/goal/insight/outcome) | Phase 4 (ADR-010) | Done |
| **router** | Matches work items to the best-fit process | Phase 4 (ADR-010) | Done |
| **orchestrator** | Decomposes goals into tasks, tracks progress, routes around blockers (Brief 021) | Phase 4-5 (ADR-010) | Done |
| **trust-evaluator** | Calculates trust scores, recommends upgrades/downgrades based on accumulated feedback data | Phase 3 | Done |
| **improvement-scanner** | Scans for process degradation, correction patterns, ecosystem changes. Proposes improvements | Phase 9 | Not started |
| **brief-synthesizer** | Aggregates status across all processes, produces personalized Daily Brief | Phase 10 | Not started |
| **process-analyst** | Guides outcome owners through process articulation via intelligently guided hybrid (conversation + structured builder). Classifies against industry standards (APQC). Infers process structure from descriptions. Surfaces relevant templates. Reasons alongside the user — not a form or a transcript-to-YAML converter (Insight-047) | Phase 11 (PM triage: may move earlier) | Not started |
| **onboarding-guide** | Walks new outcome owners through first process setup. Conversational. Helps users who "know what good looks like" but haven't codified it. Knows template library | Phase 11 (PM triage: may move earlier) | Not started |
| **process-discoverer** | Connects to org data sources, identifies recurring process patterns, surfaces candidates | Phase 11 (requires Phase 6 integrations) | Not started |
| **governance-monitor** | Watches for trust gaming, rubber-stamping, permission violations, compliance gaps | Phase 12 | Not started |
| **coverage-agent** | Proactively identifies process coverage gaps. Reasons from user model + Process Model Library + Standards Library + industry patterns + connected data to suggest what the user should have in place but doesn't. The outward-looking complement to improvement-scanner (which looks inward at existing processes). Max 1-2 suggestions per cycle with stage-aware timing. Runs on scheduled heartbeat (daily default). Dismissed suggestions tracked in memory. (Insight-142) | Phase 11 | Not started |
| **network-agent** | External relationship management — outreach, introductions, and nurture on behalf of users. Operates through personas (Alex/Mira). Mode-shifted posture: Selling (internal BDR) vs Connecting (researcher/advisor). Person-scoped memory. Trust tiers on outreach (supervised default), Critical tier on introductions. (Brief 079) | Phase 14 | In progress |

**Key principle:** Not all system agents are built at once. The architecture accommodates them now; the roadmap sequences when they're built. Four are done (trust-evaluator Phase 3, intake-classifier + router + orchestrator Phase 4-5).

**Key principle:** System agents are subject to their own trust tiers. The governance monitor is always `critical` (human reviews every finding). The brief synthesizer starts `supervised` and can earn `spot-checked`. System agents are not trusted by default — they earn trust like any other agent.

### 3. Process template library: hybrid model (templates as data + agents trained on them)

Process templates are structured YAML files in a `templates/` directory, following the same format as `processes/` but with additional metadata:

```yaml
# Template metadata
template:
  id: quoting-trades
  name: Customer Quoting (Trades)
  description: Generate and send quotes for trade jobs
  category: domain  # system | domain
  industry: trades
  apqc_reference: "3.3 Price and Configure Products and Services"
  persona_fit: [rob]  # which personas this is designed for
  complexity: narrow  # narrow | wide (Insight-008)

# Standard process definition (same structure as processes/)
name: Customer Quoting
id: quoting
version: 1
status: draft  # templates load as draft — not active until user adopts
# ... inputs, steps, outputs, quality_criteria, feedback, trust ...
```

**Template sources (phased):**
- **Phase 5:** 5-10 hand-crafted templates for each persona's top processes (from persona mapping table in research). These are opinionated, ready-to-use process definitions — not APQC decompositions.
- **Phase 11:** APQC PCF imported as a classification taxonomy (not as templates). The process-analyst agent uses APQC categories to classify and compare user processes. Templates remain hand-crafted but APQC-classified.
- **Phase 13:** Community-contributed templates. Users can share adapted templates.

**Why not convert all 1,000+ APQC processes to templates?** APQC entries are classification elements (category → process group → process → activity → task), not executable process definitions. They describe *what* a process is, not *how* it runs. Converting an APQC entry to an Ditto template requires adding: steps with executor types, quality criteria, feedback configuration, trust tiers, integration bindings. This is domain-specific work — "invoice reconciliation" looks different for Rob (trades, Xero) vs Lisa (ecommerce, Shopify) vs Jordan (mid-size, ERP). Hand-crafted, persona-grounded templates are more valuable than bulk-converted taxonomy entries.

**APQC's role:** Classification lens, not template source. The process-analyst agent uses APQC to recognize what a user is describing ("This sounds like invoice reconciliation — APQC 9.3") and to surface completeness gaps ("Standard invoice reconciliation includes a three-way match step — yours doesn't. Is that intentional?"). APQC is embodied in the agent's knowledge, not materialized as 1,000 YAML files.

### 4. Template-to-agent knowledge relationship: dual-purpose

Templates serve two purposes:
1. **User-browsable:** Users can browse templates by category, persona, industry. In the CLI, `pnpm cli templates` lists available templates. In the web UI, the Setup view includes a template browser.
2. **Agent training material:** System agent prompts include heuristics derived from templates. The process-analyst agent's system prompt includes: what a good quoting process looks like, what quality criteria matter for invoicing, what common steps are missing from first-time process definitions. When templates are updated, agent prompts should be reviewed for consistency.

This is the hybrid model from the research (Option C). Templates are inspectable data AND the basis for agent knowledge. The risk of divergence is managed by making template updates a trigger for agent prompt review — this is a governance concern, not an automation problem.

### 5. Cold-start flow: phased by capability

The cold-start flow evolves across phases as capabilities become available:

- **Phase 5 (CLI-only, no integrations):** Template-driven. User selects from template library, guided customization via CLI prompts. Script-driven, no system agent needed. The template library does the heavy lifting.
- **Phase 11 (web UI, Explore mode, integrations available):** Agent-driven. Composes three layers: template library (passive browse), process-analyst agent (conversational classification against APQC), and process-discoverer agent (data-driven pattern finding from connected sources).

Both flows must produce a working single process in the first session (Insight-014). Detailed interaction flows belong in the Phase 5 and Phase 11 briefs, not in this decision record.

### 6. Schema changes

Add to the `agents` table:
- `category`: text, `system` | `domain`, default `domain`
- `systemRole`: text, nullable — only for system agents (e.g., `trust-evaluator`, `governance-monitor`)

Templates sync to the `processes` table with status `draft` (not active until explicitly adopted by the user). The existing `draft` status is reused rather than adding a new `template` status — this keeps the status lifecycle simple and means adoption is just changing status to `active`.

Add a `templates/` directory for process template YAML files, parallel to `processes/`. Templates sync via `pnpm cli sync` alongside process definitions. The loader forces `status: draft` regardless of what the YAML says. The YAML file is authoritative; the database row enables querying.

### 7. Security implications

- **System agent permissions:** System agents have broader read access than domain agents (e.g., cross-process feedback data for improvement-scanner, all process statuses for brief-synthesizer, trust data across processes for governance-monitor). Each system agent's permissions are explicitly scoped in its agent harness definition — broader than a single domain agent, but still bounded. They cannot modify processes or override trust tiers — they can only surface findings and recommend actions. The system agent permission model requires definition as a follow-up decision.
- **Template integrity:** Templates shipped with the platform are read-only. Users create copies when adopting a template. Community templates (Phase 13) require a review/approval process before inclusion.
- **APQC license:** Legal review of APQC PCF license terms is required before embedding APQC references in templates or agent prompts. The license appears royalty-free but this needs confirmation. SCOR DS (open access since 2022) is a fallback for supply chain processes.

## Provenance

- **System agent concept:** Original — no existing framework distinguishes system agents from domain agents. Microsoft AI Foundry's Red Teaming Agent is the single known precedent (probes user-built agents for safety).
- **Template library pattern:** Established industry pattern (n8n 8,834 templates, Zapier starter kits, Notion 30K+ templates). Ditto extends this with governance declarations (trust, quality criteria, feedback) — Original.
- **APQC as classification lens:** APQC Process Classification Framework (since 1992). Using it as agent knowledge rather than as a template database is Original.
- **Cold-start via conversational analysis:** ClearWork (hybrid AI-guided interviews) + PKAI academic framework (preparation → socialization → externalization). Ditto's version differs: produces executable process definitions with trust tiers, not RPA blueprints — Original.
- **Hybrid template-agent knowledge model:** Original — no existing system uses templates as both user-browsable artifacts and agent training material.
- **Trust-evaluator as system agent:** Original — no existing platform has a trust evaluation agent (trust is always infrastructure, not an agent).

## Consequences

### What becomes easier
- **Architectural clarity:** Every platform-level function has a home (system agent with a defined role). New platform capabilities can be designed as system agents from the start.
- **Cold-start:** Users start from opinionated templates, not blank canvases. The path from "I need help with quoting" to a working process is short and guided.
- **Process quality:** Templates embody best practices. The process-analyst agent catches common gaps. Users benefit from accumulated domain knowledge even on their first process.
- **Roadmap coherence:** System agents are sequenced across phases — the trust-evaluator in Phase 3, improvement-scanner in Phase 9, process-analyst in Phase 11. Each phase adds a system agent that unlocks new platform capability.

### What becomes harder
- **Maintenance:** Templates must be maintained and kept current. Agent prompts must stay in sync with template knowledge. This is ongoing work, not a one-time setup.
- **APQC dependency:** If APQC licensing doesn't permit embedding, we need an alternative classification system. SCOR (supply chain) is open, but there's no open equivalent of APQC's cross-industry breadth.
- **System agent governance:** System agents need their own trust tiers, review patterns, and feedback loops. Quis custodiet ipsos custodes? The governance-monitor monitors domain agents, but who monitors the governance-monitor? Answer: it's always `critical` tier — human reviews every finding.

### What new constraints this introduces
- **Template quality bar:** Every template shipped with Ditto must be hand-crafted, persona-grounded, and tested. Bulk-converting APQC entries is explicitly rejected.
- **System agent prompts are product artifacts:** Changes to system agent system prompts are product changes, not casual edits. They need review.
- **Phase 5 must include templates:** The end-to-end verification phase must ship with at least the coding domain templates (already exist as `processes/`) plus 2-3 non-coding templates to prove the template-adoption flow.

### Roadmap impacts
- **Phase 5:** Must include 2-3 non-coding templates to prove the template-adoption flow (currently only has coding domain processes).
- **Phase 10:** Daily Brief UI primitive needs a `brief-synthesizer` system agent to produce its content. Roadmap should note this dependency.
- **Phase 11:** Current roadmap describes "System Analyst AI (meta-agent for setup)" as a single capability. This ADR splits it into two system agents: `process-analyst` (conversational classification) and `onboarding-guide` (first-run flow). Roadmap should be updated to reflect this split.

### Implementation details deferred to phase briefs
These decisions are needed but belong in the briefs for the phases where they're actually used — not in the architectural decision record:
- **APQC license, template authoring, template directory structure** → Phase 5 brief (first templates ship)
- **System agent prompt management** → Phase 9 or 11 brief (first prompt-heavy system agent)
- **System agent permission model** → Phase 9 brief (first system agent needing cross-process access)
