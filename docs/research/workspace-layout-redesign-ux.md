# UX Interaction Spec: Workspace Layout Redesign

**Date:** 2026-03-25
**Role:** Dev Designer
**Triggered by:** First live workspace test — screenshot review
**Status:** Draft v1
**Consumers:** Dev Builder (implementation fixes)

---

## The Problem

The first live workspace test revealed three critical design gaps between the approved UX spec (v3) and the implementation:

### Issue 1: Chat relegated to side panel
**What happened:** The Self conversation was placed in the right column as a 320px chat panel.
**What was designed:** The right column in P13 (the 5th iteration, the converged design) is a **contextual intelligence panel** — "Ditto alive, thinking, contextual" — showing what Ditto checked, confidence levels, knowledge used, proactive suggestions. The chat input lives at the **bottom of the center column**, not in the right panel. The Self IS the primary surface (C3), not a sidebar widget.

**The right column should show:**
- Ditto's thinking for the current context (what it checked, confidence)
- Proactive suggestions relevant to what the user is looking at
- Knowledge used / provenance citations
- Trust evidence for the selected process

**The chat input should be:**
- Bottom of the center column (persistent, always visible)
- Full-width within the content area
- Same input as the conversation-only mode — unified experience

### Issue 2: Navigation shows everything, organised by nothing
**What happened:** All 14+ processes (including system processes like "Dev PM Standalone", "Dev Builder Standalone") appeared in a flat list under "Recurring" with no visual hierarchy.
**What was designed:** The sidebar is pure navigation with user-facing names only. System processes are invisible. Categories hidden when empty. Items show status indicators (● needs attention, ✓ running smoothly).

**The root cause is twofold:**
1. System/dev processes weren't filtered (code bug — now fixed with `system: true`)
2. Even with filtering, the sidebar needs better information hierarchy

**What the sidebar should look like for Rob:**
```
Rob's Plumbing            ← workspace name
─────────────
Home                      ← feed view (active by default)
─────────────
TO REVIEW (2)             ← action-required items with count
  Henderson quote  ●      ← needs attention
  Wilson quote     ●
─────────────
RUNNING                   ← healthy recurring processes
  Quoting          ✓
  Invoicing        ✓
  Follow-ups       →      ← in progress (not yet proven)
```

Key principles:
- **Action items first** — what needs the user RIGHT NOW
- **No empty sections** — "To Review" only appears when items need review
- **Status is glanceable** — ● ✓ → ⚠ tell the story at a glance
- **Never list system internals** — the user's business, not Ditto's machinery

### Issue 3: Cards are visually heavy and repetitive
**What happened:** Exception cards dominated the feed with large red-bordered cards, each showing the same error repeatedly. The cards have heavy borders, lots of whitespace, prominent "Investigate / Pause" buttons taking up space.
**What was designed:** Feed items should be compact, scannable, and prioritised. Rob checks this on his phone between jobs — every pixel matters. The shift report (narrative brief) should be the dominant card; exceptions should be compact with clear action, not giant error panels.

**Specific card issues:**
1. **Exception cards are too large** — the error text + 3 buttons take ~120px each. With 5 identical exceptions, they dominate the entire viewport.
2. **Repetitive items aren't collapsed** — "Dev Pipeline encountered an error at step pm-triage" × 3 should be "Dev Pipeline: 3 errors at pm-triage [Investigate all]"
3. **Left border accent is heavy** — the red/amber left border draws too much attention. Use color sparingly (dot indicator, not full-height border).
4. **Buttons are oversized** — "Investigate" and "Pause" have button styling (border, padding) when they should be text links or compact action chips.
5. **Process name in red is alarming** — "Dev PM (Standalone)" in red text above each card creates visual alarm. The name should be neutral; the status indicator conveys urgency.

---

## Design Direction

### Principle: Calm Professionalism

Ditto should feel like a **quiet, competent colleague** handing you a brief — not an alarm system blaring at you. The design language should be:

- **Information-dense but not cluttered** — like a well-designed email client
- **Status through subtlety** — small colored dots, not full-height colored borders
- **Actions through affordance** — clickable text, not prominent buttons (unless the action is primary)
- **Repetition collapsed** — grouped by process/type, with count and bulk action

### Right Column: Contextual Intelligence Panel (Not Chat)

From P13 (the converged prototype):

```
┌────────────────────┐
│  ● Ditto           │
│  Watching your work │
│                    │
│  ─────────────── │
│  Henderson quote    │
│  I'd send it at 22 │
│  hours — you've    │
│  bumped bathrooms  │
│  3 times now.      │
│                    │
│  What I checked:   │
│  ✓ Materials price │
│  ✓ 25% margin      │
│  ! Labour (18→22)  │
│  ✓ All fields      │
│                    │
│  Confidence: HIGH  │
│  ────────────────  │
│  Based on:         │
│  · 34 past quotes  │
│  · Your corrections│
│  · Current pricing │
└────────────────────┘
```

This panel is **reactive to what the user is looking at**:
- Viewing feed → panel shows morning thoughts, suggestions
- Viewing a specific review item → panel shows what Ditto checked, confidence, provenance
- Viewing a process → panel shows trust evidence, performance data
- User types in the chat bar → panel can show the conversation thread too

### Feed Cards: Compact and Scannable

**Before (current):**
```
┌─────────────────────────────────────────┐
│ (  Dev PM (Standalone)     pm-execute   │  ← RED text, step ID exposed
│ (  Dev PM encountered...               │
│ (                                       │
│ (  CLI adapter timed out...            │
│ (                                       │
│ (  [Investigate]  [Pause]   Ask Self   │  ← Big buttons
│ (                                       │
└─────────────────────────────────────────┘
```

**After (redesigned):**
```
┌─────────────────────────────────────────┐
│ ⚠ Henderson quote hit a snag           │  ← User language, neutral name
│   Couldn't finish pricing — timed out   │  ← Plain explanation
│   Investigate · Pause · Ask Ditto       │  ← Compact text links
└─────────────────────────────────────────┘
```

**Grouped exceptions:**
```
┌─────────────────────────────────────────┐
│ ⚠ 3 issues with your workflow          │  ← Collapsed group
│   All timed out during the same step    │
│   Investigate all · Dismiss             │
└─────────────────────────────────────────┘
```

### Chat Input: Bottom of Center Column

```
┌────────┬──────────────────────────┬──────────────┐
│ NAV    │ FEED / DETAIL            │ DITTO PANEL  │
│        │                          │              │
│        │  [feed cards here]       │ [contextual  │
│        │                          │  thinking]   │
│        │                          │              │
│        │ ─────────────────────── │              │
│        │ [Message Ditto...   ↑]  │              │
└────────┴──────────────────────────┴──────────────┘
```

The prompt input sits at the bottom of the center column, just like it does in conversation-only mode. When the user types, the center panel can transition to show conversation (the Self responds inline), or the Self responds in the right panel. The key: the input is where the user's eyes already are — center.

---

## Acceptance Criteria for Redesign

1. [ ] Right column shows contextual intelligence (what Ditto checked, confidence, provenance), NOT a chat window
2. [ ] Right column content is reactive — changes based on what the user is viewing in the center
3. [ ] Chat input is at the bottom of the center column (persistent, full-width within content area)
4. [ ] Sidebar groups items as: action-required first (with count), then running processes
5. [ ] System processes never appear in the sidebar
6. [ ] Exception cards are single-line-scannable (status icon + description + compact actions on one visual line; no multi-paragraph error dumps)
7. [ ] Repeated exceptions of the same type are grouped with a count and bulk action
8. [ ] Card names use user language (the item's name, not "Dev PM (Standalone)")
9. [ ] Card actions use compact text links, not bordered buttons (except primary action)
10. [ ] Process name in cards is neutral color (not red/accent), status conveyed by icon
11. [ ] Shift report card is the most prominent (larger, narrative), exceptions are compact
12. [ ] Right panel has a sensible default state when no contextual intelligence is available (e.g., general suggestions, process health summary)
13. [ ] Right panel reactive states defined: feed view → morning thoughts; review item → checks + confidence; process → trust evidence; empty → general guidance

---

## Primitives Affected

| Primitive | Change | Human Job |
|-----------|--------|-----------|
| Conversation Thread | Input moves to center column bottom | Define, Review, Capture |
| Process Card (sidebar) | Grouped by urgency, not just type | Orient |
| Activity Feed | Cards redesigned for density/clarity | Orient, Review |
| Review Queue | Inline review remains, cards get compact | Review |
| Trust Control | Stays in process detail (unchanged) | Delegate |

---

## What This Is NOT

- Not a full redesign of the workspace concept — the three-panel layout is correct
- Not changing the progressive reveal logic — conversation-first is right
- Not removing the Self — it's being elevated (right panel = its intelligence, not just a chat window)
- Not changing the API or data model — purely presentation layer

---

## Next Steps

1. Builder implements the layout fix (chat input → center, right panel → contextual)
2. Builder implements card redesign (compact, grouped, user language)
3. Impeccable `/audit` can be run on the result for polish
