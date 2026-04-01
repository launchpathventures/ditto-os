# Brief: Reasoning Display — Verification Evidence Reframe

**Date:** 2026-03-31
**Status:** draft
**Depends on:** Brief 065 (conversation core feel — delivers activity grouping, compact tool display, reasoning content streaming)
**Unlocks:** Future: trust-tier modulated reasoning visibility, anomaly elevation, engine-side contextual labels

## Goal

- **Roadmap phase:** Phase 11: Chat UX & Experience
- **Capabilities:** Reasoning visibility, chain-of-thought display, trust-building through verification evidence

## Context

Brief 065 shipped the mechanics: activity grouping into ChainOfThought sections, compact tool step display, reasoning content streaming. But the **framing** is developer-oriented. Headers say "Thought for 7s" and "5 steps — read file (2x), searched code." Expanded groups show raw tool I/O.

Ditto's personas (Rob, Lisa, Jordan, Nadia) are outcome owners, not developers. They don't care HOW the AI thought — they care WHAT it checked and WHETHER they should trust the result. The Designer's research (Insight-126) identifies the core reframe: **reasoning display should be verification evidence, not thinking trace.**

The competitive audit shows every product (Claude.ai, ChatGPT, Cursor, Perplexity) frames reasoning for technical users. Ditto's differentiation is framing it for outcome owners. Perplexity's "sources first" pattern is the closest analogue — evidence before conclusion.

## Objective

Activity group headers and expanded content communicate what was verified in outcome-oriented language. A user glancing at the collapsed header knows what was checked without expanding. Expanding reveals specific check results with pass/fail status, not raw tool I/O.

## Non-Goals

- Engine-side contextual labels (e.g., "Reviewed Henderson project history") — requires tool metadata enrichment, future brief
- Trust-tier modulated visibility (expanded at supervised, hidden at autonomous) — requires trust-tier awareness in UI, future brief
- Anomaly auto-elevation (warnings auto-expand the group) — requires tool results to carry severity signal, future brief
- Changes to the Reasoning component itself (thinking content display, auto-collapse, summary extraction) — Brief 065's domain
- Changes to user-facing tool rendering (Ditto's own tools like save_process) — these already render correctly per Insight-125
- ReasoningTraceBlock rendering in artifact/composition contexts — separate from conversation-level display

## Inputs

1. `docs/research/reasoning-chain-of-thought-ux.md` — Designer's interaction spec: three-tier visibility, outcome-oriented headers, persona tests
2. `docs/insights/126-reasoning-is-verification-evidence.md` — Core design principle
3. `docs/insights/125-internal-activity-vs-user-facing-tools.md` — Internal vs user-facing tool boundary
4. `docs/insights/124-user-toggle-autonomy-during-streaming.md` — Collapsible elements must respect user toggles
5. `packages/web/components/ai-elements/message.tsx` — Current activity grouping: `getActivityHeader()`, `AssistantParts`, `isInternalActivity()`
6. `packages/web/components/ai-elements/tool-display-names.ts` — Current tool label map
7. `packages/web/components/ai-elements/chain-of-thought.tsx` — ChainOfThoughtStep component (available but unused in activity groups)
8. `packages/web/components/ai-elements/reasoning.tsx` — Reasoning component (for summary extraction reference)
9. `.impeccable.md` — Design tokens

## Constraints

- MUST NOT change the activity grouping logic (which parts are internal vs user-facing) — Insight-125 boundary is authoritative
- MUST NOT change the Reasoning component behavior (Brief 065's domain)
- MUST NOT change the streaming infrastructure or useChat hook
- MUST NOT require engine-side changes — all changes are render-time presentation
- MUST use existing `.impeccable.md` design tokens — no new tokens
- MUST respect `prefers-reduced-motion`
- MUST respect user toggle autonomy (Insight-124) — defaultOpen for active groups, user can close freely
- MUST preserve existing tool approval (Confirmation) flow
- MUST NOT break existing ContentBlock/BlockList rendering
- MUST keep all animations CSS-only (Brief 058 constraint)
- Touch targets for expand/collapse must be minimum 44px (mobile-accessible for Rob's phone usage)
- MUST use `.impeccable.md` token names exactly: `positive` (pass), `caution` (anomaly/warning — NOT `warning`), `negative` (fail). The Designer spec uses `warning` but the correct token is `caution`.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Outcome-oriented activity headers | Perplexity sources-first pattern | pattern | Evidence before conclusion — closest competitive analogue for non-technical users |
| Check-result sub-items with status | ChainOfThoughtStep component (vercel/ai-elements) | adopt | Already adopted in Brief 061, available but unused in activity groups |
| Collapsible activity groups | Radix UI Collapsible | depend | Already in use, stable |
| Three-tier visibility model | Original to Ditto | pattern | Designer research: response → glanceable summary → full detail |
| Verification evidence framing | Original to Ditto (Insight-126) | pattern | No competitive product frames reasoning for non-technical outcome owners |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/tool-display-names.ts` | **Modify:** Add `outcome`, `runningOutcome`, and `category` fields to `ToolDisplayLabel` interface. Add outcome-oriented labels for each tool (e.g., `search_knowledge` → outcome: `"Checked knowledge base"`, runningOutcome: `"Checking knowledge base..."`, category: `"knowledge"`). Existing `running`, `complete`, `action` fields remain unchanged. |
| `packages/web/components/ai-elements/message.tsx` | **Modify:** Rewrite `getActivityHeader()` to produce outcome-oriented headers using the new `runningOutcome` and `category` fields. Active: current tool's `runningOutcome`. Complete: "Checked {N} sources — {category list}" (Option C from Designer spec). Modify `AssistantParts` to render expanded activity groups with ChainOfThoughtStep sub-items showing check results instead of raw MessagePart rendering. |
| `packages/web/components/ai-elements/chain-of-thought.tsx` | **Modify:** Adjust `ChainOfThoughtHeader` default styling for activity groups — use `text-sm text-text-muted` (not `text-base font-semibold text-text-primary`) when used as an activity summary. Add a `variant` prop: `"standard"` (current) vs `"activity"` (lighter weight for activity groups). |

## User Experience

- **Jobs affected:** Orient (what's happening / what was checked), Review (was the verification thorough?), Decide (should I trust this?)
- **Primitives involved:** ReasoningPanel (P5), ToolStep (P6), MessageBubble (P3)
- **Process-owner perspective:** The collapsed activity summary tells the user what was verified, not how long the AI thought. Expanding reveals specific checks with pass/fail indicators. The user can assess verification thoroughness at a glance and decide whether to trust the response without reading raw tool I/O.
- **Interaction states:**

| State | Visual | Behavior |
|-------|--------|----------|
| Active (streaming) | "Checking knowledge base..." with shimmer | Updates as each tool starts — shows current action in outcome language |
| Complete (collapsed) | "▸ Checked 3 sources — knowledge, files, code" | One-line summary, tap/click to expand |
| Complete (expanded) | Check-result sub-items with ✓/✕ status indicators | Each internal tool shown as a check result with outcome label |
| Reasoning within group | Reasoning component renders normally (Brief 065 behavior) | Thinking text visible as one of the sub-items in expanded view |
| No internal activity | Nothing rendered | When the AI responds with text only, no activity group appears |

- **Designer input:** `docs/research/reasoning-chain-of-thought-ux.md` — Three-tier visibility model, Option C header format, persona tests for all four personas

## Acceptance Criteria

### Tool Display Names (3)
1. [ ] `ToolDisplayLabel` interface has three new fields: `outcome: string` (past-tense, e.g., "Checked knowledge base"), `runningOutcome: string` (present-progressive, e.g., "Checking knowledge base..."), and `category: string` (single-word grouping, e.g., "knowledge"). Existing `running`, `complete`, and `action` fields remain unchanged for backward compatibility.
2. [ ] All Self tools in the map have outcome-oriented labels (e.g., `search_knowledge` → outcome: `"Checked knowledge base"`, runningOutcome: `"Checking knowledge base..."`, category: `"knowledge"`)
3. [ ] All CLI internal tools in the map have outcome-oriented labels (e.g., `Read` → outcome: `"Reviewed file"`, runningOutcome: `"Reviewing file..."`, category: `"files"`; `Grep` → outcome: `"Searched codebase"`, runningOutcome: `"Searching codebase..."`, category: `"code"`; `Bash` → outcome: `"Ran command"`, runningOutcome: `"Running command..."`, category: `"commands"`)

### Activity Group Headers (3)
4. [ ] `getActivityHeader()` active state shows the current tool's `runningOutcome` label with shimmer (e.g., "Checking knowledge base...")
5. [ ] `getActivityHeader()` complete state produces "Checked {N} sources — {deduplicated category list}" format (e.g., "Checked 3 sources — knowledge, files, code"). Categories are deduplicated (2 Read calls = one "files" category). Falls back to "Checked {N} items" when >5 unique categories.
6. [ ] When the group contains only reasoning parts (no tool calls), header reads "Thought for a moment" (preserve current behavior — reasoning-only groups don't have check results to summarise)

### Expanded Activity Content (3)
7. [ ] Expanded activity group renders each internal tool call as a `ChainOfThoughtStep` with `status="complete"`, `title` set to the tool's `outcome` label, and `description` set to a brief result hint extracted from the tool output (e.g., result count from arrays, file path from `Read`, first 60 chars of string output, or empty if no meaningful summary). Error-state tools render with a `text-negative` icon instead of the default `positive` checkmark.
8. [ ] Reasoning parts within an activity group render as **flat inline text** (not a nested Reasoning collapsible). Use the same styling as Reasoning content (`text-sm font-mono text-text-secondary`) but without the Collapsible wrapper, chevron, or "Thought for N seconds" sub-header. The outer activity group already provides the collapse/expand — nesting a second collapsible inside it is redundant. Standalone reasoning parts (not grouped with tool calls) still use the full Reasoning component.
9. [ ] Running (active) tool calls within the group render as `ChainOfThoughtStep` with `status="active"` and title set to the tool's running outcome label

### ChainOfThought Variant (2)
10. [ ] `ChainOfThoughtHeader` accepts a `variant` prop: `"standard"` (current `text-base font-semibold`) and `"activity"` (`text-sm text-text-muted font-normal`). Default is `"standard"` for backward compatibility.
11. [ ] Activity groups in `AssistantParts` use `variant="activity"` — visually lighter than standalone ChainOfThought usage

### Verification (2)
12. [ ] `pnpm run type-check` passes with 0 errors
13. [ ] Existing Confirmation (tool approval) flow unchanged — approval-requested tools still render via Confirmation component, not as activity group items

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Insight-125 boundary preserved: internal tools grouped, user-facing tools standalone
   - Insight-124 respected: defaultOpen for active groups, user can close freely
   - Insight-126 applied: headers are outcome-oriented, not time-oriented
   - No data model or streaming infrastructure changes
   - Design tokens match `.impeccable.md`
   - ChainOfThoughtStep used correctly (status prop, title/description)
   - Backward compatibility: variant="standard" preserves current ChainOfThought behavior
3. Present work + review findings to human for approval

## Smoke Test

After implementing, test with a real Claude CLI connection:

```bash
# 1. Start dev server
pnpm dev

# 2. Open browser to http://localhost:3000

# TEST 1: Activity Header — Outcome Language
# - Send a message that triggers internal tools: "What can you help me with?"
# - VERIFY: During processing, activity header shows outcome language
#   ("Checking knowledge base..." NOT "Searching knowledge...")
# - VERIFY: After completion, header reads "Checked N sources — {categories}"
#   NOT "N steps — searched knowledge (2x)"

# TEST 2: Expanded Check Results
# - Click the activity group chevron to expand
# - VERIFY: Each internal tool renders as a ChainOfThoughtStep with ✓ icon
#   and outcome label (e.g., "✓ Checked knowledge base · 3 results")
# - VERIFY: Reasoning parts (if any) render as Reasoning component within
#   the expanded group

# TEST 3: Activity Variant Styling
# - VERIFY: Activity group header is text-sm text-text-muted (lighter than
#   standalone ChainOfThought headers which are text-base font-semibold)

# TEST 4: Reasoning-Only Group
# - Send a message that triggers thinking but no tool calls
# - VERIFY: Header reads "Thought for a moment" (not "Checked 0 sources")

# TEST 5: No Regression
# - VERIFY: User-facing tools (save_process, start_pipeline) still render
#   standalone, NOT grouped into activity sections
# - VERIFY: Tool approval (Confirmation) flow still works
# - VERIFY: User can collapse active groups during streaming
```

## After Completion

1. Update `docs/state.md`: Brief 067 complete, reasoning display reframed as verification evidence
2. Update `docs/roadmap.md`: Phase 11 reasoning visibility milestone
3. Update `docs/human-layer.md` gap table: "Reasoning visibility" row — mark as partially addressed (conversation-level done, artifact-level pending)
4. Retrospective: Does the outcome-oriented header feel natural? Is "Checked 3 sources — knowledge, files, code" clear to a non-technical user? Capture insights if the framing reveals new principles.
