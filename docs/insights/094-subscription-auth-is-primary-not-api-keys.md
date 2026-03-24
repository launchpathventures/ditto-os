# Insight-094: Subscription Auth Is Primary, Not API Keys

**Date:** 2026-03-25
**Trigger:** Brief 039 build session — human feedback during web app setup design
**Layers affected:** L6 Human, L2 Agent (LLM provider)
**Status:** active — implemented in Brief 039 setup system

## The Insight

Most users already pay for an AI subscription (Claude Pro/Max, ChatGPT Plus/Pro). Requiring a separate API key as the first step is a second billing relationship and a friction wall. The setup experience must present subscription auth (via CLI tools like `claude` and `codex`) as the primary path, with API keys as the alternative.

This aligns with Insight-041 (users bring their own AI) but goes further: it's not just about provider choice, it's about **auth method choice**. The same provider (Anthropic) has two paths — subscription via Claude CLI and pay-per-use via API key. These are different products serving different users.

The user also wants the ability to mix connections: Claude subscription for Self conversation + Claude Code for dev process, or ChatGPT subscription for Self + Codex for heavy work. The setup configures the Self's primary connection; dev pipeline roles use whichever CLI tools are installed independently.

## Implications

- Setup page must auto-detect installed CLI tools and present them first
- `data/config.json` stores connection method, not just provider + key
- `DITTO_CONNECTION` env var distinguishes subscription CLI from API SDK
- The streaming adapter needs CLI subprocess providers alongside SDK providers
- Future: OpenClaw-style auth profile rotation (multiple auth methods per provider with fallback chains)

## Where It Should Land

- Architecture.md Layer 6 (Human Layer) — setup experience section
- Brief 039 constraints (already implemented)
- Future: ADR for auth profile management if complexity grows beyond 5 methods
