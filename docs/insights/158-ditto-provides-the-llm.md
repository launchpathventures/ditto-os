# Insight-158: Ditto Provides the LLM Service

**Date:** 2026-04-06
**Trigger:** Attempting to get Claude CLI authenticated on a Railway server for end users. Researching OpenClaw/NVIDIA deployment models. Discovering Anthropic banned third-party use of Max subscription OAuth tokens (Feb 2026, enforced Apr 2026).
**Layers affected:** All layers — fundamental infrastructure decision
**Status:** active

## The Insight

Ditto provides the LLM as part of the service. Users pay Ditto. Ditto pays the LLM providers. The provider abstraction is internal infrastructure, not user-facing configuration.

Every successful AI product works this way: Cursor, Notion AI, Perplexity, ChatGPT. None of them ask users to paste API keys as the default path. The product "just works."

The prior design ("no vendor lock-in, users choose their provider, Claude CLI for Max plan") was built for the developer building Ditto, not for the end user. The CLI adapter was dogfooding tooling. Anthropic explicitly banned third-party tools from using Max subscription OAuth tokens (February 2026, enforced April 2026). Every tool in the ecosystem (OpenClaw, Cursor, Continue, Windsurf, Cody) uses BYOK API keys, not consumer subscriptions.

## What This Means

1. **Ditto holds API keys for Anthropic, OpenAI, and Google.** Multi-provider. Routes to the best model per task (Insight-157).
2. **Users never see API keys, provider config, or model selection.** Zero config. The product works on signup.
3. **LLM cost is part of Ditto's operating cost.** Managed through subscription pricing, usage tiers, or margins — a business decision, not an architecture decision.
4. **BYOK as a power-user option.** Self-hosted or enterprise users can override with their own keys. But it's an escape hatch, not the default path.
5. **The CLI adapter stays for development.** It's how the builder (you) uses Ditto with your own Max plan during development. It's not a user-facing feature.

## What This Supersedes

- Memory: `feedback_no_vendor_lockin.md` — "Claude API must not be the default. Users choose their LLM provider." → Superseded. Users don't choose. Ditto chooses.
- Memory: `feedback_ditto_owns_execution.md` — "Ditto owns its tools and calls any LLM via API." → Still true, but Ditto manages the keys, not the user.

## Where It Should Land

Architecture.md infrastructure section. ADR for multi-provider managed routing. `.env.example` updated with multi-provider keys (Ditto-managed, not user-facing). Onboarding flow: zero LLM config required.
