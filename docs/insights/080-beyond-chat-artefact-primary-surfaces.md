# Insight-080: Beyond Chat — The Artefact is the Primary Surface, Not the Conversation

**Date:** 2026-03-24
**Trigger:** User challenge: "Is chat the best way for this process to unfold? Chat is such an overused primitive and biases people who are text-first and lacks visual information hierarchy, process evolution etc."
**Layers affected:** L6 Human (fundamental interaction model), Conversational Self (ADR-016), all process types
**Status:** active — significant reframe of the interaction model

## The Problem with Chat as Primary

Chat has five fundamental limitations:

1. **Text-biased.** It privileges people who think in words. Libby might think visually about her brand. Tim might think spatially about his clients. Chat forces everything into linear text.

2. **Linear.** You can only scroll up and down. There's no spatial organisation. A conversation about brand voice and a conversation about pricing look identical — you can't see the shape of the work.

3. **No visual hierarchy.** Every message has the same visual weight. The Self's brilliant insight and the Self's "got it" acknowledgment occupy the same space. Nothing is elevated, nothing is subordinate.

4. **Doesn't show evolution.** A knowledge base that grows, a process that crystallises, a brand that sharpens — none of these evolutions are visible in a chat log. You'd have to re-read the whole conversation to see what changed.

5. **It's the lazy default.** Every AI product in 2025-2026 is a chat interface with varying levels of polish. Chat is the new blank text field. It doesn't signal that Ditto is fundamentally different from ChatGPT.

## The Reframe: Artefact-Primary Surfaces

**The thing being built is the primary surface. Conversation supports it, not the other way around.**

An architect doesn't chat about a building — they work on the *drawing*, and conversation happens around it. The drawing is primary.

A consultant doesn't chat about strategy — they build a *deck* or a *framework*, and conversation fills it in. The framework is primary.

**For Ditto, the artefact is always the primary surface.** Chat is one input method (and often the best one), but the visual centre of the screen should be the work taking shape — not the conversation that shapes it.

## What This Looks Like Per Phase

### Onboarding → Primary surface: THE USER MODEL TAKING SHAPE

Instead of chat-with-knowledge-card-at-the-end, the primary surface is a visual map of what the Self is learning about you. It starts almost empty and fills in as the conversation progresses. The conversation is a sidebar or an overlay, not the main event.

```
┌──────────────────────────────────────┬───── Self ─────┐
│                                      │                 │
│         ┌──────────┐                 │ Tell me about   │
│    ┌────│ Business │────┐            │ your ideal      │
│    │    └──────────┘    │            │ client.         │
│    ▼                    ▼            │                 │
│ ┌──────┐          ┌─────────┐       │          First  │
│ │ You  │          │ Client  │       │     time mums,  │
│ │Doula │          │ ???     │──→    │  professional   │
│ │Coach │          │         │       │     women 30s   │
│ └──────┘          └─────────┘       │                 │
│    │                                │ Got it. What    │
│    ▼                                │ about your      │
│ ┌──────────┐    ┌───────────┐      │ voice?          │
│ │ Voice    │    │ Stage     │      │                 │
│ │ ???      │    │ Building  │      │                 │
│ └──────────┘    └───────────┘      │                 │
│                                      │                 │
│ Your world is taking shape.          │                 │
│ 2 of 5 areas defined.               │ [What's on     │
│                                      │  your mind?]   │
└──────────────────────────────────────┴─────────────────┘
```

As Libby answers, cards fill in with colour and content. She can SEE her business model emerging spatially. She can click any card to expand it or tell the Self to focus on it. The conversation feeds the canvas — but the canvas is what she's looking at.

### Strategy Session → Primary surface: THE DOCUMENT BEING BUILT

Prototype 05 already gets this right. The brand guide is the primary surface. The conversation is secondary. But push further: the document should have interactive sections the user can click into, drag to reorder, and directly edit — not just read.

### Process Definition → Primary surface: THE PROCESS TAKING SHAPE

Instead of the Self describing a process in chat, the user sees the process emerging visually — steps appearing, connecting, filling in with detail. Like watching someone draw a flowchart while explaining it.

```
┌──────────────────────────────────────┬───── Self ─────┐
│                                      │                 │
│  Quoting Process                     │ So when a quote │
│                                      │ request comes   │
│  ┌─────────┐    ┌──────────┐        │ in, you...      │
│  │ Request │───▶│ Gather   │        │                 │
│  │ comes in│    │ specs +  │        │    I check the  │
│  │ ✓       │    │ pricing  │        │   price lists   │
│  └─────────┘    │ ✓        │        │   and work out  │
│                 └────┬─────┘        │   materials     │
│                      │              │                 │
│                      ▼              │ And then?       │
│                 ┌──────────┐        │                 │
│                 │ Draft    │        │   I add labour  │
│                 │ quote    │        │   and margin    │
│                 │ ✓        │        │                 │
│                 └────┬─────┘        │                 │
│                      │              │                 │
│                      ▼              │                 │
│                 ┌──────────┐        │                 │
│                 │ You      │        │                 │
│                 │ review ● │        │                 │
│                 └────┬─────┘        │                 │
│                      │              │                 │
│                      ▼              │                 │
│                 ┌──────────┐        │                 │
│                 │ Send to  │        │                 │
│                 │ customer │        │                 │
│                 │ ○        │        │                 │
│                 └──────────┘        │                 │
│                                      │                 │
└──────────────────────────────────────┴─────────────────┘
```

### Knowledge Building → Primary surface: THE KNOWLEDGE MAP

Instead of chat with a knowledge-health-card at the bottom, the primary surface IS the knowledge map — a visual representation of what the Self knows, with depth, gaps, and connections visible.

```
┌──────────────────────────────────────┬───── Self ─────┐
│                                      │                 │
│  Libby's Knowledge Base              │ Your survey     │
│                                      │ insights are    │
│  ████████████ Brand Voice     Strong │ solid now.      │
│  ████████░░░░ Ideal Client    Good  │                 │
│  ████████░░░░ Survey Data     Good  │ The biggest gap │
│  █████░░░░░░░ Content Themes  ~Dev  │ is pricing.     │
│  ████░░░░░░░░ Competition     ~Dev  │ But that can    │
│  ░░░░░░░░░░░░ Pricing         Gap   │ wait until      │
│  ░░░░░░░░░░░░ Course Design   Gap   │ you've tested   │
│  ░░░░░░░░░░░░ Tech Platform   Gap   │ messaging more. │
│                                      │                 │
│  ┌─ Recent additions ────────────┐  │ Want to work    │
│  │ Survey round 2 (today)        │  │ on content      │
│  │ "Not judged" theme: 40→61%    │  │ themes next?    │
│  │ New: price sensitivity, partner│  │                 │
│  └───────────────────────────────┘  │                 │
│                                      │                 │
│  [Work on gaps]  [Add knowledge]    │                 │
└──────────────────────────────────────┴─────────────────┘
```

### Execution → Primary surface: THE WORK AND ITS STATE

The existing workspace feed (prototype 02) already does this reasonably well — the feed cards ARE the primary surface, the Self is the right panel. But push further: the status cards, the shift report, the decision queue — these should be richer, more interactive, more visual.

### Roadmap → Primary surface: THE JOURNEY

Instead of a roadmap-card in conversation, the roadmap IS the view — a visual timeline or kanban showing where the user is in their journey.

```
┌──────────────────────────────────────────────────────┐
│  Libby's Journey                                      │
│                                                       │
│  Done          This Week        Next          Later   │
│  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐ │
│  │Business│   │Brand   │   │Survey  │   │Course  │ │
│  │type ✓  │   │voice → │   │round 2 │   │outline │ │
│  └────────┘   └────────┘   └────────┘   └────────┘ │
│  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐ │
│  │Ideal   │   │5 test  │   │Landing │   │Website │ │
│  │client ✓│   │posts → │   │page    │   │        │ │
│  └────────┘   └────────┘   └────────┘   └────────┘ │
│                                                       │
│  ● = needs you  → = in progress  ○ = upcoming        │
└──────────────────────────────────────────────────────┘
```

## The Interaction Model

**Chat doesn't go away.** It's always available — the right panel, or a slide-up overlay on mobile, or a command-K palette. It's the universal input method. The Self is always listening.

But the PRIMARY surface — what occupies most of the screen — adapts based on what process is active:

| Active process | Primary surface | Chat role |
|---------------|----------------|-----------|
| Onboarding | User model canvas (cards filling in) | Right panel — asks questions that populate cards |
| Strategy session | Living document | Left panel — conversation feeds the document |
| Process definition | Visual process map | Right panel — conversation defines steps |
| Knowledge building | Knowledge map | Right panel — conversation and file drops feed the map |
| Roadmap planning | Visual journey/timeline | Right panel — adjustments and sequencing |
| Execution/review | Work feed + status cards | Right panel — actions and discussion |
| Quick capture | Input area (expanded) | Primary — capture IS the conversation |
| Free conversation | Chat (full screen) | Primary — when no process is active |

**Chat is full-screen only when no artefact exists yet** — the very first moments of onboarding, or when the user just wants to talk without structure. The moment the Self has enough context to propose a process, the artefact becomes the primary surface and chat becomes secondary.

## What This Means

1. **Ditto is not a chat product with embedded cards.** It's a workspace product where the work is always visible and conversation is the input method.

2. **The Self is not a chatbot.** It's the intelligence behind the workspace surfaces. It populates canvases, builds documents, grows knowledge maps, and moves process steps forward. Chat is how you communicate with it, but its work is visible in the artefacts.

3. **This is the "Explore → Operate" transition made visual.** Explore is the artefact taking shape. Operate is the artefact running. The transition is visible — you can see your business crystallising.

4. **It directly addresses the vision.md tension.** The balance between "declarative process" and "intuitive metacognition" becomes visible: the artefact shows the declarative structure, the Self in the sidebar provides the intuitive metacognition.

5. **It distinguishes Ditto from every chat-first AI product.** ChatGPT, Claude, Gemini, Copilot — they're all chat-primary. Ditto is artefact-primary. The thing you're building is always front and centre.

## Implications for Prototypes

The existing prototypes need rethinking:
- **01 (Conversation):** Still valid for the first 2 minutes and for mobile. But the desktop experience should transition to artefact-primary quickly.
- **02 (Workspace):** Already artefact-primary (feed + status cards are the artefact). Good.
- **03 (Process detail):** Already artefact-primary. Good.
- **04 (Onboarding):** Needs a NEW prototype showing the user-model-canvas approach.
- **05 (Strategy):** Already artefact-primary (dual-pane). Good.
- **06 (Knowledge):** Needs a NEW prototype showing the knowledge-map-primary approach.

## The Mobile Question

On mobile, screen real estate doesn't allow side-by-side. The solution:
- **Chat is full-screen** on mobile (it's the right interaction for a small screen)
- **Artefact cards appear inline** in conversation (the current prototype approach)
- **Tapping a card** expands it to full-screen with the Self available as a bottom sheet
- Mobile is the surface where chat-primary makes sense. Desktop is where artefact-primary shines.

This gives us: **artefact-primary on desktop, conversation-primary on mobile** — and the same underlying data/processes power both.

## Where It Should Land

- **Phase 10 MVP brief** — redefine the primary surface hierarchy
- **human-layer.md** — update the interaction model: artefact-primary with conversation-secondary
- **ADR-016** — extend: the Self is not a chatbot, it's workspace intelligence
- **Component catalog** — artefact surfaces (canvas, map, timeline) as new component types alongside conversation-inline components
- **New prototypes** — onboarding-canvas, knowledge-map, roadmap-timeline
