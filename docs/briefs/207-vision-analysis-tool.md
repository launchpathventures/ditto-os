# Brief 207: Vision Analysis Tool (`content.analyze_image`)

**Date:** 2026-04-20
**Status:** draft
**Depends on:** ADR-026 (Multi-provider purpose routing) — already in place
**Unlocks:** Meaningful hired-agent value for Rob (photograph → extract data), receipt/invoice workflows, document OCR use cases
**Surfaced by:** Hermes coverage-check 2026-04-20 — vision is a real gap; Ditto generates images via `content.generate_image` but cannot analyze them

## Goal

- **Roadmap phase:** Cross-cutting tool surface expansion (not tied to a specific phase — unblocks value across multiple personas)
- **Capability delivered:** A built-in tool `content.analyze_image` that accepts an image reference (URL, asset id, or workspace file path) and returns structured text output — extraction, description, or question-directed analysis — via Anthropic's vision-capable models routed through ADR-026.

## Context

Ditto's current tool surface generates images (`content.generate_image` — Brief from GTM pipeline tooling) but cannot analyze them. This asymmetry blocks concrete user value:

- **Rob** photographs an invoice or a job-site material list and asks Ditto to extract line items. Today: impossible. With this tool: one process step.
- **Lisa** forwards a product shot and asks "*what's the text on this label?*" for compliance. Today: manual transcription. With this tool: one call.
- **Hired agents** (ADR-037) with domain scope — a Bookkeeper hired agent without image analysis is a half-useful hire. It can process text-entry expenses but not photographed receipts (the dominant real-world input for small businesses).

The underlying model capability is already available — ADR-026's purpose routing includes Anthropic's vision-capable models. This brief is thin — a new tool wrapper that routes through existing infrastructure.

## Objective

A hired agent or system agent can invoke `content.analyze_image` with an image reference and an analysis prompt, and receive structured text output within a single process step. The tool integrates with existing asset storage, credential resolution, and cost accounting.

## Non-Goals

- **Image generation** — separate tool (`content.generate_image`), already exists.
- **Multi-image batch analysis** — single image per call in v1. Batch is a follow-up if volume demands.
- **Video frame analysis** — images only. Video is out of scope.
- **OCR-only specialized fallback** — the Anthropic vision model handles OCR adequately for v1; specialized OCR (Tesseract, Google Cloud Vision) is a later optimization, not a prerequisite.
- **Privacy-sensitive local-only vision** — v1 ships cloud-routed analysis. An on-device model path is future work (if/when a privacy-tier persona requirement emerges).
- **Automatic image classification or tagging pipeline** — the tool is reactive; it analyzes what the caller asks for. No background scanning.

## Inputs

1. `docs/adrs/026-multi-provider-purpose-routing.md` — routing layer for vision-capable models
2. `docs/adrs/005-integration-architecture.md` — credential resolution patterns
3. `src/engine/tool-resolver.ts` — existing `content.generate_image` tool (pattern reference, lines ~462-555)
4. `src/engine/asset-storage.ts` — asset resolution (`getAssetPath`, `getAssetLocalPath`, `saveAsset`)
5. `packages/core/src/llm/` — LLM type contracts; vision-capable message shape
6. Anthropic SDK documentation for vision message format (image block type)

## Constraints

- **Engine-first discipline:** tool definition → `packages/core/src/tools/content/` (if a tools dir exists there; otherwise the pattern for core-shaped tools). Ditto-specific wiring (asset resolution, credential lookup) in `src/engine/tool-resolver.ts`.
- **Side-effecting function guard (Insight-180):** analyzing an image is non-side-effecting (read-only LLM call), so `stepRunId` is NOT required at the call boundary. But the tool MUST record a `cost_events` row per ADR-003 cost aggregation pattern.
- **Input size guard:** reject images > 5MB. Anthropic's vision API has its own limits; fail fast at Ditto's boundary with a clear error.
- **Credential scope:** uses the shared Anthropic API credential (ADR-005 credential store); no new credential type.
- **Input format:** accepts three image reference forms — (a) HTTPS URL, (b) workspace asset id (resolved via `asset-storage.ts`), (c) absolute local file path (dev only — rejected in hosted deployments). NOT: data URIs (base64-encoded inline), to avoid token-budget surprises and to keep the tool's contract legible.
- **Output shape:** `{ analysis: string, tokensUsed: { input, output }, model: string }`. Structured enough to be parsed by downstream steps; plain enough to be passed through to users.
- **Prompt passthrough:** the caller supplies the analysis prompt (e.g., *"Extract line items as JSON with columns: description, quantity, price"*). The tool does not mandate a prompt template — the hired agent or process step is responsible for task-specific framing.
- **SSRF guard:** HTTPS URLs must pass the same SSRF guard Ditto's browse_web tool uses (block localhost, RFC-1918, cloud metadata, .internal/.local). Reuse the existing helper if present; add a shared helper if not.

## Provenance

| What | Source | Level | Why this source |
|---|---|---|---|
| Tool-definition shape | Ditto `src/engine/tool-resolver.ts` `content.generate_image` | extend | Mirror-shape pattern; same namespace; same invocation contract |
| Vision message format | Anthropic SDK (image block type in messages API) | depend | Native support — no third-party wrapper |
| Model routing | ADR-026 purpose routing | extend | Route `purpose: "vision"` to a vision-capable model (Sonnet 4.6 or newer) |
| Asset resolution | Ditto `src/engine/asset-storage.ts` | extend | Already handles local + Supabase Storage resolution |
| SSRF guard | Ditto `src/engine/self-tools/browser-tools.ts` (Brief 134) | extend | Same protection semantics for any URL-accepting tool |
| Cost recording | Ditto `cost_events` pattern (ADR-003) | extend | Consistent cost accounting across all LLM-backed tools |

## What Changes (Work Products)

| File | Action |
|---|---|
| `src/engine/tool-resolver.ts` | Modify: add `"content.analyze_image"` tool definition (~80 LOC) with input validation, asset resolution, SSRF guard, Anthropic vision call, cost recording |
| `src/engine/tool-resolver.test.ts` | Modify: add ~8 tests (valid URL, valid asset id, invalid size, SSRF block, missing image, cost recorded, prompt passthrough, model fallback) |
| `src/engine/self-delegation.ts` | Modify: expose `content.analyze_image` as a Self-callable tool (if alignment with hired-agent tool scope demands it — deferred question in §Acceptance Criteria) |
| `packages/core/src/llm/` | Modify (minor): ensure vision-capable message shape types are exported for consumer use |
| `.env.example` | No change (uses existing `ANTHROPIC_API_KEY`) |

No new schema migrations. No new dependencies.

## User Experience

- **Jobs affected:** Capture (photographing → extracting), Review (verifying extracted data)
- **Primitives involved:** None directly user-facing in this brief. Tool is invoked by hired agents / process steps. User-facing surfaces emerge in follow-up work (e.g., a "Photo capture" composition intent that routes through this tool).
- **Process-owner perspective:** The user takes a photo, uploads it (existing `content.upload_asset` flow), and asks the hired agent to do something with it. The agent calls `content.analyze_image`, returns structured output, user reviews.
- **Interaction states:** N/A — this is tool-layer work. User-facing states emerge in the composition-intent briefs that consume this tool.
- **Designer input:** Not required for this brief — tool-layer only, no UI changes. Designer invocation for photo-capture composition intent would happen in a follow-up brief if/when one is scoped.

## Acceptance Criteria

1. [ ] `content.analyze_image` tool is registered in `src/engine/tool-resolver.ts` and appears in the tool registry.
2. [ ] Tool accepts `imageUrl`, `assetId`, OR `localPath` (exactly one of these) plus `prompt`; rejects calls with zero or multiple image references.
3. [ ] HTTPS URLs pass through SSRF guard; localhost / RFC-1918 / cloud-metadata / .internal / .local URLs are rejected with a structured error before any network call.
4. [ ] Asset ids are resolved via `asset-storage.ts`; missing assets fail with a structured error.
5. [ ] Local paths are accepted only when `DITTO_DEPLOYMENT_MODE` is not `workspace` (dev only); rejected in hosted deployments.
6. [ ] Images > 5MB are rejected before API call with a size-exceeded error.
7. [ ] Tool calls Anthropic's vision-capable model via ADR-026 purpose routing with `purpose: "vision"`.
8. [ ] Response shape is `{ analysis: string, tokensUsed: { input: number, output: number }, model: string }`.
9. [ ] A `cost_events` row is recorded per call with correct `input_tokens`, `output_tokens`, `model`, `biller: "anthropic"`, and `billing_type: "api"`.
10. [ ] Tool-level tests cover: URL path, asset path, localPath in dev, localPath rejected in workspace mode, SSRF block, size guard, missing asset error, token-cost recording.
11. [ ] Type-check passes cleanly at root (`pnpm run type-check`).
12. [ ] Smoke test: take a photo of a receipt, upload via `content.upload_asset`, call `content.analyze_image` with prompt `"Extract line items as JSON"`, verify structured output is returned.

**Open question (resolve at build start, not blocking):** should this tool be registered as a Self-callable tool via `self-delegation.ts`, or exposed only through process-step tool scopes (ADR-037 agent `scope` field)? Default: expose to Self (maximizes utility); architect may override at build start if hired-agent scope framing suggests narrower surfacing.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief
2. Review agent checks:
   - SSRF guard behaves identically to `browse_web`'s guard (no drift)
   - Cost recording aligns with ADR-003 patterns
   - Engine/product boundary respected
   - No Anthropic-SDK-specific types leak into `packages/core/` beyond what's already exported
   - Deployment-mode gating on local paths works end-to-end
   - No credential values are logged
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start workspace
pnpm dev

# 2. Upload test image (a photo of a receipt or invoice)
# Via UI or CLI: pnpm ditto asset upload ./test-fixtures/receipt.jpg

# 3. Invoke tool via Self or CLI
# (tool invocation path TBD at build time — likely via `pnpm ditto agent invoke content.analyze_image --asset-id <id> --prompt "Extract line items as JSON"`)

# 4. Verify structured output
# Expected: { analysis: "[{...line items...}]", tokensUsed: {...}, model: "claude-sonnet-4-6" }

# 5. Verify cost event recorded
pnpm ditto cost list --last 1
# Expected: one row with purpose "vision", provider anthropic, input_tokens > 0, output_tokens > 0
```

## After Completion

1. Update `docs/state.md` — add to Recently Completed; flag that the "Vision gap" from the Hermes coverage-check 2026-04-20 is closed
2. Update `docs/landscape.md` if Anthropic vision routing patterns revealed anything worth re-recording
3. Capture any insights that emerged (e.g., consistent tool-shape conventions for LLM-backed tools — there's a meta-pattern across `generate_image`, `analyze_image`, `browse_web` worth naming if one emerges)
4. Phase retrospective
5. Move brief to `docs/briefs/complete/`

## Sizing Note (Insight-004 Compliance)

12 acceptance criteria, one subsystem (tool-resolver), extends existing ChannelAdapter-style patterns. Well within the 8-17 AC band. Independently testable, independently shippable. One build session.
