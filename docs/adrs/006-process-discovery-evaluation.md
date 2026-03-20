# ADR-006: Process Discovery from Organizational Data

**Date:** 2026-03-19
**Status:** accepted
**Input:** `docs/research/process-discovery-from-organizational-data.md`, Insight-016

## Context

Agent OS currently assumes processes are defined through conversational setup (Explore mode → Process Builder). The user describes their pain, the system asks questions, a process definition emerges. Research (Insight-016) identified that every organisation already has a digital footprint — emails, documents, calendars, financial records, messaging, service desk tickets — that encodes its real processes.

The question: should Agent OS discover processes from this data, and if so, where does this capability sit in the architecture and roadmap?

## Decision

Process analysis/discovery is a **first-class mode** of Agent OS — not a feature or enhancement. Analyze sits alongside Explore and Operate as the third core mode. The architecture moves from two modes to three:

- **Analyze** — connect to systems, understand how the org actually works, surface patterns, validate reality vs. design
- **Explore** — define and refine processes, guided by evidence from Analyze or from a blank canvas
- **Operate** — run processes, review outputs, earn trust

Analyze feeds both other modes and is invocable at any time — not just during onboarding. It produces and maintains the organizational data model: a persistent, evolving understanding of the organisation derived from connected data.

### Four design decisions:

**1. Analyze is a first-class mode with its own Core Thesis section.**

The architecture spec's Core Thesis gains "The Organisation's Data Already Encodes Its Processes" as a new subsection. The two-mode table (Explore/Operate) becomes a three-mode table. This is a thesis-level belief about how Agent OS works, not an implementation detail.

**2. Layer 4 keeps the organizational data model — grounded in "shared organisational context."**

Layer 4 already claims to provide "shared organisational context" but only operationalizes one mechanism (process dependency graph). The organizational data model is the second mechanism — a persistent, evolving understanding of how the organisation actually works, derived from connected data sources. Two graphs, two purposes:

- **Process dependency graph** — operational, reactive, event-driven. How Agent OS processes relate to each other.
- **Organizational data model** — analytical, evolving, evidence-based. How the organisation actually works based on connected data.

The org data model is not just a discovery input. It enables validation (defined vs actual), gap detection (undiscovered processes), improvement evidence (bottlenecks, delays), and ongoing organizational awareness. It is fed by L2 (connectors), held in L4 (awareness), used by L5 (learning), and presented by L6 (human layer).

This is a **moderate amendment** to Layer 4, not minor.

**2. Blank-canvas fallback tracked with a re-entry condition.**

The architecture retains blank-canvas conversation as the primary Explore mode path (no dependency on connectors). Discovery is an enhancement, not a prerequisite. However, a re-entry condition is added to the roadmap:

> "If Explore mode design or user testing (Phase 11) reveals that blank-canvas conversation produces poor process definitions for non-technical users, re-evaluate whether discovery should be a prerequisite for Explore mode rather than an enhancement."

This tracks the genuine tension that Rob and Lisa may struggle to articulate processes from a blank canvas.

**3. Core Thesis gets one-word amendment, not a new section.**

"Help humans articulate processes" becomes "Help humans **discover and** articulate processes." Discovery is embedded in the existing thesis point rather than elevated to its own section. A paragraph is added under this point explaining the two paths (evidence-informed discovery vs blank-canvas conversation). This keeps the Core Thesis tight and avoids mixing implementation detail into thesis-level writing.

## Impact by Layer

| Layer | Impact | What changes |
|-------|--------|-------------|
| Core Thesis | Major | Three modes (Analyze, Explore, Operate) replaces two modes. New thesis subsection. |
| L1 Process | Minor | Process provenance concept: manual, template, or discovered. Same schema, same trust rules. |
| L2 Agent | None | Discovery agents use existing adapters and integration connectors (ADR-005). |
| L3 Harness | None | Discovered processes enter with same trust tiers and review patterns. |
| L4 Awareness | Moderate | Organizational data model as second mechanism fulfilling "shared organisational context." |
| L5 Learning | Minor | Process gap detection added to self-improvement meta-process. |
| L6 Human | Moderate | Analyze mode as third mode alongside Explore and Operate. |

## Roadmap Impact

- **No new phase.** Discovery absorbs into Phase 11 (Explore → Operate Transition).
- **No resequencing.** Phase 6 connectors → Phase 11 discovery is the natural dependency chain.
- **Phase 11 gains new capabilities:** evidence-informed discovery, organizational data analysis, APQC/ITIL classification, process candidate scoring, continuous gap detection.
- **Dependency note added:** Phase 11 requires Phase 6 integration connectors.
- **Re-entry condition added** for blank-canvas fallback.

## Provenance

| Pattern | Source | Relationship |
|---------|--------|-------------|
| Multi-agent process discovery pipeline | PKAI (Springer BISE 2025) | Informed by — preparation/socialization/externalization stages |
| Hybrid narrative + data discovery | ClearWork | Informed by — interview + data approach |
| Process mining from SaaS API data | Gap — enterprise tools use ERP logs | Original to Agent OS |
| Evidence-informed conversational discovery | Gap — ClearWork interviews closest | Original to Agent OS |
| Discovered processes → executable definitions with trust tiers | Gap | Original to Agent OS |
| Organizational data model as persistent org understanding | Skan.ai "Digital Twin of Operations" concept | Informed by + Original — adapted for SMB data sources |
| Continuous process gap detection | Gap | Original to Agent OS |

## Open Questions (deferred to Phase 11 design)

1. **Privacy model** for discovery-scoped data access (broad read vs. specific triggers)
2. **Minimum viable discovery** — what's the smallest useful set of sources?
3. **APQC/ITIL** as training data vs. active classification engine
4. **Single-user discovery** (Phase 11) vs. **multi-user discovery** (requires Phase 12 governance)
