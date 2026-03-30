# Insight-110: Streaming Text vs ContentBlock Rendering

**Date:** 2026-03-30
**Trigger:** Brief 054 e2e test failures — tests expected HTML headings from streamed markdown, but conversation text renders as plain `<span>` not through react-markdown
**Layers affected:** L6 Human (rendering), L2 Agent (output format)
**Status:** active

## The Insight

There are two distinct rendering paths for text in the conversation UI, and they produce fundamentally different output:

1. **Streamed text** (AI SDK `text-delta` parts) → `<span class="whitespace-pre-wrap">` — plain text, no markdown processing. This is what the `useChat` hook assembles from streaming chunks.

2. **ContentBlock text** (emitted as `data-content-block` custom parts) → dispatched to `TextBlockComponent` → rendered via `react-markdown` + `remark-gfm` → full HTML (headings, tables, code blocks, bold/italic, etc.).

The Self's direct conversational text flows through path 1. Tool results that produce `TextBlock` content blocks flow through path 2. This means the same markdown source renders differently depending on how it arrives at the UI.

This is not a bug — it's an intentional architectural boundary. Streamed text is the Self's voice (conversational, inline). ContentBlocks are structured output (formatted, block-level). The rendering distinction reinforces the semantic difference.

## Implications

- **E2E tests** must assert on plain text content for streamed responses, not HTML elements. Only ContentBlock rendering produces semantic HTML.
- **If rich markdown in conversation is desired**, the path is: emit ContentBlocks from the engine (via `content-block` stream events), not text-delta events. The mock LLM layer should model this distinction.
- **Future consideration:** a middleware that converts streamed text-delta parts to `TextBlock` ContentBlocks at the message level would unify rendering — but would lose the streaming character-by-character feel. Trade-off is UX responsiveness vs rendering richness.

## Where It Should Land

Architecture.md Layer 6 rendering section, when added. Also relevant to ADR-021 (Surface Protocol) — the two rendering paths should be documented as intentional.
