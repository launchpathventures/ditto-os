# Insight-079: Conversation is Intake — Process is the Product

**Date:** 2026-03-24
**Trigger:** Prototype 04 (onboarding) felt like ChatGPT with better colours. No sense of structure or where the conversation was heading. User feedback: "The raw chat primitive lacks structure and a sense of the process the Self is going to take me through. The sooner we can get out of chat mode the better."
**Layers affected:** L6 Human (conversation surface, process visibility), Conversational Self (ADR-016), L2 Process
**Status:** active

## The Insight

**Conversation is the input method, not the destination.** The Self should be reaching for process structure the moment it has enough context. Unstructured chat is the gathering phase — the product is the process taking shape.

A competent colleague doesn't just chat with you. They listen, form a mental model, then say: "Here's what I think we need to do, in this order. Let me start working through it." The conversation has a shape — and you can see that shape.

### What "Getting Out of Chat Mode" Looks Like

The Self's conversation has three phases, and each should be visually distinct:

**Phase 1: Gathering** (short — 2-5 exchanges)
The Self asks focused questions. The UI is pure conversation. But a subtle progress signal shows the Self is building toward something — not just chatting.

**Phase 2: Proposing** (the key transition)
The Self has enough context. It proposes a structured approach: "Here's what I think we should work through." A **process card** appears in the conversation showing the steps, what's known, what's still needed. The user can adjust, agree, or redirect.

**Phase 3: Working through it** (the product)
The Self works through the process step by step. Each step produces its own artefact (from the component catalog). The user sees progress — steps completing, artefacts appearing, knowledge accumulating. The conversation continues alongside, but it's no longer the primary surface — the process is.

### The UI Evolution Within One Session

```
Minute 0-3: Gathering
┌─────────────────────────────────────────┐
│ ● Self                                   │
│ What's your business?                    │
│                          I'm a doula... │
│ ● Self                                   │
│ Who's your ideal client?                 │
│                          First-time...  │
│                                         │
│ ● Gathering context ━━━━━━━░░░░░        │
└─────────────────────────────────────────┘

Minute 3-4: Proposing
┌─────────────────────────────────────────┐
│ ● Self                                   │
│ I've got enough to suggest a starting    │
│ point. Here's what I'd work through:     │
│                                         │
│ ┌─ Getting Started ──────────────────┐  │
│ │ ✓ 1. Understand your business      │  │
│ │ ✓ 2. Define ideal client           │  │
│ │ → 3. Nail your brand voice         │  │
│ │ ○ 4. First content (5 test posts)  │  │
│ │ ○ 5. Landing page with waitlist    │  │
│ │                                    │  │
│ │ [Start with brand voice]           │  │
│ │ [Adjust this plan]                 │  │
│ └────────────────────────────────────┘  │
│                                         │
│ Want to work through brand voice now,    │
│ or adjust the plan first?               │
└─────────────────────────────────────────┘

Minute 4+: Working through it
┌──────────── Conversation ──┬── Brand Voice ────────┐
│ ● Self                      │                       │
│ What's the first thing you  │ Voice                 │
│ want a nervous mum to feel? │ ⏳ Defining...        │
│                             │                       │
│              Safe. Not...  │ Core feeling           │
│                             │ ⏳ Defining...        │
│ ● Self                      │                       │
│ "Safe and not judged" —     │                       │
│ that's powerful. Added.     │                       │
│                             │                       │
│ ● Working through step 3 ━━━━━━░░░                  │
└─────────────────────────────┴───────────────────────┘
```

### Why This Matters

1. **It solves Libby's core frustration.** She doesn't know what the AI needs from her. The process card shows exactly what's being worked through and what's still needed.

2. **It creates a sense of progress.** Steps ticking off, artefacts appearing, knowledge bars filling up. The user feels momentum, not just conversation.

3. **It distinguishes Ditto from ChatGPT.** ChatGPT is raw conversation. Ditto is structured work that happens to use conversation as the input method.

4. **It matches how good consultants actually work.** They don't just chat — they have a framework, they work through it, they show you the emerging output.

5. **It's what Twin and Manus do.** Twin transforms vague ideas into structured agents quickly. Manus shows a plan with step-by-step progress. Both minimise unstructured chat.

### The "Gathering Context" Progress Signal

Even in Phase 1 (gathering), the user should see that the Self is building toward something. Options:

- **A subtle progress bar** below the conversation: "Gathering context ━━━━━━░░░░░" — shows accumulation, not just chat
- **Topic tags** that appear as context is gathered: `business type` ✓ `ideal client` ✓ `brand voice` ... `pricing` ... — showing what the Self now knows and what's still missing
- **A running tally:** "I know 3 things about your business. A few more questions and I can suggest a plan."

The key: the user never feels like they're in an open-ended chat. They feel like they're moving through a structured intake that leads somewhere specific.

### Process Proposal Card (New Catalog Component)

A new component for the catalog: **process-proposal-card**. Appears when the Self has enough context to propose a structured approach.

```yaml
type: process-proposal-card
data:
  title: "Getting Started"
  steps:
    - label: "Understand your business"
      status: complete
    - label: "Define ideal client"
      status: complete
    - label: "Nail your brand voice"
      status: next
    - label: "First content (5 test posts)"
      status: upcoming
    - label: "Landing page with waitlist"
      status: upcoming
  actions:
    - label: "Start with brand voice"
      type: primary
    - label: "Adjust this plan"
      type: secondary
```

This component is the bridge between unstructured conversation and structured process execution. It's where the Self says "I know enough to propose how we work through this."

## Implications

- **Prototype 04 needs rebuilding.** The current onboarding prototype is too chatty. It should show the three-phase progression: gathering → proposing → working through it.
- **The process-proposal-card is a critical new catalog component.** It's the moment Ditto stops feeling like ChatGPT and starts feeling like a structured workspace.
- **The gathering progress signal is subtle but important.** Even 30 seconds of unstructured chat should feel purposeful.
- **Every Self-initiated process should have a visible shape.** Onboarding, strategy, knowledge capture, risk review — all should propose their structure and show progress through it.
- **This is the interaction-level expression of "process as primitive."** The process isn't just internal architecture — it's visible to the user as the organising structure of their work.

## Where It Should Land

- **All prototypes** — rebuild with the three-phase structure
- **Component catalog** — add process-proposal-card and gathering-progress-indicator
- **human-layer.md** — update Conversation Thread primitive to describe the gathering → proposing → executing phases
- **ADR-016** — extend Self's conversation model to include structured process proposal as a key transition point
