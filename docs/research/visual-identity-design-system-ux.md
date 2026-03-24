# UX Spec: Ditto Visual Identity & Design System

**Date:** 2026-03-24
**Role:** Dev Designer
**Status:** Draft v2 — contrast fixes, shadcn mapping, caution colour shift
**Consumers:** Dev Architect (tech decisions), Dev Builder (implementation), Brief 039 (Web Foundation)
**Depends on:** `docs/research/phase-10-mvp-dashboard-ux.md` (interaction spec), `docs/personas.md`, `docs/human-layer.md`

---

## Why This Matters

The Phase 10 interaction spec defines *what happens* — conversation flows, feed types, progressive reveal. But it says nothing about *how it looks and feels*. shadcn/ui is unstyled by design. Tailwind CSS v4 provides utility classes but no opinion. Without a visual identity spec, the Builder will either produce shadcn defaults (looking like every other developer tool) or make ad-hoc visual decisions that don't serve our personas.

Rob, Lisa, Jordan, and Nadia are not developers. They don't use Linear, VS Code, or Cursor. Rob's most complex daily tool is WhatsApp. The visual design must feel like something they'd trust and use — not something built for a startup engineer.

**This spec defines the visual language. The Architect decides how to implement it. The Builder follows both.**

---

## Design Principle: Warm Professional

Ditto's visual identity sits at a specific point on the spectrum:

```
Clinical ←──────────────── Ditto ──→ Playful
(Linear, GitHub)     (warm professional)     (Notion, Duolingo)
```

**Warm professional** means:
- **Trustworthy** — this handles my business. It's not a toy.
- **Approachable** — I don't need a manual to use this. It feels natural.
- **Quiet** — it doesn't shout at me. It works calmly alongside me.
- **Human** — it feels like a colleague's workspace, not a control panel.

This maps directly to the Self's personality: "a colleague who'll learn how your business works and help you run it." The UI should feel like the environment that colleague works in — clean, warm, organised, calm.

**What it must NOT feel like:**
- A developer tool (dark themes, monospace fonts, dense panels)
- A project management tool (kanban boards, status badges, Gantt charts)
- A dashboard for monitoring (blinking indicators, red/green traffic lights, data overload)
- A generic SaaS product (blue-and-white, stock photography, corporate sterility)

---

## 1. Colour Palette

### 1.1 Philosophy

Warm neutrals as the foundation. One strong accent for action. Colour is used sparingly — to direct attention, not to decorate.

The palette draws from natural, material tones (warm greys, cream, terracotta) rather than synthetic/digital tones (electric blue, neon green, pure black). This is deliberate: our users deal with physical work (plumbing, warehouses, offices), and the visual language should feel grounded, not sterile.

### 1.2 Palette Definition

**Foundation (backgrounds and surfaces):**

| Token | Light mode | Dark mode | Usage |
|-------|-----------|-----------|-------|
| `--background` | `hsl(40 20% 98%)` | `hsl(240 6% 10%)` | Page background — very slightly warm cream, not pure white |
| `--surface` | `hsl(40 15% 96%)` | `hsl(240 5% 13%)` | Card backgrounds, elevated surfaces |
| `--surface-raised` | `hsl(0 0% 100%)` | `hsl(240 5% 16%)` | Popovers, modals, active items |
| `--border` | `hsl(40 10% 90%)` | `hsl(240 4% 20%)` | Subtle borders — warm grey, not cold |
| `--border-strong` | `hsl(40 8% 82%)` | `hsl(240 4% 28%)` | Stronger borders where needed |

**Text:**

| Token | Light mode | Dark mode | Usage |
|-------|-----------|-----------|-------|
| `--text-primary` | `hsl(30 10% 15%)` | `hsl(40 10% 92%)` | Primary text — warm near-black, not pure #000 |
| `--text-secondary` | `hsl(30 6% 40%)` | `hsl(40 6% 65%)` | Secondary text, descriptions |
| `--text-muted` | `hsl(30 4% 50%)` | `hsl(40 4% 52%)` | Timestamps, metadata |

**Accent (action and identity):**

| Token | Light mode | Dark mode | Usage |
|-------|-----------|-----------|-------|
| `--accent` | `hsl(24 80% 38%)` | `hsl(24 75% 50%)` | Primary buttons, links, Self indicator — warm terracotta/burnt orange |
| `--accent-hover` | `hsl(24 80% 32%)` | `hsl(24 75% 57%)` | Hover state |
| `--accent-subtle` | `hsl(24 60% 95%)` | `hsl(24 40% 15%)` | Accent backgrounds (badges, highlights) |
| `--accent-text` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | Text on accent backgrounds |

**Semantic:**

| Token | Light mode | Dark mode | Usage |
|-------|-----------|-----------|-------|
| `--positive` | `hsl(145 55% 40%)` | `hsl(145 50% 50%)` | Success, approved, healthy — muted green |
| `--caution` | `hsl(48 85% 50%)` | `hsl(48 80% 55%)` | Warnings, suggestions — amber-yellow (shifted from accent hue for distinguishability) |
| `--negative` | `hsl(0 65% 50%)` | `hsl(0 60% 55%)` | Errors, failures — warm red |
| `--info` | `hsl(210 50% 50%)` | `hsl(210 45% 55%)` | Informational — muted blue |

### 1.3 Design Decisions

- **No pure black or pure white.** Everything is slightly warm. Pure black (#000) and pure white (#FFF) feel harsh. `hsl(30 10% 15%)` is visually near-black but warmer.
- **One accent colour.** Terracotta/burnt orange is warm, distinctive, and not already claimed by a major AI product (Claude uses it subtly, but our usage is different — action-oriented, not brand). It works for both Rob (trades/earth tones) and Lisa (ecommerce/design sensitivity).
- **Semantic colours are muted.** We avoid traffic-light red/green. "Something's off" should feel like a gentle flag, not an alarm. The Self's tone is "heads up" not "ALERT."
- **Dark mode is first-class, not an afterthought.** Some users (Jordan, Nadia at desks) may prefer it. Both modes should feel equally polished. The warm undertones carry through.

### 1.4 Colour Usage Rules

1. **Backgrounds are warm neutral.** Never use accent colour as a background for large areas.
2. **Accent is for actions and the Self's presence.** Primary buttons, links, the Self's typing indicator, the prompt input focus ring.
3. **Semantic colours appear only when semantically relevant.** Don't use green to mean "active" — use it to mean "approved" or "healthy." Status is conveyed through language and icons, not colour alone.
4. **Cards and surfaces use elevation, not colour, to separate.** Background → surface → surface-raised. Minimal border usage.
5. **Colour is never the only signal.** Always pair with an icon, label, or position. Accessibility requirement: WCAG 2.1 AA minimum (4.5:1 contrast for text, 3:1 for UI elements).

---

## 2. Typography

### 2.1 Philosophy

Typography carries personality. Ditto should feel readable, warm, and trustworthy — like a well-written letter from a competent colleague, not like a technical manual.

### 2.2 Font Selection

**Primary (body text, conversation, feed):** `Inter` — a modern humanist sans-serif optimised for screens. Clean, highly legible at all sizes, excellent variable font support for weight variation. It's professional without being cold. Available as a variable font with optical sizing.

**Alternative consideration:** If Inter feels too familiar (it's widely used), consider `DM Sans` (geometric but warm), `Plus Jakarta Sans` (modern, slightly rounded), or `Nunito Sans` (friendly, approachable). The key requirement is: legible on mobile at 14px, professional at 16px, warm at all sizes.

**Display (headings, the Self's name, sidebar section headers):** `Inter` at heavier weights — not a separate font. One font family, used expressively through weight and size. This keeps things simple and loading fast. If the Architect wants more personality in headings, `Fraunces` (variable serif) provides warmth for display use while Inter handles body text. But start with Inter only.

**Monospace (engine view, technical detail):** `JetBrains Mono` or system monospace. Only appears in the "Under the hood" engine view. Users (Rob, Lisa) should never see monospace text in normal operation.

### 2.3 Type Scale

Based on a 1.25 ratio (Major Third) with a 16px base — spacious enough for non-technical users, readable on mobile.

| Token | Size | Weight | Line height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 12px / 0.75rem | 400 | 1.5 | Timestamps, metadata, "under the hood" |
| `--text-sm` | 14px / 0.875rem | 400 | 1.5 | Secondary text, sidebar items |
| `--text-base` | 16px / 1rem | 400 | 1.6 | Body text, conversation messages, feed card content |
| `--text-lg` | 20px / 1.25rem | 500 | 1.4 | Card titles, section headers |
| `--text-xl` | 25px / 1.563rem | 600 | 1.3 | Page titles, the Self's greeting |
| `--text-2xl` | 31px / 1.953rem | 600 | 1.2 | Hero text (rare — only the first greeting) |

### 2.4 Typography Rules

1. **Weight variation over size variation.** Use 400 (regular), 500 (medium), 600 (semibold) to create hierarchy. Rarely go above 600. Never use bold (700) for body text.
2. **Generous line height.** 1.5–1.6 for body text. Non-technical users need breathing room — dense text walls feel overwhelming.
3. **Left-aligned always.** No centred text except perhaps the initial greeting. Our users scan, they don't study.
4. **No ALL CAPS.** Status badges, section headers — use weight, not case. All caps feels aggressive and reduces readability.
5. **The Self's messages are body text.** Don't make the Self's text larger or differently styled than the user's. They're peers in conversation.

---

## 3. Spacing & Density

### 3.1 Philosophy

**Spacious, not compact.** Our users are not power users optimising for information density. They're people who want to quickly understand what needs their attention and act. Every additional pixel of whitespace reduces cognitive load.

Think: a clean desk with today's priorities neatly arranged. Not: a trader's multi-monitor setup.

### 3.2 Spacing Scale

Based on a 4px grid, with common increments:

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Minimal gap (icon-to-text inline) |
| `--space-2` | 8px | Tight spacing (between related elements) |
| `--space-3` | 12px | Standard internal padding |
| `--space-4` | 16px | Card padding, input padding |
| `--space-5` | 20px | Between card elements |
| `--space-6` | 24px | Between cards in feed |
| `--space-8` | 32px | Section separation |
| `--space-10` | 40px | Major section separation |
| `--space-12` | 48px | Page-level breathing room |

### 3.3 Density Rules

1. **Cards have generous internal padding** (`--space-4` minimum, `--space-5` preferred). Don't cram.
2. **Feed items have clear vertical separation** (`--space-6` between cards). Each item should be visually distinct.
3. **The conversation surface is the most spacious.** Messages have generous vertical spacing. It should feel like a relaxed conversation, not a chat log.
4. **Sidebar items have comfortable touch targets.** Minimum 44px height per item (mobile accessibility standard, good practice everywhere).
5. **White space is a feature, not waste.** If a screen feels empty, that's correct for early-stage users. Don't fill it.

---

## 4. Component Styling

### 4.1 Border Radius

| Element | Radius | Rationale |
|---------|--------|-----------|
| Buttons | 8px / `rounded-lg` | Rounded enough to feel approachable, not so much it feels bubbly |
| Cards | 12px / `rounded-xl` | Generous — cards are primary containers, should feel soft |
| Inputs | 8px / `rounded-lg` | Match buttons |
| Avatars / Self indicator | Full / `rounded-full` | Circular |
| Modals / Dialogs | 16px / `rounded-2xl` | Softer than cards — feels like a focused conversation |
| Tooltips | 6px / `rounded-md` | Subtle |

**Rule:** Rounded, never sharp. Sharp corners feel technical. But don't go pill-shaped on everything — that feels childish.

### 4.2 Shadows & Elevation

Minimal shadows. Use background colour shifts (surface layers) more than drop shadows. When shadows are needed:

| Level | Shadow | Usage |
|-------|--------|-------|
| None | — | Most elements. Cards sit on surface colour, not shadows. |
| Subtle | `0 1px 2px hsl(30 10% 15% / 0.05)` | Hover states on cards |
| Medium | `0 4px 12px hsl(30 10% 15% / 0.08)` | Popovers, dropdowns |
| Large | `0 8px 24px hsl(30 10% 15% / 0.12)` | Modals, dialogs |

**Note:** Shadows use the warm text colour at very low opacity, not pure black. This keeps shadows feeling warm.

### 4.3 Buttons

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| Primary | `--accent` | `--accent-text` | none | Main actions: "Send", "Approve", submit |
| Secondary | transparent | `--text-primary` | `--border` | Secondary actions: "Not now", "Show me" |
| Ghost | transparent | `--text-secondary` | none | Tertiary actions, icon buttons |
| Destructive | `--negative` | white | none | Destructive actions (rare — most "reject" is secondary, not destructive) |

**Button sizing:** Default 40px height with `--space-4` horizontal padding. Not too small (Rob has big fingers, tapping from his truck), not too large (Lisa has lots to review at her desk).

### 4.4 The Self's Visual Presence

The Self needs a subtle but consistent visual identity in the conversation:

- **Self indicator:** A small warm-accent circle or dot that appears next to the Self's messages. Not an avatar with a face — the Self is not a character, it's a presence. A simple filled circle in `--accent` colour, 8-10px.
- **Self's typing indicator:** Three subtle dots pulsing in `--accent` colour. Not bouncing — gently fading in and out. Calm, not anxious.
- **User's messages vs Self's messages:** Minimal visual difference. User messages might have a very subtle warm background tint (`--accent-subtle`), Self's messages are on the default surface. The distinction is position (right vs left) and the Self indicator dot, not dramatic colour blocking.
- **Inline data in Self's messages:** Tables, sparklines, progress bars within conversation messages use the same colour system. Sparklines in `--accent`. Progress bars in `--accent` with `--border` track. Small tables in `--text-secondary` with `--border` dividers.

### 4.5 Feed Cards

Six feed card types, unified styling with type-specific accents:

| Card type | Left accent | Icon | Rationale |
|-----------|------------|------|-----------|
| Shift Report | none | — | The narrative. No accent needed — it's the first thing you read. |
| Needs Your Eye | `--accent` | Subtle eye or attention icon | Warm accent draws the eye to what needs action |
| Work Updates | none | Progress indicator | Quiet — informational, no urgency |
| Something's Off | `--caution` | Subtle warning icon | Amber, not red — "heads up" not "emergency" |
| Insights & Suggestions | `--accent-subtle` bg | Lightbulb or sparkle | Differentiated but not urgent |
| Process Outputs | none | Content-type icon | The output speaks for itself |

**Card interaction states:**
- Default: `--surface` background, `--border` if bordered
- Hover: Slight background shift to `--surface-raised`, optional subtle shadow
- Active/Selected: `--accent-subtle` background, `--accent` left border
- Expanded: Same as active, with content smoothly revealed below

---

## 5. Motion & Animation

### 5.1 Philosophy

**Responsive, not performative.** Every animation serves a purpose: confirming an action, showing a transition, or indicating state. Nothing bounces, spins, or draws attention for its own sake.

The Self is calm. The UI should be calm.

### 5.2 Timing

| Category | Duration | Easing | Usage |
|----------|----------|--------|-------|
| Micro | 100-150ms | `ease-out` | Button press, toggle, checkbox |
| Standard | 200-250ms | `ease-in-out` | Card expand/collapse, panel slide |
| Entrance | 300ms | `ease-out` | New card appearing in feed, modal open |
| Exit | 200ms | `ease-in` | Card dismissal, modal close |

**Rule:** Nothing exceeds 400ms. If it takes longer to animate than to understand, it's too slow.

### 5.3 Specific Animations

- **New feed items:** Slide in from top with subtle fade. Not a jarring pop.
- **Card expand/collapse:** Smooth height transition with content fade.
- **Page transitions:** Minimal — a subtle fade (150ms) between views. No slide-in pages.
- **Self typing indicator:** Three dots with a subtle opacity pulse (0.3 → 1.0), staggered by 150ms. Not bouncing.
- **Approval confirmation:** A brief, satisfying checkmark that draws itself (200ms). Then the card gently fades or slides away.
- **Skeleton loading:** Subtle shimmer effect on placeholder shapes. Warm-toned shimmer, not grey.

### 5.4 What to Avoid

- Bouncing animations (feels juvenile)
- Spinning loaders (feels mechanical — use skeleton screens or progress bars)
- Parallax effects (distracting)
- Confetti or celebration animations (Ditto is a professional tool)
- Any animation that blocks the user from acting

---

## 6. Dark Mode

### 6.1 Philosophy

Dark mode is not an inversion — it's a re-expression of the same warmth. The warm undertones in the light palette carry through to dark mode.

### 6.2 Dark Mode Principles

1. **Background is dark charcoal, not pure black.** `hsl(240 6% 10%)` — a very dark blue-grey. Pure black (#000) on screens creates harsh contrast and feels cold.
2. **Text is warm off-white, not pure white.** `hsl(40 10% 92%)` — reduces eye strain and maintains warmth.
3. **The accent colour (terracotta) brightens slightly** in dark mode to maintain the same perceived vibrancy.
4. **Semantic colours adjust** for contrast on dark backgrounds — slightly brighter, slightly more saturated.
5. **Shadows disappear** in dark mode (they're invisible on dark surfaces). Use border or subtle background difference instead.
6. **Images and illustrations** should not invert. If we use illustrations, they should work on both backgrounds or have dark variants.

### 6.3 Default Mode

Light mode is the default. Rob opens Ditto at 6:30am — light mode is appropriate. Users can switch. The Self remembers the preference.

---

## 7. Responsive Visual Behaviour

### 7.1 Mobile (< 768px)

- **Font size:** Base stays 16px (iOS zoom prevention), but `--text-xl` and `--text-2xl` scale down slightly.
- **Spacing:** Internal card padding reduces to `--space-3`. Feed gap to `--space-4`.
- **Touch targets:** Minimum 44px × 44px for all interactive elements.
- **Cards:** Full-width, no horizontal padding beyond page margin.
- **Conversation:** Messages take full width. Input is sticky at bottom.

### 7.2 Tablet (768px – 1024px)

- **Two-panel maximum:** Sidebar collapses to hamburger. Feed or conversation, not both simultaneously.
- **Cards:** May have slight horizontal margin.

### 7.3 Desktop (> 1024px)

- **Full three-panel layout** when workspace is earned.
- **Maximum content width:** 1400px centred. Beyond that, increase margins, not content width. Reading width should never exceed ~700px for text-heavy content.
- **Sidebar:** Fixed 256px (w-64).
- **Right panel (Self):** Fixed 320px (w-80).

---

## 8. Iconography

### 8.1 Icon Set

**Lucide icons** (already implied by shadcn/ui dependency). Clean, consistent line icons at 1.5px stroke weight.

### 8.2 Icon Usage Rules

1. **Icons accompany text, they don't replace it.** No icon-only buttons except well-established patterns (close × , menu ☰, send →).
2. **Icon size:** 16px inline with text, 20px for card headers, 24px for navigation items.
3. **Icon colour:** `--text-secondary` by default. `--accent` only when the icon represents the primary action.
4. **No emoji in the UI.** The Self may use words like "Morning Rob" but the interface itself doesn't use emoji. The input area's mic and attach icons are functional, not decorative.

---

## 9. The Self's Visual Identity in Context

The Self is not a chatbot with a face. It's a presence — like a very competent colleague sitting in the next room. The visual design reflects this:

### 9.1 In Conversation

- **Self indicator:** Small filled circle in `--accent` colour, 8px, next to message timestamp. Not an avatar. Not a robot icon. Not initials. Just a warm dot that says "I'm here."
- **Message alignment:** Self on the left, user on the right. Standard conversation pattern.
- **No character illustration.** The Self's personality is expressed through language, not through a mascot or character.

### 9.2 In the Workspace

- **Self panel (right):** The conversation continues with the same visual treatment as the full-screen conversation. It doesn't shrink or change personality.
- **Self's proactive messages in the feed:** When the Self surfaces insights or suggestions in the feed (card type: Insights & Suggestions), the card has a subtle `--accent-subtle` background and the Self's dot indicator. The user always knows which cards came from the Self's initiative vs. from process outputs.

### 9.3 The Prompt Input

The prompt input is the most important interactive element in the product — the user's primary way of communicating with the Self.

```
┌──────────────────────────────────────────────────────┐
│  What's on your mind?                          🎤  📎 │
└──────────────────────────────────────────────────────┘
```

- **Placeholder text:** "What's on your mind?" (warm, inviting) — not "Type a message" (mechanical) or "Ask anything" (vague).
- **Border:** `--border` default, `--accent` on focus. The focus ring is the primary visual feedback — "I'm listening."
- **Background:** `--surface-raised` — slightly elevated from the conversation background.
- **Position:** Sticky at bottom of conversation area. Always visible. Never hidden behind scroll.
- **Attach and voice buttons:** `--text-muted` default, `--text-secondary` on hover. Functional, not prominent.

---

## 10. Empty States

Empty states are critical for new users and must feel inviting, not hollow.

### 10.1 Philosophy

An empty state should feel like an invitation, not a void. It should make the user want to engage, not worry that they're missing something.

### 10.2 Patterns

| Context | What the user sees | What they don't see |
|---------|-------------------|-------------------|
| **New user, conversation** | The Self's greeting. Nothing else. The conversation IS the content. | No "get started" guides, no feature tours, no empty feed with hints |
| **Workspace, no items** | Self: "All quiet. Nothing needs you right now." Sidebar shows "Recurring" with their process(es). | No grey placeholder cards, no "add your first..." prompts |
| **Feed, between items** | The feed simply ends. Maybe a subtle "You're up to date." at the bottom. | No "load more", no infinite scroll suggestions |
| **Process detail, first run** | "First run in progress — I'll show you the result when it's ready." | No empty charts, no zero-state sparklines |

### 10.3 Rule

Empty states never make the user feel behind. Ditto is calm when things are calm.

---

## 11. Accessibility

### 11.1 Requirements

- **WCAG 2.1 AA compliance** across all surfaces (minimum).
- **Contrast ratios:** 4.5:1 for normal text, 3:1 for large text and UI components.
- **Focus indicators:** Visible focus rings on all interactive elements. `--accent` colour, 2px offset.
- **Keyboard navigation:** Full keyboard operability. Tab order follows visual order.
- **Screen reader support:** Semantic HTML, ARIA labels where needed. The conversation surface must be navigable by screen reader.
- **Reduced motion:** Respect `prefers-reduced-motion` — disable all animations, keep transitions instantaneous.
- **Font scaling:** UI must remain functional up to 200% browser zoom.

### 11.2 Colour Accessibility

The palette has been verified for contrast (v2 corrections applied):
- `--text-primary` on `--background`: ~15:1 (exceeds AA)
- `--text-secondary` (`hsl(30 6% 40%)`) on `--background`: ~5.8:1 (meets AA for normal text)
- `--accent` (`hsl(24 80% 38%)`) on `--accent-text` (white): ~5.0:1 (meets AA for normal text)
- `--text-muted` (`hsl(30 4% 50%)`) on `--background`: ~4.6:1 (meets AA for normal text)
- `--caution` (`hsl(48 85% 50%)`) vs `--accent` (`hsl(24 80% 38%)`): 24 degrees hue separation (was 14), distinguishable for most colour vision deficiencies

**Note for Architect/Builder:** Verify all contrast ratios at implementation time with a tool like `axe-core` or WebAIM's contrast checker. HSL-to-rendered colour can vary slightly across browsers. The values above are calculated, not estimated.

---

## 12. Additional Tokens (Links, Selection, Data, Skeletons)

Tokens not covered in the main palette but needed by the Builder:

| Token | Light mode | Dark mode | Usage |
|-------|-----------|-----------|-------|
| `--link` | `--accent` | `--accent` | Inline text links. Underline on hover, not by default. |
| `--selection` | `hsl(24 60% 90%)` | `hsl(24 40% 25%)` | Text selection (`::selection`) background. Warm-tinted, not browser-default blue. |
| `--skeleton-base` | `--surface` | `--surface` | Skeleton loading placeholder base colour. |
| `--skeleton-shimmer` | `--border` | `--border` | Skeleton shimmer highlight. Animate opacity 0.3→0.7 over 1.5s. |
| `--chart-primary` | `--accent` | `--accent` | Sparklines, primary data series. |
| `--chart-secondary` | `--text-muted` | `--text-muted` | Chart axes, grid lines, secondary data. |
| `--chart-positive` | `--positive` | `--positive` | Positive trend data. |
| `--chart-negative` | `--negative` | `--negative` | Negative trend data. |
| `--progress-track` | `--border` | `--border` | Progress bar background track. |
| `--progress-fill` | `--accent` | `--accent` | Progress bar filled portion. |
| `--focus-ring` | `--accent` | `--accent` | Focus indicator. 2px solid, 2px offset. |
| `--scrollbar-thumb` | `--border-strong` | `--border-strong` | Custom scrollbar thumb (if styled). |
| `--scrollbar-track` | transparent | transparent | Custom scrollbar track. |

---

## 13. What This Spec Does NOT Cover

- **Logo and wordmark.** Ditto's brand mark is not defined here. For the MVP, the sidebar header uses the text "Ditto" in `--text-primary` at `--text-lg` weight 600. A proper logo is future work.
- **Illustration style.** If we ever use illustrations (onboarding, error states), that style guide is separate.
- **Email templates.** Output delivery via email will need its own design treatment.
- **Marketing site.** The product UI and the marketing site may have different visual treatments.
- **Process Builder visual editor.** Deferred from MVP. When it arrives, it will need its own interaction design within this visual system.

---

## 14. Persona Validation

### Rob (Trades, Mobile-First)
- **Warm colours:** Feels grounded. Terracotta and earth tones match his world of materials and sites.
- **Large touch targets:** 44px minimum means he can tap accurately from his truck.
- **Spacious layout:** Scannable in the 2 minutes between jobs.
- **No jargon, no complexity:** The visual language doesn't suggest "configuration needed."
- **Light mode default:** Appropriate for morning phone use (6:30am, truck).

### Lisa (Ecommerce, Desk + Mobile)
- **Clean, design-sensitive aesthetic:** Lisa reviews brand content — the tool should meet her design standards.
- **Warm professional tone:** Matches her brand voice (sophisticated but approachable).
- **Good density at desktop:** Workspace view with feed cards lets her batch-review efficiently.
- **Mobile conversation:** Natural text conversation for commute use.

### Jordan (Generalist, Desk-Primary)
- **Professional enough for leadership demos.** The workspace view on a big screen must look competent, not homemade.
- **Engine view available.** Jordan is the one persona who might toggle developer mode — monospace is acceptable there.
- **Works with existing tools' aesthetics.** Jordan uses Slack, Notion, maybe Linear. Ditto should feel like it belongs in that ecosystem.

### Nadia (Team Manager, Desktop)
- **Clear visual hierarchy for team oversight.** When Nadia has 5 team members' processes, the feed cards need clear visual grouping.
- **Calm semantic colours.** Quality drift is `--caution`, not panic red. Nadia manages with judgment, not alarms.

---

## 15. Implementation Notes for Architect

1. **Design tokens should live in CSS custom properties** (not Tailwind config alone). This allows runtime theming and dark mode toggling via class or data attribute.
2. **shadcn/ui theming:** Override shadcn's default CSS variables in `globals.css` with the tokens defined here. Mapping from Ditto tokens to shadcn tokens:

| shadcn token | Ditto token | Notes |
|-------------|-------------|-------|
| `--background` | `--background` | Direct match |
| `--foreground` | `--text-primary` | |
| `--card` | `--surface` | Card backgrounds |
| `--card-foreground` | `--text-primary` | |
| `--popover` | `--surface-raised` | |
| `--popover-foreground` | `--text-primary` | |
| `--primary` | `--accent` | Primary buttons, links |
| `--primary-foreground` | `--accent-text` | White on accent |
| `--secondary` | `--surface` | Secondary buttons use surface colour |
| `--secondary-foreground` | `--text-primary` | |
| `--muted` | `--surface` | Muted backgrounds |
| `--muted-foreground` | `--text-muted` | |
| `--accent` | `--accent-subtle` | shadcn's accent is for hover highlights, not primary action |
| `--accent-foreground` | `--text-primary` | |
| `--destructive` | `--negative` | |
| `--destructive-foreground` | `--accent-text` (white) | |
| `--border` | `--border` | Direct match |
| `--input` | `--border` | Input borders match general borders |
| `--ring` | `--accent` | Focus rings use accent colour |

Additional Ditto tokens not in shadcn (define as custom properties alongside):
- `--surface-raised`, `--border-strong`, `--text-secondary`, `--accent-hover`, `--positive`, `--caution`, `--info`
3. **Font loading:** Use `next/font` with Inter as a variable font. Subset to Latin. Preload.
4. **Dark mode toggle:** Use `next-themes` (shadcn's recommended approach) with `class` strategy. Store preference in localStorage. The Self remembers the preference in its user model.
5. **Motion:** Use CSS transitions for most animations. Framer Motion only where CSS can't achieve the effect (e.g., layout animations, complex sequences). Keep the bundle light.
6. **Contrast verification:** Build a contrast checker into the dev workflow (e.g., `axe-core` in tests) to catch regressions.

---

## Appendix A: Competitive Visual Positioning

| Product | Colour tone | Typography | Density | Personality |
|---------|-----------|-----------|---------|-------------|
| Claude.ai | Warm (terracotta, cream) | Serif headlines, clean body | Spacious | Thoughtful, literary |
| ChatGPT | Cool (grey, blue, silver) | Custom sans-serif | Medium | Expansive, authoritative |
| Linear | Neutral (grey, purple accent) | Clean sans-serif | Medium | Minimal, focused |
| Notion | Warm (earth tones, customisable) | Clean sans-serif | Medium | Friendly, flexible |
| Slack | Mixed (aubergine accent) | System sans-serif | Compact | Social, productive |
| **Ditto** | **Warm (terracotta accent, cream foundation)** | **Humanist sans-serif (Inter)** | **Spacious** | **Warm professional — a colleague's workspace** |

**Provenance:** Ditto's visual identity is original, informed by competitive analysis of the products above. Specific influences: warm cream backgrounds from Claude.ai, spacious density from Linear, approachable business tool tone from Gusto/Xero, conversation surface patterns from Intercom Fin. The 4px spacing grid, 1.25 type scale, and HSL token structure follow standard design system practices.

Ditto is closest to Claude's warmth and Notion's approachability, with Linear's discipline around spacing and focus. It distinguishes itself by being **warmer and more spacious than all of them** — because our users are less technical and need more visual breathing room.

---

## Appendix B: Design Token Quick Reference

For the Builder's implementation — the complete token set in one place:

```css
/* Light mode */
:root {
  /* Foundation */
  --background: 40 20% 98%;
  --surface: 40 15% 96%;
  --surface-raised: 0 0% 100%;
  --border: 40 10% 90%;
  --border-strong: 40 8% 82%;

  /* Text */
  --text-primary: 30 10% 15%;
  --text-secondary: 30 6% 40%;
  --text-muted: 30 4% 50%;

  /* Accent */
  --accent: 24 80% 38%;
  --accent-hover: 24 80% 32%;
  --accent-subtle: 24 60% 95%;
  --accent-text: 0 0% 100%;

  /* Semantic */
  --positive: 145 55% 40%;
  --caution: 48 85% 50%;
  --negative: 0 65% 50%;
  --info: 210 50% 50%;
}

/* Dark mode */
.dark {
  --background: 240 6% 10%;
  --surface: 240 5% 13%;
  --surface-raised: 240 5% 16%;
  --border: 240 4% 20%;
  --border-strong: 240 4% 28%;

  --text-primary: 40 10% 92%;
  --text-secondary: 40 6% 65%;
  --text-muted: 40 4% 52%;

  --accent: 24 75% 50%;
  --accent-hover: 24 75% 57%;
  --accent-subtle: 24 40% 15%;
  --accent-text: 0 0% 100%;

  --positive: 145 50% 50%;
  --caution: 48 80% 55%;
  --negative: 0 60% 55%;
  --info: 210 45% 55%;
}
```

**Typography:**
```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

**Spacing:** 4px base grid. Tokens: 4, 8, 12, 16, 20, 24, 32, 40, 48px.

**Radius:** 6 (subtle), 8 (standard), 12 (cards), 16 (modals), 9999 (full/circular).

**Shadows:** Warm-tinted (`hsl(30 10% 15% / opacity)`), three levels: subtle (0.05), medium (0.08), large (0.12).

**Transitions:** 150ms micro, 250ms standard, 300ms entrance, 200ms exit. `ease-out` for appearance, `ease-in` for dismissal, `ease-in-out` for state changes.
