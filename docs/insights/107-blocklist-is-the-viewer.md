# Insight-107: BlockList IS the Viewer

**Date:** 2026-03-29
**Trigger:** Brief 050 build — replacing artifact host placeholder with BlockList rendering proved that bespoke viewer components are unnecessary
**Layers affected:** L6 Human (rendering), L2 Agent (output format)
**Status:** active

## The Insight

The block registry eliminates the need for bespoke artifact viewer components. When the artifact host renders `BlockList` from engine-fetched `ContentBlock[]`, every content type gets the same rendering quality regardless of surface (conversation, feed, canvas, artifact mode). The "viewer taxonomy" from ADR-023 (document, spreadsheet, image, preview, email, PDF) becomes a metadata label, not a rendering dispatch — the viewer IS the BlockList.

This was validated by Brief 050: a "document viewer" is just `BlockList` rendering `TextBlock` (markdown) and `CodeBlock` entries. No special document component was needed. The same blocks that render inline in conversation render full-width in artifact mode's centre column — the only difference is the container's max-width.

## Implications

- Future artifact types (spreadsheet, image, PDF) should be modeled as new block types, not new viewer components. A "spreadsheet viewer" is `InteractiveTableBlock` rendered in artifact mode. A "PDF viewer" is a hypothetical `PdfBlock` in the registry.
- The Live Preview viewer (Insight-104) is the one exception — it needs an iframe sandbox, which is genuinely different from block rendering. This is the only case where a bespoke component is justified.
- The `ArtifactType` enum is useful for context panel metadata and toolbar labeling, but should NOT drive a viewer component switch.

## Where It Should Land

ADR-023 Section 3 (viewer taxonomy) — add a note that viewers are BlockList compositions, not bespoke components, with Live Preview as the sole exception. Architecture.md Layer 6 if a "rendering philosophy" section is added.
