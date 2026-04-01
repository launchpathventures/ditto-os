# Brief 068: Confidence & Trust Card

**Date:** 2026-04-01
**Status:** draft
**Depends on:** Brief 067 (Reasoning Verification Evidence — outcome-oriented activity headers, ToolDisplayLabel extensions)
**Unlocks:** Trust-tier modulation (future), "Teach this" integration (future), historical confidence tracking (future)

## Goal

- **Roadmap phase:** Phase 11: Chat UX & Experience
- **Capabilities:** Structured confidence assessment on Self responses; uncertainty-first trust signals for outcome owners; three-tier visibility model (response → confidence card → activity trace)

## Context

Brief 067 improved activity group headers from developer-oriented ("5 steps — read file (2x)") to outcome-oriented ("Checked 3 sources — files"). But the expanded content still dumps raw tool call traces. For Rob checking a quote from his truck, seeing "✓ Reviewed file · docs/roadmap.md" repeated 6 times builds zero trust — it's noise.

User feedback: *"The purpose of revealing the thinking is to build trust. Most importantly, I'd love to see the confidence evaluation and what the AI thinks it got wrong or needs further clarification on."*

This is Problem 5 from personas.md: *"Every output shows what was checked. Confidence scores per item. Evidence trails with source links."*

Two insights crystallised during Brief 067's design evolution:
- **Insight-127:** Trust signals, not activity traces — confidence and uncertainty are the real value
- **Insight-128:** Uncertainty is more valuable than evidence — for outcome owners, uncertainty is the actionable signal, evidence is the backdrop

No competing AI product shows structured uncertainty to non-technical users. This is competitive differentiation.

## Objective

The Self produces a structured confidence assessment alongside every tool-assisted response. The web UI renders this as a Confidence Card — collapsed for high confidence, auto-expanded for medium/low — showing uncertainties first, evidence second, with activity traces as a tertiary audit layer.

## Non-Goals

- **Trust-tier modulation** — supervised processes showing more/less detail based on trust level (future brief)
- **"Teach this" integration** — user identifying recurring uncertainties to improve processes (future brief)
- **Historical confidence tracking** — confidence trends over time per process (future brief)
- **Team-level confidence dashboard** — Nadia's aggregate quality view (future brief)
- **Composition-context confidence** — Today/Inbox/briefing confidence summaries (deferred until composition engine uses them)
- **Numerical confidence scores** — outcome owners calibrate on "should I scrutinize?" not "83% vs 87%"

## Inputs

1. `docs/research/confidence-trust-card-ux.md` — Designer's full interaction spec with persona tests, wireframes, and 7 UX constraints
2. `docs/insights/127-trust-signals-not-activity-traces.md` — three-tier trust model rationale
3. `docs/insights/128-uncertainty-more-valuable-than-evidence.md` — uncertainty-first hierarchy
4. `src/engine/self-stream.ts` — SelfStreamEvent types, conversation loop, tool→block mapping
5. `src/engine/content-blocks.ts` — ContentBlock discriminated union (22 types), FieldAnnotation patterns
6. `packages/web/components/ai-elements/message.tsx` — current AssistantParts rendering, ActivityGroup component
7. `packages/web/components/ai-elements/chain-of-thought.tsx` — ChainOfThoughtHeader variant system
8. `packages/web/lib/data-part-schemas.ts` — 4 existing Zod data part schemas
9. `packages/web/app/api/chat/route.ts` — SelfStreamEvent → UIMessageStream mapping
10. `docs/adrs/021-surface-protocol.md` — Self emits typed blocks, surfaces render

## Constraints

- **Confidence is response-level metadata, not a ContentBlock.** It describes the response itself, not a discrete piece of content within it. The card is conversation chrome rendered by the Message component. This is the first intentional exception to the "all rendering through ContentBlocks" rule (architecture.md). The rationale: ContentBlocks are discrete content units that can appear independently in composition intents (Today, Inbox). Confidence cannot — it only makes sense attached to the response it describes. If composition contexts later need confidence summaries across process runs, a `ConfidenceBlock` ContentBlock variant can be added then. This precedent is captured in Insight-129.
- **Uncertainty must be specific and actionable.** "Medium confidence" alone is useless. Each caveat must say WHAT is uncertain and WHY — "Q4 pricing unavailable — used Q3 estimates" not "some data may be stale."
- **No second thinking phase.** Confidence assessment happens in-band with the Self's conversation loop, not as a separate post-response evaluation. The card resolves when streaming completes.
- **Conservative by default.** Better to show "Medium" when the answer is fine than "High" when there's an issue. False negatives (missed uncertainty) damage trust permanently. The engine applies heuristic floor rules that override the LLM's self-assessment when tool results indicate problems — LLMs are weakest at self-assessing uncertainty, so the engine provides a safety net.
- **Card only appears when tools were called.** Conversational replies (no tool activity) show no card — the response speaks for itself. Users must not learn to ignore the signal. Note: the Designer spec's Constraint 1 ("confidence must be present on every response") and Constraint 6 ("conversational responses do NOT show the card") contain an internal contradiction. Constraint 6 takes precedence — "every response" in Constraint 1 means "every tool-assisted response." Showing confidence on a conversational reply like "What is a process?" would train users to ignore the signal entirely.
- **One card per response.** Each assistant message gets at most one confidence card.
- **Composability through blocks (existing principle).** The confidence card does NOT bypass the ContentBlock system for rendered data. The metadata feeds a UI component; any blocks the card renders internally come from existing block types.
- **No new design tokens.** Uses existing `.impeccable.md` tokens: `positive`, `caution`, `negative`, `text-muted`, `surface-raised`, `vivid-deep`.
- **Preserve Brief 067 work.** Activity group headers, auto-close, ToolDisplayLabel extensions remain. The confidence card sits above the response; the activity trace sits behind "View activity trace" within the card.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Structured confidence output | Claude adapter existing `CONFIDENCE: high\|medium\|low` parsing | pattern | Self already extracts confidence from response text; this formalises it as structured data with checks/uncertainties |
| Three-tier visibility | Insight-126/127/128 | Original | No competitor implements uncertainty-first trust signals |
| Auto-expand by confidence | Perplexity sources-first | pattern | Evidence before conclusion; Ditto extends to uncertainty before conclusion |
| Collapsible disclosure | AI SDK `<Reasoning>` component | pattern | ChainOfThought already implements this; confidence card uses same controlled open/close pattern |
| Qualitative confidence levels | Insurance straight-through processing | pattern | Three-band routing (auto/review/escalate) maps to high/medium/low |
| Response-level metadata | AI SDK v6 data parts | depend | Custom data part `data-confidence` uses existing `dataPartSchemas` pattern |
| Streaming progress indicator | Brief 067 ActivityGroup | adopt | Reuse shimmer + runningOutcome during streaming; resolve into card on completion |

## What Changes (Work Products)

### Engine (L2)

| File | Action |
|------|--------|
| `src/engine/self-stream.ts` | Modify: Add `assess_confidence` tool definition to Self's tool list. Add `ConfidenceAssessment` type. Emit new `confidence` SelfStreamEvent after final tool turn completes. |
| `src/engine/self-tools/assess-confidence.ts` | Create: Tool implementation that returns structured `{ level, summary, checks[], uncertainties[] }`. Invoked by Self as final tool call when tool activity occurred. |
| `src/engine/content-blocks.ts` | Modify: Export `ConfidenceAssessment` type (not a ContentBlock — a standalone type for response metadata). |

### API Route

| File | Action |
|------|--------|
| `packages/web/app/api/chat/route.ts` | Modify: Map `confidence` SelfStreamEvent → `data-confidence` custom data part. |
| `packages/web/lib/data-part-schemas.ts` | Modify: Add `data-confidence` Zod schema to `dataPartSchemas`. |

### Web UI (L6)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/confidence-card.tsx` | Create: ConfidenceCard component with collapsed/expanded states, auto-expand logic, uncertainty-first rendering, activity trace gateway. |
| `packages/web/components/ai-elements/message.tsx` | Modify: Extract confidence data part from message parts. Render ConfidenceCard above response content when present. Wire streaming progress → card resolution transition. |
| `packages/web/components/ai-elements/index.ts` | Modify: Export ConfidenceCard. |

## Architecture: How Confidence Assessment Works

### The Self's Confidence Tool

The Self already has 18 tools. Add a 19th: `assess_confidence`. This is NOT a standalone system agent or post-processing step — it's a Self tool that the Self calls as part of its conversation loop.

**Why a tool, not prompt engineering?**
- Tools produce structured output (JSON schema enforced by LLM tool calling). Prompt engineering produces prose that needs parsing.
- The existing `CONFIDENCE: high|medium|low` text parsing in the Claude adapter is fragile and produces no checks/uncertainties.
- A tool call appears in the Self's tool use loop naturally — no special-casing needed.
- The Self can decide whether to call it (it should always call it when other tools were called, but the LLM makes this decision vs hardcoded logic).

**Why not a structured-text-suffix hybrid?**
The Self already parses `CONFIDENCE: high|medium|low` from response text. A richer structured suffix (e.g., JSON block at the end of the response) could avoid the extra tool turn. However: (a) LLMs produce unreliable JSON in free text — tool calling enforces schema compliance, (b) parsing confidence from prose couples the API route to prompt format details, (c) the tool approach is the established pattern in Ditto (18 existing tools), and (d) the suffix approach can't be streamed independently — the confidence data only arrives at the very end of the text stream, whereas a tool result emits a discrete event the UI can act on immediately.

**Why not a separate evaluator agent?**
- Latency: a second LLM call after the response delays delivery. Constraint 3 from the Designer spec: "must not significantly delay the response."
- Context: the Self already has the full context of what it checked and what it's uncertain about. A separate agent would need the same context passed to it.
- Cost: double the inference for every response.

**Latency cost of the tool approach:** The `assess_confidence` tool call adds one extra tool turn to the conversation loop — the LLM decides to call it, the tool executes (instant — it just returns the structured data), and the LLM produces the final text response incorporating the assessment. This adds ~1-3 seconds depending on model speed. This is acceptable because: (a) the user sees continuous streaming progress throughout (shimmer + runningOutcome labels), (b) the confidence card resolves the moment the tool result arrives — before the final text response begins, and (c) the alternative (separate evaluator) adds 5-10 seconds with no streaming.

### Tool Schema

```typescript
interface ConfidenceAssessment {
  level: "high" | "medium" | "low";
  summary: string;  // "Checked pricing, project history, margins"
  checks: Array<{
    label: string;    // "Henderson project history"
    detail: string;   // "2 similar quotes found"
    category: string; // "knowledge" | "files" | "code" | "web" | "processes"
  }>;
  uncertainties: Array<{
    label: string;    // "Q4 copper pricing unavailable"
    detail: string;   // "Used Q3 estimates — verify before sending"
    severity: "minor" | "major";
  }>;
}
```

The Self calls `assess_confidence` as its final tool call when tool activity occurred during the conversation turn. The tool returns the structured assessment. The engine emits it as a `confidence` SelfStreamEvent.

### System Prompt Guidance

The Self's system prompt (in `cognitive/self.md`) gets a section on confidence assessment:

> After completing tool-assisted work, assess your confidence in the response. Call `assess_confidence` with:
> - **level:** "high" if all data is current and complete, "medium" if some data is stale or assumptions were made, "low" if critical data is missing or significant assumptions were needed.
> - **checks:** what you verified, in outcome language the user understands (not file paths or tool names).
> - **uncertainties:** what the user should watch out for, with specific actionable detail. Be conservative — flag anything that could affect the user's decision.
> - Do NOT call this tool for conversational responses where no tools were used.

### Data Flow

```
Self conversation loop
  → Tool calls execute (search_knowledge, get_process, etc.)
  → Self calls assess_confidence (structured output)
  → Engine emits SelfStreamEvent { type: "confidence", assessment: ConfidenceAssessment }
  → API route maps to data-confidence custom data part
  → useChat receives as message part { type: "data-confidence", data: ConfidenceAssessment }
  → Message component extracts confidence part, renders ConfidenceCard
```

### SelfStreamEvent Extension

```typescript
// Added to existing union in self-stream.ts
| { type: "confidence"; assessment: ConfidenceAssessment }
```

This follows the same pattern as `{ type: "credential-request"; ... }` and `{ type: "structured-data"; ... }` — typed event with structured payload.

### Engine-Level Heuristic Floor

LLMs are weakest at honest self-assessment — they tend toward confident answers, not cautious ones. The engine applies heuristic overrides to the `assess_confidence` tool result before emitting the `confidence` event:

| Condition | Override |
|-----------|----------|
| All tool calls returned errors | Force `level: "low"`, inject uncertainty: "Multiple tool calls failed — response may be unreliable" |
| `search_knowledge` returned zero results | Inject uncertainty: "No matching knowledge found — response based on general knowledge only" |
| Any tool call timed out | Inject uncertainty: "{tool} timed out — results may be incomplete" |
| Self did NOT call `assess_confidence` despite tool activity | Engine synthesizes a default assessment: `level: "medium"`, summary from tool categories, uncertainty: "Confidence not explicitly assessed" |

These heuristics provide a floor below which the LLM's self-assessment cannot drop. They do not raise confidence — only lower it or add uncertainties. The LLM can still assess lower than the floor.

## User Experience

- **Jobs affected:** Review ("Should I trust this?"), Decide ("What should I watch out for?"), Orient ("What was this based on?")
- **Primitives involved:** ChainOfThought (activity trace tier), ConfidenceCard (new AI Element)
- **Process-owner perspective:** The user sees a quiet green dot when everything checks out (glance and move on), an amber card with specific caveats when something needs attention (read before the response), or a red card when the response shouldn't be trusted without checking. The confidence card is a pre-review summary — it tells the user exactly where to focus judgment.
- **Interaction states:**
  - **Streaming (tools running):** Shimmer + "Checking your quoting data..." — reuses Brief 067 ActivityGroup progress
  - **Streaming complete, high confidence:** Progress resolves to collapsed card: `● High confidence · Checked 3 sources`
  - **Streaming complete, medium confidence:** Progress resolves to auto-expanded card with uncertainties prominent
  - **Streaming complete, low confidence:** Card always expanded, strong visual signal
  - **Error:** Card expanded with failure details + "The response below may not be reliable"
  - **User toggle:** Collapse/expand respected regardless of auto-state (Insight-124)
  - **No tools called:** No card rendered — response only
- **Designer input:** Full interaction spec at `docs/research/confidence-trust-card-ux.md` — includes persona tests for Rob, Lisa, Jordan, Nadia, mobile wireframe, competitive differentiation table, auto-expand behaviour rules, split visual treatment (hero-moment for auto-expand, typographic for user-expand).

### Visual Treatment

**Collapsed (high confidence — most common):**
```
▸ ● High confidence · Checked pricing, project history, margins
```
Single line. `text-muted`. `positive`-colored 8px dot. Chevron. Min-height 44px.

**Auto-expanded (medium/low — hero moment):**
`surface-raised` background + `rounded-xl` + left `vivid-deep` border. Uncertainties first with `caution` icon, then checks with `positive` icon.

**User-expanded (high confidence, tapped to inspect):**
Typographic only — `border-left: 2px solid var(--vivid-deep)` + padding. No surface container. Anti-card principle applies.

## Acceptance Criteria

1. [ ] `ConfidenceAssessment` type exported from `src/engine/content-blocks.ts` with `level`, `summary`, `checks[]`, `uncertainties[]` fields
2. [ ] `assess_confidence` tool defined in Self's tool list with JSON schema matching `ConfidenceAssessment`
3. [ ] Self's system prompt instructs confidence assessment after tool-assisted responses (conservative bias)
4. [ ] Engine emits `{ type: "confidence", assessment }` SelfStreamEvent when `assess_confidence` tool result is received
5. [ ] API route maps `confidence` event to `data-confidence` custom data part
6. [ ] `data-confidence` Zod schema added to `dataPartSchemas` in `data-part-schemas.ts`
7. [ ] `ConfidenceCard` component renders collapsed state: 8px dot (semantic color), level label, summary text
8. [ ] `ConfidenceCard` auto-expands for medium/low confidence, stays collapsed for high
9. [ ] Expanded card shows uncertainties first (caution icon), then checks (positive icon), in outcome language
10. [ ] "View activity trace" link within expanded card reveals existing tool/reasoning data (Brief 067 activity group content)
11. [ ] Card only appears on messages where tool-invocation parts exist; conversational replies show no card
12. [ ] User can collapse/expand regardless of auto-state; manual toggle is respected (Insight-124)
13. [ ] During streaming, card position shows shimmer progress; resolves to confidence card when streaming completes
14. [ ] Mobile: collapsed card is 44px min-height touch target; expanded card truncates to uncertainties + count if >5 items
15. [ ] Auto-expanded card uses `surface-raised` + `rounded-xl` + `vivid-deep` border; user-expanded uses typographic `border-left` only
16. [ ] Engine applies heuristic floor: all-tool-errors forces low confidence; zero knowledge results injects uncertainty; missing `assess_confidence` call synthesizes default medium assessment

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/research/confidence-trust-card-ux.md`
2. Review agent checks:
   - Does `ConfidenceAssessment` avoid ContentBlock coupling? (metadata, not block)
   - Does the Self tool approach avoid latency overhead vs separate evaluator?
   - Does the data flow follow ADR-021 surface protocol patterns?
   - Does the UI respect .impeccable.md anti-card principle (split visual treatments)?
   - Are all 7 Designer UX constraints satisfied?
   - Is the Self system prompt guidance conservative enough (false negatives worse than false positives)?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the dev server
pnpm dev

# 2. In the web UI, ask a question that triggers tool use:
#    "What processes do I have?"
#    Expected: Self calls list_processes → assess_confidence
#    Expected: Confidence card appears above the response
#    Expected: High confidence → collapsed green dot + summary

# 3. Ask a question with uncertainty:
#    "Draft a quote for Henderson's bathroom renovation"
#    Expected: Medium confidence → auto-expanded amber card
#    Expected: Uncertainties listed first with caution icons
#    Expected: Checks listed below with positive icons

# 4. Ask a conversational question (no tools):
#    "What is a process?"
#    Expected: No confidence card rendered

# 5. Verify type safety:
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with confidence card implementation status
2. Update `docs/roadmap.md` — add "Structured confidence assessment" row to Phase 11
3. Update `docs/human-layer.md` — add ConfidenceCard to AI Elements component list
4. Update `docs/architecture.md` — note that `ConfidenceAssessment` is exported from `content-blocks.ts` as a standalone type for response metadata, NOT added to the `ContentBlock` discriminated union. The "22 ContentBlock types" count is unchanged. Note the response-metadata rendering pathway as distinct from the ContentBlock rendering pathway (Insight-129).
5. Update Insight-127 status to "addressed by Brief 068"
6. Phase retrospective: first engine feature driven by user feedback → designer spec → architect brief pipeline
