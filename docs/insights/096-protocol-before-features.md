# Insight-096: Protocol Layer Before Feature Layer

**Date:** 2026-03-25
**Trigger:** Architecture audit of AI SDK usage + component rendering systems. Found three disconnected rendering vocabularies (conversation, feed, process output) that would compound with every subsequent brief.
**Layers affected:** L2 Agent (Self output format), L6 Human (surface rendering)
**Status:** active — landing in Brief 045

## The Insight

When building an AI-agent-powered workspace, the rendering protocol (how typed content flows from engine to surface) must be established before feature briefs that produce rich content. Without it, each feature invents its own rendering pipeline, creating divergence that is expensive to retrofit.

Specifically: ADR-021 (Surface Protocol) and ADR-009 (Process Output Architecture) designed the right abstractions — 13 typed content blocks, catalog-constrained rendering, per-surface renderers. But the build briefs (039-042) shipped pragmatic implementations that bypassed the protocol for velocity. This produced three disconnected type systems (conversation data events, feed discriminated union, raw JSON process outputs) that all need to render the same underlying things.

The signal: when the next two briefs (043 proactive engine, 044 onboarding) both need to render rich inline content in conversation, and neither has a composable way to do it.

## Implications

- **Build order matters for infrastructure briefs.** Feature velocity is real, but protocol debt compounds faster than code debt — every feature that ships without the protocol creates a migration surface.
- **SDK alignment is architecture.** AI SDK v5's parts system is essentially our ContentBlock protocol with streaming support. Using v4 and hand-rolling the protocol was a form of NIH that creates maintenance burden.
- **Audit existing systems before adding features.** The three-system divergence was invisible until audited. Regular protocol audits (every 3-4 briefs) would catch this earlier.

## Where It Should Land

Absorbed into Brief 045 (Component Protocol). The principle should be referenced in `docs/dev-process.md` as a checkpoint: before any brief that adds a new content type, verify it composes with the existing protocol.
