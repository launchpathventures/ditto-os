# UX Interaction Spec: Output as Co-Located Artifact

**Date:** 2026-03-25
**Role:** Dev Designer
**Triggered by:** Analysis of Melty IDE and v0-clone interface patterns
**Status:** Draft v1
**Consumers:** Dev Architect (Brief 043+ or new brief), Dev Builder
**Human jobs served:** Review, Orient, Decide, Delegate, Capture

---

## Composition Level

Both inspirations are studied at the **pattern** level (study the approach, implement our way). No source code was adopted from either project. Melty patterns are extracted from production screenshots. The v0-clone patterns are extracted from a reference implementation using Vercel AI SDK components.

## Inspirations Analysed

### 1. Melty (Code Editor with AI Chat)

Melty is a code-focused IDE where AI conversation produces code changes. The screenshot reveals:

| Pattern | What they did | Why it works |
|---------|--------------|--------------|
| **Tabbed conversation threads** | Center panel has tabs: "All changes", "Debugging ReferenceError", "Review branch changes". Each is a separate focused thread. | The user can hold multiple concerns simultaneously without losing context. Each thread produces its own artifact. |
| **Collapsible work summaries** | "13 tool calls, 7 messages" shown as a collapsed block between messages. Expandable. | The AI's work is visible but doesn't dominate. The user sees THAT work happened, not every detail of HOW. |
| **Artifact panel (right)** | Right panel shows "Changes 10" — a file list with +/- line counts, color-coded. Not chat. Not configuration. THE OUTPUT. | The conversation is on the left, the artifact it produced is on the right. The user's eyes move left (context) → right (result). |
| **Inline code diffs** | Diffs appear IN the conversation flow: "1 file changed: RepositoryDetailsDialog.tsx [+4 -1]" | The output is woven into the narrative. You read "I fixed the missing imports" and immediately see the diff. |
| **Output lifecycle badge** | "PR #1432 → Ready to merge" with a green Merge button at top-right. | The artifact has a lifecycle. It's not just content — it has a state (Draft → Ready → Merged) and a primary action. |
| **Multi-workspace sidebar** | Multiple repos, each with branches, PRs, diff counts. Clean hierarchy with status indicators. | Navigate between different scopes of work. Each has its own conversation + artifact context. |

### 2. v0-Clone (AI SDK Chat + Live Preview)

A split-pane interface: conversation left, live web preview right. The code pattern:

| Pattern | What they did | Why it works |
|---------|--------------|--------------|
| **Conversation + live preview** | Left panel: chat messages. Right panel: full web preview of the artifact being built. | Talk about what you want → see it materialise. The artifact is ALIVE, not a static render. |
| **The output IS the right panel** | `<WebPreview>` renders the actual built app. Not a screenshot. Not a link. The thing itself. | Zero friction between "what was produced" and "seeing/using it". No "click to view output" indirection. |
| **Empty state suggestions** | When no chat exists, show clickable suggestions: "Build a todo app", "Make a landing page". | Cold start is guided, not blank. Suggestions are the entry point to the first artifact. |
| **URL-addressable output** | The preview has a URL bar (`WebPreviewUrl`). The output has an address. | The artifact feels like a real, persistent thing. Not ephemeral. You can share the URL. |

---

## What These Patterns Reveal About Ditto

### The Gap: Output Is Currently a Queue Item, Not a Co-Located Artifact

Ditto's current output model:

```
Process runs → produces output → appears in feed as a card → user clicks "View content"
→ sees monospace pre block → approves/edits/rejects via inline text links
```

Both Melty and v0 show a fundamentally different model:

```
Process runs → output renders LIVE in the artifact panel → user sees it alongside
the conversation about it → reviews/edits in the context where it was produced
```

**The key shift:** Output is not something you go find in a queue. It's something that appears next to the conversation that produced it.

### What This Means for Each Human Job

| Human job | Current Ditto | What Melty/v0 teach | Ditto application |
|-----------|--------------|---------------------|-------------------|
| **Review** | Review card in feed with `line-clamp-4` preview + "View content" | Artifact panel shows full output with rich rendering. Review controls ON the artifact, not on a summary card. | Right panel becomes the Output Viewer when there's an output to review. Full rendering, not truncated. |
| **Orient** | Feed cards + shift report | Collapsible work summaries ("4 steps completed, 2 reviewed"). Status badges on artifacts. | Process step summaries collapse like Melty's tool call blocks. Lifecycle badge on active outputs. |
| **Define** | Conversation Thread + Process Builder (Primitive 8) | v0's split-pane: talk left, structure builds right. | Already aligned (Explore mode dual-pane). But the right panel should also show emerging outputs during process execution, not just at review time. |
| **Delegate** | Trust control in process detail | Trust evidence alongside the artifact. Artifact panel shows what Ditto checked and confidence calibration. | When viewing an artifact, trust evidence and provenance in the right panel directly inform the Delegate job — "how much do I trust this?" |
| **Capture** | Feedback Widget (implicit) | Edit-as-teaching: edits on the artifact ARE feedback. Neither Melty nor v0 do this. | Editing the artifact in the right panel captures diffs as process improvement signals (Primitive 7). Original to Ditto. |
| **Decide** | Improvement Card in feed | Evidence panel alongside the thing being decided about. | When Ditto proposes a change (trust upgrade, process improvement), the right panel shows the evidence while the center shows the proposal. |
| **Define** | Not directly affected | v0's split-pane is similar to Explore mode (Primitive 8) which already has this model. | No change needed — Explore mode's dual-pane is already aligned with these patterns. |

---

## Design Patterns to Adopt

### Pattern 1: Adaptive Right Panel — Contextual Intelligence OR Artifact Viewer

The right panel already adapts based on center view (AC13 in the redesign spec). Extend this:

```
User viewing feed, no active output    → Contextual intelligence (morning thoughts, suggestions)
User viewing feed, output pending      → Output viewer (the latest output needing review)
User clicks a review card              → Output viewer (full artifact + review controls)
User viewing process detail            → Trust evidence + performance data (current design)
User in conversation, process running  → Live process execution (steps completing, output emerging)
```

**The critical principle from both inspirations: the right panel shows THE THING, not METADATA ABOUT the thing.**

```
┌──────────┬──────────────────────────┬──────────────────────┐
│ Nav      │ Center: Feed / Detail    │ Right: THE ARTIFACT  │
│          │                          │                      │
│          │ ● Henderson quote done   │ ┌──────────────────┐ │
│          │   Priced at $14,200     │ │ Henderson Bathroom│ │
│          │   Ditto bumped labour   │ │ Quote             │ │
│          │   based on your last    │ │ ─────────────── │ │
│          │   3 corrections.        │ │ Labour   $6,200  │ │
│          │                          │ │ Materials $5,800 │ │
│          │ ● Wilson deck quoted    │ │ Margin   $2,200  │ │
│          │   Standard pricing.     │ │                  │ │
│          │                          │ │ ✓ Ready to send  │ │
│          │                          │ │ [Approve] [Edit] │ │
│          │                          │ └──────────────────┘ │
│          │                          │                      │
│          │                          │ Based on:            │
│          │                          │ · 34 past quotes     │
│          │                          │ · Your corrections   │
│          │                          │ · Current pricing    │
│          ├──────────────────────────┤                      │
│          │ Message Ditto...      ↑  │                      │
└──────────┴──────────────────────────┴──────────────────────┘
```

**What's different:** The right panel shows the actual quote (the artifact), with review actions ON the artifact. The center panel tells the story (what happened, why). Provenance sits below the artifact in the right panel — "Based on" is directly under the thing it produced.

### Pattern 2: Collapsible Process Step Summaries

From Melty's "13 tool calls, 7 messages" pattern. When a process runs, the user doesn't need to see every step. They need to see that work happened, with the ability to expand.

**In the feed:**
```
┌─────────────────────────────────────────┐
│ ● Henderson quoting completed           │
│   4 steps · 2 min · high confidence     │
│   ▸ Extract specs · Match pricing ·     │  ← collapsed, expandable
│     Calculate margin · Format quote     │
│                                         │
│   Review quote →                        │  ← links to artifact in right panel
└─────────────────────────────────────────┘
```

**Expanded:**
```
┌─────────────────────────────────────────┐
│ ● Henderson quoting completed           │
│   4 steps · 2 min · high confidence     │
│                                         │
│   ✓ Extract specs         12s           │
│     Found: 1 bathroom, standard fit     │
│   ✓ Match pricing         8s            │
│     Used current supplier rates         │
│   ! Calculate margin      15s           │
│     Bumped labour 18→22/hr (learned)    │
│   ✓ Format quote          5s            │
│                                         │
│   Review quote →                        │
└─────────────────────────────────────────┘
```

**Principle from Melty:** Work summaries are BETWEEN messages in the conversation flow. They're narrative, not technical. "Bumped labour 18→22/hr (learned)" tells a story. "step-3 output: { labour_rate: 22 }" does not.

### Pattern 3: Conversation-About-Artifact

From v0's split-pane model. The Self talks about the output it produced. The conversation IS the review process.

**Current model:**
```
Feed card: "Henderson quote ready for review"  [Approve] [Edit] [Reject]
  ↓ click "View content"
  ↓ monospace pre block with raw output
```

**Proposed model (v0-inspired):**
```
Center panel (Self speaking):
  "I've finished the Henderson quote. I priced the bathroom
   at $22/hr — you've bumped bathroom rates 3 times now,
   so I've learned that's your preference. Everything else
   is standard.

   The quote is in your right panel. Take a look?"

Right panel:
  [Rendered quote with full formatting, review controls,
   provenance strip, confidence badge]
```

**Why this is better for each persona:**
- **Rob** (phone between jobs): Reads the Self's summary in the center. If it sounds right, taps Approve on the artifact without reading every line. The Self's narrative IS the review shortcut.
- **Lisa** (manager, glance-level): Sees the summary, trusts the confidence badge, approves batch.
- **Jordan** (dev, wants detail): Expands the step summary to see what each step did. Reviews the code diff in the artifact panel.
- **Nadia** (executive): Sees health metrics and doesn't need to review individual outputs.

### Pattern 4: Dev Mode — Code as Living Artifact

This is where the Melty inspiration is most directly applicable. When the dev pipeline runs (Builder produces code), the right panel should show code output the way Melty shows file changes.

**Dev mode artifact panel:**
```
┌──────────────────────────────────────┐
│ Changes 6                  All files │
│ ──────────────────────────────────── │
│ src/engine/self-tools/intake.ts  +53 │
│ src/engine/self.ts               +12 │
│ src/db/schema.ts                  +8 │
│ tests/intake.test.ts             +47 │
│ processes/intake-classifier.yaml  +2 │
│ docs/state.md                    +15 │
│ ──────────────────────────────────── │
│ ✓ Tests passing (330 → 334)         │
│ ✓ Types clean                       │
│ ● Review: 2 flags                   │
│                                      │
│ [Approve] [Edit] [Return]           │
└──────────────────────────────────────┘
```

Click a file → see the diff (syntax-highlighted, like Melty). This is the CodeBlock from ADR-021 rendered as a first-class artifact viewer, not as a feed card.

**Collapsible tool calls in the conversation (Melty pattern):**
```
Center panel:
  Jordan: "Add intake classification to the Self tools"

  Ditto (via dev-architect):
  "I'll add an intake classifier tool to the Self. The classifier
   should auto-route new work items to the best process."

  ┌─────────────────────────────────────────┐
  │ ▸ 23 tool calls, 4 files changed    2m │  ← collapsed
  └─────────────────────────────────────────┘

  "Done. The intake classifier is now a Self tool. It uses keyword
   matching first (fast) and falls back to LLM routing (capable).
   6 files changed, 4 new tests."

  ┌─────────────────────────────────────────┐
  │ ▸ Dev Reviewer: PASS WITH FLAGS (2)     │  ← collapsed review
  │   1 should-fix applied, 1 note          │
  └─────────────────────────────────────────┘
```

### Pattern 5: Output Lifecycle Badge

From Melty's "PR #1432 → Ready to merge" badge. Every artifact has a lifecycle state, visible at the top of the artifact panel.

```
Draft → Under Review → Approved → Delivered
```

For dev outputs:
```
Building → Review → Approved → Committed
```

The badge sits at the top of the right panel and has the primary action:

```
┌──────────────────────────────────────┐
│ Henderson Quote      ● Under Review  │  ← badge + lifecycle state
│ ──────────────────────────────────── │
│ [content]                            │
│ ...                                  │
│ [Approve and send]                   │  ← primary action matches lifecycle
└──────────────────────────────────────┘
```

### Pattern 6: Tabbed Conversations (Dev Mode / Power Users)

From Melty's tab model. When working on multiple things, tabs in the center panel let the user hold multiple threads.

```
┌──────────────────────────────────────────────┐
│ Henderson quote │ Dev: intake tool │ + New    │  ← tabs
├──────────────────────────────────────────────┤
│ [conversation for selected tab]              │
└──────────────────────────────────────────────┘
```

**Applicability:** This is a power-user feature. Rob doesn't need tabs. Jordan does. This maps to the progressive disclosure principle — tabs appear when the user has multiple active conversations/outputs. For Phase 10 MVP, this is NOT needed. Note for Phase 12+.

---

## Interaction States

### Right Panel States

| State | Trigger | Content | Actions |
|-------|---------|---------|---------|
| **Empty/default** | No active output, user on feed | Morning thoughts, proactive suggestions, general guidance | Click suggestions to start conversation |
| **Contextual intelligence** | User viewing a process in center | Trust evidence, performance data, what Ditto checked | View detailed metrics |
| **Artifact: pending review** | Output waiting for review, or user clicks review card | Full rendered output + review controls + provenance + confidence | Approve, Edit, Reject |
| **Artifact: code diff** | Dev pipeline output, or any CodeBlock output | File list + diffs + test status + review flags | Approve, Edit, Return |
| **Artifact: approved** | After approval | Collapsed success state, delivery status if applicable | Undo (within window) |
| **Artifact: live execution** | Process currently running | Steps completing in real-time, partial output emerging | Pause, Ask Ditto |
| **Error** | Artifact load failed | Error message + retry | Retry, Ask Ditto |
| **Loading** | Artifact being fetched | Skeleton of the artifact shape | — |

### Mobile / Responsive Degradation

The artifact panel is a right column on desktop (≥1280px). On smaller screens:

| Breakpoint | Artifact behavior |
|-----------|-------------------|
| **≥1280px** | Persistent right panel. Artifact always visible alongside feed. |
| **1024–1279px** | Artifact slides in as an overlay panel (like the current Self drawer). Feed remains visible underneath. |
| **<1024px (mobile)** | Artifact is a full-screen sheet that slides up from bottom. "View quote →" in the feed card opens it. Swipe down to dismiss. Rob taps, reviews, approves, swipes back to feed. |

**Critical for Rob:** Rob is phone-primary. The mobile artifact experience must be as smooth as the desktop one. The full-screen sheet model means he gets the same rich artifact rendering (provenance, confidence, review controls) without the three-panel layout.

### Transition Animations

- Panel content transitions should be smooth crossfade (not instant swap)
- When an artifact appears (process completes), the right panel should draw attention subtly — a brief highlight or the Ditto dot pulsing
- The user should never be surprised by the right panel changing — Ditto should narrate: "Take a look at the quote in your panel"

---

## How This Maps to Existing Architecture

| Ditto concept | Melty/v0 analogue | Already designed? | Gap? | Priority |
|---------------|-------------------|-------------------|------|----------|
| Right panel (contextual intelligence) | Melty's file changes panel / v0's preview panel | Yes (workspace-layout-redesign-ux.md) | Right panel doesn't yet BECOME an artifact viewer. It's contextual metadata only. | **Critical** — the model doesn't work without this |
| Output Viewer (Primitive 6) | v0's `<WebPreview>` | Yes (human-layer.md) | Designed as a standalone primitive. Not integrated into the right panel adaptive model. | **Critical** — needed to render artifacts in the panel |
| ReviewCardBlock (ADR-021) | Melty's diff view + PR actions | Yes (ADR-021) | Block type exists but rendering spec assumes inline in conversation, not in artifact panel. | Enhancement — works inline, panel rendering is better |
| CodeBlock (ADR-021) | Melty's file tree + syntax diff | Yes (ADR-021) | Block type exists. No rendering spec for file-tree + multi-file diff view. | Deferred — Phase 11+ (dev mode) |
| Process step display | Melty's "13 tool calls" collapsed | Partially (activity-log.tsx in Brief 042) | Activity log is a separate component in process detail. Not in conversation flow as collapsible summaries. | Enhancement — improves Orient job |
| Feed items | Melty's conversation messages | Yes (Brief 041) | Feed items are cards in a list. Not woven into conversation flow. | Enhancement — future convergence |
| Conversation tabs | Melty's concern tabs | No | Not designed. Deferred (Phase 12+). | Deferred — power user feature |
| Output lifecycle | Melty's PR badge | Partially (process run status) | Status exists in data. No badge component. No lifecycle-aware primary action. | Enhancement — small effort, high clarity |

---

## Recommendations

### For Phase 10 (now — what can absorb into current briefs)

1. **Right panel adaptive mode:** Add "artifact" as a right panel state alongside "contextual intelligence". When a review item is selected in the center, the right panel renders the Output Viewer. This is the single highest-impact change from this research.

2. **Process step collapsing in feed:** The work update feed card should collapse steps like Melty collapses tool calls. "4 steps · 2 min · high confidence [expand]". Already close — the `WorkUpdateCard` exists but shows a flat status.

3. **Output lifecycle badge:** Add a status badge to the top of the right panel when showing an artifact. Maps directly to process run status (running → paused → approved → delivered).

### For Phase 11+ (future briefs)

4. **Full artifact panel for code outputs:** Melty-style file tree + syntax-highlighted diffs for dev pipeline outputs. Requires CodeBlock rendering spec.

5. **Conversation-about-artifact flow:** The Self narrates what it produced and points the user to the artifact panel. Requires the Self to emit a new "artifact_ready" event or content block that surfaces trigger right panel switch.

6. **Live execution in artifact panel:** While a process runs, the right panel shows steps completing in real-time. SSE events already exist (Brief 041). Needs rendering spec.

7. **Tabbed conversations:** Power-user feature for holding multiple threads. Melty's model. Phase 12+.

### Original to Ditto (no direct analogue in either inspiration)

- **Provenance strip on artifacts** — Neither Melty nor v0 show "Based on: 34 past quotes, your corrections, current pricing" on their outputs. This is Ditto's unique contribution to the output review experience (Insight-083).
- **Trust evidence on artifacts** — Neither tool shows trust tiers or confidence calibration. The artifact panel showing "Confidence: HIGH" with evidence is original.
- **Edit-as-teaching** — Neither tool captures edits as process improvement feedback. When the user edits the artifact in Ditto's right panel, the diff becomes a learning signal (Primitive 7).

---

## Primitives Affected

| Primitive | Change | Human Job |
|-----------|--------|-----------|
| Output Viewer (P6) | Renders in right panel, not standalone. Adaptive to output type. | Review |
| Review Queue (P5) | Selecting a review item triggers artifact in right panel | Review |
| Activity Feed (P3) | Process steps collapse like Melty's tool call summaries | Orient |
| Feedback Widget (P7) | Edit controls ON the artifact in right panel, not in a card | Review |
| Performance Sparkline (P4) | Can appear in artifact panel for process-detail context | Orient |

---

## Persona Stress Test

### Rob (plumber, phone between jobs)
**Morning check:** Sees shift report in center. Right panel shows the most urgent artifact: Henderson quote. He reads Ditto's summary ("I bumped the labour rate"), looks at the total in the right panel, taps Approve. Done in 30 seconds.
**What's better:** Currently Rob would read a truncated card, click "View content", see monospace text, scroll, then find the approve button. Now the artifact is already there.

### Lisa (agency manager, glance-level)
**Batch review:** Feed shows 3 listing descriptions ready. She clicks the first → artifact panel shows the formatted listing. Approve. Click next → panel swaps. Approve. Batch flow.
**What's better:** Lisa never leaves the feed view. The artifact panel is her review workspace.

### Jordan (dev, wants detail)
**Code review:** Dev pipeline completed. Center shows Ditto's narrative + collapsible "23 tool calls". Right panel shows file changes with diff counts. Jordan clicks a file, sees syntax-highlighted diff. Clicks "PASS WITH FLAGS" to see review findings. Approves.
**What's better:** Currently code output would be a blob of text in a feed card. Now it's a structured code review experience.

### Nadia (executive, team health)
**Doesn't review individual outputs.** Sees process health metrics. The artifact panel isn't her primary surface — the feed's shift report and sparklines are. However, lifecycle badges contribute to aggregate health metrics Nadia sees in the shift report — badge states ("12 delivered, 2 under review") roll up into process health.

---

## ADR-021 Content Block Implications

The artifact panel is the natural renderer for several ADR-021 block types:

| Block type | Artifact panel rendering | Status |
|------------|------------------------|--------|
| `ReviewCardBlock` | Full artifact with review controls (not truncated) | Exists (review-item.tsx) — needs panel adaptation |
| `CodeBlock` | Syntax-highlighted diff view with file navigation | Needs design — new renderer |
| `DataBlock` | Table with flagged cells, sortable/filterable | Needs design — new renderer |
| `ImageBlock` | Full-size preview with annotation tools | Deferred — Phase 11+ |
| `ReasoningTraceBlock` | Decision tree visualization | Deferred — Phase 11+ |
| `KnowledgeCitationBlock` | Provenance strip below the artifact | Needs design — small component |
| `ProgressBlock` | Live execution progress in the artifact panel | Exists (SSE events) — needs panel rendering |

The Self can emit an `artifact_focus` signal (new, not in ADR-021) to tell the surface: "prefer to render this block in the artifact panel." Semantics: **advisory, not mandatory.** The surface decides how to render based on its capabilities:
- **Desktop (≥1280px):** Renders in right panel.
- **Tablet (1024–1279px):** Opens overlay panel.
- **Mobile (<1024px):** Adds a "View [artifact]" affordance in the conversation. Tap opens full-screen sheet.
- **Telegram:** Inlines the content with a "View in Ditto" link to the web app.
- **CLI:** Renders inline (no panel concept).

If the user is already viewing a different artifact, `artifact_focus` queues the new artifact and shows a subtle indicator ("New output ready") rather than forcibly swapping.

---

## Reference Doc Status

- `docs/human-layer.md` — **Drift detected:** Primitive 6 (Output Viewer) is designed as standalone. Needs update to reflect artifact panel integration model. Defer to Architect.
- `docs/research/workspace-layout-redesign-ux.md` — **Still current** but limited to layout fixes. This spec extends it with the artifact model.
- `docs/adrs/021-surface-protocol.md` — **Still current.** This spec proposes an `artifact_focus` extension. Defer to Architect.
- `docs/insights/086-composable-ui-not-fixed-pages.md` — **Reinforced.** The artifact panel IS composable UI — the right panel composes different content based on context.

---

## Next Steps

→ Dev Architect: Evaluate whether "adaptive right panel with artifact mode" changes Brief 043/044 scope or needs its own brief.
→ Dev Architect: Design the `artifact_focus` signal for ADR-021.
→ Dev Builder: If scoped into current phase, implement right panel artifact state + output viewer rendering.
