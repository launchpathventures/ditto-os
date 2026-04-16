# Brief: Social Channel Ghost Mode — Parent Design

**Date:** 2026-04-11
**Status:** complete
**Depends on:** Brief 124 (ghost mode email — identity resolution, voice calibration, cognitive mode, trust gate)
**Unlocks:** Ghost-mode LinkedIn DMs, WhatsApp messages, Instagram DMs; browser-based prospect research

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Social channel ghost sending, browser-based research, unified messaging infrastructure

## Context

Brief 124 built ghost mode for email: identity resolution, voice calibration, cognitive mode, trust gate, and email formatting. The infrastructure is channel-agnostic — the harness doesn't care whether the message goes out via email or LinkedIn DM. What's missing is the social channel delivery layer and browser-based research capabilities.

Research (docs/research/linkedin-ghost-mode-and-browser-automation.md) identified three viable approaches. The recommended path: (1) Unipile as a unified messaging API for social channel sending (same pattern as AgentMail for email), and (2) Stagehand as a general browser skill for Alex (research, data extraction, navigation — separate from channel sending).

LinkedIn's official API does not support DM sending to arbitrary users. All third-party solutions use unofficial/session-based approaches, creating inherent platform risk regardless of path.

## Objective

Alex can send ghost-mode messages on LinkedIn, WhatsApp, Instagram, and Telegram via a unified messaging API, and can research prospects via browser automation — with all existing ghost-mode infrastructure (trust gate, voice calibration, identity resolution) working unchanged.

## Non-Goals

- Building custom browser automation for LinkedIn sending (use unified API instead)
- Supporting Expandi or other SaaS tools that don't allow per-message text control
- Full domain delegation on social platforms (not applicable — social accounts are user-owned)
- Real-time chat on social platforms (async messaging only)
- Browser automation for sending (browser skill is for research, not outbound delivery)

## Architecture

Two independent workstreams, no dependency between them:

**Workstream A — Unified Social Channel Adapter (Brief 133):**
- Validate Unipile as the messaging API via a time-boxed spike
- If validated: build `UnipileAdapter implements ChannelAdapter` with `channel: "social"`
- Extend `ChannelAdapter.channel` union type to include `"social"`
- Register Unipile credentials via ADR-005 credential vault pattern
- Social ghost sends traverse the same harness pipeline as email (identity-router → voice-calibration → trust-gate → outbound-quality-gate → send)
- Fallback plan: HeyReach ($79/mo) for LinkedIn-only if Unipile validation fails

**Workstream B — Browser Research Skill (Brief 134):**
- Adopt Stagehand (TypeScript, MIT, Playwright-based) as a self-tool
- Implement as `browse_web` tool available to Alex for research, data extraction, profile viewing
- This is a Layer 2 agent capability, not a channel adapter
- Browser skill runs in headless mode, no persistent LinkedIn session needed for research
- Tool calls traverse harness integration dispatch per ADR-005

## Sub-Briefs

| Brief | Title | Depends on | Unlocks |
|-------|-------|-----------|---------|
| 133 | Unipile Social Channel Spike + Adapter | Brief 124 | Ghost-mode social DMs |
| 134 | Stagehand Browser Skill for Alex | None (independent) | Web research, LinkedIn profile extraction |

## Review Process

Each sub-brief has its own review cycle. This parent brief is the coherent design reference.
