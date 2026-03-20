# Insight-016: Discovery Before Definition

**Date:** 2026-03-19
**Trigger:** User observation that every organisation already has digital artifacts revealing its real processes — emails, documents, Slack, calendars, financial data, software usage
**Layers affected:** L1 Process, L4 Awareness, L5 Learning, L6 Human
**Status:** active

## The Insight

The current Explore mode assumes a blank canvas: the user describes their process, the system asks questions, a process definition emerges. But every organisation — from a one-person trades business to a 200-person company — already has a digital footprint that encodes its real processes. Emails show communication patterns and approval chains. Documents show templates and review cycles. Calendars show governance cadences. Financial records show transactional workflows. SaaS tools show operational sequences.

The natural starting point for Agent OS is not "describe your process" but "let us look at what you're already doing." Discovery should precede definition. Every organisation has readily available data sources — email, calendar, documents, knowledge base, Slack/Teams messages, service desk tickets, financial records — that the system's core agents can connect to, analyze for process patterns, classify against industry standards, and present as candidates for confirmation and refinement. The user's role shifts from *author* to *editor* — a much lower cognitive burden and a much more accurate starting point.

This inverts the onboarding model: instead of the user needing to articulate what they do (which requires process literacy they often don't have), the system shows them what it found and they react — confirm, correct, add context. This is more natural for non-technical users and produces more accurate process definitions because it's grounded in evidence rather than recall.

## Implications

- **Onboarding (L6):** The first interaction shifts from "tell me about your work" to "connect your email and calendar — we'll show you what we find." This is a fundamentally different entry point.
- **Explore mode (L6):** Extends from blank-canvas conversation to evidence-informed conversation. The system has data to reference during the dialogue.
- **Integration architecture (ADR-005):** Discovery reuses the same integration connectors planned for process I/O. No separate infrastructure needed — but connectors become a prerequisite for discovery, not just a Phase 6 capability.
- **Industry standards (L1):** APQC/ITIL classification moves from "template library for setup" to "lens for automated discovery." This makes the standards actively useful rather than passively available.
- **Continuous discovery (L4/L5):** Discovery isn't a one-time onboarding event. As organisational data flows through connected sources, the system can detect new or changed processes — extending the self-improvement meta-process from "are existing processes degrading?" to "are there processes we haven't captured yet?"
- **Process accuracy:** Discovered processes are grounded in evidence (actual email patterns, actual financial flows) rather than recall. This should produce more accurate starting definitions.

## Where It Should Land

Architecture spec — this could reshape the Explore → Operate transition (currently Phase 11) and potentially pull integration connectors earlier in the roadmap. The three-phase discovery flow (Connect & Analyze → Confirm & Refine → Operationalize) should be evaluated by the Architect as a potential extension to the architecture spec's Core Thesis section. May warrant its own ADR if the Architect determines it fundamentally changes the onboarding model.
