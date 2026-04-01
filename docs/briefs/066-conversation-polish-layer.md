# Brief: Conversation Polish Layer

**Date:** 2026-04-01
**Status:** ready
**Depends on:** Brief 065 (conversation core feel — streaming cursor, tool compaction, reasoning content, prompt input polish)
**Unlocks:** Brief 067 (reasoning verification evidence)

## Goal

- **Roadmap phase:** Phase 11: Chat UX & Experience
- **Capabilities:** Message entrance animations, message hover actions, empty state redesign, conversation polish

## Context

Brief 065 delivers the core conversation feel — streaming cursor, thinking content, tool compaction, and prompt input quality. This brief adds the polish layer that makes the conversation feel finished and professional. Without this layer, the conversation works but feels abrupt: messages appear without transitions, users can't copy responses, and the empty state still says "Hi, I'm Ditto" (which is reserved for the Day Zero experience per Insight-121).

These are all visual/interaction enhancements to existing components — no data model changes, no new API calls, no infrastructure work.

**Design thesis (from Designer spec):** "Silence is a feature." Each addition must earn its place. Message entrance animations communicate spatial context. Copy/retry actions reduce friction. The empty state invites action. Nothing else.

## Objective

The conversation has smooth message entrances, useful hover actions, and a returning-user empty state. These are the final polish items that separate "functional chat" from "feels like a shipping product."

## Non-Goals

- Conversation branching / edit-in-place for user messages — requires message tree model
- Paragraph-level fade-in animations during streaming — over-engineering per reviewer feedback; streaming cursor from 065 is sufficient
- Voice input
- @mentions / slash commands in input
- File upload preview rendering
- Conversation search / history browser
- Mobile-specific layout adaptations

## Inputs

1. `docs/research/conversation-polish-ux.md` — Designer's interaction spec (Sections 5 and 7)
2. `docs/briefs/065-conversation-core-feel.md` — Prerequisite: what this builds on
3. `docs/insights/121-day-zero-vs-empty-state-separation.md` — Day Zero ≠ empty state
4. `docs/insights/128-brand-presence-as-interaction-affordance.md` — DotParticles as functional element
5. `docs/insights/129-css-pseudo-elements-need-dom-awareness.md` — DOM structure awareness for animations
6. `packages/web/components/ai-elements/message.tsx` — Current message renderer
7. `packages/web/components/self/conversation.tsx` — Conversation orchestrator (empty state + message rendering)
8. `packages/web/components/ai-elements/suggestion.tsx` — Current suggestion chips
9. `.impeccable.md` — Design tokens and principles

## Constraints

- MUST use existing `.impeccable.md` design tokens — no new tokens
- MUST NOT add Framer Motion or any new animation dependency (Brief 058 constraint: CSS-only animations)
- MUST respect `prefers-reduced-motion` — all animations disabled, static states shown instead
- MUST NOT change the message data model or useChat hook configuration
- MUST NOT change streaming infrastructure or tool compaction (Brief 064/065 domain)
- MUST keep max-width at 720px (conversation width standard)
- MUST NOT break existing ContentBlock rendering via BlockList
- MUST NOT repeat "Hi. I'm Ditto." in empty state — reserved for Day Zero (Insight-121)
- Empty state heading uses "What would you like to work on?" for returning users
- All animations CSS-only, total motion budget: 4 new animations (from Designer spec's remaining budget of 10 minus 6 used by 065)
- Copy action must extract plain text, not markdown source
- DotParticles currently lives at `packages/web/app/setup/dot-particles.tsx` — import from there (already imported by prompt-input.tsx). If touching it, consider moving to `components/ui/` for cleanliness, but not required.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Message entrance animation (slide+fade) | Claude.ai, ChatGPT | pattern | Standard modern AI chat entrance |
| Hover action bar (copy/retry) | Claude.ai, ChatGPT, Perplexity | pattern | Universal pattern across all AI chat products |
| Empty state with suggestion grid | Claude.ai ("How can Claude help?") | pattern | Calm, action-oriented, not feature-showcasing |
| DotParticles in empty state | Insight-128 (brand presence as interaction affordance) | original | Brand presence in functional position |
| Collapsible primitives | Radix UI Collapsible | depend | Already in use, stable |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/message.tsx` | **Modify:** Add entrance animation CSS classes to user messages (`animate-in slide-in-from-right-2 fade-in-0 duration-200`) and assistant messages (`animate-in slide-in-from-bottom-1 fade-in-0 duration-200`). Add copy action bar below assistant messages (hover-visible). |
| `packages/web/components/self/conversation.tsx` | **Modify:** Replace empty state ("Hi, I'm Ditto") with returning-user empty state: DotParticles + "What would you like to work on?" heading + 2x2 suggestion grid. Suggestion chips pre-fill input on click (not auto-send). Pass `onSuggestionClick` to set input text instead of calling `sendMessage`. |
| `packages/web/components/ai-elements/suggestion.tsx` | **Modify:** Extend to support 2x2 grid layout variant (in addition to current row layout). Add `variant` prop: `"row"` (default, current behavior) or `"grid"`. Grid variant: `grid grid-cols-2 gap-2 max-w-[400px]`. Chip styling: `bg-surface-raised hover:bg-surface rounded-xl px-4 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors`. |
| `packages/web/app/globals.css` (or equivalent) | **Modify:** Add `dot-breathe` keyframes (if not already from 065), entrance animation utilities if not covered by existing Tailwind animate plugin. Add `@media (prefers-reduced-motion: reduce)` block to disable all custom animations. |

## User Experience

- **Jobs affected:** Orient (spatial awareness from entrance animations), Capture (empty state invites first message), Review (copy action for assistant responses)
- **Primitives involved:** MessageBubble (P3), ConversationInput (P1), SuggestionChip (P8)
- **Process-owner perspective:** Messages slide in smoothly — the conversation has spatial rhythm. Hovering over a response reveals a copy button — no more select-all-copy. Starting a new conversation shows contextual suggestions that match what the user is likely to do next.
- **Interaction states:** See Designer spec interaction state matrix (conversation-polish-ux.md). This brief adds: message entrance (animate-in on mount), hover action bar (opacity transition on group-hover), empty state (staggered fade-in on initial render).
- **Designer input:** `docs/research/conversation-polish-ux.md` — Sections 5 (message entrance & polish) and 7 (empty state) addressed. Section 5's paragraph entrance animation deferred (non-goal).

## Acceptance Criteria

### Message Entrance Animations (3)
1. [ ] User messages animate in with `slide-in-from-right-2 fade-in-0 duration-200 ease-out` on mount
2. [ ] Assistant messages animate in with `slide-in-from-bottom-1 fade-in-0 duration-200 ease-out` on mount
3. [ ] All entrance animations are disabled when `prefers-reduced-motion: reduce` is active (messages appear immediately with no animation)

### Message Hover Actions (4)
4. [ ] Assistant messages show a hover action bar below the message content: `opacity-0 group-hover:opacity-100 transition-opacity duration-150`
5. [ ] Copy action (`ClipboardCopy` icon, 16px) copies the assistant message text as plain text (stripped of markdown). Shows "Copied!" tooltip for 1.5s after click.
6. [ ] Retry action (`RotateCcw` icon, 16px) appears only on the last assistant message when not streaming. Calls existing `onRetry` handler. (Moves existing retry button into the action bar — current implementation already exists at message.tsx:113-128, consolidate into the new action bar)
7. [ ] Action bar icons use `text-text-muted hover:text-text-secondary transition-colors`. Bar height 24px, `flex gap-2`, positioned with `mt-1`.

### Empty State Redesign (5)
8. [ ] Empty state (no messages) shows: DotParticles component (48px canvas, centered) → heading "What would you like to work on?" (`text-xl font-semibold text-text-primary`) → 2x2 suggestion grid below. Static chip text: "What needs my attention?", "Start a new process", "Show me my briefing", "Review something". (Contextual process-aware chips deferred.)
9. [ ] Suggestion chips use grid layout: `grid grid-cols-2 gap-2 max-w-[400px] mt-8`. Each chip: `bg-surface-raised hover:bg-surface rounded-xl px-4 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer`
10. [ ] Suggestion chip click pre-fills the prompt input text (sets `input` state) — does NOT auto-send. User can edit before sending. **Note:** This changes current behavior where `handleSuggestion` calls `sendMessage` directly — refactor to set input text instead.
11. [ ] Empty state has staggered fade-in: DotParticles (0ms), heading (100ms), chips (200ms). Each element `animate-in fade-in-0 duration-300`.
12. [ ] Staggered fade-in animations are disabled when `prefers-reduced-motion: reduce` is active

### Verification (2)
13. [ ] `pnpm run type-check` passes with 0 errors
14. [ ] Visual verification: messages slide in on send/receive, copy works on hover, empty state shows grid with working chip-to-input flow

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - All changes are CSS/JSX only — no data model or streaming infrastructure changes
   - Design tokens match `.impeccable.md` (no raw colors outside token system)
   - Empty state does NOT use "Hi. I'm Ditto." (Insight-121)
   - Entrance animations are CSS-only, respect prefers-reduced-motion
   - Copy action extracts plain text, not markdown
   - Existing retry functionality is preserved (consolidated, not removed)
   - Existing ContentBlock/BlockList rendering unchanged
3. Present work + review findings to human for approval

## Smoke Test

After implementing, verify visually:

```bash
# 1. Start dev server
pnpm dev

# 2. Open browser to http://localhost:3000

# TEST 1: Empty State
# - New conversation shows DotParticles + "What would you like to work on?" + 2x2 grid
# - NO "Hi, I'm Ditto" text
# - Click a suggestion chip → text appears in prompt input (not sent)
# - Edit the text, then send

# TEST 2: Message Entrance
# - Send a message → user message slides in from the right
# - Assistant response slides in from below
# - Transitions feel smooth, not jarring

# TEST 3: Hover Actions
# - Hover over an assistant message → copy + retry icons appear below
# - Click copy → text copied to clipboard, "Copied!" tooltip shown
# - Retry only appears on the LAST assistant message
# - Retry triggers regeneration (same as existing behavior)

# TEST 4: Reduced Motion
# - Enable "Reduce motion" in OS accessibility settings
# - Verify: messages appear instantly (no slide/fade)
# - Verify: empty state appears instantly (no stagger)
# - All functionality still works, just without animation
```

## After Completion

1. Update `docs/state.md`: Brief 066 complete, conversation polish layer shipped
2. Update `docs/roadmap.md`: Phase 11 conversation polish milestone — all conversation UX briefs (058-066) complete
3. Retrospective: The full 058→064→065→066 chain is now complete. Assess overall conversation quality against Claude.ai benchmark.
4. Consider: Is there a next polish pass needed, or is conversation UX "done" for Phase 11?
