# Insight-029: Platform Agents Are the Product

**Date:** 2026-03-19
**Trigger:** User observation that Agent OS must ship with core agents and gold-standard process templates — some essential to the platform, others ready for user adaptation
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L5 Learning, L6 Human
**Status:** absorbed into ADR-008 (system agents + process templates)

## The Insight

Agent OS has two categories of agents that must be distinguished: **system agents** that are essential to the platform's own operation, and **domain agents** that execute user-configured processes. The current architecture treats all agents as user-configured (via process YAML + adapter). But several functions already described in the architecture — governance monitoring, self-improvement scanning, daily brief synthesis, process discovery, trust earning — are actually system agents. They operate on behalf of the platform, not on behalf of a user process.

Furthermore, Agent OS should be opinionated about processes. It shouldn't present users with a blank canvas and ask "describe your process." It should ship with gold-standard process templates derived from industry frameworks (APQC's 1,000+ processes, SCOR, etc.) and have system agents that embody this knowledge. The process analysis agent shouldn't search a template database — it should intrinsically know what a quoting process looks like across industries, what a good invoicing workflow includes, what quality criteria matter for report formatting.

This means Agent OS's system agents are not a feature — they are the product. The governance monitor, the process discoverer, the improvement scanner, the onboarding guide — these are what makes Agent OS a harness creator rather than just a process engine. Domain agents are pluggable. System agents are durable. Templates are the starting material. The system agents are what transforms templates into living, trusted, improving processes.

## Implications

- **Architecture (L2):** Agent definitions need a `category` field: `system` vs `domain`. System agents are shipped with the platform, versioned with it, and cannot be deleted by users. Domain agents are user-configured.
- **Cold-start (L6):** The onboarding flow is driven by system agents, not by the user browsing a template library. The Onboarding Guide agent walks the user through first process setup. The Process Analysis agent helps formalize it against industry standards. The Process Discoverer agent (when data sources are connected) finds what the user is already doing.
- **Template library (L1):** APQC-derived process templates should exist as structured YAML files — both browsable by users and usable by system agents as reference material.
- **System agent prompts:** System agents need deep, opinionated knowledge built into their system prompts. The Process Analyst doesn't just know the APQC taxonomy — it knows what a good invoicing process looks like for a trades business vs an ecommerce business.

## Where It Should Land

Architecture spec — this requires a formal distinction between system agents and domain agents in the Agent Layer (L2), and a specification for the template library in the Process Layer (L1). May warrant its own ADR if the Architect determines it fundamentally changes the agent model.
