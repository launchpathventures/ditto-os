# Prompt Input Refinement — Interaction Spec

**Status:** Draft
**Date:** 2026-03-31
**Role:** Dev Designer
**Feeds:** Brief 065 (Conversation Core Feel)
**Context:** AI SDK PromptInput adopted (Brief 058), defaults don't match Ditto's visual identity

---

## Problem

The adopted AI SDK `PromptInput` ships with sensible defaults for a generic chat UI — visible border, `InputGroup` chrome, compact layout. Ditto's design language demands something more refined: a floating capsule that feels premium, calm, and branded. The current implementation has:

1. **Visible border from InputGroup** — the `border border-input` class creates a thin grey outline that feels utilitarian, not premium
2. **No shadow elevation** — the input sits flat against the canvas instead of floating above it
3. **Footer feels disconnected** — the toolbar row (DotParticles + attach + submit) sits in a separate `InputGroupAddon` block-end zone, creating visual separation from the textarea
4. **Submit button always visible** — no reveal animation, always takes space even when input is empty
5. **No height transition** — textarea snaps between heights instead of smoothly expanding
6. **Generic feel** — nothing about it says "Ditto"

## Design Target

The prompt input should feel like a **premium floating capsule** — the primary capture surface for the Capture human job. It should channel Claude.ai's calm minimalism while being distinctively Ditto through the dot particle branding and two-green signature.

### Who this serves

| Persona | How they use the input | What matters |
|---------|----------------------|--------------|
| **Rob** | Quick messages from phone between jobs, voice-to-text | Large tap target, clear submit, works at full width on mobile |
| **Lisa** | Desk-based, detailed instructions about content quality | Smooth expansion for multi-line, comfortable typing feel |
| **Jordan** | Technical instructions, process definitions | Multi-line without feeling cramped, clear when it's ready to send |
| **Nadia** | Team-context queries, status checks | Quick single-line common, but needs to expand gracefully |

### Human jobs served

- **Capture** (primary) — the input IS the capture surface
- **Define** (secondary) — process definition starts here through conversation

---

## Specification

### 1. Container Treatment

**Current:** `InputGroup` with `border border-input rounded-lg` + `!rounded-[24px]` override (pill/capsule shape)
**Target:** Floating rounded rectangle with shadow, no visible border

```
Container:
- Background: var(--surface-raised) — #F9F9FB light / #222230 dark
- Border: none (remove InputGroup default border)
- Border-radius: 16px (rounded-2xl — soft rectangle, NOT capsule/pill)
- Shadow: var(--shadow-medium) — 0 4px 16px rgba(26,26,26,0.07)
- Focus-within shadow: var(--shadow-large) — 0 8px 24px rgba(26,26,26,0.12)
- Transition: shadow 200ms ease-in-out
- Max-width: 720px, centered (already correct)
- Bottom margin: 48px (matches .impeccable.md spec)
```

**Rationale:** The two-row layout (textarea + toolbar) creates a container with real vertical height. A pill/capsule (24px+ radius) distorts at this height — the ends become bulbous. A rounded rectangle (16px radius) holds the proportions correctly, matching Claude.ai (v21) and the AI SDK default (v20). The .impeccable.md spec lists 24px for "Inputs" but that was written for single-line inputs; this is a multi-row composable input that functions more like a modal (16px = `rounded-2xl`). The floating shadow replaces visible border as the container affordance.

### 2. Textarea

**Current:** `InputGroupTextarea` with `min-h-16 field-sizing-content max-h-48`
**Target:** Same auto-sizing behavior with smoother feel

```
Textarea:
- Font: DM Sans, text-base (16px), text-primary
- Placeholder: text-muted (#65656F light / #8A8A96 dark)
- Placeholder text: contextual (see §5)
- Min height: 44px (single line + padding)
- Max height: 192px (12 lines, then scroll)
- Padding: 16px horizontal, 12px top, 8px bottom (tighter bottom because footer follows)
- Resize: none
- Border: none
- Background: transparent
- Height transition: max-height 200ms ease-in-out (CSS transition on the container)
```

### 3. Footer / Toolbar Layout

**Current:** `PromptInputFooter` renders as `InputGroupAddon align="block-end"` — a separate row with `border-t` (overridden to `border-t-0`)
**Target:** Integrated toolbar that feels part of the same surface

```
Footer:
- Layout: flex, justify-between, align-center
- Padding: 4px 8px 8px 8px (tight to textarea, generous at bottom for capsule feel)
- No border-top (already overridden, keep this)
- Left side: DotParticles (24px) + action buttons
- Right side: Submit button

Left tools cluster:
- DotParticles: 24px, existing canvas animation
- Attach button (+): icon-only, ghost variant, text-muted, 32px tap target
- Gap between items: 4px

Right submit:
- See §4 for submit button spec
```

### 4. Submit Button States

**Current:** Always visible, `variant="default"` (black bg), `icon-sm` (32px)
**Target:** Contextual visibility with smooth transitions

```
States:
┌──────────────┬─────────────────────────────────────────────┐
│ State        │ Appearance                                  │
├──────────────┼─────────────────────────────────────────────┤
│ Empty input  │ Submit hidden (opacity 0, scale 0.8)        │
│              │ — nothing to send, reduce visual noise       │
├──────────────┼─────────────────────────────────────────────┤
│ Has text     │ Submit appears (opacity 1, scale 1)          │
│ (ready)      │ Black circle, white ArrowUp icon             │
│              │ 32px, rounded-full                           │
│              │ Transition: 150ms ease-out                   │
├──────────────┼─────────────────────────────────────────────┤
│ Submitted    │ Spinner replaces icon                        │
│ (waiting)    │ Same black circle                            │
├──────────────┼─────────────────────────────────────────────┤
│ Streaming    │ Stop button: black circle, white Square icon │
│              │ Crossfade from spinner: 150ms                │
│              │ Click triggers onStop                        │
├──────────────┼─────────────────────────────────────────────┤
│ Error        │ Red circle, X icon                           │
│              │ Background: var(--negative)                  │
└──────────────┴─────────────────────────────────────────────┘

Icon choice: ArrowUp (not CornerDownLeft) — matches Claude.ai and ChatGPT convention.
The arrow-up-in-circle is now the universal "send" icon for chat interfaces.
```

### 5. Contextual Placeholder

```
Placeholders:
- Default (idle, no messages): "What would you like to work on?"
- Default (idle, has messages): "Message Ditto..."
- During streaming: "Add to conversation..."
- After error: "Try again..."
```

**Rationale:** "What would you like to work on?" for empty conversations frames Ditto as a workspace (not a chatbot). "Add to conversation..." during streaming signals that message queueing works. These match the language principles from .impeccable.md (user language, not system language).

### 6. Interaction States

| State | Visual treatment |
|-------|-----------------|
| **Default** | Shadow at rest level, placeholder visible |
| **Focused** | Shadow lifts (0.12 opacity), subtle transition |
| **Typing** | Textarea expands smoothly, submit button appears |
| **Submitting** | Submit becomes spinner, input stays enabled (queueing) |
| **Streaming** | Submit becomes stop button, placeholder changes, input enabled |
| **Error** | Submit becomes red X, placeholder "Try again..." |
| **Disabled** | Never — input is always available (message queueing pattern) |

### 7. Mobile Adaptations

```
Mobile (<1024px):
- Full width (no max-width constraint, respects page padding)
- Bottom padding: 16px (not 48px — screen real estate is precious)
- Same capsule shape, same shadow
- Submit button: 44px minimum tap target (accessibility)
- Attach button: 44px minimum tap target
```

### 8. Keyboard Shortcuts

- **Enter** — Submit (existing)
- **Shift+Enter** — New line (existing)
- **Escape** — Clear input (future consideration, not in this brief)
- **Backspace on empty** — Remove last attachment (existing)

### 9. Accessibility

- Focus ring: 2px offset ring in accent colour (existing via InputGroup focus-within)
- Submit button: `aria-label` updates with state ("Send message" / "Stop generating" / "Retry")
- Textarea: `aria-label="Message input"`
- All interactive elements keyboard-navigable
- Minimum 44px touch targets on mobile
- Contrast: placeholder text at 4.5:1 on surface background (verified: #65656F on #E2E2E6 = 4.5:1)

---

## What NOT to Change

- **AI SDK PromptInput architecture** — keep the composable Provider + Textarea + Footer + Submit structure
- **Attachment handling** — drag-drop, paste, file dialog all stay as-is
- **Message queueing** — already implemented in conversation.tsx, just ensure input stays enabled
- **DotParticles** — keep the branded particle canvas in the toolbar
- **Data flow** — value/onChange/onSubmit props unchanged

## Implementation Notes (for Architect/Builder)

1. The main challenge is overriding `InputGroup`'s default styles without forking it. Options:
   - Pass className overrides to strip border and add shadow
   - Create a thin wrapper that replaces InputGroup with a plain div for this specific use case
   - The Architect should decide which approach is cleanest

2. Submit button reveal needs the textarea value to determine visibility. The current `PromptInputSubmit` doesn't receive the input value — this needs threading through (either via context or prop).

3. The ArrowUp icon change is a one-line swap from `CornerDownLeftIcon` to `ArrowUpIcon` (both in Lucide).

4. Height transition can be CSS-only using `transition: max-height 200ms ease-in-out` on the InputGroup container, since `field-sizing-content` handles the actual sizing.

---

## Motion Budget

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Shadow lift on focus | 200ms | ease-in-out | focus-within |
| Submit button reveal | 150ms | ease-out | input value changes from empty to non-empty |
| Submit button hide | 150ms | ease-in | input value changes from non-empty to empty |
| Submit → Spinner | 150ms | ease-in-out | form submitted |
| Spinner → Stop | 150ms | ease-in-out | streaming begins |
| Textarea height | 200ms | ease-in-out | content changes height |

**Total: 6 micro-animations, all CSS-only, all respect `prefers-reduced-motion`.**

---

## Competitive Reference

| Product | Input style | What Ditto takes | What Ditto avoids |
|---------|------------|-----------------|-------------------|
| **Claude.ai** | Floating shadow capsule, send reveal, calm | Shadow treatment, send reveal pattern | — |
| **ChatGPT** | Pill shape, shimmer during streaming, model selector in input | Submit button circle convention | Model selector in input (Ditto doesn't expose model choice) |
| **Perplexity** | Search-bar metaphor, prominent, centred | Prominent placement | Search aesthetic (Ditto is conversation, not search) |
| **Cursor** | Code-editor integrated, compact | — | Developer aesthetic (Ditto serves non-developers) |

---

## Success Criteria (Designer's lens)

1. **Rob test:** Can he tap send on his phone without precision aiming? (44px target)
2. **Lisa test:** Does multi-line typing feel comfortable for detailed instructions? (smooth expansion)
3. **Jordan test:** Does it look professional enough to demo to leadership? (floating shadow, branded dots)
4. **Nadia test:** Is the empty state calm, not demanding? (submit hidden when empty)
5. **Brand test:** Would you know this is Ditto from the input alone? (dot particles, capsule shape, two-green palette present)
6. **Silence test:** When there's nothing to say, is the input quiet? (hidden submit, subtle placeholder)
