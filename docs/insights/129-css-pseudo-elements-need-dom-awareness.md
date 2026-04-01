# Insight-129: CSS ::after pseudo-elements need DOM structure awareness

**Date:** 2026-04-01
**Trigger:** Brief 065 — streaming cursor `::after` on a `<div>` wrapping Streamdown's block-level output rendered below text instead of inline at the end
**Layers affected:** L6 Human
**Status:** active

## The Insight

CSS `::after` pseudo-elements on block containers with block-level children (e.g., `<p>` tags from markdown renderers) do NOT appear inline at the end of text — they appear on a new line after the last block child. This is a fundamental CSS rendering behavior that catches developers when third-party components render fragment-style block elements.

When the target element contains only text nodes (no child elements), `::after` correctly appears inline. When it contains block children, the pseudo-element needs to target the last child's `::after` instead.

The fix pattern: use compound selectors — `.container > :last-child::after` for block content, `.container:not(:has(> *))::after` for text-only content. The `:has()` selector (CSS4) enables clean discrimination between these cases without JavaScript.

## Implications

Any future animation or visual indicator using `::after` on containers that wrap third-party components (Streamdown, react-markdown, etc.) must consider the rendered DOM structure. Block-level children break the naive `container::after` pattern.

## Where It Should Land

Brief constraints for any future work involving CSS pseudo-elements on component wrappers. Not architectural — too specific for architecture.md. Useful as a build reference.
