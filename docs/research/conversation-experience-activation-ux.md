# Conversation Experience Activation — UX Interaction Spec

**Date:** 2026-03-31
**Status:** Draft — feeds Brief 062
**Designer:** Dev Designer
**Inputs:** P01, P09, P10, P22, P30 prototypes; `.impeccable.md`; `human-layer.md` v0.2.0; `architecture.md`; Brief 061 components; current `conversation.tsx`, `message.tsx`, `prompt-input.tsx`, `reasoning.tsx`, `tool.tsx`, `confirmation.tsx`

---

## Problem Statement

Brief 061 shipped composable subcomponents (Reasoning, Tool, Confirmation, CodeBlock, Sources, Task) with Radix primitives, Shiki highlighting, status badges, and state-aware rendering. All architecture is in place. But the **default compositions** — the backward-compatible exports that `message.tsx` actually renders — preserve the pre-061 look. The conversation feels identical to before.

The updated `human-layer.md` v0.2.0 (2026-03-31) explicitly identifies this as the primary gap. Its "What's Next" table (§Gaps Between Architecture and Experience) lists 5 of the 7 changes in this spec:
- Reasoning visibility — "thinking blocks don't show during streaming"
- Tool use display — "tool invocations not visually differentiated"
- Citation hover — "not triggered by any conversation content yet"
- Code highlighting — "CodeBlocks in conversation don't use Shiki renderer"
- Chain of thought — "no conversation trigger"

The gap: the components *can* do rich visual rendering, but the defaults don't surface it. This is Insight-119 in action: **architecture briefs and UX briefs must be paired** (human-layer.md principle 10).

Additionally, the prompt input disables during streaming, blocking the user's natural flow of thought. Users should be able to type and queue messages while Ditto is responding.

### Alignment with Architecture

The updated `human-layer.md` v0.2.0 confirms conversation-first as the primary interaction model (replacing the v0.1.0 dashboard-centric design). This means the conversation chrome IS the primary workspace surface — these changes aren't cosmetic polish, they're the core experience layer.

Key architectural confirmations:
- **Conversation is the primary interaction** (human-layer.md §Design Philosophy) — not a secondary surface
- **Everything renders through ContentBlocks** (human-layer.md §Rendering Pipeline, design rule) — our changes stay within this pipeline
- **AI Elements define HOW to render** (human-layer.md §AI Elements) — we're updating default compositions, not creating new pipelines
- **Self's interaction model** (human-layer.md §Conversational Self) includes session gap detection, intent intuition, confirmation model — our changes must preserve these
- **Streaming and Real-Time** (human-layer.md §Streaming) already specifies: transient status updates, reasoning display with timer, SSE pipeline events — our typing indicator and reasoning changes implement these specifications

---

## Human Jobs Served

| Job | How this brief serves it |
|-----|------------------------|
| **Orient** | Reasoning traces show Ditto is thinking and what about — the user knows what's happening |
| **Review** | Tool invocations with status badges make the work trail auditable and inspectable |
| **Define** | Queued messages during streaming let users add context without waiting |
| **Capture** | Always-enabled input means thoughts aren't lost to "wait for it to finish" |

---

## Persona Lens

**Rob** (truck, phone, 30-second windows): Reasoning should be collapsed by default after streaming ends — he doesn't want to read thinking, he wants the answer. Tool status badges give him a quick "done/running" glance. Message queueing means he can fire off "also check Henderson" while Ditto is still responding to his first question. Confirmation language "Go ahead" / "Hold on" matches his direct communication style.

**Lisa** (quality-focused, content review): Expanded reasoning during streaming lets her watch Ditto's thought process — builds trust in the "Growing Trust" emotional journey phase. Knowledge citations with hover previews show provenance — critical for her content quality standards. Code blocks with syntax highlighting matter for her developer-adjacent team.

**Jordan** (technologist, cross-department, demoing to leadership): Visible reasoning traces are demo gold — he can show leadership "how the system thinks." Tool invocation history with status badges creates an auditable work trail he can present. The muted-when-complete treatment works for him because he scans selectively, not comprehensively.

**Nadia** (team manager, 5-10 specialists): Tool invocations across conversations need to be scannable — muted completed tools and status-forward rendering helps her quickly spot what's still running vs. done when checking in on her team's work. Citations showing knowledge provenance builds her confidence that the system is using the right institutional knowledge.

**Libby** (building, learning): Visible reasoning teaches her how Ditto thinks — she's in the "Cautious Hope" emotional phase where transparency builds confidence. Confirmation states with clear accept/reject and visual state transitions make tool approval feel decisive, not ambiguous.

---

## Interaction Spec: Seven Changes

### 1. Reasoning — Visible Thinking, Quiet After

**Current:** Auto-opens during streaming, auto-closes 1s after streaming ends. Muted text, chevron trigger, timer. Collapsed state shows "Thought for Ns".

**Problem:** The auto-close is too fast (1s). The collapsed state post-thinking is too subtle — "Thought for 3s" in muted text is easily missed. During streaming, the reasoning text is monospace and dense.

**Proposed:**

| State | What the user sees |
|-------|-------------------|
| **Streaming** | Open by default. Shimmer animation on "Thinking..." label. Timer ticking. Reasoning text streams in with vivid-deep left border (2px). Content auto-scrolls. |
| **Just finished** (0–3s) | Stays open. Timer freezes to final value. Shimmer stops. A brief pulse on the vivid-deep border signals completion. |
| **Settled** (3s+) | Auto-collapses. Trigger shows: chevron + "Thought for Ns" + a one-line summary of the conclusion (first ~60 chars of the last sentence, truncated with ellipsis). This summary is the key visual improvement — it gives the gist without expanding. **In conversation history** (scrolled past), the trigger persists as-is — the summary stays visible for re-expansion. No further compaction. The "silence is a feature" principle is served by the collapsed state itself; the summary is small enough not to add noise. |
| **Reopened** | Full reasoning text, scrollable (max-height 300px as current). Vivid-deep left border. |

**Key change from current:** Auto-close delay increases from 1s → 3s. Collapsed trigger gets a summary snippet. This matches P30's `reasoning_trace` block pattern (title + conclusion visible at glance level).

**Accessibility:** Timer is `aria-live="polite"`. Collapsible trigger is keyboard-navigable (already is via Radix).

---

### 2. Tool Invocations — Status-Forward, Not Name-Forward

**Current:** Shows `toolName` + StatusBadge (Running/Done/Error) + chevron. Expandable to show JSON input/output. When output has ContentBlocks, renders them directly (no collapsible).

**Problem:** Tool names are internal system names (e.g., `search_knowledge`, `save_process`). The status badge is small. Most users don't care about the tool name — they care about what Ditto is *doing*.

**Proposed:**

| State | What the user sees |
|-------|-------------------|
| **Running** | Status-first: animated pulse dots (current) + human-readable action label (e.g., "Searching your knowledge..." instead of `search_knowledge`). No chevron while running — nothing to expand yet. Compact single line. |
| **Complete** | Collapsed: checkmark icon (positive color) + action label in past tense ("Searched knowledge — 3 results"). Chevron to expand I/O. Whole line is `text-text-muted` — quiet, done, move on. |
| **Complete with blocks** | Blocks render directly (current behavior — good, keep). |
| **Error** | Negative color border-left accent. Error text visible without expanding. Action label + "Failed" badge. |

**Key change:** Human-readable action labels via a `toolDisplayName` map. **Designer recommendation:** Start with a UI-side static map for Brief 062 (fast, no engine changes — ~15 tools to map). Target engine-side contextual descriptions in a future brief (e.g., "Ready to save *your quoting process*" requires engine context). The static map handles the 80% case ("Searching knowledge..." / "Creating process..." / "Running pipeline..."). Status is the visual anchor, not the tool name. Completed tools visually recede (muted) so the user's eye focuses on the response text.

**Pattern source:** P30 prototype's `gathering_indicator` and `status_card` blocks show exactly this pattern — action description + status, not system identifiers.

---

### 3. Confirmation — Warmer States, Clearer Actions

**Current:** Border-left with caution/positive/negative color per state. Title: "Approval needed: {toolName}". Generic request text: "This tool requires your approval before proceeding." Accept/Reject pill buttons.

**Problem:** "Approval needed: save_process" feels like a system prompt, not a conversation. The request text is generic. The accepted/rejected states are too subtle (small text with icon).

**Proposed:**

| State | What the user sees |
|-------|-------------------|
| **Pending** | Caution border-left (semantic: this needs your attention before proceeding). Title uses human language: "Ready to save your quoting process" (derived from tool context). Description explains what will happen: "This will create the process and start watching for new customer enquiries." Two buttons: primary "Go ahead" (vivid bg — CTA energy), secondary "Hold on" (ghost). |
| **Accepted** | Border transitions to positive. Compact: checkmark + "Done — process saved" in positive color. Buttons gone. |
| **Rejected** | Border transitions to muted. Compact: "Cancelled" in muted color. Self should follow up asking why (engine concern, not UI). |

**Key change:** Human language throughout. Caution border for pending (semantic: trust gate, needs attention) with vivid CTA button (energy/action). Action buttons use Ditto's voice ("Go ahead" / "Hold on") not system language ("Accept" / "Reject"). This preserves the semantic color system while making the action feel warm.

**Pattern source:** P01 prototype — "Approve & send", "Bump to 22 hrs", "Show detail" — all use user-language action labels contextual to the specific decision.

---

### 4. Code Blocks — Shiki Activated, File Context Visible

**Current:** Shiki dual-theme highlighting is implemented but the default CodeBlock composition already uses it well. Header shows filename + language badge + copy button.

**Assessment:** This is the closest to "done" of all the components. The main gap is that code blocks in tool output render inside a collapsed tool section, so users may not see them.

**Proposed refinements:**
- When a tool output contains a code block, render the code block *outside* the collapsible, directly in the message flow (already happens for ContentBlocks — ensure tool outputs with code also surface this way)
- Line numbers: enabled when >5 lines (already implemented)
- Diff highlighting: green/red for +/- lines (already implemented)

**No major visual changes needed here.** The 061 implementation is solid.

---

### 5. Knowledge Citations — Visible by Default in Conversation

**Current:** Collapsible "Used N source(s)" trigger, expandable to source list with hover cards.

**Problem:** Citations are hidden behind a collapsed trigger. Users don't know Ditto used their knowledge unless they expand. This undermines provenance (`.impeccable.md` principle 5: "every data point has provenance").

**Proposed:**

| State | What the user sees |
|-------|-------------------|
| **1–3 sources** | Inline display (not collapsed). Each source as: small icon (document/web/database) + source name in vivid-deep color. Hover for excerpt. Compact row below the relevant text. |
| **4+ sources** | Collapsed trigger: "Based on N sources" (not "Used N source(s)" — user language). Expandable to full list. |

**Key change:** Low source counts render inline, not collapsed. Language shifts from "Used" to "Based on" (matches P10 prototype's "Based on" provenance strip and P22's knowledge-in-output pattern).

**Pattern source:** P10's `based-on` strip — green vivid left border, "BASED ON" label, tag chips for each source. P22 knowledge-in-output prototype shows inline provenance as a first-class visual element, not a hidden footnote.

---

### 6. Message Queueing During Streaming

**Current:** `PromptInputTextarea` sets `disabled={isLoading}`. The textarea greys out, user can't type. `PromptInputSubmit` shows stop button during streaming, or disabled send button during submitted state.

**Problem:** Users lose thoughts while waiting. This is especially bad for Rob (30-second windows) and Lisa (wants to add "also check the tone" while reviewing streaming output).

**Proposed:**

| State | Textarea | Submit button | Behavior on send |
|-------|----------|--------------|-----------------|
| **Idle** | Enabled, "Message Ditto..." placeholder | Send (vivid when has text) | Sends immediately |
| **Submitted** (waiting for stream) | Enabled, "Add to conversation..." placeholder | Send (vivid when has text) | Queues message |
| **Streaming** | Enabled, "Add to conversation..." placeholder | Split: stop button (left) + send button (right, vivid when has text) | Queues message |
| **Queued message pending** | Shows queued badge: "1 message queued" in subtle text below input | Send remains available for additional messages | Queue grows |

**Queue behavior:**
- Queued messages appear as user messages in the conversation immediately (so the user sees their message was captured)
- They are sent to the API as soon as the current stream completes (via `onFinish` callback)
- If user hits stop, queued messages send after the interrupted response
- Visual indicator: queued user messages get a subtle "pending" treatment (slightly reduced opacity or a small clock icon) until they're actually sent to the API
- **Cancel affordance:** Each queued (pending) message shows a small "×" button on hover, allowing the user to retract the message before it sends. Clicking "×" removes it from both the queue and the conversation. This prevents the anti-pattern where a queued message no longer makes sense after the stream completes in an unexpected direction.

**Implementation note:** This is primarily a `conversation.tsx` change (queue state, onFinish dispatch) + `prompt-input.tsx` change (remove `disabled={isLoading}`, change placeholder, show queue count). The composable subcomponent architecture from 061 makes this clean — `PromptInputProvider` context already separates `isLoading` from `isStreaming`.

**Pattern source:** This is how real human conversation works — you don't wait for someone to finish talking before forming your next thought. Claude.ai allows mid-stream input. The prototype P01 shows rapid back-and-forth (Rob's "Bump Henderson to 22 hours and send" comes immediately after Ditto's message).

---

### 7. Typing Indicator — Richer Status

**Current:** Three pulsing vivid dots when `isLoading`. Optional status text from transient `data-status` parts.

**Problem:** The dots are generic. When status text is available, it should be more prominent. When no status text, the dots feel disconnected from the conversation.

**Proposed:**

| State | What the user sees |
|-------|-------------------|
| **Submitted, no status** | Vivid dot (matching Self's identity dot) + shimmer on "Thinking..." text. Aligned with message flow (same indent as Self messages). |
| **Streaming with status** | Vivid dot + status text (e.g., "Checking your quoting process...") in text-secondary. Shimmer on the text. Replaces generic dots. |
| **Streaming, no status** | Just the streaming message content (no separate indicator needed — the streaming text IS the indicator). |

**Key change:** Typing indicator mirrors Self's message structure (vivid dot + text), not a disconnected animation. Status text gets visual promotion.

**Pattern source:** P30's `gathering_indicator` block — dots + action description text, integrated into the message flow.

---

## Interaction States Summary

| Component | Empty | Loading | Streaming | Complete | Error |
|-----------|-------|---------|-----------|----------|-------|
| Reasoning | n/a | n/a | Open, shimmer, timer | Open 3s then collapse with summary | n/a |
| Tool | n/a | Pulse dots + action label | n/a | Muted checkmark + past-tense label | Red border + error text |
| Confirmation | n/a | n/a | n/a | Pending: vivid border, human-language buttons | n/a |
| Code block | n/a | n/a | Progressive render | Full with syntax highlighting | n/a |
| Citations | n/a | n/a | n/a | Inline (1–3) or collapsed (4+) | n/a |
| Prompt input | Enabled, default placeholder | Enabled, "Add to conversation..." | Enabled + stop + send | Enabled, default placeholder | Enabled (error shown separately) |
| Typing indicator | n/a | Vivid dot + "Thinking..." | Status text or nothing | n/a | n/a |

---

## What This Does NOT Cover

- **Right panel / artifact mode** — that's the workspace-level concern, not conversation chrome
- **Block registry additions** — no new block types, just better default compositions of existing ones
- **Engine changes** — `toolDisplayName` mapping could be engine-side or UI-side; Architect decides
- **Mobile-specific adaptations** — these changes are responsive-friendly but mobile-specific briefs come later

---

## Scope Recommendation

**One brief (Brief 062), not two.** The changes are all in the conversation message rendering pipeline (`message.tsx` → individual component defaults). Splitting would create coordination overhead for tightly coupled changes. The brief is focused: 7 component-level changes, all in the same rendering path.

**Estimated AC count:** ~12–14 (one per component change + queue behavior + integration tests). Within the single-session buildable guideline.

---

## Priority Assessment

This is the **highest priority** remaining work. Brief 061 was infrastructure. Without 062, the infrastructure is invisible. Dogfooding without 062 means testing the old experience with new plumbing underneath — that tells us nothing about whether the new components actually work for users.

---

## Designer Pass vs Build-from-Specs

The `.impeccable.md` + Brief 061's visual specs + this interaction spec + the HTML prototypes (especially P01, P09, P10, P22, P30) provide sufficient design direction. A separate `/dev-designer` pass is not needed — the patterns are established. The Architect can write the brief directly from this spec.

---

## Reviewer Flags Addressed

| Flag | Resolution |
|------|-----------|
| Queue cancellation missing | Added "×" cancel button on pending messages |
| Confirmation border: vivid vs caution | Changed to caution border (semantic), vivid CTA button |
| Reasoning summary persistence | Specified: summary persists in history, no further compaction |
| toolDisplayName ownership | Recommended UI-side static map for 062, engine-side contextual later |
| Jordan and Nadia missing | Added to persona lens |
| AC count optimistic | Flagged for Architect to evaluate; split into 062+063 if >12 AC |

---

## Reference Docs Status

- **Reference docs checked:** `docs/human-layer.md` v0.2.0 (freshly updated 2026-03-31 — **fully aligned**, this spec implements the gaps identified in §What's Next), `docs/architecture.md` (confirmed conversation-first, ContentBlock rendering pipeline, AI Elements architecture), `docs/personas.md` (no drift), `.impeccable.md` (no drift)
- **Prototypes reviewed:** P01, P09, P10, P22, P30, P33 — all consistent with this spec
- **human-layer.md principle 10** (Insight-119: architecture + UX briefs must be paired) — this spec IS the UX pair for Brief 061's architecture
