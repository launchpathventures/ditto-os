# Insight-062: Ditto Owns Its Execution Layer — No LLM Vendor Lock-In

**Date:** 2026-03-23
**Trigger:** Architect session on delegation weight classes. Creator challenged the Light/Heavy split, then the local-only assumption, then the Claude-default assumption. The thread revealed that `cli-agent` (Claude Code dependency) and the hardcoded Claude API default are both architectural debts that prevent provider choice, cloud deployment, and model optimization.
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L5 Learning
**Status:** archived — fully absorbed by Briefs 031 (Ditto Execution Layer), 032 (LLM Provider Extensibility), 033 (Model Routing Intelligence). All 7 items implemented. Moved to archived 2026-03-23.

## The Insight

Ditto's value is the harness — trust, routing, memory, feedback, review patterns, process governance. NOT the LLM. NOT the file tools. These are pluggable dependencies, not core value.

Three architectural debts emerged from the dogfood phase:

1. **`cli-agent` delegates execution to Claude Code** — a local-only, Claude-only tool. This creates vendor lock-in and prevents cloud deployment. Ditto should own its tool layer (read, write, search, exec) and call any LLM via API.

2. **`llm.ts` defaults to Claude** — `claude-sonnet-4-6` is hardcoded. The user must choose their LLM provider. There is no default. Ditto is provider-agnostic.

3. **No model routing intelligence** — The same model is used for every role. In reality, PM triage might work fine on a fast/cheap model, while Builder needs the most capable model. The Self should help find the optimal model for each role and process.

## The Execution Model

```
Ditto (Node.js app on VPS / cloud / local)
  ├── Harness: trust, memory, review, feedback (Ditto's core value)
  ├── Tools: read, write, search, exec (Ditto owns these)
  ├── LLM: user-configured provider (Anthropic, OpenAI, Ollama, etc.)
  └── Surfaces: Telegram, CLI, web
```

All roles use one execution path: Ditto's tools + user's chosen LLM. The deployment resolves which tool backend (local filesystem, GitHub API, MCP) and which LLM provider.

`cli-agent` (Claude Code) was a dogfood shortcut that bundled LLM + tools + terminal. Ditto must unbundle these and own each independently.

## Model Selection Architecture

Three levels of model configuration:

1. **User configures initial provider + model** at deployment time (env vars, setup wizard). There is no default — the user must choose. This model is used for the Self and as the initial default for all roles.

2. **Process definitions can declare model preferences** — optional `model` field on steps. "This Builder step benefits from the most capable model." "This PM step works fine with a fast model." These are hints, not mandates.

3. **The Self learns optimal routing** — The trust system already tracks quality per process/role. If model choice is recorded alongside quality metrics, the system learns: "PM with Haiku produces the same approval rate as PM with Opus, at 1/20th the cost." The Self recommends model routing; the human approves. This is ADR-014's cognitive architecture applied to model selection.

## The OpenClaw Parallel

OpenClaw deploys on a VPS with the user's Claude subscription. Users choose their model. Skills use MCP servers that OpenClaw runs. The agent framework owns the execution layer.

Ditto does the same — but with formal governance, provider agnosticism, and learned model routing. Ditto is the harness; the LLM is a replaceable dependency.

## Implications

- `llm.ts` must support multiple providers (Anthropic, OpenAI, Ollama) with no hardcoded default
- `tools.ts` must include write capabilities (write_file, potentially run_command) — Ditto owns its tools
- All 7 roles use `ai-agent` with Ditto's tools — no `cli-agent` dependency
- `cli-agent` can remain as an optional local optimization but is not architectural
- Process definitions declare capability needs, not execution modes
- Model routing is a learned capability of the harness, not a static configuration
- Deployment resolves: which LLM provider, which tool backend, which access method

## Where It Should Land

- Architecture.md L2 — reframe agent execution as "Ditto tools + pluggable LLM"
- `llm.ts` — multi-provider registry with no default (user must configure)
- `tools.ts` — extend with write capabilities
- ADR-012 update — model routing as a learned harness capability
- Roadmap — provider extensibility and model routing as capability items
- Brief 031 (revised) — the implementation plan for this transition
