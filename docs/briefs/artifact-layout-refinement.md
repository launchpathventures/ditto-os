# Brief: Artifact Layout Refinement

**Date:** 2026-03-27
**Status:** Ready for review
**Context:** All 5 artifact prototypes (P36-P40) were built with a flawed layout — conversation dominates the centre while the artifact is squeezed into a 420px right panel. This contradicts `.impeccable.md` Principle #1 ("Artefacts are primary, conversation is secondary"). User feedback confirmed: the layout must invert. Additionally, an image creation workflow prototype (P41) is missing from the set.
**Inputs:** `.impeccable.md`, `docs/adrs/023-artifact-interaction-model.md`, user design feedback (2026-03-27)

---

## The Problem

The current artifact prototypes use this layout:

```
Nav (240px) | Conversation (centre, flex) | Artifact (right panel, 420px)
```

This is wrong. The conversation dominates the screen. The artifact — the thing the user actually cares about — is crammed into a narrow side panel. The Ditto context panel disappears entirely in artifact mode, losing process context and knowledge citations.

## The Layout Model

### Standard Workspace (no artifact open)

Three columns. Unchanged from `.impeccable.md`:

```
┌──────────┬───────────────────────────────┬────────────┐
│ Sidebar  │        Centre Content         │   Ditto    │
│ 240px    │        flex (min 480px)       │  Context   │
│          │                               │   320px    │
│ Today    │  [Feed / Conversation /       │            │
│ Inbox 3  │   Review / Detail]           │ [process   │
│ Work     │                               │  context,  │
│ Projects │  ┌─────────────────────────┐ │  knowledge │
│ Routines │  │ Input bar (sticky btm) │ │  citations]│
│ Settings │  └─────────────────────────┘ │            │
└──────────┴───────────────────────────────┴────────────┘
```

### Artifact Mode (artifact open for editing/review)

The sidebar **collapses** (icon rail at 56px or fully hidden). The conversation slides left into the freed space. The artifact takes the dominant centre. The Ditto context panel **stays put** — it never disappears.

```
┌──────────────┬──────────────────────────────┬────────────┐
│ Conversation │         Artifact             │   Ditto    │
│   300px      │      centre (flex)           │  Context   │
│              │                              │   320px    │
│ [refinement  │  [document / code /         │            │
│  thread]     │   image / email /           │ [knowledge │
│              │   clinical notes /          │  used,     │
│              │   content pack]             │  process   │
│              │                              │  context,  │
│              │  ┌────────────────────────┐ │  provenance│
│ ┌──────────┐ │  │ provenance + actions  │ │  citations]│
│ │ input    │ │  └────────────────────────┘ │            │
│ └──────────┘ │                              │            │
└──────────────┴──────────────────────────────┴────────────┘
     Sidebar collapsed (icon rail or hidden)
```

**Column specs:**
- Conversation: **300px fixed**. Compact — messages during refinement are short instructions ("use Q4 rates", "punchier caption"). Input bar at bottom.
- Artifact: **flex (min 480px)**. The dominant surface. Type-specific rendering (document, code, image, email, etc.).
- Ditto Context: **320px fixed, collapsible**. Defaults to open. User can dismiss for wider artifact editing. Shows knowledge citations, process context, related items.

**The transition is graceful:** physically it's still 3 visible columns. The content shifts — sidebar content (nav) swaps for conversation content, and what was the centre (conversation) becomes the centre (artifact). The right panel stays identical.

### Ditto Context Panel (right, always present)

In artifact mode, the context panel shows **why you should trust this output**:

- **Knowledge used** — "Based on: PlaceMakers prices (Mar 25), Henderson specs, your margin rules"
- **Process context** — which process produced this, what step, what trust level
- **Related items** — other artifacts from same process run
- **Version history** — v1 → v2 → v3 with change summaries (compact list, not full version bar)
- **Teach-this prompts** — when the system spots a learnable pattern

This is what makes Ditto different from Claude Artifacts. The persistent provenance builds trust.

### Collapse behaviour

| Viewport | Sidebar | Conversation | Artifact | Context |
|----------|---------|-------------|----------|---------|
| ≥1440px | Icon rail (56px) | 300px | flex | 320px |
| 1280-1439px | Hidden | 300px | flex | 320px |
| 1024-1279px | Hidden | 280px | flex | 280px |
| <1024px | Hidden | Hidden (swipe) | Full width | Hidden (swipe) |

Mobile: full-screen artifact with swipe-left for conversation, swipe-right for context. Bottom sheet for actions.

---

## Work Items

### 0. Spec Updates

Before building prototypes:

| Item | What changes |
|------|-------------|
| `.impeccable.md` | Add "Artifact Mode" layout section under Layout. Document the 3→3 column transition (nav→conversation swap). Document context panel collapsibility. |
| `docs/adrs/023-artifact-interaction-model.md` | Update Section 2 (Right Panel: Two Modes) — artifact is NOT in the right panel, it's in the centre. Right panel stays as context. Update the "vibe-coding insight" framing to match. |

### 1. Rebuild All 5 Artifact Prototypes

All use the same layout shell. Build P36 first as reference, then the rest follow the pattern.

| # | Prototype | Artifact type | Centre content | Context panel content |
|---|-----------|---------------|----------------|----------------------|
| P36 | Document | Rawlinsons cost estimate | Formatted document — line items table, assumptions, totals. Version bar. Max-width 720px. | "Based on: PlaceMakers prices, Henderson specs, margin rules." Process: Quoting. Trust: Spot check. |
| P37 | Content pack | Steven Leckie 6-piece | Tabbed preview — [Listing][Post 1-3][Script][Email]. Phone frames for Instagram. Pack grid header. | "Based on: brand voice guide, listing template, Marina Bay brochure." Process: Content. Trust: Check everything. |
| P38 | Code | Abodo bank reconciliation | Syntax-highlighted code (dark bg, JetBrains Mono). Line numbers. Diff highlighting on refinement. | "Based on: ASB CSV format, Xero API docs, your reconciliation rules." Process: Integration. Trust: You review. |
| P39 | Email | Henderson follow-up | Email preview (To/From/Subject/Body) in centred max-width 640px. macOS mail styling. | "Based on: Henderson project history, your communication preferences." Process: Client comms. Trust: Spot check. |
| P40 | Clinical notes | Jay consultation | Structured sections — Assessment, Findings (blood panel grid), Plan, Follow-ups. Voice indicator in conversation column. | "Based on: patient history, lab results (Mar 24), clinical methodology." Process: Consultation. Trust: You review. |

**States per prototype:** Same 3-4 states as currently spec'd (generate → refine → refine again → approve). The content is the same — only the layout changes.

### 2. New Prototype: P41 Image Creation

**Persona:** Libby — creating Instagram carousel for her birth preparation course.
**Artifact type:** Image
**Centre content:** Large image preview with zoom controls. Aspect ratio selector (1:1, 4:5, 16:9). Before/after comparison slider on refinement.
**Context panel:** "Based on: brand colour palette, previous post engagement data, course module 3 content." Process: Social content. Trust: Check everything.

**States:**
1. **Generation** — Libby says "Create an Instagram carousel for the breathing techniques module — 4 slides, warm and calming, use the brand palette." Conversation shows the request + Ditto's plan ("4 slides: cover, box breathing visual, 4-7-8 technique, CTA"). Centre shows first generated image with slide navigation (1/4, 2/4...).
2. **Refinement** — "The colours are too cool — warmer, more terracotta and sage." Centre shows before/after comparison. Diff: colour temperature shift visible. Context panel shows: "Brand palette updated: added warm tones per your feedback."
3. **Text overlay** — "Add the course name at the bottom of slide 1." Centre shows text overlay controls (position, size, font). Conversation is one line.
4. **Approval** — "Perfect, schedule for Thursday 9am." Status: Scheduled. Destination: Instagram Thu 9am. Teach-this: "Libby prefers warm earth tones over cool blues for course content."

### 3. Consistency Pass

After all 6 prototypes are built:
- Verify all use identical layout shell CSS
- Verify context panel content is meaningful per prototype (not placeholder)
- Verify conversation column shows realistic refinement dialogue
- Update `docs/prototypes/index.html` with P41
- Update `docs/prototypes/PLAN.md` compliance matrix

---

## Build Order

```
0. Spec updates (.impeccable.md + ADR-023)           ← alignment first
1. P36 Document (reference prototype)                 ← establishes the pattern
2. P38 Code                                          ← most benefits from wide centre
3. P39 Email                                         ← simplest, fast to build
4. P40 Clinical Notes                                ← voice indicator in conversation col
5. P37 Content Pack                                  ← most complex (tabs + phone frames)
6. P41 Image Creation (NEW)                          ← new prototype
7. Consistency pass + index updates                   ← final
```

P36 is the reference. Once approved, P38-P41 follow the pattern mechanically.

---

## Acceptance Criteria

1. **Artifact dominates:** Centre column is visibly the primary surface in all 6 prototypes. No ambiguity about what the user is looking at.
2. **Conversation is compact:** Left column (300px) shows refinement thread with short messages. Input bar at bottom. No wasted space.
3. **Context panel persists:** Right panel (320px) shows knowledge citations, process context, provenance in all states. Never blank, never hidden by default.
4. **Context panel is collapsible:** A toggle (chevron or collapse icon) lets the user dismiss the context panel for wider artifact editing. Artifact expands to fill.
5. **Sidebar absent:** Nav sidebar is not visible in artifact mode (icon rail or hidden).
6. **Layout transition is documented:** `.impeccable.md` has the artifact mode layout spec. ADR-023 matches.
7. **P41 exists:** Image creation workflow prototype with 4 states covering generate → refine → text overlay → schedule.
8. **All pass Rob/Libby test:** A non-technical person can understand what they're looking at without explanation.

---

## What This Does NOT Change

- Standard workspace layout (3 columns with sidebar) — unchanged
- Mobile layout — still full-screen with swipe navigation
- Block vocabulary — unchanged (21 types)
- Engine representation of artifacts — unchanged (ADR-023 Section 7)
- Conversation refinement protocol — unchanged (ADR-023 Section 5)
