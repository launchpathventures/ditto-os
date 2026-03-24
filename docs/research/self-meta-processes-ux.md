# UX Research: Process-Driven Conversation — How Different Processes Shape the UI

**Date:** 2026-03-24
**Role:** Dev Designer
**Status:** Draft v2 — reframed from "UI modes" to "processes that shape the conversation"
**Triggered by:** Realisation that the conversation surface needs to feel different depending on what process the Self is running
**Consumers:** Dev Architect (ADR-009 v2 extension, component catalog), Dev Builder

---

## The Insight

The current prototype shows one interaction pattern: **briefing and review.** But the Self runs many different processes, and each produces different artefact types that render differently in the conversation surface.

**The key reframe:** The UI doesn't have "modes." The **process** determines what gets rendered. The conversation surface is a single component with a **component catalog** (ADR-009 v2, json-render pattern) that renders whatever the active process produces. Different processes produce different component types → the conversation naturally feels different.

This connects three existing architecture concepts:
1. **Process as primitive** — every type of work (onboarding, strategy, capture, review) is a process
2. **ADR-009 v2 catalog-constrained rendering** — a finite catalog of renderable component types, not arbitrary UI
3. **The Self's tool use** — the Self delegates to processes, processes produce structured outputs, the conversation renders them

**The conversation surface doesn't need to know about "modes."** It just renders components from the catalog. The process decides which components to produce.

---

## The Component Catalog for Conversation

Each process type produces specific **output components** from a defined catalog. The conversation surface renders them inline. This is the json-render pattern applied to conversation content.

### Catalog of Conversation Components

| Component | Produced by | What it renders |
|-----------|------------|-----------------|
| **Text message** | All processes | Plain conversational text from the Self |
| **Knowledge synthesis card** | Onboarding, knowledge capture | "Here's what I'm learning" — structured summary, editable |
| **Living document pane** | Strategy sessions, brand definition | Side panel with a document that updates as the conversation progresses |
| **Work item card** | Execution, review | Quote/task summary with details grid + action buttons (existing prototype) |
| **Roadmap card** | Planning processes | Phased, sequenced list of work with status indicators |
| **Synthesis card** | Research, capture, analysis | Extracted themes/insights from uploaded content, with evidence |
| **Knowledge health card** | Knowledge development | Progress bars showing knowledge depth per topic, with gap identification |
| **Risk checklist card** | Risk review, pre-launch | Checklist with ✓/⚠/● status, evidence, and mitigations |
| **Status cards (grid)** | Briefing, health check | 2x2 or 3-column cards showing process health with colour-coded headers |
| **Metrics row** | Briefing, performance review | Key numbers with labels (existing in shift report prototype) |
| **Sparkline** | Performance, trends | Inline data visualisation (existing in prototype) |
| **Progress bar** | Trust, quality, completion | Inline progress indicator (existing in prototype) |
| **Self-aside callout** | Any — when the Self flags something | Warm-tinted callout with left border (existing in prototype) |
| **Action buttons** | Any — when user decision is needed | Primary/secondary/ghost buttons (existing in prototype) |
| **File receipt** | Capture processes | Confirmation that a file was received + processing status |
| **Comparison card** | Research, analysis | Side-by-side or before/after comparison of data |

**The catalog is finite and designed.** A process can't produce arbitrary HTML — it produces structured data that maps to a catalog component. This is the same constraint as ADR-009 v2: "catalog-constrained, not arbitrary."

### How a Process Produces Components

A process step produces a structured output:

```yaml
# Example: onboarding process, "reflect understanding" step
output:
  type: knowledge-synthesis-card
  data:
    title: "What I'm learning"
    sections:
      - label: "You"
        content: "Doula, transitioning to online education and coaching"
      - label: "Ideal client"
        content: "Women 30-45, first pregnancy, anxious..."
      - label: "Brand voice"
        content: "Warm, empathetic, direct. Not clinical, not woo-woo."
      - label: "Right now"
        content: "Learning phase. Testing market interest."
    actions:
      - label: "This looks right"
        type: primary
      - label: "Let me adjust"
        type: secondary
```

The conversation surface receives this, looks up `knowledge-synthesis-card` in the component registry, and renders it. The process doesn't know about React or HTML — it produces structured data. The renderer handles the visual.

### Trust-Governed Catalog Richness (ADR-009 v2)

The component catalog grows with trust:

| Trust tier | Available components |
|-----------|---------------------|
| **Supervised** | Text, action buttons, self-aside, simple cards |
| **Spot-checked** | + Metrics, sparklines, progress bars, synthesis cards |
| **Autonomous** | + Living document pane, roadmap cards, knowledge health, risk checklists |

New users start with simpler components. As trust builds, richer artefacts become available. This is the existing ADR-009 v2 pattern applied to the conversation surface.

---

## The Self's Process Repertoire

These are processes the Self knows about and can initiate. They're not hardcoded modes — they're actual process definitions that run through the harness.

Each process is described by: what it does, when the Self initiates it, and what components it produces.

### 1. Onboarding — "Getting to Know You"

**Purpose:** Build the user model. Understand who they are, what they do, what hurts.
**Pace:** Slow, exploratory, open-ended. The Self asks more than it tells.
**Duration:** 10-30 minutes on first contact. Fragments over the first week.
**Artefacts produced:** User model, initial workspace structure, first process candidates.

**How it feels differently:**
- The Self's messages are **questions, not statements.** The ratio flips — normally the Self talks more, during onboarding the user talks more.
- **No cards, no data, no actions.** Pure conversation. The UI is at its most spacious and simplest.
- A **subtle progress indicator** shows the Self building understanding — not a step wizard, but a gentle signal like "I'm starting to get a picture of your business" or a small visual showing topics covered.
- The Self **reflects back** what it's learning: "So let me make sure I've got this — you're a doula building an online education business, your ideal client is..." This becomes the seed of the "What I Know" view.

**Libby's experience:**
```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  ● Self                                              │
│                                                      │
│  Hi, I'm your Self — think of me as a colleague      │
│  who'll learn how your world works and help you       │
│  run it.                                             │
│                                                      │
│  I'd love to understand what you do. What's your     │
│  business — or what are you building?                │
│                                                      │
│                                                      │
│                                                      │
│  ─────────────────────────────────────────────────── │
│  What's on your mind?                       🎤  📎   │
└─────────────────────────────────────────────────────┘
```

After 15 minutes of conversation:

```
● Self

Here's what I'm taking away so far:

┌─ What I'm Learning ──────────────────────────┐
│                                               │
│  You: Doula, transitioning to online          │
│  education and coaching                       │
│                                               │
│  Ideal client: Women 30-45, first             │
│  pregnancy, anxious, want practical not       │
│  theoretical support                          │
│                                               │
│  Brand voice: Warm, empathetic, direct.       │
│  "Not clinical, not woo-woo"                  │
│                                               │
│  Right now: Learning phase. Completing        │
│  courses. Testing market interest via         │
│  social media and surveys.                    │
│                                               │
│  First priority: Social media content         │
│  that tests resonance with your ideal         │
│  client                                       │
│                                               │
│  [This looks right]  [Let me adjust]          │
└───────────────────────────────────────────────┘

Anything I'm missing or getting wrong?
```

**UI difference from normal conversation:**
- The "What I'm Learning" card is a new component — a **knowledge synthesis card**. It appears when the Self has accumulated enough understanding to reflect back. It's editable — the user can tap "Let me adjust" and correct directly.
- The conversation feels more like a **warm interview** than a briefing. Longer Self questions, shorter Self statements.
- No action buttons, no approve/reject, no feed cards. Just talk.

---

### 2. Strategy Session — "Define, Structure, Decide"

**Purpose:** Help the user make strategic decisions — brand foundations, persona definition, positioning, pricing, course structure, process design.
**Pace:** Structured but conversational. The Self leads with frameworks but adapts.
**Duration:** 20-60 minutes per session. May span multiple sessions.
**Artefacts produced:** Strategy documents, persona profiles, brand guides, roadmaps.

**How it feels differently:**
- The Self becomes more **structured.** It uses frameworks, asks questions in a sequence, builds a document alongside the conversation.
- A **live artefact panel** appears — the document being built shows alongside the conversation. Like Claude Canvas or ChatGPT Canvas, but for strategy docs not code.
- The user sees the document taking shape in real-time as they answer questions. This is the "Process Builder dual pane" from human-layer.md, but for any strategic document.
- The Self uses **options and trade-offs**, not just open questions: "There are two ways to position this — practical toolkit or transformational journey. Here's what each means for your audience..."

**Libby — Brand Strategy Session:**

```
┌──────────────── Conversation ─────────────┬──── Brand Foundation ────────┐
│                                            │                             │
│  ● Self                                    │  Libby's Brand              │
│                                            │  ──────────────             │
│  Let's nail your brand voice. I'll ask     │                             │
│  a few questions and build a guide as we   │  Voice                      │
│  go — you'll see it take shape on the      │  Warm, empathetic, direct.  │
│  right.                                    │  Not clinical. Not woo-woo. │
│                                            │  "I've been where you are"  │
│  First — when you talk to a nervous        │  energy.                    │
│  first-time mum, what's the first thing    │                             │
│  you want her to feel?                     │  Audience                   │
│                                            │  Women 30-45, first         │
│                        Safe. Not judged.   │  pregnancy, professionals   │
│                                            │  who research everything.   │
│  ● Self                                    │                             │
│                                            │  Positioning                │
│  "Safe and not judged." That's powerful.   │  ⏳ Defining...             │
│  I've added that to your brand voice.      │                             │
│                                            │  Differentiators            │
│  Now — how are you different from the      │  ⏳ Defining...             │
│  other doula educators out there?          │                             │
│  What do you bring that they don't?        │                             │
│                                            │  [Edit]  [Export]           │
│                                            │                             │
│  ─────────────────────────────────────────────────────────────────────── │
│  What's on your mind?                                            🎤  📎 │
└──────────────────────────────────────────────────────────────────────────┘
```

**UI difference:**
- **Dual-pane layout** — conversation left, living document right. The document updates as the conversation progresses.
- **The document is the artefact** — it persists after the session. It becomes part of the workspace knowledge.
- The Self uses **more structure** in its questions (building toward a complete document) but stays conversational.
- **Progress is visible** — "⏳ Defining..." shows what's still needed. The user can see the shape of what's being built.

---

### 3. Roadmap / Planning — "What's Next, In What Order"

**Purpose:** Help the user sequence their work — what to do first, what depends on what, what can wait.
**Pace:** Structured, forward-looking. The Self proposes, the user adjusts.
**Duration:** 15-30 minutes.
**Artefacts produced:** A prioritised list or visual roadmap.

**How it feels differently:**
- The Self presents a **proposed sequence** and explains the reasoning.
- Items are **draggable/reorderable** — the user can adjust priorities directly.
- Dependencies are shown: "You need the persona done before the content strategy makes sense."
- Timeline is flexible: "This week / Next 2 weeks / When you're ready"

**Libby — What's Next:**

```
● Self

Based on where you are, here's what I'd suggest
focusing on and in what order:

┌─ Your Roadmap ──────────────────────────────────┐
│                                                  │
│  This week                                       │
│  ├─ ✓ Define ideal client persona                │
│  ├─ → Nail brand voice (strategy session)        │
│  └─ → Draft 5 Instagram test posts               │
│                                                  │
│  Next 2 weeks                                    │
│  ├─ ○ Send survey round 2 (with new positioning) │
│  ├─ ○ Landing page with waitlist                 │
│  └─ ○ Content calendar (weekly cadence)          │
│                                                  │
│  When you're ready                               │
│  ├─ ○ Course outline (needs more client data)    │
│  ├─ ○ Website (needs brand + content)            │
│  └─ ○ CRM setup (needs paying clients)           │
│                                                  │
│  → = suggested next   ○ = upcoming   ✓ = done   │
│                                                  │
│  [This looks right]  [Let me adjust]             │
└──────────────────────────────────────────────────┘

The persona is done — nice work this week. Brand
voice is the next unlock because everything else
(content, landing page, course) needs it.

Want to do a brand strategy session now?
```

**UI difference:**
- A **roadmap card** — structured, visual, with clear phases and status
- Items link to the work they represent — tapping "Landing page" opens that work item
- The Self **explains sequencing logic** — "brand voice is the next unlock because..."
- Action buttons lead to the next activity: "Want to do a brand strategy session now?"

---

### 4. Research & Capture — "Learn, Absorb, Synthesise"

**Purpose:** The user is feeding the system — forwarding articles, uploading course notes, sharing survey responses, capturing voice notes from the field.
**Pace:** Fast, lightweight. Drop things in, the Self processes.
**Duration:** Moments throughout the day.
**Artefacts produced:** Synthesised knowledge, extracted themes, tagged captures.

**How it feels differently:**
- The input area becomes more prominent — **capture mode**. Quick drop of text, voice, files.
- The Self responds with **brief confirmations and synthesis**, not long conversations.
- Batch capture: multiple items can be dropped in sequence.
- The Self periodically synthesises: "You've shared 8 things this week. Three themes are emerging..."

**Libby — Capturing Survey Responses:**

```
                              📎 survey-round-2.csv

● Self

Got it. 23 responses. Let me pull out the themes.

┌─ Survey Synthesis ───────────────────────────┐
│                                               │
│  23 responses (round 2)                       │
│                                               │
│  Top themes:                                  │
│  1. "I want practical tools, not theory"      │
│     (mentioned by 18 of 23)                   │
│  2. "I'm scared of being judged by other      │
│     mums" (14 of 23)                          │
│  3. "I want to hear from someone who's        │
│     been through it" (12 of 23)               │
│                                               │
│  New in this round:                           │
│  • Price sensitivity — 7 mentioned cost       │
│  • Partner involvement — 5 want content       │
│    their partner can use too                  │
│                                               │
│  Compared to round 1:                         │
│  "Not judged" grew from 40% to 61%.           │
│  This is your strongest resonance signal.     │
│                                               │
│  [Save to knowledge base]  [Discuss further]  │
└───────────────────────────────────────────────┘

The "not judged" theme keeps getting stronger.
Want me to lean into that in this week's content?
```

**UI difference:**
- **File/content drops** are the primary interaction — user drops things in, Self processes
- **Synthesis cards** show extracted insights, not raw data
- **Comparison to previous** — the Self connects new information to existing knowledge
- **"Save to knowledge base"** button — explicit action to persist the synthesis

---

### 5. Knowledge Development — "Build the Brain"

**Purpose:** Deliberately building up the knowledge base — not incidental capture, but intentional knowledge structuring.
**Pace:** Medium. Mix of conversation and structured input.
**Duration:** 15-30 minute sessions.
**Artefacts produced:** Structured knowledge entries, updated workspace knowledge.

**How it feels differently:**
- The Self **asks what it doesn't know yet**: "I've got your brand voice and persona, but I don't know your pricing strategy. Want to work on that?"
- A **knowledge map** shows what's well-defined vs. sparse vs. unknown
- The user can **teach the Self explicitly**: "When I say 'gentle', I mean calm but confident, not passive"

**Libby — Knowledge Development:**

```
● Self

Here's what I know well and what I'm thin on:

┌─ Knowledge Health ───────────────────────────┐
│                                               │
│  Strong                                       │
│  ██████████  Brand voice                      │
│  ████████░░  Ideal client persona             │
│  ████████░░  Survey insights                  │
│                                               │
│  Developing                                   │
│  █████░░░░░  Content themes                   │
│  ████░░░░░░  Competitive landscape            │
│                                               │
│  Unknown                                      │
│  ░░░░░░░░░░  Pricing strategy                 │
│  ░░░░░░░░░░  Course structure                 │
│  ░░░░░░░░░░  Technology / platform choices    │
│                                               │
│  [Work on pricing]  [Work on course]          │
│  [Tell me about competitors]                  │
└───────────────────────────────────────────────┘

What would be most useful to develop next?
```

**UI difference:**
- **Knowledge health visualisation** — progress bars or a heat map showing depth of knowledge
- **Gap identification** — the Self proactively shows what it doesn't know
- **Suggested next sessions** — buttons lead directly into focused knowledge-building conversations
- This is the evolution of the "What I Know" view — but proactive and action-oriented

---

### 6. Execution & Review — "The Operating Mode"

**Purpose:** The current prototype — running processes, reviewing outputs, approving, adjusting.
**Pace:** Quick, action-oriented. Review, decide, move on.
**Duration:** 3-15 minutes per session.
**Artefacts produced:** Approved outputs, corrections, trust adjustments.

**UI:** This is what prototypes 01, 02, 03 already show. Morning briefing, feed cards, approve/adjust, trust calibration.

---

### 7. Risk & Review — "What Could Go Wrong"

**Purpose:** Proactive risk scanning, quality review, reality check.
**Pace:** Periodic, triggered by milestones or detected patterns.
**Duration:** 5-15 minutes.
**Artefacts produced:** Risk assessments, recommendations, watchlist items.

**How it feels differently:**
- The Self raises concerns unprompted: "Before you launch the landing page, a few things worth checking..."
- **Risk cards** present potential issues with evidence and suggested mitigations
- Tone shifts to **careful, considerate** — not alarming, but thorough

**Libby — Pre-Launch Review:**

```
● Self

Before you go live with the landing page,
I want to flag a few things:

┌─ Pre-Launch Check ───────────────────────────┐
│                                               │
│  ✓ Brand voice — consistent across all copy   │
│  ✓ Persona alignment — messaging matches      │
│    your ideal client                          │
│                                               │
│  ⚠ Pricing not mentioned anywhere — some      │
│    visitors will want to know cost range      │
│    before signing up. Worth adding "from      │
│    $X" or "free intro session"?               │
│                                               │
│  ⚠ No social proof yet — could you add 1-2   │
│    testimonials from your doula clients?      │
│                                               │
│  ● Privacy policy is missing — required       │
│    if you're collecting emails                │
│                                               │
│  [Fix these]  [Launch anyway]  [Discuss]      │
└───────────────────────────────────────────────┘
```

---

## How Processes Shape the Conversation Surface

The conversation surface is **one component** with a **component catalog**. It renders whatever the active process produces. The UI doesn't switch modes — the process determines what appears.

### The Rendering Pipeline

```
Process step executes
  → produces structured output (type + data)
    → conversation surface looks up component type in catalog
      → renders the appropriate component inline

Example:
  onboarding process, step "reflect understanding"
    → output: { type: "knowledge-synthesis-card", data: {...} }
      → catalog maps "knowledge-synthesis-card" to <KnowledgeSynthesisCard />
        → renders inline in conversation with editable fields
```

This is the json-render pattern from ADR-009 v2 applied to the conversation surface. The catalog is the same catalog used for process output rendering in the workspace feed — the conversation just renders them inline instead of in feed cards.

### Process → Components Mapping

| Process | Components it produces |
|---------|----------------------|
| **Onboarding** | text, knowledge-synthesis-card |
| **Strategy session** | text, living-document-pane (side panel), action-buttons |
| **Roadmap planning** | text, roadmap-card, action-buttons |
| **Research & capture** | text, file-receipt, synthesis-card, comparison-card |
| **Knowledge development** | text, knowledge-health-card, action-buttons |
| **Execution & review** | text, work-item-card, status-cards, metrics-row, sparkline, action-buttons |
| **Risk & review** | text, risk-checklist-card, action-buttons |
| **Morning briefing** | text, status-cards, metrics-row, work-item-card, sparkline |

### What the User Experiences

The Self doesn't announce "We're now running an onboarding process." It just starts asking questions. When it produces a knowledge-synthesis-card, the conversation surface renders it. When the process shifts to strategy, a living-document-pane appears alongside the conversation.

The user experiences a colleague who naturally adjusts their tools to the work. The architecture behind it: the Self delegates to a process, the process runs through the harness, the process produces structured output, the conversation renders it from the catalog.

**A subtle process indicator** appears near the Self dot — "Getting to know you" / "Brand strategy" / "Weekly review" — so the user has context. But this is informational, not a control. The Self manages process transitions.

### Catalog Governance

The component catalog is **finite and designed** (ADR-009 v2 principle). A process can't produce arbitrary HTML. Each output type maps to a pre-designed, accessibility-tested component. New component types require a design decision — they're added to the catalog, not invented per-process.

Trust tiers govern catalog richness:
- **Supervised:** text, action-buttons, self-aside, simple work-item-card
- **Spot-checked:** + metrics, sparklines, progress bars, synthesis-card
- **Autonomous:** + living-document-pane, roadmap-card, knowledge-health-card, risk-checklist-card

This prevents untrusted processes from rendering complex interactive components.

---

## New Prototypes Needed

The existing prototypes (01-03) show the execution/review components. What's needed:

1. **Prototype 04: Onboarding** — Libby's first contact. Pure conversation + knowledge-synthesis-card appearing mid-way. Shows how the catalog renders onboarding process output.
2. **Prototype 05: Strategy Session** — Dual-pane (conversation + living-document-pane). Libby defining her brand. Shows the most complex catalog component.
3. **Prototype 06: Knowledge & Capture** — File drop → synthesis-card + knowledge-health-card. Shows capture-oriented process output.

These three plus the existing three demonstrate the full component catalog in context.

---

## Implications for Architecture

| Concept | What the Architect needs to design |
|---------|-----------------------------------|
| **Component catalog for conversation** | Extension of ADR-009 v2 catalog to cover conversation-inline components (not just feed/output rendering) |
| **Process output schema** | Each process step output declares a `type` from the catalog + structured `data`. The renderer is generic. |
| **Living document pane** | A side panel that updates as a process runs. Requires streaming updates to a persistent artefact alongside the conversation. Most complex component. |
| **Knowledge graph** | Workspace-scoped knowledge store with confidence scoring and gap detection. Powers the knowledge-health-card. |
| **Process repertoire** | The Self's library of initiatable processes (onboarding, strategy, capture, etc.). Each is a real process YAML. |

These are Architect decisions. The Designer's output is: the component catalog with visual specs for each component type, and the user experience of each process type expressed through those components.
