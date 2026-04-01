# UX Interaction Spec: Conversation & Prompt Polish (Brief 065)

**Date:** 2026-03-31
**Designer:** Dev Designer
**Feeds:** Brief 065 (Architect to write)
**Depends on:** Brief 064 (streaming fix delivers real text/thinking deltas)
**Personas tested:** Rob (mobile, between jobs), Lisa (desk, delegating), Jordan (demos to leadership), Nadia (reviewing team output)

---

## Design Thesis

Ditto's conversation is the primary workspace. It's where all four personas orient, capture, review, define, delegate, and decide. Brief 062 shipped the component architecture. Brief 064 will deliver real streaming data. This spec defines how those components **feel** — the timing, the transitions, the visual rhythm that separates a functional chat from a product people trust with their business.

**The standard to match:** Claude.ai's calm confidence. Not ChatGPT's feature density. Ditto should feel like a quiet, competent colleague — not a feature showcase.

**Design principle (from .impeccable.md):** "Silence is a feature." Calm UI when things are running well. Visual activity only when it communicates something.

---

## 1. Prompt Input — The Capture Surface

**Human jobs served:** Capture, Define

**Why this matters:** The prompt input is the single most-touched element in the product. Rob types from his truck. Lisa pastes customer emails. Jordan demonstrates to leadership. If this feels cheap, the whole product feels cheap.

### Current State
- Capsule shape (`rounded-3xl`), auto-growing textarea (24px → 120px)
- Send button (28px vivid circle) + Stop button during streaming
- DotParticles on left
- Drag-drop handler exists but not wired

### Target State

**Layout (bottom-anchored, floating):**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ·· Message Ditto...                              ↑  ⬤  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key changes:**

| Element | Current | Target | Reference |
|---------|---------|--------|-----------|
| Container | `border border-border` | `border-0 shadow-[0_2px_12px_rgba(0,0,0,0.08)]` — floating, no visible border. Border only on focus (`ring-1 ring-vivid/20`). | Claude.ai floating input |
| Background | `bg-surface-raised` | `bg-[#FFFFFF] dark:bg-surface-raised` — use raw white in light mode for maximum contrast against `#EDEDF0` canvas. **Note:** not a design token — if the Architect prefers token purity, use `bg-surface-raised` with increased shadow to achieve the same floating effect. | Claude.ai |
| Textarea | Basic auto-grow | Smooth height transition (`transition-[height] duration-150 ease-out`). Min 44px (comfortable touch target), max 200px. | ChatGPT |
| Placeholder | Static "Message Ditto..." | Contextual: "Message Ditto..." (idle), "Add to conversation..." (streaming), "What would you like to work on?" (empty state) | Brief 062 spec |
| Send button | 28px vivid circle always visible | 32px, `opacity-0` when empty → `opacity-100 scale-100` when text entered (spring transition 200ms). Arrow-up icon. | Claude.ai send reveal |
| Stop button | Visible alongside send | 32px square icon (stop/pause), replaces send position during streaming. Smooth crossfade (150ms). | Claude.ai |
| Keyboard hint | None | Subtle `text-xs text-text-muted` below input: "Enter to send · Shift+Enter for new line" — shown once per session, fades after 5s | ChatGPT onboarding |
| Attachment | Drag-drop handler (not wired) | Paperclip icon left of textarea (24px, `text-text-muted`). Click opens file picker. Drag-over: border dashes, vivid-subtle bg. File preview chip with X to remove. | Claude.ai |
| Max width | 720px | 720px (unchanged — matches conversation width) | — |

**Interaction states:**

| State | Visual | Behavior |
|-------|--------|----------|
| Empty/idle | Shadow container, muted placeholder, send hidden | Enter focuses textarea |
| Has text | Send button fades in (vivid), placeholder gone | Enter sends, Shift+Enter newline |
| Streaming | Stop button replaces send (crossfade). Placeholder: "Add to conversation..." | New messages queue. Stop cancels generation. |
| Error | Red border-left flash (200ms), then return to normal | Error text shown above input as transient toast |
| Disabled (rare) | Reduced opacity 50% | Only during config issues |
| File attached | Chip below textarea: filename + size + X | Chip has `bg-surface rounded-lg px-2 py-1 text-xs` |

### Rob Test
Rob is in his truck, phone in hand. The input is at the bottom of the screen (natural thumb zone). It's large enough to type "Approve the Henderson quote" without squinting. The send button appears the moment he starts typing. One tap to send.

### Jordan Demo Test
Jordan is presenting to the CTO. The input looks clean and professional — no clutter, no visible borders competing with the content. The floating shadow gives it depth without weight. When Jordan types, the send button's vivid pulse says "this is ready."

---

## 2. Streaming Text — The Conversation Rhythm

**Human jobs served:** Orient (real-time awareness of AI response), Review (read as it generates)

**Why this matters:** Streaming is the heartbeat of an AI product. When text dumps all at once, it feels like waiting for an email. When it streams, it feels like talking to someone. Brief 064 will deliver the data. This spec defines the rhythm.

### Current State (post-064)
- Text arrives as small chunks via `text-delta` events
- Streamdown renders markdown progressively
- 100ms throttle batches UI updates
- No visual cursor or streaming indicator on the text itself

### Target State

**Streaming cursor:**
A subtle blinking caret at the end of the streaming text. Not a block cursor — a thin 2px line in `vivid` color, blinking at 1s intervals (500ms on, 500ms off). Disappears when streaming stops.

Implementation: CSS pseudo-element on the last text node, toggled by `isStreaming` prop.

```
.streaming-cursor::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-vivid);
  margin-left: 1px;
  animation: cursor-blink 1s step-end infinite;
}
```

**Paragraph entrance:**
New paragraphs (after a `\n\n` in the stream) fade in from `opacity-0` to `opacity-1` over 150ms. This creates visual rhythm as the response builds. Not individual words — that would be distracting. Paragraph-level transitions only.

**Auto-scroll behavior (already good, refine):**
- Smooth scroll follows streaming text (use-stick-to-bottom handles this)
- When user scrolls up: "↓ New content below" pill appears at bottom (32px, `bg-surface-raised shadow-medium rounded-full px-3 py-1.5 text-xs`), click scrolls to bottom
- When user is at bottom: no pill, auto-follows

**Completion transition:**
When streaming finishes, no visual change needed — the cursor disappears, the text is complete. No "generation complete" indicator. Silence is a feature.

### Lisa Test
Lisa is watching Ditto draft a product description. The streaming cursor tells her "still working." The text flows in at reading pace — she can follow along and start forming her review judgment before it finishes. When it stops, she's already halfway through her review. No waiting.

---

## 3. Thinking/Reasoning — Visible Intelligence

**Human jobs served:** Orient (what is the AI doing?), Review (was the reasoning sound?)

**Why this matters:** Thinking visibility is what separates a magic black box from a trusted colleague. Rob wants to know Ditto is checking the right things before approving a quote. Nadia wants to see the reasoning behind a compliance check. But thinking should be quiet — not competing with the actual response.

### Current State
- Reasoning component opens when `thinking-delta` arrives
- Shows "Thinking..." with shimmer animation
- Timer counts seconds
- Auto-collapses after 3s with summary snippet
- Vivid-deep left border (2px)

### Target State (once Brief 064 delivers real thinking content)

**Streaming state:**
```
┌ Thinking · 4s ─────────────────────────────────────────────┐
│                                                              │
│  Let me check the pricing database for copper fittings      │
│  in the Henderson project scope. The last quote used        │
│  $18.40/unit but copper prices have moved since then...█    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---------|------|
| Container | `border-l-2 border-vivid-deep pl-3 py-2` — left border accent, no full card |
| Header | "Thinking · {N}s" — `text-xs font-medium text-text-muted`. Timer ticks every second. Shimmer animation on "Thinking" text during streaming. |
| Content | `text-sm text-text-secondary font-mono leading-relaxed` — monospace, secondary color. Streams in real-time via `thinking-delta` events. |
| Max height | 200px with `overflow-y-auto` — scrolls internally, doesn't push conversation |
| Streaming cursor | Same vivid 2px caret as text streaming |
| Scroll | Auto-scrolls to bottom of reasoning panel while streaming |

**Collapse transition (3s after streaming ends):**

```
Step 1 (0s): Streaming stops. Timer freezes. Shimmer stops.
Step 2 (3s): Panel height animates to collapsed (200ms ease-out).
             Content fades to summary.

Collapsed:
  ▸ Thought for 7s — checked pricing database, verified copper rates ···
```

| Element | Spec |
|---------|------|
| Trigger | Chevron (▸) + "Thought for {N}s" + summary snippet |
| Summary | First ~80 chars of the LAST meaningful sentence. Extracted from reasoning text, not the first sentence. Ellipsis if truncated. `text-xs text-text-muted` |
| Chevron | Rotates 90° on expand (transition 150ms) |
| Expand | Click anywhere on the collapsed bar. Opens with `animate-in slide-in-from-top-1 duration-200`. Full reasoning text visible, scrollable. |
| Interaction | Click to toggle. Stays expanded until user collapses or new reasoning starts. |

**Multiple reasoning blocks:**
If the Self thinks multiple times in one turn (e.g., between tool calls), each reasoning block is independent. Only the most recent one auto-opens. Previous ones stay collapsed.

### Nadia Test
Nadia is reviewing a compliance check Ditto ran on a team member's report. She sees "Thought for 12s — checked citation format against APA 7th, verified DOI links" in the collapsed bar. She knows the reasoning was thorough without reading 12 seconds of thinking. If she wants detail, one click expands it.

---

## 4. Tool Calls — Work Made Visible

**Human jobs served:** Orient (what's happening?), Review (what did it find?)

**Why this matters:** When Ditto searches knowledge, saves a process, or runs a pipeline, the user needs to see progress — but not be overwhelmed. The pattern should feel like watching a colleague work, not reading a system log.

### Current State
- Tool calls rendered as separate parts in the message
- Running: pulse dots + human label ("Searching knowledge...")
- Complete: checkmark + past-tense label ("Searched knowledge")
- Collapsible I/O details
- Already works per Brief 062 spec

### Target State — Inline Tool Steps

**Key change: Group tool calls within the assistant message, not as standalone blocks.**

Currently, a multi-tool response looks like:
```
[Thinking block]
[Tool: Searching knowledge...]
[Tool: Searched knowledge ✓]
[Tool: Checking pricing...]
[Tool: Checked pricing ✓]
[Text response]
```

Target:
```
[Thinking block — collapsed]

[Inline tool steps — compact]
  ✓ Searched knowledge · 3 results
  ✓ Checked pricing · copper $18.40/unit
  ↻ Running pipeline...

[Text response — streaming]
```

**Tool step design (compact inline):**

| State | Visual |
|-------|--------|
| Running | `↻` spinner icon (16px, `animate-spin duration-1000`) + label + shimmer |
| Complete | `✓` checkmark (16px, `text-positive`) + past-tense label + brief result summary. `text-text-muted text-sm` |
| Error | `✕` icon (16px, `text-negative`) + label + error message. `text-sm` |
| Expandable | Chevron on right. Click expands to show input/output JSON. Only for complete/error states. |

**Spacing:** Tool steps are `space-y-1` (4px gap). Compact — they shouldn't dominate the message. The text response is the main content; tools are the work log.

**Transition:** When a tool completes, its row transitions from running (shimmer) to complete (static) with a 200ms crossfade. No layout shift — the row stays the same height.

**Result summaries:** The complete state shows a brief inline summary after the label. This is extracted from the tool result:
- `search_knowledge`: "· {N} results"
- `save_process`: "· {process name}"
- `start_pipeline`: "· {process name} started"
- `get_briefing`: "· {N} items"
- Others: no summary, just the checkmark + label

### Rob Test
Rob asked "What's the status of the Henderson quote?" Ditto shows:
```
✓ Searched knowledge · 2 results
✓ Checked pricing · copper $18.40/unit

The Henderson quote is ready for review. Copper prices are stable...
```

Rob sees work happened, sees the key data points, and focuses on the answer. He doesn't need to expand the tool details unless something looks wrong.

### Nadia Test
Nadia asked Ditto to check her team's latest batch of reports. She sees:
```
✓ Checked citation format · 3 issues found
✓ Verified compliance headers · all pass
```
The compact summary tells her exactly where to focus her review time — the 3 citation issues. She doesn't need to expand the tool details to know what happened.

---

## 5. Message Entrance & Polish

**Human jobs served:** Orient (spatial awareness of new content)

### Message entrance animation

**User messages:** Slide in from right + fade in. `animate-in slide-in-from-right-2 fade-in-0 duration-200 ease-out`.

**Assistant messages:** Fade in from slight vertical offset. `animate-in slide-in-from-bottom-1 fade-in-0 duration-200 ease-out`. The vivid dot appears first (50ms before text), anchoring the spatial location.

**Queued messages (already styled):** Keep current: clock icon + 60% opacity. Add subtle slide-in from right (same as user messages but with opacity).

### Message actions (hover)

A minimal action bar appears below the assistant message on hover:

```
[Copy] [Retry]                    ← for assistant messages
```

```
[Edit] [Copy]                     ← for user messages (future — not in this brief)
```

| Action | Icon | Behavior |
|--------|------|----------|
| Copy | `ClipboardCopy` 16px | Copies message text (plain text, not markdown). Brief tooltip "Copied!" for 1.5s |
| Retry | `RotateCcw` 16px | Only on last assistant message. Regenerates response. Already wired via `regenerate()` in useChat |

**Styling:** `opacity-0 group-hover:opacity-100 transition-opacity duration-150`. Icons are `text-text-muted hover:text-text-secondary`. 24px height, `flex gap-2`, positioned below message with `mt-1`.

**No edit-in-place for user messages in this brief.** That's conversation branching — a separate feature. Copy only for user messages (deferred to future).

### Vivid dot (Self indicator)

The Self's vivid dot (currently `w-2 h-2 rounded-full bg-vivid`) gets a subtle pulse during streaming:

```css
@keyframes dot-breathe {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.2); }
}
```

Duration: 2s. Only active during streaming. Static (full opacity, scale 1) when not streaming.

---

## 6. Status & Progress During Multi-Turn

**Human jobs served:** Orient

### Transient status messages

Already implemented (Brief 062): status events show as transient text below the typing indicator. Enhance:

- **Visual:** `text-xs text-text-muted` with subtle fade-in/fade-out (150ms). No background. No border. Just text below the vivid dot.
- **Content:** Self-stream emits status like "Checking your quoting process..." — these should feel like thought bubbles, not system messages.
- **Timing:** Status text appears for duration of the operation, then fades out (150ms). Never accumulates — latest status replaces previous.

### Multi-turn progress

When the Self makes multiple tool calls in sequence, the user needs a sense of progress without counting tool blocks:

**Pattern:** No explicit progress bar. The tool step list (Section 4) IS the progress indicator. Each completed step with its checkmark communicates progress. The running step with its spinner communicates "still working."

This is the "silence is a feature" principle — don't add UI for progress when the tool steps already communicate it.

---

## 7. Empty State — First Impression

**Human jobs served:** Capture (invite the first message), Define (suggest what's possible)

### Current State
- Centered "Hi, I'm Ditto" + vivid dot
- 3 suggestion chips below

### Target State

**Important (Insight-121):** "Hi. I'm Ditto." is reserved for the one-time Day Zero page (Brief 057). The conversation empty state is for returning users starting a new conversation — Self already spoke first on day one, so this empty state is never the first thing a new user sees.

```
                    ··
        What would you like to work on?

   ┌──────────────────────┐  ┌──────────────────────┐
   │  What needs my       │  │  Start a new          │
   │  attention?           │  │  process              │
   └──────────────────────┘  └──────────────────────┘
   ┌──────────────────────┐  ┌──────────────────────┐
   │  Show me my          │  │  Review something     │
   │  briefing             │  │                       │
   └──────────────────────┘  └──────────────────────┘
```

| Element | Spec |
|---------|------|
| Dot particles | `DotParticles` component, 48px canvas, centered above heading |
| Heading | "What would you like to work on?" — `text-xl font-semibold text-text-primary` |
| Suggestion grid | 2x2 grid, `gap-2 mt-8 max-w-[400px]`. Each chip: `bg-surface-raised hover:bg-surface rounded-xl px-4 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer`. No icons/emoji — the text is enough. |
| Fade-in | Staggered: dot (0ms), heading (100ms), chips (200ms, all four together). Each `animate-in fade-in-0 duration-300`. |

**Suggestion chip content (contextual):**
- No processes yet: "Set up my first process", "Tell me about my work", "How does Ditto work?", "Import from a tool"
- Has processes: "What needs my attention?", "Check on [most recent process]", "Start a new process", "Show me my briefing"

The suggestion chips pre-fill the prompt input on click (not auto-send). User can edit before sending.

### Libby Test
Libby is a doula transitioning to online education. She opens Ditto for the first time. She sees "Hi. I'm Ditto." — no jargon, no feature list. The suggestion "Set up my first process" speaks her language (she's building something new). She clicks it, adds "for onboarding new students," and she's in a conversation that feels like working with a knowledgeable assistant, not configuring software.

### Lisa Test
Lisa opens Ditto for the first time. She sees a calm, clean welcome — not a feature tour. The suggestion "Set up my first process" is an obvious starting point. She clicks it, sees the text appear in the input, adds "for product descriptions," and sends. She's working within 10 seconds.

---

## Scope Boundaries (Non-Goals for 065)

These are deliberately excluded to keep the brief buildable in one session:

- **Conversation branching / edit history** — future feature, requires message tree model
- **Voice input** — future, requires speech-to-text integration
- **@mentions / slash commands in input** — future, requires autocomplete overlay
- **File upload preview** — just the attachment chip, not preview rendering
- **Mobile-specific adaptations** — existing responsive behavior is sufficient
- **Markdown preview toggle** — not needed, Streamdown handles rendering
- **Conversation search/history** — separate feature entirely
- **Model picker in input** — handled at setup level, not per-message

---

## Interaction State Summary

| Component | Loading | Empty | Streaming | Complete | Error |
|-----------|---------|-------|-----------|----------|-------|
| Prompt input | N/A | Muted placeholder, send hidden | "Add to conversation...", stop visible | Back to idle | Red border flash |
| Message | N/A | Welcome + chips | Vivid dot breathing, cursor blinking, text streaming | Static, actions on hover | Error text + retry |
| Reasoning | N/A | N/A | Open, shimmer, timer, content streaming | Auto-collapse 3s, summary | N/A |
| Tool steps | N/A | N/A | Spinner + label + shimmer | Checkmark + label + summary | Red X + error text |
| Status | N/A | N/A | Transient text below dot | Fades out | N/A |

---

## Design Token Usage

All designs use existing `.impeccable.md` tokens. No new tokens needed:

- **Vivid:** Send button, streaming cursor, dot pulse, tool spinner
- **Vivid-deep:** Reasoning left border
- **Text-muted:** Tool summaries, timestamps, keyboard hint, status text
- **Text-secondary:** Reasoning content, suggestion chips
- **Surface-raised:** Input background, suggestion chips, scroll-to-bottom pill
- **Positive:** Tool checkmark
- **Negative:** Tool error icon

---

## Motion Budget

Total new animations:
1. **Streaming cursor blink** — CSS only, `step-end`, 1s
2. **Send button reveal** — opacity + scale, 200ms
3. **Stop/send crossfade** — opacity, 150ms
4. **Paragraph fade-in** — opacity, 150ms
5. **Message entrance** — slide + fade, 200ms
6. **Dot breathe** — opacity + scale, 2s (during streaming only)
7. **Reasoning collapse** — height + opacity, 200ms
8. **Tool state crossfade** — opacity, 200ms
9. **Hover action reveal** — opacity, 150ms
10. **Empty state stagger** — fade-in, 300ms (one-time)

All CSS-only (no Framer Motion dependency — consistent with Brief 058 constraint). All respect `prefers-reduced-motion` (disable animations, show static states).

---

## Priority Order & Split Recommendation

**Reviewer recommendation:** Split into two briefs along the natural seam between "core feel" and "polish layer."

### Brief 065 — Conversation Core Feel (P0-P3)
1. **Prompt input polish** — highest touch frequency, biggest quality signal
2. **Streaming cursor** — makes streaming feel real
3. **Tool step compaction** — most impactful layout change
4. **Reasoning streaming content** — depends on 064 data, core thinking visibility

### Brief 066 — Conversation Polish Layer (P4-P7)
5. **Message entrance animations** — polish layer
6. **Message actions (copy/retry)** — convenience
7. **Empty state refresh** — first impression
8. **Contextual suggestion chips** — requires process state query
9. **Paragraph entrance animations** — incremental polish

The split follows the "independently testable and shippable" principle — 065 delivers the core feel improvement, 066 adds the polish layer on top.
