# Insight-088: Document Understanding Is a First-Class Capability Gap

**Date:** 2026-03-24
**Trigger:** Architecture validation against 6 real businesses — 5 of 6 require document processing (PDF brochures, construction plans, broker submissions, client documents, architectural drawings)
**Layers affected:** L2 Agent (tool infrastructure), L1 Process (input types)
**Status:** active

## The Insight

Almost every real-world Ditto process starts with a document, not a text prompt. Steven drops a PDF brochure. Rawlinsons upload construction plans. Delta receives broker submissions in mixed formats. FICO collects visa documents needing validation. Abodo gets architectural drawings for quantity takeoff.

The current agent tools (`read_file`, `search_files`, `list_files`, `write_file`) are designed for code — they read text files and search code. Real users need agents that can parse PDFs, extract tables, analyze images of architectural plans, validate document formats, and check document attributes (not expired, correctly certified).

This is not a "nice-to-have" integration. It is load-bearing for the first real user. Without document understanding, the Self can't accept the inputs that real processes start with.

## Implications

- Document understanding should be added as agent tools (`parse_document`, `analyze_image`, `extract_table`) — not a new executor type. Tools are the right abstraction because document processing happens within an agent's reasoning loop, not as a standalone step.
- Multiple backend services may provide document understanding (Claude vision, Google Document AI, Azure Form Recognizer). The integration registry pattern handles this — register the service, the tool resolves to it.
- Process definitions may need an `input_types` declaration beyond text: `document`, `image`, `audio`, `data` — so the Self knows what kind of input a process expects and can route appropriately.

## Where It Should Land

- Architecture.md Layer 2: add document understanding tools to the agent tool infrastructure
- Agent tools (`src/engine/tools.ts`): new tool types for document processing
- Integration registry: document AI services as registered integrations
- Brief for Phase 10+: document understanding as a build item
