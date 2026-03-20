# Insight-044: System Agents Are Script Handlers, Not Executor Types

**Date:** 2026-03-21
**Trigger:** Brief 014b — router system agent was specified as `ai-agent` executor but implemented as `script` + `systemAgent` handler that calls the Anthropic SDK directly
**Layers affected:** L1 Process, L2 Agent
**Status:** active

## The Insight

System agents should all use the `script` executor with a `systemAgent` config that dispatches to a registered handler — even when the handler internally makes LLM calls. The executor type in the YAML describes the harness routing mechanism, not the underlying implementation.

This emerged when building the router system agent. The brief specified `ai-agent` executor (Claude adapter), but this meant losing control over structured output parsing — the Claude adapter returns free text, while the router needs JSON with a validated `processSlug`. Using `script` + `systemAgent: router` with a handler that calls the Anthropic SDK directly gives: (a) structured JSON output, (b) slug validation against available processes, (c) graceful error handling, and (d) a uniform pattern across all system agents.

The pattern: YAML says `executor: script, config: { systemAgent: "router" }`. The step executor dispatches to the system agent registry. The handler does whatever it needs — keyword matching, API calls, database queries — and returns a `StepExecutionResult`. The harness pipeline wraps the entire execution regardless.

## Implications

- **All system agents follow the same pattern** regardless of whether they need LLM calls. Trust-evaluator, intake-classifier, orchestrator are pure code. Router calls Claude. Same executor mechanism.
- **The YAML `executor` field is a harness routing hint**, not a declaration of what the step actually does. A `script` step with `systemAgent` config can do anything its handler does.
- **Future system agents** (brief-synthesizer, improvement-scanner, process-analyst) should follow this pattern even if they're LLM-heavy. The handler controls the prompt, parses the output, validates results.
- **The `ai-agent` executor remains for domain process steps** where the Claude adapter's role-based prompt system and tool-use loop are valuable. System agents have more specific needs.

## Where It Should Land

Architecture spec — Layer 2 Agent section, under the adapter/executor description. The `script` executor + `systemAgent` config pattern should be documented as the canonical system agent execution mechanism. Brief 014b's deviation from the `ai-agent` spec is the precedent.
