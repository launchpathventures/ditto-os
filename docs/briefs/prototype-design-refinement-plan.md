# Prototype Design Refinement Plan

## Context
24-screen prototype-as-specification strategy. Phase A (P00, P23, P08, P08a, P09, P10, P11) is structurally complete. Design critique of P08a scored 24/40 — identified systematic issues that apply across all prototypes.

## Design Critique Findings (P08a, applies globally)

### P0: Information density overwhelming
- Knowledge panel uses 9-12px type (spec minimum is 12px)
- Cards stacked with only 10px gaps
- 3+ nesting levels in knowledge cards
- Fix: increase type to 12px min, increase card spacing to 14px, collapse "Still to explore" by default, show top 3 voice traits with "+N more"

### P1: Message bubbles lack consistent rhythm
- Ditto messages sometimes have bg, sometimes don't
- Messages fill full panel width — need max-width ~640px
- Stacked elements inside messages have 10px gaps — need 16px
- Panel padding asymmetry (28px/32px conversation vs 20px knowledge)
- Fix: consistent bubble treatment, max-width, normalise padding to 24px

### P2: Card type proliferation — 7 distinct styles
- synthesis, guided, never, process, connect-offer, k-card, output-card
- No shared anatomy — each has different spacing, labels, borders
- Fix: define ONE card anatomy, differentiate by colour accent only (left border stripe or background tint)

### P2: Process card too dense (State 4)
- ~15 distinct elements in one card
- Fix: split into concept card + expandable settings, move stats to knowledge panel

### P3: State bar cramped
- 5 buttons with long labels at 12px
- Fix: shorten to "Opening", "Voice & rules", "Connect", "Build process", "First output". Drop minute counts. Increase padding.

## Execution Plan

### Phase 1: Design System Extraction (do first — applies to everything)
1. Define shared card anatomy CSS classes (replaces 7 ad-hoc styles)
2. Define consistent spacing tokens for knowledge panel
3. Define message bubble rules (when bg, max-width, stacking gaps)
4. Create reusable component patterns that all prototypes share

### Phase 2: P08a Refinement (highest priority — most complex screen)
1. Apply new card system to all card types
2. Fix knowledge panel density — larger type, collapsed sections, breathing room
3. Fix conversation panel — message max-width, consistent bubbles, padding normalisation
4. Simplify process card (State 4) — split concept from settings
5. Shorten state bar labels
6. Re-run /critique to verify improvement

### Phase 3: Design Audit of P00, P23, P08
1. Run /critique on each
2. Apply shared card system and spacing fixes
3. Ensure navigation flow works end-to-end

### Phase 4: Review P09-P11 against new standards
1. These exist from earlier work — may need significant updates
2. Apply new nav bar (already done), shared card system, design system tokens
3. Verify Libby's content is consistent across the flow

### Phase 5: Phase B-D Prototypes (P12-P20+)
1. P12-P20 exist from earlier work — need design audit
2. New screens (P14a Review Queue, P27 Process Flow Map, P29 Process Model Library) still need creation
3. Apply design system consistently from the start

## Key Principles for Next Session
- Start with `/critique` to baseline, end with `/critique` to verify
- Use `/distill` -> `/normalize` -> `/polish` sequence for refinement
- Every prototype must pass against .impeccable.md design system
- Prototypes ARE the spec — they must be build-ready, not wireframes
