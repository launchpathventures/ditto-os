# Insight 173 — Structural Signal Model Routing

**Date:** 2026-04-11
**Trigger:** Analysis of NeurometricAI/neurometric-plugin — their approach to classifying API calls by structural shape (tools present? JSON output? token ratio?) rather than semantic content
**Layers affected:** L2 Agent, L3 Harness
**Status:** active

## The Insight

The cheapest and most reliable way to select the right model tier for a step is to look at **structural signals already present in the step definition** — not to run a separate classifier or require the process author to specify a model.

Ditto's `StepDefinition` already carries rich metadata: executor type, whether tools are declared, output expectations, trust tier, sending identity, harness review patterns, and retry configuration. These structural signals map directly to `ModelPurpose` categories:

| Signal in StepDefinition | Implies | Purpose |
|---|---|---|
| `executor: 'script'` or `executor: 'integration'` | No LLM needed | skip |
| Tools resolved + structured output | Function calling / extraction | `extraction` |
| `sendingIdentity: 'principal'` | User's reputation at stake | `writing` |
| Trust tier is `critical` or `supervised` | High stakes, needs best judgment | `analysis` or `writing` |
| Trust tier is `autonomous` + high approval history | Proven quality, can downgrade | `classification` (if simple) |
| Step has `route_to` conditions (is a router) | Classification/routing task | `classification` |
| `agent_role` contains research/analysis keywords | Accuracy matters more than voice | `analysis` |
| `harness` includes adversarial or ensemble review | Output will be checked — cheaper model acceptable | downgrade one tier |

The key principle: **the step definition is the classifier**. No separate LLM call needed, no static lookup table, no process author annotation. The harness reads the step's own structure and derives the right model tier.

This extends naturally to cost pressure: when spend ceiling is approaching, the handler can systematically downgrade purposes that have review patterns (since the review catches quality issues) while protecting purposes where the output goes directly to humans.

## Implications

1. A new harness handler (`model-purpose-resolver`) should run before step-execution and set the resolved purpose on the context
2. This is engine-generic (any harness consumer benefits) → belongs in `packages/core/`
3. The handler resolves `ModelPurpose`, not a specific model — the existing `PURPOSE_ROUTING` table in the product layer handles provider+model selection
4. Process authors can still override via `config.purpose` on the step definition — the handler is a smart default, not a mandate
5. Trust tier becomes a cost lever: autonomous processes with high approval rates can safely use cheaper models, creating a compound benefit where earning trust also reduces cost

## Where It Should Land

- Brief for the `model-purpose-resolver` harness handler
- Extend `HarnessContext` with `resolvedModelPurpose` field
- Eventually absorb into architecture.md L2/L3 sections when proven in production
