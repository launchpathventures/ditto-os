# Prototype Design Spec: P23 Alignment, Semantic HTML Pass, P22 Knowledge-in-Output

**Date:** 2026-03-26
**Role:** Dev Designer
**Status:** Draft — awaiting review
**Feeds:** Dev Builder (implementation), Dev Reviewer (validation)

---

## Task 1: P23 Setup-Connection — Design System Alignment

### Current State
P23 has: palette ✓, DM Sans ✓, cardless ✓, flat vivid buttons ✓, proto-nav ✓, theme toggle ✓ (added in latest edit).
P23 is missing: **dot particles** (the living Self indicator).

### What Needs to Change

**Replace the CSS-animated `.self-dot` with the canvas-based dot particle field.**

The Self dot in P23 (States 1 and 5) currently uses a simple CSS circle with `animation: gentle-pulse`. This should be replaced with the living dot particle `<canvas>` system used across all other v2 prototypes. The Self is alive — even during setup.

Specific changes:
1. **State 1 (Scanning):** Replace `.self-dot.scanning` with a `<canvas class="dots-field">` inside a 28×28 container. The dots should orbit and breathe — communicating "I'm working on this" without a spinner.
2. **State 5 (Success):** Replace the `.success-check` SVG with a larger dots-field (48×48) that settles into a calm, stable orbit — communicating "ready, alive, waiting for you."
3. **States 2-4:** No Self dot needed — these are user-decision screens. The Self presence comes back when Ditto is acting (scanning) or confirming (success).

**Interaction rationale:** The dot particle system IS the Self's presence. Using a CSS circle breaks the brand identity — it makes the Self look like a loading indicator instead of a living entity. Even during setup, Libby should feel she's interacting with something alive, not configuring software.

**Implementation note:** Use the exact `initDots()` function from P09/P10 reference. No modifications needed — the same canvas/requestAnimationFrame/IntersectionObserver pattern works at any size.

### Compliance After This Change
P23: Palette ✓, DM Sans ✓, Theme toggle ✓, Dot particles ✓, Cardless ✓, Centred ✗ (N/A — setup is a centred card by nature, not a 720px content flow).

---

## Task 2: Semantic HTML Pass — All v2 Prototypes

### Current State (Audit)

**What's already good:**
- All v2 prototypes have `<nav>` with `role="navigation"` and `aria-label` on the proto-nav
- All have `<main>` landmarks
- All have `aria-label` on input fields and navigation arrows
- P23 has exemplary ARIA: `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`, `role="radio"`, `aria-checked`, keyboard arrow navigation
- `prefers-reduced-motion` respected in all prototypes with dot particles

**What's missing across the board:**

| Issue | Affected | Fix |
|-------|----------|-----|
| **No `<h1>` on most pages** | P08a, P09, P10, P11, P12, P14, P15, P16, P17, P18, P19, P20 | Add visually-hidden `<h1>` with page title for screen readers. The visual design doesn't always show a heading, but the document needs one. |
| **No `<section>` landmarks beyond layout** | P09, P12, P14-P20 | Conversation, knowledge panel, feed sections should be `<section>` with `aria-label` |
| **`<aside>` not used for knowledge/Self panels** | P09, P10, P11, P13, P19 | Right-side panels (knowledge, Self chat) should be `<aside aria-label="...">` |
| **No skip-to-content link** | All | Add `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>` as first body child. The proto-nav and state bar are repeated on every prototype — keyboard users need to skip them. |
| **State toggles not labeled as prototype controls** | P08a, P09, P10-P20, P23 | State bars should have `aria-label="Prototype state controls"` to distinguish from in-app navigation |
| **`contenteditable` not announced** | P10 (post 3 editing) | Add `role="textbox"` and `aria-label="Edit post content"` to contenteditable elements |
| **Live regions for state changes** | P23 (scanning → detected) | The detection area should use `aria-live="polite"` so screen readers announce when scanning completes |

### Design Decisions

**Visually-hidden headings pattern:** Use a `.sr-only` class (already standard) to add `<h1>` elements that match each prototype's title from the proto-nav. Example: P10 gets `<h1 class="sr-only">First Output — Review your content</h1>`. This preserves the visual design while giving assistive technology a document outline.

**Don't add headings to every section.** The prototypes use flat content flows (cardless design). Adding `<h2>`/`<h3>` everywhere would create heading noise. Only add where there's a genuine content section that benefits from a landmark: feed areas, knowledge panels, sidebar navigation.

**Skip link styling:** Visible only on focus — positioned absolutely at top of viewport, styled with `--accent` background and `--accent-text` color. Consistent across all prototypes.

### Priority
This is a **single-pass, low-risk change**. Each prototype gets:
1. Skip-to-content link
2. `<h1 class="sr-only">`
3. `<section>`/`<aside>` where appropriate
4. Any missing `aria-` attributes from the table above

Estimated: ~15 minutes per prototype, 16 prototypes = ~4 hours of Builder work.

---

## Task 3: P22 — Knowledge-in-Output Close-Up

### Purpose

P22 is the **trust mechanism under a microscope.** P10 shows the "based on" strip as part of a full output review flow. P22 zooms into that strip and shows what happens when the user interacts with it — asking "what knowledge produced this?" and getting a satisfying, transparent answer.

This is critical because: **if the user can't see what went into an output, they can't trust it.** And if they can't trust it, they check everything manually, which defeats the purpose of Ditto.

### Which Human Jobs This Serves

| Job | How P22 serves it |
|-----|-------------------|
| **Review** | Primary. The user is reviewing an output and wants to understand its provenance. |
| **Orient** | Secondary. Understanding what knowledge was used helps the user orient to how complete/reliable the output is. |
| **Decide** | Tertiary. Seeing what knowledge is missing helps the user decide whether to approve, edit, or regenerate. |

### Persona Lens

**Primary: Libby** — She's reviewing her first batch of Instagram posts. She wants to know: "Did Ditto actually use what I told it about my voice, or is this generic AI content?" The provenance must make her feel: "Yes, this came from MY words."

**Secondary: Jay (Longevity Practice)** — He's reviewing treatment plan notes. He needs to see: "This recommendation is based on the patient's last 3 assessments and my methodology notes from the intake." Clinical provenance is non-negotiable.

### The User Experience (What Libby Sees)

**Layout:** Single centred column (720px max), like Claude's conversation view. This is an artefact close-up, not a split-pane workspace.

**State 1: Output with provenance summary (default view)**

The screen shows a single output artefact — one Instagram post from Libby's content pack. At the top:

```
← Back to content pack

POST 3 OF 5 · ASKING FOR HELP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Written using ─── Your voice: safe, practical, real
                  Your client: first-time mums, 30s
                  Your brand: warm friend, not woo-woo
                  Survey: "What scares you most?" responses
```

The "Written using" strip uses the same `border-left: 2px solid var(--vivid)` treatment from P10. Each tag is a pill showing one knowledge source.

Below that, the full post content with a subtle "See how this was written →" link.

**State 2: Provenance expanded (user tapped "See how this was written")**

The provenance strip expands into a **provenance trail** — a typographic flow (no cards!) showing each piece of knowledge and how it influenced the output:

```
Written using
━━━━━━━━━━━━

YOUR VOICE · safe, practical, real
"The strongest thing you can do is say 'I need support.'"
← This sentence uses your voice rule: "Direct but never preachy.
   State facts, then give permission."
   Source: Intake conversation, 15 minutes ago

YOUR CLIENT · first-time mums, 30s
"You're a person doing something massive for the first time."
← Written for your primary audience. They're dealing with
   information overload and self-doubt.
   Source: Intake conversation

SURVEY DATA · "What scares you most?"
"Not weak if you're struggling"
← 73% of survey respondents mentioned fear of judgment.
   This post directly addresses that fear.
   Source: Survey synthesis, uploaded yesterday

─── WHAT'S MISSING
Ditto doesn't yet have: specific examples from your practice,
testimonials, or seasonal content preferences. These would make
posts more specific to your experience.
```

Each knowledge source shows:
- **The knowledge category** (bold, uppercase, small — like a section label)
- **The specific line from the output** that this knowledge influenced (quoted, with a left-border accent in `--vivid`)
- **How it was used** — plain language explanation
- **Source** — where this knowledge came from and when

The "What's missing" section at the bottom shows knowledge gaps — what Ditto doesn't have yet that would improve the output. This is the **honesty mechanism** — Ditto admits what it doesn't know.

**State 3: Editing with provenance visible**

The user taps "Edit" on the post. The post content becomes editable (contenteditable). The provenance trail stays visible alongside — so the user can see what they're working with while they edit.

When the user changes something that contradicts a knowledge source (e.g., changes the tone from direct to softer), a subtle inline prompt appears:

```
You softened the tone here. Want me to update your voice rules
to include this softer register for sensitive topics?
  [Yes, update my voice]  [Just this post]
```

This is the "edits ARE feedback" pattern from human-layer.md — the correction flows back into knowledge without a separate feedback form.

**State 4: Jay's clinical view (alternate content)**

Same layout, different content showing clinical provenance:

```
SESSION NOTES · Jay Chen, Session 12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Written using ─── Patient history: 12 sessions
                  Your methodology: functional assessment protocol
                  Last session: sleep optimization discussion
                  Lab results: HRV trending up (uploaded 2 days ago)

[expanded provenance shows clinical reasoning chain]
```

### Interaction States

| State | What the user sees | Actions available |
|-------|-------------------|-------------------|
| **Default** | Output + provenance summary strip | Tap provenance to expand, Edit, Approve, Regenerate |
| **Provenance expanded** | Full knowledge trail with source attribution | Collapse, tap any source to see original, Edit |
| **Editing** | Editable content + provenance visible | Save, Cancel, respond to voice/knowledge prompts |
| **Knowledge gap** | "What's missing" section visible | Tap to provide missing knowledge, Dismiss |
| **Empty provenance** | "This was written from general knowledge — no specific inputs yet" | Start intake to add knowledge |

### Design Principles Applied

1. **Provenance is not metadata.** It's not a tooltip, not a footer, not a collapsed panel. It's part of the primary reading experience. Progressive disclosure controls depth, not visibility.

2. **Cardless.** The provenance trail flows typographically — border-left accents, whitespace, typography hierarchy. No boxes wrapping each knowledge source.

3. **Honesty about gaps.** The "What's missing" section is not optional. It's how Ditto earns trust — by admitting what it doesn't know. Libby seeing "I don't have examples from your practice yet" is more trustworthy than silence.

4. **Edits are feedback.** When the user edits within the provenance context, the system can detect contradictions and offer to learn. This is implicit feedback capture — effortless, not a form.

### Content (Use Cases from PLAN.md)

- **Primary content:** Libby's Instagram post pack (consistent with P10)
- **Alternate content:** Jay's clinical session notes (shows the pattern works across domains)
- Both use real, specific content — not placeholder "Lorem ipsum" or abstract examples

### What This Feeds

- P10 can link to P22 from its "Written using" strip (the provenance tags become links)
- The pattern established here becomes the standard for all output provenance across the product
- The "What's missing" pattern informs P15 (Knowledge Base) — showing gaps from the output side

### Design System Compliance

P22 must ship with: Palette ✓, DM Sans ✓, Theme toggle ✓, Dot particles ✓, Cardless ✓, Centred 720px ✓, Flat vivid buttons ✓.

---

## Review Checklist (for Dev Reviewer)

1. Does P23 dot particle change maintain the Self's personality across all 5 states?
2. Does the semantic HTML pass avoid over-annotating? (heading noise, excessive landmarks)
3. Does P22 provenance design serve Review (primary), Orient, and Decide jobs?
4. Would Libby understand P22 without explanation? Would Jay trust it for clinical work?
5. Is the "What's missing" section honest without being alarming?
6. Does P22 cardless flow match the typographic hierarchy from .impeccable.md?
7. Are the interaction states complete? Missing any edge cases?
