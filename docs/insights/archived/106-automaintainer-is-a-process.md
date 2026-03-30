# Insight-106: Automaintainer Is a Process, Not a Product

**Date:** 2026-03-28
**Trigger:** Architect evaluation of automaintainer research — user wants automated repo maintenance through the full dev cycle using Ditto's existing engine
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L4 Awareness, L5 Learning
**Status:** absorbed into Brief 049

## The Insight

The automaintainer is not a new product or a separate system — it is a **process definition** that routes GitHub issues through Ditto's existing dev pipeline. The existing engine already has everything needed: intake classification, routing, the 7-role dev pipeline, trust tiers, harness pipeline, metacognitive checks, maker-checker review, feedback recording, and trust earning.

What makes this insight non-obvious: every external automaintainer tool (gh-aw, SWE-agent, Copilot Agent) builds a *separate system* to do repo maintenance. Ditto's architecture already has the meta-process infrastructure to do this with zero new engine code — only new process YAML, new GitHub integration tools, and wiring.

The automaintainer is the first proof that Ditto's "process as primitive" model genuinely works for complex, multi-step, AI-driven workflows. If you can define a process for it, the engine runs it — with trust, governance, and learning built in.

## Implications

1. No new engine subsystems needed — the automaintainer is composed from existing capabilities
2. GitHub becomes an I/O layer: issues in (via polling trigger), PRs out (via output delivery)
3. The full dev cycle (triage → research → design → build → review → document) runs through the existing harness pipeline, not as ad-hoc agent calls
4. Trust tiers apply: starts supervised (human reviews every PR), earns spot-checked, can reach autonomous
5. Every correction to a generated PR feeds back into process-scoped memory — the automaintainer gets smarter

## Where It Should Land

Architecture spec validation (proves the six-layer model handles this use case). Brief 048 design input. Potentially the flagship demo of what Ditto does differently from raw AI coding agents.
